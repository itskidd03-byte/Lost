---
owner: D02
department: D02
revision: 1
project: Iron Veins
status: approved
---

# Iron Veins — Game Design Document

## Deliverable

### 1. Vision and pillars

Inherited from the approved Concept Brief (`deliverables/creative-direction/concept-brief.md`):
(1) the mine is a machine you are standing inside, (2) legible industry, (3) a frontier that keeps count.

### 2. Core loop

A shift is the unit of play. Every step below is timed against the 18-minute shift clock.

| Step | Target duration | What the player does | Fail state |
| --- | --- | ---: | --- |
| Survey | 2 min | Read the shift board, buy consumables, pick a working face from the map | Spends scrip on the wrong tool for the rock |
| Plan | 1 min | Choose cut order, support, ventilation raises, haul route | Plan ignores airflow and heat |
| Descend | 1–3 min | Elevator, ladderway or crawl to the face | Wasted shift time; lamp fuel burned |
| Cut and support | 8–12 min | Cut ore, raise supports, extend air duct, pump water | Collapse, asphyxiation, flooding, heatstroke |
| Haul and refine | 2 min | Carry to the shaft skip, sort, crush, smelt | Overloaded pack slows you below the shift clock |
| Sell and build | 1 min | Contracts and market, buy the next upgrade | Oversupply crashes the price you depend on |
| Upgrade | between shifts | Tools, lamp, rig, pack, air | Progress stalls below the next depth gate |

- **Time to first reward:** 4 minutes (first ore in the pack).
- **Time to first meaningful reward:** 9 minutes (first ingot sold, first 40 scrip).
- **First depth gate:** end of shift 1 (Upper Workings → Rustbelt) if the player sells at all.

### 3. Mechanics

Every mechanic below is owned by the department named. Nothing here is implemented by D02.

| Mechanic | Inputs | Rules | Failure | Feedback | Owner |
| --- | --- | --- | --- | --- | --- |
| Terrain cutting | Drill trigger, aim | Cut rate by tool tier and rock hardness; cut removes volume and adds open air | Drill overheats at 100 °C, 8 s cooldown | Dust, chip decals, ore glint, sound pitch | D26 |
| Support | Place beam, anchor | Support strength per rock class; unsupported span raises collapse chance | Collapse seals the tunnel and can kill | Creak, dust trickle, crack overlay, map warning | D25, D19 |
| Ventilation | Raise duct, place fan | Air changes per hour per face; oxygen falls with open volume and distance from intake | Oxygen below 16% causes blackout | Air gauge, lamp flicker, breathing audio | D26, D32 |
| Water | Place pump, open sluice | Water fills low cells; pumps move 40 m³/min; depth raises pressure | Drowning, flooded route, ruined cargo | Waterline sound, wet footsteps, drain current | D32, D19 |
| Heat | Cooling vest, water, retreat | Ambient 22–46 °C by depth; equipment adds heat; core temperature rises | Heatstroke above 39.5 °C core | Sweat overlay, mirage, heartbeat | D32, D27 |
| Pack and haul | Pick up, drop, sort | Mass limit; speed penalty above 60% load; cargo lost on death | Stranded below the clock | Weight bar, footstep change, climb refusal | D18 |
| Needs | Eat, drink, breathe, rest | Oxygen 8 min base, food and water per shift, warmth near the Kiln | Stat debuffs, then death | Needs icons with numeric timers | D27 |
| Refining and crafting | Smelter, bench | Ore → concentrate → ingot → component; recipes gate on tier and blueprint | Wasted ore, wasted fuel | Yield preview before committing | D26 |
| Market and contracts | Sell, accept contract | Price = base × demand × saturation; contracts add volume and deadline | Contract default costs reputation and scrip | Price ticker, contract board, history graph | D30 |
| Shift clock | Automatic | 18 min shift, overtime allowed at 1.5× hazard accrual | Passing out underground costs cargo | Clock, warning at 4 min left | D02, D32 |
| Save and load | Automatic at shift end | Full mine state, market state, colony state | Corrupt save rejected, never overwritten silently | Save indicator | D22 |
| Readouts | Passive HUD | Oxygen, heat, structure risk, load, depth, price of carried ore | Misreading a gauge kills | Gauges with thresholds, not numbers alone | D05 |

### 4. Atmosphere and hazard model

This is the differentiator and therefore a hard requirement, not a nice-to-have. One solver owns four
state variables per mine cell, ticking at 4 Hz while the player is in the same sector and 0.25 Hz
otherwise.

