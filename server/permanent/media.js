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
      limitInputPixels: 33554432,
      failOn: 'warning',
    }).timeout({ seconds: 12 });
    const meta = await input.metadata();
    const frames = meta.pages || 1,
      height = meta.pageHeight || meta.height;
    const animated = frames > 1 || meta.format === 'gif';
    if (
      !['png', 'jpeg', 'webp', 'gif'].includes(meta.format) ||
      !meta.width ||
      !height ||
      frames > 120 ||
      (animated && (meta.width > 2048 || height > 2048 || meta.width * height * frames > 16777216))
    )
      throw fail('Use an image up to 2048px, 120 frames, and 16 million decoded pixels.');
    const output = animated
      ? await input
          .gif({
            reuse: true,
            effort: 1,
            dither: 0,
            interFrameMaxError: 0,
            interPaletteMaxError: 0,
          })
          .toBuffer({ resolveWithObject: true })
      : await input
          .rotate()
          .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer({ resolveWithObject: true });
    const processed = output.data;
    if (processed.length > 8 * 1024 * 1024) throw fail('Processed image exceeds 8MB.');
    return {
      bytes: processed,
      mime: animated ? 'image/gif' : 'image/png',
      width: output.info.width,
      height: animated ? height : output.info.height,
    };
  } catch (error) {
    if (error.status) throw error;
    throw fail(
      /timeout|timed out/i.test(error.message)
        ? 'This image took too long to process. Try a smaller or shorter GIF.'
        : /pixel limit/i.test(error.message)
          ? 'This image is too large to decode. Choose an image under 32 megapixels.'
          : 'This file could not be read. Use a valid PNG, JPG, WebP or GIF.',
      400,
    );
  } finally {
    active--;
  }
}
module.exports = { prepareCanvasMedia };
