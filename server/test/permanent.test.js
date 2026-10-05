const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const express = require('express');
const sharp = require('sharp');
const { WebSocket } = require('ws');
const { CanvasStore, normalizeElement } = require('../permanent/store');
const { createPermanentCanvas } = require('../permanent/api');
const { backupCanvas } = require('../permanent/backup');

const mark = (overrides = {}) => ({
  id: randomUUID(),
  type: 'rectangle',
  x: 10000,
  y: 10000,
  width: 16,
  height: 16,
  content: { color: '#22d3ee', opacity: 1, size: 4 },
  ...overrides,
});
function fixture(t) {
  const store = new CanvasStore(':memory:', { seed: false });
  t.after(() => store.close());
  const alice = store.register({ name: 'Alice', color: '#22d3ee' });
  const bob = store.register({ name: 'Bob', color: '#fb7185' });
  return { store, alice, bob };
}

test('canvas identity secrets are hashed; client ownership fields cannot forge attribution', (t) => {
  const { store, alice, bob } = fixture(t);
  assert.equal(store.authenticate(alice.token).id, alice.user.id);
  assert.equal(store.authenticate('x'.repeat(64)), null);
  const row = store.db.prepare('SELECT token_hash FROM canvas_users WHERE id=?').get(alice.user.id);
  assert.notEqual(row.token_hash, alice.token);
  const result = store.place(mark({ ownerId: bob.user.id, ownerName: 'Forged' }), alice.user);
  assert.equal(result.element.ownerId, alice.user.id);
  assert.equal(result.element.ownerName, 'Alice');
  assert.equal(result.element.ownerColor, '#22d3ee');
});

test('colliding shapes reject other identities while allowing owner overlays', (t) => {
  const { store, alice, bob } = fixture(t);
  const first = store.place(mark(), alice.user).element;
  for (const user of [bob.user]) {
    assert.throws(
      () => store.place(mark({ x: 10008 }), user),
      (e) => e.status === 409 && e.blocked[0].ownerName === 'Alice',
    );
  }
  assert.equal(store.stats().artworks, 1);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM pixel_ownership').get().n, 4);
  assert.deepEqual(store.element(first.id), first);
  store.place(mark({ x: 10008 }), alice.user);
  assert.equal(store.stats().pixels, 384);
});

test('freehand clips occupied cells and commits only free cells', (t) => {
  const { store, alice, bob } = fixture(t);
  const first = store.place(mark(), alice.user).element;
  const stroke = mark({
    type: 'brush',
    x: 9984,
    y: 10000,
    width: 56,
    height: 16,
    content: {
      color: '#fb7185',
      opacity: 1,
      size: 4,
      points: [
        [9988, 10008],
        [10036, 10008],
      ],
    },
  });
  const result = store.place(stroke, bob.user);
  assert.ok(result.blocked.length > 0);
  assert.ok(result.element.cells.length > 0);
  const original = new Set(first.cells.map((c) => c.join(',')));
  assert.ok(result.element.cells.every((c) => !original.has(c.join(','))));
  assert.deepEqual(store.element(first.id), first);
});

test('idempotent replays return the original record and cannot transfer ownership', (t) => {
  const { store, alice, bob } = fixture(t);
  const input = mark();
  const first = store.place(input, alice.user);
  const replay = store.place({ ...input, x: 10200 }, alice.user);
  assert.equal(replay.duplicate, true);
  assert.deepEqual(replay.element, first.element);
  assert.throws(
    () => store.place(input, bob.user),
    (e) => e.status === 409,
  );
  assert.equal(store.stats().artworks, 1);
});

test('database triggers prevent mutation or deletion of artwork, ownership, and media', (t) => {
  const { store, alice } = fixture(t);
  store.place(mark(), alice.user);
  store.addAsset(alice.user, Buffer.from('test'), 'image/png', 1, 1);
  for (const table of ['canvas_elements', 'canvas_assets']) {
    assert.throws(() => store.db.exec('DELETE FROM ' + table), /permanent/);
    assert.throws(() => store.db.exec('UPDATE ' + table + ' SET owner_id=owner_id'), /permanent/);
  }
});

