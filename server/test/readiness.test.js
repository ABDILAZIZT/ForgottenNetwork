const assert = require('node:assert/strict');
const test = require('node:test');
const { loadMigrations } = require('../migrate');
const { createPermanentCanvas } = require('../permanent/api');
const { checkPostgresReadiness, createReadinessHandler, releaseSha } = require('../readiness');

const release = '4aa5e723b1784f4da0fac13c2b42203e11f7a6d9';

function response() {
  return {
    statusCode: 200,
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

async function migratedPool(transform = (rows) => rows) {
  const migrations = await loadMigrations();
  const queries = [];
  return {
    queries,
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      return { rows: transform(migrations.map(({ name, sha256 }) => ({ name, sha256 }))) };
    },
  };
}

test('PostgreSQL readiness verifies every current migration and checksum using only a read', async () => {
  const pool = await migratedPool();
  await checkPostgresReadiness(pool);
  assert.equal(pool.queries.length, 1);
  assert.match(pool.queries[0].sql, /^SELECT /);
  assert.deepEqual(
    pool.queries[0].parameters[0],
    (await loadMigrations()).map(({ name }) => name),
  );
});

test('PostgreSQL readiness rejects missing latest migrations and modified migration checksums', async () => {
  await assert.rejects(
    checkPostgresReadiness(await migratedPool((rows) => rows.slice(0, -1))),
    /incomplete or changed/,
  );
  await assert.rejects(
    checkPostgresReadiness(
      await migratedPool((rows) => rows.map((row) => ({ ...row, sha256: '0'.repeat(64) }))),
    ),
    /incomplete or changed/,
  );
});

test('combined production health reads SQLite and migrated PostgreSQL and identifies the release', async (t) => {
  const canvas = createPermanentCanvas({ filename: ':memory:' });
  t.after(() => canvas.getStore().close());
  const pool = await migratedPool();
  const res = response();
  await createReadinessHandler({
    pool,
    checkCanvas: canvas.checkHealth,
    environment: { NODE_ENV: 'production', RENDER_GIT_COMMIT: release },
  })({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(res.body, {
    status: 'ok',
    ready: true,
    release,
    stores: { canvas: 'sqlite', worlds: 'postgresql' },
  });
  assert.equal(pool.queries.length, 1);
});

test('combined health reports unavailable when the SQLite database cannot be read', async () => {
  const canvas = createPermanentCanvas({ filename: ':memory:' });
  canvas.checkHealth();
  canvas.getStore().close();
  const res = response();
  await createReadinessHandler({
    pool: null,
    checkCanvas: canvas.checkHealth,
    environment: { RENDER_GIT_COMMIT: release },
  })({}, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { status: 'unavailable', ready: false, release });
});

test('combined health sanitizes database errors and incomplete migrations', async () => {
  for (const pool of [
    {
      async query() {
        throw new Error('postgresql://private-user:secret-password@private-host/database');
      },
    },
    await migratedPool((rows) => rows.slice(0, -1)),
  ]) {
    const res = response();
    await createReadinessHandler({
      pool,
      checkCanvas() {},
      environment: { NODE_ENV: 'production', RENDER_GIT_COMMIT: release },
    })({}, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.deepEqual(res.body, { status: 'unavailable', ready: false, release });
    assert.doesNotMatch(JSON.stringify(res.body), /secret-password|private-host|migration/i);
  }
});

test('combined health permits the development JSON store but requires PostgreSQL in production', async () => {
  for (const production of [false, true]) {
    const res = response();
    await createReadinessHandler({
      pool: null,
      checkCanvas() {},
      environment: { NODE_ENV: production ? 'production' : 'development' },
    })({}, res);
    assert.equal(res.statusCode, production ? 503 : 200);
    assert.equal(res.body.ready, !production);
    if (!production) assert.deepEqual(res.body.stores, { canvas: 'sqlite', worlds: 'json' });
  }
});

test('release metadata accepts commit SHAs without reflecting arbitrary environment content', () => {
  assert.equal(releaseSha({ RENDER_GIT_COMMIT: release.toUpperCase() }), release);
  assert.equal(
    releaseSha({ RENDER_GIT_COMMIT: 'private configuration accidentally placed here' }),
    null,
  );
  assert.equal(releaseSha({}), null);
});
