/**
 * Generates the PWA icons referenced by the manifest in vite.config.ts.
 *
 * Committed as a script rather than as three opaque PNGs: the icons are derived
 * from the same palette as src/ui/global.css, and when that palette changes the
 * icons should be regenerated, not hand-edited. Run with `node scripts/generate-icons.mjs`.
 *
 * The mark is the ladder against the pole — the app's one distinctive idea:
 * progress as a position on a scale, not a binary.
 *
 * PNG is written by hand (zlib is in Node; an image library is not a dependency
 * this project needs for three static files).
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BG = [0x0f, 0x0d, 0x13]; // --bg
const ACCENT = [0xd9, 0x4f, 0x8c]; // --accent
const IDLE = [0x32, 0x2c, 0x3d]; // --border

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([head, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour, no alpha
  // 10-12: deflate, adaptive filtering, no interlace — all zero.

  // One filter byte (0 = None) per scanline, then RGB triples.
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (1 + size * 3);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixels(x, y);
      const at = rowStart + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Rounded rectangle in unit coordinates, so one description works at any size. */
function roundedRect(x0, y0, x1, y1, radius) {
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;

    const dx = Math.min(x - x0, x1 - x);
    const dy = Math.min(y - y0, y1 - y);
    if (dx >= radius || dy >= radius) return true;

    const cx = radius - dx;
    const cy = radius - dy;
    return cx * cx + cy * cy <= radius * radius;
  };
}

/**
 * @param scale shrink the mark toward the centre. Maskable icons are cropped to
 *   a circle by the launcher, so their content stays well inside the safe zone.
 */
function mark(scale) {
  const pole = roundedRect(0.62, 0.12, 0.72, 0.88, 0.05);
  const rungs = Array.from({ length: 5 }, (_, i) => ({
    hit: roundedRect(0.28, 0.75 - i * 0.14, 0.58, 0.81 - i * 0.14, 0.03),
    filled: i < 3,
  }));

  return (x, y) => {
    // Scale about the centre: the launcher's mask is what we are avoiding.
    const sx = 0.5 + (x - 0.5) / scale;
    const sy = 0.5 + (y - 0.5) / scale;

    if (pole(sx, sy)) return ACCENT;
    for (const rung of rungs) {
      if (rung.hit(sx, sy)) return rung.filled ? ACCENT : IDLE;
    }
    return BG;
  };
}

function render(size, scale) {
  const draw = mark(scale);
  // 3x3 supersampling: these are flat shapes with curved corners, and a hard
  // edge at 192px looks like a mistake rather than a decision.
  return (x, y) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let sy = 0; sy < 3; sy += 1) {
      for (let sx = 0; sx < 3; sx += 1) {
        const [pr, pg, pb] = draw((x + (sx + 0.5) / 3) / size, (y + (sy + 0.5) / 3) / size);
        r += pr;
        g += pg;
        b += pb;
      }
    }
    return [Math.round(r / 9), Math.round(g / 9), Math.round(b / 9)];
  };
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

for (const [name, size, scale] of [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  // Maskable: content pulled in so a circular crop cannot cut the mark.
  ['icon-512-maskable.png', 512, 0.72],
]) {
  writeFileSync(join(publicDir, name), png(size, render(size, scale)));
  console.log(`wrote public/${name}`);
}
