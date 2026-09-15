/**
 * بيولّد أيقونات الـ PWA (PNG) من غير أي مكتبات خارجية.
 * التشغيل: node scripts/generate-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "icons");

const TEAL = [0, 168, 132];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function toPng(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    pixels
      .subarray(y * width * 4, (y + 1) * width * 4)
      .copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** مربع بأطراف دايرية */
function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = (v) => v * size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let color = null;

      // الخلفية: مربع بأطراف دايرية بلون واتساب
      if (insideRoundedRect(x, y, 0, 0, size - 1, size - 1, s(0.22))) {
        color = TEAL;
      }

      // فقاعة الشات البيضا
      const bubble = insideRoundedRect(
        x, y, s(0.23), s(0.24), s(0.77), s(0.66), s(0.16),
      );
      // ذيل الفقاعة (مثلث ناحية الشمال تحت)
      const tailX = x - s(0.3);
      const tailY = y - s(0.62);
      const tail =
        tailY >= 0 &&
        tailY <= s(0.16) &&
        tailX >= -s(0.02) &&
        tailX <= s(0.16) - tailY * 0.9 &&
        tailX + tailY * 0.55 >= 0;

      if (bubble || tail) color = WHITE;

      if (color) {
        px[i] = color[0];
        px[i + 1] = color[1];
        px[i + 2] = color[2];
        px[i + 3] = 255;
      }
    }
  }
  return toPng(size, size, px);
}

/** أيقونة الـ badge: أبيض شفاف على خلفية شفافة (أندرويد بيلوّنها لوحده) */
function drawBadge(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = (v) => v * size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (insideRoundedRect(x, y, s(0.15), s(0.2), s(0.85), s(0.68), s(0.18))) {
        px[i] = 255;
        px[i + 1] = 255;
        px[i + 2] = 255;
        px[i + 3] = 255;
      }
    }
  }
  return toPng(size, size, px);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "icon-192.png"), drawIcon(192));
writeFileSync(join(OUT_DIR, "icon-512.png"), drawIcon(512));
writeFileSync(join(OUT_DIR, "badge-72.png"), drawBadge(72));
console.log("✅ الأيقونات اتولّدت في public/icons");
