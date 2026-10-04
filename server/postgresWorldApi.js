const crypto = require('node:crypto');
const express = require('express');
const { withTransaction } = require('./database');
const { ApiProblem } = require('./apiProblem');
const { lockTarget, enforceQuota, checkRegion, checkAssets } = require('./worldPolicy');
const { mediaValidation } = require('./media');
const { createModerationApi } = require('./moderation');
const {
  requestHash,
  parseInteger,
  sendError,
  validateAsset,
  validateChunkLayers,
  validateEntityState,
  validateOperationId,
} = require('./worldApi');

function chunkFromRow(row) {
  return {
    id: `${row.chunk_x},${row.chunk_y}`,
    cx: row.chunk_x,
    cy: row.chunk_y,
    zone: row.zone || 'static',
    layers: [row.background_data, row.main_data, row.overlay_data].map((value) =>
      Buffer.from(value).toString('base64'),
    ),
    version: Number(row.version),
    savedAt: new Date(row.updated_at).getTime(),
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedBy: row.updated_by,
  };
}

async function findReplay(client, actorId, scope, operationId, body) {
  await lockTarget(client, `actor:${actorId}`);
  const hash = requestHash(body);
  const existing = await client.query(
    `SELECT request_sha256, response_status, response_body
     FROM idempotency_records
     WHERE actor_id = $1 AND scope = $2 AND operation_id = $3 AND expires_at > now()`,
    [actorId, scope, operationId],
  );
  if (!existing.rowCount) return { hash };
  const record = existing.rows[0];
  if (record.request_sha256 !== hash) {
    throw new ApiProblem(
      409,
      'CONFLICT',
      'The operation ID was already used with another request.',
    );
  }
  return { replay: true, status: 200, response: record.response_body };
}

