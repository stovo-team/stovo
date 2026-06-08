/**
 * Generates Android launcher PNG icons matching the VeloLogo (three diagonal stripes,
 * rose-to-orange gradient, white background).
 * Run from the frontend/ directory: node generate-icons.mjs
 */

import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ── PNG encoder ──────────────────────────────────────────────────────────────

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const tb = Buffer.from(type, "ascii");
  const lb = Buffer.allocUnsafe(4); lb.writeUInt32BE(data.length);
  const cb = Buffer.allocUnsafe(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([lb, tb, data, cb]);
}

function encodePNG(w, h, pixels) {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0;

  const stride = w * 4;
  const raw = Buffer.allocUnsafe(h * (1 + stride));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + stride)] = 0;
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (1 + stride) + 1);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

// ── Logo geometry (SVG 100×100 viewport) ─────────────────────────────────────

const COS25 = Math.cos(25 * Math.PI / 180);
const SIN25 = Math.sin(25 * Math.PI / 180);

const STRIPES = [
  { cx: 37.5, cy: 37,   hw: 22.5, hh: 5, rx: 5 },
  { cx: 55,   cy: 57,   hw: 30,   hh: 5, rx: 5 },
  { cx: 62.5, cy: 77,   hw: 17.5, hh: 5, rx: 5 },
];

function inStripes(sx, sy) {
  for (const { cx, cy, hw, hh, rx } of STRIPES) {
    // Inverse of SVG rotate(-25°) = rotate(+25°) in standard CCW convention
    const ddx = sx - cx, ddy = sy - cy;
    const dx = ddx * COS25 - ddy * SIN25;
    const dy = ddx * SIN25 + ddy * COS25;
    const qx = Math.max(Math.abs(dx) - (hw - rx), 0);
    const qy = Math.max(Math.abs(dy) - (hh - rx), 0);
    if (qx * qx + qy * qy <= rx * rx) return true;
  }
  return false;
}

function gradientColor(sx, sy) {
  const t = Math.min(1, Math.max(0, (sx + sy) / 200));
  return [
    Math.round(225 + 26 * t),   // R: #e11d48 → #fb923c
    Math.round(29 + 117 * t),   // G
    Math.round(72 - 12 * t),    // B
  ];
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderLauncher(size) {
  const scale = size / 100;
  const px4 = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sx = px / scale, sy = py / scale;
      const off = (py * size + px) * 4;
      if (inStripes(sx, sy)) {
        const [r, g, b] = gradientColor(sx, sy);
        px4[off] = r; px4[off + 1] = g; px4[off + 2] = b; px4[off + 3] = 255;
      } else {
        px4[off] = px4[off + 1] = px4[off + 2] = px4[off + 3] = 255; // white
      }
    }
  }
  return px4;
}

function renderForeground(size) {
  // Safe zone: 72dp centred in 108dp canvas. Map pixel to SVG coords via that zone.
  const margin = 18 / 108;
  const visible = 72 / 108;
  const px4 = new Uint8Array(size * size * 4); // starts transparent
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sx = ((px / size - margin) / visible) * 100;
      const sy = ((py / size - margin) / visible) * 100;
      const off = (py * size + px) * 4;
      if (inStripes(sx, sy)) {
        const [r, g, b] = gradientColor(sx, sy);
        px4[off] = r; px4[off + 1] = g; px4[off + 2] = b; px4[off + 3] = 255;
      }
    }
  }
  return px4;
}

// ── Write files ───────────────────────────────────────────────────────────────

const BASE = "android/app/src/main/res";

const DENSITIES = [
  { dir: "mipmap-mdpi",    icon: 48,  fg: 108 },
  { dir: "mipmap-hdpi",    icon: 72,  fg: 162 },
  { dir: "mipmap-xhdpi",   icon: 96,  fg: 216 },
  { dir: "mipmap-xxhdpi",  icon: 144, fg: 324 },
  { dir: "mipmap-xxxhdpi", icon: 192, fg: 432 },
];

for (const { dir, icon, fg } of DENSITIES) {
  const path = join(BASE, dir);
  mkdirSync(path, { recursive: true });

  const launcherPng = encodePNG(icon, icon, renderLauncher(icon));
  writeFileSync(join(path, "ic_launcher.png"), launcherPng);
  writeFileSync(join(path, "ic_launcher_round.png"), launcherPng);

  const fgPng = encodePNG(fg, fg, renderForeground(fg));
  writeFileSync(join(path, "ic_launcher_foreground.png"), fgPng);

  console.log(`${dir}: launcher ${icon}×${icon}px, foreground ${fg}×${fg}px`);
}

console.log("Done. Rebuild the Android project to pick up the new icons.");
