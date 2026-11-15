import type { RNG } from './rng';

export type BodyRegion =
  | 'head' | 'face' | 'eyes' | 'ears' | 'jaw' | 'neck'
  | 'chest' | 'back' | 'abdomen'
  | 'shoulders' | 'upperArm' | 'elbow' | 'forearm' | 'wrist' | 'hand' | 'fingers'
  | 'hip' | 'thigh' | 'knee' | 'shin' | 'ankle' | 'foot' | 'toes';

export type Side = 'L' | 'R' | '';

export interface RegionInfo {
  label: string;
  /** Damage multiplier when struck here. */
  vital: number;
  /** How likely a hit lands here when the torso is targeted. */
  weight: number;
  /** Can this region be severed by a finishing blow? */
  severable: boolean;
  /** Does losing it disable two-handed weapon use? */
  arms: boolean;
  /** Does losing it cripple movement? */
  leg: boolean;
  /** Does it impair aim / depth perception? */
  aim: boolean;
  /** Impairs fine motor work (crafting, surgery). */
  fine: boolean;
  paired: boolean;
}

export const REGIONS: Record<BodyRegion, RegionInfo> = {
  head: { label: 'Head', vital: 2.4, weight: 4, severable: false, arms: false, leg: false, aim: false, fine: false, paired: false },
  face: { label: 'Face', vital: 1.5, weight: 5, severable: false, arms: false, leg: false, aim: false, fine: false, paired: false },
  eyes: { label: 'Eye', vital: 1.1, weight: 2, severable: false, arms: false, leg: false, aim: true, fine: false, paired: true },
  ears: { label: 'Ear', vital: 0.7, weight: 2, severable: true, arms: false, leg: false, aim: false, fine: false, paired: true },
  jaw: { label: 'Jaw', vital: 1.2, weight: 3, severable: false, arms: false, leg: false, aim: false, fine: false, paired: false },
  neck: { label: 'Neck', vital: 2.8, weight: 2, severable: false, arms: false, leg: false, aim: false, fine: false, paired: false },
  chest: { label: 'Chest', vital: 1.6, weight: 14, severable: false, arms: false, leg: false, aim: false, fine: false, paired: false },
  back: { label: 'Back', vital: 1.4, weight: 10, severable: false, arms: false, leg: false, aim: false, fine: false, paired: false },
  abdomen: { label: 'Abdomen', vital: 1.7, weight: 10, severable: false, arms: false, leg: false, aim: false, fine: false, paired: false },
  shoulders: { label: 'Shoulder', vital: 0.9, weight: 5, severable: false, arms: true, leg: false, aim: false, fine: false, paired: true },
  upperArm: { label: 'Upper arm', vital: 0.8, weight: 6, severable: true, arms: true, leg: false, aim: false, fine: false, paired: true },
  elbow: { label: 'Elbow', vital: 0.8, weight: 4, severable: false, arms: true, leg: false, aim: false, fine: false, paired: true },
  forearm: { label: 'Forearm', vital: 0.8, weight: 5, severable: true, arms: true, leg: false, aim: false, fine: false, paired: true },
  wrist: { label: 'Wrist', vital: 0.7, weight: 3, severable: false, arms: true, leg: false, aim: false, fine: true, paired: true },
  hand: { label: 'Hand', vital: 0.7, weight: 4, severable: true, arms: true, leg: false, aim: false, fine: true, paired: true },
  fingers: { label: 'Fingers', vital: 0.5, weight: 3, severable: true, arms: true, leg: false, aim: false, fine: true, paired: true },
  hip: { label: 'Hip', vital: 1.1, weight: 4, severable: false, arms: false, leg: true, aim: false, fine: false, paired: true },
  thigh: { label: 'Thigh', vital: 0.9, weight: 7, severable: true, arms: false, leg: true, aim: false, fine: false, paired: true },
  knee: { label: 'Knee', vital: 0.9, weight: 5, severable: false, arms: false, leg: true, aim: false, fine: false, paired: true },
  shin: { label: 'Lower leg', vital: 0.8, weight: 5, severable: true, arms: false, leg: true, aim: false, fine: false, paired: true },
  ankle: { label: 'Ankle', vital: 0.7, weight: 3, severable: false, arms: false, leg: true, aim: false, fine: false, paired: true },
  foot: { label: 'Foot', vital: 0.6, weight: 3, severable: true, arms: false, leg: true, aim: false, fine: false, paired: true },
  toes: { label: 'Toes', vital: 0.4, weight: 2, severable: true, arms: false, leg: false, aim: false, fine: false, paired: true }
};

