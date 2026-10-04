const sharp = require('sharp');
const crypto = require('node:crypto');

const TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const MAX_BYTES = 8 * 1024 * 1024;
let active = 0;

async function processMedia(body) {
  const match =
    typeof body?.data === 'string' &&
    body.data.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[1] !== body.type) throw new Error('Unsupported image format');
  const input = Buffer.from(match[2], 'base64');
  if (!input.length || input.length > MAX_BYTES || input.toString('base64') !== match[2])
    throw new Error('Invalid or oversized image');
  if (active >= 2) {
    const error = new Error('Image processing is busy. Please retry.');
    error.status = 503;
    throw error;
  }
  active++;
  try {
    const options = { animated: true, limitInputPixels: 512 * 512 * 120, failOn: 'warning' };
    const metadata = await sharp(input, options).metadata();
    const frames = metadata.pages || 1;
    const height = metadata.pageHeight || metadata.height;
    const delays = (metadata.delay || []).map((ms) => Math.max(20, ms));
    if (
      TYPES[metadata.format] !== body.type ||
      metadata.width > 512 ||
      height > 512 ||
      frames > 120 ||
      delays.reduce((sum, ms) => sum + ms, 0) > 12000
    )
      throw new Error('Images must be at most 512×512, 120 frames and 12 seconds');
    const pipeline = sharp(input, options).timeout({ seconds: 8 });
    const data =
      frames > 1 || metadata.format === 'gif'
        ? await pipeline.gif({ delay: delays.length ? delays : undefined }).toBuffer()
        : await pipeline.png().toBuffer();
    if (data.length > MAX_BYTES) throw new Error('Processed image exceeds 8 MB');
    const type = frames > 1 || metadata.format === 'gif' ? 'image/gif' : 'image/png';
    return {
      data,
      type,
      byteSize: data.length,
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
    };
  } finally {
    active--;
  }
}

function mediaValidation(req, res, next) {
  processMedia(req.body)
    .then((media) => {
      req.processedMedia = media;
      next();
    })
    .catch((error) => {
      res.status(error.status || 422).json({
        error: {
          code: error.status ? 'BUSY' : 'UNSUPPORTED_MEDIA',
          message: error.status
            ? error.message
            : 'Use a valid PNG, JPEG, WebP or GIF up to 8 MB, 512×512 pixels, 120 frames and 12 seconds.',
        },
      });
    });
}

module.exports = { processMedia, mediaValidation };
