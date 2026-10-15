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
    create: { width: 2049, height: 1, channels: 4, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  await assert.rejects(prepareCanvasMedia(huge.toString('base64')), { status: 400 });
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