| Variable | Range | Driven by | Threshold |
| --- | --- | --- | --- |
| Oxygen | 20.9% → 12% | Open volume, distance to intake, fan throughput, fire | 18% warning, 16% blackout |
| Methane | 0–5% | Shale cutting, pockets, poor airflow | 1.5% warning, 3% ignition risk |
| Water | 0–100% cell fill | Aquifer intersection, pumps, sluice state | 40% slows, 100% impassable |
| Heat (wet bulb) | 18–48 °C | Depth gradient, equipment, geothermal seams, airflow | 31 °C warning, 36 °C lethal exposure |

**Coupling rules.** Cutting 1 m³ adds 1 m³ of open volume and 8 m³/min of air demand at that face.
Airflow per face is `intake_m3_min / open_volume_m3 × 60` air changes per hour; below 4 ACH, oxygen drops
0.06% per minute per 100 m³ of open face. Supports reduce collapse probability, but blocking a return
airway also cuts airflow to every face behind it. Pumps keep the route open but add heat. Heat lowers the
time a player can work in a face, which changes how much rock is cut, which changes airflow. The loop is
closed on purpose.

**Collapse rule.** `P(collapse)/min = 0.05 × (span / span_limit)^2 × (1 − support_strength)`, capped at
12% per minute. Span limits: shale 4 m, sandstone 6 m, granite 9 m, crystal 5 m. Support strength: timber
0.55, steel 0.85, resin bolt 0.65.

**Acceptance test for the differentiator.** Fixed seed, same seam, 18 in-game minutes:
plan A (fast, unsupported, one intake) must reach oxygen ≤ 18%, collapse ≥ 12%/min and wet bulb ≥ 31 °C;
plan B (slower, two ventilation raises, timber at 4 m spans) must stay ≥ 19% oxygen, ≤ 6%/min collapse
and ≤ 29 °C. Instrumented by the simulation, checked by D33 in the prototype phase.

### 5. Progression

| Tier | Tool | Cut rate (granite) | Pack | Lamp | Gate |
| --- | --- | ---: | ---: | --- | --- |
| T0 | Hand auger | 0.20 m³/min | 40 kg | Oil lantern, 6 m | Start |
| T1 | Pneumatic drill | 0.55 m³/min | 60 kg | Carbide lamp, 10 m | 250 scrip + 20 iron |
| T2 | Hydraulic rig | 1.10 m³/min | 80 kg | Sealed LED, 16 m | 900 scrip + 60 iron + 10 copper |
| T3 | Plasma cutter | 1.90 m³/min | 120 kg | Floodlight, 24 m | 2,600 scrip + 30 tungsten |
| T4 | Company rig | 3.00 m³/min | 160 kg | Headlamp array, 30 m | 7,500 scrip + 12 rare earth |

Depth gates are structural, not numeric: the Rustbelt needs a pump or a dry route, the Grease needs
methane detection, the Kiln needs a cooling vest and two air raises, the Glass needs resin bolts, the Deep
Veins needs T4 and a supplied air line. Expected pacing: tier per 2.5–3.5 hours of campaign.

### 6. Economy

Nine ores, values per 10 kg at base demand, all sold in Brackwater scrip.

| Ore | Depth bands | Base value | Use | Hazard |
| --- | --- | ---: | --- | --- |
| Quartz | Upper Workings, Glass | 8 | Glass, lamp lenses | Dust |
| Hematite (iron) | Upper Workings, Rustbelt | 12 | Steel, structures | None |
| Chalcopyrite (copper) | Rustbelt | 28 | Wiring, pumps, brass | Acid water |
| Galena (lead/silver) | Rustbelt, Grease | 18 | Solder, shielding, silver by-product | Toxic dust |
| Sphalerite (zinc) | Grease | 22 | Brass, galvanising | None |
| Vein-ice (methane clathrate) | Grease, Kiln | 40 | Fuel, lamps | Explosive gas |
| Cinnabar (mercury) | Kiln | 60 | Instruments, amalgam | Vapour, lethal |
| Wolframite (tungsten) | Kiln, Glass | 110 | Tool heads, armour plate | Heat |
| Monazite (rare earth) | Deep Veins | 240 | T4 rig, colony contracts | Radiation trace |

**Price formation.** `price = base × demand_factor(0.80–1.20) × saturation_factor`, where each 100 units
of one ore sold inside a shift moves saturation by −2%, recovering +1% per in-game day. Demand cycles per
ore on a 7-day colony calendar: steel demand peaks when the Cooperative repairs the elevator, fuel demand
peaks in the cold season. Contracts pay 1.35× base but require volume and a deadline.

