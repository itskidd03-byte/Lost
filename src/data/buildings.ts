import type { BuildingDef } from '../core/types';

interface CategoryDef {
  key: string;
  label: string;
  purpose: string;
  interior: string[];
  archetypes: string[];
  produces?: Record<string, number>;
  rentable?: boolean;
  bedCount?: number;
}

const CATEGORIES: CategoryDef[] = [
  {
    key: 'residential', label: 'Residential', purpose: 'Housing for a household',
    interior: ['bed', 'hearth', 'chest', 'table', 'chair', 'shelf'],
    archetypes: ['Hut', 'Cottage', 'Longhouse', 'House', 'Manor', 'Tenement', 'Villa', 'Estate'],
    rentable: true, bedCount: 4
  },
  {
    key: 'agriculture', label: 'Agriculture', purpose: 'Produces food for the settlement',
    interior: ['store', 'workbench', 'basket', 'loom'],
    archetypes: ['Field Plot', 'Granary', 'Orchard', 'Farmstead', 'Mill', 'Irrigation Works', 'Plantation', 'Agri-Complex'],
    produces: { grain: 6 }
  },
  {
    key: 'commercial', label: 'Commercial', purpose: 'Trades goods and generates revenue',
    interior: ['counter', 'shelf', 'till', 'crate', 'stool'],
    archetypes: ['Market Stall', 'Shop', 'Trading Post', 'Tavern', 'Inn', 'Exchange', 'Arcade', 'Commercial Tower']
  },
  {
    key: 'industrial', label: 'Industrial', purpose: 'Processes materials into goods',
    interior: ['furnace', 'anvil', 'workbench', 'crate', 'toolRack'],
    archetypes: ['Workshop', 'Smithy', 'Kiln', 'Foundry', 'Factory', 'Refinery', 'Assembly Hall', 'Industrial Plant'],
    produces: { tools: 2 }
  },
  {
    key: 'extraction', label: 'Resource extraction', purpose: 'Draws raw resources from the land',
    interior: ['shaft', 'cart', 'toolRack', 'lamp'],
    archetypes: ['Dig Pit', 'Quarry', 'Mine', 'Shaft Mine', 'Drift Mine', 'Ore Works', 'Deep Mine', 'Extraction Rig'],
    produces: { stone: 5 }
  },
  {
    key: 'government', label: 'Government', purpose: 'Administers laws, taxes and diplomacy',
    interior: ['desk', 'banner', 'chair', 'ledger', 'hearth'],
    archetypes: ['Meeting Ground', 'Chief Hall', 'Court Hall', 'Town Hall', 'Palace', 'Senate', 'Ministry', 'Capitol']
  },
  {
    key: 'military', label: 'Military', purpose: 'Trains and houses soldiers',
    interior: ['weaponRack', 'bunk', 'mapTable', 'armorStand'],
    archetypes: ['Watch Post', 'Barracks', 'Gatehouse', 'Keep', 'Fortress', 'Arsenal', 'Command Post', 'Citadel']
  },
  {
    key: 'religious', label: 'Religious', purpose: 'Centre of faith and morale',
    interior: ['altar', 'candles', 'bench', 'idol'],
    archetypes: ['Shrine', 'Sacred Grove', 'Temple', 'Chapel', 'Cathedral', 'Sanctum', 'Grand Temple', 'Pilgrim Hall']
  },
  {
    key: 'education', label: 'Education', purpose: 'Teaches skills to the next generation',
    interior: ['desk', 'bookshelf', 'bench', 'chalkboard'],
    archetypes: ['Teaching Circle', 'Schoolroom', 'Archive', 'Academy', 'College', 'University', 'Institute', 'Research Campus']
  },
  {
    key: 'healthcare', label: 'Healthcare', purpose: 'Treats injuries and disease',
    interior: ['cot', 'herbShelf', 'table', 'washbasin'],
    archetypes: ['Herb Hut', 'Healer Hut', 'Apothecary', 'Infirmary', 'Hospital', 'Surgery', 'Clinic', 'Medical Centre']
  },
  {
    key: 'entertainment', label: 'Entertainment', purpose: 'Raises happiness and morale',
    interior: ['stage', 'benches', 'barrels', 'lantern'],
    archetypes: ['Gathering Fire', 'Beer Hall', 'Arena', 'Theatre', 'Bathhouse', 'Colosseum', 'Opera House', 'Amphitheatre']
  },
  {
    key: 'transport', label: 'Transportation', purpose: 'Moves people and goods',
    interior: ['ticketDesk', 'crate', 'bench', 'mapTable'],
    archetypes: ['Landing', 'Dock', 'Stable', 'Waystation', 'Warehouse Dock', 'Rail Depot', 'Terminal', 'Transit Hub']
  },
  {
    key: 'storage', label: 'Storage', purpose: 'Stores resources safely',
    interior: ['crate', 'shelf', 'barrel', 'ledger'],
    archetypes: ['Pit Store', 'Storehouse', 'Cellar', 'Granary Silo', 'Vault', 'Depot', 'Bonded Warehouse', 'Logistics Centre']
  },
  {
    key: 'infrastructure', label: 'Infrastructure', purpose: 'Supports the settlement network',
    interior: ['pump', 'toolRack', 'valve', 'ledger'],
    archetypes: ['Well', 'Cistern', 'Aqueduct', 'Roadworks', 'Sewer Works', 'Power House', 'Utility Yard', 'Grid Station']
  },
  {
    key: 'technology', label: 'Modern technology', purpose: 'Drives late-age research and production',
    interior: ['console', 'workbench', 'cables', 'generator'],
    archetypes: ['Observatory', 'Laboratory', 'Workshop Lab', 'Power Plant', 'Factory Line', 'Data Hall', 'Research Reactor', 'Automation Plant']
  }
];

