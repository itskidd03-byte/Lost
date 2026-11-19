#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ROOT, exists, listFiles, nowIso, readJson, readText, slugify, tryReadJson, writeJson, writeText,
} from '../lib/util.mjs';
import { loadRegistry, validateRegistry } from '../lib/registry.mjs';
import {
  appendDecision, appendMemory, assetCatalog, createProject, loadProject, listProjects, perfRecord, replanProject,
  resolveProject, saveAssetCatalog, savePerfRecord, saveProject, saveQueue, writeDerivedDocs,
} from '../lib/store.mjs';
import {
  classifyLicence, licenceAudit, perfAudit, reviewTask, submitTask,
} from '../lib/gates.mjs';
import { currentPhase, dependencyState, phaseSummary, readyTasks } from '../lib/planner.mjs';
import { charterMarkdown, promptMarkdown, reviewMarkdown, statusMarkdown, activationLabel } from '../lib/render.mjs';
import { charterSync, generateCharters } from '../lib/generate.mjs';

const HELP = `Studio OS — autonomous game development studio orchestrator

Usage: npm run studio -- <command> [arguments] [flags]

Set-up and inspection
  validate                          Check the registry, dependencies, charters and templates
  gen                               Regenerate department charters from the registry
  dept list                         List all departments
  dept show <id|slug>               Print a department charter
  genres                            List the genre catalogue and its activation tags
  status [project]                  Director dashboard (also writes STATUS.md)
  selftest                          Run the studio test suite

Project intake and planning
  intake "<concept>" [flags]        Director intake: detect genres, activate departments, plan the roadmap
      --title "..." --slug my-game --genre fps,rpg --tags mining,weather
      --dimension 2d|2.5d|3d|isometric --platforms webgl,desktop,mobile --force
  plan <project>                    Re-plan a project after its department set or the registry changes

Department workflow
  next <project> <dept>             Show the next ready task(s) for a department
  start <project> <task>            Mark a task in progress
  block <project> <task> --reason "..."   Block a task with a reason
  submit <project> <task> [--skip check] [--reason "..."] [--no-checks]
                                    Run the gate and send the deliverable to review
  review <project> <task> --approve|--reject [--note "..."] [--force]
                                    Studio Director decision
  prompt <project> <dept> [--all]   Emit the department worker instantiation prompt

Evidence
  perf record <project> --profile <id> --device <name> --method <how> --build <id> --fps <n> --p1 <n>
                          [--frame-ms n] [--memory n] [--draw-calls n] [--load-ms n] [--notes "..."]
  perf check <project>              Compare recorded measurements against the profile budgets
  assets add <project> --name "..." --type model --licence "CC0 1.0" --source <url> --creator "..."
                          [--attribution "..."] [--path ...] [--verified] [--verification "..."]
  assets import <project> [--from gallery|library|aegis] [--filter terrain] [--limit 50] [--reset] [--include-rejected]
  assets audit <project>            Enforce the licence and verification gate
  assets list <project>

Knowledge and decisions
  decision add <project> --title "..." --decision "..." [--alternatives "..."] [--consequences "..."]
  knowledge new <project> <template> --owner D02 [--name file.md]
  knowledge list <project>

Every flag can also be written as --key=value.`;

function parseArgs(args) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exitCode = 1;
  return false;
}

function registryOrFail() {
  const registry = loadRegistry(ROOT);
  return registry;
}

function projectOrFail(slug) {
  const project = resolveProject(ROOT, slug);
  if (!project) {
    fail(slug ? `No project "${slug}". Existing: ${listProjects(ROOT).join(', ') || 'none'}.` : 'No project specified and more than one exists.');
    return null;
  }
  return project;
}

// Only the acting department's queue is rewritten, so two departments can work and submit at once.
// Actions that can touch other queues (review unblocking dependants) pass allQueues.
function persist(project, registry, task, options = {}) {
  if (options.allQueues) {
    saveProject(project);
  } else {
    saveProject(project, { queues: false });
    if (task) saveQueue(project, task.dept);
  }
  writeDerivedDocs(ROOT, project, registry);
}

