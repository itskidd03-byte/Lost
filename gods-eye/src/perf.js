// In-page performance overlay (?perf=1).
//
// The studio's perf gate wants a measurement from a named device, and this
// repository's cloud sandbox cannot stand in for a phone: its WebGL runs on a
// paravirtualised adapter and its tab is occluded, which is two orders of
// magnitude off any handset. The overlay moves the measurement to the device
// that actually matters. Open the game with ?perf=1 on the phone, walk to the
// scene under test, and the numbers the gate asks for are on screen, with a
// copy button that emits a valid `studio perf record` line.
//
// It is loaded on demand, so a normal visit never downloads it.

const SAMPLE_FRAMES = 900; // ~15 s at 60 fps; a shorter sample cannot support a 1% low
const COST_FRAMES = 60; // the draw cost shown is the recent frame, not the whole session
const INSUFFICIENT = 120; // below this the sample is reported as too short, not as a result

const perf = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : '—');

// The bundle a claim is made against. In a build this is the hashed entry
// script; in development there is no hash, and the report says so.
function buildId() {
  const src = [...document.scripts].map((s) => s.src).find((s) => /assets\/index-[^/]+\.js$/.test(s));
  return src ? src.split('/').pop() : 'dev (unhashed)';
}

// A short device label from the user agent: enough for a phone to name itself
// in a measurement, with the full agent kept in the report.
function deviceLabel(ua) {
  const android = ua.match(/Android [\d.]+;\s*([^;)]+)/);
  const iphone = /iPhone/.test(ua);
  const ipad = /iPad/.test(ua);
  const browser = /CriOS\/(\d+)/.exec(ua)?.[0]?.replace('CriOS/', 'Chrome ')
    || /FxiOS\/(\d+)/.exec(ua)?.[0]?.replace('FxiOS/', 'Firefox ')
    || /EdgA?\/(\d+)/.exec(ua)?.[1] && `Edge ${/EdgA?\/(\d+)/.exec(ua)[1]}`
    || /Chrome\/(\d+)/.exec(ua)?.[1] && `Chrome ${/Chrome\/(\d+)/.exec(ua)[1]}`
    || /Version\/(\d+).*Safari/.exec(ua)?.[1] && `Safari ${/Version\/(\d+)/.exec(ua)[1]}`
    || 'browser';
  const os = iphone || ipad ? `iOS ${(ua.match(/OS (\d+)[_.](\d+)/) || []).slice(1).join('.')}` : null;
  const model = iphone ? 'iPhone' : ipad ? 'iPad' : android ? android[1].trim() : null;
  return [model || os || 'unknown device', browser].filter(Boolean).join(' · ');
}

function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'renderer hidden by the browser';
  } catch {
    return 'unavailable';
  }
}

function loadMs() {
  const nav = performance.getEntriesByType('navigation')[0];
  return nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : null;
}

function mean(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
}

