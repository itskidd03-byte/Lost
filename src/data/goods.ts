/** Goods, food and weapons used by the economy and combat systems. */

export interface GoodDef {
  id: string;
  name: string;
  basePrice: number;
  category: 'food' | 'material' | 'tool' | 'luxury' | 'medicine';
  nutrition?: number;
  hydration?: number;
}

export const GOODS: Record<string, GoodDef> = {
  berries: { id: 'berries', name: 'Wild berries', basePrice: 2, category: 'food', nutrition: 8, hydration: 2 },
  meat: { id: 'meat', name: 'Meat', basePrice: 6, category: 'food', nutrition: 24 },
  fish: { id: 'fish', name: 'Fish', basePrice: 4, category: 'food', nutrition: 18, hydration: 2 },
  grain: { id: 'grain', name: 'Grain', basePrice: 3, category: 'food', nutrition: 14 },
  bread: { id: 'bread', name: 'Bread', basePrice: 4, category: 'food', nutrition: 22 },
  water: { id: 'water', name: 'Water', basePrice: 1, category: 'food', hydration: 30 },
  ale: { id: 'ale', name: 'Ale', basePrice: 5, category: 'food', hydration: 12, nutrition: 4 },
  wood: { id: 'wood', name: 'Timber', basePrice: 2, category: 'material' },
  stone: { id: 'stone', name: 'Stone', basePrice: 3, category: 'material' },
  clay: { id: 'clay', name: 'Clay', basePrice: 2, category: 'material' },
  iron: { id: 'iron', name: 'Iron ore', basePrice: 9, category: 'material' },
  copper: { id: 'copper', name: 'Copper ore', basePrice: 7, category: 'material' },
  gold: { id: 'gold', name: 'Gold', basePrice: 25, category: 'luxury' },
  herbs: { id: 'herbs', name: 'Herbs', basePrice: 5, category: 'medicine' },
  medicine: { id: 'medicine', name: 'Medicine', basePrice: 18, category: 'medicine' },
  cloth: { id: 'cloth', name: 'Cloth', basePrice: 6, category: 'material' },
  tools: { id: 'tools', name: 'Tools', basePrice: 12, category: 'tool' },
  weapons: { id: 'weapons', name: 'Weapons', basePrice: 20, category: 'tool' },
  pottery: { id: 'pottery', name: 'Pottery', basePrice: 5, category: 'luxury' },
  salt: { id: 'salt', name: 'Salt', basePrice: 8, category: 'luxury' }
};

export const FOOD_GOODS = Object.values(GOODS).filter((g) => (g.nutrition ?? 0) > 0);
export const DRINK_GOODS = Object.values(GOODS).filter((g) => (g.hydration ?? 0) > 0);

export const STARTING_WEAPON_NAMES: Record<string, string> = {
  fist: 'Bare hands',
  club: 'Wooden club',
  dagger: 'Dagger',
  sword: 'Sword',
  axe: 'Axe',
  spear: 'Spear',
  bow: 'Hunting bow',
  crossbow: 'Crossbow',
  musket: 'Musket',
  hammer: 'War hammer',
  staff: 'Staff'
};

export function weaponCondition(durability: number, max: number): string {
  if (durability <= 0) return 'Broken';
  const ratio = durability / max;
  if (ratio > 0.9) return 'New';
  if (ratio > 0.7) return 'Good';
  if (ratio > 0.45) return 'Worn';
  if (ratio > 0.25) return 'Damaged';
  return 'Nearly broken';
}

export function durabilityMultiplier(durability: number, max: number): number {
  if (durability <= 0) return 0.35;
  return 0.55 + 0.45 * (durability / max);
}

export const RESOURCE_LABEL: Record<string, string> = {
  wood: 'Timber', stone: 'Stone', iron: 'Iron', copper: 'Copper', gold: 'Gold',
  clay: 'Clay', herbs: 'Herbs', fish: 'Fish', peat: 'Peat', salt: 'Salt', game: 'Game', water: 'Water'
};
