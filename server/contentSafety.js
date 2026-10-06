// A deliberately limited text filter, not an image classifier or a safety guarantee.
const prohibited =
  /(?:^|[^\p{L}\p{N}])(?:porn(?:ography)?|xxx|nudes?|fuck(?:ing|er|s)?|shit|bitch(?:es)?|cunt|nigg(?:er|a)s?|fagg?ots?|kill yourself|heil hitler|كسمك|شرموطة|قحبة|اباحية|إباحية)(?:$|[^\p{L}\p{N}])/iu;
function normalized(value) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(
      /[013457@$]/g,
      (c) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' })[c],
    );
}
function assertSafeText(value) {
  if (typeof value === 'string' && prohibited.test(normalized(value))) {
    throw Object.assign(
      new Error('Please use language suitable for everyone. See Community Rules.'),
      { status: 422 },
    );
  }
}
const publicFields = new Set([
  'name',
  'displayName',
  'creatorName',
  'author',
  'description',
  'text',
  'body',
]);
function inspectPublicText(value, depth = 0) {
  if (!value || typeof value !== 'object') return;
  if (depth > 20) throw Object.assign(new Error('Content is nested too deeply.'), { status: 422 });
  for (const [key, item] of Object.entries(value)) {
    if (publicFields.has(key)) assertSafeText(item);
    if (item && typeof item === 'object') inspectPublicText(item, depth + 1);
  }
}
function textSafetyMiddleware(req, res, next) {
  try {
    inspectPublicText(req.body);
    next();
  } catch (error) {
    res
      .status(error.status || 422)
      .json({ error: { code: 'CONTENT_BLOCKED', message: error.message } });
  }
}
module.exports = { assertSafeText, inspectPublicText, textSafetyMiddleware };
