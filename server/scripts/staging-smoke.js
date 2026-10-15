// Read-only release check. Never creates accounts, publishes content, or requests secrets.
const origin = process.argv[2] || 'http://127.0.0.1:3001';
const expectedRelease = process.argv[3];

function validatedTarget(value) {
  const target = new URL(value);
  if (
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash ||
    !['http:', 'https:'].includes(target.protocol)
  )
    throw new Error('Provide a website origin without credentials, path, query, or fragment.');
  return target;
}

async function read(target, route) {
  let response;
  try {
    response = await fetch(new URL(route, target), {
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch (error) {
    throw new Error(`${route}: ${error.message}`);
  }
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
  console.log(`PASS ${route}`);
  return response;
}

async function main() {
  const target = validatedTarget(origin);
  if (expectedRelease && !/^[a-f0-9]{40}$/i.test(expectedRelease))
    throw new Error('Expected release must be a full 40-character commit SHA.');

  const index = await read(target, '/');
  if (!index.headers.get('content-type')?.includes('text/html'))
    throw new Error('/: frontend HTML was not served.');
  const html = await index.text();
  const assets = [
    ...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["'](\/assets\/[^"']+)["'][^>]*>/gi),
  ].map((match) => match[1]);
  if (!assets.some((asset) => asset.endsWith('.js')))
    throw new Error('/: no production JavaScript asset was found.');
  for (const asset of new Set(assets)) await read(target, asset);

  const health = await (await read(target, '/api/health')).json();
  if (
    health.status !== 'ok' ||
    health.ready !== true ||
    health.stores?.canvas !== 'sqlite' ||
    health.stores?.worlds !== 'postgresql'
  )
    throw new Error('/api/health: combined storage is not ready.');

  const canvas = await (await read(target, '/api/canvas/health')).json();
  if (canvas.ready !== true || canvas.storage !== 'sqlite')
    throw new Error('/api/canvas/health: canvas storage is not ready.');
  if (
    expectedRelease &&
    [health.release, canvas.release].some(
      (release) => release?.toLowerCase() !== expectedRelease.toLowerCase(),
    )
  )
    throw new Error('The live release does not match the expected GitHub commit.');

  const worlds = await (await read(target, '/api/v1/health/ready')).json();
  if (worlds.storage !== 'postgresql' || worlds.status !== 'ready')
    throw new Error('/api/v1/health/ready: PostgreSQL is not ready.');

  await read(target, '/api/v1/auth/config');
  await read(target, '/api/v1/worlds/00000000-0000-4000-8000-000000000001/entities');
  console.log(
    'Read-only smoke passed. Disk persistence, member publishing, moderation, and recovery still require operator checks.',
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, validatedTarget };
