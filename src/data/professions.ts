export interface ProfessionDef {
  id: string;
  name: string;
  skill: string;
  stat: 'strength' | 'agility' | 'intellect' | 'endurance';
  produces?: string;
}

/** All professions an NPC can hold. Skill growth is required to qualify for advanced work. */
export const PROFESSIONS: ProfessionDef[] = [
  { id: 'farmer', name: 'Farmer', skill: 'farming', stat: 'endurance', produces: 'grain' },
  { id: 'blacksmith', name: 'Blacksmith', skill: 'smithing', stat: 'strength', produces: 'tools' },
  { id: 'woodcutter', name: 'Woodcutter', skill: 'woodwork', stat: 'strength', produces: 'wood' },
  { id: 'miner', name: 'Miner', skill: 'mining', stat: 'strength', produces: 'stone' },
  { id: 'apothecary', name: 'Apothecary', skill: 'medicine', stat: 'intellect', produces: 'medicine' },
  { id: 'soldier', name: 'Soldier', skill: 'combat', stat: 'strength' },
  { id: 'hunter', name: 'Hunter', skill: 'hunting', stat: 'agility', produces: 'meat' },
  { id: 'fisherman', name: 'Fisherman', skill: 'fishing', stat: 'endurance', produces: 'fish' },
  { id: 'builder', name: 'Builder', skill: 'building', stat: 'strength' },
  { id: 'carpenter', name: 'Carpenter', skill: 'carpentry', stat: 'intellect', produces: 'wood' },
  { id: 'mason', name: 'Mason', skill: 'masonry', stat: 'strength', produces: 'stone' },
  { id: 'merchant', name: 'Merchant', skill: 'trade', stat: 'intellect' },
  { id: 'tailor', name: 'Tailor', skill: 'tailoring', stat: 'agility', produces: 'cloth' },
  { id: 'cook', name: 'Cook', skill: 'cooking', stat: 'intellect', produces: 'bread' },
  { id: 'brewer', name: 'Brewer', skill: 'brewing', stat: 'endurance', produces: 'ale' },
  { id: 'doctor', name: 'Doctor', skill: 'medicine', stat: 'intellect' },
  { id: 'teacher', name: 'Teacher', skill: 'teaching', stat: 'intellect' },
  { id: 'engineer', name: 'Engineer', skill: 'engineering', stat: 'intellect' },
  { id: 'scholar', name: 'Scholar', skill: 'scholarship', stat: 'intellect' },
  { id: 'priest', name: 'Priest', skill: 'faith', stat: 'intellect' },
  { id: 'guard', name: 'Guard', skill: 'guarding', stat: 'endurance' },
  { id: 'administrator', name: 'Administrator', skill: 'administration', stat: 'intellect' },
  { id: 'architect', name: 'Architect', skill: 'architecture', stat: 'intellect' },
  { id: 'hauler', name: 'Transport worker', skill: 'transport', stat: 'endurance' },
  { id: 'handler', name: 'Animal handler', skill: 'animalHandling', stat: 'agility', produces: 'meat' },
  { id: 'artisan', name: 'Artisan', skill: 'artistry', stat: 'agility', produces: 'pottery' },
  { id: 'mechanic', name: 'Mechanic', skill: 'mechanics', stat: 'intellect', produces: 'tools' },
  { id: 'scientist', name: 'Scientist', skill: 'scholarship', stat: 'intellect' }
];

export const PROFESSION_BY_ID = new Map(PROFESSIONS.map((p) => [p.id, p]));

export const SKILLS = [
  'farming', 'smithing', 'woodwork', 'mining', 'medicine', 'combat', 'hunting', 'fishing',
  'building', 'carpentry', 'masonry', 'trade', 'tailoring', 'cooking', 'brewing', 'teaching',
  'engineering', 'scholarship', 'faith', 'guarding', 'administration', 'architecture',
  'transport', 'animalHandling', 'artistry', 'mechanics', 'unarmed'
];

/** Professions the settlement needs most, in rough priority order. */
export function startingProfession(age: number): string[] {
  const base = ['hunter', 'woodcutter', 'builder', 'fisherman', 'farmer', 'miner', 'cook', 'apothecary', 'guard', 'merchant'];
  if (age >= 1) base.push('blacksmith', 'mason');
  if (age >= 2) base.push('carpenter', 'brewer', 'tailor');
  if (age >= 3) base.push('soldier', 'artist' in {} ? 'artisan' : 'artisan');
  if (age >= 4) base.push('teacher', 'doctor', 'administrator');
  if (age >= 6) base.push('engineer', 'mechanic');
  return base;
}