export function startPerfOverlay(game) {
  if (document.getElementById('perf-overlay')) return;

  const renderer = game.presentation.renderer;
  // The composer draws the scene in one pass and the bloom stack in several, so
  // the frame's real draw-call cost is the sum. Let it accumulate and divide.
  renderer.info.autoReset = false;
  renderer.info.reset();

  const style = document.createElement('style');
  style.textContent = `
    #perf-overlay {
      position: fixed; top: 64px; left: 8px; z-index: 9999;
      width: 258px; padding: 8px 9px;
      font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #e8eef3; background: rgba(6, 10, 13, 0.86);
      border: 1px solid rgba(201, 162, 39, 0.45); border-radius: 6px;
      letter-spacing: 0.02em; pointer-events: auto;
    }
    #perf-overlay b { color: #f0cf6a; font-weight: 600; }
    #perf-overlay .perf-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
    #perf-overlay .perf-head span { color: #f0cf6a; letter-spacing: 0.08em; }
    #perf-overlay .perf-head button {
      font: inherit; color: #cfd8de; background: none; border: 0; cursor: pointer; padding: 0 2px;
    }
    #perf-overlay .perf-warn { color: #ff8b6b; }
    #perf-overlay .perf-copy {
      margin-top: 6px; width: 100%; padding: 4px 0; font: inherit; cursor: pointer;
      color: #0b0f12; background: #c9a227; border: 0; border-radius: 4px;
    }
  `;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'perf-overlay';
  el.innerHTML = `
    <div class="perf-head"><span>PERF</span><button type="button" data-close>hide</button></div>
    <div><b>fps</b> <span data-fps>—</span> · <b>p1</b> <span data-p1>—</span></div>
    <div><b>frame</b> <span data-frame>—</span> · worst <span data-worst>—</span></div>
    <div><b>calls</b> <span data-calls>—</span> · <b>tris</b> <span data-tris>—</span></div>
    <div><b>sample</b> <span data-sample>—</span></div>
    <div><b>tier</b> <span data-tier>—</span> · bloom <span data-bloom>—</span></div>
    <div><b>scene</b> <span data-scene>—</span> · <span data-view>—</span></div>
    <div><b>build</b> <span data-build>—</span></div>
    <button type="button" class="perf-copy" data-copy>Copy report</button>
  `;
  document.body.appendChild(el);

  const ui = {};
  for (const key of ['fps', 'p1', 'frame', 'worst', 'calls', 'tris', 'sample', 'tier', 'bloom', 'scene', 'view', 'build']) {
    ui[key] = el.querySelector(`[data-${key}]`);
  }

  const frames = [];
  const callCosts = [];
  const triCosts = [];
  let last = performance.now();
  let lastCalls = 0;
  let lastTris = 0;
  let updateAt = 0;

  function tick(now) {
    const dt = now - last;
    last = now;
    if (dt > 0) {
      frames.push(dt);
      if (frames.length > SAMPLE_FRAMES) frames.shift();
    }

    // With autoReset off, info.render is a running total, so the difference
    // between ticks is one frame's cost: the scene pass, its shadow pass and
    // the bloom stack. A recent window keeps the loading frames out of it.
    const calls = renderer.info.render.calls;
    const tris = renderer.info.render.triangles;
    callCosts.push(calls - lastCalls);
    triCosts.push(tris - lastTris);
    if (callCosts.length > COST_FRAMES) callCosts.shift();
    if (triCosts.length > COST_FRAMES) triCosts.shift();
    lastCalls = calls;
    lastTris = tris;

    if (now > updateAt) {
      updateAt = now + 250;
      paint();
    }
    requestAnimationFrame(tick);
  }

  function stats() {
    const sorted = [...frames].sort((a, b) => a - b);
    const total = frames.reduce((sum, ms) => sum + ms, 0);
    const avg = frames.length ? total / frames.length : NaN;
    return {
      count: frames.length,
      seconds: total / 1000,
      fps: 1000 / avg,
      p1: 1000 / percentile(sorted, 0.99),
      worst: sorted[sorted.length - 1],
      mean: avg,
      calls: mean(callCosts),
      tris: mean(triCosts),
    };
  }

  function paint() {
    const s = stats();
    ui.fps.textContent = perf(s.fps);
    ui.p1.textContent = perf(s.p1);
    ui.frame.textContent = Number.isFinite(s.mean) ? `${perf(s.mean)} ms` : '—';
    ui.worst.textContent = Number.isFinite(s.worst) ? `${perf(s.worst, 0)} ms` : '—';
    ui.calls.textContent = perf(s.calls, 0);
    ui.tris.textContent = perf(s.tris, 0);
    ui.sample.textContent = s.count < INSUFFICIENT
      ? `${perf(s.seconds)} s · ${s.count} frames — too short`
      : `${perf(s.seconds)} s · ${s.count} frames`;
    ui.sample.className = s.count < INSUFFICIENT ? 'perf-warn' : '';
    ui.tier.textContent = game.presentation.tier;
    ui.bloom.textContent = game.presentation.bloomEnabled ? 'on' : 'off';
    ui.scene.textContent = game.mode;
    ui.view.textContent = `${window.innerWidth}x${window.innerHeight}@${perf(window.devicePixelRatio || 1, 2)}`;
    ui.build.textContent = buildId();
  }

  function report() {
    const s = stats();
    const build = buildId();
    const device = deviceLabel(navigator.userAgent);
    const gpu = gpuName(renderer);
    const load = loadMs();
    const totals = `triangles/frame ${perf(s.tris, 0)}, programs ${renderer.info.programs?.length ?? '—'}, dpr ${perf(window.devicePixelRatio || 1, 2)}`;
    const command = [
      'npm run studio -- perf record gods-eye --profile webgl-mobile',
      `--device "${device}"`,
      `--method "in-page perf overlay (?perf=1), ${perf(s.seconds)} s / ${s.count} frames, scene ${game.mode}, build ${build}"`,
      `--build "${build}"`,
      `--fps ${perf(s.fps)}`,
      `--p1 ${perf(s.p1)}`,
      `--frame-ms ${perf(s.mean)}`,
      `--draw-calls ${perf(s.calls, 0)}`,
      ...(load ? [`--load-ms ${load}`] : []),
      `--notes "${totals}; ${gpu}"`,
    ].join(' ');

    return [
      "God's Eye perf sample",
      `build:   ${build}`,
      `device:  ${device} (${navigator.userAgent})`,
      `gpu:     ${gpu}`,
      `render:  tier ${game.presentation.tier}, bloom ${game.presentation.bloomEnabled ? 'on' : 'off'}, ${window.innerWidth}x${window.innerHeight} @${perf(window.devicePixelRatio || 1, 2)}`,
      `scene:   ${game.mode}`,
      `sample:  ${perf(s.seconds)} s / ${s.count} frames${s.count < INSUFFICIENT ? ' (too short to be evidence)' : ''}`,
      `fps:     ${perf(s.fps)} avg / ${perf(s.p1)} p1 low / ${perf(s.mean)} ms mean frame`,
      `cost:    ${perf(s.calls, 0)} draw calls, ${perf(s.tris, 0)} triangles per frame${load ? `, load ${load} ms` : ''}`,
      '',
      'Record it:',
      command,
    ].join('\n');
  }

  el.querySelector('[data-copy]').addEventListener('click', async () => {
    const text = report();
    try {
      await navigator.clipboard.writeText(text);
      el.querySelector('[data-copy]').textContent = 'Copied';
    } catch {
      // clipboard blocked (insecure context, or a browser that wants a longer
      // gesture): fall back to selecting the text so the tester can copy it
      const box = document.createElement('textarea');
      box.value = text;
      box.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:40%;z-index:10000';
      document.body.appendChild(box);
      box.select();
    }
    setTimeout(() => { el.querySelector('[data-copy]').textContent = 'Copy report'; }, 1600);
  });

  el.querySelector('[data-close]').addEventListener('click', () => {
    el.remove();
    style.remove();
    renderer.info.autoReset = true;
  });

  paint();
  requestAnimationFrame(tick);
}
