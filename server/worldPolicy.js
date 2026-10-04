const { ApiProblem } = require('./apiProblem');

async function lockTarget(client, value) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [value]);
}

async function enforceQuota(client, actorId, scope, limit) {
  const result = await client.query(
    `SELECT count(*) FROM idempotency_records
    WHERE actor_id = $1 AND scope = $2 AND created_at > now() - interval '1 day'`,
    [actorId, scope],
  );
  if (Number(result.rows[0].count) >= limit)
    throw new ApiProblem(
      429,
      'QUOTA_EXCEEDED',
      'Daily contribution limit reached. Please try tomorrow.',
    );
}

async function checkRegion(client, worldId, bounds, action, layers = [0, 1, 2]) {
  const result = await client.query(
    `SELECT * FROM regions WHERE world_id = $1
    AND min_x <= $4 AND max_x >= $2 AND min_y <= $5 AND max_y >= $3
    AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
    ORDER BY priority DESC`,
    [worldId, ...bounds],
  );
  // Whole-chunk snapshots conservatively respect every overlapping restriction.
  if (
    !result.rows.length ||
    result.rows.some(
      (r) =>
        !r[action] ||
        (action === 'can_draw' && layers.some((layer) => !r.allowed_layers.includes(layer))),
    )
  ) {
    throw new ApiProblem(403, 'FORBIDDEN', 'Publishing is restricted in this region.');
  }
}

function assetReferences(state) {
  return [
    ...new Set(
      [state.spriteUrl, ...(state.frames || []), ...(state.layers || []).map((l) => l.url)]
        .filter((url) => url?.startsWith('asset:'))
        .map((url) => url.slice(6)),
    ),
  ];
}

async function checkAssets(client, worldId, actorId, state) {
  for (const id of assetReferences(state)) {
    const result = await client.query(
      'SELECT owner_id, verified FROM repository_assets WHERE world_id = $1 AND id = $2',
      [worldId, id],
    );
    if (!result.rows[0]?.verified || result.rows[0].owner_id !== actorId) {
      throw new ApiProblem(403, 'FORBIDDEN', 'Only your own validated media can be placed.');
    }
  }
}

module.exports = { lockTarget, enforceQuota, checkRegion, checkAssets, assetReferences };
