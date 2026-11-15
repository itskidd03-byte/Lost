// Original procedural generator — UI elements and icons.
// Authored here (deterministic, seeded) rather than downloaded, so these are
// recorded in provenance as original_generated.

const rnd = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

export const svg = (w, h, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">` +
  (defs ? `<defs>${defs}</defs>` : '') +
  body +
  '</svg>\n';

export const lin = (id, a, b, x2 = 1, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

export const rad = (id, a, b) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>`;

export { rnd };

const KINDS = {
  hud_panel: (p, v, r, S) => {
    const m = 56 + v * 8;
    const acc = [p[4], p[5], p[6], p[7], p[3]][v % 5];
    const bl = 44;
    const corner = (x, y, sx, sy) =>
      `<path d="M${x} ${y + sy * bl} L${x} ${y} L${x + sx * bl} ${y}" stroke="${acc}" stroke-width="3"/>` +
      `<path d="M${x + sx * 8} ${y + sy * 22} L${x + sx * 8} ${y + sy * 8} L${x + sx * 22} ${y + sy * 8}" stroke="${p[3]}" stroke-opacity=".8" stroke-width="2"/>`;
    let g = '';
    for (let i = 0; i < 7; i++) {
      g += `<rect x="${m + 26}" y="${m + 46 + i * 15}" width="${(S - 2 * m - 52) * (0.4 + r() * 0.55)}" height="4" fill="${p[3]}" fill-opacity="${0.25 + r() * 0.5}"/>`;
    }
    return svg(S, S, lin('g1', p[1], p[0]) + rad('gl', acc, acc),
      `<rect x="${m}" y="${m}" width="${S - 2 * m}" height="${S - 2 * m}" rx="46" fill="url(#g1)" stroke="${p[3]}" stroke-opacity=".55" stroke-width="2"/>` +
        `<circle cx="${m + 28}" cy="${m + 26}" r="5" fill="url(#gl)"/>` +
        `<rect x="${m + 18}" y="${m + 18}" width="${S - 2 * m - 36}" height="2" fill="${acc}" fill-opacity=".55"/>` +
        corner(m, m, 1, 1) + corner(S - m, m, -1, 1) + corner(m, S - m, 1, -1) + corner(S - m, S - m, -1, -1) + g);
  },

  button: (p, v, r, S) => {
    const w = 300 + v * 22, h = 88, x = (S - w) / 2, y = (S - h) / 2;
    const acc = [p[5], p[6], p[4], p[7], p[3]][v % 5];
    return svg(S, S, lin('b', p[2], p[1], 0, 1) + rad('gl', acc, acc),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${v % 2 ? h / 2 : 10}" fill="url(#b)" stroke="${acc}" stroke-width="2.5"/>` +
        `<rect x="${x + 10}" y="${y + 10}" width="${w - 20}" height="${h - 20}" rx="${v % 2 ? (h - 20) / 2 : 6}" stroke="${p[3]}" stroke-opacity=".45"/>` +
        `<path d="M${x + 34} ${y + h / 2} h${w - 68}" stroke="${acc}" stroke-opacity=".6" stroke-width="2"/>` +
        `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="9" fill="${acc}" fill-opacity=".85"/>`);
  },

  toggle: (p, v, r, S) => {
    const w = 250, h = 110, x = (S - w) / 2, y = (S - h) / 2;
    const on = v % 2 === 0;
    const acc = [p[5], p[6], p[7], p[4], p[3]][v % 5];
    const kx = on ? x + w - h / 2 - 3 : x + h / 2 + 3;
    return svg(S, S, lin('t', on ? acc : p[2], p[1], 1, 0),
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="url(#t)" stroke="${p[3]}" stroke-opacity=".7" stroke-width="2"/>` +
        `<rect x="${x + 14}" y="${y + 14}" width="${w - 28}" height="${h - 28}" rx="${h / 2 - 14}" stroke="${acc}" stroke-opacity="${on ? 0.5 : 0.18}"/>` +
        `<circle cx="${kx}" cy="${y + h / 2}" r="${h / 2 - 12}" fill="${p[0]}" stroke="${acc}" stroke-width="3"/>` +
        `<circle cx="${kx}" cy="${y + h / 2}" r="${h / 6}" fill="${acc}" fill-opacity="${on ? 0.9 : 0.25}"/>`);
  },

  slider: (p, v, r, S) => {
    const acc = [p[5], p[6], p[4], p[7], p[3]][v % 5];
    const x = 70, w = S - 140, y = 200 + v * 12;
    const fill = 0.25 + r() * 0.6;
    let ticks = '';
    for (let i = 0; i <= 10; i++) {
      ticks += `<rect x="${x + (w / 10) * i - 1}" y="${y + 26}" width="2" height="${i % 5 === 0 ? 16 : 9}" fill="${p[3]}" fill-opacity=".6"/>`;
    }
    return svg(S, S, lin('f', acc, p[2], 1, 0) + rad('kn', acc, acc),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
        `<rect x="${x}" y="${y - 6}" width="${w}" height="12" rx="6" fill="${p[1]}"/>` +
        `<rect x="${x}" y="${y - 6}" width="${w * fill}" height="12" rx="6" fill="url(#f)"/>` +
        `<circle cx="${x + w * fill}" cy="${y}" r="22" fill="${p[0]}" stroke="${acc}" stroke-width="3"/>` +
        `<circle cx="${x + w * fill}" cy="${y}" r="9" fill="url(#kn)"/>` + ticks);
  },

  meter: (p, v, r, S) => {
    const acc = [p[5], p[6], p[4], p[7], p[3]][v % 5];
    const n = 14, gap = 8, bw = (S - 120 - gap * (n - 1)) / n;
    const level = 0.3 + r() * 0.65;
    let segs = '';
    for (let i = 0; i < n; i++) {
      const on = i / n <= level;
      segs += `<rect x="${60 + i * (bw + gap)}" y="${150 + (i % 3) * 6}" width="${bw}" height="${S - 300 - (i % 3) * 12}" rx="3" fill="${on ? acc : p[1]}" fill-opacity="${on ? 0.9 : 0.55}"/>`;
    }
    return svg(S, S, '', `<rect width="${S}" height="${S}" fill="${p[0]}"/>` + segs +
      `<rect x="52" y="${S - 140}" width="${S - 104}" height="3" fill="${p[3]}" fill-opacity=".7"/>`);
  },

  gauge: (p, v, r, S) => {
    const acc = [p[5], p[6], p[4], p[7], p[3]][v % 5];
    const cx = S / 2, cy = S / 2 + 40, R = 168;
    const a0 = Math.PI * 1.12, a1 = Math.PI * 1.88;
    const [sx, sy] = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)];
    const [ex, ey] = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
    let ticks = '';
    for (let i = 0; i <= 12; i++) {
      const a = a0 + ((a1 - a0) * i) / 12;
      const rr = R - (i % 3 ? 4 : 14);
      ticks += `<path d="M${cx + (R - 26) * Math.cos(a)} ${cy + (R - 26) * Math.sin(a)} L${cx + rr * Math.cos(a)} ${cy + rr * Math.sin(a)}" stroke="${p[3]}" stroke-width="2" stroke-opacity=".75"/>`;
    }
    const na = a0 + (a1 - a0) * (0.2 + r() * 0.7);
    return svg(S, S, lin('ar', acc, p[7], 1, 0),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
        `<path d="M${sx} ${sy} A${R} ${R} 0 0 1 ${ex} ${ey}" stroke="${p[1]}" stroke-width="16" stroke-linecap="round"/>` +
        `<path d="M${sx} ${sy} A${R} ${R} 0 0 1 ${cx + R * Math.cos(na)} ${cy + R * Math.sin(na)}" stroke="url(#ar)" stroke-width="16" stroke-linecap="round"/>` +
        ticks +
        `<path d="M${cx} ${cy} L${cx + (R - 40) * Math.cos(na)} ${cy + (R - 40) * Math.sin(na)}" stroke="${acc}" stroke-width="4"/>` +
        `<circle cx="${cx}" cy="${cy}" r="14" fill="${p[0]}" stroke="${acc}" stroke-width="3"/>`);
  },

  reticle: (p, v, r, S) => {
    const acc = [p[5], p[6], p[4], p[7], p[3]][v % 5];
    const cx = S / 2, cy = S / 2;
    let g = '';
    for (let i = 0; i < 3; i++) {
      g += `<circle cx="${cx}" cy="${cy}" r="${40 + i * 44 + v * 4}" stroke="${acc}" stroke-opacity="${0.9 - i * 0.22}" stroke-width="${4 - i}"/>`;
    }
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + Math.PI / 4;
      g += `<path d="M${cx + 26 * Math.cos(a)} ${cy + 26 * Math.sin(a)} L${cx + 150 * Math.cos(a)} ${cy + 150 * Math.sin(a)}" stroke="${p[3]}" stroke-opacity=".65" stroke-width="2"/>`;
    }
    g += `<circle cx="${cx}" cy="${cy}" r="5" fill="${acc}"/>`;
    g += `<path d="M${cx - 200} ${cy} h60 M${cx + 140} ${cy} h60 M${cx} ${cy - 200} v60 M${cx} ${cy + 140} v60" stroke="${acc}" stroke-width="3" stroke-opacity=".8"/>`;
    return svg(S, S, '', `<rect width="${S}" height="${S}" fill="${p[0]}"/>` + g);
  },

  status_bar: (p, v, r, S) => {
    const acc = [p[5], p[4], p[6], p[7], p[3]][v % 5];
    const n = 20 + v * 4, x0 = 56, w = S - 112, segw = w / n;
    let g = '';
    const lvl = 0.4 + r() * 0.55;
    for (let i = 0; i < n; i++) {
      g += `<rect x="${x0 + i * segw + 2}" y="230" width="${segw - 4}" height="52" rx="2" fill="${i / n <= lvl ? acc : p[1]}" fill-opacity="${i / n <= lvl ? 0.95 : 0.6}"/>`;
    }
    return svg(S, S, '', `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
      `<rect x="${x0 - 10}" y="220" width="${w + 20}" height="72" rx="8" stroke="${p[3]}" stroke-opacity=".5"/>` + g);
  },

  minimap: (p, v, r, S) => {
    const acc = [p[5], p[6], p[4], p[7], p[3]][v % 5];
    const m = 84, sz = S - 2 * m;
    let grid = '';
    for (let i = 1; i < 6; i++) {
      grid += `<path d="M${m + (sz / 6) * i} ${m} v${sz} M${m} ${m + (sz / 6) * i} h${sz}" stroke="${p[3]}" stroke-opacity=".22"/>`;
    }
    let blips = '';
    for (let i = 0; i < 7 + v; i++) {
      blips += `<circle cx="${m + r() * sz}" cy="${m + r() * sz}" r="${2 + r() * 4}" fill="${acc}" fill-opacity="${0.4 + r() * 0.6}"/>`;
    }
    return svg(S, S, lin('mm', p[1], p[0], 0, 1),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
        `<rect x="${m}" y="${m}" width="${sz}" height="${sz}" fill="url(#mm)" stroke="${acc}" stroke-width="2" stroke-opacity=".8"/>` + grid + blips +
        `<circle cx="${m + sz / 2}" cy="${m + sz / 2}" r="${v * 2 + 10}" stroke="${acc}" stroke-opacity=".6"/>`);
  },

  slot: (p, v, r, S) => {
    const acc = [p[5], p[6], p[4], p[7], p[3]][v % 5];
    const m = 96, sz = S - 2 * m;
    return svg(S, S, lin('sl', p[2], p[0], 0, 1),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
        `<rect x="${m}" y="${m}" width="${sz}" height="${sz}" rx="${v * 4}" fill="url(#sl)" stroke="${p[3]}" stroke-opacity=".7" stroke-width="2"/>` +
        `<rect x="${m + 10}" y="${m + 10}" width="${sz - 20}" height="${sz - 20}" rx="${v * 4}" stroke="${acc}" stroke-opacity=".35"/>` +
        `<path d="M${m} ${m} l34 0 M${m} ${m} l0 34 M${m + sz} ${m + sz} l-34 0 M${m + sz} ${m + sz} l0 -34" stroke="${acc}" stroke-width="4"/>` +
        `<circle cx="${m + sz / 2}" cy="${m + sz / 2}" r="${18 + v * 5}" stroke="${p[3]}" stroke-opacity=".5" stroke-dasharray="4 6"/>`);
  },

  badge: (p, v, r, S) => {
    const acc = [p[5], p[6], p[4], p[7], p[3]][v % 5];
    const cx = S / 2, cy = S / 2, R = 150 - v * 4;
    const hex = (rr) => Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
    }).join(' ');
    return svg(S, S, lin('bg', p[2], p[0], 0, 1) + rad('bg2', acc, acc),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
        `<polygon points="${hex(R)}" fill="url(#bg)" stroke="${acc}" stroke-width="3"/>` +
        `<polygon points="${hex(R - 22)}" stroke="${p[3]}" stroke-opacity=".6"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${R - 64}" fill="url(#bg2)" fill-opacity=".55"/>` +
        `<path d="M${cx - 34} ${cy} l24 26 l44 -52" stroke="${acc}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`);
  },

  glyph: (p, v, r, S) => {
    const acc = [p[5], p[6], p[4], p[7], p[3]][v % 5];
    const cx = S / 2, cy = S / 2, u = 120;
    const glyphs = [
      `<circle cx="${cx}" cy="${cy}" r="${u * 0.62}" stroke="${acc}" stroke-width="14"/><path d="M${cx} ${cy - u * 0.62} v${u * 0.5}" stroke="${acc}" stroke-width="14"/>`,
      `<path d="M${cx} ${cy - u} l${u * 0.8} ${u * 0.35} v${u * 0.45} q0 ${u * 0.7} -${u * 0.8} ${u * 0.95} q-${u * 0.8} -${u * 0.25} -${u * 0.8} -${u * 0.95} v-${u * 0.45} z" stroke="${acc}" stroke-width="12" stroke-linejoin="round"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${u * 0.8}" stroke="${acc}" stroke-width="12"/><circle cx="${cx}" cy="${cy}" r="${u * 0.3}" stroke="${acc}" stroke-width="12"/><path d="M${cx} ${cy - u * 0.8} v-${u * 0.2} M${cx} ${cy + u * 0.8} v-${u * 0.2}" stroke="${acc}" stroke-width="12"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${u * 0.72}" stroke="${acc}" stroke-width="14"/><path d="M${cx - u * 0.35} ${cy} h${u * 0.7} M${cx} ${cy - u * 0.35} v${u * 0.7}" stroke="${acc}" stroke-width="14"/>`,
      `<path d="M${cx - u * 0.7} ${cy - u * 0.5} h${u * 1.4} M${cx - u * 0.7} ${cy} h${u * 1.4} M${cx - u * 0.7} ${cy + u * 0.5} h${u * 0.9}" stroke="${acc}" stroke-width="14" stroke-linecap="round"/>`,
    ];
    return svg(S, S, lin('gb', p[1], p[0], 0, 1),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/><rect x="40" y="40" width="${S - 80}" height="${S - 80}" rx="36" fill="url(#gb)" stroke="${p[3]}" stroke-opacity=".5"/>` +
        glyphs[v % glyphs.length]);
  },

  frame: (p, v, r, S) => {
    const acc = [p[5], p[6], p[4], p[7], p[3]][v % 5];
    let dots = '';
    for (let i = 0; i < 9; i++) {
      dots += `<circle cx="${70 + i * 40}" cy="${S - 62}" r="4" fill="${acc}" fill-opacity="${0.3 + r() * 0.6}"/>`;
    }
    return svg(S, S, lin('fr', p[1], p[0], 0, 1),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
        `<rect x="44" y="44" width="${S - 88}" height="${S - 88}" rx="${24 + v * 10}" fill="url(#fr)" stroke="${acc}" stroke-width="${3 + v}"/>` + dots);
  },

  tooltip: (p, v, r, S) => {
    const acc = [p[5], p[6], p[4], p[7], p[3]][v % 5];
    const w = S - 120, h = 170 + v * 14, x = (S - w) / 2, y = (S - h) / 2 - 20;
    let lines = '';
    for (let i = 0; i < 3; i++) {
      lines += `<rect x="${x + 30}" y="${y + 52 + i * 26}" width="${(w - 60) * (0.45 + r() * 0.5)}" height="8" rx="4" fill="${p[3]}" fill-opacity="${0.3 + r() * 0.4}"/>`;
    }
    return svg(S, S, lin('tt', p[2], p[1], 0, 1),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="url(#tt)" stroke="${acc}" stroke-width="2.5"/>` +
        `<rect x="${x + 18}" y="${y + 22}" width="${w * 0.3}" height="10" rx="5" fill="${acc}" fill-opacity=".9"/>` +
        lines +
        `<path d="M${S / 2 - 18} ${y + h} L${S / 2} ${y + h + 26} L${S / 2 + 18} ${y + h} z" fill="url(#tt)" stroke="${acc}" stroke-width="2.5"/>`);
  },

  divider: (p, v, r, S) => {
    const acc = [p[5], p[6], p[4], p[7], p[3]][v % 5];
    const cy = S / 2, half = S / 2 - 60 - v * 6;
    let ticks = '';
    for (let i = 0; i < 5 + v; i++) {
      const x = S / 2 + (i + 1) * 14;
      ticks += `<path d="M${x} ${cy - 6} v12 M${S - x} ${cy - 6} v12" stroke="${acc}" stroke-opacity="${0.8 - i * 0.1}" stroke-width="2"/>`;
    }
    return svg(S, S, rad('dv', acc, acc),
      `<rect width="${S}" height="${S}" fill="${p[0]}"/>` +
        `<path d="M${S / 2 - half} ${cy} H${S / 2 - 30} M${S / 2 + 30} ${cy} H${S / 2 + half}" stroke="${acc}" stroke-width="2.5"/>` +
        `<circle cx="${S / 2}" cy="${cy}" r="${14 + v * 2}" fill="url(#dv)" fill-opacity=".8"/>` +
        `<path d="M${S / 2} ${cy - 22} L${S / 2 + 16} ${cy} L${S / 2} ${cy + 22} L${S / 2 - 16} ${cy} z" stroke="${acc}" stroke-width="2.5"/>` +
        ticks);
  },
};

