
### Boss contract (AGENT-ENEMIES)
Same Enemy interface, exported from entities/bosses/{sacristan,warden}.js.
- `sacristan` The Sacristan (nave mid-boss) — hp 30, arena-locked; attacks:
  overhead slam (shockwave along floor), sweep dash, summon 2 husks (max 2 alive);
  phase 2 at hp<=15: faster, adds falling debris. Telegraphs >= 0.5s. On death:
  drops ability_umbral_step pickup + opens gate behind arena.
- `warden` Warden of the Moonwell (final) — hp 60; p1: lantern-snuff pulses
  (kills static lights for 6s), slam chains, homing orbs; p2 at hp<=40: arena dims,
  adds mirror-stalkers (2 weak clones hp 4); p3 at hp<=15: desperation, faster
  slams, floor spikes telegraph. Defeat -> ending sequence.

### lightfield.js / lighting.js (AGENT-FX)
```js
// systems/lightfield.js — PURE, headless-testable
export class LightField {
  addStatic(id, x, y, radius, intensity)
  removeStatic(id)
  setDynamic(id, x, y, radius, intensity)   // player lantern
  clearTemporaries()
  lightAt(x, y) -> 0..1    // sum of contributions r falloff, clamped
}
```
lighting.js wraps LightField + THREE lights: one PointLight per active source
(cap 8 brightest), lantern flicker (noise), snuff API `snuffAll(seconds)` for boss.

### fx/textures.js (AGENT-FX)
Canvas-procedural textures: zone tilesets (stone/rot/gallery brick/obsidian),
one-way plank, spike, water line, root deco, particle sprites. Cache by key.
NearestFilter OFF (soft painterly), anisotropy 4.

### fx/shaders.js (AGENT-FX)
Fullscreen post quad: vignette+film grain+hurt chromatic aberration (uniforms:
uTime,uVignette,uGrain,uHurt). Fog gradient planes, moon-shaft additive quads,
water surface shimmer material. Export factory functions returning materials/meshes.

### fx/particles.js (AGENT-FX)
Pooled emitters on THREE.Points: dust, spores, embers, motes(blood), splash, burst.
API: `emitBurst(name, x, y, opts)`, `attachAmbient(name, rect)` per room,
`update(dt)`, `dispose()`.

### audiomanager.js (AGENT-AUDIO)
WebAudio, all synthesized. Import-safe in node (no top-level window/AudioContext).
```js
export class AudioManager {
  init()                       // lazy; call on first user gesture
  unlock()
  play(name, {volume, rate})   // one-shots: step_stone, step_water, slash,
                               // hit_enemy, hit_player, enemy_die, door_open,
                               // item_get, checkpoint, stinger_close,
                               // stinger_discover, maw_emerge, bloom_burst,
                               // wisp_hum(looped via start/stop), ui_move, ui_confirm
  setZone(zone)                // crossfade ambient drone layer per zone
  setTension(0..1)             // raises dissonant pad + heartbeat rate near threats
  heartbeat(on)
  bossLayer(on)
  mute(m)
  update(dt, ctx)              // ctx={zone,tension,threatNear,inWater,moving,onGround}
  dispose()
}
```
Design: sparse. Stingers have global cooldowns (>=45s scare stingers, 8s combat).
Heartbeat only when threatNear or tension>0.75. Ambient = filtered noise beds +
low drones per zone (nave cold airy, warrens wet organic, gallery deep watery with
drip plinks randomized, sanctum sub-bass pulse).

### UI contract (AGENT-UI)
DOM/canvas overlays, no three imports. Each class: mount(root), update(dt,G),
show(), hide(), dispose(). Listen to bus events where useful.
- hud.js: health masks (flame pips), oil gauge (vertical, flickers when <25%),
  ability icons (dim until unlocked), boss health bar (on boss:start/end),
  interaction prompt ("[E] Kindle" etc), lore subtitle box (lore:show, auto-hide 5s),
  damage vignette hook (calls fx via bus 'fx:hurt').
- mapscreen.js: full-screen canvas map; draws visited rooms as rounded rects laid
  out from graph adjacency (precomputed positions from mapdata room.gridPos {gx,gy}),
  doors as locked/open glyphs, ability-gated edges dashed, current room pulsing,
  items icons per room if collected. Legend. Toggle with M/Tab handled by main.
- menus.js: title screen (MOONWELL, New Descent / Continue if save exists / controls),
  pause overlay (Resume/Save&Quit/Mute), death screen (fade + "The dark keeps what it drowns."
  + auto-respawn after 1.6s), ending screen (epilogue text, stats, credits).
  Emits bus events: 'ui:newgame', 'ui:continue', 'ui:savequit', 'ui:respawn'.

### Save format (ORCHESTRATOR owns save.js)
localStorage key 'moonwell.save.v1'. JSON {v:1, savedAt, ...SAVE_KEYS}.
Sets<->arrays conversion. Corrupt JSON -> return null (caller offers New Descent).

## Testing (tests/)
- map.test.js: progression reachability eras, no soft-locks, bidirectional routes.
- save.test.js: round-trip equality, corrupt input safe, sets preserved.
- physics.test.js: corner snag, tunneling, one-way drop-through, spike inset.
- enemies.test.js: state transitions per DESIGN timings (AGENT-ENEMIES delivers).
- lightfield.test.js: falloff math, cap clamp (AGENT-FX delivers).

## Perf budgets
Draw calls <300/room, lights <=9 active, physics <2ms/frame, no per-frame allocs
in hot loops, pooled particles <=2000, pixelRatio capped 1.5.
