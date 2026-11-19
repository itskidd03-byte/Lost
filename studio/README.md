# Studio OS — an autonomous game development studio

This directory turns this repository into a working studio: 41 departments across 7 divisions, one Studio
Director, a shared knowledge base, per-department task queues and working memory, a ten-phase pipeline,
and review gates that refuse work that is not evidenced.

It is built on what this repository already has: the playable Three.js game in `src/`, the licensed asset
libraries (`ASSET_MEMORY_BANK/`, `graphics-library/`, `AEGIS_GRAPHICS_MEMORY/`), the catalogue tooling in
`tools/`, and the worker/asset/memory schemas in `schemas/`. Nothing existing was removed or replaced.

## What is actually implemented

| Piece | Where it lives | State |
| --- | --- | --- |
| Studio Director charter | `studio/director/CHARTER.md` and `AGENTS.md` | Implemented |
| 41 department charters (system instructions, capabilities, deliverables, gates) | `studio/departments/`, generated from `studio/registry/departments/*.json` | Implemented |
| Department registry with activation rules | `studio/registry/departments/*.json` | Implemented |
| 7 divisions | `studio/registry/divisions.json` | Implemented |
| 23-genre detection catalogue, hybrid capable, unknown-genre fallback | `studio/registry/genres.json` | Implemented |
| Ten-phase pipeline with leads and exit criteria | `studio/registry/phases.json` | Implemented |
| Independent task queue per department | `studio/projects/<slug>/queues/<dept>.json` | Implemented |
| Independent working memory per department | `studio/projects/<slug>/memory/<dept>.md` | Implemented |
| Shared knowledge base with one owner per document | `studio/projects/<slug>/knowledge/` + `studio/knowledge/templates/` | Implemented |
| Deliverable gate: structure, front matter, unresolved markers | `studio/lib/gates.mjs` | Implemented |
| Named checks: project typecheck, smoke, asset licence, measured performance | `studio/registry/gates.json` + `studio/lib/gates.mjs` | Implemented |
| Licence policy matching the existing CC0-only asset bank | `studio/registry/gates.json` | Implemented |
| Hardware-class performance profiles, 60 FPS default, measured gate | `studio/registry/performance-profiles.json` | Implemented |
| Decision log, milestone and release records | `studio/projects/<slug>/decision-log.md`, templates | Implemented |
| Director dashboard | `npm run studio -- status` writes `STATUS.md` | Implemented |
| Department worker instantiation prompt | `npm run studio -- prompt <project> <dept>` | Implemented |
| Self-tests for registry, planning, gates, licences, performance | `studio/tests/` | Implemented |

## What is not implemented, stated plainly

- **There is no background daemon spawning 41 model processes.** Freebuff gives this repository one agent
  session and one `researcher-web` subagent; it has no API for creating named long-lived workers. A
  department becomes a real worker when a session loads its charter: `studio prompt` emits that charter
  with the project context, the department's own queue, its memory path and its gates. Run several
  sessions in parallel and each one is an independent department. The registry, queues, memory and gates
  are what make those sessions a studio rather than disconnected chats.
- **Gates verify evidence, not taste.** They can prove an artifact exists, is complete in structure, that
  typecheck passes, that licences are shippable and that a frame-rate measurement meets its budget. They
  cannot judge whether a level is fun. That is the Director's review, recorded in `reviews/`.
- **Performance numbers must be recorded from a real run.** `perf record` refuses a measurement without
  device, method and build id. A project with no measurement fails the performance gate.
- **Creative output depends on work being done.** This is the operating system, not a finished game. It
  assumes the departments will be run.

## The organisation

| Division | Departments | Scope |
| --- | --- | --- |
| Creative and Design | D01–D05 | vision, design, world, narrative, UX |
| Graphics and Audio | D06–D16 | 3D, 2D, environment, materials, characters, animation, lighting, VFX, sound, music, cinematics |
| Engineering | D17–D22 | engine, gameplay, physics, AI, multiplayer, backend and data |
| Specialised Game Systems | D23–D29 | shooters, strategy, construction, mining, survival, vehicles, procedural generation |
| Simulation and World Systems | D30–D32 | economy, population, dynamic world |
| QA, Production and Operations | D33–D40 | QA, performance, compatibility, security, asset acquisition, asset integration, technical art, production |
| Studio Research and Innovation | D41 | engines, techniques, tools, asset libraries, optimisation research |

`npm run studio -- dept list` prints them; `npm run studio -- dept show D26` prints a full charter.

## Quickstart

