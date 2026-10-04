const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker() {
  const listeners = {};
  const additions = [];
  const shell = {
    text: async () =>
      '<script src="/assets/main-test.js"></script><link href="/assets/main-test.css">',
  };
  const cache = { addAll: async (items) => additions.push(...items), match: async () => shell };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../client/public/sw.js'), 'utf8'), {
    URL,
    self: {
      location: { origin: 'https://example.test' },
      addEventListener: (name, handler) => {
        listeners[name] = handler;
      },
    },
    caches: { open: async () => cache, match: async () => shell },
    fetch: async () => {
      throw new Error('Offline');
    },
  });
  return { listeners, additions, shell };
}

test('PWA install stores the shell and its built JavaScript and CSS', async () => {
  const { listeners, additions } = worker();
  let pending;
  listeners.install({
    waitUntil: (promise) => {
      pending = promise;
    },
  });
  await pending;
  assert.ok(additions.includes('/'));
  assert.ok(additions.includes('/assets/main-test.js'));
  assert.ok(additions.includes('/assets/main-test.css'));
});

test('PWA never intercepts APIs, uploads, external requests or writes', () => {
  const { listeners } = worker();
  for (const [url, method] of [
    ['/api/v1/world', 'GET'],
    ['/api/canvas/assets/a', 'GET'],
    ['/uploads/private', 'GET'],
    ['https://external.test/a', 'GET'],
    ['/', 'POST'],
  ]) {
    let intercepted = false;
    listeners.fetch({
      request: { url: new URL(url, 'https://example.test').href, method },
      respondWith: () => {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false, url);
  }
});

test('offline navigation with coordinates and mode falls back to the cached shell', async () => {
  const { listeners, shell } = worker();
  let response;
  listeners.fetch({
    request: { url: 'https://example.test/?mode=classic&x=120', method: 'GET', mode: 'navigate' },
    respondWith: (promise) => {
      response = promise;
    },
  });
  assert.equal(await response, shell);
});
