const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const crypto = require('node:crypto');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgotten-network-'));
process.env.DB_PATH = path.join(testDir, 'db.json');
process.env.PERMANENT_DB_PATH = ':memory:';
process.env.DEV_AUTH_TOKEN = 'phase-4-test-token';

const { app } = require('../index');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('health endpoint reports readiness', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('database starts with the default creature', async () => {
  const response = await fetch(`${baseUrl}/api/creatures`);
  const creatures = await response.json();

  assert.equal(response.status, 200);
  assert.equal(creatures.length, 1);
  assert.equal(creatures[0].name, 'The First One');
});

test('structure batches reject missing placement data', async () => {
  const response = await fetch(`${baseUrl}/api/structures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ batch: [{ sprite: 'data:image/png;base64,abc' }] }),
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /requires sprite, x, and y/i);
});

test('v1 readiness distinguishes storage readiness', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health/ready`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ready', storage: 'connected' });
  assert.match(response.headers.get('x-request-id'), /^req_/);
});

test('authentication configuration and development identity are explicit', async () => {
  const configuration = await fetch(`${baseUrl}/api/v1/auth/config`);
  assert.deepEqual(await configuration.json(), { enabled: false, moderation: false });

  const identity = await fetch(`${baseUrl}/api/v1/me`, {
    headers: { authorization: 'Bearer phase-4-test-token' },
  });
  assert.equal(identity.status, 200);
  assert.equal((await identity.json()).displayName, 'Development Member');
});

test('shared chunk writes require authentication', async () => {
  const response = await fetch(
    `${baseUrl}/api/v1/worlds/00000000-0000-4000-8000-000000000001/chunks/0/0`,
    { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' },
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'UNAUTHENTICATED');
});

test('two clients share idempotent, version-protected chunk snapshots', async () => {
  const endpoint = `${baseUrl}/api/v1/worlds/00000000-0000-4000-8000-000000000001/chunks/2/-3`;
  const operationId = crypto.randomUUID();
  const layers = [0, 1, 2].map((value) => Buffer.alloc(128 * 128 * 4, value).toString('base64'));
  const body = { operationId, expectedVersion: 0, zone: 'living', layers };
  const headers = {
    authorization: 'Bearer phase-4-test-token',
    'content-type': 'application/json',
  };

  const firstClient = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  assert.equal(firstClient.status, 201);
  assert.equal((await firstClient.json()).chunk.version, 1);

  const replay = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).chunk.version, 1);

  const secondClient = await fetch(endpoint);
  assert.equal(secondClient.status, 200);
  const visibleChunk = await secondClient.json();
  assert.equal(visibleChunk.version, 1);
  assert.equal(visibleChunk.layers[1], layers[1]);

  const staleWrite = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...body, operationId: crypto.randomUUID() }),
  });
  assert.equal(staleWrite.status, 409);
  const conflict = await staleWrite.json();
  assert.equal(conflict.error.code, 'CONFLICT');
  assert.equal(conflict.error.details.currentVersion, 1);

  const reusedOperation = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...body, zone: 'static' }),
  });
  assert.equal(reusedOperation.status, 409);
});

test('entity writes are authenticated and idempotent', async () => {
  const entityId = 'entity-phase-4';
  const endpoint = `${baseUrl}/api/v1/worlds/00000000-0000-4000-8000-000000000001/entities/${entityId}`;
  const body = {
    operationId: crypto.randomUUID(),
    state: {
      id: entityId,
      type: 'structure',
      wx: 12,
      wy: 34,
      createdAt: Date.now(),
      color: '#00e6b8',
    },
  };
  const options = {
    method: 'PUT',
    headers: {
      authorization: 'Bearer phase-4-test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  };
  assert.equal((await fetch(endpoint, options)).status, 201);
  assert.equal((await fetch(endpoint, options)).status, 200);

  const list = await fetch(
    `${baseUrl}/api/v1/worlds/00000000-0000-4000-8000-000000000001/entities`,
  );
  const entities = (await list.json()).entities;
  assert.equal(
    entities.some((entity) => entity.id === entityId),
    true,
  );
});

test('canvas identity opens a real Classic session without trusting a supplied user ID', async () => {
  const identityResponse = await fetch(baseUrl + '/api/canvas/identity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Bridge Tester', color: '#22d3ee' }),
  });
  const identity = await identityResponse.json();
  const bad = await fetch(baseUrl + '/api/canvas/classic-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: identity.user.id }),
  });
  assert.equal(bad.status, 401);
  const good = await fetch(baseUrl + '/api/canvas/classic-session', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + identity.token, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(good.status, 200);
  const cookie = good.headers.get('set-cookie').split(';')[0];
  const me = await fetch(baseUrl + '/api/v1/me', { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).id, identity.user.id);
});
