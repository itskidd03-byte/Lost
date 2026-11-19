import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, ensureDir, exists, listFiles, nowIso, readJson, readText, rel, slugify, tryReadJson, writeJson, writeText,
} from './util.mjs';
import { buildTasks, mergeTasks } from './planner.mjs';
import { detectIntake } from './intake.mjs';
import { roadmapMarkdown, specMarkdown, statusMarkdown } from './render.mjs';

export function projectsDir(root = ROOT) {
  return path.join(root, 'studio', 'projects');
}

export function projectDir(root, slug) {
  return path.join(projectsDir(root), slug);
}

export function listProjects(root = ROOT) {
  const dir = projectsDir(root);
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function loadProject(root, slug) {
  const dir = projectDir(root, slug);
  const metaFile = path.join(dir, 'project.json');
  if (!exists(metaFile)) return null;
  const meta = readJson(metaFile);
  const tasks = [];
  const queuesDir = path.join(dir, 'queues');
  for (const file of listFiles(queuesDir)) {
    const queue = tryReadJson(file, { tasks: [] });
    tasks.push(...(queue.tasks || []));
  }
  const perf = tryReadJson(path.join(dir, 'perf', 'measurements.json'), { measurements: [] });
  const catalog = tryReadJson(path.join(dir, 'assets.json'), { assets: [] });
  return { ...meta, assets: catalog.assets || [], tasks, perfMeasurements: perf.measurements || [], dir };
}

function writeQueue(project, dept) {
  const file = path.join(project.dir, 'queues', `${dept.slug}.json`);
  writeJson(file, {
    department: { id: dept.id, slug: dept.slug, name: dept.name },
    updatedAt: nowIso(),
    tasks: project.tasks.filter((task) => task.dept === dept.id),
  });
  return file;
}

/**
 * Persist project metadata and, by default, every department queue. Task-level CLI commands pass
 * { queues: false } and use saveQueue so two departments working at once cannot overwrite each other.
 */
export function saveProject(project, options = {}) {
  const dir = project.dir;
  ensureDir(dir);
  const { tasks, dir: _dir, perfMeasurements: _perf, assets: _assets, ...meta } = project;
  writeJson(path.join(dir, 'project.json'), { ...meta, updatedAt: nowIso(), taskCount: tasks.length });
  if (options.queues === false) return project;
  const queuesDir = path.join(dir, 'queues');
  ensureDir(queuesDir);
  const keep = new Set();
  for (const dept of project.departments) {
    keep.add(path.basename(writeQueue(project, dept)));
  }
  for (const file of listFiles(queuesDir)) {
    if (!keep.has(path.basename(file))) fs.unlinkSync(file);
  }
  return project;
}

export function saveQueue(project, deptId) {
  const dept = project.departments.find((entry) => entry.id === deptId);
  if (!dept) return null;
  ensureDir(path.join(project.dir, 'queues'));
  return writeQueue(project, dept);
}

export function createProject(root, registry, concept, options = {}) {
  const intake = detectIntake(concept, options, registry);
  if (!intake.ok) return { ok: false, error: intake.error };

  const title = options.title || concept.split(/[.!?]/)[0].trim().slice(0, 90) || 'Untitled Project';
  const slug = slugify(options.slug || title);
  const dir = projectDir(root, slug);
  if (exists(path.join(dir, 'project.json')) && !options.force) {
    return { ok: false, error: `Project "${slug}" already exists. Use --force to re-plan it.` };
  }
  ensureDir(dir);
  for (const sub of ['queues', 'memory', 'knowledge', 'reviews', 'deliverables', 'perf', 'evidence']) {
    ensureDir(path.join(dir, sub));
  }

  const departments = [];
  const excluded = [];
  for (const entry of intake.departments) {
    const dept = registry.byId.get(entry.id);
    const record = { id: dept.id, slug: dept.slug, name: dept.name, division: dept.division, reason: entry.reason };
    if (entry.active) departments.push(record);
    else excluded.push(record);
  }

  const project = {
    slug,
    title,
    concept,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    dimension: intake.dimension,
    platforms: intake.platforms,
    perfProfiles: intake.perfProfiles,
    genres: intake.genres,
    genreNames: intake.genreNames,
    tags: intake.tags,
    intakeNotes: intake.notes,
    intakeBasis: intake.basis,
    status: 'in-development',
    phase: 'concept',
    departments,
    excluded,
    assets: [],
    perf: {},
    decisions: [],
    dir,
  };

  const prior = exists(path.join(dir, 'project.json')) ? loadProject(root, slug) : null;
  project.assets = prior?.assets || [];
  const fresh = buildTasks(project, registry);
  project.tasks = prior ? mergeTasks(prior.tasks, fresh) : fresh;

  saveProject(project);
  if (!exists(path.join(dir, 'assets.json'))) saveAssetCatalog(project, { assets: [] });
  scaffoldKnowledge(root, project);
  writeMemoryStubs(root, project, registry);
  writeQueueScaffolds(project);
  writeDerivedDocs(root, project, registry);
  return { ok: true, project };
}

export function replanProject(root, project, registry) {
  const fresh = buildTasks(project, registry);
  project.tasks = mergeTasks(project.tasks, fresh);
  saveProject(project);
  writeDerivedDocs(root, project, registry);
  return project;
}

export function memoryFile(project, deptSlug) {
  return path.join(project.dir, 'memory', `${deptSlug}.md`);
}

export function appendMemory(project, deptSlug, text) {
  const file = memoryFile(project, deptSlug);
  const current = exists(file) ? readText(file) : `# Working memory — ${deptSlug}\n`;
  writeText(file, `${current.trimEnd()}\n\n${text.trim()}\n`);
  return file;
}

export function appendDecision(project, entry) {
  const file = path.join(project.dir, 'decision-log.md');
  const index = (project.decisions || []).length + 1;
  const id = `D-${String(index).padStart(4, '0')}`;
  const record = { id, at: nowIso(), ...entry };
  project.decisions = [...(project.decisions || []), record];
  const block = [
    `## ${id} — ${entry.title}`,
    '',
    `- Date: ${record.at}`,
    `- Owner: ${entry.owner || 'Studio Director'}`,
    `- Status: ${entry.status || 'accepted'}`,
    '',
    `**Decision.** ${entry.decision}`,
    '',
    `**Alternatives considered.** ${entry.alternatives || 'None recorded.'}`,
    '',
    `**Consequences.** ${entry.consequences || 'None recorded.'}`,
    '',
  ].join('\n');
  const header = exists(file) ? readText(file) : '# Decision log\n\nAppend-only. Every creative, technical or scope decision that changes an approved spec is recorded here.\n\n';
  writeText(file, `${header.trimEnd()}\n\n${block}`);
  saveProject(project);
  return record;
}

export function assetCatalog(project) {
  const file = path.join(project.dir, 'assets.json');
  return tryReadJson(file, { assets: [] });
}

export function saveAssetCatalog(project, catalog) {
  writeJson(path.join(project.dir, 'assets.json'), catalog);
}

export function perfRecord(project) {
  return tryReadJson(path.join(project.dir, 'perf', 'measurements.json'), { measurements: [] });
}

export function savePerfRecord(project, record) {
  const file = path.join(project.dir, 'perf', 'measurements.json');
  writeJson(file, record);
}

export function writeDerivedDocs(root, project, registry) {
  writeText(path.join(project.dir, 'ROADMAP.md'), roadmapMarkdown(project, registry));
  writeText(path.join(project.dir, 'STATUS.md'), statusMarkdown(project, registry));
  writeText(path.join(project.dir, 'SPEC.md'), specMarkdown(project, registry));
}

export function scaffoldKnowledge(root, project) {
  const templateDir = path.join(root, 'studio', 'knowledge', 'templates');
  const core = [
    ['gdd.md', 'D02'],
    ['art-direction.md', 'D01'],
    ['technical-architecture.md', 'D17'],
    ['performance-budget.md', 'D34'],
    ['test-plan.md', 'D33'],
  ];
  const knowledgeDir = path.join(project.dir, 'knowledge');
  ensureDir(knowledgeDir);
  for (const [name, owner] of core) {
    const source = path.join(templateDir, name);
    const target = path.join(knowledgeDir, name);
    if (!exists(source) || exists(target)) continue;
    const body = readText(source)
      .replaceAll('{{PROJECT}}', project.title)
      .replaceAll('{{SLUG}}', project.slug)
      .replaceAll('{{OWNER}}', owner);
    writeText(target, body);
  }
  writeText(path.join(project.dir, 'knowledge', 'README.md'), [
    `# Shared knowledge — ${project.title}`,
    '',
    'One owner per document. A non-owner department proposes changes through a decision record instead of editing directly.',
    '',
    '| Document | Owner | Revision |',
    '| --- | --- | --- |',
    '| `gdd.md` | D02 Game Design | 1 |',
    '| `art-direction.md` | D01 Creative Direction | 1 |',
    '| `technical-architecture.md` | D17 Engine Architecture | 1 |',
    '| `performance-budget.md` | D34 Performance Engineering | 1 |',
    '| `test-plan.md` | D33 Quality Assurance | 1 |',
    '',
  ].join('\n'));
}

export function writeMemoryStubs(root, project, registry) {
  for (const dept of project.departments) {
    const file = memoryFile(project, dept.slug);
    if (exists(file)) continue;
    const full = registry.byId.get(dept.id);
    writeText(file, [
      `# Working memory — ${dept.id} ${dept.name}`,
      '',
      `Project: ${project.title} (\`${project.slug}\`)`,
      `Division: ${full.division}`,
      `Activated because: ${dept.reason}`,
      '',
      '## Current state',
      '- No work started. Pull your queue with `npm run studio -- next ' + project.slug + ' ' + dept.id + '`.',
      '',
      '## Notes and findings',
      '',
      '## Open questions',
      '',
      '## Assistance requested',
      '',
    ].join('\n'));
  }
}

export function writeQueueScaffolds(project) {
  for (const dept of project.departments) {
    ensureDir(path.join(project.dir, 'deliverables', dept.slug));
  }
}

export function resolveProject(root, slug) {
  if (!slug) {
    const projects = listProjects(root);
    if (projects.length === 1) return loadProject(root, projects[0]);
    return null;
  }
  return loadProject(root, slug);
}

export function projectRelative(project, absolute) {
  return rel(project.dir, absolute);
}
