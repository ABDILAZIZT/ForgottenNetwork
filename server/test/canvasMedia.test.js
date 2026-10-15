const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { prepareCanvasMedia } = require('../permanent/media');
const { CanvasStore } = require('../permanent/store');

test('GIF upload keeps resolution, frame timing, and lossless palette colours', async () => {
  const pixels = Buffer.alloc(8 * 16 * 4);
  for (let i = 0; i < 8 * 16; i++) {
    pixels[i * 4 + (i < 64 ? 0 : 2)] = 255;
    pixels[i * 4 + 3] = 255;
  }
  const original = await sharp(pixels, {
    raw: { width: 8, height: 16, channels: 4, pageHeight: 8 },
  })
    .gif({ delay: [100, 200], loop: 0 })
    .toBuffer();
  const processed = await prepareCanvasMedia(original.toString('base64'));
  assert.equal(processed.mime, 'image/gif');
  assert.equal(processed.width, 8);
  assert.equal(processed.height, 8);
  const metadata = await sharp(processed.bytes, { animated: true }).metadata();
  assert.equal(metadata.pages, 2);
  assert.deepEqual(metadata.delay, [100, 200]);
  const decoded = await sharp(processed.bytes, { animated: true }).ensureAlpha().raw().toBuffer();
  assert.deepEqual(decoded, pixels);
});
test('upload validation rejects invalid input before processing', async () => {
  await assert.rejects(prepareCanvasMedia('not base64!'), { status: 400 });
  const huge = await sharp({
    create: { width: 4096, height: 1024, channels: 4, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  const resized = await prepareCanvasMedia(huge.toString('base64'));
  assert.equal(resized.width, 2048);
  assert.equal(resized.height, 512);
});
test('upload library exposes only the owners media and distinguishes review status', (t) => {
  const store = new CanvasStore(':memory:', { seed: false });
  t.after(() => store.close());
  const alice = store.register({ name: 'Alice', color: '#ffffff' });
  const bob = store.register({ name: 'Bob', color: '#ffffff' });
  const pending = store.addAsset(alice.user, Buffer.from('bytes'), 'image/gif', 8, 8, {
    pendingReview: true,
  });
  const approved = store.addAsset(alice.user, Buffer.from('bytes'), 'image/png', 8, 8);
  assert.equal(store.asset(pending.id), undefined);
  assert.deepEqual(store.listAssets(bob.user), []);
  const assets = store.listAssets(alice.user);
  assert.equal(assets.find((a) => a.id === pending.id).moderationState, 'pending');
  assert.equal(assets.find((a) => a.id === approved.id).moderationState, 'approved');
  assert.ok(assets.every((a) => !('bytes' in a) && !('owner_id' in a)));
});

test('private PNG and GIF uploads publish only after a successful owner placement', async (t) => {
  const { randomUUID } = require('node:crypto');
  const store = new CanvasStore(':memory:', { seed: false });
  t.after(() => store.close());
  const alice = store.register({ name: 'Alice', color: '#ffffff' });
  const bob = store.register({ name: 'Bob', color: '#ffffff' });
  const mark = (assetId, x = 0) => ({
    id: randomUUID(),
    type: 'image',
    x,
    y: 0,
    width: 8,
    height: 8,
    content: { color: '#ffffff', size: 1, opacity: 1, assetId },
  });
  const occupied = { ...mark(undefined), type: 'rectangle' };
  store.place(occupied, bob.user);
  for (const [index, mime] of ['image/png', 'image/gif'].entries()) {
    const asset = store.addAsset(alice.user, Buffer.from('fixture'), mime, 8, 8, { draft: true });
    assert.equal(store.asset(asset.id), undefined);
    assert.equal(store.ownedAsset(asset.id, bob.user), undefined);
    assert.ok(store.ownedAsset(asset.id, alice.user));
    assert.throws(() => store.place(mark(asset.id, 40), bob.user), { status: 403 });
    assert.throws(() => store.place(mark(asset.id), alice.user), { status: 409 });
    assert.equal(store.asset(asset.id), undefined, 'failed placement must keep the upload private');
    const result = store.place(mark(asset.id, 80 + index * 16), alice.user);
    assert.equal(result.element.content.animated, mime === 'image/gif');
    assert.ok(store.asset(asset.id));
    assert.equal(
      store.listAssets(alice.user).find((a) => a.id === asset.id).moderationState,
      'approved',
    );
  }
  const legacy = store.addAsset(alice.user, Buffer.from('fixture'), 'image/png', 8, 8, {
    pendingReview: true,
  });
  store.place(mark(legacy.id, 160), alice.user);
  assert.ok(store.asset(legacy.id), 'owner can explicitly publish an earlier pending upload');
  const hidden = store.addAsset(alice.user, Buffer.from('fixture'), 'image/png', 8, 8, {
    draft: true,
  });
  store.db
    .prepare('INSERT INTO canvas_hidden_media VALUES(?,?,?)')
    .run(hidden.id, 'moderator', new Date().toISOString());
  assert.equal(store.ownedAsset(hidden.id, alice.user), undefined);
  assert.throws(() => store.place(mark(hidden.id, 240), alice.user), { status: 403 });
  assert.throws(() => store.setAvatar(alice.user, hidden.id), { status: 400 });
  assert.equal(store.asset(hidden.id), undefined);
});
