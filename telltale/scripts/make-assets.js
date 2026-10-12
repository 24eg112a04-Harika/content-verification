'use strict';
/**
 * Generates the static assets that need to exist as files:
 *   public/assets/og.png      1200x630 social preview (pure Node PNG encoder, no deps)
 *   public/assets/logo.svg    standalone wordmark for docs/READMEs
 * Run: node scripts/make-assets.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public', 'assets');

/* ------------------------------------------------------------ PNG writer */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* --------------------------------------------------------- 5x7 bitmap font */
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '01110', '10001', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  ',': ['00000', '00000', '00000', '00000', '00110', '00100', '01000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ':': ['00000', '00110', '00110', '00000', '00110', '00110', '00000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000']
};

/* -------------------------------------------------------------- canvas */
class Canvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.buf = Buffer.alloc(w * h * 4, 0);
  }
  px(x, y, [r, g, b], a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (Math.floor(y) * this.w + Math.floor(x)) * 4;
    const sa = Math.min(1, a);
    const da = this.buf[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA === 0) return;
    this.buf[i] = Math.round((r * sa + this.buf[i] * da * (1 - sa)) / outA);
    this.buf[i + 1] = Math.round((g * sa + this.buf[i + 1] * da * (1 - sa)) / outA);
    this.buf[i + 2] = Math.round((b * sa + this.buf[i + 2] * da * (1 - sa)) / outA);
    this.buf[i + 3] = Math.round(outA * 255);
  }
  fill(color) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.px(x, y, color, 1);
  }
  /** radial glow, additive-ish blend */
  glow(cx, cy, radius, color, strength = 1) {
    for (let y = Math.max(0, cy - radius); y < Math.min(this.h, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x < Math.min(this.w, cx + radius); x++) {
        const d = Math.hypot(x - cx, y - cy) / radius;
        if (d >= 1) continue;
        this.px(x, y, color, (1 - d) ** 2 * strength);
      }
    }
  }
  roundRect(x, y, w, h, r, color, alpha = 1) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const dx = xx < x + r ? x + r - xx : xx > x + w - r ? xx - (x + w - r) : 0;
        const dy = yy < y + r ? y + r - yy : yy > y + h - r ? yy - (y + h - r) : 0;
        if (dx * dx + dy * dy > r * r) continue;
        this.px(xx, yy, color, alpha);
      }
    }
  }
  text(str, x, y, scale, color, spacing = 1) {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const glyph = GLYPHS[ch] || GLYPHS[' '];
      for (let gy = 0; gy < glyph.length; gy++) {
        for (let gx = 0; gx < glyph[gy].length; gx++) {
          if (glyph[gy][gx] === '1') {
            this.roundRect(cx + gx * scale, y + gy * scale, scale, scale, Math.max(0, Math.floor(scale / 3)), color);
          }
        }
      }
      cx += (glyph[0].length + spacing) * scale;
    }
    return cx;
  }
  measure(str, scale, spacing = 0) {
    return str.length * (5 + spacing) * scale - spacing * scale;
  }
  toPNG() { return encodePNG(this.w, this.h, this.buf); }
}

