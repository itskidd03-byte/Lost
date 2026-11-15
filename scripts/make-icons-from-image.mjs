/**
 * Builds the install icons from the original title-card artwork.
 * No image libraries: decodes the source PNG, resamples the complete card into
 * a square poster with a darkened, blurred version of itself behind it, then
 * writes the PNG sizes the manifest and Apple expect.
 */
import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = resolve(process.cwd(), 'artifacts/icon-source.png');
const OUT_DIR = resolve(process.cwd(), 'public/icons');
const DARK = [7, 5, 7, 255];

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(path) {
  const buffer = readFileSync(path);
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  let depth = 0;
  let interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      const colorType = data[9];
      interlace = data[12];
      channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
  }
  if (depth !== 8 || !channels || interlace !== 0) throw new Error('unsupported PNG format');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let position = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[position++];
    const row = y * stride;
    const previous = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[position++];
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const up = y > 0 ? pixels[previous + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[previous + x - channels] : 0;
      let restored = value;
      if (filter === 1) restored = value + left;
      else if (filter === 2) restored = value + up;
      else if (filter === 3) restored = value + ((left + up) >> 1);
      else if (filter === 4) restored = value + paeth(left, up, upLeft);
      pixels[row + x] = restored & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

/** Area-average sample from a rectangle of the source into an exact target size. */
function resampleRect(image, sx, sy, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const { pixels, channels, width } = image;
  const scaleX = sourceWidth / targetWidth;
  const scaleY = sourceHeight / targetHeight;
  const out = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let dy = 0; dy < targetHeight; dy++) {
    const y0 = sy + dy * scaleY;
    const y1 = y0 + scaleY;
    for (let dx = 0; dx < targetWidth; dx++) {
      const x0 = sx + dx * scaleX;
      const x1 = x0 + scaleX;
      let r = 0, g = 0, b = 0, weight = 0;
      for (let py = Math.floor(y0); py < Math.ceil(y1); py++) {
        const wy = Math.min(y1, py + 1) - Math.max(y0, py);
        if (wy <= 0) continue;
        for (let px = Math.floor(x0); px < Math.ceil(x1); px++) {
          const wx = Math.min(x1, px + 1) - Math.max(x0, px);
          if (wx <= 0) continue;
          const w = wx * wy;
          const index = (py * width + px) * channels;
          r += pixels[index] * w;
          g += pixels[index + 1] * w;
          b += pixels[index + 2] * w;
          weight += w;
        }
      }
      const outIndex = (dy * targetWidth + dx) * 4;
      out[outIndex] = Math.round(r / weight);
      out[outIndex + 1] = Math.round(g / weight);
      out[outIndex + 2] = Math.round(b / weight);
      out[outIndex + 3] = 255;
    }
  }
  return out;
}

/** Soften a tiny thumbnail up to the square background size. */
function upscale(tiny, fromSize, toSize) {
  const out = Buffer.alloc(toSize * toSize * 4);
  for (let y = 0; y < toSize; y++) {
    const gy = ((y + 0.5) * fromSize) / toSize - 0.5;
    const y0 = Math.max(0, Math.floor(gy));
    const y1 = Math.min(fromSize - 1, y0 + 1);
    const fy = Math.max(0, Math.min(1, gy - y0));
    for (let x = 0; x < toSize; x++) {
      const gx = ((x + 0.5) * fromSize) / toSize - 0.5;
      const x0 = Math.max(0, Math.floor(gx));
      const x1 = Math.min(fromSize - 1, x0 + 1);
      const fx = Math.max(0, Math.min(1, gx - x0));
      const i00 = (y0 * fromSize + x0) * 4;
      const i10 = (y0 * fromSize + x1) * 4;
      const i01 = (y1 * fromSize + x0) * 4;
      const i11 = (y1 * fromSize + x1) * 4;
      const outIndex = (y * toSize + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = tiny[i00 + c] * (1 - fx) + tiny[i10 + c] * fx;
        const bottom = tiny[i01 + c] * (1 - fx) + tiny[i11 + c] * fx;
        out[outIndex + c] = Math.round((top * (1 - fy) + bottom * fy) * 0.38);
      }
      out[outIndex + 3] = 255;
    }
  }
  return out;
}

/** Full title card, poster-style, on a blurred cover background. */
function poster(image, size, contentWidth) {
  const backgroundSize = Math.min(image.width, image.height);
  const bgX = Math.floor((image.width - backgroundSize) / 2);
  const tiny = resampleRect(image, bgX, 0, backgroundSize, backgroundSize, 48, 48);
  const out = upscale(tiny, 48, size);

  const contentHeight = Math.round((contentWidth * image.height) / image.width);
  const content = resampleRect(image, 0, 0, image.width, image.height, contentWidth, contentHeight);
  const ox = Math.floor((size - contentWidth) / 2);
  const oy = Math.floor((size - contentHeight) / 2);
  for (let y = 0; y < contentHeight; y++) {
    const from = y * contentWidth * 4;
    const to = ((y + oy) * size + ox) * 4;
    content.copy(out, to, from, from + contentWidth * 4);
  }
  return out;
}

/** Same poster, inset far enough for Android's circular mask. */
function maskable(image) {
  const size = 512;
  const contentSize = 430;
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < out.length; i += 4) out.set(DARK, i);
  const card = poster(image, contentSize, contentSize);
  const inset = Math.floor((size - contentSize) / 2);
  for (let y = 0; y < contentSize; y++) {
    const from = y * contentSize * 4;
    const to = ((y + inset) * size + inset) * 4;
    card.copy(out, to, from, from + contentSize * 4);
  }
  return out;
}

const image = decodePng(SOURCE);
console.log(`source ${image.width}x${image.height}`);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'icon-512.png'), encodePng(512, 512, poster(image, 512, 512)));
writeFileSync(resolve(OUT_DIR, 'icon-192.png'), encodePng(192, 192, poster(image, 192, 192)));
writeFileSync(resolve(OUT_DIR, 'apple-touch-icon.png'), encodePng(180, 180, poster(image, 180, 180)));
writeFileSync(resolve(OUT_DIR, 'icon-maskable-512.png'), encodePng(512, 512, maskable(image)));
console.log('wrote poster icons from the original artwork');
