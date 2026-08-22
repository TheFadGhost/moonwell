export class HorrorDirector {
  constructor(G, lightfield) {
    this.G = G
    this.lightfield = lightfield
    this.threatNear = false
    this.timeSinceScare = 999
    this.scares = []
    this.cooldowns = { stinger: 0 }
  }

  setRoom(room) {
    this.scares = (room && room.scares) || []
    this.roomH = (room ? room.height : 0) * 32
  }

  update(dt, enemies, emit, audio) {
    const G = this.G
    const p = G.player

    let threat = false
    let nearest = 1e9
    for (const e of enemies) {
      if (e.dead || !e.provoked) continue
      const d = Math.hypot(e.body.x - p.x, e.body.y - p.y)
      if (d < nearest) nearest = d
      if (d < 460) threat = true
    }
    this.threatNear = threat

    const localLight = this.lightfield.lightAt(p.x, p.y)
    let target = 0.12
    if (localLight < 0.15) target = Math.max(target, 0.55)
    if (threat) target = Math.max(target, 0.9)
    if (nearest < 220 && threat) target = 1
    G.tension += (target - G.tension) * Math.min(1, dt * (target > G.tension ? 1.6 : 0.5))

    audio.update(dt, {
      zone: G.zone,
      tension: G.tension,
      threatNear: threat,
      inWater: !!G.inWater,
      moving: Math.abs(p.vx) > 30 && p.onGround !== false,
      onGround: !!p.onGround
    })

    if (this.cooldowns.stinger > 0) this.cooldowns.stinger -= dt
    this.timeSinceScare += dt

    if (G.state === 'playing' && this.timeSinceScare > 90 && this.cooldowns.stinger <= 0) {
      for (const s of this.scares) {
        if (G.flags.scaresSeen.has(s.id)) continue
        const w = { x: s.tx * 32 + 16, y: this.roomH - (s.ty * 32 + 16) }
        const d = Math.hypot(w.x - p.x, w.y - p.y)
        if (d < (s.radius || 300)) {
          G.flags.scaresSeen.add(s.id)
          this.triggerScare(s, emit, audio)
          break
        }
      }
    }
  }

  triggerScare(s, emit, audio) {
    this.timeSinceScare = 0
    this.cooldowns.stinger = 45
    if (s.type === 'whisper') {
      audio.play('stinger_discover', { volume: 0.5 })
      emit('lore:show', { text: '...something breathes your name...' })
      this.G.tension = Math.min(1, this.G.tension + 0.35)
    } else if (s.type === 'silhouette') {
      audio.play('stinger_close', { volume: 0.7 })
      emit('fx:silhouette', { x: s.tx * 32 + 16, y: this.roomH - (s.ty * 32 + 16) })
      this.G.tension = Math.min(1, this.G.tension + 0.45)
    } else if (s.type === 'collapse') {
      audio.play('stinger_discover', { volume: 0.65 })
      emit('fx:collapse', { x: s.tx * 32 + 16, y: this.roomH - (s.ty * 32 + 16) })
      emit('fx:shake', {})
      this.G.tension = Math.min(1, this.G.tension + 0.3)
    }
  }
}