test('accepted records, assets, identity, reactions, and chat survive database reopen', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'permanent-reopen-'));
  const filename = path.join(directory, 'world.sqlite');
  let store = new CanvasStore(filename, { seed: false });
  try {
    const alice = store.register({ name: 'Alice', color: '#22d3ee' });
    const bob = store.register({ name: 'Bob', color: '#fb7185' });
    const artwork = store.place(mark(), alice.user).element;
    const asset = store.addAsset(alice.user, Buffer.from('media'), 'image/gif', 2, 2);
    store.react(bob.user, artwork.id, 'heart');
    store.chat(bob.user, 'This stays.');
    const backupPath = path.join(directory, 'backup.sqlite');
    assert.equal(backupCanvas(filename, backupPath).artworks, 1);
    const restored = new CanvasStore(backupPath, { seed: false });
    assert.deepEqual(restored.element(artwork.id), artwork);
    restored.close();
    store.close();
    store = new CanvasStore(filename, { seed: false });
    assert.equal(store.authenticate(alice.token).id, alice.user.id);
    assert.deepEqual(store.element(artwork.id), artwork);
    assert.equal(Buffer.from(store.asset(asset.id).bytes).toString(), 'media');
    assert.equal(store.notifications(alice.user)[0].name, 'Bob');
    assert.equal(store.messages()[0].body, 'This stays.');
    assert.throws(
      () => store.place(mark(), bob.user),
      (e) => e.status === 409,
    );
  } finally {
    store.close();
    // Only remove this test's freshly created temporary directory.
    rmSync(directory, { recursive: true, force: true });
  }
});

test('assets cannot be borrowed from another identity and GIF animation survives placement', (t) => {
  const { store, alice, bob } = fixture(t);
  const asset = store.addAsset(alice.user, Buffer.from('gif'), 'image/gif', 16, 16);
  const input = mark({
    type: 'image',
    content: { color: '#22d3ee', size: 1, opacity: 1, assetId: asset.id, animated: false },
  });
  assert.throws(
    () => store.place(input, bob.user),
    (e) => e.status === 403,
  );
  assert.equal(store.place(input, alice.user).element.content.animated, true);
});

test('visible bounds paginate without dropping records and exclude distant art', (t) => {
  const { store, alice } = fixture(t);
  for (let i = 0; i < 402; i++)
    store.place(mark({ x: i * 8, y: 0, width: 8, height: 8 }), alice.user);
  const first = store.load({ x: 0, y: 0, width: 4000, height: 100 });
  assert.equal(first.elements.length, 400);
  const second = store.load({ x: 0, y: 0, width: 4000, height: 100, after: first.next });
  assert.equal(second.elements.length, 2);
  assert.equal(second.next, null);
  assert.equal(store.load({ x: 9000, y: 9000, width: 100, height: 100 }).elements.length, 0);
});

test('daily challenge, connected territory, and reaction uniqueness are derived from saved cells', (t) => {
  const { store, alice, bob } = fixture(t);
  const zone = store.challenge();
  const art = store.place(
    mark({ x: zone.x, y: zone.y, width: 40, height: 40 }),
    alice.user,
  ).element;
  const profile = store.profile(alice.user.id);
  assert.equal(profile.challengeDone, true);
  assert.equal(profile.xp, 110);
  assert.equal(profile.largestArea, 1600);
  assert.ok(profile.badges.includes('Territory King'));
  assert.ok(profile.badges.includes('1000 Pixels'));
  assert.equal(store.react(bob.user, art.id, 'star').changed, true);
  assert.equal(store.react(bob.user, art.id, 'star').changed, false);
  assert.equal(store.reactions(art.id)[0].count, 1);
});

test('validation rejects nonfinite bounds, invalid fonts and unsupported content safely', () => {
  assert.throws(() => normalizeElement(mark({ x: NaN })));
  assert.throws(() => normalizeElement(mark({ width: 513 })));
  assert.throws(() => normalizeElement(mark({ type: 'script' })));
  assert.throws(() =>
    normalizeElement(
      mark({ type: 'brush', content: { color: '#ffffff', size: 2, opacity: 1, points: [[0, 0]] } }),
    ),
  );
  const e = normalizeElement(
    mark({
      type: 'text',
      content: { color: '#ffffff', size: 16, opacity: 1, text: '<script>', font: 'external-font' },
    }),
  );
  assert.equal(e.content.font, 'Space Grotesk');
  assert.equal(e.content.text, '<script>');
});