```bash
npm install                                     # only needed for the project's own checks
npm run studio -- validate                      # registry, dependencies, charters, templates
npm run studio -- intake "A first-person survival mining game: dig ore veins underground, refine metals, craft machines and trade in a colony economy."
npm run studio -- status <slug>
npm run studio -- prompt <slug> D26             # instantiate the mining department
npm run studio -- next <slug> D26               # its next ready task
```

Then, as that department:

```bash
npm run studio -- start <slug> D26-geology-spec
# write studio/projects/<slug>/deliverables/mining-resources/geology-spec.md
npm run studio -- submit <slug> D26-geology-spec
# as the Director:
npm run studio -- review <slug> D26-geology-spec --approve --note "numbers are complete and sourced"
```

## How activation works

Intake reads the concept, matches genre keywords, unions their tags, and activates a department when:

1. its activation is `always`, **or**
2. one of its activation tags is present in the project's tag set, **and** its dimension restriction
   allows the project dimension (`2d`, `2.5d`, `3d`, `isometric`).

So a mining game activates D26 Mining, D29 Procedural Generation, D19 Physics, D30 Economy and D03 World
Building, and does **not** activate D23 Shooter Systems, D24 Strategy or D28 Vehicles. An FPS activates
D23, D10, D11 and D13 and not D26. A 2D platformer activates D07 2D Art and not D06 3D Modelling. A genre
the catalogue does not know still gets the 16 always-on departments plus anything you add with
`--tags`. Every activation reason is written into `SPEC.md`, so nothing is silently on or off.

## Running departments in parallel

Each department has its own queue file and its own memory file, and task commands write only the acting
department's queue (the one exception is a Director review, which may unblock other departments). That
means several sessions can work different departments at once. Two sessions should not work the same
department simultaneously, and intake or `plan` should not run while a department is mid-task.

## Gates

A deliverable is accepted only when all of the following are true, in this order:

1. **Prerequisites approved.** A gameplay implementation cannot be accepted before its design exists.
2. **Structure.** The artifact exists at its declared path, has front matter (`owner`, `department`,
   `revision`), the sections `Deliverable`, `Acceptance` and `Handoff`, at least 500 characters and no
   `TBD` markers (release deliverables also forbid `TODO` and `FIXME`).
3. **Named checks.** Whatever the registry declares: `typecheck`, `smoke`, `assets` (licence audit),
   `profiling` (a measurement exists), `perf` (measurements meet every profile budget). A check that
   cannot run is reported as `unavailable`, and a skipped check is visible at review and blocks approval
   unless the Director overrides it with a written note.
4. **Director review.** `review --approve` or `--reject --note`. Rejections return to the department with
   the note, which is also appended to that department's memory.

## Performance enforcement

`studio/registry/performance-profiles.json` defines low/mid/high Android, iPhone, tablet, WebGL mobile and
desktop, WebGL desktop, and low/mid/high desktop. Default target is 60 FPS with a 1% low floor, plus
frame-time, memory, draw-call, texture, load-time and particle budgets. `perf record` requires:

```
--profile webgl-desktop --device "Chrome on Intel Iris Xe" --method "30s capture of the village scene" \
--build abc123 --fps 61 --p1 52 --frame-ms 16.4 --memory 800 --draw-calls 180 --load-ms 4000
```

`perf check` fails the project if any declared profile has no measurement, or if average FPS, 1% low,
frame time, memory, draw calls or load time misses its budget. The optimisation phase cannot exit and the
release checklist cannot be approved while it fails.

## Asset licensing

The existing asset banks are CC0 (plus CC BY with attribution recorded). The studio policy matches:
CC0, public domain, CC BY (with attribution) and original work are allowed; CC BY-SA, non-commercial,
no-derivatives and unknown licences are refused. `assets import` pulls from
`asset-gallery/assets.json`, `graphics-library/manifest.json` or `AEGIS_GRAPHICS_MEMORY/manifest.json`
and refuses anything outside policy instead of silently accepting it. `assets audit` is a release gate.

## Extending the studio

1. Edit a file in `studio/registry/departments/` (or add one). Deliverables reference phases and may
   depend on other departments with `D02:gdd`.
2. `npm run studio -- gen` regenerates the charters.
3. `npm run studio -- validate` proves ids, phases, dependencies (no cycles), charters and templates are
   consistent.
4. `npm run studio -- plan <project>` re-plans live projects against the new registry without losing
   approved work.

The registry is the single source of truth. Never hand-edit a generated charter; change the data and
regenerate, or `validate` will report it as stale.
