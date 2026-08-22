const listeners = new Map()

export const bus = {
  on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type).add(fn)
    return () => bus.off(type, fn)
  },
  once(type, fn) {
    const off = bus.on(type, (p) => { off(); fn(p) })
    return off
  },
  off(type, fn) {
    const set = listeners.get(type)
    if (set) set.delete(fn)
  },
  emit(type, payload) {
    const set = listeners.get(type)
    if (!set) return
    for (const fn of [...set]) fn(payload)
  },
  clear() {
    listeners.clear()
  }
}
