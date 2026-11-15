// Original procedural generator — effects and animations.
// Authored here (deterministic, seeded) rather than downloaded, so these are
// recorded in provenance as original_generated.

import { svg, lin, rad, rnd } from './gen-ui.mjs';

const KINDS = {
  glow_orb: (p, v, r, S) => {
    const acc = [p[5], p[7], p[6], p[4]][v % 4];
    const cx = S / 2, cy = S / 2;
    let rings = '';
    for (let i = 0; i < 5; i++) {
      rings += `<circle cx="${cx}" cy="${cy}" r="${70 + i * 26}" stroke="${acc}" stroke-opacity="${0.4 - i * 0.06}" stroke-width="${2 + i}"/>`;
    }
    return svg(S, S, rad('c', '#ffffff', acc) + rad('o', acc, acc),
      `<circle cx="${cx}" cy="${cy}" r="${S * 0.45}" fill="url(#o)" fill-opacity=".35"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${72 + v * 5}" fill="url(#c)" opacity=".95"/>` + rings);
  },

  energy_arc: (p, v, r, S) => {
    const acc = [p[5], p[6], p[7], p[4]][v % 4];
    let d = `M40 ${S / 2}`;
    for (let i = 1; i <= 14; i++) d += ` L${40 + (i * (S - 80)) / 14} ${S / 2 + (r() - 0.5) * 260}`;
    return svg(S, S, '',
      `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
        `<path d="${d}" stroke="${acc}" stroke-width="${14 - v * 2}" stroke-opacity=".25" stroke-linejoin="round"/>` +
        `<path d="${d}" stroke="${acc}" stroke-width="${4 - v * 0.4}" stroke-linejoin="round"/>` +
        `<path d="${d}" stroke="#ffffff" stroke-width="1.5" stroke-opacity=".8" stroke-linejoin="round"/>`);
  },

  particle_burst: (p, v, r, S) => {
    const acc = [p[5], p[6], p[7], p[4]][v % 4];
    const cx = S / 2, cy = S / 2;
    let g = '';
    for (let i = 0; i < 70 + v * 14; i++) {
      const a = r() * Math.PI * 2, d = 40 + r() * (S * 0.42);
      g += `<circle cx="${cx + Math.cos(a) * d}" cy="${cy + Math.sin(a) * d}" r="${1 + r() * 4}" fill="${acc}" fill-opacity="${0.25 + r() * 0.7}"/>`;
    }
    return svg(S, S, rad('pb', acc, acc), `<circle cx="${cx}" cy="${cy}" r="${S * 0.4}" fill="url(#pb)" fill-opacity=".5"/>` + g);
  },

  sparks: (p, v, r, S) => {
    const acc = [p[7], p[6], p[5], p[4]][v % 4];
    let g = '';
    for (let i = 0; i < 40; i++) {
      const x = r() * S, y = r() * S, l = 10 + r() * 60, a = r() * Math.PI * 2;
      g += `<path d="M${x} ${y} L${x + Math.cos(a) * l} ${y + Math.sin(a) * l}" stroke="${acc}" stroke-width="${1 + r() * 2}" stroke-opacity="${0.3 + r() * 0.7}"/>`;
    }
    return svg(S, S, '', `<rect width="${S}" height="${S}" fill="${p[0]}"/>` + g);
  },

  smoke_plume: (p, v, r, S) => {
    const c = ['#d9d9d9', '#8f8f8f', '#cbb9a0', '#6f7f8c', '#b5a89a'][v % 5];
    let g = '';
    for (let i = 0; i < 16; i++) {
      g += `<ellipse cx="${S / 2 + (r() - 0.5) * 220}" cy="${S - 80 - i * 24}" rx="${60 + r() * 90}" ry="${40 + r() * 60}" fill="${c}" fill-opacity="${0.05 + r() * 0.1}"/>`;
    }
    return svg(S, S, `<filter id="bl"><feGaussianBlur stdDeviation="${6 + v * 3}"/></filter>`,
      `<rect width="${S}" height="${S}" fill="${p[0]}"/><g filter="url(#bl)">${g}</g>`);
  },

  flame: (p, v, r, S) => {
    const a = ['#ffd166', '#ff7b00', '#e63946', '#ff9e00', '#f4a261'][v % 5];
    let g = '';
    for (let i = 0; i < 9; i++) {
      const w = 40 + r() * 60, h = 140 + r() * 240, x = S / 2 + (r() - 0.5) * 180;
      g += `<path d="M${x} ${S - 60} q-${w / 2} -${h * 0.5} 0 -${h} q${w / 2} ${h * 0.5} 0 ${h} z" fill="${a}" fill-opacity="${0.12 + r() * 0.2}"/>`;
    }
    return svg(S, S, `<filter id="fb"><feGaussianBlur stdDeviation="${10 + v * 2}"/></filter>`,
      `<rect width="${S}" height="${S}" fill="${p[0]}"/><g filter="url(#fb)">${g}</g>` +
        `<ellipse cx="${S / 2}" cy="${S - 70}" rx="150" ry="34" fill="${a}" fill-opacity=".25"/>`);
  },

  shockwave: (p, v, r, S) => {
    const acc = [p[5], p[7], p[6], p[4]][v % 4];
    const cx = S / 2, cy = S / 2;
    let g = '';
    for (let i = 0; i < 4; i++) {
      g += `<circle cx="${cx}" cy="${cy}" r="${60 + i * 46 + v * 6}" stroke="${acc}" stroke-width="${6 - i}" stroke-opacity="${0.9 - i * 0.18}"/>`;
    }
    return svg(S, S, rad('sw', acc, acc), `<circle cx="${cx}" cy="${cy}" r="${S * 0.3}" fill="url(#sw)" fill-opacity=".55"/>` + g);
  },

  god_rays: (p, v, r, S) => {
    const acc = ['#ffe9b0', '#cfe6ff', '#ffd6a5', '#e0d4ff', '#d7f7e3'][v % 5];
    let g = '';
    for (let i = 0; i < 18; i++) {
      const a = (Math.PI * 2 * i) / 18 + r() * 0.2, w = 0.02 + r() * 0.05;
      g += `<path d="M${S / 2} ${S * 0.28} L${S / 2 + Math.cos(a - w) * S} ${S * 0.28 + Math.sin(a - w) * S} L${S / 2 + Math.cos(a + w) * S} ${S * 0.28 + Math.sin(a + w) * S} z" fill="${acc}" fill-opacity="${0.05 + r() * 0.09}"/>`;
    }
    return svg(S, S, `<filter id="gr"><feGaussianBlur stdDeviation="${5 + v * 2}"/></filter>` + rad('sun', '#ffffff', acc),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/><g filter="url(#gr)">${g}</g>` +
        `<circle cx="${S / 2}" cy="${S * 0.28}" r="${60 + v * 8}" fill="url(#sun)" fill-opacity=".7"/>`);
  },

  rune_circle: (p, v, r, S) => {
    const acc = [p[4], p[6], p[7], p[5]][v % 4];
    const cx = S / 2, cy = S / 2, R = 168 + v * 10;
    const rot = v * 0.13;
    let g = `<circle cx="${cx}" cy="${cy}" r="${R}" stroke="${acc}" stroke-width="3"/>`;
    g += `<circle cx="${cx}" cy="${cy}" r="${R - 34}" stroke="${acc}" stroke-width="2" stroke-opacity=".7"/>`;
    g += `<circle cx="${cx}" cy="${cy}" r="${R - 96}" stroke="${acc}" stroke-width="2" stroke-opacity=".6" stroke-dasharray="6 10"/>`;
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12 + rot;
      g += `<path d="M${cx + (R - 34) * Math.cos(a)} ${cy + (R - 34) * Math.sin(a)} L${cx + R * Math.cos(a)} ${cy + R * Math.sin(a)}" stroke="${acc}" stroke-width="3"/>`;
      const a2 = (Math.PI * 2 * (i + 5)) / 12 + rot;
      g += `<path d="M${cx + (R - 60) * Math.cos(a)} ${cy + (R - 60) * Math.sin(a)} L${cx + (R - 60) * Math.cos(a2)} ${cy + (R - 60) * Math.sin(a2)}" stroke="${acc}" stroke-opacity=".45" stroke-width="1.5"/>`;
    }
    return svg(S, S, rad('rc', acc, acc),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${R - 60}" fill="url(#rc)" fill-opacity=".25"/>` + g);
  },

  vortex: (p, v, r, S) => {
    const acc = [p[5], p[7], p[6], p[4]][v % 4];
    const cx = S / 2, cy = S / 2;
    let d = '';
    for (let t = 0; t < 900; t += 4) {
      const a = t * 0.05 + v, rr = 14 + t * 0.28;
      d += `${t === 0 ? 'M' : 'L'}${cx + rr * Math.cos(a)} ${cy + rr * Math.sin(a)} `;
    }
    return svg(S, S, rad('vx', acc, acc),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${S * 0.4}" fill="url(#vx)" fill-opacity=".3"/>` +
        `<path d="${d}" stroke="${acc}" stroke-width="3" stroke-opacity=".8" fill="none"/>`);
  },
};

const ORDER = Object.keys(KINDS);
const NAMES = [
  'Glow Orb', 'Energy Arc', 'Particle Burst', 'Spark Shower', 'Smoke Plume',
  'Flame Tongue', 'Shockwave Ring', 'God Rays', 'Rune Circle', 'Vortex Swirl',
];

export function generateEffectAsset({ palette, index, seed }) {
  const r = rnd(seed);
  const kind = ORDER[index % ORDER.length];
  const variant = Math.floor(index / ORDER.length) % 5;
  const baseName = NAMES[ORDER.indexOf(kind)] || kind;
  return {
    name: `${baseName} ${['I', 'II', 'III', 'IV', 'V'][variant] || variant + 1}`,
    kind,
    svg: KINDS[kind](palette, variant, r, 512),
    width: 512,
    height: 512,
    tags: ['effect', kind.replace(/_/g, ' '), 'vfx', 'overlay', 'transparent-ready'],
  };
}
