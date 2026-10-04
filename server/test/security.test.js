const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sharp = require('sharp');
const { processMedia } = require('../media');
const { originProtection, securityHeaders, rateLimit } = require('../security');
const { postgresEnvironment, restore } = require('../operations');
const { sanitizeReturnTo } = require('../auth');

test('security headers and origin checks allow same-origin writes, reject cross-site cookies', async () => {
  const app = express();
  securityHeaders(app);
  app.use(originProtection(['https://world.example']));
  app.use(rateLimit({ scope: 'security-test', limit: 20 }));
  app.all('/', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const read = await fetch(base);
    assert.equal(read.headers.get('x-content-type-options'), 'nosniff');
    assert.match(read.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(read.headers.get('x-powered-by'), null);
    assert.equal(
      (
        await fetch(base, {
          method: 'POST',
          headers: { Origin: 'https://world.example', Cookie: 'fn.sid=test' },
        })
      ).status,
      200,
    );
    assert.equal(
      (await fetch(base, { method: 'POST', headers: { Cookie: 'fn.sid=test' } })).status,
      403,
    );
    assert.equal(
      (await fetch(base, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status,
      403,
    );
    assert.equal(
      (await fetch(base, { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status,
      403,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('media decoder rejects forged MIME, unsupported, malformed and oversized dimensions', async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#00ffcc' } })
    .png()
    .toBuffer();
  const body = { type: 'image/png', data: `data:image/png;base64,${png.toString('base64')}` };
  assert.equal((await processMedia(body)).type, 'image/png');
  await assert.rejects(
    processMedia({ type: 'image/jpeg', data: `data:image/jpeg;base64,${png.toString('base64')}` }),
  );
  await assert.rejects(
    processMedia({ type: 'image/svg+xml', data: 'data:image/svg+xml;base64,PHN2Zy8+' }),
  );
  await assert.rejects(processMedia({ type: 'image/png', data: 'data:image/png;base64,YWJjZA==' }));
  const wide = await sharp({
    create: { width: 513, height: 1, channels: 4, background: '#00ffcc' },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    processMedia({ ...body, data: `data:image/png;base64,${wide.toString('base64')}` }),
  );
  const frames = await sharp(Buffer.alloc(4 * 121), {
    raw: { width: 1, height: 121, channels: 4, pageHeight: 1 },
  })
    .gif({ delay: Array(121).fill(100) })
    .toBuffer();
  await assert.rejects(
    processMedia({ type: 'image/gif', data: `data:image/gif;base64,${frames.toString('base64')}` }),
  );
});
test('backup credentials avoid arguments and restore requires explicit confirmation', async () => {
  const env = postgresEnvironment('postgresql://tester:p%40ss@localhost:5432/world_test', {
    DATABASE_SSL: 'false',
  });
  assert.equal(env.PGPASSWORD, 'p@ss');
  assert.equal(env.PGDATABASE, 'world_test');
  assert.equal(env.PGSSLMODE, 'disable');
  await assert.rejects(
    restore('postgresql://localhost/world_test', 'missing.dump', false),
    /confirm-empty-target/,
  );
  assert.equal(sanitizeReturnTo('/\\evil.example'), '/');
  assert.equal(sanitizeReturnTo('/\nevil.example'), '/');
});
