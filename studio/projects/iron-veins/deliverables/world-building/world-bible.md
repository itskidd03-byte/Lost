---
owner: D03
department: D03
revision: 1
project: Iron Veins
status: approved
---

# Iron Veins — World Bible

## Deliverable

### 1. The world at a glance

**Mount Veyra** is a single, worked-out mountain above the colony of **Brackwater**. The playable mine is
1,200 m × 900 m horizontally and 700 m deep, with roughly **2.4 km of traversable tunnel** at launch. The
mountain is not a backdrop: it is the map, the antagonist and the economy, and every location below exists
to make one decision harder.

Six depth bands sit under the surface hub. Each band introduces exactly one new pressure and one new ore
family, so the player learns the mine in the order the mine can kill them.

| Band | Depth | One-line purpose |
| --- | --- | --- |
| Brackwater (hub) | 0 m | Contracts, market, refinery, clinic and the only safe bed |
| Upper Workings | 0–40 m | Teach cutting, support and air on timbered legacy ground |
| The Rustbelt | 40–120 m | Teach water: acid ingress, flooded stops, pump placement |
| The Grease | 120–260 m | Teach gas: methane pockets and the cost of blocked return airways |
| The Kiln | 260–450 m | Teach heat: geothermal faces, cooling logistics, fire risk |
| The Glass | 450–620 m | Teach instability: crystal spans that fail without resin bolts |
| The Deep Veins | 620–700 m | Combine every pressure at the highest ore value |

### 2. Scale and traversal

Movement budget from the approved GDD: walk 1.6 m/s, sprint 3.4 m/s, crawl 0.7 m/s, ladder 0.8 m/s.
Load above 60% of pack capacity costs 15% speed; at capacity it costs 30% and blocks climbing.

| Route | Time | Constraint |
| --- | ---: | --- |
| Camp → Upper Workings face | 20 s | Stairs, no elevator |
| Camp → −120 m (Rustbelt) | 90 s | Elevator, one descent |
| Camp → −450 m (Kiln) | 4 min | Elevator plus transfer at −120 m |
| Camp → −700 m (Deep Veins) | 7 min | Two transfers, supplied-air line required |
| Ladderway backup | 2.5 min per 40 m | Always available, always slower, always a decision |
| Any face → nearest air station | ≤ 90 s | Air stations are placed to this rule |
| Any face → camp, loaded | ≤ 6 min | Worst case must still allow one round trip per 18-minute shift |

The elevator is the colony's single point of failure. It is also the campaign's clock: repair contracts
restore it to deeper stops, and every repair is paid for with the ore the player just sold.

### 3. Depth bands

Density is props per 100 m² of floor. Palettes are the base tones the art departments build from; hex
values are binding until an art-direction revision says otherwise.

| Band | Rock and palette | Hazards | Ores | Props and density | Density |
| --- | --- | --- | --- | --- | ---: |
| Upper Workings | Timbered shale, sandstone; `#6b4b2f` timber, `#ffb05c` lamplight | Rotten supports, minor collapse | Hematite, quartz | Beams, rails, ore carts, caged sconces | 6 |
| Rustbelt | Oxidised iron and acid clays; `#8c3b1e` oxide, `#7fae4b` acid | Water ingress, corroded steel, slippery ground | Hematite, chalcopyrite, galena | Pumps, pipe runs, collapsed stopes, rock faces | 9 |
| The Grease | Black shale and oil sands; `#2f3136` shale, `#b9c46a` gas haze | Methane pockets, blocked return airways, slip | Sphalerite, vein-ice, galena | Drill rigs, ducting, sumps, warning boards | 8 |
| The Kiln | Basalt and geothermal seams; `#241f1c` basalt, `#ff6a2a` heat | 45 °C ambient, spontaneous combustion, steam | Wolframite, cinnabar, vein-ice | Vent stacks, heat shields, water tanks | 7 |
| The Glass | Crystal cavities in granite; `#7fd8d0` crystal, `#6f5fa8` violet | Sharp collapse, dust, resonance instability | Wolframite, quartz, monazite | Crystal formations, resin bolts, survey marks | 5 |
| The Deep Veins | Dense dark rock, native metal veins; `#14161a` rock, `#c9a227` ore | Every prior pressure at once | Monazite, galena, native silver | Supplied-air lines, Company relics, deep shafts | 4 |

Band transitions are physical, not portals: each boundary is a worked shaft head, a winch or a collapse
the player must clear. There is no fast travel inside the mine; the elevator is the only shortcut and it
only goes down where the Cooperative has repaired it.

### 4. Landmarks and points of interest

Budget at launch: **12 points of interest**, of which **6 are hand-authored landmark sites** and 6 are
authored set pieces placed inside generated tunnel. Each has a gameplay function, not just a silhouette.

