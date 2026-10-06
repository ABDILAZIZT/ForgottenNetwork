const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createDatabasePool } = require('./database');

async function runMigrations(pool, directory = path.join(__dirname, 'migrations')) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [726451903]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        sha256 char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await fs.readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
    for (const name of files) {
      const sql = await fs.readFile(path.join(directory, name), 'utf8');
      const sha256 = crypto.createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT sha256 FROM schema_migrations WHERE name = $1', [
        name,
      ]);
      if (existing.rowCount) {
        if (existing.rows[0].sha256 !== sha256) {
          throw new Error(`Applied migration ${name} has changed`);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        // v4 only changes attribution metadata. Its published checksum must remain stable,
        // and the old history trigger would otherwise insert an existing version again.
        if (name === '004_classic_ownership.sql')
          await client.query('ALTER TABLE chunks DISABLE TRIGGER chunks_history');
        // Existing files own outer transaction markers; migration + checksum must commit together.
        await client.query(sql.replace(/^\s*BEGIN\s*;/i, '').replace(/COMMIT\s*;\s*$/i, ''));
        if (name === '004_classic_ownership.sql')
          await client.query('ALTER TABLE chunks ENABLE TRIGGER chunks_history');
        await client.query('INSERT INTO schema_migrations (name, sha256) VALUES ($1, $2)', [
          name,
          sha256,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      console.log(`Applied migration ${name}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [726451903]).catch(() => undefined);
    client.release();
  }
}

async function main() {
  const pool = createDatabasePool();
  if (!pool) throw new Error('DATABASE_URL is required');
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { runMigrations };
