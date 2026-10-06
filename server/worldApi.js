const crypto = require('node:crypto');

const WORLD_ID = '00000000-0000-4000-8000-000000000001';
const WORLD_SLUG = 'forgotten-network';
const LAYER_BYTES = 128 * 128 * 4;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function createInitialSharedWorld() {
  const now = new Date().toISOString();
  return {
    world: {
      id: WORLD_ID,
      slug: WORLD_SLUG,
      name: 'Forgotten Network',
      description: 'A living digital civilization.',
      coordinateLimit: 1_000_000,
      createdAt: now,
      updatedAt: now,
    },
    chunks: {},
    entities: {},
    assets: {},
    operations: {},
  };
}

function normalizeSharedWorld(value) {
  const shared = value && typeof value === 'object' ? value : createInitialSharedWorld();
  const initial = createInitialSharedWorld();
  if (!shared.world || typeof shared.world !== 'object') shared.world = initial.world;
  if (!shared.chunks || typeof shared.chunks !== 'object') shared.chunks = {};
  if (!shared.entities || typeof shared.entities !== 'object') shared.entities = {};
  if (!shared.assets || typeof shared.assets !== 'object') shared.assets = {};
  if (!shared.operations || typeof shared.operations !== 'object') shared.operations = {};
  return shared;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function requestHash(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function parseBearer(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function parseInteger(value) {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    typeof value === 'boolean' ||
    Array.isArray(value)
  )
    return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function sendError(res, status, code, message, details) {
  return res.status(status).json({
    error: {
      code,
      message,
      requestId: res.locals.requestId,
      ...(details ? { details } : {}),
    },
  });
}

function validateOperationId(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function validateChunkLayers(layers) {
  if (!Array.isArray(layers) || layers.length !== 3) return false;
  return layers.every((layer) => {
    if (typeof layer !== 'string') return false;
    try {
      return Buffer.from(layer, 'base64').byteLength === LAYER_BYTES;
    } catch {
      return false;
    }
  });
}

function validateEntityState(state) {
  const types = new Set([
    'creature',
    'structure',
    'sign',
    'hologram',
    'ambient_prop',
    'floating_object',
    'environmental_decoration',
    'gif_entity',
    'uploaded_custom',
    'wandering_creature',
    'static_spirit',
    'glitch_creature',
    'floating_machine',
    'animated_sign',
  ]);
  const allowedKeys = new Set([
    'id',
    'type',
    'wx',
    'wy',
    'text',
    'name',
    'description',
    'color',
    'createdAt',
    'layers',
    'behavior',
    'vfx',
    'spriteUrl',
    'frames',
    'scale',
    'opacity',
    'anchor',
    'creatorId',
    'creatorName',
  ]);
  const mediaRef = (url) =>
    url === undefined || (typeof url === 'string' && /^asset:[A-Za-z0-9_-]{1,120}$/.test(url));
  const color = (value) =>
    value === undefined || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));
  const finite = (value, min, max) =>
    value === undefined || (Number.isFinite(value) && value >= min && value <= max);
  const validLayer = (layer) =>
    layer &&
    typeof layer === 'object' &&
    Object.keys(layer).every((k) =>
      [
        'name',
        'url',
        'color',
        'offsetY',
        'offsetX',
        'scale',
        'rotation',
        'bobbing',
        'breathing',
        'swaying',
        'blinking',
        'visible',
      ].includes(k),
    ) &&
    typeof layer.name === 'string' &&
    layer.name.length <= 60 &&
    mediaRef(layer.url) &&
    color(layer.color) &&
    finite(layer.offsetX, -512, 512) &&
    finite(layer.offsetY, -512, 512) &&
    finite(layer.scale, 0.01, 10) &&
    finite(layer.rotation, -360, 360) &&
    ['bobbing', 'breathing', 'swaying', 'blinking', 'visible'].every(
      (k) => layer[k] === undefined || typeof layer[k] === 'boolean',
    );
  return (
    state &&
    typeof state === 'object' &&
    typeof state.id === 'string' &&
    state.id.length > 0 &&
    state.id.length <= 120 &&
    Object.keys(state).every((key) => allowedKeys.has(key)) &&
    types.has(state.type) &&
    ['text', 'name', 'description'].every(
      (k) =>
        state[k] === undefined ||
        (typeof state[k] === 'string' && state[k].length <= (k === 'name' ? 60 : 500)),
    ) &&
    color(state.color) &&
    mediaRef(state.spriteUrl) &&
    finite(state.scale, 0.2, 10) &&
    finite(state.opacity, 0, 1) &&
    (state.anchor === undefined || ['feet', 'center'].includes(state.anchor)) &&
    (state.behavior === undefined ||
      ['wander', 'stationary', 'follow_light', 'sleep', 'group', 'hide', 'float', 'sway'].includes(
        state.behavior,
      )) &&
    (state.frames === undefined ||
      (Array.isArray(state.frames) &&
        state.frames.length <= 120 &&
        state.frames.every(mediaRef))) &&
    (state.layers === undefined ||
      (Array.isArray(state.layers) &&
        state.layers.length <= 16 &&
        state.layers.every(validLayer))) &&
    (state.vfx === undefined ||
      (state.vfx &&
        typeof state.vfx === 'object' &&
        Object.keys(state.vfx).every((k) =>
          k === 'pixelDissolve'
            ? finite(state.vfx[k], 0, 1)
            : ['glow', 'flicker', 'scanlines', 'hologram'].includes(k) &&
              typeof state.vfx[k] === 'boolean',
        ))) &&
    Number.isFinite(state.wx) &&
    Number.isFinite(state.wy) &&
    Math.abs(state.wx) <= 1_000_000 &&
    Math.abs(state.wy) <= 1_000_000 &&
    Number.isFinite(state.createdAt) &&
    JSON.stringify(state).length <= 100_000
  );
}

function validateAsset(body) {
  if (!body || typeof body !== 'object' || !ALLOWED_MEDIA_TYPES.has(body.type)) return null;
  if (typeof body.data !== 'string') return null;
  const match = body.data.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[1] !== body.type) return null;
  const bytes = Buffer.from(match[2], 'base64').byteLength;
  if (bytes <= 0 || bytes > MAX_ASSET_BYTES) return null;
  return bytes;
}

function createWorldApi({ getDB, saveDB, authToken }) {
  const express = require('express');
  const router = express.Router();
  const configuredToken = authToken || process.env.DEV_AUTH_TOKEN || '';
  if (process.env.NODE_ENV === 'production' && configuredToken) {
    throw new Error('DEV_AUTH_TOKEN is disabled in production; configure real session auth first.');
  }

  router.use((req, res, next) => {
    const requestId = req.get('x-request-id') || `req_${crypto.randomUUID()}`;
    res.locals.requestId = requestId;
    res.set('X-Request-Id', requestId);
    next();
  });

  function requireMember(req, res, next) {
    if (req.actor) {
      if (req.actor.publishingAllowed === false) {
        return sendError(res, 403, 'FORBIDDEN', 'Publishing is suspended for this account.');
      }
      return next();
    }
    if (configuredToken && parseBearer(req) === configuredToken) {
      req.actor = {
        id: '00000000-0000-4000-8000-000000000010',
        displayName: 'Development Member',
        role: 'member',
        publishingAllowed: true,
      };
      return next();
    }
    return sendError(res, 401, 'UNAUTHENTICATED', 'A valid member session is required.');
  }

  function readShared() {
    const db = getDB();
    db.sharedWorld = normalizeSharedWorld(db.sharedWorld);
    return { db, shared: db.sharedWorld };
  }

  function requireWorld(req, res, next) {
    const { shared } = readShared();
    if (req.params.worldId !== shared.world.id) {
      return sendError(res, 404, 'NOT_FOUND', 'World not found.');
    }
    return next();
  }

  function replayOrConflict(shared, scope, operationId, body, res) {
    const key = `${scope}:${operationId}`;
    const hash = requestHash(body);
    const existing = shared.operations[key];
    if (!existing) return { key, hash };
    if (existing.hash !== hash) {
      sendError(res, 409, 'CONFLICT', 'The operation ID was already used with another request.');
      return null;
    }
    res.status(200).json(existing.response);
    return false;
  }

  router.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  router.get('/health/ready', (_req, res) => {
    try {
      readShared();
      res.json({ status: 'ready', storage: 'connected' });
    } catch {
      sendError(res, 503, 'INTERNAL_ERROR', 'World storage is unavailable.');
    }
  });

  router.get('/me', requireMember, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      id: req.actor.id,
      displayName: req.actor.displayName,
      role: req.actor.role,
      publishingAllowed: req.actor.publishingAllowed !== false,
    });
  });

  router.get('/worlds/:slug', (req, res) => {
    const { shared } = readShared();
    if (req.params.slug !== shared.world.slug) {
      return sendError(res, 404, 'NOT_FOUND', 'World not found.');
    }
    res.set('Cache-Control', 'public, max-age=60');
    return res.json(shared.world);
  });

  router.get('/worlds/:worldId/chunks', requireWorld, (req, res) => {
    const { shared } = readShared();
    const all = req.query.all === 'true';
    const bounds = {
      minX: parseInteger(req.query.minChunkX),
      minY: parseInteger(req.query.minChunkY),
      maxX: parseInteger(req.query.maxChunkX),
      maxY: parseInteger(req.query.maxChunkY),
    };
    if (!all && Object.values(bounds).some((value) => value === null)) {
      return sendError(res, 400, 'BAD_REQUEST', 'Chunk bounds are required.');
    }
    if (!all && (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1) > 169) {
      return sendError(res, 400, 'VALIDATION_FAILED', 'A viewport may cover at most 169 chunks.');
    }
    const chunks = Object.values(shared.chunks).filter(
      (chunk) =>
        all ||
        (chunk.cx >= bounds.minX &&
          chunk.cx <= bounds.maxX &&
          chunk.cy >= bounds.minY &&
          chunk.cy <= bounds.maxY),
    );
    res.set('Cache-Control', 'private, no-cache');
    return res.json({ chunks });
  });

  router.get('/worlds/:worldId/chunks/:cx/:cy', requireWorld, (req, res) => {
    const cx = parseInteger(req.params.cx);
    const cy = parseInteger(req.params.cy);
    if (cx === null || cy === null)
      return sendError(res, 400, 'BAD_REQUEST', 'Invalid chunk coordinates.');
    const { shared } = readShared();
    const chunk = shared.chunks[`${cx},${cy}`];
    if (!chunk) return res.status(204).end();
    res.set('ETag', `"chunk-${cx}-${cy}-${chunk.version}"`);
    res.set('Cache-Control', 'private, no-cache');
    return res.json(chunk);
  });

  router.put('/worlds/:worldId/chunks/:cx/:cy', requireMember, requireWorld, (req, res) => {
    const cx = parseInteger(req.params.cx);
    const cy = parseInteger(req.params.cy);
    const { operationId, expectedVersion, zone, layers } = req.body || {};
    if (
      cx === null ||
      cy === null ||
      !validateOperationId(operationId) ||
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion < 0 ||
      typeof zone !== 'string' ||
      zone.length > 40 ||
      !validateChunkLayers(layers)
    ) {
      return sendError(res, 422, 'VALIDATION_FAILED', 'The chunk snapshot is invalid.');
    }

    const { db, shared } = readShared();
    const replay = replayOrConflict(shared, 'chunk:put', operationId, req.body, res);
    if (!replay) return undefined;
    const id = `${cx},${cy}`;
    const current = shared.chunks[id];
    if (current && current.ownerId !== req.actor.id)
      return sendError(
        res,
        403,
        'FORBIDDEN',
        'This chunk belongs to another artist or protected legacy history.',
      );
    const currentVersion = current?.version || 0;
    if (currentVersion !== expectedVersion) {
      return sendError(
        res,
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

    const now = new Date().toISOString();
    const chunk = {
      id,
      cx,
      cy,
      zone,
      layers,
      version: currentVersion + 1,
      savedAt: Date.now(),
      updatedAt: now,
      updatedBy: req.actor.id,
    };
    shared.chunks[id] = { ...chunk, ownerId: req.actor.id };
    const response = { chunk, operationId, acceptedAt: now };
    shared.operations[replay.key] = { hash: replay.hash, response, createdAt: now };
    shared.world.updatedAt = now;
    saveDB(db);
    return res.status(201).json(response);
  });

  router.delete('/worlds/:worldId/chunks/:cx/:cy', requireMember, requireWorld, (req, res) => {
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
    const { db, shared } = readShared();
    const replay = replayOrConflict(shared, 'chunk:delete', operationId, body, res);
    if (!replay) return undefined;
    const id = `${cx},${cy}`;
    if (shared.chunks[id] && shared.chunks[id].ownerId !== req.actor.id)
      return sendError(res, 403, 'FORBIDDEN', 'Only the chunk owner can clear it.');
    const currentVersion = shared.chunks[id]?.version || 0;
    if (currentVersion !== expectedVersion) {
      return sendError(res, 409, 'CONFLICT', 'The chunk changed before deletion.', {
        chunkX: cx,
        chunkY: cy,
        expectedVersion,
        currentVersion,
      });
    }
    delete shared.chunks[id];
    const response = { id, deleted: true, operationId };
    shared.operations[replay.key] = {
      hash: replay.hash,
      response,
      createdAt: new Date().toISOString(),
    };
    saveDB(db);
    return res.status(200).json(response);
  });

  router.get('/worlds/:worldId/entities', requireWorld, (_req, res) => {
    const { shared } = readShared();
    res.set('Cache-Control', 'private, no-cache');
    res.json({ entities: Object.values(shared.entities).map((record) => record.state) });
  });

  router.put('/worlds/:worldId/entities/:entityId', requireMember, requireWorld, (req, res) => {
    const { operationId, state } = req.body || {};
    if (
      !validateOperationId(operationId) ||
      !validateEntityState(state) ||
      state.id !== req.params.entityId
    ) {
      return sendError(res, 422, 'VALIDATION_FAILED', 'The entity is invalid.');
    }
    const { db, shared } = readShared();
    const replay = replayOrConflict(shared, 'entity:put', operationId, req.body, res);
    if (!replay) return undefined;
    const now = new Date().toISOString();
    const existing = shared.entities[state.id];
    const record = {
      state,
      creatorId: existing?.creatorId || req.actor.id,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (existing && existing.creatorId !== req.actor.id) {
      return sendError(res, 403, 'FORBIDDEN', 'Only the entity owner can update it.');
    }
    shared.entities[state.id] = record;
    const response = { entity: state, operationId, updatedAt: now };
    shared.operations[replay.key] = { hash: replay.hash, response, createdAt: now };
    saveDB(db);
    return res.status(existing ? 200 : 201).json(response);
  });

  router.delete('/worlds/:worldId/entities/:entityId', requireMember, requireWorld, (req, res) => {
    const operationId = req.get('idempotency-key');
    if (!validateOperationId(operationId))
      return sendError(res, 422, 'VALIDATION_FAILED', 'A valid idempotency key is required.');
    const { db, shared } = readShared();
    const replay = replayOrConflict(
      shared,
      'entity:delete',
      operationId,
      { id: req.params.entityId },
      res,
    );
    if (!replay) return undefined;
    const existing = shared.entities[req.params.entityId];
    if (existing && existing.creatorId !== req.actor.id) {
      return sendError(res, 403, 'FORBIDDEN', 'Only the entity owner can delete it.');
    }
    delete shared.entities[req.params.entityId];
    const response = { id: req.params.entityId, deleted: true, operationId };
    shared.operations[replay.key] = {
      hash: replay.hash,
      response,
      createdAt: new Date().toISOString(),
    };
    saveDB(db);
    return res.json(response);
  });

  router.get('/worlds/:worldId/assets', requireMember, requireWorld, (_req, res) => {
    const { shared } = readShared();
    res.set('Cache-Control', 'private, no-store');
    res.json({ assets: Object.values(shared.assets) });
  });

  router.get('/worlds/:worldId/assets/:assetId', requireWorld, (req, res) => {
    const { shared } = readShared();
    const asset = shared.assets[req.params.assetId];
    if (!asset) return sendError(res, 404, 'NOT_FOUND', 'Asset not found.');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return res.json(asset);
  });

  router.put(
    '/worlds/:worldId/assets/:assetId',
    requireMember,
    requireWorld,
    require('./media').mediaValidation,
    (req, res) => {
      const { operationId, type, data } = req.body || {};
      const byteSize = validateAsset(req.body);
      if (!validateOperationId(operationId) || !byteSize || req.params.assetId.length > 120) {
        return sendError(res, 422, 'UNSUPPORTED_MEDIA', 'The asset is invalid or exceeds 8 MB.');
      }
      const { db, shared } = readShared();
      const replay = replayOrConflict(shared, 'asset:put', operationId, req.body, res);
      if (!replay) return undefined;
      const now = new Date().toISOString();
      const existing = shared.assets[req.params.assetId];
      if (existing && existing.ownerId !== req.actor.id) {
        return sendError(res, 403, 'FORBIDDEN', 'Only the asset owner can replace it.');
      }
      const asset = {
        id: req.params.assetId,
        type: req.processedMedia.type,
        data: `data:${req.processedMedia.type};base64,${req.processedMedia.data.toString('base64')}`,
        byteSize: req.processedMedia.byteSize,
        ownerId: req.actor.id,
        savedAt: Date.now(),
        createdAt: existing?.createdAt || now,
      };
      shared.assets[asset.id] = asset;
      const response = { asset, operationId };
      shared.operations[replay.key] = { hash: replay.hash, response, createdAt: now };
      saveDB(db);
      return res.status(existing ? 200 : 201).json(response);
    },
  );

  return router;
}

module.exports = {
  WORLD_ID,
  createInitialSharedWorld,
  createWorldApi,
  normalizeSharedWorld,
  requestHash,
  parseInteger,
  sendError,
  validateAsset,
  validateChunkLayers,
  validateEntityState,
  validateOperationId,
};