| # | Site | Band | Function | Authored |
| --- | --- | --- | --- | --- |
| 1 | **Old Number Three** | Upper Workings | The 94 CY collapse; teaches reading a sealed route, hides the first Company cache | Hand |
| 2 | **The Sump** | Rustbelt | Flooded pump station; unlocks bulk pumping and the Rustbelt's safe route | Hand |
| 3 | **Kiln Gate** | Kiln | Collapsed ventilation door; restoring it drops Kiln temperatures by 6 °C across the band | Hand |
| 4 | **The Choir** | Glass | Resonating crystal chamber; richest rare-earth face, loudest collapse warning | Hand |
| 5 | **Company Vault** | Deep Veins | Veyra Consolidated records and a tungsten cache; lore and a tier-3 shortcut | Hand |
| 6 | **Brackwater Reservoir Intake** | Surface/Rustbelt | Colony water supply; the player can divert it and change the colony's mood and prices | Hand |
| 7 | Sumpers' Market | Upper Workings | Filter and lamp trade, safe-route hints, refuses Company goods | Generated placement |
| 8 | Unbound camp | Rustbelt | Rival prospectors; price competition and black-market maps | Generated placement |
| 9 | Methane bloom | Grease | High-yield vein-ice behind a gas pocket; needs detection and airflow | Generated placement |
| 10 | Ash fall | Kiln | Cinnabar face with a fire risk that can cost the shift | Generated placement |
| 11 | Survey cairn | Glass | Reveals 120 m of map; guarded by a span that needs resin | Generated placement |
| 12 | Deep air station | Deep Veins | Last refill before the deepest face; sabotaged on first visit | Generated placement |

### 5. Society and factions

Brackwater is a colony of roughly **900 people**, down from 4,000 at the peak. The player is a bonded
prospector of the Cooperative, working off a charter debt, which is why the first tool is bad and the first
contract is unfair.

| Faction | Who they are | What they want | How they change play |
| --- | --- | --- | --- |
| **Brackwater Cooperative** | The colony's remnant government and the player's charter holder | Keep the elevator running, keep steel and fuel flowing | Issues the 24 contracts, owns the refinery (8% fee), sets the scrip economy |
| **Veyra Consolidated remnant** ("Company Men") | Eleven former engineers and a lawyer holding old survey rights | Recover records from the Company Vault, buy tungsten quietly | Sells deep maps, pays above market for tungsten, raises prices if trusted |
| **The Unbound** | Independent prospectors working unregistered seams | Access, buyers, no questions | Compete on the market, undercut the player's sales, sell filters at a markup |
| **The Sumpers** | About 140 people living in the Upper Workings since the 94 CY collapse | Air filters, respect, no Company presence below −40 m | Trade salvage and safe routes; withhold help if the player serves Company interests |

Reputation is per faction, not a single number. Selling tungsten to the Company Men lowers Sumpers
reputation, which closes their routes; repairing Kiln Gate raises Cooperative reputation, which opens
deeper contracts. The colony reacts through accessible prices, contract availability and routes, never
through a cutscene the player cannot influence.

### 6. History

- **CY 61** — Hematite discovered on the north face. Brackwater founded as a company settlement.
- **CY 78** — Peak. Four thousand workers, three shafts, the Kiln ventilation works completed.
- **CY 94** — The Kiln fire. Third and worst collapse: 63 dead, lower workings sealed, Number Three
  abandoned mid-shift. The Sumpers are the families who refused to leave.
- **CY 101** — Veyra Consolidated bankrupt and gone within a season. The Cooperative formed from the 900
  who stayed, inheriting an elevator nobody could afford to maintain.
- **CY 112, now** — The elevator fails at −120 m. The Cooperative opens contracts to bonded prospectors.
  The Deep Veins are on the Company's old maps and on nobody's current ones.

This history explains the present state mechanically: rotten timber is 18 years old, pumps are missing
parts, the Kiln is hot because its ventilation door is sealed, and the deepest ore is untouched because
the only people who mapped it left.

### 7. Environmental storytelling rules

Three layers, no text dumps, no audio logs longer than 20 seconds:

1. **Company layer** — signage, shift boards, safety posters, stamped equipment. Tells the official story
   and where the Company cut corners.
2. **Personal layer** — lunch pails, boots by a bench, a name scratched into a beam, a card game left
   mid-hand at Number Three. Tells who was here and what they were doing.
3. **Geological layer** — strata, water marks, scorch lines, collapse planes. Tells what the mountain did,
   which is usually the truth the Company layer denies.

Rule: every hand-authored site must carry one prop from each layer, and no written text may be required to
understand a hazard. Hazards are always readable from geometry, sound and the HUD.

### 8. Hand-authored versus generated

