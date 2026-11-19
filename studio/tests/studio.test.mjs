import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRegistry, validateRegistry } from '../lib/registry.mjs';
import { detectIntake } from '../lib/intake.mjs';
import { createProject, saveProject } from '../lib/store.mjs';
import {
  classifyLicence, licenceAudit, perfAudit, reviewTask, submitTask,
} from '../lib/gates.mjs';
import { dependencyState, readyTasks } from '../lib/planner.mjs';
import { charterSync } from '../lib/generate.mjs';
import { statusMarkdown } from '../lib/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const registry = loadRegistry(ROOT);

function tempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-os-'));
  fs.cpSync(path.join(ROOT, 'studio', 'registry'), path.join(dir, 'studio', 'registry'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'studio', 'knowledge', 'templates'), path.join(dir, 'studio', 'knowledge', 'templates'), { recursive: true });
  return dir;
}

function newProject(concept, options = {}) {
  const root = tempRoot();
  const result = createProject(root, registry, concept, options);
  assert.equal(result.ok, true, result.error);
  return { root, project: result.project };
}

function writeArtifact(project, task, extra = '') {
  const file = path.join(project.dir, task.artifact);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = [
    '---',
    `owner: ${task.dept}`,
    `department: ${task.dept}`,
    'revision: 1',
    '---',
    '',
    `# ${task.name}`,
    '',
    '## Deliverable',
    '',
    'Produced and verified in this repository. '.repeat(12),
    extra,
    '',
    '## Acceptance',
    '',
    ...task.acceptance.map((criterion) => `- ${criterion}: met, see evidence below.`),
    '',
    '## Evidence',
    '',
    `- Command: npm run studio -- submit ${project.slug} ${task.id}`,
    '',
    '## Handoff',
    '',
    'Consumed by the departments declared in the registry handoff list.',
    '',
  ].join('\n');
  fs.writeFileSync(file, body);
  return file;
}

test('registry is internally consistent and charters are in sync', () => {
  const { errors } = validateRegistry(registry);
  assert.deepEqual(errors, []);
  assert.equal(registry.departments.length, 41);
  assert.equal(registry.divisions.length, 7);
  const sync = charterSync(ROOT, registry);
  assert.deepEqual(sync.missing, []);
  assert.deepEqual(sync.stale, []);
});

