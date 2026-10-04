const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { serveFrontend } = require('../frontend');

test('frontend serving preserves API and missing asset errors and supports page navigation', async () => {
  const app = express();
  // Source HTML is sufficient to test routing without requiring generated build artifacts.
  serveFrontend(app, path.resolve(__dirname, '../../client'));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(`${base}/world/commons`, { headers: { accept: 'text/html' } });
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.equal(page.headers.get('cache-control'), 'no-cache');
    const api = await fetch(`${base}/api/v1/missing`);
    assert.equal(api.status, 404);
    assert.match(api.headers.get('content-type'), /application\/json/);
    assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