/* ---------------------------------------------------------- og image */
function buildOg() {
  const W = 1200, H = 630;
  const c = new Canvas(W, H);
  const bg = [8, 9, 13];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x / W) * 0.35 + (y / H) * 0.1;
      c.px(x, y, [
        Math.round(bg[0] + t * 10),
        Math.round(bg[1] + t * 9),
        Math.round(bg[2] + t * 20)
      ], 1);
    }
  }
  c.glow(140, 70, 560, [139, 124, 246], 0.5);    // violet
  c.glow(1120, 100, 460, [61, 220, 151], 0.24);  // mint
  c.glow(1020, 640, 430, [255, 111, 94], 0.18);  // coral

  const violet = [169, 156, 255];
  const mint = [94, 234, 212];
  const white = [236, 238, 242];
  const grey = [148, 154, 168];
  const dim = [104, 110, 124];

  /* ---- header: mark + wordmark ---- */
  const mx = 96, my = 74, mSize = 104;
  c.roundRect(mx, my, mSize, mSize, 28, [139, 124, 246], 0.15);
  for (let t = 0; t < mSize; t++) {
    c.px(mx + t, my, violet, 0.55); c.px(mx + t, my + mSize - 1, violet, 0.55);
    c.px(mx, my + t, violet, 0.55); c.px(mx + mSize - 1, my + t, violet, 0.55);
  }
  // thick parabola arc, mint→violet, plus a dot above it
  const arcX0 = mx + 22, arcX1 = mx + mSize - 22, arcBase = my + 74, arcTop = my + 44;
  for (let x = arcX0; x <= arcX1; x++) {
    const p = (x - arcX0) / (arcX1 - arcX0);
    const y = arcTop + (1 - Math.sin(p * Math.PI)) * (arcBase - arcTop);
    const col = [
      Math.round(violet[0] + (mint[0] - violet[0]) * p),
      Math.round(violet[1] + (mint[1] - violet[1]) * p),
      Math.round(violet[2] + (mint[2] - violet[2]) * p)
    ];
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 10) continue;
        c.px(x + dx, y + dy, col, 0.95);
      }
    }
  }
  c.roundRect(mx + mSize / 2 - 9, my + 22, 18, 18, 6, mint, 0.98);

  // wordmark — scale chosen so it fits the header comfortably
  const wordScale = 6;
  c.text('TELLTALE', mx + mSize + 34, my + 18, wordScale, white, 0);
  c.roundRect(mx + mSize + 34, my + 18 + 7 * wordScale + 20, 118, 7, 4, mint, 0.9);
  c.text('AI CONTENT VERIFICATION', mx + mSize + 34, my + 18 + 7 * wordScale + 46, 3, grey, 1);

  /* ---- signal bars ---- */
  const bx = 96, bw = W - 192;
  const bars = [
    { label: 'STOCK PHRASES  (WEIGHT 3.4)', v: 0.94, color: [255, 111, 94] },
    { label: 'SENTENCE RHYTHM  (WEIGHT 2.6)', v: 0.88, color: [255, 145, 102] },
    { label: 'TRANSITIONAL OPENERS  (1.8)', v: 0.62, color: [245, 181, 68] },
    { label: 'CASUAL IMPERFECTIONS  (1.2)', v: 0.16, color: [61, 220, 151] },
    { label: 'PERSONAL VOICE  (1.3)', v: 0.22, color: [76, 178, 255] }
  ];
  let by = 244;
  for (const b of bars) {
    c.text(b.label, bx, by, 3, grey, 0);
    c.roundRect(bx, by + 30, bw, 15, 7, [255, 255, 255], 0.075);
    c.roundRect(bx, by + 30, Math.max(18, Math.round(bw * b.v)), 15, 7, b.color, 0.92);
    by += 59;
  }

  /* ---- footer row (positions measured, not guessed) ---- */
  const chipW = 300;
  c.roundRect(bx, 566, chipW, 44, 14, [139, 124, 246], 0.16);
  c.text('SCORE 79 / 100', bx + 22, 579, 3, [200, 191, 255], 0);
  let fx = bx + chipW + 34;
  for (const label of ['14 SIGNALS', '40 MS PER SCAN', 'RUNS LOCALLY']) {
    c.text(label, fx, 579, 3, dim, 0);
    fx += c.measure(label, 3, 0) + 30;
  }

  return c.toPNG();
}

/* ---------------------------------------------------------- logo svg */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 96" width="420" height="96" role="img" aria-label="TellTale">
  <defs>
    <linearGradient id="tt" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a99cff"/><stop offset="1" stop-color="#5eead4"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="80" height="80" rx="22" fill="url(#tt)" opacity="0.14"/>
  <rect x="8" y="8" width="80" height="80" rx="22" fill="none" stroke="url(#tt)" stroke-width="3"/>
  <path d="M26 62c5-18 13-27 22-27s17 9 22 27" fill="none" stroke="url(#tt)" stroke-width="6" stroke-linecap="round"/>
  <circle cx="48" cy="24" r="6" fill="url(#tt)"/>
  <text x="112" y="60" font-family="Helvetica Neue, Arial, sans-serif" font-size="42" font-weight="600" fill="#eceef2" letter-spacing="-1">Tell<tspan fill="#a99cff">Tale</tspan></text>
</svg>
`;

fs.mkdirSync(OUT, { recursive: true });
const png = buildOg();
fs.writeFileSync(path.join(OUT, 'og.png'), png);
fs.writeFileSync(path.join(OUT, 'logo.svg'), LOGO_SVG);
console.log(`og.png  ${(png.length / 1024).toFixed(1)} kB  1200x630`);
console.log('logo.svg written');
