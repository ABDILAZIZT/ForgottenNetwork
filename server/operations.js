const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createDatabasePool, withTransaction } = require('./database');
const { validateOperationId } = require('./worldApi');
const { lockTarget } = require('./worldPolicy');
const { processMedia } = require('./media');

// Credentials stay in the child environment, not command arguments or logs.
function postgresEnvironment(connectionString, environment = process.env) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('A PostgreSQL URL is required.');
  return {
    ...environment,
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: '10',
    PGSSLMODE:
      url.searchParams.get('sslmode') ||
      (environment.DATABASE_SSL === 'false' ? 'disable' : 'verify-full'),
  };
}
function runUtility(command, args, connectionString) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: postgresEnvironment(connectionString),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    // Provider errors can contain connection details. Return only the exit code.
    child.stderr.resume();
    child.once('error', () =>
      reject(new Error(`${command} could not start. Install PostgreSQL client tools on PATH.`)),
    );
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${command} failed (exit ${code}). Check connectivity, privileges and client/server versions.`,
            ),
          ),
    );
  });
}
async function backup(connectionString, file) {
  if (!connectionString || !file) throw new Error('DATABASE_URL and an output file are required.');
  const target = path.resolve(file);
  const reservation = await fs.open(target, 'wx', 0o600);
  await reservation.close();
  // Never overwrite an existing backup. Failed partial files remain for inspection.
  await runUtility(
    'pg_dump',
    [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--no-password',
      '--exclude-table-data=public.user_sessions',
      '--exclude-table-data=public.request_limits',
      '--file',
      target,
    ],
    connectionString,
  );
  return target;
}
async function restore(connectionString, file, confirmed) {
  if (!confirmed || !connectionString || !file)
    throw new Error(
      'Set RESTORE_DATABASE_URL and pass a trusted backup file plus --confirm-empty-target.',
    );
  await fs.access(path.resolve(file));
  const pool = createDatabasePool(connectionString);
  try {
    const existing = await pool.query(
      "SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') LIMIT 1",
    );
    if (existing.rowCount)
      throw new Error('Restore refused: target database is not empty. Nothing was removed.');
  } finally {
    await pool.end();
  }
  await runUtility(
    'pg_restore',
    [
      '--single-transaction',
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      '--no-password',
      '--dbname',
      postgresEnvironment(connectionString).PGDATABASE,
      path.resolve(file),
    ],
    connectionString,
  );
}
async function grantRole(pool, userId, role, reason) {
  if (
    !validateOperationId(userId) ||
    !['member', 'moderator', 'administrator'].includes(role) ||
    !reason ||
    reason.length < 5 ||
    reason.length > 1000
  )
    throw new Error(
      'Provide user UUID, member/moderator/administrator role and a reason (5–1000 characters).',
    );
  return withTransaction(pool, async (client) => {
    await lockTarget(client, 'operator:roles');
    const result = await client.query(
      "SELECT role FROM users WHERE id=$1 AND deleted_at IS NULL AND auth_provider NOT IN ('system','development') FOR UPDATE",
      [userId],
    );
    if (!result.rowCount)
      throw new Error(
        'Account not found. Sign in through OIDC once first; system/development identities cannot be promoted.',
      );
    if (result.rows[0].role === 'administrator' && role !== 'administrator') {
      const admins = await client.query(
        "SELECT count(*) FROM users WHERE role='administrator' AND deleted_at IS NULL AND auth_provider <> 'system'",
      );
      if (Number(admins.rows[0].count) <= 1)
        throw new Error('Cannot demote the last administrator.');
    }
    await client.query('UPDATE users SET role=$2 WHERE id=$1', [userId, role]);
    await client.query(
      "INSERT INTO safety_audit(id,actor_id,action,reason,target) VALUES($1,'00000000-0000-4000-8000-000000000011','operator_role_change',$2,$3)",
      [crypto.randomUUID(), reason, { userId, from: result.rows[0].role, to: role }],
    );
  });
}
async function validateLegacyMedia(pool, apply = false) {
  const result = await pool.query(
    'SELECT world_id,id,media_type,media_data FROM repository_assets WHERE verified=false',
  );
  const report = { accepted: 0, quarantined: 0, applied: apply };
  for (const asset of result.rows) {
    try {
      const media = await processMedia({
        type: asset.media_type,
        data: `data:${asset.media_type};base64,${Buffer.from(asset.media_data).toString('base64')}`,
      });
      if (apply)
        await pool.query(
          'UPDATE repository_assets SET media_type=$3,media_data=$4,byte_size=$5,verified=true,updated_at=now() WHERE world_id=$1 AND id=$2 AND verified=false',
          [asset.world_id, asset.id, media.type, media.data, media.byteSize],
        );
      report.accepted++;
    } catch {
      report.quarantined++;
    }
  }
  return report;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'backup')
    return console.log(`Backup created: ${await backup(process.env.DATABASE_URL, args[0])}`);
  if (command === 'restore') {
    await restore(process.env.RESTORE_DATABASE_URL, args[0], args[1] === '--confirm-empty-target');
    return console.log(
      'Restored into the empty target. Run migrations, verify media, and test readiness before switching traffic.',
    );
  }
  const pool = createDatabasePool();
  if (!pool) throw new Error('DATABASE_URL is required.');
  try {
    if (command === 'grant-role') {
      await grantRole(pool, ...args);
      console.log('Role updated and audited.');
    } else if (command === 'validate-legacy-media')
      console.log(await validateLegacyMedia(pool, args[0] === '--apply'));
    else
      throw new Error(
        'Commands: backup <new-file>, restore <trusted-file> --confirm-empty-target, grant-role <uuid> <role> "reason", validate-legacy-media [--apply]',
      );
  } finally {
    await pool.end();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { postgresEnvironment, backup, restore, grantRole, validateLegacyMedia };
