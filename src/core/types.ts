import type { Body, BodyRegion } from './anatomy';
import type { WorldTerrain } from '../world/worldgen';

export type Gender = 'M' | 'F';
export type PowerKey = 'speed' | 'strength' | 'teleport' | 'invisible' | 'invincible' | 'flying';
export type CheatCode = 'midas' | 'slumlord' | 'powers' | 'ages' | 'lucifer' | 'people' | 'crownme';

/**
 * Cheat state lives in the save so a reload keeps it. Power unlocks are also
 * mirrored into a local bloodline vault so a new character inherits them forever.
 */
export interface Cheats {
  /** Cheat UI stays hidden until a code is used in the Build search. */
  revealed: boolean;
  /** Only these codes are written into the Cheats panel. */
  discovered: CheatCode[];
  midas: boolean;
  slumlord: boolean;
  ages: boolean;
  lucifer: boolean;
  people: boolean;
  crownme: boolean;
  powersUnlocked: boolean;
  powers: Record<PowerKey, boolean>;
  bloodline: PowerKey[];
}
export type WeaponKind = 'fist' | 'club' | 'dagger' | 'sword' | 'axe' | 'spear' | 'bow' | 'crossbow' | 'musket' | 'hammer' | 'staff';
export type WeaponMaterial = 'wood' | 'stone' | 'copper' | 'bronze' | 'iron' | 'steel';

export interface Weapon {
  id: string;
  kind: WeaponKind;
  name: string;
  material: WeaponMaterial;
  damage: number;
  reach: number;
  twoHanded: boolean;
  ranged: boolean;
  durability: number;
  maxDurability: number;
}

export type WeaponCondition = 'New' | 'Good' | 'Worn' | 'Damaged' | 'Nearly broken' | 'Broken';

export interface Genes {
  strength: number;
  agility: number;
  endurance: number;
  intellect: number;
  resilience: number;
}

export interface Personality {
  openness: number;
  aggression: number;
  loyalty: number;
  empathy: number;
  bravery: number;
  industry: number;
  ambition: number;
}

export interface Needs {
  hunger: number;
  thirst: number;
  fatigue: number;
  happiness: number;
  morale: number;
}

export interface Appearance {
  skin: number;
  hair: number;
  height: number;
  build: number;
  clothing: number;
}

export interface MemoryRecord {
  id: string;
  tick: number;
  day: number;
  location: string;
  type:
    | 'permanent-injury' | 'dismemberment' | 'near-death' | 'death-witnessed'
    | 'family-death' | 'betrayal' | 'theft' | 'generosity' | 'battle' | 'victory'
    | 'marriage' | 'birth' | 'agreement' | 'broken-promise' | 'finisher-wound' | 'finisher-kill';
  summary: string;
  attackerId: string | null;
  victimId: string | null;
  witnesses: string[];
  factionId: string | null;
  emotionalImpact: number;
  consequences: string;
  replay?: CinematicSnapshot;
}

export interface CinematicSnapshot {
  attackerPos: [number, number, number];
  victimPos: [number, number, number];
  facing: number;
  part: string;
  option: 'wound' | 'kill';
  weaponName: string;
  victimName: string;
}

export interface Relationship {
  affinity: number;
  trust: number;
  fear: number;
  lastInteractionTick: number;
}

export interface NPC {
  id: string;
  name: string;
  firstName: string;
  family: string;
  age: number;
  gender: Gender;
  factionId: string | null;
  isPlayer: boolean;
  appearance: Appearance;
  genes: Genes;
  personality: Personality;
  needs: Needs;
  health: number;
  maxHealth: number;
  alive: boolean;
  body: Body;
  skills: Record<string, number>;
  xp: Record<string, number>;
  occupation: string;
  education: number;
  inventory: Record<string, number>;
  money: number;
  weapon: Weapon | null;
  armor: number;
  homeId: string | null;
  businessId: string | null;
  familyIds: string[];
  parentIds: string[];
  spouseId: string | null;
  childIds: string[];
  relationships: Record<string, Relationship>;
  opinions: Record<string, number>;
  loyalty: number;
  politicalBeliefs: { authority: number; tradition: number; militarism: number };
  memories: MemoryRecord[];
  goals: string[];
  fears: string[];
  ambitions: string[];
  history: string[];
  position: { x: number; z: number };
  activity: string;
  activityTarget: { x: number; z: number } | null;
  inCombat: boolean;
  enemyId: string | null;
  lastAttackerId: string | null;
  attackCooldown: number;
  simLevel: 'near' | 'far' | 'aggregate';
  rentDue: number;
  woundedAt: number | null;
  deathTick: number | null;
  deathCause: string | null;
  lastDecisionTick: number;
}

export type GovernmentType = 'Unorganised' | 'Tribal leadership' | 'Chiefdom' | 'Monarchy' | 'Republic' | 'Democracy' | 'Dictatorship' | 'Theocracy' | 'Empire';

export interface Law {
  id: string;
  name: string;
  description: string;
  penalty: string;
  enforced: boolean;
  publicSupport: number;
}

