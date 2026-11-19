import path from 'node:path';
import { ROOT, listFiles, readJson, exists } from './util.mjs';

export function loadRegistry(root = ROOT) {
  const dir = path.join(root, 'studio', 'registry');
  const divisions = readJson(path.join(dir, 'divisions.json')).divisions;
  const departmentFiles = listFiles(path.join(dir, 'departments'));
  const departments = departmentFiles
    .flatMap((file) => readJson(file).departments)
    .sort((a, b) => a.id.localeCompare(b.id));
  const genres = readJson(path.join(dir, 'genres.json')).genres;
  const phases = readJson(path.join(dir, 'phases.json')).phases;
  const performance = readJson(path.join(dir, 'performance-profiles.json'));
  const gates = readJson(path.join(dir, 'gates.json'));

  const byId = new Map(departments.map((dept) => [dept.id, dept]));
  const bySlug = new Map(departments.map((dept) => [dept.slug, dept]));
  const divisionById = new Map(divisions.map((division) => [division.id, division]));
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const profileById = new Map(performance.profiles.map((profile) => [profile.id, profile]));
  const genreById = new Map(genres.map((genre) => [genre.id, genre]));

  return {
    root,
    registryDir: dir,
    divisions,
    departments,
    genres,
    phases,
    performance,
    gates,
    byId,
    bySlug,
    divisionById,
    phaseById,
    profileById,
    genreById,
    departmentFiles,
  };
}

function deptKey(deptId, artifactId) {
  return `${deptId}:${artifactId}`;
}

export function resolveDepartments(registry, ids) {
  return ids.map((id) => registry.byId.get(id)).filter(Boolean);
}

export function tasksForDepartment(project, deptId) {
  return (project.tasks || []).filter((task) => task.dept === deptId);
}

