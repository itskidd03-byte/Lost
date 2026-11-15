import type { RNG } from './rng';

const FIRST_M = [
  'Aldric', 'Bram', 'Cael', 'Dorn', 'Edric', 'Fenn', 'Garrick', 'Halvor', 'Ivo', 'Jorun',
  'Kestrel', 'Lucan', 'Marek', 'Nestor', 'Orin', 'Perrin', 'Quill', 'Rann', 'Soren', 'Torvin',
  'Ulric', 'Vane', 'Wystan', 'Yarrow', 'Zeph', 'Baldur', 'Corvin', 'Dain', 'Ewan', 'Falk'
];

const FIRST_F = [
  'Ada', 'Brenna', 'Cerys', 'Dara', 'Elowen', 'Fiona', 'Greta', 'Hilda', 'Ilsa', 'Juna',
  'Kara', 'Liora', 'Maren', 'Nyssa', 'Orla', 'Perrinne', 'Quenna', 'Rhea', 'Sable', 'Tamsin',
  'Una', 'Vesna', 'Wren', 'Yara', 'Zara', 'Alys', 'Bettina', 'Corra', 'Dahlia', 'Edda'
];

const FAMILY = [
  'Ashford', 'Blackreed', 'Coldwater', 'Dunmoor', 'Eldergrove', 'Fenwick', 'Greyhollow', 'Harrow',
  'Ironvale', 'Juniper', 'Kestrelmoor', 'Larkfield', 'Mirebank', 'Northwatch', 'Oakhollow',
  'Pinehurst', 'Quarrystone', 'Redmarsh', 'Saltmarsh', 'Thornbury', 'Underhill', 'Valebrook',
  'Westwind', 'Yewbarrow', 'Amberfen', 'Briarwood', 'Coppervein', 'Driftwood', 'Emberlyn', 'Flintlock'
];

const FACTION_PREFIX = [
  'Kingdom of', 'Clan', 'Hollow', 'Order of', 'Free', 'House', 'Tribe of', 'Dominion of',
  'Covenant of', 'Reach of', 'Fen', 'Marrow', 'Vale', 'Cinder', 'Tide'
];

const FACTION_ROOT = [
  'Ashfall', 'Brinehold', 'Cinderpeak', 'Duskvale', 'Emberwatch', 'Frostmere', 'Glimmerfen',
  'Hearthstone', 'Ironmarch', 'Jadewater', 'Kelphollow', 'Larkspur', 'Moonharbor', 'Nightreed',
  'Ospreytide', 'Pinecrest', 'Quarrymoor', 'Ravenmarch', 'Saltspire', 'Thistlecrown',
  'Umberfield', 'Verdantmoor', 'Wildermarsh', 'Yarrowfen', 'Zephyrcliff'
];

export function personName(rng: RNG, gender: 'M' | 'F', family?: string): { first: string; family: string; full: string } {
  const first = rng.pick(gender === 'M' ? FIRST_M : FIRST_F);
  const fam = family ?? rng.pick(FAMILY);
  return { first, family: fam, full: `${first} ${fam}` };
}

export function familyName(rng: RNG): string {
  return rng.pick(FAMILY);
}

export function factionName(rng: RNG): string {
  return `${rng.pick(FACTION_PREFIX)} ${rng.pick(FACTION_ROOT)}`;
}

export function factionAdjective(name: string): string {
  const words = name.split(' ');
  return words[words.length - 1];
}
