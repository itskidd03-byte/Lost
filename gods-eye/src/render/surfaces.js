// Surface textures for the cabin and the walkable world.
//
// Everything is painted on a canvas at load time and cached, so the cabin's
// floorboards, its plaster and the ground you walk on all carry fine detail
// without shipping image files. Each maker returns a colour map, and where the
// surface has real relief (board gaps, plaster grit, grass tufts) a matching
// bump map as well, so the detail survives being lit from a low lantern.

import * as THREE from 'three';

const made = new Map();

function draw(size, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  paint(ctx, size, size);
  return canvas;
}

function texture(canvas, repeat = [1, 1], { srgb = true, aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  return tex;
}

function cached(key, build) {
  if (made.has(key)) return made.get(key);
  const value = build();
  made.set(key, value);
  return value;
}

function grain(ctx, w, h, count, alpha = [0.02, 0.09], tint = '0,0,0') {
  for (let i = 0; i < count; i++) {
    const y = Math.random() * h;
    ctx.strokeStyle = `rgba(${tint},${alpha[0] + Math.random() * (alpha[1] - alpha[0])})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(-2, y);
    ctx.bezierCurveTo(
      w * 0.3, y + (Math.random() - 0.5) * 6,
      w * 0.7, y + (Math.random() - 0.5) * 6,
      w + 2, y + (Math.random() - 0.5) * 3,
    );
    ctx.stroke();
  }
}

function speckle(ctx, w, h, count, light, dark, minR = 0.6, maxR = 2.2) {
  for (let i = 0; i < count; i++) {
    const a = 0.02 + Math.random() * 0.08;
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(${light},${a})` : `rgba(${dark},${a})`;
    const r = minR + Math.random() * (maxR - minR);
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ------------------------------- floorboards -------------------------------

export function plankFloor(opts = {}) {
  const boards = opts.boards ?? 7;
  return cached(`floor:${boards}`, () => {
    const size = 512;
    const boardH = size / boards;
    const map = draw(size, (ctx, w, h) => {
      ctx.fillStyle = opts.base || '#43301d';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < boards; i++) {
        const y = i * boardH;
        // each board is its own cut of timber: a shade apart, its own grain
        const shade = 0.86 + Math.random() * 0.3;
        ctx.fillStyle = `rgba(${Math.round(84 * shade)},${Math.round(58 * shade)},${Math.round(34 * shade)},1)`;
        ctx.fillRect(0, y + 1, w, boardH - 2);
        grain(ctx, w, boardH, 26, [0.03, 0.12]);
        for (let k = 0; k < 24; k++) {
          ctx.fillStyle = `rgba(20,12,6,${0.02 + Math.random() * 0.06})`;
          ctx.fillRect(Math.random() * w, y + Math.random() * boardH, 1.6, 0.8);
        }
        // a knot every few boards
        if (Math.random() < 0.55) {
          const kx = Math.random() * w;
          const ky = y + boardH * (0.3 + Math.random() * 0.4);
          ctx.strokeStyle = 'rgba(26,15,7,0.5)';
          ctx.lineWidth = 1.1;
          for (let r = 2; r < 7; r += 1.6) {
            ctx.beginPath();
            ctx.ellipse(kx, ky, r, r * 0.55, 0.4, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        // the seam, and a nail at each end of every other board
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect(0, y, w, 1.6);
        if (i % 2 === 0) {
          for (const nx of [18, w - 18]) {
            ctx.fillStyle = 'rgba(18,18,20,0.55)';
            ctx.beginPath();
            ctx.arc(nx, y + boardH * 0.5, 2.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(200,190,170,0.25)';
            ctx.beginPath();
            ctx.arc(nx - 0.6, y + boardH * 0.5 - 0.6, 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      speckle(ctx, w, h, 900, '255,230,190', '0,0,0', 0.4, 1.4);
    });
    const bump = draw(size, (ctx, w, h) => {
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < boards; i++) {
        const y = i * boardH;
        ctx.fillStyle = '#b4b4b4';
        ctx.fillRect(0, y + 2, w, boardH - 4);
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, y, w, 2);
      }
      grain(ctx, w, h, 240, [0.02, 0.1], '255,255,255');
      speckle(ctx, w, h, 1200, '255,255,255', '0,0,0', 0.5, 1.8);
    });
    return { map: texture(map), bump: texture(bump, [1, 1], { srgb: false }) };
  });
}

// ---------------------------------- wood -----------------------------------

export function beamWood() {
  return cached('beam', () => {
    const size = 256;
    const map = draw(size, (ctx, w, h) => {
      ctx.fillStyle = '#3a2817';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        const x = (i / 9) * w;
        ctx.fillStyle = `rgba(255,220,170,${0.015 + Math.random() * 0.03})`;
        ctx.fillRect(x, 0, w / 22, h);
      }
      grain(ctx, w, h, 150, [0.04, 0.14]);
      speckle(ctx, w, h, 700, '255,220,180', '0,0,0', 0.4, 1.6);
      // a few splits and checks along the length
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = `rgba(0,0,0,${0.2 + Math.random() * 0.2})`;
        ctx.lineWidth = 0.8;
        const y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(Math.random() * w * 0.4, y);
        ctx.lineTo(Math.random() * w * 0.6 + w * 0.4, y + (Math.random() - 0.5) * 3);
        ctx.stroke();
      }
    });
    const bump = draw(size, (ctx, w, h) => {
      ctx.fillStyle = '#999';
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 220, [0.03, 0.14], '255,255,255');
    });
    return { map: texture(map), bump: texture(bump, [1, 1], { srgb: false }) };
  });
}

// --------------------------------- plaster ---------------------------------

export function plasterWall() {
  return cached('plaster', () => {
    const size = 512;
    const map = draw(size, (ctx, w, h) => {
      ctx.fillStyle = '#6b5a46';
      ctx.fillRect(0, 0, w, h);
      // broad uneven patches, as if laid on by hand
      for (let i = 0; i < 160; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = 12 + Math.random() * 46;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const up = Math.random() > 0.5;
        g.addColorStop(0, up ? 'rgba(255,240,214,0.05)' : 'rgba(40,30,20,0.05)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      speckle(ctx, w, h, 6000, '255,238,205', '38,28,18', 0.4, 1.6);
      // hairline cracks
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = `rgba(30,22,14,${0.08 + Math.random() * 0.12})`;
        ctx.lineWidth = 0.7;
        let x = Math.random() * w;
        let y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 7; s++) {
          x += (Math.random() - 0.5) * 26;
          y += Math.random() * 18;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // damp at the base of the wall
      const damp = ctx.createLinearGradient(0, h * 0.72, 0, h);
      damp.addColorStop(0, 'rgba(30,24,16,0)');
      damp.addColorStop(1, 'rgba(30,24,16,0.22)');
      ctx.fillStyle = damp;
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
    });
    const bump = draw(size, (ctx, w, h) => {
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 9000, '255,255,255', '40,40,40', 0.6, 2.4);
    });
    return { map: texture(map), bump: texture(bump, [1, 1], { srgb: false }) };
  });
}

// ---------------------------------- fabric ---------------------------------

export function wovenFabric(colourA = '#4a1f1c', colourB = '#6b3a24', counts = 46) {
  return cached(`fabric:${colourA}:${colourB}:${counts}`, () => {
    const size = 256;
    const map = draw(size, (ctx, w, h) => {
      ctx.fillStyle = colourA;
      ctx.fillRect(0, 0, w, h);
      const step = size / counts;
      for (let i = 0; i < counts; i++) {
        ctx.fillStyle = i % 2 ? colourB : colourA;
        ctx.fillRect(0, i * step, w, step * 0.62);
        ctx.fillStyle = i % 2 ? colourA : colourB;
        ctx.fillRect(i * step, 0, step * 0.62, h);
      }
      // wear and shadow so it is cloth and not a chess board
      for (let i = 0; i < 2200; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
      }
      const edge = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.72);
      edge.addColorStop(0, 'rgba(255,230,200,0.05)');
      edge.addColorStop(1, 'rgba(0,0,0,0.16)');
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, w, h);
    });
    return { map: texture(map) };
  });
}

// --------------------------------- tabletop --------------------------------

export function tableTopWood() {
  return cached('tabletop', () => {
    const size = 512;
    const map = draw(size, (ctx, w, h) => {
      ctx.fillStyle = '#7a5631';
      ctx.fillRect(0, 0, w, h);
      const planks = 4;
      for (let i = 0; i < planks; i++) {
        const y = (i / planks) * h;
        const shade = 0.9 + Math.random() * 0.22;
        ctx.fillStyle = `rgba(${Math.round(122 * shade)},${Math.round(86 * shade)},${Math.round(48 * shade)},1)`;
        ctx.fillRect(0, y + 1.5, w, h / planks - 3);
        grain(ctx, w, h / planks, 60, [0.03, 0.1]);
        ctx.fillStyle = 'rgba(20,12,6,0.35)';
        ctx.fillRect(0, y, w, 1.6);
      }
      // rings and scars from years of use
      for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = `rgba(56,34,16,${0.05 + Math.random() * 0.1})`;
        ctx.lineWidth = 0.8 + Math.random();
        ctx.beginPath();
        ctx.ellipse(
          Math.random() * w, Math.random() * h,
          6 + Math.random() * 22, 3 + Math.random() * 12,
          Math.random() * Math.PI, 0, Math.PI * 2,
        );
        ctx.stroke();
      }
      speckle(ctx, w, h, 2400, '255,226,180', '0,0,0', 0.4, 1.6);
    });
    const bump = draw(size, (ctx, w, h) => {
      ctx.fillStyle = '#9c9c9c';
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 300, [0.02, 0.12], '255,255,255');
    });
    return { map: texture(map), bump: texture(bump, [1, 1], { srgb: false }) };
  });
}

// ------------------------------ ground cover -------------------------------

// The ground you walk on: grass blades and soil, tiled so a single texture serves
// every biome — the vertex colours decide whether it reads as turf, dust or rock.
export function groundCover() {
  return cached('groundcover', () => {
    const size = 512;
    const map = draw(size, (ctx, w, h) => {
      ctx.fillStyle = '#a8a8a8';
      ctx.fillRect(0, 0, w, h);
      // soft soil patches
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = 10 + Math.random() * 40;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(120,120,120,${0.06 + Math.random() * 0.08})`);
        g.addColorStop(1, 'rgba(120,120,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // blades: short strokes leaning this way and that
      for (let i = 0; i < 5200; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const lean = (Math.random() - 0.5) * 3;
        const len = 2 + Math.random() * 6;
        const light = Math.random() > 0.45;
        ctx.strokeStyle = light
          ? `rgba(255,255,255,${0.10 + Math.random() * 0.2})`
          : `rgba(60,60,60,${0.10 + Math.random() * 0.18})`;
        ctx.lineWidth = 0.8 + Math.random() * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + lean, y - len);
        ctx.stroke();
      }
      // a scatter of pebbles and bare earth
      for (let i = 0; i < 220; i++) {
        ctx.fillStyle = `rgba(90,90,90,${0.12 + Math.random() * 0.2})`;
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.6, 0.8 + Math.random() * 1.8, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const bump = draw(size, (ctx, w, h) => {
      ctx.fillStyle = '#8d8d8d';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 5200; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(30,30,30,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 5);
        ctx.stroke();
      }
    });
    return { map: texture(map), bump: texture(bump, [1, 1], { srgb: false }) };
  });
}

/* --------------------------------- mountain -------------------------------- */

// The face of a peak: grey stone with darker seams where the ridge broke, pale
// veins of quartz and a scatter of grit, so the shared mountain design carries
// real surface instead of flat colour.
export function mountainRockTexture() {
  return cached('mountainRock', () =>
    texture(
      draw(256, (ctx, w, h) => {
        const base = ctx.createLinearGradient(0, 0, 0, h);
        base.addColorStop(0, '#918c82');
        base.addColorStop(0.5, '#78736b');
        base.addColorStop(1, '#605c56');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);

        // bedding planes, slightly out of level
        for (let i = 0; i < 26; i++) {
          const y = (i / 26) * h + (Math.random() - 0.5) * 6;
          const dark = Math.random() < 0.55;
          ctx.strokeStyle = dark
            ? `rgba(38, 36, 34, ${0.06 + Math.random() * 0.12})`
            : `rgba(214, 209, 198, ${0.04 + Math.random() * 0.10})`;
          ctx.lineWidth = 1 + Math.random() * 3.4;
          ctx.beginPath();
          ctx.moveTo(-10, y);
          for (let x = 0; x <= w + 10; x += 16) {
            ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 2 + i) * (2 + Math.random() * 4));
          }
          ctx.stroke();
        }

        // cracks running down the face
        for (let i = 0; i < 16; i++) {
          let x = Math.random() * w;
          let y = Math.random() * h;
          ctx.strokeStyle = `rgba(30, 28, 27, ${0.16 + Math.random() * 0.2})`;
          ctx.lineWidth = 0.8 + Math.random() * 1.2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let s = 0; s < 5; s++) {
            x += (Math.random() - 0.5) * 18;
            y += 6 + Math.random() * 12;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        speckle(ctx, w, h, 900, '238, 235, 227', '28, 26, 25', 0.5, 1.7);
        grain(ctx, w, h, 30, [0.02, 0.06], '20, 18, 17');
      }),
      [2, 2],
    ),
  );
}
