# Mobile performance team

A standing team inside the QA and Operations division that holds the frame budget on phones and tablets.
It is not a separate department: it is the joint remit of the departments below, with D34 Performance
Engineering as lead and D35 Compatibility Engineering as the device authority.

| Role | Department |
| --- | --- |
| Lead, frame budget and profiling | D34 Performance Engineering |
| Device classes, browsers, input parity | D35 Compatibility Engineering |
| Lighting and post cost per tier | D12 Lighting and Rendering |
| Particle and overdraw ceilings | D13 VFX |
| Texture and material memory | D09 Materials and Textures |
| Shader variants and fallbacks | D39 Technical Art |
| Engine memory and streaming | D17 Game Engine Architecture |
| Builds, heat and battery sign-off | D40 Production Management |

## Hardware classes

Defined as measured contracts in `studio/registry/performance-profiles.json`:

| Class | Profile | Target | 1% low floor | Memory | Draw calls |
| --- | --- | ---: | ---: | ---: | ---: |
| Low-end Android | `low-android` | 60 | 45 | 512 MB | 120 |
| Mid-range Android | `mid-android` | 60 | 50 | 768 MB | 200 |
| High-end Android | `high-android` | 60 | 55 | 1024 MB | 300 |
| iPhone | `iphone` | 60 | 55 | 1024 MB | 300 |
| Tablet | `tablet` | 60 | 50 | 1024 MB | 250 |
| Mobile WebGL | `webgl-mobile` | 60 | 40 | 384 MB | 80 |
| Desktop (reference) | `desktop-mid` | 60 | 55 | 4096 MB | 800 |

A project declares the profiles it ships on at intake (`--platforms`), and every declared profile must
have a recorded measurement that meets its budget before the optimisation phase can exit.

## Default quality ladder

Each tier must be defined before production and verified on the weakest device in its class.

| Setting | Low | Standard | High |
| --- | --- | --- | --- |
| Render scale | 0.6–0.75 adaptive | 0.85–1.0 adaptive | native |
| Shadows | off or blob | one cascade | cascades with contact shadows |
| Lighting | baked or unlit ambient | baked + one dynamic light | baked + dynamic, no realtime GI |
| Textures | 256, ETC2/ASTC | 512, compressed | 1024, compressed |
| Particles | pooled cap 300 | 600 | 1200 |
| Post | none | tone map + vignette | tone map + optional AA |
| LOD | aggressive, 2 levels | 3 levels | 4 levels |

## Rules the team enforces

1. **Never trade a stable frame for an effect.** If a feature cannot fit the lowest declared tier, it is
   tiered or cut, not shipped as a spike.
2. **Measure on device, over time.** Ten minutes minimum on Android to expose thermal throttling; browser
   measurements include texture upload stalls and first-input latency.
3. **Adaptive resolution is mandatory on mobile.** Static resolution either wastes headroom or stutters.
4. **One authoritative quality setting source.** A single settings module owns the ladder; departments do
   not read platform flags and change cost independently.
5. **Frame pacing over average FPS.** A 60 FPS average with recurring 40 ms spikes fails review.
6. **Report misses honestly.** `perf check` fails the project; a written note explaining the miss does not
   replace the measurement.
