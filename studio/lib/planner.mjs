import { nowIso } from './util.mjs';

export function buildTasks(project, registry) {
  const active = new Set(project.departments.map((dept) => dept.id));
  const tasks = [];
  const stamp = nowIso();

  for (const dept of registry.departments) {
    if (!active.has(dept.id)) continue;
    const ordered = [...dept.deliverables].sort(
      (a, b) => (registry.phaseById.get(a.phase)?.order || 99) - (registry.phaseById.get(b.phase)?.order || 99),
    );

    ordered.forEach((deliverable, index) => {
      const dependsOn = new Set();
      const waivedDeps = [];
      if (index > 0) dependsOn.add(`${dept.id}-${ordered[index - 1].id}`);
      for (const dep of deliverable.dependsOn || []) {
        const [depDept, artifact] = String(dep).split(':');
        if (!active.has(depDept)) {
          waivedDeps.push({ dependency: dep, reason: 'owning department is not active for this project' });
          continue;
        }
        dependsOn.add(`${depDept}-${artifact}`);
      }

      const phase = registry.phaseById.get(deliverable.phase);
      tasks.push({
        id: `${dept.id}-${deliverable.id}`,
        dept: dept.id,
        deptSlug: dept.slug,
        deptName: dept.name,
        deliverable: deliverable.id,
        name: `${deliverable.name}`,
        phase: deliverable.phase,
        phaseOrder: phase?.order || 99,
        objective: `Produce the ${deliverable.name} for this project, meeting every acceptance criterion, then submit it for Studio Director review.`,
        acceptance: deliverable.acceptance,
        checks: deliverable.checks || [],
        dependsOn: [...dependsOn],
        waivedDeps,
        artifact: `deliverables/${dept.slug}/${deliverable.id}.md`,
        status: 'queued',
        attempts: 0,
        createdAt: stamp,
        updatedAt: stamp,
        reviews: [],
        skips: [],
      });
    });
  }

  return tasks;
}

export function mergeTasks(existing, fresh) {
  const byId = new Map((existing || []).map((task) => [task.id, task]));
  return fresh.map((task) => {
    const prior = byId.get(task.id);
    if (!prior) return task;
    return {
      ...task,
      status: prior.status,
      attempts: prior.attempts,
      reviews: prior.reviews || [],
      skips: prior.skips || [],
      createdAt: prior.createdAt || task.createdAt,
      updatedAt: prior.updatedAt || task.updatedAt,
    };
  });
}

export function taskById(project, id) {
  const task = (project.tasks || []).find((item) => item.id === id);
  if (!task) return null;
  return task;
}

export function dependencyState(project, task) {
  const tasks = new Map((project.tasks || []).map((item) => [item.id, item]));
  const deps = (task.dependsOn || []).map((id) => tasks.get(id)).filter(Boolean);
  const missing = (task.dependsOn || []).filter((id) => !tasks.has(id));
  const pending = deps.filter((dep) => dep.status !== 'approved');
  return {
    deps,
    missing,
    pending,
    ready: task.status === 'queued' && !missing.length && !pending.length,
  };
}

export function readyTasks(project, deptId) {
  return (project.tasks || [])
    .filter((task) => task.dept === deptId)
    .filter((task) => dependencyState(project, task).ready);
}

export function phaseSummary(project, registry) {
  return registry.phases.map((phase) => {
    const tasks = (project.tasks || []).filter((task) => task.phase === phase.id);
    const approved = tasks.filter((task) => task.status === 'approved').length;
    const inReview = tasks.filter((task) => task.status === 'in-review').length;
    const blocked = tasks.filter((task) => task.status === 'blocked').length;
    return {
      id: phase.id,
      name: phase.name,
      order: phase.order,
      lead: phase.lead,
      tasks: tasks.length,
      approved,
      inReview,
      blocked,
      active: tasks.length > 0,
      complete: tasks.length > 0 && approved === tasks.length,
    };
  });
}

export function currentPhase(project, registry) {
  const summary = phaseSummary(project, registry).filter((phase) => phase.active);
  return summary.find((phase) => !phase.complete) || summary[summary.length - 1] || null;
}
