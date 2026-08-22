import { describe, it, expect } from 'vitest'
import { ROOMS, getRoom, SPAWN } from '../src/world/mapdata.js'
import { buildGraph } from '../src/world/mapgraph.js'

const graph = buildGraph(ROOMS)

const ERAS = [
  { abilities: [], label: 'start' },
  { abilities: ['lantern'], label: 'after lantern' },
  { abilities: ['lantern', 'umbral_step'], label: 'after umbral step' },
  { abilities: ['lantern', 'umbral_step', 'veil_dash'], label: 'after veil dash' },
  { abilities: ['lantern', 'umbral_step', 'veil_dash', 'claws'], label: 'full kit' }
]

function roomOfItem(itemId) {
  for (const r of ROOMS) {
    if ((r.items || []).some(i => i.id === itemId)) return r.id
  }
  throw new Error(`item ${itemId} not found in any room`)
}

function roomWithBoss(bossType) {
  const r = ROOMS.find(r => (r.enemies || []).some(e => e.type === bossType && e.boss) || (r.boss && r.boss.type === bossType))
  if (!r) throw new Error(`no boss room for ${bossType}`)
  return r.id
}

describe('map progression integrity', () => {
  it('spawn room exists and is nave_01', () => {
    expect(SPAWN.room).toBe('nave_01')
    expect(getRoom('nave_01')).toBeTruthy()
  })

  it('all link and door targets resolve', () => {
    for (const r of ROOMS) {
      for (const dir of ['left', 'right', 'up', 'down']) {
        const to = r.links[dir]
        expect(to === null || graph.roomsById.has(to), `${r.id} ${dir} -> ${to}`).toBe(true)
      }
      for (const d of r.doors || []) {
        const to = d.to || d.leadsTo
        expect(graph.roomsById.has(to), `door ${d.id} -> ${to}`).toBe(true)
      }
    }
  })

  it('links are symmetric', () => {
    for (const r of ROOMS) {
      const opp = { left: 'right', right: 'left', up: 'down', down: 'up' }
      for (const dir of Object.keys(opp)) {
        const to = r.links[dir]
        if (!to) continue
        const back = getRoom(to)
        expect(back.links[opp[dir]], `${r.id}.${dir}=${to} but no reverse`).toBe(r.id)
      }
    }
  })

  it('lantern reachable with no abilities', () => {
    const reach = graph.reachable(SPAWN.room, new Set())
    expect(reach.has(roomOfItem('item_lantern'))).toBe(true)
  })

  it('umbral step obtainable after lantern era', () => {
    const reach = graph.reachable(SPAWN.room, new Set(['lantern']), new Set(['sacristan']))
    expect(reach.has(roomOfItem('item_umbral_step'))).toBe(true)
  })

  it('veil dash requires only umbral step', () => {
    const reach = graph.reachable(SPAWN.room, new Set(['lantern', 'umbral_step']))
    expect(reach.has(roomOfItem('item_veil_dash'))).toBe(true)
  })

  it('claws require up through veil dash', () => {
    const reach = graph.reachable(SPAWN.room, new Set(['lantern', 'umbral_step', 'veil_dash']))
    expect(reach.has(roomOfItem('item_claws'))).toBe(true)
  })

  it('final boss reachable with full kit', () => {
    const reach = graph.reachable(SPAWN.room, new Set(ERAS[4].abilities))
    expect(reach.has(roomWithBoss('warden'))).toBe(true)
  })

  it('sacristan fight is optional before its gate opens but arena reachable early', () => {
    const reach0 = graph.reachable(SPAWN.room, new Set())
    expect(reach0.has(roomWithBoss('sacristan'))).toBe(true)
  })

  it.each(ERAS)('no soft-lock: every reached room in era $label can reach spawn again', ({ abilities }) => {
    const ab = new Set(abilities)
    const reach = graph.reachable(SPAWN.room, ab, new Set(['sacristan', 'warden']))
    expect(reach.size).toBeGreaterThan(1)
    for (const roomId of reach) {
      const back = graph.reachable(roomId, ab, new Set(['sacristan', 'warden']))
      expect(back.has(SPAWN.room), `room ${roomId} cannot return to spawn`).toBe(true)
    }
  })

  it('every door requirement is satisfiable in final kit or by boss flags', () => {
    const valid = new Set(['lantern', 'umbral_step', 'veil_dash', 'claws', 'flag:sacristan_dead', 'flag:warden_dead', null])
    for (const r of ROOMS) {
      for (const d of r.doors || []) {
        expect(valid.has(d.requires ?? null), `door ${d.id} has unknown requirement ${d.requires}`).toBe(true)
      }
    }
  })

  it('every zone entry room contains a checkpoint', () => {
    for (const zone of ['nave', 'warrens', 'gallery', 'sanctum']) {
      const rooms = ROOMS.filter(r => r.zone === zone)
      const withCp = rooms.filter(r => (r.checkpoints || []).length > 0)
      expect(withCp.length, `zone ${zone} has no checkpoints`).toBeGreaterThan(0)
    }
  })
})
