const { PGlite } = require('@electric-sql/pglite');

// Embedded PostgreSQL executes real migrations/SQL. It has one connection;
// concurrent network connections and TLS remain staging tests.
async function createTestPool() {
  if (process.env.TEST_DATABASE_URL) {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test'))
      throw new Error(
        'Integration tests require a disposable localhost database with a name ending in _test.',
      );
    const { Pool } = require('pg');
    return new Pool({ connectionString: process.env.TEST_DATABASE_URL, ssl: false });
  }
  const db = await PGlite.create();
  let queue = Promise.resolve();
  const execute = async (sql, params) => {
    const result = params ? await db.query(sql, params) : (await db.exec(sql)).at(-1);
    return { ...result, rowCount: result.affectedRows || result.rows?.length || 0 };
  };
  const pool = {
    async connect() {
      const previous = queue;
      let release;
      queue = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      return { query: execute, release };
    },
    async query(sql, params) {
      const client = await pool.connect();
      try {
        return await client.query(sql, params);
      } finally {
        client.release();
      }
    },
    async end() {
      await queue;
      await db.close();
    },
    db,
  };
  return pool;
}
module.exports = { createTestPool };
