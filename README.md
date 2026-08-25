# moonwell

> **built with ox alpha**
>
> most of this was written in august 2026 during the free preview window of
> [ox alpha](https://openrouter.ai/stealth/ox-alpha), an anonymous stealth model
> that turned up on openrouter for about a week. i set the direction and reviewed
> what came back. the tests are real and they pass — clone it and run them.

a 2.5D horror metroidvania built on Three.js. you descend through a hand-authored
room graph (Vael-Morra), fight enemies and two bosses, and light is the core
resource — most of the map is dark and your lantern is the only thing pushing
it back.

## Running it

```
npm install
npm run dev       # vite dev server
npm run build     # production build to dist/
npm test          # vitest run
```

`npm run build` produces a working bundle (~181KB app + ~496KB three.js, gzipped
to ~44KB + ~125KB). `npm run validate:map` runs `scripts/validate_map.mjs`
against the room graph independently of the test suite.

## How it works

enemies extend a shared `Enemy` base class (`src/entities/enemy_base.js`) with
an explicit state machine: `setState`/`state`/`st` (state timer), a
`think(dt, ctx)` hook for AI, and a separate `staggerStep` path entered via
`hitstun`. five regular enemy types (`bloom`, `husk`, `maw`, `stalker`, `wisp`)
and two bosses (`sacristan`, `warden`) register themselves into a type registry
via `registerEnemy`.

the bosses run as switch-statement state machines with fixed timers, matching
the design doc's intent rather than approximating it.
`Sacristan` (`src/entities/bosses/sacristan.js`, hp 30) cycles through
`idle -> {slamTele, dashTele, summonTele, debrisTele} -> attack -> recover`,
tracks up to 2 live husk minions, and flips to phase 2 at hp <= 15 (faster
telegraphs via a `speedMult`, adds falling debris). `Warden`
(`src/entities/bosses/warden.js`, hp 60) has ten named states including
`snuffTele`, `chainCrouch`/`chainAir`/`chainImpact`, `orbsTele`, and
`spikesTele`/`spikesActive`, with its own phase gates at hp <= 40 and hp <= 15.
telegraph windows are fixed constants (e.g. 0.5-0.7s) checked against the state
timer, matching what's described in `DESIGN.md`.

lighting is a pure, headless data structure separate from rendering:
`LightField` (`src/systems/lightfield.js`) keeps a flat array of light entries
with a free-list for recycling, indexed by id via two `Map`s (static vs.
dynamic/temporary sources). `lightAt(x, y)` sums linear falloff contributions
from every live entry and clamps at 1, short-circuiting once it hits full
brightness. a `snuffAll(seconds)` timer zeroes all light for a duration (used
by the Warden's lantern-snuff attack). `lighting.js` wraps this with actual
THREE.PointLight objects, capped to the 8 brightest sources.

`src/fx/shaders.js` has real GLSL: a fullscreen post-process fragment shader
does per-channel UV offset for chromatic aberration (driven by a `uHurt`
uniform), hash-based film grain, radial vignette, and a `uDread` pulse term.
separate shaders drive fog gradient planes and moon-shaft quads. textures
(`src/fx/textures.js`) are canvas-procedural, not image assets.

the room graph lives in `src/world/mapdata.js` (1756 lines of hand-placed room
and door data) with a separate `mapgraph.js` for adjacency/traversal and
`roombuilder.js` (217 lines) turning room data into geometry. physics
(`src/systems/physics.js`, 207 lines) handles corner-snag correction, one-way
platform drop-through, and tunneling prevention against a tile grid. audio
(`src/systems/audiomanager.js`) is entirely synthesized WebAudio — no sample
files — with per-zone ambient beds and a tension/heartbeat system.

## Tests

```
npm test
```

62 tests across 5 files, all passing (`vitest run`, ~490ms, verified by
actually running it): `map.test.js` (room graph reachability/soft-lock checks),
`save.test.js` (localStorage save round-trip), `physics.test.js` (collision
edge cases), `enemies.test.js` (521 lines — state-transition timings for
regular enemies and both bosses), `lightfield.test.js` (falloff math and the
8-light cap).

## Known limitations

- single squashed commit in the repo history — no incremental history to trace
  design decisions against.
- no CI config, no lint config, no playwright/e2e setup despite `.gitignore`
  referencing `playwright-report/` and `screenshots-tmp/` — those look like
  leftovers from a workflow that isn't actually wired up here.
- perf budgets in `DESIGN.md` (draw calls <300/room, physics <2ms/frame, pooled
  particles <=2000) are asserted in the design doc but not verified by any
  automated test or benchmark in this repo — they're unverified claims, not
  measured facts.
- no in-game screenshots, no itch.io/web build link — you have to run it
  yourself to see it.