function deptOrFail(registry, token) {
  const dept = registry.byId.get(String(token).toUpperCase()) || registry.bySlug.get(token);
  if (!dept) {
    fail(`Unknown department "${token}". Run: npm run studio -- dept list`);
    return null;
  }
  return dept;
}

function taskOrFail(project, id) {
  const task = project.tasks.find((item) => item.id === id || item.deliverable === id);
  if (!task) {
    fail(`No task "${id}" in ${project.slug}. Run: npm run studio -- next ${project.slug} <dept>`);
    return null;
  }
  return task;
}

function printGate(gate) {
  console.log(`\nStructural gate: ${gate.structural.ok ? 'PASS' : 'FAIL'} — ${gate.structural.chars} chars, ${gate.structural.words} words`);
  for (const problem of gate.structural.problems) console.log(`  ✖ ${problem}`);
  if (gate.checks.length) {
    console.log('\nChecks:');
    for (const check of gate.checks) {
      const icon = check.status === 'pass' ? '✔' : check.status === 'skipped' ? '↷' : '✖';
      console.log(`  ${icon} ${check.name}: ${check.status}`);
      if (check.detail) console.log(`      ${String(check.detail).split('\n').join('\n      ')}`);
    }
  }
}

function cmdValidate() {
  const registry = registryOrFail();
  const { errors, warnings } = validateRegistry(registry);
  const sync = charterSync(ROOT, registry);
  console.log(`Registry: ${registry.departments.length} departments, ${registry.divisions.length} divisions, ${registry.phases.length} phases, ${registry.genres.length} genres, ${registry.performance.profiles.length} performance profiles.`);

  const templates = listFiles(path.join(ROOT, 'studio', 'knowledge', 'templates'));
  const requiredTemplates = ['deliverable.md', 'gdd.md', 'art-direction.md', 'technical-architecture.md', 'performance-budget.md', 'test-plan.md'];
  for (const template of requiredTemplates) {
    if (!templates.some((file) => path.basename(file) === template)) errors.push(`Missing knowledge template studio/knowledge/templates/${template}.`);
  }
  if (sync.missing.length) errors.push(`Charters missing: ${sync.missing.join(', ')}. Run: npm run studio -- gen`);
  if (sync.stale.length) errors.push(`Charters out of date: ${sync.stale.join(', ')}. Run: npm run studio -- gen`);

  for (const warning of warnings) console.log(`  ! ${warning}`);
  if (errors.length) {
    for (const error of errors) console.log(`  ✖ ${error}`);
    console.log(`\n${errors.length} error(s).`);
    process.exitCode = 1;
    return;
  }
  console.log('✔ Registry, dependency graph, charters and templates are consistent.');
}

function cmdGen() {
  const registry = registryOrFail();
  const written = generateCharters(ROOT, registry);
  console.log(`✔ Generated ${written.length} files in studio/departments.`);
}

function cmdDept(args) {
  const registry = registryOrFail();
  const [action, token] = args;
  if (!action || action === 'list') {
    console.log('| ID | Department | Division | Activation |');
    console.log('| --- | --- | --- | --- |');
    for (const dept of registry.departments) {
      console.log(`| ${dept.id} | ${dept.name} | ${registry.divisionById.get(dept.division)?.name} | ${activationLabel(dept)} |`);
    }
    return;
  }
  if (action === 'show') {
    const dept = deptOrFail(registry, token);
    if (dept) process.stdout.write(charterMarkdown(dept, registry));
    return;
  }
  fail(`Unknown dept action "${action}". Use list or show.`);
}

function cmdGenres() {
  const registry = registryOrFail();
  console.log('| Genre | Dimension | Tags | Keywords |');
  console.log('| --- | --- | --- | --- |');
  for (const genre of registry.genres) {
    console.log(`| \`${genre.id}\` ${genre.name} | ${genre.dimension} | ${genre.tags.join(', ')} | ${genre.keywords.slice(0, 5).join(', ')} |`);
  }
}

