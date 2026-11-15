// AEGIS graphics memory bank — collection, category and source planning.
// All counts here are contractual: build-assets.mjs refuses to finish unless
// every category reaches its exact required count.

export const BANK_DIR = 'AEGIS_GRAPHICS_MEMORY';
export const PIPELINE_VERSION = '1.0.0';

// Fixed category order also fixes asset-id allocation, so ids are stable
// across reruns: the first 75 ids in a collection are always characters, etc.
export const CATEGORIES = [
  { key: 'characters', label: 'Characters and NPCs', count: 75 },
  { key: 'architecture', label: 'Buildings and architecture', count: 75 },
  { key: 'environments', label: 'Environments and landscapes', count: 100 },
  { key: 'objects', label: 'Objects and props', count: 75 },
  { key: 'textures', label: 'Textures and materials', count: 75 },
  { key: 'ui', label: 'UI elements and icons', count: 75 },
  { key: 'effects', label: 'Effects and animations', count: 50 },
  { key: 'concepts', label: 'Concept art and references', count: 75 },
];

export const DEPARTMENTS = [
  {
    key: 'DARK_FUTURISTIC_INDUSTRIAL',
    id_prefix: 'DFI',
    style: 'dark_futuristic_industrial',
    name: 'Dark Futuristic / Industrial',
    palette: ['#0d0f12', '#1b2026', '#3a444f', '#6f7d8c', '#8b1a1a', '#d94a1f', '#e8a33d', '#7fb3d5'],
    keywords: ['dark steel', 'black metal', 'graphite', 'industrial lighting', 'crimson', 'amber', 'cyan'],
    palette_tags: ['black', 'steel', 'graphite', 'crimson', 'amber', 'cyan'],
    texture_categories: ['metal', 'industrial', 'concrete', 'plaster-concrete', 'asphalt', 'roofing', 'wall', 'dirty'],
    queries: {
      characters: [
        'humanoid robot', 'industrial robot arm', 'automaton clockwork', 'robot sculpture',
        'robotic exoskeleton', 'NASA robonaut', 'android figure', 'animatronic figure',
        'machine man statue', 'robot head closeup', 'mechanical puppet', 'cybernetic sculpture',
      ],
      architecture: [
        'industrial architecture interior', 'factory building interior', 'power plant hall',
        'brutalist concrete architecture', 'cooling tower power station', 'steel mill interior',
        'oil refinery plant', 'aircraft hangar interior', 'warehouse interior steel',
        'electrical substation', 'abandoned factory hall', 'blast furnace plant',
        'grain silo industrial', 'water treatment plant interior',
      ],
      environments: [
        'data center server room', 'server racks corridor', 'industrial control room',
        'turbine hall power station', 'mine tunnel underground', 'chemical plant pipes',
        'oil refinery at night', 'electrical switchyard', 'wind farm turbines',
        'solar power plant array', 'steam pipes industrial', 'engine room ship machinery',
        'submarine interior control', 'foundry molten metal', 'assembly line factory',
        'semiconductor cleanroom', 'particle accelerator tunnel', 'satellite dish array',
        'radio telescope array', 'cooling pipes industrial',
      ],
      objects: [
        'industrial machinery gears', 'valve pipeline industrial', 'turbine blade machine',
        'hydraulic cylinder machinery', 'circuit board electronics', 'mainframe computer vintage',
        'oscilloscope instrument', 'welding equipment', 'engine block cutaway',
        'jet engine turbine', 'power tool drill', 'scientific laboratory instrument',
        'electrical motor industrial', 'pressure gauge meter', 'conveyor belt machinery',
      ],
      concepts: [
        'NASA spacecraft concept', 'NASA lunar base concept', 'NASA mars rover',
        'space station module', 'technical drawing machine', 'patent drawing engine',
        'engineering blueprint mechanical', 'futuristic city rendering', 'robot design sketch',
        'control panel diagram', 'laboratory apparatus diagram', 'satellite technical illustration',
      ],
      texture_queries: ['metal plate', 'rusty metal', 'corrugated steel', 'painted metal', 'brushed steel'],
    },
  },
  {
    key: 'PHOTOREALISTIC',
    id_prefix: 'PHR',
    style: 'photorealistic',
    name: 'Photorealistic',
    palette: ['#f2efe9', '#c9c2b6', '#8e8578', '#5b554c', '#3d4a52', '#6b7f6a', '#a8763e', '#2f3a44'],
    keywords: ['believable materials', 'natural light', 'real proportions', 'detailed texture', 'cinematic photography'],
    palette_tags: ['natural', 'earth', 'neutral', 'warm', 'cool'],
    texture_categories: ['wood', 'fabric', 'brick', 'rock', 'leather', 'tiles', 'ground', 'plaster'],
    queries: {
      characters: [
        'portrait photograph man', 'portrait photograph woman', 'full body portrait photograph',
        'worker portrait photograph', 'dancer photograph', 'elderly portrait photograph',
        'face closeup portrait', 'child portrait photograph', 'soldier portrait photograph',
        'craftsman at work portrait',
      ],
      architecture: [
        'building facade architecture', 'modern architecture glass', 'gothic cathedral exterior',
        'stone bridge structure', 'skyscraper facade', 'house exterior timber',
        'church interior nave', 'staircase interior architecture', 'historic building facade',
        'train station hall architecture',
      ],
      environments: [
        'mountain landscape valley', 'forest path trees', 'coast beach sea', 'desert dunes',
        'river valley landscape', 'lake reflection landscape', 'meadow field grass',
        'cave interior rock', 'waterfall cascade', 'snow landscape winter',
        'cloudy sky clouds', 'canyon rock formation', 'city skyline street',
        'interior room daylight', 'kitchen interior wooden', 'workshop interior tools',
        'greenhouse plants interior', 'harbour boats', 'orchard trees rows', 'field farmland harvest',
      ],
      objects: [
        'still life photograph objects', 'hand tools workshop', 'bicycle side view',
        'car side view classic', 'steam locomotive engine', 'aircraft propeller plane',
        'wooden chair furniture', 'ceramic vase pottery', 'clock mechanism gears',
        'typewriter machine', 'vintage camera', 'violin musical instrument',
        'leather shoe pair', 'woven basket craft', 'brass instrument detail',
      ],
      concepts: [
        'architectural drawing plan', 'botanical illustration plant', 'anatomy drawing human',
        'engineering drawing technical', 'old map cartography', 'scientific illustration animal',
        'perspective study drawing', 'mechanical patent illustration', 'geological diagram strata',
        'craft pattern diagram',
      ],
      texture_queries: [],
    },
  },
  {
    key: 'FANTASY_CINEMATIC',
    id_prefix: 'FCN',
    style: 'fantasy_cinematic',
    name: 'Fantasy / Cinematic',
    palette: ['#1a1410', '#3b2b1c', '#6e4f2a', '#a8792f', '#c9a227', '#4a5b46', '#7a2b25', '#d8c9a3'],
    keywords: ['epic fantasy', 'cinematic lighting', 'worldbuilding', 'atmospheric depth', 'gold', 'ember'],
    palette_tags: ['gold', 'ember', 'moss', 'parchment', 'bronze'],
    texture_categories: ['stone', 'sandstone', 'rock', 'bark', 'terrain', 'fabric', 'plaster', 'wood'],
    queries: {
      characters: [
        'knight armour medieval', 'samurai armour', 'warrior painting', 'mythological figure painting',
        'goddess statue marble', 'medieval knight horseback', 'hero sculpture bronze',
        'angel painting renaissance', 'demon engraving', 'centaur painting',
      ],
      architecture: [
        'medieval castle', 'gothic cathedral', 'medieval town houses', 'palace hall interior',
        'ancient temple columns', 'fortress walls', 'abbey ruins', 'stone tower medieval',
        'castle gatehouse', 'medieval bridge stone',
      ],
      environments: [
        'forest painting romantic', 'mountain landscape painting', 'ancient ruins columns',
        'dungeon vault stone', 'cave temple interior', 'volcano eruption painting',
        'waterfall painting romantic', 'misty valley painting', 'night sky landscape painting',
        'stormy sea painting', 'desert ruins ancient', 'garden paradise painting',
        'alpine mountains dramatic', 'glacier landscape',
      ],
      objects: [
        'sword medieval weapon', 'shield heraldry', 'crown royal', 'chalice goblet',
        'amulet pendant ancient', 'armour helmet medieval', 'bow weapon archery',
        'dagger knife medieval', 'lantern oil antique', 'manuscript book medieval',
        'tapestry medieval', 'banner heraldic',
      ],
      concepts: [
        'dragon engraving', 'mythological engraving', 'manuscript illumination medieval',
        'coat of arms heraldry', 'bestiary illustration', 'apocalypse engraving',
        'allegory painting', 'legend illustration', 'fresco ceiling painting',
        'romantic landscape drawing',
      ],
      texture_queries: [],
    },
  },
];

export const TOTAL_REQUIRED = DEPARTMENTS.reduce(
  (sum, d) => sum + CATEGORIES.reduce((s, c) => s + c.count, 0),
  0,
);