- **Hand-authored (D08 lead):** the six landmark sites, Brackwater hub, the elevator and the four band
  transition shafts. These carry the campaign and the faction content.
- **Generated within authored rules (D29 lead, D03 rules):** the remaining tunnel network, ore placement,
  secondary POIs and cave detail.

Generation guarantees, per 250 m of generated tunnel and per band:

1. At least one ore cluster of the band's primary ore, reachable without crossing a hazard the current
   tier cannot survive.
2. At least two air pockets and one water source, placed no more than 90 s from any face.
3. No dead end longer than 120 m that contains no ore and no POI.
4. A route to the band's shaft head of no more than 6 minutes at walk speed with a loaded pack.
5. No generated span wider than the band's rock allows without support (shale 4 m, sandstone 6 m, granite
   9 m, crystal 5 m).
6. The band's hazard appears at least once before its ore appears, so the lesson lands first.

Determinism: same seed, same map. D29 owns the generator, D03 owns the rules, and D33 verifies the six
guarantees over at least 100 seeds in the testing phase.

### 9. Asset evidence

Eight CC0 assets are already recorded in `assets.json` and pass `npm run studio -- assets audit`. They are
the approved starting kit for these locations; anything else is acquired by D37 or authored by D06–D12.

| Asset | Licence | Creator | Intended use |
| --- | --- | --- | --- |
| `PLH-0008` Rock Face 01 | CC0 1.0 | Dario Barresi (Poly Haven) | Rustbelt and granite face modular kit |
| `D3A-0007` Collapsed cave chamber | CC0 1.0 | 3D Assets | Old Number Three collapse geometry |
| `D3A-0005` Mireglass Mineral Vent | CC0 1.0 | 3D Assets | Kiln fumarole and mineral vent dressing |
| `PLH-0012` Old Drill Press | CC0 1.0 | Harsh Vardhan Singh | Workshop and refinery interior |
| `PLH-0008-06-furniture` Industrial Caged Sconce | CC0 1.0 | Ulan Cabanilla | Upper Workings lamp dressing |
| `ACG-0010` Rock063 | CC0 1.0 | ambientCG | Shale and basalt PBR base |
| `ACG-0015` Concrete042A | CC0 1.0 | ambientCG | Brackwater and elevator concrete |
| `ACG-0012` Ground037 | CC0 1.0 | ambientCG | Rustbelt ground blend |

The catalogue's `galleryId` field preserves the source gallery id where the gallery itself reuses ids; the
project id is unique per file path so two records can never be confused during integration.

### 10. Constraints this bible places on other departments

- **Names:** only Mount Veyra, Brackwater, Veyra Consolidated, Brackwater scrip and the twelve sites above.
  New names require an amendment to this document.
- **Depth and ore table:** fixed for the campaign; D26 may not move an ore without a decision record.
- **Traversal:** the 6-minute loaded return and 90-second air rule are budgets D08 and D29 must satisfy,
  and D33 must measure.
- **Population:** the Sumpers, Unbound and Company Men are simulated at the population level by D31
  (schedules, jobs, faction standing); named speaking characters are out of scope for this title.
- **Hazards:** every hazard must be legible without text; D05 and D13 own the non-text cues.

### 11. Handoff

- **D08 Environment Art** owns dressing the six landmarks and the hub from these rules.
- **D29 Procedural Generation** implements the generator to the six guarantees and the determinism rule.
- **D32 Dynamic World** owns heat, water ingress and gas pockets inside these bands.
- **D26 Mining** owns the ore table and the cut behaviour of each listed rock.
- **D31 Population** simulates the four factions' people at colony scale, not as scripted extras.
- **D13 VFX and D14 Sound** own the non-text hazard cues.
- **D37 Asset Acquisition** sources the remaining props per band, subject to the licence gate.
- This bible is invalidated if the depth-band count, ore table, landmark budget or traversal budget
  changes without a decision record.

## Acceptance

| Criterion | Met | Evidence |
| --- | --- | --- |
| Regions and biomes with a gameplay purpose for each | yes | Section 3: six bands, one new pressure and one ore family each |
| Landmark and POI budget stated in numbers | yes | Section 4: 12 POIs, 6 hand-authored landmarks, 6 generated placements |
| World history and faction context explaining the current state | yes | Sections 5 and 6: four factions, CY 61–112 timeline accounting for rotten timber, sealed Kiln, missing pumps and unmapped depths |
| Scale and traversal times consistent with the movement budget | yes | Section 2: speeds from the GDD, 90 s to −120 m, 4 min to −450 m, 6 min loaded return, 90 s air rule |

## Handoff

See section 11. Generation guarantees are testable and are therefore part of the D29 acceptance criteria,
not advice. Any new proper noun introduced downstream must come back here first.
