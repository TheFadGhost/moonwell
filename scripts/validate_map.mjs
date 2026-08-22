const mod = await import(new URL('../src/world/mapdata.js', import.meta.url).href)
const ROOMS = mod.ROOMS
const getRoom = mod.getRoom
const ZONE_ORDER = mod.ZONE_ORDER
const SPAWN = mod.SPAWN

let fails = 0
function fail(m) {
  fails++
  console.log('FAIL ' + fails + ': ' + m)
}

const DIRS = ['left', 'right', 'up', 'down']
const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' }
const WALK = new Set(['.', '-', '%', '~'])
const SUP = new Set(['#', '-'])
const ABILITIES = new Set(['lantern', 'umbral_step', 'veil_dash', 'claws'])
const FLAGS = new Set(['flag:sacristan_dead', 'flag:warden_dead'])
const BEASTS = new Set(['husk', 'maw', 'stalker', 'bloom', 'wisp'])
const BOSSES = new Set(['sacristan', 'warden'])
const SCARE_TYPES = new Set(['whisper', 'silhouette', 'collapse'])
const ITEM_KINDS = new Set(['lore', 'oil', 'shard', 'ability'])
const SPECIAL_IDS = new Set(['nave_crypt', 'sanctum_well', 'sanctum_dawn'])
const ENTRY_ROOMS = ['nave_01', 'warren_01', 'gallery_01', 'sanctum_01']
const NAMED_CHECKPOINTS = ['well_nave_start', 'well_warren_entry', 'well_gallery_entry', 'well_gallery_deep', 'well_sanctum_gate', 'well_warden']
const MUSIC = {}
for (const z of ZONE_ORDER) MUSIC[z] = 'ambient_' + z
const ZONE_PREFIX = { nave: 'nave', warrens: 'warren', gallery: 'gallery', sanctum: 'sanctum' }
const ALL_ABILITIES = new Set(ABILITIES)

const byId = new Map(ROOMS.map((r) => [r.id, r]))

function tile(r, x, y) {
  if (y < 0 || y >= r.height || x < 0 || x >= r.width) return '#'
  return r.rows[y][x]
}
function walkableAt(r, p) {
  return WALK.has(tile(r, p.tx, p.ty))
}
function supported(r, p) {
  if (p.ty <= 4) return true
  for (let dy = 1; dy <= 8; dy++) {
    if (SUP.has(tile(r, p.tx, p.ty + dy))) return true
  }
  return false
}
function inBounds(r, p) {
  return Number.isInteger(p.tx) && Number.isInteger(p.ty) && p.tx >= 0 && p.tx < r.width && p.ty >= 0 && p.ty < r.height
}
function pointLabel(roomId, p) {
  return roomId + '(' + p.tx + ',' + p.ty + ')'
}
function doorOpen(dr, ctx) {
  if (ctx.excludeDoor && dr.id === ctx.excludeDoor.id) return false
  if (!dr.requires) return true
  if (FLAGS.has(dr.requires)) return true
  if (ctx.excludeDoor && ((dr.id && dr.id === ctx.excludeDoor.pair) || (dr.pair && dr.pair === ctx.excludeDoor.id))) return true
  if (ctx.abilities && !dr.requires.startsWith('flag:')) return ctx.abilities.has(dr.requires)
  return false
}function edges(id, ctx) {
  const out = []
  const r = byId.get(id)
  for (const d of DIRS) {
    if (r.links && r.links[d]) out.push(r.links[d])
  }
  for (const dr of r.doors || []) {
    if (doorOpen(dr, ctx)) out.push(dr.to)
  }
  return out
}
function canReach(startId, goalId, ctx) {
  const seen = new Set([startId])
  const q = [startId]
  while (q.length) {
    const cur = q.shift()
    if (cur === goalId) return true
    for (const nxt of edges(cur, ctx)) {
      if (byId.has(nxt) && !seen.has(nxt)) {
        seen.add(nxt)
        q.push(nxt)
      }
    }
  }
  return false
}
function reachableSet(startId, ctx) {
  const seen = new Set([startId])
  const q = [startId]
  while (q.length) {
    const cur = q.shift()
    for (const nxt of edges(cur, ctx)) {
      if (byId.has(nxt) && !seen.has(nxt)) {
        seen.add(nxt)
        q.push(nxt)
      }
    }
  }
  return seen
}
for (const r of ROOMS) {
  if (!ZONE_ORDER.includes(r.zone)) fail(r.id + ': bad zone')
  const pat = new RegExp('^' + (ZONE_PREFIX[r.zone] || r.zone) + '_[0-9][0-9]$')
  if (!pat.test(r.id) && !SPECIAL_IDS.has(r.id)) fail(r.id + ': id does not match zone_NN convention')
  if (!Number.isInteger(r.width) || r.width < 36 || r.width > 72) fail(r.id + ': width out of 36..72: ' + r.width)
  if (!Number.isInteger(r.height) || r.height < 28 || r.height > 52) fail(r.id + ': height out of 28..52: ' + r.height)
  const gp = r.gridPos
  if (!gp || !Number.isInteger(gp.gx) || !Number.isInteger(gp.gy)) fail(r.id + ': gridPos missing ints')
}
if (new Set(ROOMS.map((r) => r.id)).size !== ROOMS.length) fail('duplicate room ids')

