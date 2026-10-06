const test = require('node:test');
const assert = require('node:assert/strict');
const { assertSafeText, inspectPublicText } = require('../contentSafety');
const { CanvasStore, normalizeElement } = require('../permanent/store');
test('public text filter catches basic evasion without matching innocent substrings', () => {
  for (const text of ['ＦＵＣＫ', 'f\u200buck', 'sh1t', 'كسمك', 'kill yourself'])
    assert.throws(() => assertSafeText(text), { status: 422 });
  for (const text of ['A peaceful world', 'Scunthorpe', 'مرحبا بالعالم', 'classic'])
    assert.doesNotThrow(() => assertSafeText(text));
  assert.throws(() => inspectPublicText({ state: { layers: [{ name: 'porn' }] } }), {
    status: 422,
  });
  assert.doesNotThrow(() => inspectPublicText({ reason: 'Reported the word porn', data: 'porn' }));
});
test('permanent store enforces names, artwork text and chat independently of middleware', () => {
  const store = new CanvasStore(':memory:', { seed: false });
  try {
    assert.throws(() => store.register({ name: 'porn', color: '#ffffff' }), { status: 422 });
    const { user } = store.register({ name: 'Tester', color: '#ffffff' });
    assert.throws(() => store.chat(user, 'fuck'), { status: 422 });
    assert.throws(
      () =>
        normalizeElement({
          id: 'test-text-123',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 20,
          content: { color: '#ffffff', opacity: 1, size: 12, text: 'porn' },
        }),
      { status: 422 },
    );
    assert.equal(store.messages().length, 0);
  } finally {
    store.close();
  }
});
