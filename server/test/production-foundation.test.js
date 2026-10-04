const assert = require('node:assert/strict');
const test = require('node:test');
const { sanitizeReturnTo, validateAuthConfiguration } = require('../auth');
const { withTransaction } = require('../database');
const { chunkFromRow } = require('../postgresWorldApi');

test('authentication return paths cannot escape the application origin', () => {
  assert.equal(sanitizeReturnTo('/world?x=10'), '/world?x=10');
  assert.equal(sanitizeReturnTo('https://attacker.example'), '/');
  assert.equal(sanitizeReturnTo('//attacker.example'), '/');
});

test('production authentication fails closed when identity settings are incomplete', () => {
  assert.throws(
    () => validateAuthConfiguration({ APP_ORIGIN: 'https://world.example' }, true),
    /OIDC_ISSUER_URL/,
  );
  assert.throws(
    () =>
      validateAuthConfiguration(
        {
          APP_ORIGIN: 'http://world.example',
          OIDC_ISSUER_URL: 'https://identity.example',
          OIDC_CLIENT_ID: 'client',
          OIDC_CLIENT_SECRET: 'secret',
        },
        true,
      ),
    /HTTPS/,
  );
});

test('complete HTTPS production authentication configuration is accepted', () => {
  assert.doesNotThrow(() =>
    validateAuthConfiguration(
      {
        APP_ORIGIN: 'https://world.example',
        OIDC_ISSUER_URL: 'https://identity.example/realms/terrarium',
        OIDC_CLIENT_ID: 'client',
        OIDC_CLIENT_SECRET: 'secret',
      },
      true,
    ),
  );
});

test('database transactions commit and release one checked-out client', async () => {
  const queries = [];
  let released = false;
  const client = {
    async query(sql) {
      queries.push(sql);
    },
    release() {
      released = true;
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };

  const value = await withTransaction(pool, async (transactionClient) => {
    assert.equal(transactionClient, client);
    await transactionClient.query('SELECT 1');
    return 42;
  });

  assert.equal(value, 42);
  assert.deepEqual(queries, ['BEGIN', 'SELECT 1', 'COMMIT']);
  assert.equal(released, true);
});

test('database transactions roll back and release after failure', async () => {
  const queries = [];
  let released = false;
  const client = {
    async query(sql) {
      queries.push(sql);
    },
    release() {
      released = true;
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };

  await assert.rejects(
    withTransaction(pool, async () => {
      throw new Error('write failed');
    }),
    /write failed/,
  );

  assert.deepEqual(queries, ['BEGIN', 'ROLLBACK']);
  assert.equal(released, true);
});

test('PostgreSQL chunks are encoded for the existing gateway contract', () => {
  const layer = Buffer.alloc(128 * 128 * 4, 7);
  const result = chunkFromRow({
    chunk_x: 2,
    chunk_y: -4,
    zone: 'living',
    background_data: layer,
    main_data: layer,
    overlay_data: layer,
    version: '9',
    updated_at: new Date('2026-09-08T00:00:00.000Z'),
    updated_by: null,
  });

  assert.equal(result.id, '2,-4');
  assert.equal(result.version, 9);
  assert.equal(Buffer.from(result.layers[0], 'base64').byteLength, layer.byteLength);
});
