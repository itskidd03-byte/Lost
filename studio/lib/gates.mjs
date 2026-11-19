import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { exists, nowIso, readText, wordCount } from './util.mjs';
import { dependencyState } from './planner.mjs';

export function classifyLicence(licence, policy) {
  const text = String(licence || '').toLowerCase();
  if (!text.trim()) return { verdict: 'unknown', reason: 'no licence recorded' };
  const deny = (policy.deny || []).find((token) => text.includes(token));
  if (deny) return { verdict: 'denied', reason: `matches denied term "${deny}"` };
  const allow = (policy.allow || []).find((token) => text.includes(token));
  if (!allow) return { verdict: 'unknown', reason: 'not a recognised commercial licence' };
  const attribution = (policy.attributionRequired || []).some((token) => text.includes(token));
  return { verdict: 'allowed', reason: `matches allowed term "${allow}"`, attributionRequired: attribution };
}

export function structuralCheck(project, task, gates) {
  const file = path.join(project.dir, task.artifact);
  const rules = gates.artifact;
  const problems = [];
  const notes = [];

  if (!exists(file)) {
    return { ok: false, problems: [`Artifact not found: ${task.artifact}`], notes, chars: 0, words: 0 };
  }
  const text = readText(file);
  const chars = text.length;
  const words = wordCount(text);
  if (chars < rules.minChars) problems.push(`Artifact is ${chars} characters; the gate requires at least ${rules.minChars}.`);

  const frontMatter = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!frontMatter) {
    problems.push('Missing YAML front matter (--- block) with owner, department and revision.');
  } else {
    for (const field of rules.requireFrontMatter) {
      if (!new RegExp(`^${field}\\s*:`, 'm').test(frontMatter[1])) problems.push(`Front matter is missing "${field}".`);
    }
    const owner = /owner\s*:\s*(.+)/.exec(frontMatter[1]);
    if (owner && owner[1].trim() !== task.dept) notes.push(`Owner ${owner[1].trim()} differs from the assigned department ${task.dept}.`);
  }

  for (const section of rules.requireSections) {
    const pattern = new RegExp(`^#{1,3}\\s*${section}\\b`, 'im');
    if (!pattern.test(text)) problems.push(`Missing required section "${section}".`);
  }

  const markers = [...(rules.forbidMarkers || [])];
  if (task.phase === 'release') markers.push(...(rules.releaseForbidMarkers || []));
  for (const marker of new Set(markers)) {
    if (new RegExp(`\\b${marker}\\b`).test(text)) problems.push(`Contains unresolved marker "${marker}".`);
  }

  return { ok: problems.length === 0, problems, notes, chars, words };
}

