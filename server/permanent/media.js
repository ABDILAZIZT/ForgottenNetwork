const sharp = require('sharp');
const { fail } = require('./store');
let active = 0;

async function prepareCanvasMedia(data) {
  if (typeof data !== 'string' || data.length > 11200000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))
    throw fail('Choose a valid image under 8MB.');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw fail('Choose an image under 8MB.');
  if (active >= 2) throw fail('Image processing is busy. Please try again shortly.', 503);
  active++;
  try {
    const input = sharp(bytes, {
      animated: true,
      limitInputPixels: 16777216,
      failOn: 'warning',
    }).timeout({ seconds: 12 });
    const meta = await input.metadata();
    const frames = meta.pages || 1,
      height = meta.pageHeight || meta.height;
    if (
      !['png', 'jpeg', 'webp', 'gif'].includes(meta.format) ||
      !meta.width ||
      !height ||
      meta.width > 2048 ||
      height > 2048 ||
      frames > 120 ||
      meta.width * height * frames > 16777216
    )
      throw fail('Use an image up to 2048px, 120 frames, and 16 million decoded pixels.');
    const animated = frames > 1 || meta.format === 'gif';
    const processed = animated
      ? await input
          .gif({
            reuse: true,
            effort: 1,
            dither: 0,
            interFrameMaxError: 0,
            interPaletteMaxError: 0,
          })
          .toBuffer()
      : await input.png().toBuffer();
    if (processed.length > 8 * 1024 * 1024) throw fail('Processed image exceeds 8MB.');
    return {
      bytes: processed,
      mime: animated ? 'image/gif' : 'image/png',
      width: meta.width,
      height,
    };
  } catch (error) {
    if (error.status) throw error;
    throw fail(
      'This image could not be processed within 12 seconds. Try a smaller or shorter GIF.',
      400,
    );
  } finally {
    active--;
  }
}
module.exports = { prepareCanvasMedia };