// Exactly 15 distinct kinds x 5 variants = 75 unique designs per collection.
// Every (kind, variant) pair must be unique: a repeated pair emits a byte
// identical file, which duplicate validation would reject.
const NAMES = [
  ['HUD Panel', 'hud_panel'], ['Control Button', 'button'], ['Toggle Switch', 'toggle'],
  ['Value Slider', 'slider'], ['Power Meter', 'meter'], ['Arc Gauge', 'gauge'],
  ['Target Reticle', 'reticle'], ['Status Bar', 'status_bar'], ['Minimap Frame', 'minimap'],
  ['Inventory Slot', 'slot'], ['Achievement Badge', 'badge'], ['System Glyph', 'glyph'],
  ['Interface Frame', 'frame'], ['Tooltip Panel', 'tooltip'], ['Ornamental Divider', 'divider'],
];

export function generateUiAsset({ palette, index, seed }) {
  const r = rnd(seed);
  const [baseName, kind] = NAMES[index % NAMES.length];
  const variant = Math.floor(index / NAMES.length) % 5;
  const markup = KINDS[kind](palette, variant, r, 512);
  return {
    name: `${baseName} ${['A', 'B', 'C', 'D', 'E'][variant] || variant + 1}`,
    kind,
    svg: markup,
    width: 512,
    height: 512,
    tags: ['ui', kind.replace(/_/g, ' '), 'interface', 'hud', 'game-ready'],
  };
}
