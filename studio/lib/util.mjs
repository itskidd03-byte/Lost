import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STUDIO = path.join(ROOT, 'studio');

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function tryReadJson(file, fallback = null) {
  try {
    return readJson(file);
  } catch {
    return fallback;
  }
}

export function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  // Write-then-rename so a concurrent reader never sees a half-written queue or project file.
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return file;
}

export function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`);
  return file;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function exists(file) {
  return fs.existsSync(file);
}

export function listFiles(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

export function nowIso() {
  return new Date().toISOString();
}

export function titleCase(text) {
  return String(text).replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

export function rel(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

export function pct(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

export function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}
