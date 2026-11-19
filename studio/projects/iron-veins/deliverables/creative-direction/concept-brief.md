---
owner: D01
department: D01
revision: 1
project: Iron Veins
status: approved
---

# Iron Veins — Concept Brief

## Deliverable

### Hook

A bankrupt mining charter sends you into a mountain that pays in ore and charges in air: every tonne you
cut is a decision about whether the mine, or you, comes back up.

### Creative pillars

1. **The mine is a machine you are standing inside.** Support, airflow, water and heat are one coupled
   system. Cutting rock is never only about the rock.
2. **Legible industry.** Ore becomes concentrate becomes ingot becomes money, and every step is readable
   at a glance: what it is, what it costs, what it is for, what it is worth today.
3. **A frontier that keeps count.** Brackwater remembers what you sold, what you broke and who you left
   under the mountain. The colony reacts through prices, contracts and people, not through a cutscene.

### Genre and subgenre

- Primary genre: first-person survival mining.
- Subgenres: resource management, colony economy, light immersive sim.
- Dimension: **3D**, first-person, single-player.
- Target platforms: **WebGL (desktop browser)** as the primary development target and **desktop**
  (Windows/macOS) as the packaged build. Mobile is not a target for this title.
- Session shape: 18-minute shifts inside a 12–15 hour campaign, plus an endless prospecting mode.

### Audience and position

Players who like systemic pressure more than reflexes: the audience for *Deep Rock Galactic*'s readable
mining, *SteamWorld Dig*'s depth-as-progression and *Offworld Trading Company*'s price pressure, who want a
single-player game that respects their time and their arithmetic. No firearms, no multiplayer, no live
service. The fantasy is competence under a mountain, not power over it.

### References

| Reference | Borrow | Avoid |
| --- | --- | --- |
| *Deep Rock Galactic* | Ore readability at distance, terrain destruction feedback, tools with obvious verbs, hazard callouts | Four-player co-op as the design centre, cosmetic seasonal economy, arcade respawn pacing |
| *SteamWorld Dig 2* | Depth as the progression axis, short upgrade loops, a map that reveals as you earn it | 2D metroidvania structure, near-absent survival pressure, hand-placed linearity |
| *Offworld Trading Company* | Prices that punish oversupply, resources whose value depends on what others need | Abstract RTS framing, invisible AI economics the player cannot inspect |

### Testable differentiator

**The mine's atmosphere is simulated and coupled to extraction.** Removing rock changes airflow, water
ingress and heat in the same solver that decides collapse risk. A mining plan is therefore also a
ventilation plan, and two players who cut the same seam with different support and airflow orders get
measurably different hazard curves inside one shift.

Test: on a fixed seed, run (A) a fast, unsupported, single-intake cut and (B) a slower cut with two
ventilation raises. Within 18 in-game minutes, A must show oxygen below 18%, collapse probability above
12% and wet-bulb temperature above 31 °C in the working face; B must stay above 19% oxygen, under 6%
collapse probability and under 29 °C. Those are instrumented values from the simulation, not scripted
events. No competitor in the reference set claims a coupled mine-atmosphere simulation as its core loop.

### Scope signals

- In: one mountain, six depth bands, one colony, five tool tiers, refining and crafting, contracts,
  market, survival needs, mine hazards, saves, WebGL and desktop builds.
- Out: firearms and combat systems, multiplayer, consoles, VR, mod support, voiced dialogue, surface
  base-building, procedural surface world.
- Content budget at concept stage: 12–15 hour campaign, 24 contracts, 9 ore types, 40 craftable items,
  6 hand-authored landmark sites, remainder generated within authored rules.

### Identity

- Working title: **Iron Veins**.
- One-line identity: *a survival mining game where the mine's air is the antagonist and the resource.*
- Tone: industrial, quiet, physical. Lamplight and dust, not neon and skyboxes.
- Naming canon for downstream departments: Mount Veyra, the colony of Brackwater, Veyra Consolidated
  (the collapsed company), Brackwater scrip as currency, the six depth bands defined in the world bible.

## Acceptance

| Criterion | Met | Evidence |
| --- | --- | --- |
| One-sentence hook and three named creative pillars | yes | "Hook" and "Creative pillars" above; pillars are named and referenced by the differentiator and scope |
| Genre, subgenre, dimension and target platforms stated | yes | "Genre and subgenre" and the intake record in `project.json` (3D, webgl + desktop) |
| At least three reference works with what to borrow and avoid | yes | Three-row reference table with explicit borrow and avoid columns |
| One testable differentiator a competitor could not claim unchanged | yes | "Testable differentiator" with numeric pass conditions for two mining plans on one seed |

## Handoff

- **D02 Game Design** owns the GDD that turns the pillars and the differentiator into loops and numbers.
  The atmosphere-coupling test above is a design requirement, not marketing.
- **D03 World Building** owns Mount Veyra and Brackwater; the naming canon here is binding.
- **D05 UX/UI** must make ore type, price, air quality, heat and structural risk readable without a wiki.
- **D37 Asset Acquisition** starts its plan from the CC0 seed catalogue already recorded for this project
  (rock faces, a collapsed cave chamber, a mineral vent, a drill press, industrial lighting, rock and
  ground PBR materials).
- **D41 Research** validates feasibility of the coupled hazard solver on WebGL before the prototype.
- This brief is invalidated if the differentiator is dropped, if firearms or multiplayer enter scope, or
  if the target platforms change without a decision record.
