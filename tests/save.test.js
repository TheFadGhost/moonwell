import { describe, it, expect } from 'vitest'
import { serialize, deserialize, saveGame, loadGame, wipeSave, hasSave } from '../src/core/save.js'
import { createState } from '../src/core/state.js'

function makeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  }
}

function populatedState() {
  const g = createState()
  g.player.x = 123.5
  g.player.y = 456.25
  g.player.hp = 2
  g.player.abilities.add('lantern')
  g.player.abilities.add('umbral_step')
  g.flags.doorsOpened.add('gate_warrens')
  g.flags.itemsCollected.add('item_lantern')
  g.flags.checkpointsActivated.add('well_nave_start')
  g.flags.roomsVisited.add('nave_01')
  g.flags.roomsVisited.add('nave_02')
  g.flags.bossesDefeated.add('sacristan')
  g.currentRoom = 'warren_03'
  g.respawn = { room: 'warren_01', x: 96, y: 832 }
  g.time = 612.7
  g.deaths = 3
  g.shards = 1
  return g
}

describe('save system', () => {
  it('round-trips through serialize/deserialize with sets intact', () => {
    const g = populatedState()
    const restored = deserialize(JSON.parse(JSON.stringify(serialize(g))))
    expect(restored).not.toBeNull()
    expect(restored.player.x).toBeCloseTo(123.5)
    expect(restored.player.abilities).toBeInstanceOf(Set)
    expect([...restored.player.abilities].sort()).toEqual(['lantern', 'umbral_step'])
    expect(restored.flags.roomsVisited).toBeInstanceOf(Set)
    expect(restored.flags.roomsVisited.size).toBe(2)
    expect(restored.flags.bossesDefeated.has('sacristan')).toBe(true)
    expect(restored.respawn.room).toBe('warren_01')
    expect(restored.deaths).toBe(3)

    const again = serialize(restored)
    expect(JSON.stringify(again)).toBe(JSON.stringify(serialize(g)))
  })

  it('rejects corrupt or foreign payloads safely', () => {
    expect(deserialize(null)).toBeNull()
    expect(deserialize(undefined)).toBeNull()
    expect(deserialize({})).toBeNull()
    expect(deserialize({ v: 99 })).toBeNull()
    expect(deserialize({ v: 1 })).toBeNull()
    expect(deserialize({ v: 1, player: {} })).toBeNull()
    expect(deserialize({ v: 1, player: { x: 'NaN', y: 0 } })).toBeNull()
  })

  it('survives JSON corruption at the storage layer', () => {
    const s = makeStorage()
    s.setItem('moonwell.save.v1', '{"v":1,"player":{"x"')
    expect(loadGame(s)).toBeNull()
  })

  it('save/load/wipe lifecycle against storage', () => {
    const s = makeStorage()
    expect(hasSave(s)).toBe(false)
    const g = populatedState()
    expect(saveGame(g, s)).toBe(true)
    expect(hasSave(s)).toBe(true)
    const loaded = loadGame(s)
    expect(loaded).not.toBeNull()
    expect(loaded.currentRoom).toBe('warren_03')
    expect(loaded.player.abilities.has('umbral_step')).toBe(true)
    wipeSave(s)
    expect(hasSave(s)).toBe(false)
    expect(loadGame(s)).toBeNull()
  })

  it('deserialize fills missing optional fields from defaults', () => {
    const minimal = { v: 1, player: { x: 10, y: 20, abilities: [] }, flags: {}, currentRoom: 'nave_01' }
    const out = deserialize(minimal)
    expect(out).not.toBeNull()
    expect(out.maxHp ?? out.player.maxHp).toBeGreaterThan(0)
    expect(out.flags.roomsVisited).toBeInstanceOf(Set)
  })
})
