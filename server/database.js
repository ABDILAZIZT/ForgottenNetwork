const { Pool } = require('pg');

function createDatabasePool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) return null;

  const useTls = process.env.DATABASE_SSL !== 'false';
  const pool = new Pool({
    connectionString,
    max: Math.max(1, Number(process.env.DATABASE_POOL_MAX) || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: useTls
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : false,
  });
  pool.on('error', (error) => console.error('Unexpected idle PostgreSQL client error:', error));
  return pool;
}

async function withTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createDatabasePool, withTransaction };