function cmdIntake(positionals, flags) {
  const registry = registryOrFail();
  const concept = positionals[0] || flags.concept;
  if (!concept) {
    fail('Pass a concept: npm run studio -- intake "a survival mining game on a frozen moon"');
    return;
  }
  const result = createProject(ROOT, registry, concept, flags);
  if (!result.ok) {
    fail(result.error);
    return;
  }
  const project = result.project;
  const current = currentPhase(project, registry);
  console.log(`\n✔ Project "${project.slug}" created — ${project.title}`);
  console.log(`  Dimension ${project.dimension.toUpperCase()} · platforms ${project.platforms.join(', ')} · perf ${project.perfProfiles.join(', ')}`);
  console.log(`  Genres: ${project.genreNames.join(', ') || 'none detected'}`);
  console.log(`  Departments active: ${project.departments.length} of ${registry.departments.length}`);
  for (const note of project.intakeNotes) console.log(`  · ${note}`);
  console.log('\n  Active departments:');
  for (const dept of project.departments) console.log(`    ${dept.id} ${dept.name} (${dept.reason})`);
  console.log(`\n  Tasks planned: ${project.tasks.length} · first phase: ${current ? current.name : '—'}`);
  console.log(`  Next: npm run studio -- status ${project.slug}`);
  console.log(`        npm run studio -- prompt ${project.slug} ${project.departments[0].id}`);
}

function cmdPlan(slug) {
  const registry = registryOrFail();
  const project = projectOrFail(slug);
  if (!project) return;
  replanProject(ROOT, project, registry);
  console.log(`✔ Re-planned ${project.slug}: ${project.tasks.length} tasks across ${project.departments.length} departments.`);
}

function cmdStatus(args, flags) {
  const registry = registryOrFail();
  const project = projectOrFail(args[0]);
  if (!project) return;
  const markdown = statusMarkdown(project, registry);
  writeText(path.join(project.dir, 'STATUS.md'), markdown);
  if (flags.json) {
    const counts = {};
    for (const task of project.tasks) counts[task.status] = (counts[task.status] || 0) + 1;
    console.log(JSON.stringify({ slug: project.slug, phase: currentPhase(project, registry)?.id, counts, tasks: project.tasks.length }, null, 2));
    return;
  }
  process.stdout.write(markdown);
}

function describeBlockers(project, task) {
  const state = dependencyState(project, task);
  if (state.missing.length) return `missing prerequisite tasks: ${state.missing.join(', ')}`;
  if (state.pending.length) return `waiting on: ${state.pending.map((dep) => `${dep.id} (${dep.status})`).join(', ')}`;
  return null;
}

function cmdNext(slug, token) {
  const registry = registryOrFail();
  const project = projectOrFail(slug);
  if (!project) return;
  const dept = deptOrFail(registry, token);
  if (!dept) return;
  const active = project.departments.find((entry) => entry.id === dept.id);
  if (!active) {
    console.log(`${dept.id} ${dept.name} is not active on ${project.slug} (${project.excluded.find((entry) => entry.id === dept.id)?.reason || 'not selected'}).`);
    return;
  }
  const ready = readyTasks(project, dept.id);
  if (ready.length) {
    for (const task of ready) {
      const phase = registry.phaseById.get(task.phase);
      console.log(`\n▶ ${task.id} — ${task.name}`);
      console.log(`  Phase ${phase?.order}. ${phase?.name} · artifact ${task.artifact}`);
      console.log(`  Checks: ${task.checks.join(', ') || 'structural only'}`);
      console.log('  Acceptance:');
      for (const criterion of task.acceptance) console.log(`    - ${criterion}`);
    }
    console.log(`\nStart it: npm run studio -- start ${project.slug} ${ready[0].id}`);
    return;
  }
  const mine = project.tasks.filter((task) => task.dept === dept.id);
  if (!mine.length) {
    console.log(`${dept.id} has no tasks on this project.`);
    return;
  }
  if (mine.every((task) => task.status === 'approved')) {
    console.log(`✔ All ${dept.id} tasks are approved. Nothing to pull.`);
    return;
  }
  console.log(`${dept.id} has no ready task right now:`);
  for (const task of mine.filter((item) => item.status !== 'approved')) {
    const blocker = describeBlockers(project, task) || `status ${task.status}`;
    console.log(`  · ${task.id} — ${blocker}`);
  }
}

