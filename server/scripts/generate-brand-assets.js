// Original geometric artwork; reproducible without an image service.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const target = path.resolve(__dirname, '../../client/public/icons');
async function main() {
  fs.mkdirSync(target, { recursive: true });
  const mark =
    '<path d="M256 130 382 202 256 276 130 202Z" fill="#b7a0fa"/><path d="m130 230 126 74 126-74v45l-126 74-126-74Z" fill="#22d3ee"/><path d="m130 303 126 74 126-74v30l-126 74-126-74Z" fill="#6d4dba"/>';
  for (const size of [192, 512]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#03060a"/>${mark}</svg>`;
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(path.join(target, `icon-${size}.png`));
  }
  const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g"><stop stop-color="#17132d"/><stop offset="1" stop-color="#03060a"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><g transform="translate(690,45)">${mark}</g><text x="80" y="200" fill="#22d3ee" font-family="sans-serif" font-size="18" letter-spacing="5">A WORLD BUILT BY EVERYONE</text><text x="80" y="300" fill="#ffffff" font-family="sans-serif" font-weight="bold" font-size="64">FORGOTTEN</text><text x="80" y="375" fill="#b7a0fa" font-family="sans-serif" font-weight="bold" font-size="64">NETWORK</text><text x="80" y="470" fill="#b4acc7" font-family="sans-serif" font-size="26">Your mark. Forever.</text></svg>`;
  await sharp(Buffer.from(social)).png().toFile(path.join(target, 'social.png'));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
