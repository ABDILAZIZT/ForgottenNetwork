const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { PGlite } = require('@electric-sql/pglite');
const { runMigrations } = require('../migrate');
test('ownership upgrade preserves populated legacy history and locks incomplete attribution', async () => {
  const db = await PGlite.create();
  const query = async (sql, params) => {
    const result = params ? await db.query(sql, params) : (await db.exec(sql)).at(-1);
    return { ...result, rowCount: result.affectedRows || result.rows?.length || 0 };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fn-upgrade-'));
  try {
    for (const name of [
      '001_shared_world.sql',
      '002_runtime_support.sql',
      '003_launch_controls.sql',
    ])
      await fs.copyFile(path.join(__dirname, '../migrations', name), path.join(directory, name));
    await runMigrations(pool, directory);
    const user = '00000000-0000-4000-8000-000000000099';
    await query(
      "INSERT INTO users(id,auth_provider,auth_subject,display_name) VALUES($1,'test','test','Legacy artist')",
      [user],
    );
    for (const [x, version] of [
      [0, 1],
      [1, 3],
    ])
      await query(
        'INSERT INTO chunks(world_id,chunk_x,chunk_y,version,background_data,main_data,overlay_data,updated_by) VALUES($1,$2,0,$3,$4,$4,$4,$5)',
        ['00000000-0000-4000-8000-000000000001', x, version, Buffer.from('historic bytes'), user],
      );
    const history = (await query('SELECT * FROM chunk_history ORDER BY id')).rows;
    await runMigrations(pool);
    await runMigrations(pool);
    assert.deepEqual((await query('SELECT * FROM chunk_history ORDER BY id')).rows, history);
    const rows = (
      await query('SELECT chunk_x,owner_id,ownership_locked FROM chunks ORDER BY chunk_x')
    ).rows;
    assert.equal(rows[0].owner_id, user);
    assert.equal(rows[0].ownership_locked, false);
    assert.equal(rows[1].owner_id, null);
    assert.equal(rows[1].ownership_locked, true);
  } finally {
    await db.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
