---
owner: D01
department: D01
revision: 1
project: God's Eye
status: approved
---

# God's Eye — Concept Brief

## Deliverable

### Hook

One immortal mind raises a world on the table in his cabin, and you wear his body to walk the ground he
has made — and the ground keeps changing while you are away.

### Creative pillars

1. **The table is the world, not a map of it.** There is no separate strategic layer. The board in the
   cabin and the ground you stand on are two views of one tile store. Move a tile on the table and the
   same tile has moved when you descend onto it.
2. **The world works without you.** Johan keeps shaping and the inhabitants keep living whether the
   player is watching, sleeping or away from the keyboard. Progress is time, not input.
3. **Light carries the story.** The cabin is four square metres of lantern against a whole daylight world.
   The contrast between the warm room and the cold bright land is the game's emotional argument, so the
   lighting and rendering budget is a design budget, not a polish task.

### Genre, dimension and platforms

- **Genre:** procedural sandbox / living-world simulation.
- **Subgenre:** first-person walkable world with a table-bound overview; no combat, no fail state.
- **Dimension:** 3D, two cameras — first-person in the cabin and the region, an orbiting camera over the
  table.
- **Platforms:** WebGL desktop (primary) and WebGL mobile in landscape (secondary, same world, reduced
  quality tier).
- **Constraint that shapes everything:** it runs in a browser tab, saves on the device, and has no server
  simulation. Every feature has to survive a frame budget and a cold page load.

### Reference works

| Work | Borrow | Avoid |
| --- | --- | --- |
| Minecraft | Terrain edits that become walkable consequence; blocks as a legible unit of change | Resource grinding as the gate on creation; a flat, unlit look |
| Dwarf Fortress | A simulation that keeps running when nobody is watching; inhabitants with their own memory | Opaque presentation and ASCII abstraction standing in for art direction |
| RimWorld | Small cast, personal memory, emergent story from systems rather than script | Management overhead: the player should raise ground, not fill in schedules |
| Proteus | A world that is worth walking through with no objective at all | Its refusal of legible structure: God's Eye needs towns, roads and names |

### Differentiator

**The table is the render target for the same state the player walks in.** A single tile store drives a
board you can turn in your hands and a first-person region built from it, at the same coordinates.

Test: on the table, select tile (x, y); mutate it (Johan raises or carves it); descend; the player is
standing on that tile and the change is present in both views, with no export step and no second copy of
the world. A competitor cannot claim this unchanged while also shipping the table as a minimap.

### Scope boundaries

- One player, one persistent world per device. No multiplayer, no accounts required to play.
- No combat, no vehicles, no cinematics. The drama is geography, population and time.
- Saving is local; the world survives a reload and advances while the tab is hidden.

## Acceptance

| Criterion | How this brief meets it |
| --- | --- |
| One-sentence hook and three named creative pillars | Hook above; pillars 1–3, each named and testable |
| Genre, subgenre, dimension and platforms stated | Procedural sandbox / living-world simulation; 3D; two cameras; WebGL desktop + WebGL mobile |
| At least three reference works with borrow/avoid | Four references, each with a specific borrow and a specific avoid |
| One testable differentiator | The shared tile store, with the on-table → descend test written out |

## Handoff

- **D02 Game Design** turns the three pillars into systems: what the player can raise, carve and break;
  how time advances while away; what the inhabitants do without the player.
- **D03 World Building** owns the world's rules of place: biomes, coastlines, the island Johan starts on.
- **D08 Environment Art** and **D12 Lighting and Rendering** receive pillar 3 as a hard constraint: the
  cabin's warm interior and the region's daylight must both be produced by one renderer within the
  browser frame budget.
- **D34 Performance Engineering** receives the platform split: desktop is the measured target, mobile is
  a reduced tier of the same build, not a separate product.