const AGE_NAMES = ['Stone Age', 'Copper Age', 'Bronze Age', 'Iron Age', 'Medieval Age', 'Renaissance', 'Industrial Age', 'Modern Age'];

const AGE_MATERIALS = [
  ['Thatch', 'Mudbrick', 'Hide', 'Wattle', 'Log', 'Flint', 'Earth', 'Bone'],
  ['Copper-clad', 'Copper-roofed', 'Rammed-earth', 'Copper-trimmed', 'Stone-set', 'Copper', 'Turf', 'Copper-lined'],
  ['Bronze-clad', 'Bronze-roofed', 'Timber-framed', 'Bronze-gated', 'Stone-dressed', 'Bronze', 'Brick', 'Bronze-lined'],
  ['Iron-clad', 'Iron-gated', 'Stone-walled', 'Iron-reinforced', 'Slate', 'Iron', 'Mortared', 'Iron-bound'],
  ['Half-timbered', 'Vaulted', 'Castle', 'Guild', 'Manor', 'Abbey', 'Cobbled', 'Towered'],
  ['Gilded', 'Marble', 'Renaissance', 'Ornate', 'Domed', 'Clockwork', 'Florentine', 'Columned'],
  ['Brick industrial', 'Steam-powered', 'Ironworks', 'Riveted', 'Rail-side', 'Coal-fired', 'Steel-frame', 'Smokestack'],
  ['Modern', 'Glass-fronted', 'Reinforced concrete', 'Steel-and-glass', 'Modular', 'Solar', 'High-rise', 'Automated']
];

const CATEGORY_COSTS: Record<string, Record<string, number>> = {
  residential: { wood: 20, stone: 6, clay: 4 },
  agriculture: { wood: 14, stone: 4, tools: 1 },
  commercial: { wood: 24, stone: 10, tools: 2 },
  industrial: { wood: 26, stone: 18, iron: 4, tools: 3 },
  extraction: { wood: 18, stone: 8, tools: 3 },
  government: { wood: 30, stone: 26, gold: 2 },
  military: { wood: 28, stone: 30, iron: 8 },
  religious: { wood: 22, stone: 22, gold: 1 },
  education: { wood: 24, stone: 18, cloth: 4 },
  healthcare: { wood: 20, stone: 14, herbs: 6 },
  entertainment: { wood: 26, stone: 12, ale: 4 },
  transport: { wood: 30, stone: 14, cloth: 3 },
  storage: { wood: 18, stone: 10, clay: 6 },
  infrastructure: { wood: 16, stone: 20, tools: 2 },
  technology: { stone: 24, iron: 12, tools: 5, gold: 3 }
};

