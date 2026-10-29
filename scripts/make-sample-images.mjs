// Generates the bundled SAMPLE product images (simple illustrations) as WebP at
// 400/800/1200px into public/sample/. They are placeholders for the sample
// products only and get deleted with them before launch.
//   node scripts/make-sample-images.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const OUT = new URL('../public/sample/', import.meta.url);
const WIDTHS = [400, 800, 1200];

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#F3F5FA"/>
  <ellipse cx="600" cy="1010" rx="330" ry="34" fill="#0E1F5B" opacity=".07"/>
  ${body}
  <text x="60" y="1140" font-family="Helvetica, Arial, sans-serif" font-size="34" letter-spacing="6" fill="#8A93A6">SAMPLE IMAGE</text>
</svg>`;

const art = {
  'mini-rechargeable-desk-fan': `
    <rect x="560" y="700" width="80" height="250" rx="30" fill="#DDE3EE"/>
    <rect x="430" y="930" width="340" height="70" rx="35" fill="#E7ECF4"/>
    <circle cx="600" cy="480" r="290" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="18"/>
    ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="600" cy="340" rx="70" ry="140" fill="#9CC3E6" transform="rotate(${a} 600 480)"/>`).join('')}
    <circle cx="600" cy="480" r="60" fill="#1D3FAF"/>
    ${[...Array(12)].map((_, i) => `<line x1="600" y1="200" x2="600" y2="760" stroke="#C9D3E3" stroke-width="6" transform="rotate(${i * 15} 600 480)"/>`).join('')}`,
  'moon-night-light': `
    <defs><radialGradient id="g"><stop offset="0" stop-color="#FFF6DA"/><stop offset="1" stop-color="#F3F5FA" stop-opacity="0"/></radialGradient></defs>
    <circle cx="600" cy="520" r="430" fill="url(#g)"/>
    <circle cx="600" cy="520" r="290" fill="#FBF3DC"/>
    <circle cx="500" cy="440" r="55" fill="#EFE2BC"/><circle cx="690" cy="600" r="75" fill="#EFE2BC"/>
    <circle cx="700" cy="400" r="30" fill="#EFE2BC"/><circle cx="520" cy="650" r="35" fill="#EFE2BC"/>
    <rect x="420" y="860" width="360" height="110" rx="24" fill="#B98E62"/>`,
  'magnetic-phone-stand': `
    <path d="M420 960 L780 960 L700 560 L640 560 Z" fill="#C3CAD6"/>
    <rect x="470" y="250" width="300" height="560" rx="44" fill="#1C2333" transform="rotate(-12 620 530)"/>
    <rect x="492" y="280" width="256" height="500" rx="30" fill="#3A63D8" transform="rotate(-12 620 530)"/>
    <rect x="400" y="940" width="400" height="40" rx="20" fill="#AEB7C6"/>`,
  'gift-box-starter-set': `
    <rect x="330" y="520" width="540" height="430" rx="20" fill="#1D3FAF"/>
    <rect x="300" y="430" width="600" height="130" rx="20" fill="#2A4FC9"/>
    <rect x="565" y="430" width="70" height="520" fill="#F2D27A"/>
    <path d="M600 430 C 470 270, 360 360, 470 430 Z" fill="#F2D27A"/>
    <path d="M600 430 C 730 270, 840 360, 730 430 Z" fill="#F2D27A"/>`,
  'scented-candle-duo': `
    ${[[420, '#E8DCCB'], [760, '#D7E3EF']].map(([x, c]) => `
      <rect x="${x - 150}" y="560" width="300" height="390" rx="36" fill="${c}"/>
      <rect x="${x - 150}" y="680" width="300" height="140" fill="#FFFFFF" opacity=".75"/>
      <rect x="${x - 6}" y="500" width="12" height="70" fill="#4B4B4B"/>
      <path d="M${x} 400 C ${x + 50} 460, ${x + 30} 510, ${x} 510 C ${x - 30} 510, ${x - 50} 460, ${x} 400 Z" fill="#F5B841"/>`).join('')}`,
  'plush-cat-keychain': `
    <circle cx="600" cy="230" r="60" fill="none" stroke="#B6BECC" stroke-width="22"/>
    <rect x="590" y="285" width="20" height="120" fill="#B6BECC"/>
    <path d="M380 520 L420 360 L520 450 Z" fill="#9EA3AB"/><path d="M820 520 L780 360 L680 450 Z" fill="#9EA3AB"/>
    <ellipse cx="600" cy="640" rx="260" ry="240" fill="#9EA3AB"/>
    <circle cx="510" cy="610" r="26" fill="#1C2333"/><circle cx="690" cy="610" r="26" fill="#1C2333"/>
    <path d="M580 680 L620 680 L600 705 Z" fill="#F2A5B8"/>
    <ellipse cx="460" cy="700" rx="40" ry="22" fill="#F2B8C6" opacity=".8"/><ellipse cx="740" cy="700" rx="40" ry="22" fill="#F2B8C6" opacity=".8"/>`,
  'pastel-sticky-note-set': `
    ${[['#F6D6E0', 300, 520, -8], ['#D3E7F7', 470, 470, 6], ['#DDF1DE', 380, 330, -3], ['#FBEFC6', 560, 300, 9]]
      .map(([c, x, y, r]) => `<rect x="${x}" y="${y}" width="340" height="340" rx="14" fill="${c}" transform="rotate(${r} ${x + 170} ${y + 170})"/>`).join('')}`,
  'minimal-phone-strap': `
    <path d="M600 330 C 260 330, 260 980, 600 980" fill="none" stroke="#1F2F55" stroke-width="34" stroke-linecap="round"/>
    <rect x="560" y="300" width="290" height="560" rx="46" fill="#1C2333"/>
    <rect x="582" y="324" width="246" height="512" rx="32" fill="#E9EDF5"/>
    <circle cx="600" cy="980" r="26" fill="#1F2F55"/>`,
  'canvas-tote-bag': `
    <path d="M470 470 C 470 250, 730 250, 730 470" fill="none" stroke="#C8B48F" stroke-width="34"/>
    <path d="M330 460 L870 460 L820 980 L380 980 Z" fill="#EADFC8"/>
    <rect x="520" y="640" width="160" height="110" rx="10" fill="#1D3FAF" opacity=".85"/>`,
};

await mkdir(OUT, { recursive: true });
for (const [slug, body] of Object.entries(art)) {
  const svg = Buffer.from(frame(body));
  for (const w of WIDTHS) {
    await sharp(svg, { density: 72 * (w / 1200) * 2 }).resize(w, w).webp({ quality: 82 })
      .toFile(new URL(`${slug}-${w}.webp`, OUT).pathname);
  }
  console.log('wrote', slug);
}
