import { createState } from './state.js'

const PREFIX = 'moonwell.save.v1'

function setsToArrays(obj) {
  const out = {}
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    out[k] = v instanceof Set ? [...v] : v
  }
  return out
}

function arraysToSets(obj, template) {
  const out = {}
  for (const k of Object.keys(template)) {
    const v = obj[k]
    if (template[k] instanceof Set) {
      out[k] = new Set(Array.isArray(v) ? v : [])
    } else if (typeof template[k] === 'object' && template[k] !== null && !Array.isArray(template[k])) {
      out[k] = arraysToSets(v || {}, template[k])
    } else if (v !== undefined) {
      out[k] = v
    } else {
      out[k] = template[k]
    }
  }
  return out
}

export function serialize(G, meta = {}) {
  return {
    v: 1,
    savedAt: Date.now(),
    player: { ...G.player, abilities: [...G.player.abilities] },
    flags: setsToArrays(G.flags),
    currentRoom: G.currentRoom,
    respawn: { ...G.respawn },
    time: G.time,
    deaths: G.deaths,
    shards: G.shards,
    meta: { ...meta }
  }
}

export function deserialize(data) {
  if (!data || data.v !== 1) return null
  const blank = createState()
  try {
    const p = data.player
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null
    blank.player = { ...blank.player, ...p, abilities: new Set(p.abilities || []) }
    blank.flags = arraysToSets(data.flags || {}, blank.flags)
    blank.currentRoom = typeof data.currentRoom === 'string' ? data.currentRoom : blank.currentRoom
    blank.respawn = data.respawn && typeof data.respawn.room === 'string'
      ? { room: data.respawn.room, x: +data.respawn.x || 0, y: +data.respawn.y || 0 }
      : blank.respawn
    blank.time = +data.time || 0
    blank.deaths = +data.deaths || 0
    blank.shards = +data.shards || 0
    return blank
  } catch (e) {
    return null
  }
}

export function saveGame(G, storage = window.localStorage) {
  try {
    storage.setItem(PREFIX, JSON.stringify(serialize(G)))
    return true
  } catch (e) {
    return false
  }
}

export function loadGame(storage = window.localStorage) {
  try {
    const raw = storage.getItem(PREFIX)
    if (!raw) return null
    return deserialize(JSON.parse(raw))
  } catch (e) {
    return null
  }
}

export function wipeSave(storage = window.localStorage) {
  try {
    storage.removeItem(PREFIX)
  } catch (e) {}
}

export function hasSave(storage = window.localStorage) {
  try {
    return !!storage.getItem(PREFIX)
  } catch (e) {
    return false
  }
}