/** Generates the full 480-entry building catalog (15 categories x 8 ages x 4 tiers). */
function buildCatalog(): BuildingDef[] {
  const defs: BuildingDef[] = [];
  for (const cat of CATEGORIES) {
    for (let age = 0; age < 8; age++) {
      for (let tier = 0; tier < 4; tier++) {
        const archetype = cat.archetypes[(age + tier) % cat.archetypes.length];
        const material = AGE_MATERIALS[age][(tier + age) % 8];
        // Two tiers share a material word, so tier is encoded explicitly for uniqueness.
        const tierName = ['I', 'II', 'III', 'IV'][tier];
        const name = `${material} ${archetype} ${tierName}`;
        const cost: Record<string, number> = {};
        const base = CATEGORY_COSTS[cat.key];
        const scale = 1 + age * 0.85 + tier * 0.18;
        for (const [good, amount] of Object.entries(base)) {
          cost[good] = Math.round(amount * scale);
        }
        defs.push({
          id: `b_${cat.key}_a${age}_t${tier}`,
          name,
          category: cat.label,
          age,
          purpose: cat.purpose,
          cost,
          buildDays: Math.round((2 + age * 1.6 + tier * 0.7) * 10) / 10,
          maintenance: Math.round((1 + age * 1.5) * (1 + tier * 0.25) * 10) / 10,
          workers: cat.key === 'residential' ? 0 : Math.max(1, tier + 1),
          techRequired: age,
          interior: cat.interior,
          upgradeOf: null,
          produces: cat.produces ? scaleProduction(cat.produces, age, tier) : undefined,
          rentable: cat.rentable,
          bedCount: cat.bedCount
        });
      }
    }
  }
  // Link upgrade paths: each tier upgrades into the next tier of the same category/age.
  const index = new Map(defs.map((d) => [d.id, d]));
  for (const def of defs) {
    const match = def.id.match(/^b_(.+)_a(\d)_t(\d)$/);
    if (!match) continue;
    const tier = Number(match[3]);
    if (tier < 3) {
      const next = index.get(`b_${match[1]}_a${match[2]}_t${tier + 1}`);
      if (next) next.upgradeOf = def.id;
    }
  }
  return defs;
}

function scaleProduction(base: Record<string, number>, age: number, tier: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [good, amount] of Object.entries(base)) {
    out[good] = Math.round(amount * (1 + age * 0.6 + tier * 0.2) * 10) / 10;
  }
  return out;
}

export const BUILDING_DEFS: BuildingDef[] = buildCatalog();
export const BUILDING_BY_ID: Map<string, BuildingDef> = new Map(BUILDING_DEFS.map((d) => [d.id, d]));
export const BUILDING_CATEGORIES: string[] = Array.from(new Set(BUILDING_DEFS.map((d) => d.category)));
export const AGE_LABELS = AGE_NAMES;

export function buildingsByAgeAndCategory(age: number, category: string): BuildingDef[] {
  return BUILDING_DEFS.filter((d) => d.age === age && d.category === category);
}

export const ROAD_TYPES = [
  { id: 'dirt', name: 'Dirt path', cost: { wood: 0 }, buildDays: 0.2, speed: 1.05, age: 0 },
  { id: 'stone', name: 'Stone road', cost: { stone: 2 }, buildDays: 0.4, speed: 1.2, age: 1 },
  { id: 'cobble', name: 'Cobblestone road', cost: { stone: 4 }, buildDays: 0.6, speed: 1.35, age: 2 },
  { id: 'paved', name: 'Paved road', cost: { stone: 6 }, buildDays: 0.8, speed: 1.5, age: 4 },
  { id: 'industrial', name: 'Industrial road', cost: { stone: 8, iron: 1 }, buildDays: 1, speed: 1.7, age: 6 },
  { id: 'highway', name: 'Highway', cost: { stone: 12, iron: 3 }, buildDays: 1.4, speed: 2, age: 7 }
];
