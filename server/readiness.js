const { loadMigrations } = require('./migrate');

function releaseSha(environment = process.env) {
  const value = environment.RENDER_GIT_COMMIT;
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : null;
}

async function checkPostgresReadiness(pool) {
  if (!pool) throw new Error('PostgreSQL is not configured.');
  const migrations = await loadMigrations();
  if (!migrations.length) throw new Error('Database migration files are missing.');
  const result = await pool.query(
    'SELECT name, sha256 FROM schema_migrations WHERE name = ANY($1::text[])',
    [migrations.map(({ name }) => name)],
  );
  const applied = new Map(result.rows.map(({ name, sha256 }) => [name, sha256]));
  if (migrations.some(({ name, sha256 }) => applied.get(name) !== sha256))
    throw new Error('Database migrations are incomplete or changed.');
}

function createReadinessHandler({ pool, checkCanvas, environment = process.env }) {
  return async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const release = releaseSha(environment);
    try {
      await checkCanvas();
      if (pool || environment.NODE_ENV === 'production') await checkPostgresReadiness(pool);
      return res.json({
        status: 'ok',
        ready: true,
        release,
        stores: { canvas: 'sqlite', worlds: pool ? 'postgresql' : 'json' },
      });
    } catch {
      return res.status(503).json({ status: 'unavailable', ready: false, release });
    }
  };
}

module.exports = { checkPostgresReadiness, createReadinessHandler, releaseSha };
