export class LightField {
  constructor() {
    this.entries = []
    this.staticIdx = new Map()
    this.dynIdx = new Map()
    this.free = []
    this.snuffTimer = 0
  }

  _acquire() {
    if (this.free.length > 0) return this.free.pop()
    this.entries.push({ id: null, x: 0, y: 0, radius: 0, intensity: 0, dynamic: false, alive: false })
    return this.entries.length - 1
  }

  _upsert(map, id, x, y, radius, intensity, dynamic) {
    let k = map.get(id)
    if (k === undefined) {
      k = this._acquire()
      map.set(id, k)
      const e = this.entries[k]
      e.id = id
      e.dynamic = dynamic
      e.alive = true
    }
    const e = this.entries[k]
    e.x = x
    e.y = y
    e.radius = radius
    e.intensity = intensity
  }

  addStatic(id, x, y, radius, intensity) {
    this._upsert(this.staticIdx, id, x, y, radius, intensity, false)
  }

  removeStatic(id) {
    const k = this.staticIdx.get(id)
    if (k === undefined) return
    this.entries[k].alive = false
    this.entries[k].intensity = 0
    this.free.push(k)
    this.staticIdx.delete(id)
  }

  setDynamic(id, x, y, radius, intensity) {
    this._upsert(this.dynIdx, id, x, y, radius, intensity, true)
  }

  clearTemporaries() {
    for (const k of this.dynIdx.values()) {
      this.entries[k].alive = false
      this.entries[k].intensity = 0
      this.free.push(k)
    }
    this.dynIdx.clear()
  }

  snuffAll(seconds) {
    if (seconds > this.snuffTimer) this.snuffTimer = seconds
  }

  update(dt) {
    if (this.snuffTimer > 0) {
      this.snuffTimer -= dt
      if (this.snuffTimer < 0) this.snuffTimer = 0
    }
  }

  get snuffed() {
    return this.snuffTimer > 0
  }

  lightAt(x, y) {
    if (this.snuffTimer > 0) return 0
    const es = this.entries
    let sum = 0
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (!e.alive) continue
      const dx = e.x - x
      const dy = e.y - y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d >= e.radius) continue
      sum += e.intensity - e.intensity * (d / e.radius)
      if (sum >= 1) return 1
    }
    return sum
  }
}
