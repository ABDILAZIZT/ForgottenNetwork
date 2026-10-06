const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const sharp = require('sharp');
const { createTestPool } = require('./pgHarness');
const { runMigrations } = require('../migrate');
const { createPostgresWorldApi } = require('../postgresWorldApi');
const { originProtection, rateLimit, publishingIdentityProtection } = require('../security');
const { grantRole, validateLegacyMedia } = require('../operations');
const { withTransaction } = require('../database');
const { enforceQuota } = require('../worldPolicy');

const world = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000010';
const other = '00000000-0000-4000-8000-000000000020';
const mod = '00000000-0000-4000-8000-000000000030';
let pool, server, base;
const storedObjects = new Map();
async function call(route, { user, body, method = 'GET', headers = {} } = {}) {
  const result = await fetch(base + route, {
    method,
    headers: {
      ...headers,
      ...(user ? { 'x-test-actor': user } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: result.status, body: await result.json().catch(() => null) };
}
test.before(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  await runMigrations(pool);
  for (const [id, role] of [
    [member, 'member'],
    [other, 'member'],
    [mod, 'moderator'],
  ])
    await pool.query(
      "INSERT INTO users(id,auth_provider,auth_subject,display_name,role) VALUES($1,'test',$3,$2,$4)",
      [id, role, id, role],
    );
  const app = express();
  app.use(originProtection(['https://world.example']));
  app.get('/limited', rateLimit({ pool, scope: 'test-limit', limit: 1 }), (_req, res) =>
    res.json({ ok: true }),
  );
  app.use(express.json({ limit: '12mb' }));
  app.use(async (req, res, next) => {
    try {
      const id = req.get('x-test-actor');
      if (id) {
        const r = await pool.query(
          'SELECT role, publishing_suspended_until FROM users WHERE id=$1',
          [id],
        );
        req.actor = {
          id,
          role: r.rows[0].role,
          publishingAllowed: !r.rows[0].publishing_suspended_until,
        };
      }
      next();
    } catch (e) {
      next(e);
    }
  });
  app.use(publishingIdentityProtection);
  app.use('/api/v1', createPostgresWorldApi({ pool }));
  app.use(
    '/object-api/v1',
    createPostgresWorldApi({
      pool,
      objectStorage: {
        async put(key, media) {
          storedObjects.set(key, media);
        },
        async get(key) {
          return storedObjects.get(key).data;
        },
      },
    }),
  );
  app.use((error, req, res, next) => {
    console.error(error.message);
    res.status(500).json({ message: error.message });
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
});

test('migrations are executable and repeatable, readiness is PostgreSQL-backed', async () => {
  assert.equal((await pool.query('SELECT * FROM schema_migrations')).rowCount, 5);
  assert.equal((await call('/health/ready')).body.storage, 'postgresql');
});
test('chunk writes protect versions, history, target identity and deletion tombstones', async () => {
  const route = `/worlds/${world}/chunks/2/3`;
  const body = {
    operationId: crypto.randomUUID(),
    expectedVersion: 0,
    zone: 'living',
    layers: Array(3).fill(Buffer.alloc(65536, 5).toString('base64')),
  };
  assert.equal((await call(route, { method: 'PUT', body })).status, 401);
  assert.equal(
    (
      await call(route, {
        user: other,
        method: 'PUT',
        body,
        headers: { 'X-Publishing-Actor': member },
      })
    ).status,
    401,
  );
  assert.equal((await call(route, { user: member, method: 'PUT', body })).status, 201);
  assert.equal((await call(route, { user: member, method: 'PUT', body })).status, 200);
  assert.equal(
    (await call(`/worlds/${world}/chunks/3/3`, { user: member, method: 'PUT', body })).status,
    409,
  );
  assert.equal(
    (
      await call(route, {
        user: other,
        method: 'PUT',
        body: { ...body, operationId: crypto.randomUUID() },
      })
    ).status,
    409,
  );
  assert.equal((await call(route)).body.zone, 'living');
  assert.equal(
    (await pool.query('SELECT * FROM chunk_history WHERE chunk_x=2 AND chunk_y=3')).rowCount,
    1,
  );
  const deletion = await call(route, {
    user: member,
    method: 'DELETE',
    headers: { 'if-match-version': '1', 'idempotency-key': crypto.randomUUID() },
  });
  assert.equal(deletion.status, 200);
  assert.equal(deletion.body.version, 2);
  assert.equal(
    (
      await call(route, {
        user: other,
        method: 'PUT',
        body: { ...body, operationId: crypto.randomUUID() },
      })
    ).status,
    409,
  );
  const restored = await call('/moderation/actions', {
    user: mod,
    method: 'POST',
    body: {
      operationId: crypto.randomUUID(),
      action: 'restore_chunk',
      worldId: world,
      chunkX: 2,
      chunkY: 3,
      version: 1,
      reason: 'Restore history test',
    },
  });
  assert.equal(restored.status, 200);
  assert.equal((await call(route)).body.version, 3);
  assert.equal((await call(route)).body.layers[0], body.layers[0]);
  const contenders = await Promise.all(
    [member, other].map((user) =>
      call(`/worlds/${world}/chunks/9/9`, {
        user,
        method: 'PUT',
        body: { ...body, operationId: crypto.randomUUID() },
      }),
    ),
  );
  assert.deepEqual(contenders.map((r) => r.status).sort(), [201, 409]);
});

test('PostgreSQL counters, cross-origin protection, quotas and region policies reject writes', async () => {
  const limited = base.replace('/api/v1', '/limited');
  assert.equal((await fetch(limited)).status, 200);
  const throttled = await fetch(limited);
  assert.equal(throttled.status, 429);
  assert.ok(Number(throttled.headers.get('retry-after')) > 0);
  assert.equal(
    (
      await call('/moderation/actions', {
        method: 'POST',
        headers: { Origin: 'https://hostile.example' },
        body: {},
      })
    ).status,
    403,
  );
  await assert.rejects(
    withTransaction(pool, (client) => enforceQuota(client, member, 'chunk:put', 1)),
    /Daily/,
  );
  await pool.query('UPDATE regions SET can_draw=false WHERE world_id=$1', [world]);
  const body = {
    operationId: crypto.randomUUID(),
    expectedVersion: 0,
    zone: 'living',
    layers: Array(3).fill(Buffer.alloc(65536).toString('base64')),
  };
  try {
    assert.equal(
      (await call(`/worlds/${world}/chunks/10/10`, { user: other, method: 'PUT', body })).status,
      403,
    );
  } finally {
    await pool.query('UPDATE regions SET can_draw=true WHERE world_id=$1', [world]);
  }
  assert.equal((await call('/worlds/------------------------------------/chunks/0/0')).status, 404);
});

test('operator roles are audited and the final administrator is protected', async () => {
  await grantRole(pool, other, 'administrator', 'Bootstrap administrator test');
  assert.equal(
    (await pool.query('SELECT role FROM users WHERE id=$1', [other])).rows[0].role,
    'administrator',
  );
  await assert.rejects(
    grantRole(pool, other, 'member', 'Cannot remove last admin'),
    /last administrator/,
  );
  assert.equal(
    (await pool.query("SELECT * FROM safety_audit WHERE action='operator_role_change'")).rowCount,
    1,
  );
  assert.deepEqual(await validateLegacyMedia(pool), {
    accepted: 0,
    quarantined: 0,
    applied: false,
  });
});

test('real image validation, asset ownership, reports, moderation and audit integrity', async () => {
  const data = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#00ffcc' } })
    .png()
    .toBuffer();
  const upload = {
    operationId: crypto.randomUUID(),
    type: 'image/png',
    data: `data:image/png;base64,${data.toString('base64')}`,
  };
  assert.equal(
    (await call(`/worlds/${world}/assets/picture`, { user: member, method: 'PUT', body: upload }))
      .status,
    201,
  );
  assert.equal((await call(`/worlds/${world}/assets/picture`)).status, 404);
  const state = {
    id: 'example',
    type: 'uploaded_custom',
    wx: 0,
    wy: 0,
    createdAt: 1,
    spriteUrl: 'asset:picture',
  };
  const entity = `/worlds/${world}/entities/example`;
  assert.equal(
    (
      await call(entity, {
        user: other,
        method: 'PUT',
        body: { operationId: crypto.randomUUID(), state },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(entity, {
        user: member,
        method: 'PUT',
        body: { operationId: crypto.randomUUID(), state },
      })
    ).status,
    201,
  );
  assert.equal((await call(`/worlds/${world}/assets/picture`)).status, 200);
  const report = await call(`/worlds/${world}/reports`, {
    method: 'POST',
    body: { entityId: 'example', reason: 'Test moderation report' },
  });
  assert.equal(report.status, 201);
  assert.equal((await call('/moderation/reports', { user: member })).status, 403);
  const action = {
    operationId: crypto.randomUUID(),
    action: 'hide_entity',
    worldId: world,
    entityId: 'example',
    reason: 'Hidden during moderation test',
  };
  assert.equal(
    (await call('/moderation/actions', { user: mod, method: 'POST', body: action })).status,
    200,
  );
  assert.equal((await call(`/worlds/${world}/assets/picture`)).status, 404);
  const visible = (await call(`/worlds/${world}/entities`)).body.entities;
  assert.equal(
    visible.some((e) => e.id === 'example'),
    false,
  );
  assert.equal(
    (
      await call(entity, {
        user: member,
        method: 'PUT',
        body: { operationId: crypto.randomUUID(), state },
      })
    ).status,
    403,
  );
  await assert.rejects(pool.query('DELETE FROM safety_audit'), /immutable/);
  assert.equal(
    (
      await call('/moderation/actions', {
        user: mod,
        method: 'POST',
        body: { ...action, operationId: crypto.randomUUID(), action: 'restore_entity' },
      })
    ).status,
    200,
  );
  assert.equal((await call(`/worlds/${world}/assets/picture`)).status, 200);
  assert.equal(
    (
      await call('/moderation/actions', {
        user: mod,
        method: 'POST',
        body: {
          operationId: crypto.randomUUID(),
          action: 'suspend',
          userId: member,
          reason: 'Suspension test reason',
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(entity, {
        user: member,
        method: 'PUT',
        body: { operationId: crypto.randomUUID(), state },
      })
    ).status,
    403,
  );
  assert.equal((await call('/me', { user: member })).body.publishingAllowed, false);
});

test('embedded PostgreSQL backup restores content, versions and immutable audit records', async (context) => {
  if (!pool.db) return context.skip('Native pg_dump/pg_restore drill is a separate staging gate.');
  const { PGlite } = require('@electric-sql/pglite');
  const snapshot = await pool.db.dumpDataDir();
  const restored = await PGlite.create({ loadDataDir: snapshot });
  try {
    assert.equal(
      (await restored.query('SELECT version FROM chunks WHERE chunk_x=2 AND chunk_y=3')).rows[0]
        .version,
      3,
    );
    assert.ok((await restored.query('SELECT * FROM safety_audit')).rows.length >= 4);
    assert.equal(
      (await restored.query('SELECT count(*) FROM repository_assets WHERE verified=true')).rows[0]
        .count,
      1,
    );
    await assert.rejects(restored.query('DELETE FROM safety_audit'), /immutable/);
  } finally {
    await restored.close();
  }
});

test('object-storage mode stores only processed bytes and returns authorized media', async () => {
  const data = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#336699' } })
    .jpeg()
    .toBuffer();
  const url = base.replace('/api/v1', '/object-api/v1') + `/worlds/${world}/assets/bucket-test`;
  const body = {
    operationId: crypto.randomUUID(),
    type: 'image/jpeg',
    data: `data:image/jpeg;base64,${data.toString('base64')}`,
  };
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-test-actor': other },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201);
  const value = await response.json();
  assert.equal(value.asset.type, 'image/png');
  assert.equal(value.asset.data, undefined);
  const row = (
    await pool.query("SELECT media_data,storage_key FROM repository_assets WHERE id='bucket-test'")
  ).rows[0];
  assert.equal(row.media_data, null);
  assert.equal(storedObjects.get(row.storage_key).type, 'image/png');
  assert.equal((await fetch(url)).status, 404);
  const ownerRead = await fetch(url, { headers: { 'x-test-actor': other } });
  assert.equal(ownerRead.status, 200);
  assert.match((await ownerRead.json()).data, /^data:image\/png;base64,/);
});

test('Classic rejects foreign chunk edits and clearing even with the correct version', async () => {
  await pool.query('UPDATE users SET publishing_suspended_until=NULL WHERE id IN ($1,$2)', [
    member,
    other,
  ]);
  const route = '/worlds/' + world + '/chunks/70/70';
  const body = {
    operationId: crypto.randomUUID(),
    expectedVersion: 0,
    zone: 'static',
    layers: Array(3).fill(Buffer.alloc(65536).toString('base64')),
  };
  assert.equal((await call(route, { user: member, method: 'PUT', body })).status, 201);
  assert.equal(
    (
      await call(route, {
        user: other,
        method: 'PUT',
        body: { ...body, operationId: crypto.randomUUID(), expectedVersion: 1 },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(route, {
        user: other,
        method: 'DELETE',
        headers: { 'if-match-version': '1', 'idempotency-key': crypto.randomUUID() },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(route, {
        user: member,
        method: 'PUT',
        body: { ...body, operationId: crypto.randomUUID(), expectedVersion: 1 },
      })
    ).status,
    201,
  );
});