test('every department has its own instructions, deliverables, gates and paths', () => {
  for (const dept of registry.departments) {
    assert.ok(dept.mission.length > 20, `${dept.id} mission`);
    assert.ok(dept.capabilities.length >= 3, `${dept.id} capabilities`);
    assert.ok(dept.deliverables.length >= 2, `${dept.id} deliverables`);
    for (const deliverable of dept.deliverables) {
      assert.ok(deliverable.acceptance.length >= 2, `${dept.id}/${deliverable.id} acceptance`);
    }
    assert.ok(dept.gates.length, `${dept.id} gates`);
    const charter = fs.readFileSync(path.join(ROOT, 'studio', 'departments', `${dept.slug}.md`), 'utf8');
    assert.match(charter, /## System instructions/);
    assert.match(charter, /## Acceptance criteria/);
    assert.match(charter, new RegExp(dept.slug));
  }
});

test('intake activates genre-specific departments and skips irrelevant ones', () => {
  const mining = detectIntake(
    'A first-person survival mining game: dig ore veins underground, refine metals, craft machines and trade in a colony economy.',
    {},
    registry,
  );
  assert.equal(mining.ok, true);
  const active = new Set(mining.departments.filter((entry) => entry.active).map((entry) => entry.id));
  for (const id of ['D01', 'D02', 'D18', 'D19', 'D26', 'D29', 'D30', 'D33', 'D34', 'D37']) {
    assert.ok(active.has(id), `expected ${id} active for a mining game`);
  }
  for (const id of ['D23', 'D24', 'D28', 'D21']) {
    assert.ok(!active.has(id), `expected ${id} inactive for a mining game`);
  }

  const fps = detectIntake('A realistic first-person shooter with ballistics, recoil patterns, weapon handling and cover combat.', {}, registry);
  const fpsActive = new Set(fps.departments.filter((entry) => entry.active).map((entry) => entry.id));
  for (const id of ['D10', 'D11', 'D13', 'D23']) assert.ok(fpsActive.has(id), `expected ${id} active for an FPS`);
  for (const id of ['D26', 'D25', 'D24', 'D28']) assert.ok(!fpsActive.has(id), `expected ${id} inactive for an FPS`);

  const twoD = detectIntake('A side-scrolling 2D platformer with pixel art and a hand-drawn story.', {}, registry);
  assert.equal(twoD.dimension, '2d');
  const twoDActive = new Set(twoD.departments.filter((entry) => entry.active).map((entry) => entry.id));
  assert.ok(twoDActive.has('D07'), 'expected 2D art active');
  assert.ok(!twoDActive.has('D06'), 'expected 3D modelling inactive on a 2D project');
});

test('intake accepts unknown genres via tags and rejects invalid input', () => {
  const original = detectIntake('A quiet abstract puzzle game about refracting light through glass.', {}, registry);
  assert.equal(original.ok, true);
  assert.equal(original.genres.length, 0);
  const withTags = detectIntake('A quiet abstract puzzle game about refracting light through glass.', { tags: 'mining' }, registry);
  const active = new Set(withTags.departments.filter((entry) => entry.active).map((entry) => entry.id));
  assert.ok(active.has('D26'), 'manual tags must be able to activate a specialist department');

  const bad = detectIntake('A game about absolutely nothing in particular, honestly.', { genre: 'not-a-genre' }, registry);
  assert.equal(bad.ok, false);
  const badDimension = detectIntake('A shooter with a lot of shooting in it.', { dimension: '9d' }, registry);
  assert.equal(badDimension.ok, false);
  assert.equal(detectIntake('short', {}, registry).ok, false);
});

test('planning creates a queue per active department with resolvable dependencies', () => {
  const { project } = newProject('A city builder with population simulation, economy and construction on a river delta.');
  assert.ok(project.tasks.length > 40);

  const taskIds = new Set(project.tasks.map((task) => task.id));
  const deptIds = new Set(project.departments.map((dept) => dept.id));
  for (const task of project.tasks) {
    assert.ok(deptIds.has(task.dept), `${task.id} belongs to an active department`);
    for (const dep of task.dependsOn) {
      assert.ok(taskIds.has(dep), `${task.id} depends on missing ${dep}`);
      const depTask = project.tasks.find((item) => item.id === dep);
      assert.ok(deptIds.has(depTask.dept), `${task.id} depends on an inactive department`);
    }
  }
  const queues = fs.readdirSync(path.join(project.dir, 'queues'));
  assert.equal(queues.length, project.departments.length);
  assert.ok(fs.existsSync(path.join(project.dir, 'SPEC.md')));
  assert.ok(fs.existsSync(path.join(project.dir, 'ROADMAP.md')));
  assert.ok(fs.existsSync(path.join(project.dir, 'knowledge', 'gdd.md')));
  assert.ok(fs.existsSync(path.join(project.dir, 'assets.json')));
});

test('structural gate rejects an unwritten deliverable and accepts a complete one', () => {
  const { root, project } = newProject('A top-down 2D roguelike about scavenging a flooded archive.');
  const task = project.tasks.find((item) => item.id === 'D01-concept-brief');
  assert.ok(task);

  const failed = submitTask(project, task, registry, {});
  assert.equal(failed.ok, false);
  assert.equal(task.status, 'queued');

  writeArtifact(project, task);
  const passed = submitTask(project, task, registry, {});
  assert.equal(passed.ok, true, failed.structural.problems.join(', '));
  assert.equal(task.status, 'in-review');
  saveProject(project);

  const approved = reviewTask(project, task, registry, { approve: true, note: 'meets every criterion' });
  assert.equal(approved.ok, true, approved.error);
  assert.equal(task.status, 'approved');

  const next = readyTasks(project, 'D01').map((item) => item.id);
  assert.deepEqual(next, ['D01-art-direction']);
});

test('submit refuses a deliverable whose prerequisites are not approved', () => {
  const { project } = newProject('An open world survival game with weather, wildlife and base building.');
  const blockedTask = project.tasks.find((item) => item.id === 'D18-gameplay-systems');
  assert.ok(blockedTask);
  writeArtifact(project, blockedTask);
  const result = submitTask(project, blockedTask, registry, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /Prerequisites/);
});

test('skipped checks cannot be approved without an explicit override', () => {
  const { project } = newProject('A first-person shooter on a derelict station.');
  const task = project.tasks.find((item) => item.id === 'D18-prototype-build');
  assert.ok(task);
  for (const dep of task.dependsOn) {
    const depTask = project.tasks.find((item) => item.id === dep);
    depTask.status = 'approved';
  }
  writeArtifact(project, task);
  const submitted = submitTask(project, task, registry, { skip: ['typecheck'], skipReason: 'dependencies not installed in this environment' });
  assert.equal(submitted.ok, true);
  assert.equal(task.lastGate.checks.find((check) => check.name === 'typecheck').status, 'skipped');

  const refused = reviewTask(project, task, registry, { approve: true });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /skipped/);

  const forced = reviewTask(project, task, registry, { approve: true, force: true, note: 'typecheck runs in CI; approved on recorded CI evidence' });
  assert.equal(forced.ok, true, forced.error);
});

test('performance gate demands measured numbers on every declared profile', () => {
  const { project } = newProject('A webgl farming life sim with seasons and villagers.');
  project.perfProfiles = ['webgl-desktop'];
  const empty = perfAudit(project, registry);
  assert.equal(empty.ok, false);
  assert.match(empty.problems.join(' '), /no measurement/);

  project.perfMeasurements = [{
    profile: 'webgl-desktop', device: 'Chrome on Intel Iris Xe', method: '30s capture of the village scene', build: 'abc123',
    avgFps: 61, p1Fps: 52, frameTimeMs: 16.4, memoryMb: 800, drawCalls: 180, loadMs: 4000,
  }];
  const passing = perfAudit(project, registry);
  assert.equal(passing.ok, true, passing.problems.join('; '));

  project.perfMeasurements.push({
    profile: 'webgl-desktop', device: 'Chrome on Intel Iris Xe', method: '30s capture', build: 'abc124',
    avgFps: 39, p1Fps: 21, frameTimeMs: 25, memoryMb: 1400, drawCalls: 420, loadMs: 12000,
  });
  const failing = perfAudit(project, registry);
  assert.equal(failing.ok, false);
  const problems = failing.problems.join(' ');
  assert.match(problems, /avgFps 39 below target 60/);
  assert.match(problems, /memory 1400 MB above budget/);
  assert.match(problems, /draw calls 420 above budget/);
});

test('licence gate refuses unknown, non-commercial and unattributed assets', () => {
  const policy = registry.gates.licencePolicy;
  assert.equal(classifyLicence('CC0 1.0 Universal', policy).verdict, 'allowed');
  assert.equal(classifyLicence('CC BY 4.0', policy).attributionRequired, true);
  assert.equal(classifyLicence('CC BY-SA 4.0', policy).verdict, 'denied');
  assert.equal(classifyLicence('CC BY-NC 4.0', policy).verdict, 'denied');
  assert.equal(classifyLicence('Proprietary, all rights reserved', policy).verdict, 'denied');
  assert.equal(classifyLicence('', policy).verdict, 'unknown');

  const { project } = newProject('A sandbox building game with modular construction.');
  assert.equal(licenceAudit(project, policy).ok, false);

  project.assets = [{
    id: 'T-1', name: 'Bark texture', licence: 'CC0 1.0', creator: 'ambientCG', source: 'https://ambientcg.com/view?id=Bark', verified: true,
  }];
  assert.equal(licenceAudit(project, policy).ok, true);

  project.assets.push({
    id: 'T-2', name: 'Bark texture remix', licence: 'CC BY 4.0', creator: 'someone', source: 'https://example.com', verified: true,
  });
  const missingAttribution = licenceAudit(project, policy);
  assert.equal(missingAttribution.ok, false);
  assert.match(missingAttribution.problems.join(' '), /attribution/);
});

test('status dashboard reports state, blockers and measured performance', () => {
  const { project } = newProject('A tactical military strategy game with turn-based squad combat.');
  const markdown = statusMarkdown(project, registry);
  assert.match(markdown, /# Status/);
  assert.match(markdown, /Deliverables approved/);
  assert.match(markdown, /Performance targets/);
  assert.match(markdown, /Asset licensing/);
  assert.match(markdown, /Needs revision/);
  const task = project.tasks.find((item) => item.id === 'D02-gdd');
  const state = dependencyState(project, task);
  assert.equal(state.ready, false, 'the GDD cannot be ready before the concept brief is approved');
});
