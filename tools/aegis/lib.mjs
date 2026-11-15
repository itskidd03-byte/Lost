// Shared helpers: polite HTTP with retries, throttling, and image sniffing.
// No dependencies — this must run on a bare GitHub Actions runner.

import { createHash } from 'node:crypto';

export const USER_AGENT =
  'AEGIS-GraphicsMemoryBank/1.0 (https://github.com/itskidd03-byte/Lost; asset acquisition bot)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

// Serialised, rate-limited queue: open-access APIs are community services and
// will start returning "You are making too many requests" under concurrency.
class Throttle {
  constructor(minIntervalMs) {
    this.minIntervalMs = minIntervalMs;
    this.chain = Promise.resolve();
    this.last = 0;
  }
  run(fn) {
    const next = this.chain.then(async () => {
      const wait = this.minIntervalMs - (Date.now() - this.last);
      if (wait > 0) await sleep(wait);
      try {
        return await fn();
      } finally {
        this.last = Date.now();
      }
    });
    this.chain = next.catch(() => {});
    return next;
  }
}

export const throttles = {
  commons: new Throttle(220),
  met: new Throttle(160),
  artic: new Throttle(160),
  polyhaven: new Throttle(120),
  download: new Throttle(40),
};

export async function httpGet(url, { tries = 4, timeoutMs = 45000, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...headers },
        redirect: 'follow',
      });
      clearTimeout(timer);
      if (!res.ok) {
        // 429 / 5xx are worth retrying with backoff; 4xx are terminal.
        if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.terminal = true;
        throw err;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err.terminal) break;
      if (attempt < tries) await sleep(400 * 2 ** (attempt - 1) + Math.random() * 300);
    }
  }
  throw lastErr;
}

export async function getJson(url, opts) {
  const res = await httpGet(url, opts);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 120)}`);
  }
}

// Minimal image sniffing: enough to prove a file is a real, decodable image
// and to record its true pixel dimensions.
export function imageInfo(buf) {
  if (!buf || buf.length < 24) return null;

  // PNG
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG — walk the marker chain to the first start-of-frame segment.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = buf.readUInt16BE(i + 2);
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        return { format: 'jpg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }

  // GIF
  if (buf.toString('latin1', 0, 3) === 'GIF') {
    return { format: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // WEBP
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const kind = buf.toString('latin1', 12, 16);
    if (kind === 'VP8 ') return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { format: 'webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { format: 'webp', width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    return null;
  }

  // SVG (text based)
  const head = buf.toString('utf8', 0, Math.min(buf.length, 800));
  if (/<svg[\s>]/i.test(head)) {
    const w = /width=["'](\d+(?:\.\d+)?)/i.exec(head);
    const h = /height=["'](\d+(?:\.\d+)?)/i.exec(head);
    const vb = /viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i.exec(head);
    return {
      format: 'svg',
      width: Math.round(Number(w?.[1] || vb?.[1] || 0)),
      height: Math.round(Number(h?.[1] || vb?.[2] || 0)),
    };
  }

  return null;
}

export const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';

export const titleCase = (s) =>
  String(s)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());

export function uniq(list) {
  return [...new Set(list)];
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