export function validateRegistry(registry) {
  const errors = [];
  const warnings = [];
  const { departments, divisions, phases, gates, performance, genres } = registry;

  if (!departments.length) errors.push('No departments found in studio/registry/departments.');
  if (!divisions.length) errors.push('No divisions found in studio/registry/divisions.json.');
  if (!phases.length) errors.push('No phases found in studio/registry/phases.json.');

  const divisionIds = new Set(divisions.map((division) => division.id));
  const phaseIds = new Set(phases.map((phase) => phase.id));
  const checkIds = new Set(Object.keys(gates.checks || {}));
  const profileIds = new Set(performance.profiles.map((profile) => profile.id));

  const ids = new Set();
  const slugs = new Set();
  const divisionUse = new Map(divisions.map((division) => [division.id, 0]));

  for (const dept of departments) {
    const where = `department ${dept.id || '(no id)'}`;
    if (!/^D\d{2}$/.test(dept.id || '')) errors.push(`${where}: id must look like D01.`);
    if (ids.has(dept.id)) errors.push(`${where}: duplicate id.`);
    ids.add(dept.id);
    if (!dept.slug || !/^[a-z0-9-]+$/.test(dept.slug)) errors.push(`${where}: slug missing or invalid.`);
    if (slugs.has(dept.slug)) errors.push(`${where}: duplicate slug ${dept.slug}.`);
    slugs.add(dept.slug);
    if (!dept.name) errors.push(`${where}: name missing.`);
    if (!dept.mission || dept.mission.length < 20) errors.push(`${where}: mission missing or too short.`);
    if (!divisionIds.has(dept.division)) errors.push(`${where}: unknown division ${dept.division}.`);
    else divisionUse.set(dept.division, divisionUse.get(dept.division) + 1);

    const activation = dept.activation || {};
    if (!activation.always && !(Array.isArray(activation.any) && activation.any.length)) {
      errors.push(`${where}: activation must be { always: true } or { any: [tags] }.`);
    }
    if (activation.always && Array.isArray(activation.any)) {
      warnings.push(`${where}: has both always and any tags; always wins.`);
    }
    if (activation.dimensions && !activation.dimensions.every((d) => ['2d', '2.5d', '3d', 'isometric'].includes(d))) {
      errors.push(`${where}: unknown dimension in activation.dimensions.`);
    }

    if (!Array.isArray(dept.capabilities) || dept.capabilities.length < 3) {
      errors.push(`${where}: needs at least three capabilities.`);
    }

    const deliverables = dept.deliverables || [];
    if (!deliverables.length) errors.push(`${where}: has no deliverables.`);
    const artifactIds = new Set();
    for (const deliverable of deliverables) {
      const dw = `${where} / ${deliverable.id || '(no id)'}`;
      if (!/^[a-z0-9-]+$/.test(deliverable.id || '')) errors.push(`${dw}: invalid deliverable id.`);
      if (artifactIds.has(deliverable.id)) errors.push(`${dw}: duplicate deliverable id.`);
      artifactIds.add(deliverable.id);
      if (!deliverable.name) errors.push(`${dw}: missing name.`);
      if (!phaseIds.has(deliverable.phase)) errors.push(`${dw}: unknown phase ${deliverable.phase}.`);
      if (!Array.isArray(deliverable.acceptance) || deliverable.acceptance.length < 2) {
        errors.push(`${dw}: needs at least two acceptance criteria.`);
      }
      for (const check of deliverable.checks || []) {
        if (!checkIds.has(check)) errors.push(`${dw}: unknown check ${check}.`);
      }
    }

    for (const dep of dept.handoffs || []) {
      if (!registry.byId.has(dep)) errors.push(`${where}: handoff to unknown department ${dep}.`);
    }
    for (const dep of dept.consults || []) {
      if (!registry.byId.has(dep)) errors.push(`${where}: consult to unknown department ${dep}.`);
    }
  }

  // contiguous ids
  const numeric = [...ids].map((id) => Number(id.slice(1))).sort((a, b) => a - b);
  numeric.forEach((n, index) => {
    if (n !== index + 1) errors.push(`Department ids are not contiguous: expected D${String(index + 1).padStart(2, '0')}, found D${String(n).padStart(2, '0')}.`);
  });

  for (const division of divisions) {
    if (!divisionUse.get(division.id)) errors.push(`Division ${division.id} has no departments.`);
  }

  // deliverables and dependency integrity
  const allArtifacts = new Map();
  for (const dept of departments) {
    for (const deliverable of dept.deliverables || []) {
      allArtifacts.set(deptKey(dept.id, deliverable.id), { dept, deliverable });
    }
  }

  for (const dept of departments) {
    const ordered = [...(dept.deliverables || [])].sort(
      (a, b) => (registry.phaseById.get(a.phase)?.order || 99) - (registry.phaseById.get(b.phase)?.order || 99),
    );
    const previous = new Map();
    for (const deliverable of ordered) {
      const where = `department ${dept.id} / ${deliverable.id}`;
      for (const dep of deliverable.dependsOn || []) {
        const [depDept, depArtifact] = String(dep).split(':');
        if (!depDept || !depArtifact) {
          errors.push(`${where}: dependency ${dep} must look like D02:gdd.`);
          continue;
        }
        if (!registry.byId.has(depDept)) errors.push(`${where}: dependency on unknown department ${depDept}.`);
        if (!allArtifacts.has(deptKey(depDept, depArtifact))) errors.push(`${where}: dependency on unknown deliverable ${dep}.`);
        if (depDept === dept.id && depArtifact === deliverable.id) errors.push(`${where}: depends on itself.`);
      }
      previous.set(deliverable.id, ordered[Math.max(0, ordered.indexOf(deliverable) - 1)]?.id);
    }
  }

  // cycle detection over explicit + implicit same-department ordering
  const edges = new Map();
  for (const [key] of allArtifacts) edges.set(key, []);
  for (const dept of departments) {
    const ordered = [...(dept.deliverables || [])].sort(
      (a, b) => (registry.phaseById.get(a.phase)?.order || 99) - (registry.phaseById.get(b.phase)?.order || 99),
    );
    ordered.forEach((deliverable, index) => {
      const key = deptKey(dept.id, deliverable.id);
      for (const dep of deliverable.dependsOn || []) {
        const [depDept, depArtifact] = String(dep).split(':');
        const depKey = deptKey(depDept, depArtifact);
        if (edges.has(depKey) && edges.has(key)) edges.get(depKey).push(key);
      }
      if (index > 0) {
        const priorKey = deptKey(dept.id, ordered[index - 1].id);
        if (edges.has(priorKey)) edges.get(priorKey).push(key);
      }
    });
  }
  const state = new Map();
  const visit = (node, trail) => {
    if (state.get(node) === 'done') return;
    if (state.get(node) === 'open') {
      errors.push(`Dependency cycle: ${[...trail, node].join(' -> ')}`);
      return;
    }
    state.set(node, 'open');
    for (const next of edges.get(node) || []) visit(next, [...trail, node]);
    state.set(node, 'done');
  };
  for (const node of edges.keys()) visit(node, []);

  for (const phase of phases) {
    if (!registry.byId.has(phase.lead)) errors.push(`Phase ${phase.id}: lead ${phase.lead} is not a department.`);
  }

  const genreIds = new Set();
  for (const genre of genres) {
    if (genreIds.has(genre.id)) errors.push(`Genre ${genre.id} is duplicated.`);
    genreIds.add(genre.id);
    if (!['2d', '2.5d', '3d', 'isometric'].includes(genre.dimension)) {
      errors.push(`Genre ${genre.id}: dimension must be 2d, 2.5d, 3d or isometric.`);
    }
    if (!Array.isArray(genre.tags)) errors.push(`Genre ${genre.id}: tags missing.`);
  }

  if (!profileIds.size) errors.push('No performance profiles defined.');
  for (const [platform, ids] of Object.entries(performance.platformProfiles || {})) {
    for (const id of ids) {
      if (!profileIds.has(id)) errors.push(`Platform profile ${platform} references unknown profile ${id}.`);
    }
  }

  // Activation tags are half genre-driven and half manual hooks: a tag with no genre behind it is a
  // legitimate way to switch a specialist on for one project (--tags), so only the format is enforced.
  for (const dept of departments) {
    for (const tag of dept.activation?.any || []) {
      if (!/^[a-z0-9-]+$/.test(tag)) errors.push(`Department ${dept.id}: activation tag "${tag}" must be lowercase-hyphenated.`);
    }
  }

  if (!exists(path.join(registry.root, 'studio', 'departments'))) {
    warnings.push('studio/departments has not been generated yet; run "npm run studio -- gen".');
  }

  return { errors, warnings };
}