async function storeReplay(client, actorId, scope, operationId, hash, status, response) {
  await client.query(
    'DELETE FROM idempotency_records WHERE actor_id=$1 AND scope=$2 AND operation_id=$3 AND expires_at <= now()',
    [actorId, scope, operationId],
  );
  await client.query(
    `INSERT INTO idempotency_records
       (actor_id, scope, operation_id, request_sha256, response_status, response_body)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorId, scope, operationId, hash, status, response],
  );
}

function createPostgresWorldApi({ pool, objectStorage = null }) {
  const router = express.Router();

  router.use((req, res, next) => {
    const requestId = res.locals.requestId || `req_${crypto.randomUUID()}`;
    res.locals.requestId = requestId;
    res.set('X-Request-Id', requestId);
    next();
  });

  router.param('worldId', async (req, res, next, value) => {
    try {
      if (!validateOperationId(value)) return sendError(res, 404, 'NOT_FOUND', 'World not found.');
      const world = await pool.query('SELECT coordinate_limit FROM worlds WHERE id=$1', [value]);
      if (!world.rowCount) return sendError(res, 404, 'NOT_FOUND', 'World not found.');
      req.worldLimit = world.rows[0].coordinate_limit;
      next();
    } catch (error) {
      next(error);
    }
  });

  function requireMember(req, res, next) {
    if (!req.actor)
      return sendError(res, 401, 'UNAUTHENTICATED', 'A valid member session is required.');
    if (req.actor.publishingAllowed === false) {
      return sendError(res, 403, 'FORBIDDEN', 'Publishing is suspended for this account.');
    }
    return next();
  }

  function route(handler) {
    return async (req, res, next) => {
      try {
        await handler(req, res);
      } catch (error) {
        if (error instanceof ApiProblem) {
          return sendError(res, error.status, error.code, error.message, error.details);
        }
        return next(error);
      }
    };
  }

  router.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  router.get(
    '/health/ready',
    route(async (_req, res) => {
      const result = await pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM schema_migrations WHERE name = '003_launch_controls.sql'
         ) AS migrated`,
      );
      if (!result.rows[0].migrated) {
        return sendError(res, 503, 'INTERNAL_ERROR', 'Database migrations are incomplete.');
      }
      return res.json({ status: 'ready', storage: 'postgresql' });
    }),
  );

  router.get('/me', (req, res) => {
    if (!req.actor) return sendError(res, 401, 'UNAUTHENTICATED', 'Sign in to view your account.');
    res.set('Cache-Control', 'no-store');
    res.json(req.actor);
  });

  router.get(
    '/worlds/:slug',
    route(async (req, res) => {
      const result = await pool.query(
        `SELECT id, slug, name, description, coordinate_limit, created_at, updated_at
         FROM worlds WHERE slug = $1`,
        [req.params.slug],
      );
      if (!result.rowCount) return sendError(res, 404, 'NOT_FOUND', 'World not found.');
      const row = result.rows[0];
      res.set('Cache-Control', 'public, max-age=60');
      return res.json({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        coordinateLimit: row.coordinate_limit,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }),
  );

  router.get(
    '/worlds/:worldId/chunks',
    route(async (req, res) => {
      const all = req.query.all === 'true';
      const bounds = [
        parseInteger(req.query.minChunkX),
        parseInteger(req.query.minChunkY),
        parseInteger(req.query.maxChunkX),
        parseInteger(req.query.maxChunkY),
      ];
      if (!all && bounds.some((value) => value === null)) {
        return sendError(res, 400, 'BAD_REQUEST', 'Chunk bounds are required.');
      }
      if (
        !all &&
        (bounds[2] < bounds[0] ||
          bounds[3] < bounds[1] ||
          bounds.some((n) => Math.abs(n * 128) > req.worldLimit + 127))
      ) {
        return sendError(res, 422, 'VALIDATION_FAILED', 'Invalid viewport bounds.');
      }
      if (!all && (bounds[2] - bounds[0] + 1) * (bounds[3] - bounds[1] + 1) > 169) {
        return sendError(res, 422, 'VALIDATION_FAILED', 'A viewport may cover at most 169 chunks.');
      }
      const result = all
        ? await pool.query('SELECT * FROM chunks WHERE world_id = $1 ORDER BY chunk_x, chunk_y', [
            req.params.worldId,
          ])
        : await pool.query(
            `SELECT * FROM chunks WHERE world_id = $1
             AND chunk_x BETWEEN $2 AND $4 AND chunk_y BETWEEN $3 AND $5
             ORDER BY chunk_x, chunk_y`,
            [req.params.worldId, ...bounds],
          );
      res.set('Cache-Control', 'private, no-cache');
      return res.json({ chunks: result.rows.map(chunkFromRow) });
    }),
  );

  router.get(
    '/worlds/:worldId/chunks/:cx/:cy',
    route(async (req, res) => {
      const cx = parseInteger(req.params.cx);
      const cy = parseInteger(req.params.cy);
      if (cx === null || cy === null)
        return sendError(res, 400, 'BAD_REQUEST', 'Invalid chunk coordinates.');
      const result = await pool.query(
        'SELECT * FROM chunks WHERE world_id = $1 AND chunk_x = $2 AND chunk_y = $3',
        [req.params.worldId, cx, cy],
      );
      if (!result.rowCount) return res.status(204).end();
      const chunk = chunkFromRow(result.rows[0]);
      res.set('ETag', `"chunk-${cx}-${cy}-${chunk.version}"`);
      res.set('Cache-Control', 'private, no-cache');
      return res.json(chunk);
    }),
  );

  router.put(
    '/worlds/:worldId/chunks/:cx/:cy',
    requireMember,
    route(async (req, res) => {
      const cx = parseInteger(req.params.cx);
      const cy = parseInteger(req.params.cy);
      const { operationId, expectedVersion, zone, layers } = req.body || {};
      if (
        cx === null ||
        cy === null ||
        Math.abs(cx * 128) > req.worldLimit ||
        Math.abs(cy * 128) > req.worldLimit ||
        !validateOperationId(operationId) ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 0 ||
        typeof zone !== 'string' ||
        zone.length > 40 ||
        !validateChunkLayers(layers)
      ) {
        return sendError(res, 422, 'VALIDATION_FAILED', 'The chunk snapshot is invalid.');
      }

      const transaction = await withTransaction(pool, async (client) => {
        const replay = await findReplay(client, req.actor.id, 'chunk:put', operationId, {
          world: req.params.worldId,
          cx,
          cy,
          ...req.body,
        });
        if (replay.replay) return replay;
        await enforceQuota(
          client,
          req.actor.id,
          'chunk:put',
          Number(process.env.DAILY_CHUNK_WRITES) || 5000,
        );
        await lockTarget(client, `chunk:${req.params.worldId}:${cx}:${cy}`);
        await checkRegion(
          client,
          req.params.worldId,
          [cx * 128, cy * 128, cx * 128 + 127, cy * 128 + 127],
          'can_draw',
        );
        const current = await client.query(
          `SELECT version FROM chunks
           WHERE world_id = $1 AND chunk_x = $2 AND chunk_y = $3 FOR UPDATE`,
          [req.params.worldId, cx, cy],
        );
        const currentVersion = current.rowCount ? Number(current.rows[0].version) : 0;
        if (currentVersion !== expectedVersion) {
          throw new ApiProblem(
            409,
            'CONFLICT',
            'The chunk changed before this snapshot was accepted.',
            {
              chunkX: cx,
              chunkY: cy,
              expectedVersion,
              currentVersion,
            },
          );
        }
        const buffers = layers.map((layer) => Buffer.from(layer, 'base64'));
        const updated = await client.query(
          `INSERT INTO chunks
             (world_id, chunk_x, chunk_y, version, zone, background_data, main_data, overlay_data, updated_by)
           VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8)
           ON CONFLICT (world_id, chunk_x, chunk_y) DO UPDATE SET
             version = chunks.version + 1,
             deleted_at = NULL,
             zone = EXCLUDED.zone,
             background_data = EXCLUDED.background_data,
             main_data = EXCLUDED.main_data,
             overlay_data = EXCLUDED.overlay_data,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
           RETURNING *`,
          [req.params.worldId, cx, cy, zone, buffers[0], buffers[1], buffers[2], req.actor.id],
        );
        const chunk = chunkFromRow(updated.rows[0]);
        const response = { chunk, operationId, acceptedAt: new Date().toISOString() };
        await storeReplay(
          client,
          req.actor.id,
          'chunk:put',
          operationId,
          replay.hash,
          201,
          response,
        );
        return { status: 201, response };
      });
      return res.status(transaction.status).json(transaction.response);
    }),
  );

  router.delete(
    '/worlds/:worldId/chunks/:cx/:cy',
    requireMember,
    route(async (req, res) => {
      const cx = parseInteger(req.params.cx);
      const cy = parseInteger(req.params.cy);
      const expectedVersion = parseInteger(req.get('if-match-version'));
      const operationId = req.get('idempotency-key');
      if (
        cx === null ||
        cy === null ||
        expectedVersion === null ||
        !validateOperationId(operationId)
      ) {
        return sendError(res, 422, 'VALIDATION_FAILED', 'Deletion metadata is invalid.');
      }
      const body = { cx, cy, expectedVersion };
      const transaction = await withTransaction(pool, async (client) => {
        const replay = await findReplay(client, req.actor.id, 'chunk:delete', operationId, {
          world: req.params.worldId,
          ...body,
        });
        if (replay.replay) return replay;
        await lockTarget(client, `chunk:${req.params.worldId}:${cx}:${cy}`);
        await checkRegion(
          client,
          req.params.worldId,
          [cx * 128, cy * 128, cx * 128 + 127, cy * 128 + 127],
          'can_draw',
        );
        const current = await client.query(
          `SELECT version FROM chunks
           WHERE world_id = $1 AND chunk_x = $2 AND chunk_y = $3 FOR UPDATE`,
          [req.params.worldId, cx, cy],
        );
        const currentVersion = current.rowCount ? Number(current.rows[0].version) : 0;
        if (currentVersion !== expectedVersion) {
          throw new ApiProblem(409, 'CONFLICT', 'The chunk changed before deletion.', {
            expectedVersion,
            currentVersion,
          });
        }
        const blank = Buffer.alloc(128 * 128 * 4);
        const cleared = await client.query(
          `INSERT INTO chunks (world_id, chunk_x, chunk_y, version, background_data, main_data, overlay_data, updated_by, deleted_at)
          VALUES($1,$2,$3,1,$4,$4,$4,$5,now()) ON CONFLICT(world_id,chunk_x,chunk_y)
          DO UPDATE SET version=chunks.version+1, background_data=$4, main_data=$4, overlay_data=$4,
          updated_by=$5, updated_at=now(), deleted_at=now() RETURNING version`,
          [req.params.worldId, cx, cy, blank, req.actor.id],
        );
        const response = {
          id: `${cx},${cy}`,
          deleted: true,
          operationId,
          version: Number(cleared.rows[0].version),
        };
        await storeReplay(
          client,
          req.actor.id,
          'chunk:delete',
          operationId,
          replay.hash,
          200,
          response,
        );
        return { status: 200, response };
      });
      return res.status(transaction.status).json(transaction.response);
    }),
  );

  router.get(
    '/worlds/:worldId/entities',
    route(async (req, res) => {
      const result = await pool.query(
        `SELECT e.state || jsonb_build_object('creatorId',e.creator_id,'creatorName',u.display_name,'createdAt',extract(epoch from e.created_at)*1000) AS state
         FROM repository_entities e JOIN users u ON u.id=e.creator_id
         WHERE world_id = $1 AND e.deleted_at IS NULL AND e.hidden_at IS NULL ORDER BY e.updated_at DESC`,
        [req.params.worldId],
      );
      res.set('Cache-Control', 'private, no-cache');
      return res.json({ entities: result.rows.map((row) => row.state) });
    }),
  );

  router.put(
    '/worlds/:worldId/entities/:entityId',
    requireMember,
    route(async (req, res) => {
      const { operationId, state } = req.body || {};
      if (
        !validateOperationId(operationId) ||
        !validateEntityState(state) ||
        state.id !== req.params.entityId
      ) {
        return sendError(res, 422, 'VALIDATION_FAILED', 'The entity is invalid.');
      }
      const result = await withTransaction(pool, async (client) => {
        const replay = await findReplay(client, req.actor.id, 'entity:put', operationId, {
          world: req.params.worldId,
          ...req.body,
        });
        if (replay.replay) return replay;
        await enforceQuota(
          client,
          req.actor.id,
          'entity:put',
          Number(process.env.DAILY_ENTITY_WRITES) || 100,
        );
        await lockTarget(client, `entity:${req.params.worldId}:${state.id}`);
        await checkRegion(
          client,
          req.params.worldId,
          [state.wx, state.wy, state.wx, state.wy],
          'can_place_entities',
        );
        await checkAssets(client, req.params.worldId, req.actor.id, state);
        const existing = await client.query(
          `SELECT creator_id, hidden_at FROM repository_entities
           WHERE world_id = $1 AND id = $2 FOR UPDATE`,
          [req.params.worldId, state.id],
        );
        if (existing.rowCount && existing.rows[0].creator_id !== req.actor.id) {
          throw new ApiProblem(403, 'FORBIDDEN', 'Only the entity owner can update it.');
        }
        if (existing.rows[0]?.hidden_at)
          throw new ApiProblem(403, 'FORBIDDEN', 'This contribution is under moderation.');
        await client.query(
          `INSERT INTO entity_history(world_id,entity_id,state,actor_id)
          SELECT world_id,id,state,$3 FROM repository_entities WHERE world_id=$1 AND id=$2`,
          [req.params.worldId, state.id, req.actor.id],
        );
        const saved = await client.query(
          `INSERT INTO repository_entities (world_id, id, creator_id, state)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (world_id, id) DO UPDATE SET state = EXCLUDED.state, updated_at = now(), deleted_at = NULL
           RETURNING created_at, updated_at`,
          [req.params.worldId, state.id, req.actor.id, state],
        );
        const status = existing.rowCount ? 200 : 201;
        const response = { entity: state, operationId, updatedAt: saved.rows[0].updated_at };
        await storeReplay(
          client,
          req.actor.id,
          'entity:put',
          operationId,
          replay.hash,
          status,
          response,
        );
        return { status, response };
      });
      return res.status(result.status).json(result.response);
    }),
  );

  router.delete(
    '/worlds/:worldId/entities/:entityId',
    requireMember,
    route(async (req, res) => {
      const operationId = req.get('idempotency-key');
      if (!validateOperationId(operationId))
        return sendError(res, 422, 'VALIDATION_FAILED', 'A valid idempotency key is required.');
      const body = { id: req.params.entityId };
      const result = await withTransaction(pool, async (client) => {
        const replay = await findReplay(client, req.actor.id, 'entity:delete', operationId, {
          world: req.params.worldId,
          ...body,
        });
        if (replay.replay) return replay;
        await lockTarget(client, `entity:${req.params.worldId}:${req.params.entityId}`);
        const existing = await client.query(
          `SELECT creator_id FROM repository_entities
           WHERE world_id = $1 AND id = $2 FOR UPDATE`,
          [req.params.worldId, req.params.entityId],
        );
        if (existing.rowCount && existing.rows[0].creator_id !== req.actor.id) {
          throw new ApiProblem(403, 'FORBIDDEN', 'Only the entity owner can delete it.');
        }
        await client.query(
          `INSERT INTO entity_history(world_id,entity_id,state,actor_id)
          SELECT world_id,id,state,$3 FROM repository_entities WHERE world_id=$1 AND id=$2`,
          [req.params.worldId, req.params.entityId, req.actor.id],
        );
        await client.query(
          `UPDATE repository_entities SET deleted_at = now(), updated_at = now()
           WHERE world_id = $1 AND id = $2`,
          [req.params.worldId, req.params.entityId],
        );
        const response = { id: req.params.entityId, deleted: true, operationId };
        await storeReplay(
          client,
          req.actor.id,
          'entity:delete',
          operationId,
          replay.hash,
          200,
          response,
        );
        return { status: 200, response };
      });
      return res.status(result.status).json(result.response);
    }),
  );

  router.get(
    '/worlds/:worldId/assets',
    requireMember,
    route(async (req, res) => {
      const result = await pool.query(
        `SELECT id, media_type, media_data, byte_size, storage_key, created_at, updated_at
         FROM repository_assets WHERE world_id = $1 AND owner_id=$2 AND verified=true ORDER BY updated_at DESC`,
        [req.params.worldId, req.actor.id],
      );
      return res.json({
        assets: await Promise.all(
          result.rows.map(async (row) => ({
            id: row.id,
            type: row.media_type,
            data: `data:${row.media_type};base64,${(row.storage_key ? await objectStorage.get(row.storage_key) : Buffer.from(row.media_data)).toString('base64')}`,
            byteSize: row.byte_size,
            savedAt: new Date(row.updated_at).getTime(),
          })),
        ),
      });
    }),
  );

  router.get(
    '/worlds/:worldId/assets/:assetId',
    route(async (req, res) => {
      const result = await pool.query(
        `SELECT id, media_type, media_data, byte_size, updated_at, storage_key
         FROM repository_assets a WHERE world_id = $1 AND id = $2 AND verified=true
         AND (owner_id=$3 OR EXISTS (SELECT 1 FROM repository_entities e WHERE e.world_id=a.world_id
           AND e.deleted_at IS NULL AND e.hidden_at IS NULL AND (
             e.state->>'spriteUrl' = 'asset:' || a.id OR
             e.state->'frames' @> jsonb_build_array('asset:' || a.id) OR
             EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(e.state->'layers','[]')) l WHERE l->>'url'='asset:' || a.id))))`,
        [req.params.worldId, req.params.assetId, req.actor?.id || null],
      );
      if (!result.rowCount) return sendError(res, 404, 'NOT_FOUND', 'Asset not found.');
      const row = result.rows[0];
      res.set('Cache-Control', 'private, no-store');
      return res.json({
        id: row.id,
        type: row.media_type,
        data: `data:${row.media_type};base64,${(row.storage_key ? await objectStorage.get(row.storage_key) : Buffer.from(row.media_data)).toString('base64')}`,
        byteSize: row.byte_size,
        savedAt: new Date(row.updated_at).getTime(),
      });
    }),
  );

  router.put(
    '/worlds/:worldId/assets/:assetId',
    requireMember,
    mediaValidation,
    route(async (req, res) => {
      const { operationId, type } = req.body || {};
      const byteSize = validateAsset(req.body);
      if (!validateOperationId(operationId) || !byteSize || req.params.assetId.length > 120) {
        return sendError(res, 422, 'UNSUPPORTED_MEDIA', 'The asset is invalid or exceeds 8 MB.');
      }
      const result = await withTransaction(pool, async (client) => {
        const replay = await findReplay(client, req.actor.id, 'asset:put', operationId, {
          world: req.params.worldId,
          id: req.params.assetId,
          ...req.body,
        });
        if (replay.replay) return replay;
        await enforceQuota(
          client,
          req.actor.id,
          'asset:put',
          Number(process.env.DAILY_ASSET_UPLOADS) || 30,
        );
        await lockTarget(client, `asset:${req.params.worldId}:${req.params.assetId}`);
        const existing = await client.query(
          `SELECT owner_id FROM repository_assets
           WHERE world_id = $1 AND id = $2 FOR UPDATE`,
          [req.params.worldId, req.params.assetId],
        );
        if (existing.rowCount && existing.rows[0].owner_id !== req.actor.id) {
          throw new ApiProblem(403, 'FORBIDDEN', 'Only the asset owner can replace it.');
        }
        if (existing.rowCount)
          throw new ApiProblem(409, 'CONFLICT', 'Media is immutable; upload using a new ID.');
        const parsed = req.processedMedia;
        const storageKey = objectStorage
          ? `${req.params.worldId}/${req.params.assetId}/${parsed.sha256}`
          : null;
        if (storageKey) await objectStorage.put(storageKey, parsed);
        await client.query(
          `INSERT INTO repository_assets
             (world_id, id, owner_id, media_type, media_data, byte_size, storage_key, verified)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)
           ON CONFLICT (world_id, id) DO UPDATE SET
             media_type = EXCLUDED.media_type,
             media_data = EXCLUDED.media_data,
             byte_size = EXCLUDED.byte_size,
             updated_at = now()`,
          [
            req.params.worldId,
            req.params.assetId,
            req.actor.id,
            parsed.type,
            storageKey ? null : parsed.data,
            parsed.byteSize,
            storageKey,
          ],
        );
        const status = existing.rowCount ? 200 : 201;
        const response = {
          asset: {
            id: req.params.assetId,
            type: parsed.type,
            byteSize: parsed.byteSize,
            savedAt: Date.now(),
          },
          operationId,
        };
        await storeReplay(
          client,
          req.actor.id,
          'asset:put',
          operationId,
          replay.hash,
          status,
          response,
        );
        return { status, response };
      });
      return res.status(result.status).json(result.response);
    }),
  );

  router.use(createModerationApi({ pool }));
  return router;
}

module.exports = { ApiProblem, chunkFromRow, createPostgresWorldApi };
