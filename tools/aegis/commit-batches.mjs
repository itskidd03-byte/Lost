// Commits the built bank in batches of 25 so an interrupted run still leaves
// verified work in the repository.
//
//   node tools/aegis/commit-batches.mjs [--batch=25]
//
// Runs after build-assets.mjs and pushes with GITHUB_TOKEN from the workflow.

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BANK_DIR, DEPARTMENTS } from './config.mjs';

const args = process.argv.slice(2);
const BATCH = Number(args.find((a) => a.startsWith('--batch='))?.split('=')[1] || 25);
const BRANCH = process.env.AEGIS_BRANCH || 'main';

const git = (argv) =>
  execFileSync('git', argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const hasStaged = () => {
  try {
    git(['diff', '--cached', '--quiet']);
    return false;
  } catch {
    return true;
  }
};

function commit(message) {
  if (!hasStaged()) return false;
  git(['commit', '-m', message]);
  return true;
}

function push(attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try {
      git(['push', 'origin', `HEAD:refs/heads/${BRANCH}`]);
      return true;
    } catch (err) {
      if (i === attempts) throw err;
      try {
        git(['pull', '--rebase', '--autostash', 'origin', BRANCH]);
      } catch {
        /* retried below */
      }
      execFileSync('sleep', [String(i * 3)]);
    }
  }
  return false;
}

const LABEL = {
  DARK_FUTURISTIC_INDUSTRIAL: 'industrial',
  PHOTOREALISTIC: 'photorealistic',
  FANTASY_CINEMATIC: 'fantasy',
};

async function main() {
  git(['config', 'user.name', 'aegis-graphics-bot']);
  git(['config', 'user.email', 'aegis-graphics-bot@users.noreply.github.com']);

  // 1. Architecture and tooling on their own, so the structure is reviewable
  //    before gigabytes of assets land. Deliberately excludes every image.
  git(['add', '--', 'tools/aegis', '.github/workflows/aegis-graphics.yml', `${BANK_DIR}/README.md`]);
  if (commit('AEGIS: Initialize graphics memory architecture')) {
    push();
    console.log('committed: AEGIS: Initialize graphics memory architecture');
  }

  const manifest = JSON.parse(await readFile(path.join(BANK_DIR, 'manifest.json'), 'utf8'));
  let batches = 0;
  let files = 0;

  for (const dept of DEPARTMENTS) {
    if (!(manifest.collections || []).some((c) => c.collection === dept.key)) continue;

    const deptManifest = JSON.parse(
      await readFile(path.join(BANK_DIR, dept.key, 'manifest.json'), 'utf8'),
    );
    const paths = (deptManifest.assets || []).map((a) => a.repository_path).sort();

    for (let i = 0, n = 1; i < paths.length; i += BATCH, n++) {
      const slice = paths.slice(i, i + BATCH);
      git(['add', '--', ...slice]);
      const msg = `AEGIS: Add ${LABEL[dept.key]} graphics batch ${String(n).padStart(3, '0')}`;
      if (commit(msg)) {
        push();
        batches++;
        files += slice.length;
        console.log(`committed: ${msg} (${slice.length} files)`);
      }
    }

    // Collection manifest travels with the last batch of its own collection.
    git(['add', '--', `${BANK_DIR}/${dept.key}/manifest.json`]);
    if (commit(`AEGIS: Record ${LABEL[dept.key]} collection manifest`)) push();
  }

  // 3. Indexes last: they describe everything committed above.
  git(['add', '--', `${BANK_DIR}/MEMORY_INDEX`, `${BANK_DIR}/manifest.json`, `${BANK_DIR}/README.md`]);
  if (commit('AEGIS: Update graphics retrieval indexes')) {
    push();
    console.log('committed: AEGIS: Update graphics retrieval indexes');
  }

  console.log(`\n${batches} asset batches, ${files} asset files committed.`);
}

main().catch((err) => {
  console.error('COMMIT FAILED:', err?.stderr?.toString?.() || err);
  process.exitCode = 1;
});