function cmdStart(slug, taskId) {
  const registry = registryOrFail();
  const project = projectOrFail(slug);
  if (!project) return;
  const task = taskOrFail(project, taskId);
  if (!task) return;
  if (task.status === 'approved') return fail(`${task.id} is already approved.`);
  const state = dependencyState(project, task);
  if (state.pending.length || state.missing.length) return fail(`${task.id} is not ready: ${describeBlockers(project, task)}`);
  task.status = 'active';
  task.updatedAt = nowIso();
  persist(project, registry, task);
  appendMemory(project, task.deptSlug, `- ${new Date().toISOString().slice(0, 10)}: started \`${task.id}\` (${task.name}).`);
  console.log(`▶ ${task.id} in progress. Write ${task.artifact}, then submit.`);
}

function cmdBlock(slug, taskId, flags) {
  const registry = registryOrFail();
  const project = projectOrFail(slug);
  if (!project) return;
  const task = taskOrFail(project, taskId);
  if (!task) return;
  if (!flags.reason) return fail('A block needs --reason "..." so the Director knows what is missing.');
  task.status = 'blocked';
  task.blockedReason = flags.reason;
  task.updatedAt = nowIso();
  persist(project, registry, task);
  appendMemory(project, task.deptSlug, `- ${new Date().toISOString().slice(0, 10)}: blocked \`${task.id}\`: ${flags.reason}`);
  console.log(`⛔ ${task.id} blocked: ${flags.reason}`);
}