for (const r of ROOMS) {
  if (!Array.isArray(r.rows) || r.rows.length !== r.height) {
    fail(r.id + ': rows.length ' + (r.rows ? r.rows.length : 'none') + ' != height ' + r.height)
    continue
  }
  for (let y = 0; y < r.rows.length; y++) {
    const row = String(r.rows[y])
    if (row.length !== r.width) fail(r.id + ': row ' + y + ' length ' + row.length + ' != width ' + r.width)
    if (/[^.#\-%^~]/.test(row)) fail(r.id + ': row ' + y + ' has illegal chars: ' + row.replace(/[^.#\-%^~]/g, '?'))
  }
}

for (const r of ROOMS) {
  for (const d of ['up', 'down']) {
    if (r.links && r.links[d]) {
      const o = r.openings ? r.openings[d] : undefined
      if (!Number.isInteger(o) || o < 2 || o > r.width - 7) fail(r.id + ': openings.' + d + ' invalid for vertical link')
    }
  }
  const op = r.openings || {}
  for (const k of Object.keys(op)) {
    if (!r.links || !r.links[k]) fail(r.id + ': openings.' + k + ' declared without matching link')
  }
}

for (const r of ROOMS) {
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const onBorder = x === 0 || y === 0 || x === r.width - 1 || y === r.height - 1
      if (!onBorder) continue
      const ch = tile(r, x, y)
      let allowed = false
      if ((x === 0 || x === r.width - 1) && r.links) {
        const side = x === 0 ? 'left' : 'right'
        if (r.links[side] && y >= r.height - 5 && y <= r.height - 2 && ch !== '#') allowed = true
      }
      if (y === 0 && r.links && r.links.up && r.openings && Number.isInteger(r.openings.up)) {
        if (x >= r.openings.up && x <= r.openings.up + 3 && ch !== '#') allowed = true
      }
      if (y === r.height - 1 && r.links && r.links.down && r.openings && Number.isInteger(r.openings.down)) {
        if (x >= r.openings.down && x <= r.openings.down + 3 && ch !== '#') allowed = true
      }
      if (ch !== '#' && !allowed) fail(r.id + ': border hole not aligned with a link at (' + x + ',' + y + ')')
      if (allowed && ch === '#') fail(r.id + ': missing opening for link at (' + x + ',' + y + ')')
    }
  }
}
for (const r of ROOMS) {
  for (const d of DIRS) {
    const to = r.links ? r.links[d] : null
    if (!to) continue
    const b = byId.get(to)
    if (!b) {
      fail(r.id + '.' + d + ': unknown target ' + to)
      continue
    }
    if (!b.links || b.links[OPP[d]] !== r.id) fail(r.id + ' --' + d + '--> ' + to + ': link not symmetric')
    const dx = Math.abs(b.gridPos.gx - r.gridPos.gx)
    const dy = Math.abs(b.gridPos.gy - r.gridPos.gy)
    if (dx + dy !== 1) fail(r.id + ' -> ' + to + ': gridPos not adjacent on map screen')
    const mine = r.linkSpawns ? r.linkSpawns[d] : null
    const theirs = b.linkSpawns ? b.linkSpawns[OPP[d]] : null
    if (!mine || !Number.isInteger(mine.tx)) {
      fail(r.id + '.linkSpawns.' + d + ' missing (target ' + to + ')')
    } else {
      if (!inBounds(b, mine)) fail(pointLabel(r.id, mine) + ' outside target room ' + to)
      else if (!walkableAt(b, mine)) fail(pointLabel(r.id, mine) + ' lands on blocked tile in ' + to)
      else if (!supported(b, mine)) fail(pointLabel(r.id, mine) + ' has no ground below in ' + to)
      else if (d === 'right' && mine.tx > 6) fail(r.id + '.linkSpawns.right not near left edge of ' + to)
      else if (d === 'left' && mine.tx < b.width - 7) fail(r.id + '.linkSpawns.left not near right edge of ' + to)
      else if (d === 'down' && mine.ty > 6) fail(r.id + '.linkSpawns.down not near ceiling of ' + to)
      else if (d === 'up' && mine.ty < b.height - 7) fail(r.id + '.linkSpawns.up not near floor of ' + to)
    }
    if (!theirs || !Number.isInteger(theirs.tx)) {
      fail(to + '.linkSpawns.' + OPP[d] + ' missing (reciprocal of ' + r.id + ')')
    } else {
      if (!inBounds(r, theirs)) fail(pointLabel(to, theirs) + ' outside room ' + r.id)
      else if (!walkableAt(r, theirs)) fail(pointLabel(to, theirs) + ' lands on blocked tile in ' + r.id)
      else if (!supported(r, theirs)) fail(pointLabel(to, theirs) + ' has no ground below in ' + r.id)
    }
  }
}

