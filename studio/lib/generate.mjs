import path from 'node:path';
import { ensureDir, exists, readText, writeText } from './util.mjs';
import { charterMarkdown, departmentsIndexMarkdown } from './render.mjs';

export function charterPath(root, dept) {
  return path.join(root, 'studio', 'departments', `${dept.slug}.md`);
}

export function generateCharters(root, registry) {
  const dir = path.join(root, 'studio', 'departments');
  ensureDir(dir);
  const written = [];
  for (const dept of registry.departments) {
    const content = charterMarkdown(dept, registry);
    writeText(charterPath(root, dept), content);
    written.push(`${dept.slug}.md`);
  }
  writeText(path.join(dir, 'INDEX.md'), departmentsIndexMarkdown(registry));
  written.push('INDEX.md');
  return written;
}

export function charterSync(root, registry) {
  const missing = [];
  const stale = [];
  for (const dept of registry.departments) {
    const file = charterPath(root, dept);
    if (!exists(file)) {
      missing.push(dept.slug);
      continue;
    }
    if (readText(file) !== charterMarkdown(dept, registry)) stale.push(dept.slug);
  }
  const index = path.join(root, 'studio', 'departments', 'INDEX.md');
  if (!exists(index)) missing.push('INDEX.md');
  else if (readText(index) !== departmentsIndexMarkdown(registry)) stale.push('INDEX.md');
  return { missing, stale, ok: !missing.length && !stale.length };
}
