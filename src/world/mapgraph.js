export function buildGraph(ROOMS) {
  const roomsById = new Map()
  for (const r of ROOMS) roomsById.set(r.id, r)
  const adjacency = new Map()
  for (const r of ROOMS) {
    const edges = []
    for (const dir of ['left', 'right', 'up', 'down']) {
      const to = r.links && r.links[dir]
      if (to && roomsById.has(to)) edges.push({ to, via: 'link', requires: null, doorId: null })
    }
    for (const d of r.doors || []) {
      const to = d.to || d.leadsTo
      if (!to || !roomsById.has(to)) continue
      const req = !d.requires || d.requires === 'none' ? null : d.requires
      edges.push({ to, via: 'door', requires: req, doorId: d.id })
    }
    adjacency.set(r.id, edges)
  }
  return {
    adjacency,
    roomsById,
    requirementMet(req, abilities, defeated) {
      if (!req) return true
      if (req.startsWith('flag:')) return defeated.has(req.slice(5))
      return abilities.has(req)
    },
    reachable(startRoomId, abilities, defeatedBosses = new Set()) {
      const seen = new Set([startRoomId])
      const queue = [startRoomId]
      while (queue.length) {
        const cur = queue.shift()
        for (const e of adjacency.get(cur) || []) {
          if (seen.has(e.to)) continue
          if (!this.requirementMet(e.requires, abilities, defeatedBosses)) continue
          seen.add(e.to)
          queue.push(e.to)
        }
      }
      return seen
    }
  }
}
