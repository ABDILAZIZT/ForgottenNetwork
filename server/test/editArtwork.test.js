const test = require('node:test'),
  assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { CanvasStore, normalizeElement } = require('../permanent/store');
const express = require('express');
const { createPermanentCanvas } = require('../permanent/api');
const mark = (x) => ({
  id: randomUUID(),
  type: 'rectangle',
  x,
  y: 10000,
  width: 16,
  height: 16,
  content: { color: '#ffffff', size: 4, opacity: 1 },
});
test('image rotation and shape styles survive server normalization; invalid rotations reject', () => {
  const image = {
    ...mark(0),
    type: 'image',
    content: { color: '#ffffff', size: 1, opacity: 1, assetId: 'asset-123', rotation: 45 },
  };
  assert.equal(normalizeElement(image).content.rotation, 45);
  assert.throws(() =>
    normalizeElement({ ...image, content: { ...image.content, rotation: Infinity } }),
  );
  const shape = {
    ...mark(0),
    content: { color: '#ffffff', size: 12, opacity: 0.5, fill: false, strokeColor: '#112233' },
  };
  assert.deepEqual(normalizeElement(shape).content, shape.content);
});

test('edit HTTP API requires authentication and owner; new revision is authoritative in a fresh read', async (t) => {
  const app = express();
  app.use(express.json());
  const canvas = createPermanentCanvas({ filename: ':memory:', origins: ['http://canvas.test'] });
  app.use('/api/canvas', canvas.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const close = canvas.attach(server);
  t.after(async () => {
    close();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = 'http://127.0.0.1:' + server.address().port + '/api/canvas';
  const request = async (path, token, body) => {
    const res = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json() };
  };
  const a = (await request('/identity', null, { name: 'Alice', color: '#ffffff' })).data;
  const b = (await request('/identity', null, { name: 'Bobby', color: '#ffffff' })).data;
  const original = (await request('/elements', a.token, mark(15000))).data.element;
  const input = { originalId: original.id, version: original.zIndex, element: mark(15000) };
  assert.equal((await request('/elements/edit', null, input)).status, 401);
  assert.equal((await request('/elements/edit', b.token, input)).status, 403);
  const edited = await request('/elements/edit', a.token, input);
  assert.equal(edited.status, 200);
  assert.equal(edited.data.element.ownerId, a.user.id);
  assert.deepEqual((await request('/elements/edit', a.token, input)).data, edited.data);
  assert.equal(
    (
      await request('/elements/remove', b.token, {
        id: randomUUID(),
        targets: [{ id: edited.data.element.id, version: edited.data.element.zIndex }],
      })
    ).status,
    403,
  );
  assert.equal(
    (await request('/elements/' + edited.data.element.id)).data.id,
    edited.data.element.id,
  );
});
test('owner edits are atomic, reject foreign targets and conflicts, and replay without new history', () => {
  const store = new CanvasStore(':memory:', { seed: false });
  try {
    const a = store.register({ name: 'Alice', color: '#ffffff' }).user,
      b = store.register({ name: 'Bobby', color: '#ffffff' }).user;
    const art = store.place(mark(10000), a).element;
    store.place(mark(11000), b);
    assert.throws(
      () => store.replace({ originalId: art.id, version: art.zIndex, element: mark(12000) }, b),
      { status: 403 },
    );
    assert.throws(
      () => store.replace({ originalId: art.id, version: art.zIndex, element: mark(11000) }, a),
      { status: 409 },
    );
    assert.ok(store.element(art.id));
    const input = { originalId: art.id, version: art.zIndex, element: mark(12000) };
    const edit = store.replace(input, a);
    assert.equal(store.element(art.id), null);
    assert.equal(edit.element.ownerId, a.id);
    assert.deepEqual(store.replace(input, a), edit);
    assert.throws(() => store.replace({ ...input, element: mark(13000) }, a), { status: 409 });
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM canvas_elements').get().n, 3);
    store.remove(
      { id: randomUUID(), targets: [{ id: edit.element.id, version: edit.element.zIndex }] },
      a,
    );
    assert.throws(() => store.replace(input, a), { status: 410 });
  } finally {
    store.close();
  }
});
