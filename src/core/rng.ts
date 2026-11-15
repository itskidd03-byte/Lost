/** Deterministic seeded random number generator (mulberry32). */
export class RNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  range(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** Weighted pick from [value, weight] pairs. */
  weighted<T>(pairs: readonly [T, number][]): T {
    const total = pairs.reduce((sum, p) => sum + Math.max(0, p[1]), 0);
    if (total <= 0) return pairs[0][0];
    let roll = this.next() * total;
    for (const [value, weight] of pairs) {
      roll -= Math.max(0, weight);
      if (roll <= 0) return value;
    }
    return pairs[pairs.length - 1][0];
  }
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function uid(prefix: string, rng?: RNG): string {
  const r = rng ? rng.int(0, 0xffffff) : Math.floor(Math.random() * 0xffffff);
  return `${prefix}_${r.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