function cmdSubmit(slug, taskId, flags) {
  const registry = registryOrFail();
  const project = projectOrFail(slug);
  if (!project) return;
  const task = taskOrFail(project, taskId);
  if (!task) return;
  task.status = task.status === 'in-review' ? 'active' : task.status;
  const skip = flags['no-checks'] ? [...task.checks] : flags.skip ? String(flags.skip).split(',').map((item) => item.trim()) : [];
  const result = submitTask(project, task, registry, { skip, skipReason: flags.reason || 'skipped by the submitter' });
  if (!result.structural) return fail(result.error);
  writeText(path.join(project.dir, 'reviews', `${task.id}.md`), reviewMarkdown(project, task, task.lastGate));
  persist(project, registry, task);
  printGate(task.lastGate);
  if (!result.ok) {
    console.log(`\n✖ ${task.id} did not pass its gate and stays with ${task.dept}. Fix the problems above and submit again.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n🔍 ${task.id} is in review. Approve with: npm run studio -- review ${project.slug} ${task.id} --approve`);
}

function cmdReview(slug, taskId, flags) {
  const registry = registryOrFail();
  const project = projectOrFail(slug);
  if (!project) return;
  const task = taskOrFail(project, taskId);
  if (!task) return;
  if (!flags.approve && !flags.reject) return fail('Decide with --approve or --reject (and a --note).');
  const result = reviewTask(project, task, registry, {
    approve: Boolean(flags.approve),
    reject: Boolean(flags.reject),
    note: flags.note,
    force: Boolean(flags.force),
  });
  if (!result.ok) return fail(result.error);
  persist(project, registry, task, { allQueues: true });
  if (flags.approve) {
    console.log(`✔ ${task.id} approved.${flags.force ? ' (override recorded)' : ''}`);
    const unblocked = project.tasks.filter((item) => item.status === 'queued' && dependencyState(project, item).ready);
    if (unblocked.length) console.log(`  Now ready: ${unblocked.map((item) => item.id).join(', ')}`);
  } else {
    console.log(`↩ ${task.id} returned to ${task.dept}: ${flags.note || 'no note'}`);
  }
  appendMemory(project, task.deptSlug, `- ${new Date().toISOString().slice(0, 10)}: ${task.id} ${flags.approve ? 'approved' : `rejected — ${flags.note || 'no note'}`}.`);
}

function cmdPrompt(slug, token, flags) {
  const registry = registryOrFail();
  const project = projectOrFail(slug);
  if (!project) return;
  const dept = deptOrFail(registry, token);
  if (!dept) return;
  const active = project.departments.find((entry) => entry.id === dept.id);
  if (!active) return fail(`${dept.id} is not active on ${project.slug}: ${project.excluded.find((entry) => entry.id === dept.id)?.reason || 'not selected'}`);
  const tasks = project.tasks.filter((task) => task.dept === dept.id);
  const prompt = promptMarkdown(project, active, registry, tasks, { allTasks: Boolean(flags.all) });
  const file = path.join(project.dir, 'prompts', `${dept.slug}.md`);
  writeText(file, prompt);
  console.log(`Prompt written to ${path.relative(ROOT, file)}.`);
  if (!flags['no-print']) process.stdout.write(`\n${prompt}`);
}

function numberFlag(flags, key) {
  if (flags[key] === undefined) return undefined;
  const value = Number(flags[key]);
  return Number.isFinite(value) ? value : undefined;
}

function cmdPerf(action, positionals, flags) {
  const registry = registryOrFail();
  const project = projectOrFail(positionals[0]);
  if (!project) return;

  if (action === 'check') {
    const audit = perfAudit(project, registry);
    console.log('| Profile | State | Failures |');
    console.log('| --- | --- | --- |');
    for (const row of audit.rows) {
      console.log(`| ${row.profile} | ${row.status} | ${(row.failures || []).join('; ') || '—'} |`);
    }
    if (!audit.ok) {
      console.log('');
      for (const problem of audit.problems) console.log(`  ✖ ${problem}`);
      console.log('\nPerformance gate FAILED. Targets are measured, not claimed.');
      process.exitCode = 1;
      return;
    }
    console.log('\n✔ Performance gate passes on every declared profile.');
    return;
  }
  if (action !== 'record') return fail('Use "perf record" or "perf check".');

  const profileId = flags.profile;
  if (!profileId) return fail('--profile is required (see studio/registry/performance-profiles.json).');
  if (!registry.profileById.has(profileId)) return fail(`Unknown profile "${profileId}". Known: ${[...registry.profileById.keys()].join(', ')}`);
  const required = ['device', 'method', 'build', 'fps', 'p1'];
  for (const key of required) {
    if (flags[key] === undefined) return fail(`--${key} is required. A measurement without device, method and build is not evidence.`);
  }
  const record = perfRecord(project);
  record.measurements.push({
    profile: profileId,
    device: flags.device,
    method: flags.method,
    build: flags.build,
    avgFps: numberFlag(flags, 'fps'),
    p1Fps: numberFlag(flags, 'p1'),
    frameTimeMs: numberFlag(flags, 'frame-ms'),
    memoryMb: numberFlag(flags, 'memory'),
    drawCalls: numberFlag(flags, 'draw-calls'),
    triangles: numberFlag(flags, 'triangles'),
    textureMb: numberFlag(flags, 'texture'),
    loadMs: numberFlag(flags, 'load-ms'),
    particles: numberFlag(flags, 'particles'),
    notes: flags.notes || '',
    recordedAt: nowIso(),
  });
  savePerfRecord(project, record);
  project.perfMeasurements = record.measurements;
  const profile = registry.profileById.get(profileId);
  persist(project, registry);
  console.log(`✔ Recorded ${profileId}: ${record.measurements[record.measurements.length - 1].avgFps} fps avg on ${flags.device} (target ${profile.targetFps}).`);
}

const VETTED_SOURCES = ['polyhaven', 'ambientcg', 'kenney', '3dassets', 'quaternius', 'original'];

function cmdAssets(action, positionals, flags) {
  const registry = registryOrFail();
  const project = projectOrFail(positionals[0]);
  if (!project) return;
  const catalog = assetCatalog(project);

  if (action === 'audit' || !action) {
    const audit = licenceAudit(project, registry.gates.licencePolicy);
    console.log('| Asset | Licence | Verdict | Problem |');
    console.log('| --- | --- | --- | --- |');
    for (const row of audit.rows) {
      console.log(`| ${row.id} | ${row.licence || '—'} | ${row.verdict} | ${row.failures.join('; ') || '—'} |`);
    }
    if (!audit.ok) {
      console.log('');
      for (const problem of audit.problems.slice(0, 40)) console.log(`  ✖ ${problem}`);
      console.log(`\nLicence gate FAILED (${audit.problems.length} problem(s)).`);
      process.exitCode = 1;
      return;
    }
    console.log(`\n✔ ${audit.rows.length} assets pass the licence and verification gate.`);
    return;
  }

  if (action === 'list') {
    for (const asset of catalog.assets) {
      console.log(`${asset.id}  ${asset.licence}  ${asset.verified ? 'verified' : 'UNVERIFIED'}  ${asset.name}`);
    }
    console.log(`${catalog.assets.length} asset(s).`);
    return;
  }

  if (action === 'add') {
    if (!flags.name || !flags.licence || !flags.source) return fail('--name, --licence and --source are required.');
    const classification = classifyLicence(flags.licence, registry.gates.licencePolicy);
    const id = flags.id || slugify(flags.name);
    if (catalog.assets.some((asset) => asset.id === id)) return fail(`Asset ${id} already recorded.`);
    catalog.assets.push({
      id,
      name: flags.name,
      type: flags.type || 'model',
      licence: flags.licence,
      licenceVerdict: classification.verdict,
      creator: flags.creator || '',
      source: flags.source,
      attribution: flags.attribution || '',
      path: flags.path || '',
      verified: Boolean(flags.verified),
      verification: flags.verification || '',
      addedAt: nowIso(),
    });
    saveAssetCatalog(project, catalog);
    console.log(`${classification.verdict === 'allowed' ? '✔' : '✖'} Recorded ${id} — licence ${flags.licence} (${classification.verdict}).`);
    if (!flags.verified) console.log('  Not verified: state how it was checked with --verified --verification "..." before the licence gate can pass.');
    return;
  }

  if (action === 'import') {
    const source = flags.from || 'gallery';
    const limit = Number(flags.limit || 50);
    const includeRejected = Boolean(flags['include-rejected']);
    let incoming = [];
    if (source === 'gallery') {
      const file = path.join(ROOT, 'asset-gallery', 'assets.json');
      if (!exists(file)) return fail('asset-gallery/assets.json not found. Build it with npm run dev once, or import from library.');
      const data = readJson(file);
      incoming = (data.assets || []).map((asset) => {
        const first = (asset.files || [])[0]?.path;
        const type = asset.kind === 'material' ? 'material' : asset.kind === 'audio' ? 'audio' : asset.kind === 'sprite' ? 'sprite' : 'model';
        return {
          id: asset.id,
          name: asset.name,
          type,
          licence: asset.license,
          creator: asset.creator,
          source: asset.page,
          path: first ? `ASSET_MEMORY_BANK/${first}` : asset.thumb ? asset.thumb.replace(/^\.\.\//, '') : '',
          attribution: asset.creator || '',
          verification: `indexed by tools/asset-bank from ${asset.source}`,
          search: `${asset.name} ${asset.category} ${asset.subcategory} ${(asset.tags || []).join(' ')}`.toLowerCase(),
          vetted: VETTED_SOURCES.includes(String(asset.source || '').toLowerCase()),
        };
      });
    } else if (source === 'library') {
      const file = path.join(ROOT, 'graphics-library', 'manifest.json');
      if (!exists(file)) return fail('graphics-library/manifest.json not found.');
      const data = readJson(file);
      for (const [packId, pack] of Object.entries(data.packs || {})) {
        for (const model of pack.models || []) {
          incoming.push({
            id: `LIB-${slugify(packId)}-${slugify(model.name)}`.slice(0, 60),
            name: `${pack.title || packId}: ${model.name}`,
            type: 'model',
            licence: data.license,
            creator: 'Quaternius',
            source: 'https://quaternius.com',
            path: `graphics-library/${model.file}`,
            attribution: 'Quaternius (quaternius.com)',
            verification: 'Quaternius CC0 pack recorded in graphics-library/manifest.json',
            vetted: true,
          });
        }
      }
    } else if (source === 'aegis') {
      const file = path.join(ROOT, 'AEGIS_GRAPHICS_MEMORY', 'manifest.json');
      if (!exists(file)) return fail('AEGIS_GRAPHICS_MEMORY/manifest.json not found.');
      const data = readJson(file);
      const collections = data.collections || data;
      for (const [key, value] of Object.entries(collections)) {
        if (!value || typeof value !== 'object') continue;
        const assets = value.assets || [];
        for (const asset of assets) {
          incoming.push({
            id: asset.id || `${key}-${slugify(asset.name || '')}`,
            name: asset.name || asset.id,
            type: asset.type || 'reference',
            licence: asset.licence || asset.license || 'unknown',
            creator: asset.creator || '',
            source: asset.page || asset.source || '',
            path: asset.path || '',
            attribution: asset.creator || '',
            verification: 'AEGIS generation provenance',
            vetted: true,
          });
        }
      }
    } else {
      return fail(`Unknown import source "${source}". Use gallery, library or aegis.`);
    }

    const filter = String(flags.filter || '').toLowerCase().trim();
    if (filter) incoming = incoming.filter((asset) => (asset.search || `${asset.name} ${asset.path}`.toLowerCase()).includes(filter));
    if (flags.reset) {
      catalog.assets = [];
      console.log('Catalogue reset before import (--reset).');
    }

    let added = 0;
    let skipped = 0;
    let rejected = 0;
    const identity = (record) => record.path || record.source || record.id;
    for (const asset of incoming) {
      if (added >= limit) break;
      // Gallery ids are not globally unique (the same id can label records in several categories),
      // so identity is the file path, and the catalogue gets an id that is unique within the project.
      if (catalog.assets.some((existing) => identity(existing) === identity(asset))) {
        skipped += 1;
        continue;
      }
      const classification = classifyLicence(asset.licence, registry.gates.licencePolicy);
      if (classification.verdict !== 'allowed' && !includeRejected) {
        rejected += 1;
        continue;
      }
      let uniqueId = asset.id;
      if (catalog.assets.some((existing) => existing.id === uniqueId)) {
        const suffix = slugify(asset.search ? asset.search.split(' ').find((word) => /^\d{2}_/.test(word)) || asset.type : asset.type).slice(0, 12);
        uniqueId = `${asset.id}-${suffix}`;
        let n = 2;
        while (catalog.assets.some((existing) => existing.id === uniqueId)) uniqueId = `${asset.id}-${suffix}-${n++}`;
      }
      catalog.assets.push({
        id: uniqueId,
        galleryId: asset.id,
        name: asset.name,
        type: asset.type,
        licence: asset.licence,
        licenceVerdict: classification.verdict,
        creator: asset.creator,
        source: asset.source,
        attribution: asset.attribution,
        path: asset.path,
        verified: Boolean(asset.vetted) && classification.verdict === 'allowed',
        verification: asset.verification,
        addedAt: nowIso(),
      });
      added += 1;
    }
    saveAssetCatalog(project, catalog);
    console.log(`Imported ${added} asset(s) from ${source}${filter ? ` matching "${flags.filter}"` : ''}; skipped ${skipped} already recorded, ${rejected} refused on licence or verification.`);
    if (rejected) console.log('  Refused assets are not silently dropped: they are excluded because their licence is not shippable under studio policy.');
    return;
  }

  fail(`Unknown assets action "${action}". Use add, import, audit or list.`);
}

function cmdDecision(action, positionals, flags) {
  const project = projectOrFail(positionals[0]);
  if (!project) return;
  if (action !== 'add') return fail('Use: decision add <project> --title ... --decision ...');
  if (!flags.title || !flags.decision) return fail('--title and --decision are required.');
  const record = appendDecision(project, {
    title: flags.title,
    decision: flags.decision,
    alternatives: flags.alternatives,
    consequences: flags.consequences,
    owner: flags.owner || 'Studio Director',
    status: flags.status || 'accepted',
  });
  console.log(`✔ Decision ${record.id} recorded.`);
}

function cmdKnowledge(action, positionals, flags) {
  const project = projectOrFail(positionals[0]);
  if (!project) return;
  if (action === 'list' || !action) {
    const dir = path.join(project.dir, 'knowledge');
    for (const file of listFiles(dir)) console.log(path.relative(project.dir, file));
    return;
  }
  if (action !== 'new') return fail('Use: knowledge new <project> <template> --owner D02');
  const template = positionals[1];
  if (!template) return fail(`Pick a template: ${listFiles(path.join(ROOT, 'studio', 'knowledge', 'templates')).map((file) => path.basename(file)).join(', ')}`);
  const file = path.join(ROOT, 'studio', 'knowledge', 'templates', template.endsWith('.md') ? template : `${template}.md`);
  if (!exists(file)) return fail(`No template ${template}.`);
  const owner = flags.owner || 'Studio Director';
  const target = path.join(project.dir, 'knowledge', flags.name || `${slugify(flags.owner || template)}-${path.basename(file)}`);
  if (exists(target)) return fail(`${path.relative(ROOT, target)} already exists.`);
  writeText(target, readText(file)
    .replaceAll('{{PROJECT}}', project.title)
    .replaceAll('{{SLUG}}', project.slug)
    .replaceAll('{{OWNER}}', owner));
  console.log(`✔ ${path.relative(ROOT, target)} created (owner ${owner}).`);
}

function cmdSelftest() {
  console.log('Running the studio test suite…');
  const result = spawnSync('node', ['--test', 'studio/tests/'], { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) process.exitCode = result.status || 1;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positionals, flags } = parseArgs(rest);
  switch (command) {
    case undefined:
    case 'help':
    case '--help':
      console.log(HELP);
      return;
    case 'validate':
      cmdValidate();
      return;
    case 'gen':
      cmdGen();
      return;
    case 'dept':
      cmdDept(positionals);
      return;
    case 'genres':
      cmdGenres();
      return;
    case 'intake':
      cmdIntake(positionals, flags);
      return;
    case 'plan':
      cmdPlan(positionals[0]);
      return;
    case 'status':
      cmdStatus(positionals, flags);
      return;
    case 'next':
      cmdNext(positionals[0], positionals[1]);
      return;
    case 'start':
      cmdStart(positionals[0], positionals[1]);
      return;
    case 'block':
      cmdBlock(positionals[0], positionals[1], flags);
      return;
    case 'submit':
      cmdSubmit(positionals[0], positionals[1], flags);
      return;
    case 'review':
      cmdReview(positionals[0], positionals[1], flags);
      return;
    case 'prompt':
      cmdPrompt(positionals[0], positionals[1], flags);
      return;
    case 'perf':
      cmdPerf(positionals[0], positionals.slice(1), flags);
      return;
    case 'assets':
      cmdAssets(positionals[0], positionals.slice(1), flags);
      return;
    case 'decision':
      cmdDecision(positionals[0], positionals.slice(1), flags);
      return;
    case 'knowledge':
      cmdKnowledge(positionals[0], positionals.slice(1), flags);
      return;
    case 'selftest':
      cmdSelftest();
      return;
    default:
      fail(`Unknown command "${command}". Run: npm run studio -- help`);
  }
}

main();
