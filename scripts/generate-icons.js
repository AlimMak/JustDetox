#!/usr/bin/env node
/**
 * scripts/generate-icons.js
 *
 * Generates JustDetox extension icons (16, 48, 128 px) as PNG files.
 *
 * Design: white rounded-square mark on #0a0a0a background.
 * No external dependencies — uses only Node built-in `zlib`.
 *
 * Usage:
 *   node scripts/generate-icons.js
 */

import { writeFileSync, mkdirSync } from "fs";
import { deflateSync } from "zlib";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CRC-32 table (required by PNG spec) ─────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

// ─── PNG writer ───────────────────────────────────────────────────────────────

function makeChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

/**
 * Encode a W×H RGB image as a PNG buffer.
 * @param {number} w - width in pixels
 * @param {number} h - height in pixels
 * @param {(x: number, y: number) => [number, number, number]} getRgb - pixel callback
 * @returns {Buffer}
 */
function encodePNG(w, h, getRgb) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB (no alpha)

  // Raw scanlines: one filter byte (0 = None) per row, then RGB triples
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const [r, g, b] = getRgb(x, y);
      const i = y * (1 + w * 3) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }

  return Buffer.concat([
    sig,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", deflateSync(raw, { level: 9 })),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── Icon design ──────────────────────────────────────────────────────────────

const BG = [10, 10, 10];    // #0a0a0a — extension background
const FG = [255, 255, 255]; // white   — mark colour

/**
 * Returns true if (x, y) is inside a rounded rectangle.
 * All coordinates are in pixels; uses hard edges (no AA).
 */
function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  const lx = x - x0;
  const ly = y - y0;
  const w = x1 - x0;
  const h = y1 - y0;
  if (lx < r && ly < r)          return Math.hypot(r - lx, r - ly)     <= r;
  if (lx >= w - r && ly < r)     return Math.hypot(lx - (w - r), r - ly)     <= r;
  if (lx < r && ly >= h - r)     return Math.hypot(r - lx, ly - (h - r))     <= r;
  if (lx >= w - r && ly >= h - r) return Math.hypot(lx - (w - r), ly - (h - r)) <= r;
  return true;
}

/**
 * Pixel function for the JustDetox icon at a given size.
 *
 * Outer shape:  white rounded square, inset ~20 % on each side.
 * Inner cutout: dark horizontal bar in the lower-middle third — creates a
 *               subtle "J" silhouette readable at every target size.
 */
function iconPixel(x, y, size) {
  const pad = Math.round(size * 0.19);
  const r   = Math.round(size * 0.16);

  if (!inRoundedRect(x, y, pad, pad, size - pad, size - pad, r)) return BG;

  // Cut a dark horizontal bar from the lower-left quadrant to form a "J":
  //   bar spans: x = [pad .. center-1], y = [center .. center + barH - 1]
  const cx  = Math.round(size * 0.5);
  const barH = Math.max(1, Math.round(size * 0.12));
  const barY0 = Math.round(size * 0.5);
  const barY1 = barY0 + barH;
  if (x < cx && y >= barY0 && y < barY1) return BG;

  return FG;
}

// ─── Generate ─────────────────────────────────────────────────────────────────

const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const png = encodePNG(size, size, (x, y) => iconPixel(x, y, size));
  const outPath = join(outDir, `icon${size}.png`);
  writeFileSync(outPath, png);
  process.stdout.write(`  icon${size}.png  ${png.length} B\n`);
}