**Faucets:** mining yield, contract bonuses, salvage from Company caches, silver by-product of galena.
**Sinks:** tool tiers, consumables (air filters, lamp fuel, cooling vests), repairs, contract defaults, the
Cooperative's 8% refining fee, the 10% death fee.

### 7. Modes

- **Charter** — the 12–15 hour campaign: 24 contracts, six landmark sites, colony arc, ending at the Deep
  Veins.
- **Prospector** — endless mode with the same mine rules, no campaign contracts, escalating market softness.
- **Seam** — daily seeded 20-minute challenge with a fixed kit; leaderboard is local only for this title.

### 8. Difficulty and accessibility

| Tier | Oxygen drain | Collapse chance | Market volatility | Death penalty |
| --- | --- | --- | --- | --- |
| Apprentice | 0.7× | 0.5× | 0.7× | Cargo only |
| Prospector | 1.0× | 1.0× | 1.0× | Cargo + 10% scrip |
| Superintendent | 1.3× | 1.4× | 1.3× | Cargo + 20% scrip + reputation |

Accessibility, all available at any difficulty and never scored: oxygen drain off, collapse warnings
doubled in lead time, reduced screen shake, reduced head bob, FOV 70–110, colourblind-safe ore and hazard
palettes, subtitles and speaker labels, hold-to-hold toggles, full remapping, text scale 100–150%, hazard
audio cues with visual equivalents, pause anywhere.

### 9. Death, failure and recovery

Death respawns the player at the Brackwater clinic at the start of the next shift. Carried ore is lost;
tools, blueprints and the mine state persist. A collapse permanently changes the mine until the player
clears it with a work order (cost in scrip and time), so a bad plan costs access, not the save. No
permadeath, no save scumming benefit: the mine state has already changed by the time you die.

### 10. Balance targets (measured)

| Metric | Target | Measured by |
| --- | --- | ---: |
| Scrip per hour, Upper Workings | 180–240 | 3 scripted shifts per tier |
| Scrip per hour, Rustbelt | 420–560 | same |
| Scrip per hour, Kiln | 1,100–1,400 | same |
| Deaths per hour, Prospector difficulty | 0.3–0.8 | soak playtest |
| Time to T2 | 3.0–4.0 h | scripted progression run |
| Contracts completed per campaign | 20 of 24 minimum | campaign playthrough |

### 11. Telemetry hooks

`shift.start`, `shift.end`, `ore.mined{type,mass,depth}`, `hazard.oxygen{value}`, `hazard.collapse{prob}`,
`hazard.heat{core_temp}`, `death{cause,depth}`, `market.sale{ore,units,price}`, `contract.accept`,
`contract.fail`, `upgrade.buy{tier}`, `route.blocked{cause}`. Every tuned value in sections 5, 6 and 8
must emit at least one of these before it can be called balanced.

### 12. Out of scope

No firearms or combat system. No multiplayer or co-op. No consoles, VR or mobile. No mod support. No voiced
dialogue. No surface base-building. No procedural surface world. No live-service, season pass or
microtransactions. This list is the scope baseline and is recorded in the project decision log rather than
being changed by implication.

### 13. Handoff

- **D18** implements movement, pack and interaction against section 3; **D19** owns collapse, water and
  projectile-free physics; **D26** owns cutting, ventilation and refining; **D25** owns supports and
  structure; **D27** owns needs; **D30** owns prices and contracts; **D31** owns colony population;
  **D32** owns heat, weather ingress, shift clock and the solver tick; **D05** owns readouts; **D33**
  executes the differentiator test and the balance measurements; **D34** budgets the 4 Hz solver cost.
- This GDD is invalidated if the atmosphere model is simplified without a decision record, if the ore or
  tool counts change materially, or if the out-of-scope list is amended outside the decision log.

## Acceptance

| Criterion | Met | Evidence |
| --- | --- | --- |
| Core loop as a cycle with stated time to first reward | yes | Section 2 table; 4 min first ore, 9 min first sale, 18 min shift |
| Every mechanic has inputs, rules, failure and feedback | yes | Section 3, twelve mechanics with an owning department |
| Progression and difficulty with numbers and ranges | yes | Sections 5, 6 and 8: five tool tiers, nine ores, three difficulty rows |
| Explicit out-of-scope list signed by the Studio Director | yes | Section 12; Director decision recorded in `decision-log.md` at review |

## Handoff

See section 13. The atmosphere solver is the contract with D32 and D34: if the 4 Hz tick cannot fit the
WebGL budget, the phase-8 optimisation gate fails rather than the model being quietly cut.
