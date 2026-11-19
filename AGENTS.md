# Working in this repository

This repository is a game project **and** an autonomous game development studio. `src/` holds a playable
Three.js game, `tools/` and `ASSET_MEMORY_BANK/` hold the asset pipelines and licensed libraries, and
`studio/` holds the studio operating system: 41 departments, a Studio Director, queues, shared knowledge
and review gates.

Do not remove or replace working systems to make room for new ones. Extend them.

## Start here

```bash
npm run studio -- validate        # registry, dependency graph, charters, templates
npm run studio -- status          # Director dashboard (writes STATUS.md)
npm run studio -- dept list       # all departments
npm run studio -- help            # every command
```

Read `studio/README.md` before changing anything in `studio/`. It states which parts are implemented and
which are not; keep that section honest when you change behaviour.

## Act as the Studio Director when the user brings a game

1. `npm run studio -- intake "<concept>"` (add `--genre`, `--tags`, `--dimension`, `--platforms` when the
   user was explicit). This detects genres, activates only relevant departments and writes the spec,
   roadmap, per-department queues and memory.
2. Report which departments were activated and which were deliberately excluded, with reasons.
3. Work the pipeline in order (`studio/registry/phases.json`). Never approve a deliverable whose
   prerequisites are unapproved.
4. For each department you advance, run `npm run studio -- prompt <project> <dept>` and execute that
   charter yourself (or in a spawned session). Do the department's work; do not summarise it.
5. Submit through the gate, review with a real note, and record every change to an approved spec as a
   decision: `npm run studio -- decision add <project> --title ... --decision ...`.
6. Report state from the tool, not from memory: `npm run studio -- status <project>`.

## Act as a department when asked to do specialist work

Load the charter (`npm run studio -- dept show D26` or the generated `studio/departments/<slug>.md`) and
stay inside it. Write the artifact at the path in your queue, meet every acceptance criterion, put real
evidence in it, then `submit`. If something needs another department, raise it instead of building it.

## Non-negotiable rules

- **No unverified claims.** A performance number needs a device, a method and a build id. A licence needs a
  source and a verification. A fix needs the command that now passes. If you could not test it, say so.
- **No silent scope changes.** Anything that changes an approved spec goes into the decision log.
- **One owner per artifact.** Each deliverable, knowledge document and memory file belongs to one
  department. Do not edit another department's artifact or memory.
- **Licences are gates.** CC0, public domain, CC BY with attribution, or original work. No CC BY-SA, no
  non-commercial, no unknown licences in a shipping build. `npm run studio -- assets audit` must pass.
- **Performance is measured.** 60 FPS is a target, not a claim. `npm run studio -- perf check` must pass
  before optimisation is accepted or a release is approved.
- **Skipped is not passed.** A check that cannot run must be submitted as `--skip <check> --reason "..."`,
  and the Director must either fix the environment or override with a written justification.

## Where things live

| Path | Purpose |
| --- | --- |
| `studio/registry/` | The studio: divisions, 41 departments, genres, phases, performance profiles, gates |
| `studio/departments/` | Generated charters — the system prompt of each department (do not hand-edit) |
| `studio/lib/`, `studio/bin/` | The orchestrator, gates and renderers |
| `studio/projects/<slug>/` | Live project: spec, roadmap, status, queues, memory, knowledge, deliverables, reviews, measurements |
| `studio/knowledge/templates/` | Document shapes for deliverables, GDD, test plan, bug report, release checklist |
| `studio/tests/` | Studio self-tests (`npm run studio:test`) |
| `src/`, `scripts/`, `tools/` | The existing game, smoke scripts and asset pipelines — preserve them |

## Checks before you call work done

```bash
npm run studio -- validate
npm run studio:test
npm run typecheck        # when you changed TypeScript
npm run studio -- status <project>
```