const allDoorIds = new Set()
for (const r of ROOMS) {
  for (const dr of r.doors || []) {
    if (!dr.id || allDoorIds.has(dr.id)) fail(r.id + ': door id missing or duplicated: ' + dr.id)
    allDoorIds.add(dr.id)
    const b = byId.get(dr.to)
    if (!b) fail(r.id + ': door ' + dr.id + ' targets unknown room ' + dr.to)
    if (dr.requires && !ABILITIES.has(dr.requires) && !FLAGS.has(dr.requires)) {
      fail(r.id + ': door ' + dr.id + ' has unknown requires token ' + dr.requires)
    }
  }
}
for (const r of ROOMS) {
  for (const dr of r.doors || []) {
    if (!byId.has(dr.to)) continue
    const back = canReach(dr.to, r.id, { excludeDoor: dr, pair: dr.pair })
    if (!back) fail('door ' + dr.id + ' (' + r.id + ' -> ' + dr.to + ') has no route back')
  }
}
const full = reachableSet(SPAWN.room, { abilities: ALL_ABILITIES })
for (const r of ROOMS) {
  if (!full.has(r.id)) fail(r.id + ' unreachable from spawn in fully-open world')
  if (!canReach(r.id, SPAWN.room, { abilities: ALL_ABILITIES })) fail(r.id + ' cannot return to ' + SPAWN.room + ' (one-way trap)')
}

let abilities = new Set()
let eraSeen = new Set([SPAWN.room])
for (let i = 0; i < ROOMS.length + 2; i++) {
  eraSeen = reachableSet(SPAWN.room, { abilities })
  const before = abilities.size
  for (const rid of eraSeen) {
    for (const it of byId.get(rid).items || []) {
      if (it.kind === 'ability' && ABILITIES.has(it.ability)) abilities.add(it.ability)
    }
  }
  if (abilities.size === before) break
}
for (const r of ROOMS) {
  if (!eraSeen.has(r.id)) fail(r.id + ' unreachable at any progression era')
}
if (!eraSeen.has('sanctum_well')) fail('final boss room not reachable through progression')

const seenItemIds = new Set()
const zoneCount = {}
for (const r of ROOMS) {
  zoneCount[r.zone] = zoneCount[r.zone] || { oil: 0, lore: 0, shard: 0 }
  for (const it of r.items || []) {
    if (!it.id) fail(r.id + ': item missing id')
    else if (seenItemIds.has(it.id)) fail('duplicate item id: ' + it.id)
    seenItemIds.add(it.id)
    if (!ITEM_KINDS.has(it.kind)) fail(it.id + ': bad kind ' + it.kind)
    if (it.kind === 'ability') {
      if (!ABILITIES.has(it.ability)) fail(it.id + ': unknown ability ' + it.ability)
      if (!it.text && it.kind === 'lore') fail(it.id + ': lore text missing')
    }
    if (!inBounds(r, it)) fail(it.id + ' out of bounds in ' + r.id)
    else if (tile(r, it.tx, it.ty) === '#') fail(it.id + ' embedded in solid tile in ' + r.id)
    if (it.kind === 'oil') zoneCount[r.zone].oil++
    if (it.kind === 'lore') zoneCount[r.zone].lore++
    if (it.kind === 'shard') zoneCount[r.zone].shard++
  }
}
for (const a of ABILITIES) {
  let found = false
  for (const r of ROOMS) for (const it of r.items || []) if (it.ability === a) found = true
  if (!found) fail('required ability item missing from world: ' + a)
}
if (zoneCount.nave.oil < 3 || zoneCount.nave.lore < 2 || zoneCount.nave.lore > 3) fail('nave pickups off-spec: ' + JSON.stringify(zoneCount.nave))
if (zoneCount.warrens.oil < 2 || zoneCount.warrens.lore < 3 || zoneCount.warrens.shard !== 1) fail('warrens pickups off-spec: ' + JSON.stringify(zoneCount.warrens))
if (zoneCount.gallery.oil < 2 || zoneCount.gallery.lore < 3 || zoneCount.gallery.shard !== 1) fail('gallery pickups off-spec: ' + JSON.stringify(zoneCount.gallery))
const bossSpots = { sacristan: [], warden: [] }
for (const r of ROOMS) {
  let elites = 0
  for (const e of r.enemies || []) {
    if (!BEASTS.has(e.type) && !BOSSES.has(e.type)) fail(r.id + ': enemy type not allowed: ' + e.type)
    if (BOSSES.has(e.type)) {
      bossSpots[e.type].push(r.id)
      if (!e.boss) fail(r.id + ': ' + e.type + ' missing boss flag')
    } else if (e.boss) {
      fail(r.id + ': non-boss type flagged as boss: ' + e.type)
    }
    if (e.elite === true && r.zone !== 'sanctum') fail(r.id + ': elite enemy outside sanctum')
    if (e.elite === true) elites++
    if (!inBounds(r, e)) fail(r.id + ': enemy out of bounds: ' + e.type)
  }
  r._elites = elites
}
if (bossSpots.sacristan.length !== 1 || bossSpots.sacristan[0] !== 'nave_crypt') fail('sacristan must appear exactly once in nave_crypt')
if (bossSpots.warden.length !== 1 || bossSpots.warden[0] !== 'sanctum_well') fail('warden must appear exactly once in sanctum_well')