/** Body regions the player can explicitly aim at with TARGET INJURY. */
export const TARGETABLE: BodyRegion[] = [
  'hand', 'fingers', 'forearm', 'upperArm', 'eyes', 'ears', 'face', 'jaw',
  'neck', 'chest', 'abdomen', 'thigh', 'knee', 'shin', 'foot', 'toes'
];

export type InjuryType =
  | 'bruise' | 'cut' | 'fracture' | 'sprain' | 'burn' | 'bite' | 'concussion'
  | 'dental' | 'scar' | 'eye' | 'ear' | 'nerve' | 'joint' | 'disfigurement' | 'amputation';

export interface Injury {
  id: string;
  part: string;
  type: InjuryType;
  /** 0 means healed; 1-3 severity while active. */
  severity: number;
  permanent: boolean;
  dismembered: boolean;
  createdAt: number;
  healAt: number | null;
  cause: string;
  attackerId: string | null;
  bleeding: boolean;
}

export interface BodyPart {
  key: string;
  region: BodyRegion;
  side: Side;
  dismembered: boolean;
  bleeding: number;
  injuries: Injury[];
}

export type Body = Record<string, BodyPart>;

export function partKey(region: BodyRegion, side: Side = ''): string {
  return `${region}${side ? ':' + side : ''}`;
}

export function describePart(key: string): string {
  const [region, side] = key.split(':') as [BodyRegion, Side];
  const info = REGIONS[region];
  if (!info) return key;
  if (!side || !info.paired) return info.label;
  return `${side === 'L' ? 'Left' : 'Right'} ${info.label.toLowerCase()}`;
}

export function createBody(): Body {
  const body: Body = {};
  (Object.keys(REGIONS) as BodyRegion[]).forEach((region) => {
    const info = REGIONS[region];
    const sides: Side[] = info.paired ? ['L', 'R'] : [''];
    for (const side of sides) {
      const key = partKey(region, side);
      body[key] = { key, region, side, dismembered: false, bleeding: 0, injuries: [] };
    }
  });
  return body;
}

export function bodyParts(body: Body): BodyPart[] {
  return Object.values(body);
}

export function missingParts(body: Body): BodyPart[] {
  return bodyParts(body).filter((p) => p.dismembered);
}

export function activeInjuries(body: Body): Injury[] {
  return bodyParts(body).flatMap((p) => p.injuries.filter((i) => i.severity > 0));
}

export function hasMissing(body: Body, region: BodyRegion): boolean {
  const part = bodyParts(body).find((p) => p.region === region);
  return !!part?.dismembered;
}

/** Aggregate pain / impairment 0..1 used by combat and labour math. */
export function impairment(body: Body): number {
  const injuries = activeInjuries(body);
  let score = 0;
  for (const inj of injuries) {
    score += inj.severity * (inj.permanent ? 2.2 : 1) + (inj.dismembered ? 3 : 0);
  }
  for (const part of bodyParts(body)) {
    if (part.dismembered) score += 2.5;
  }
  return Math.min(1, score / 22);
}

export function accuracyPenalty(body: Body): number {
  let penalty = 0;
  for (const part of bodyParts(body)) {
    if (!part.dismembered) continue;
    const info = REGIONS[part.region];
    if (info.aim) penalty += 0.28;
    if (info.arms) penalty += 0.18;
  }
  return Math.min(0.75, penalty);
}

export function mobilityFactor(body: Body): number {
  let factor = 1;
  for (const part of bodyParts(body)) {
    if (!part.dismembered) continue;
    const info = REGIONS[part.region];
    if (info.leg) factor -= 0.32;
    if (part.region === 'foot' || part.region === 'toes') factor -= 0.08;
  }
  return Math.max(0.18, factor);
}

/** Two-handed weapons become unusable with one arm. */
export function canUseTwoHanded(body: Body): boolean {
  const lost = bodyParts(body).filter((p) => p.dismembered && REGIONS[p.region].arms).length;
  const missingFingers = bodyParts(body).filter((p) => p.dismembered && p.region === 'fingers').length;
  return lost === 0 && missingFingers < 2;
}

export function fineMotorFactor(body: Body): number {
  let factor = 1;
  for (const part of bodyParts(body)) {
    if (!part.dismembered) continue;
    if (REGIONS[part.region].fine) factor -= 0.2;
  }
  return Math.max(0.2, factor);
}

/** Pick a plausible impact region for an unaimed blow. */
export function rollRegion(rng: RNG, preferHigh = false): BodyRegion {
  const entries = (Object.keys(REGIONS) as BodyRegion[]).map((region) => {
    const info = REGIONS[region];
    let weight = info.weight;
    if (preferHigh) weight *= info.vital;
    return [region, weight] as [BodyRegion, number];
  });
  return rng.weighted(entries);
}
