# Iron Veins — master specification

- Slug: `iron-veins`
- Dimension: 3D
- Platforms: webgl, desktop
- Genres: Mining, crafting and resource management, Survival
- Active departments: 33 of 41
- Performance profiles: webgl-desktop, desktop-mid

## Concept

A first-person survival mining game: dig ore veins deep underground, refine metals, craft machines, and trade in a frontier colony economy.

## Intake reasoning

- Hybrid intake: Mining, crafting and resource management + Survival.
- 33 of 41 departments activated for a 3D project.

**Detected genres:**

- `mining` matched: mining, ore, underground, refine
- `survival` matched: survival, craft

**Tags used for activation:** `3d` `crafting` `ecology` `economy` `industry` `mining` `openworld` `population` `procedural` `resources` `society` `survival`

## Department assignments

| Department | Division | Activation reason | Queue |
| --- | --- | --- | --- |
| D01 Creative Direction | creative-design | always active | [queue](queues/creative-direction.json) |
| D02 Game Design | creative-design | always active | [queue](queues/game-design.json) |
| D03 World Building | creative-design | always active | [queue](queues/world-building.json) |
| D05 User Experience and Interface | creative-design | always active | [queue](queues/ux-ui.json) |
| D06 3D Modeling | graphics-audio | tag: 3d | [queue](queues/3d-modeling.json) |
| D08 Environment Art | graphics-audio | tag: 3d | [queue](queues/environment-art.json) |
| D09 Materials and Textures | graphics-audio | tag: 3d | [queue](queues/materials-textures.json) |
| D10 Character Art | graphics-audio | tag: 3d | [queue](queues/character-art.json) |
| D11 Animation | graphics-audio | tag: 3d | [queue](queues/animation.json) |
| D12 Lighting and Rendering | graphics-audio | tag: 3d | [queue](queues/lighting-rendering.json) |
| D13 VFX | graphics-audio | tag: 3d | [queue](queues/vfx.json) |
| D14 Sound Design | graphics-audio | always active | [queue](queues/sound-design.json) |
| D15 Music Production | graphics-audio | always active | [queue](queues/music.json) |
| D17 Game Engine Architecture | engineering | always active | [queue](queues/engine-architecture.json) |
| D18 Gameplay Programming | engineering | always active | [queue](queues/gameplay-programming.json) |
| D19 Physics Engineering | engineering | always active | [queue](queues/physics.json) |
| D20 AI Engineering | engineering | tag: survival | [queue](queues/ai-engineering.json) |
| D22 Backend and Data Engineering | engineering | tag: economy | [queue](queues/backend-data.json) |
| D26 Mining and Resource Systems | game-systems | tag: mining | [queue](queues/mining-resources.json) |
| D27 Survival and Simulation Systems | game-systems | tag: survival | [queue](queues/survival-systems.json) |
| D29 Procedural Generation | game-systems | tag: procedural | [queue](queues/procedural-generation.json) |
| D30 Economy and Simulation | simulation | tag: economy | [queue](queues/economy-simulation.json) |
| D31 Population and Society Simulation | simulation | tag: population | [queue](queues/population-simulation.json) |
| D32 Dynamic World Systems | simulation | tag: openworld | [queue](queues/dynamic-world.json) |
| D33 Quality Assurance | qa-operations | always active | [queue](queues/quality-assurance.json) |
| D34 Performance Engineering | qa-operations | always active | [queue](queues/performance-engineering.json) |
| D35 Compatibility Engineering | qa-operations | always active | [queue](queues/compatibility.json) |
| D36 Security and Reliability | qa-operations | tag: economy | [queue](queues/security-reliability.json) |
| D37 Asset Acquisition | qa-operations | always active | [queue](queues/asset-acquisition.json) |
| D38 Asset Integration | qa-operations | always active | [queue](queues/asset-integration.json) |
| D39 Technical Art | qa-operations | tag: 3d | [queue](queues/technical-art.json) |
| D40 Production Management | qa-operations | always active | [queue](queues/production.json) |
| D41 Studio Research and Innovation | research-innovation | always active | [queue](queues/research-innovation.json) |

### Departments deliberately not activated

- D04 Narrative and Storytelling — no matching tag (narrative, rpg, mmorpg, story, quest, campaign, single-player-story)
- D07 2D Art and Illustration — dimension: needs 2d/2.5d/isometric
- D16 Cinematics — no matching tag (narrative, cinematic, cutscene, story, campaign, rpg)
- D21 Multiplayer Engineering — no matching tag (multiplayer, mmorpg, coop, pvp, competitive, online)
- D23 Shooter Systems — no matching tag (shooter, fps, tps, combat, military, battle-royale, extraction)
- D24 Civilisation and Strategy Systems — no matching tag (strategy, grand-strategy, rts, 4x, civilization, empire, tactical, military)
- D25 Building and Construction Systems — no matching tag (construction, sandbox, city, base-building, building, factory, colony)
- D28 Vehicle Engineering — no matching tag (vehicles, racing, flight, naval, driving, tanks)

## Shared knowledge

- [Game design document](knowledge/gdd.md) — owner D02
- [Art direction](knowledge/art-direction.md) — owner D01
- [Technical architecture](knowledge/technical-architecture.md) — owner D17
- [Performance budget](knowledge/performance-budget.md) — owner D34
- [Test plan](knowledge/test-plan.md) — owner D33
- [Asset catalogue](assets.json) — owner D37
- [Decision log](decision-log.md) — Studio Director

## Pipeline

- **1. Concept** (lead D01): Understand the idea, fix the creative identity and establish what is and is not being made.
- **2. Design** (lead D02): Turn the concept into implementable systems, world, story, UX and production plan.
- **3. Technical Planning** (lead D17): Choose the engine and architecture, set budgets, and define the data and platform contracts.
- **4. Art Direction** (lead D08): Fix the visual and audio language and the asset requirements that follow from it.
- **5. Prototype** (lead D18): Prove the core loop is playable and fun in a real build before mass production.
- **6. Production** (lead D40): Every department produces and integrates its systems, assets and content.
- **7. Testing** (lead D33): Find out what is actually broken across gameplay, interface, compatibility, saves and performance.
- **8. Optimisation** (lead D34): Hit the frame and memory budgets on the weakest declared hardware, measured rather than claimed.
- **9. Polish** (lead D01): Refine feel, clarity and presentation against the creative pillars without adding scope.
- **10. Release** (lead D40): Verify the release candidate against every gate and hand over a build plus its known issues.

## Status

Live status lives in [STATUS.md](STATUS.md) and is regenerated with `npm run studio -- status`.