let sanctumElites = 0
for (const r of ROOMS) if (r.zone === 'sanctum') sanctumElites += r._elites || 0
if (sanctumElites < 2) fail('sanctum gauntlet needs at least 2 elite enemies, found ' + sanctumElites)

const gridSeen = new Set()
for (const r of ROOMS) {
  const k = r.gridPos.gx + ',' + r.gridPos.gy
  if (gridSeen.has(k)) fail('duplicate gridPos: ' + k + ' (' + r.id + ')')
  gridSeen.add(k)
}

const cpIds = new Set()
for (const r of ROOMS) {
  if (!r.checkpoints || !r.checkpoints.length) continue
  for (const cp of r.checkpoints) {
    if (!cp.id) fail(r.id + ': checkpoint missing id')
    else if (cpIds.has(cp.id)) fail('duplicate checkpoint id: ' + cp.id)
    cpIds.add(cp.id)
    if (!inBounds(r, cp)) fail('checkpoint ' + cp.id + ' out of bounds in ' + r.id)
    else if (!walkableAt(r, cp)) fail('checkpoint ' + cp.id + ' on blocked tile in ' + r.id)
    else if (!supported(r, cp)) fail('checkpoint ' + cp.id + ' has no ground below in ' + r.id)
  }
}
for (const er of ENTRY_ROOMS) {
  const room = byId.get(er)
  if (!room) fail('zone-entry room missing: ' + er)
  else if (!room.checkpoints || room.checkpoints.length < 1) fail('zone-entry room has no checkpoint: ' + er)
}
for (const id of NAMED_CHECKPOINTS) {
  if (!cpIds.has(id)) fail('required checkpoint missing: ' + id)
}

let totalScares = 0
const scareIds = new Set()
for (const r of ROOMS) {
  const count = (r.lights || []).length
  if (count < 1 || count > 6) fail(r.id + ': lights count out of range: ' + count)
  if (r.music !== MUSIC[r.zone]) fail(r.id + ': music should be ' + MUSIC[r.zone] + ', got ' + r.music)
  for (const li of r.lights || []) {
    if (!inBounds(r, li)) fail(r.id + ': light out of bounds')
  }
  for (const sc of r.scares || []) {
    totalScares++
    if (!sc.id || scareIds.has(sc.id)) fail(r.id + ': scare id missing/duplicated')
    scareIds.add(sc.id)
    if (!SCARE_TYPES.has(sc.type)) fail(r.id + ': bad scare type ' + sc.type)
    if (!inBounds(r, sc)) fail(r.id + ': scare out of bounds')
    if (!Number.isInteger(sc.radius) || sc.radius < 2) fail(r.id + ': scare radius invalid')
  }
}
if (totalScares < 4) fail('world needs at least 4 one-time scares, found ' + totalScares)

try {
  getRoom(SPAWN.room)
} catch (e) {
  fail('SPAWN.room invalid: ' + SPAWN.room)
}
let threw = false
try {
  getRoom('definitely_not_a_room')
} catch (e) {
  threw = true
}
if (!threw) fail('getRoom must throw on unknown id')
{
  const sr = byId.get(SPAWN.room)
  if (sr) {
    if (!walkableAt(sr, SPAWN)) fail('SPAWN tile blocked in ' + SPAWN.room)
    else if (!supported(sr, SPAWN)) fail('SPAWN has no ground below')
  }
}

if (fails === 0) console.log('PASS')
process.exit(fails === 0 ? 0 : 1)