function tail(text) {
  const lines = String(text).replace(/\u001b\[[0-9;]*m/g, '').trim().split('\n');
  if (lines.length > 16) return [...lines.slice(0, 8), '…', ...lines.slice(-6)].join('\n');
  return lines.join('\n');
}

export function commandCheck(name, check, cwd) {
  if (!check || check.kind !== 'command') {
    return { name, status: 'unavailable', detail: 'no command declared for this check' };
  }
  try {
    const output = execSync(check.cmd, { cwd, stdio: 'pipe', timeout: (check.timeoutSec || 180) * 1000 });
    return { name, status: 'pass', detail: tail(output.toString()) || '(no output)' };
  } catch (error) {
    const stdout = error.stdout ? error.stdout.toString() : '';
    const stderr = error.stderr ? error.stderr.toString() : '';
    const detail = tail(`${stdout}\n${stderr}`) || error.message;
    const unavailable = /Cannot find module|ENOENT|command not found/i.test(detail) && /node_modules|esbuild|tsc|vite/i.test(detail);
    return { name, status: unavailable ? 'unavailable' : 'fail', detail };
  }
}

export function licenceAudit(project, policy) {
  const catalog = project.assets || [];
  if (!catalog.length) {
    return { ok: false, rows: [], problems: ['No assets recorded in the catalogue. Sourced assets must be recorded to be audited.'] };
  }
  const problems = [];
  const rows = catalog.map((asset) => {
    const classification = classifyLicence(asset.licence, policy);
    const failures = [];
    if (classification.verdict === 'denied') failures.push(classification.reason);
    if (classification.verdict === 'unknown') failures.push(`unrecognised licence: ${asset.licence || '(none)'}`);
    if (!asset.source) failures.push('missing source URL');
    if (!asset.creator) failures.push('missing creator');
    if (classification.attributionRequired && !asset.attribution) failures.push('CC BY asset without attribution text');
    if (!asset.verified) failures.push('not verified (record --verified with the verification method used)');
    for (const failure of failures) problems.push(`${asset.id || asset.name}: ${failure}`);
    return {
      id: asset.id || asset.name,
      licence: asset.licence,
      verdict: classification.verdict,
      ok: failures.length === 0,
      failures,
    };
  });
  return { ok: problems.length === 0, rows, problems };
}

export function perfAudit(project, registry) {
  const measurements = project.perfMeasurements || [];
  const profiles = project.perfProfiles || [];
  const rows = [];
  const problems = [];
  if (!profiles.length) problems.push('No performance profiles declared for this project.');
  for (const profileId of profiles) {
    const profile = registry.profileById.get(profileId);
    if (!profile) {
      problems.push(`Unknown performance profile ${profileId}.`);
      continue;
    }
    const latest = [...measurements].reverse().find((entry) => entry.profile === profileId);
    if (!latest) {
      rows.push({ profile: profileId, status: 'missing', failures: ['no measurement recorded'] });
      problems.push(`${profileId}: no measurement recorded. Record one with "npm run studio -- perf record".`);
      continue;
    }
    const failures = [];
    if (!latest.device) failures.push('device not named');
    if (!latest.method) failures.push('measurement method not stated');
    if (!latest.build) failures.push('build id or commit not recorded');
    const numeric = ['avgFps', 'p1Fps', 'frameTimeMs', 'memoryMb', 'drawCalls', 'triangles', 'textureMb', 'loadMs', 'particles'];
    for (const field of numeric) {
      if (latest[field] !== undefined && latest[field] !== null && Number.isNaN(Number(latest[field]))) failures.push(`${field} is not a number`);
    }
    if (!Number.isFinite(Number(latest.avgFps))) failures.push('avgFps missing');
    else if (Number(latest.avgFps) < profile.targetFps) failures.push(`avgFps ${latest.avgFps} below target ${profile.targetFps}`);
    if (!Number.isFinite(Number(latest.p1Fps))) failures.push('1% low FPS missing');
    else if (Number(latest.p1Fps) < profile.floorFps) failures.push(`1% low ${latest.p1Fps} below floor ${profile.floorFps}`);
    if (Number.isFinite(Number(latest.frameTimeMs)) && Number(latest.frameTimeMs) > profile.frameTimeMs) {
      failures.push(`frame time ${latest.frameTimeMs} ms above budget ${profile.frameTimeMs} ms`);
    }
    if (Number.isFinite(Number(latest.memoryMb)) && Number(latest.memoryMb) > profile.memoryMb) {
      failures.push(`memory ${latest.memoryMb} MB above budget ${profile.memoryMb} MB`);
    }
    if (Number.isFinite(Number(latest.drawCalls)) && Number(latest.drawCalls) > profile.drawCalls) {
      failures.push(`draw calls ${latest.drawCalls} above budget ${profile.drawCalls}`);
    }
    if (Number.isFinite(Number(latest.loadMs)) && Number(latest.loadMs) > profile.loadMs) {
      failures.push(`load time ${latest.loadMs} ms above budget ${profile.loadMs} ms`);
    }
    const status = failures.length ? 'fail' : 'pass';
    rows.push({ profile: profileId, status, failures, device: latest.device, measuredAt: latest.recordedAt });
    for (const failure of failures) problems.push(`${profileId} (${latest.device || 'unnamed device'}): ${failure}`);
  }

  const unprofiled = measurements.filter((entry) => !profiles.includes(entry.profile));
  return { ok: problems.length === 0, rows, problems, unprofiled };
}

export function builtinAudit(name, project, registry) {
  const policy = registry.gates.licencePolicy;
  if (name === 'assets') {
    const audit = licenceAudit(project, policy);
    const detail = audit.rows.map((row) => `${row.id}: ${row.verdict}${row.ok ? '' : ` (${row.failures.join('; ')})`}`).join('\n');
    return { name, status: audit.ok ? 'pass' : 'fail', detail: detail || 'no assets', problems: audit.problems };
  }
  if (name === 'perf' || name === 'profiling') {
    const audit = perfAudit(project, registry);
    const detail = audit.rows.map((row) => `${row.profile}: ${row.status}${row.failures?.length ? ` (${row.failures.join('; ')})` : ''}`).join('\n');
    if (name === 'profiling') {
      const missing = audit.rows.filter((row) => row.status === 'missing');
      return {
        name,
        status: missing.length ? 'fail' : 'pass',
        detail: detail || 'no measurements',
        problems: missing.map((row) => `${row.profile}: no measurement recorded`),
      };
    }
    return { name, status: audit.ok ? 'pass' : 'fail', detail: detail || 'no measurements', problems: audit.problems };
  }
  return { name, status: 'unavailable', detail: `no built-in audit named ${name}`, problems: [] };
}

export function runChecks(project, task, registry, options = {}) {
  const results = [];
  const skipped = options.skip || [];
  const requested = [...new Set([...(task.checks || []), ...(options.with || [])])];

  for (const name of requested) {
    const check = registry.gates.checks[name];
    if (!check) {
      results.push({ name, status: 'unavailable', detail: 'check is not defined in gates.json' });
      continue;
    }
    if (skipped.includes(name)) {
      results.push({ name, status: 'skipped', detail: options.skipReason || 'skipped by the submitter' });
      continue;
    }
    if (check.kind === 'builtin') {
      results.push(builtinAudit(check.audit, project, registry));
    } else {
      results.push(commandCheck(name, check, registry.root));
    }
  }
  return results;
}

export function submitTask(project, task, registry, options = {}) {
  const state = dependencyState(project, task);
  if (state.pending.length || state.missing.length) {
    const waiting = [
      ...state.pending.map((dep) => `${dep.id} (${dep.status})`),
      ...state.missing.map((id) => `${id} (missing)`),
    ];
    return { ok: false, error: `Prerequisites are not approved: ${waiting.join(', ')}. A deliverable cannot be accepted before its inputs exist.` };
  }
  const structural = structuralCheck(project, task, registry.gates);
  const checks = runChecks(project, task, registry, options);
  const blocked = checks.filter((check) => check.status === 'fail' || check.status === 'unavailable');
  const skipped = checks.filter((check) => check.status === 'skipped');
  const ok = structural.ok && blocked.length === 0;
  task.lastGate = {
    at: nowIso(),
    ok,
    structural,
    checks,
    skipped: skipped.length,
  };
  task.updatedAt = nowIso();
  if (ok) {
    task.status = 'in-review';
    task.attempts = (task.attempts || 0) + 1;
  }
  return { ok, structural, checks, blocked, skipped };
}

export function reviewTask(project, task, registry, options = {}) {
  if (task.status !== 'in-review') {
    return { ok: false, error: `Task ${task.id} is "${task.status}"; only an in-review task can be reviewed.` };
  }
  const gate = task.lastGate;
  if (!gate) return { ok: false, error: 'No gate result recorded for this task. Submit it first.' };
  if (!options.force && !gate.ok) {
    return { ok: false, error: 'Gate did not pass. Fix it, or review with --force and record why.' };
  }
  if (!options.force && gate.skipped) {
    return { ok: false, error: `${gate.skipped} check(s) were skipped, which is not a pass. Re-run them, or review with --force and record why.` };
  }
  if (options.force && !options.note) {
    return { ok: false, error: 'An override requires a --note explaining the decision.' };
  }
  if (options.approve) {
    // Stamp the artifact so the document itself reflects the Director's decision.
    const artifact = path.join(project.dir, task.artifact);
    if (exists(artifact)) {
      const text = readText(artifact);
      if (/^status\s*:/m.test(text)) fs.writeFileSync(artifact, text.replace(/^status\s*:.*$/m, 'status: approved'));
    }
    task.status = 'approved';
    task.reviews.push({
      at: nowIso(), decision: 'approved', reviewer: options.reviewer || 'Studio Director', note: options.note || '', override: Boolean(options.force),
    });
  } else {
    task.status = 'rejected';
    task.reviews.push({
      at: nowIso(), decision: 'rejected', reviewer: options.reviewer || 'Studio Director', note: options.note || 'no note recorded',
    });
  }
  task.updatedAt = nowIso();
  unblockDependents(project);
  return { ok: true, task };
}

export function rejectBlocked(task, reason) {
  task.status = 'blocked';
  task.blockedReason = reason;
  task.updatedAt = nowIso();
}

export function unblockDependents(project) {
  for (const task of project.tasks) {
    if (task.status !== 'blocked') continue;
    const state = dependencyState(project, task);
    if (!state.pending.length && !state.missing.length) {
      task.status = 'queued';
      task.blockedReason = null;
      task.updatedAt = nowIso();
    }
  }
}

export function downstreamOf(project, taskId) {
  return project.tasks.filter((task) => (task.dependsOn || []).includes(taskId));
}

export function evidenceSummary(project) {
  const dir = path.join(project.dir, 'evidence');
  if (!exists(dir)) return [];
  return fs.readdirSync(dir).sort();
}