export interface Faction {
  id: string;
  name: string;
  adjective: string;
  color: number;
  regionId: string;
  capital: { x: number; z: number };
  government: GovernmentType;
  leaderId: string | null;
  councilIds: string[];
  treasury: number;
  taxRate: number;
  techAge: number;
  techPoints: number;
  aggressionModifier: number;
  /** Hidden until the player gathers intelligence. */
  aggressiveDiscovered: boolean;
  relations: Record<string, number>;
  wars: string[];
  alliances: string[];
  treaties: string[];
  laws: Law[];
  military: { soldiers: number; wagesOwed: number; training: number; equipment: number };
  militaryLedger: { wages: number; food: number; equipment: number; upkeep: number };
  population: number;
  territory: string[];
  knownByPlayer: number;
  history: string[];
  buildQueue: string[];
  lastExpansionTick: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  category: string;
  age: number;
  purpose: string;
  cost: Record<string, number>;
  buildDays: number;
  maintenance: number;
  workers: number;
  techRequired: number;
  interior: string[];
  upgradeOf: string | null;
  produces?: Record<string, number>;
  rentable?: boolean;
  bedCount?: number;
}

export interface BuildingInstance {
  id: string;
  defId: string;
  name: string;
  ownerId: string | null;
  factionId: string | null;
  position: { x: number; z: number };
  rotation: number;
  progress: number;
  built: boolean;
  /** Player builds take this many seconds of visible staged construction. */
  constructionSeconds?: number;
  condition: number;
  inventory: Record<string, number>;
  workers: string[];
  tenantId: string | null;
  rent: number;
  businessId: string | null;
  size: number;
}

export interface Business {
  id: string;
  name: string;
  buildingId: string;
  ownerId: string;
  factionId: string | null;
  employees: string[];
  inventory: Record<string, number>;
  prices: Record<string, number>;
  revenue: number;
  expenses: number;
  priceMarkup: number;
  open: boolean;
}

export interface MarketGood {
  good: string;
  basePrice: number;
  stock: number;
  demand: number;
}

export interface Market {
  id: string;
  name: string;
  factionId: string | null;
  position: { x: number; z: number };
  goods: Record<string, MarketGood>;
  wealth: number;
}

export interface HistoryEvent {
  id: string;
  tick: number;
  day: number;
  type: string;
  text: string;
  participants: string[];
  factionId: string | null;
  location: string;
  significant: boolean;
}

export interface FinishingState {
  active: boolean;
  phase: 'idle' | 'choosing' | 'wound' | 'kill';
  attackerId: string | null;
  victimId: string | null;
  part: string | null;
  weaponName: string;
  startedAt: number;
  elapsed: number;
  cameraAngle: number;
  applied: boolean;
  snapshot: CinematicSnapshot | null;
}

export interface LogEntry {
  id: string;
  tick: number;
  text: string;
  tone: 'neutral' | 'good' | 'bad' | 'war' | 'memory';
}

export interface Settings {
  gore: number;
  slowMotion: number;
  slowMotionDuration: number;
  distantSim: boolean;
  shadows: boolean;
  showReticle: boolean;
  firstPerson: boolean;
}

export interface Planting {
  id: string;
  x: number;
  z: number;
  species: 'broadleaf' | 'pine';
}

export interface ResourceNode {
  id: string;
  type: string;
  position: { x: number; z: number };
  amount: number;
  regionId: string;
}

export interface WeatherState {
  current: 'Clear' | 'Overcast' | 'Rain' | 'Storm' | 'Fog' | 'Snow' | 'Heatwave';
  intensity: number;
}

export interface Corpse {
  id: string;
  npcId: string;
  name: string;
  position: { x: number; z: number };
  inventory: Record<string, number>;
  money: number;
  tick: number;
  cause: string;
}

export interface World {
  version: number;
  seed: number;
  terrain: WorldTerrain;
  corpses: Corpse[];
  tick: number;
  minutes: number;
  day: number;
  season: 'Spring' | 'Summer' | 'Autumn' | 'Winter';
  weather: WeatherState;
  playerId: string;
  npcs: Map<string, NPC>;
  factions: Faction[];
  buildings: BuildingInstance[];
  businesses: Business[];
  markets: Market[];
  history: HistoryEvent[];
  resources: ResourceNode[];
  finishing: FinishingState;
  settings: Settings;
  log: LogEntry[];
  timeScale: number;
  paused: boolean;
  currentInteriorId: string | null;
  worldName: string;
  deaths: number;
  births: number;
  /** Lord Slayer, the autonomous graphics keeper. */
  designBotId: string | null;
  /** Trees actually planted in the world by accepted design notes. */
  plantings?: Planting[];
  cheats: Cheats;
}

export interface AttackOptions {
  aimedPart?: BodyRegion | null;
  aimedSide?: 'L' | 'R' | null;
  power?: number;
  ranged?: boolean;
  sneak?: boolean;
  defenderBlocking?: boolean;
}

export interface AttackResult {
  hit: boolean;
  blocked: boolean;
  dodged: boolean;
  damage: number;
  part: string | null;
  injuryId: string | null;
  fatal: boolean;
  dismembered: boolean;
  durabilityLoss: number;
  message: string;
  qualifiesFinisher: boolean;
  weaponBroke: boolean;
}
