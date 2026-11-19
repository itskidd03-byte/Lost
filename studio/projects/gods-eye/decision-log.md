# Decision log

Append-only. Every creative, technical or scope decision that changes an approved spec is recorded here.

## D-0001 — Render grade: painted sky, image-based light, tiered bloom

- Date: 2026-11-18T23:19:01.822Z
- Owner: Studio Director
- Status: accepted

**Decision.** Replace the region's flat sky colour and single sun with one shared render grade in gods-eye/src/render/grade.js: a painted equirectangular sky used as both background and PMREM environment, a warm interior probe for the cabin, follow-the-player sun shadow camera, anisotropy 8, water normal sheets derived from the albedo, and a desktop-only bloom pass behind a viewport/cores quality tier. Cabin and region now share one presentation object for tone mapping, pixel ratio and resize.

**Alternatives considered.** Keep per-scene lighting and add point lights one at a time; or add a full post stack (SSAO, TAA) on every tier. Rejected: per-scene lighting was the cause of the drift, and a full post stack cannot be verified on the mobile tier yet.

**Consequences.** Metal and water now depend on an environment probe being present. Bloom and 2048 px shadows are desktop-only; phones get no bloom and smaller shadow maps. One build file grew by ~9.8 KB and pulls three postprocessing addons. The defined Standard tier is not implemented, so mid-range devices fall to Low until D12 lands it.

## D-0002 — Mobile low-tier frame rate has no representative measurement yet

- Date: 2026-11-19T04:35:42.841Z
- Owner: Studio Director
- Status: accepted

**Decision.** Attempted to measure the webgl-mobile / low quality tier of the render grade on 2026-11-19 against the production build served at https://site-87b1614491ad4e96b1e87ddacdcd999f.freebuff.page (bundle assets/index-DxQoDOiS.js, deployed 2026-11-19T02:33:02Z). Method: Chromium in this cloud sandbox, viewport 390x844 at DPR 1, the game loaded from the live URL, account overlay dismissed, existing world continued, then requestAnimationFrame frame deltas sampled for 6.56 s inside the cabin. Tier selection itself was verified: window.__godsEye.presentation reported tier low, bloomEnabled false, pixelRatio 1 and a 390x844 drawing buffer, which is the intended phone path. The frame-rate result is not evidence: only 7 frames arrived in 6.56 s (1.2 fps average, 1.1 fps 1 percent low), and forcing three synchronous renderer.render calls with a readPixels sync each took more than 3 s per frame. WebGL here is ANGLE over a paravirtualised Intel adapter via D3D11, the tab is occluded in the browser panel, and both effects put this environment one to two orders of magnitude below any phone. A 7 frame sample is also below the minimum needed for a 1 percent low. One environment-independent number did come out of the run: renderer.info reported 370 draw calls and 15733 triangles for the cabin on the low tier in a single frame, against the webgl-mobile profile budget of 80 draw calls, so the cabin is likely over its draw-call budget on every device, but that needs confirmation on real hardware before it is treated as a finding. Conclusion: the low tier is implemented and selects correctly, and its frame rate is unmeasured. Proper evidence requires the webgl-mobile profile to be measured on a named representative device (Pixel 6a Chrome or iPhone 13 Safari per studio/registry/performance-profiles.json), with the browser version, the bundle hash and the same cabin and open-region scenes recorded through npm run studio -- perf record. That device is not reachable from this sandbox.

**Alternatives considered.** None recorded.

**Consequences.** The performance gate stays red for mobile: no perf measurement exists for the low tier, so no mobile FPS claim is made and none may be inferred from this entry. The project also declares platforms webgl-desktop and webgl-mobile but only the webgl-desktop performance profile, so npm run studio -- perf check currently has no mobile contract to test; that intake mapping gap is recorded here and left for the studio tooling owner rather than changed silently. Follow-up: run the webgl-mobile profile on a real phone, then decide whether the cabin draw-call count needs batching.
