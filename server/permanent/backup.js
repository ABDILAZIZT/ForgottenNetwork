const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

function backupCanvas(source, destination) {
  if (fs.existsSync(destination))
    throw new Error('Choose a new backup filename; existing backups are never overwritten.');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA quick_check').get().quick_check;
    if (integrity !== 'ok') throw new Error('Source database integrity check failed: ' + integrity);
    // VACUUM INTO takes a consistent snapshot, including committed WAL transactions.
    db.prepare('VACUUM INTO ?').run(destination);
  } finally {
    db.close();
  }
  const copy = new DatabaseSync(destination, { readOnly: true });
  try {
    if (copy.prepare('PRAGMA quick_check').get().quick_check !== 'ok')
      throw new Error('Backup integrity check failed.');
    return copy.prepare('SELECT count(*) AS artworks FROM canvas_elements').get();
  } finally {
    copy.close();
  }
}

if (require.main === module) {
  try {
    if (!process.argv[2])
      throw new Error('Usage: node server/permanent/backup.js <new-backup.sqlite>');
    const source =
      process.env.PERMANENT_DB_PATH ||
      (process.env.DB_PATH
        ? path.resolve(__dirname, '..', process.env.DB_PATH) + '.canvas.sqlite'
        : path.join(__dirname, '../data/permanent.sqlite'));
    const destination = path.resolve(process.argv[2]);
    const result = backupCanvas(source, destination);
    console.log(JSON.stringify({ destination, ...result, integrity: 'ok' }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { backupCanvas };