function nextMessage(ws, type, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('Missing socket event ' + type));
    }, 3000);
    const handler = (raw) => {
      const event = JSON.parse(raw);
      if (event.type === type && predicate(event.data)) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(event.data);
      }
    };
    ws.on('message', handler);
  });
}

test('HTTP and WebSocket integration: concurrent claims, presence, live art, chat, reactions and uploads', async (t) => {
  const app = express();
  app.use(express.json({ limit: '12mb' }));
  const canvas = createPermanentCanvas({ filename: ':memory:', origins: ['http://canvas.test'] });
  app.use('/api/canvas', canvas.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const close = canvas.attach(server);
  t.after(async () => {
    close();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (route, token, body) => {
    const response = await fetch(base + '/api/canvas' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const alice = (await request('/identity', null, { name: 'Alice', color: '#22d3ee' })).body;
  const bob = (await request('/identity', null, { name: 'Bob', color: '#fb7185' })).body;
  assert.equal((await request('/elements', null, mark())).status, 401);
  const a = new WebSocket(base.replace('http:', 'ws:') + '/api/canvas/live', {
    origin: 'http://canvas.test',
  });
  const b = new WebSocket(base.replace('http:', 'ws:') + '/api/canvas/live', {
    origin: 'http://canvas.test',
  });
  await Promise.all([a, b].map((ws) => new Promise((resolve) => ws.once('open', resolve))));
  let ready = nextMessage(a, 'ready');
  a.send(JSON.stringify({ type: 'user:join', data: { token: alice.token } }));
  await ready;
  const presence = nextMessage(a, 'presence', (people) => people.some((p) => p.name === 'Bob'));
  ready = nextMessage(b, 'ready');
  b.send(JSON.stringify({ type: 'user:join', data: { token: bob.token } }));
  await ready;
  assert.ok((await presence).some((p) => p.name === 'Bob'));
  const cursor = nextMessage(b, 'cursor:move');
  a.send(
    JSON.stringify({
      type: 'cursor:move',
      data: { x: 10001, y: 10002, drawing: true, name: 'Forged' },
    }),
  );
  assert.equal((await cursor).name, 'Alice');
  const preview = nextMessage(b, 'draw:update');
  a.send(
    JSON.stringify({
      type: 'draw:update',
      data: {
        element: mark({
          type: 'brush',
          content: {
            color: '#22d3ee',
            size: 2,
            opacity: 1,
            points: [
              [10004, 10004],
              [10012, 10012],
            ],
          },
        }),
        name: 'Forged',
      },
    }),
  );
  assert.equal((await preview).name, 'Alice');
  const end = nextMessage(b, 'draw:commit');
  a.send(JSON.stringify({ type: 'draw:commit', data: {} }));
  await end;
  const live = nextMessage(b, 'element:place');
  const claims = await Promise.all([
    request('/elements', alice.token, mark()),
    request('/elements', bob.token, mark()),
  ]);
  assert.deepEqual(claims.map((c) => c.status).sort(), [201, 409]);
  const accepted = claims.find((c) => c.status === 201).body.element;
  assert.equal((await live).id, accepted.id);
  const msg = nextMessage(a, 'chat:message');
  await request('/chat', bob.token, { body: 'Hello, permanent world.' });
  assert.equal((await msg).name, 'Bob');
  const reaction = nextMessage(a, 'reaction');
  await request('/elements/' + accepted.id + '/reactions', bob.token, { kind: 'heart' });
  assert.equal((await reaction).reactions[0].count, 1);
  const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#22d3ee' } })
    .png()
    .toBuffer();
  const uploaded = await request('/assets', alice.token, { data: png.toString('base64') });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.mime, 'image/png');
  const bytes = await fetch(base + uploaded.body.url);
  assert.equal(bytes.headers.get('content-type'), 'image/png');
  assert.equal((await sharp(Buffer.from(await bytes.arrayBuffer())).metadata()).width, 16);
  assert.equal(
    (await request('/assets', alice.token, { data: Buffer.from('<svg/>').toString('base64') }))
      .status,
    400,
  );
  assert.equal((await request('/avatar', alice.token, { assetId: uploaded.body.id })).status, 200);
  assert.equal((await request('/avatar', bob.token, { assetId: uploaded.body.id })).status, 400);
  assert.equal(
    (await fetch(base + '/api/canvas/elements/' + accepted.id, { method: 'DELETE' })).status,
    404,
  );
  assert.equal((await request('/elements/' + accepted.id)).body.id, accepted.id);
  const burst = await Promise.all(
    Array.from({ length: 22 }, (_, i) =>
      request('/elements', alice.token, mark({ x: 12000 + i * 24 })),
    ),
  );
  assert.ok(burst.some((r) => r.status === 429));
  const rejected = new WebSocket(base.replace('http:', 'ws:') + '/api/canvas/live', {
    origin: 'https://untrusted.test',
  });
  const reason = await new Promise((resolve) =>
    rejected.once('error', (error) => resolve(error.message)),
  );
  assert.match(reason, /403/);
});

test('owner removal is atomic, versioned, idempotent and releases only unoccupied cells', (t) => {
  const { store, alice, bob } = fixture(t);
  const a = store.place(mark(), alice.user).element;
  const overlay = store.place(mark(), alice.user).element;
  const other = store.place(mark({ x: 10100 }), bob.user).element;
  const request = { id: randomUUID(), targets: [{ id: a.id, version: a.zIndex }] };
  assert.throws(
    () => store.remove(request, bob.user),
    (e) => e.status === 403,
  );
  assert.throws(
    () => store.remove({ ...request, targets: [{ id: a.id, version: -1 }] }, alice.user),
    (e) => e.status === 409,
  );
  assert.throws(
    () =>
      store.remove(
        { ...request, targets: [...request.targets, { id: other.id, version: other.zIndex }] },
        alice.user,
      ),
    (e) => e.status === 403,
  );
  assert.ok(store.element(a.id));
  assert.deepEqual(store.remove(request, alice.user).removed, [a.id]);
  assert.deepEqual(store.remove(request, alice.user).removed, [a.id]);
  assert.equal(store.element(a.id), null);
  assert.ok(store.element(other.id));
  assert.equal(store.profile(alice.user.id).pixels, 256);
  assert.throws(
    () => store.place({ ...a }, alice.user),
    (e) => e.status === 410,
  );
  store.remove(
    { id: randomUUID(), targets: [{ id: overlay.id, version: overlay.zIndex }] },
    alice.user,
  );
  assert.equal(store.profile(alice.user.id).pixels, 0);
  assert.deepEqual(store.findFree(a.x, a.y, 16, 16), { x: a.x, y: a.y });
  assert.equal(store.load({ x: a.x, y: a.y, width: 16, height: 16 }).elements.length, 0);
  store.restore(a.id, alice.user);
  assert.equal(store.profile(alice.user.id).pixels, 256);
  store.remove({ id: randomUUID(), targets: [{ id: a.id, version: a.zIndex }] }, alice.user);
  store.place(mark(), bob.user);
  assert.throws(
    () => store.restore(a.id, alice.user),
    (e) => e.status === 409,
  );
});

test('direct HTTP owner deletion rejects a second identity and persists for other sessions', async (t) => {
  const app = express();
  app.use(express.json());
  const canvas = createPermanentCanvas({ filename: ':memory:' });
  app.use('/api/canvas', canvas.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const close = canvas.attach(server);
  t.after(async () => {
    close();
    await new Promise((r) => server.close(r));
  });
  const base = 'http://127.0.0.1:' + server.address().port + '/api/canvas';
  const req = async (path, token, body) => {
    const res = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (token || '') },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json() };
  };
  const a = (await req('/identity', null, { name: 'Alice', color: '#22d3ee' })).data;
  const b = (await req('/identity', null, { name: 'Bob', color: '#22d3ee' })).data;
  const art = (await req('/elements', a.token, mark())).data.element;
  const removal = { id: randomUUID(), targets: [{ id: art.id, version: art.zIndex }] };
  assert.equal((await req('/elements/remove', b.token, removal)).status, 403);
  assert.equal((await req('/elements/remove', null, removal)).status, 401);
  assert.equal((await req('/elements/remove', a.token, removal)).status, 200);
  assert.equal((await req('/elements/' + art.id, b.token)).status, 404);
  assert.equal((await req('/elements', b.token, mark())).status, 201);
});
