const sharp = require('sharp');
const fs = require('node:fs/promises');
(async () => {
  const icon = await fs.readFile('public/inningwise.svg');
  for (const size of [180, 192, 512]) {
    await sharp(icon).resize(size, size).png().toFile(`public/inningwise-${size === 180 ? 'apple' : size}.png`);
  }
  await fs.copyFile('public/inningwise-apple.png', 'public/coach/apple-touch-icon.png');
  const social = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#1b4d3e"/><path d="M1000 80 1170 250 1000 420 830 250Z" fill="none" stroke="#f3bc77" stroke-width="8" opacity=".35"/><text x="80" y="200" font-family="sans-serif" font-size="80" font-weight="900" fill="white">InningWise</text><text x="80" y="310" font-family="sans-serif" font-size="48" font-weight="700" fill="#f3bc77">Smarter players.</text><text x="80" y="375" font-family="sans-serif" font-size="48" font-weight="700" fill="#f3bc77">Stronger teams.</text><text x="80" y="520" font-family="sans-serif" font-size="27" fill="white">TRAINING · TEAM MANAGEMENT · LIVE SCORING</text></svg>`);
  await sharp(social).png().toFile('public/inningwise-social.png');
})().catch(error => { console.error(error); process.exitCode = 1; });
