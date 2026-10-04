const express = require('express');
const crypto = require('node:crypto');
const { withTransaction } = require('./database');
const { ApiProblem } = require('./apiProblem');
const { lockTarget } = require('./worldPolicy');
const { parseInteger, validateOperationId, requestHash } = require('./worldApi');
const { rateLimit } = require('./security');

function createModerationApi({ pool }) {
  const router = express.Router();
  router.param('worldId', (req, res, next, value) => {
    if (!validateOperationId(value))
      return res
        .status(422)
        .json({ error: { code: 'VALIDATION_FAILED', message: 'Invalid world ID.' } });
    next();
  });
  const wrap = (handler) => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof ApiProblem)
        return res
          .status(error.status)
          .json({ error: { code: error.code, message: error.message } });
      next(error);
    }
  };
  const moderator = (req, res, next) => {
    if (
      !req.actor ||
      !['moderator', 'administrator'].includes(req.actor.role) ||
      req.actor.publishingAllowed === false
    )
      return res
        .status(403)
        .json({ error: { code: 'FORBIDDEN', message: 'Moderator access required.' } });
    next();
  };

  router.post(
    '/worlds/:worldId/reports',
    rateLimit({ pool, scope: 'reports', limit: 5, windowMs: 3600000 }),
    wrap(async (req, res) => {
      const { entityId, chunkX, chunkY, reason } = req.body || {};
      const hasEntity =
        typeof entityId === 'string' && entityId.length > 0 && entityId.length <= 120;
      const hasChunk =
        Number.isSafeInteger(chunkX) &&
        Number.isSafeInteger(chunkY) &&
        Math.abs(chunkX) <= 7812 &&
        Math.abs(chunkY) <= 7812;
      if (
        hasEntity === hasChunk ||
        typeof reason !== 'string' ||
        reason.trim().length < 5 ||
        reason.length > 1000
      )
        throw new ApiProblem(
          422,
          'VALIDATION_FAILED',
          'Select one contribution or chunk and explain the report (5–1000 characters).',
        );
      const world = await pool.query('SELECT id FROM worlds WHERE id=$1', [req.params.worldId]);
      if (!world.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'World not found.');
      if (hasEntity) {
        const entity = await pool.query(
          'SELECT id FROM repository_entities WHERE world_id=$1 AND id=$2 AND deleted_at IS NULL AND hidden_at IS NULL',
          [req.params.worldId, entityId],
        );
        if (!entity.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Contribution not found.');
      }
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO safety_reports(id,world_id,reporter_id,entity_id,chunk_x,chunk_y,reason)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          id,
          req.params.worldId,
          req.actor?.id || null,
          hasEntity ? entityId : null,
          hasChunk ? chunkX : null,
          hasChunk ? chunkY : null,
          reason.trim(),
        ],
      );
      res.status(201).json({ id, status: 'open' });
    }),
  );

  router.get(
    '/moderation/reports',
    moderator,
    wrap(async (_req, res) => {
      const result = await pool.query(
        "SELECT * FROM safety_reports WHERE status='open' ORDER BY created_at LIMIT 100",
      );
      res.set('Cache-Control', 'no-store').json({ reports: result.rows });
    }),
  );
  router.get(
    '/moderation/audit',
    moderator,
    wrap(async (_req, res) => {
      const result = await pool.query(
        'SELECT * FROM safety_audit ORDER BY created_at DESC LIMIT 100',
      );
      res.set('Cache-Control', 'no-store').json({ events: result.rows });
    }),
  );
  router.get(
    '/moderation/history/:worldId/:cx/:cy',
    moderator,
    wrap(async (req, res) => {
      const cx = parseInteger(req.params.cx),
        cy = parseInteger(req.params.cy);
      if (cx === null || cy === null)
        throw new ApiProblem(422, 'VALIDATION_FAILED', 'Invalid chunk coordinates.');
      const result = await pool.query(
        'SELECT version, actor_id, captured_at, deleted_at FROM chunk_history WHERE world_id=$1 AND chunk_x=$2 AND chunk_y=$3 ORDER BY version DESC LIMIT 100',
        [req.params.worldId, cx, cy],
      );
      res.set('Cache-Control', 'no-store').json({ versions: result.rows });
    }),
  );

  router.post(
    '/moderation/actions',
    moderator,
    wrap(async (req, res) => {
      const {
        operationId,
        action,
        reason,
        worldId,
        entityId,
        userId,
        chunkX,
        chunkY,
        version,
        reportId,
      } = req.body || {};
      if (
        !validateOperationId(operationId) ||
        typeof reason !== 'string' ||
        reason.trim().length < 5 ||
        reason.length > 1000
      )
        throw new ApiProblem(
          422,
          'VALIDATION_FAILED',
          'An operation ID and reason (5–1000 characters) are required.',
        );
      const target = { worldId, entityId, userId, chunkX, chunkY, version, reportId };
      const hash = requestHash(req.body);
      const result = await withTransaction(pool, async (client) => {
        await lockTarget(client, `actor:${req.actor.id}`);
        await lockTarget(client, `moderation-operation:${operationId}`);
        const previous = await client.query(
          'SELECT target, actor_id FROM safety_audit WHERE id=$1',
          [operationId],
        );
        if (previous.rowCount) {
          if (
            previous.rows[0].actor_id !== req.actor.id ||
            previous.rows[0].target.requestHash !== hash
          )
            throw new ApiProblem(409, 'CONFLICT', 'Operation ID already used.');
          return { accepted: true, operationId };
        }
        if (['hide_entity', 'restore_entity'].includes(action)) {
          if (typeof entityId !== 'string' || !validateOperationId(worldId))
            throw new ApiProblem(422, 'VALIDATION_FAILED', 'World and entity are required.');
          await lockTarget(client, `entity:${worldId}:${entityId}`);
          const updated = await client.query(
            `UPDATE repository_entities SET hidden_at=${action === 'hide_entity' ? 'now()' : 'NULL'}, updated_at=now()
          WHERE world_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id`,
            [worldId, entityId],
          );
          if (!updated.rowCount)
            throw new ApiProblem(
              404,
              'NOT_FOUND',
              'Contribution not found or deleted by its owner.',
            );
        } else if (action === 'restore_chunk') {
          if (
            !validateOperationId(worldId) ||
            ![chunkX, chunkY, version].every(Number.isSafeInteger)
          )
            throw new ApiProblem(
              422,
              'VALIDATION_FAILED',
              'World, chunk and version are required.',
            );
          await lockTarget(client, `chunk:${worldId}:${chunkX}:${chunkY}`);
          const saved = await client.query(
            'SELECT * FROM chunk_history WHERE world_id=$1 AND chunk_x=$2 AND chunk_y=$3 AND version=$4',
            [worldId, chunkX, chunkY, version],
          );
          if (!saved.rowCount)
            throw new ApiProblem(404, 'NOT_FOUND', 'Historical version not found.');
          const row = saved.rows[0];
          await client.query(
            `UPDATE chunks SET background_data=$4,main_data=$5,overlay_data=$6,zone=$7,deleted_at=$8,
          version=version+1,updated_by=$9,updated_at=now() WHERE world_id=$1 AND chunk_x=$2 AND chunk_y=$3`,
            [
              worldId,
              chunkX,
              chunkY,
              row.background_data,
              row.main_data,
              row.overlay_data,
              row.zone,
              row.deleted_at,
              req.actor.id,
            ],
          );
        } else if (['suspend', 'reinstate'].includes(action)) {
          if (!validateOperationId(userId) || userId === req.actor.id)
            throw new ApiProblem(422, 'VALIDATION_FAILED', 'Choose another account.');
          const account = await client.query('SELECT role FROM users WHERE id=$1', [userId]);
          if (
            !account.rowCount ||
            account.rows[0].role === 'administrator' ||
            (account.rows[0].role === 'moderator' && req.actor.role !== 'administrator')
          )
            throw new ApiProblem(403, 'FORBIDDEN', 'This account cannot be changed by your role.');
          await client.query(
            `UPDATE users SET publishing_suspended_until=${action === 'suspend' ? "now() + interval '30 days'" : 'NULL'}, suspension_reason=$2 WHERE id=$1`,
            [userId, reason],
          );
        } else if (['resolve_report', 'dismiss_report'].includes(action)) {
          if (!validateOperationId(reportId))
            throw new ApiProblem(422, 'VALIDATION_FAILED', 'Report ID is required.');
          const updated = await client.query(
            'UPDATE safety_reports SET status=$2 WHERE id=$1 RETURNING id',
            [reportId, action === 'resolve_report' ? 'resolved' : 'dismissed'],
          );
          if (!updated.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Report not found.');
        } else throw new ApiProblem(422, 'VALIDATION_FAILED', 'Unknown moderation action.');
        await client.query(
          'INSERT INTO safety_audit(id,actor_id,action,reason,target) VALUES($1,$2,$3,$4,$5)',
          [operationId, req.actor.id, action, reason.trim(), { ...target, requestHash: hash }],
        );
        return { accepted: true, operationId };
      });
      res.json(result);
    }),
  );
  return router;
}
module.exports = { createModerationApi };
