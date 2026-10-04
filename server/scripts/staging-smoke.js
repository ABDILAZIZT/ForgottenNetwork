// Read-only: never creates accounts, publishes content, or exposes credentials.
async function main() {
  const target = new URL(process.argv[2] || 'http://127.0.0.1:3001');
  if (
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    !['http:', 'https:'].includes(target.protocol)
  )
    throw new Error('Provide a website origin without credentials or a path.');
  for (const route of [
    '/',
    '/api/v1/health/ready',
    '/api/v1/auth/config',
    '/api/v1/worlds/00000000-0000-4000-8000-000000000001/entities',
  ]) {
    const response = await fetch(new URL(route, target), {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
    if (route.includes('ready') && (await response.json()).storage !== 'postgresql')
      throw new Error('Staging must use PostgreSQL.');
    if (route === '/' && !response.headers.get('content-type')?.includes('text/html'))
      throw new Error('Frontend not served.');
    console.log(`PASS ${route}`);
  }
  console.log(
    'Read-only smoke passed. OIDC, member publishing, storage and recovery still require the staging checklist.',
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
