import { Enemy, registerEnemy, createEnemy } from '../enemy_base.js'

const INTRO_T = 1.2
const SNUFF_TELE_T = 0.6
const ORBS_TELE_T = 0.6
const CHAIN_CROUCH_T = 0.45
const CHAIN_CROUCH_T_P3 = 0.25
const IMPACT_T = 0.25
const IMPACT_T_P3 = 0.18
const SPIKES_TELE_T = 0.7
const SPIKES_ACTIVE_T = 0.5
const RECOVER_T = 0.8
const PHASE2_HP = 40
const PHASE3_HP = 15
const CLONE_COUNT = 2
const ORB_COUNT = 3
const ORB_TTL = 4
const ORB_R = 8
const ORB_DMG = 1
const ORB_SPEED = 240
const CHAIN_SLAMS = 3
const HOP_VY = 380

export class Warden extends Enemy {
  static BASE_HP = 60
  static BODY_W = 90
  static BODY_H = 120
  static STAGGER = 0

  constructor(def, x, y) {
    super(def, x, y)
    this.phase = 1
    this.p2done = false
    this.attack = null
    this.nextAttack = null
    this.clones = []
    this.slamsLeft = 0
    this.spikePlan = null
    this.setState('intro')
  }

  arena(ctx) {
    const a = ctx && ctx.G && ctx.G.bossArena
    if (a) return a
    return {
      minX: this.spawnX - 480,
      maxX: this.spawnX + 480,
      floorY: this.spawnY + this.body.h / 2
    }
  }

  onHit() {
    this.flash = 0.15
    this.provoked = true
  }

  checkPhase(ctx) {
    if (this.phase === 1 && this.hp <= PHASE2_HP) {
      this.phase = 2
      if (!this.p2done) {
        this.p2done = true
        this.spawnClones(ctx)
        if (ctx && ctx.emit) ctx.emit('fx:dread', { amount: 0.8 })
      }
    }
    if (this.hp <= PHASE3_HP) this.phase = 3
  }

  spawnClones(ctx) {
    const b = this.body
    for (let i = 0; i < CLONE_COUNT; i++) {
      const cx = b.x + (i === 0 ? -70 : 70)
      if (ctx && typeof ctx.spawnMinion === 'function') {
        const m = ctx.spawnMinion('stalker', { clone: true, hp: 4, x: cx, y: b.y })
        if (m) this.clones.push(m)
      } else {
        try {
          this.clones.push(createEnemy('stalker', { clone: true, hp: 4 }, cx, b.y))
        } catch (e) {
          void e
        }
      }
    }
  }

  pickAttack() {
    if (this.nextAttack) {
      const a = this.nextAttack
      this.nextAttack = null
      return a
    }
    let pool
    if (this.phase >= 3) pool = ['slamChain', 'slamChain', 'orbs', 'floorSpikes', 'floorSpikes']
    else if (this.phase === 2) pool = ['slamChain', 'slamChain', 'orbs', 'orbs', 'lanternSnuff']
    else pool = ['lanternSnuff', 'slamChain', 'slamChain', 'orbs', 'orbs']
    return pool[Math.floor(Math.random() * pool.length)]
  }

  makeSpikePlan(ctx) {
    const ar = this.arena(ctx)
    const px = ctx.player.x
    const offsets = [-128, -48, 48, 128]
    const xs = []
    for (const o of offsets) {
      const x = Math.max(ar.minX + 20, Math.min(ar.maxX - 20, px + o))
      if (!xs.some(v => Math.abs(v - x) < 24)) xs.push(x)
    }
    return xs
  }

  think(dt, ctx) {
    const b = this.body
    this.checkPhase(ctx)
    switch (this.state) {
      case 'intro':
        this.anim = 'intro'
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (this.st >= INTRO_T) this.setState('idle')
        break
      case 'idle': {
        this.anim = 'idle'
        this.applyGravity(dt)
        this.move(dt, ctx)
        const atk = this.pickAttack()
        this.attack = atk
        if (atk === 'lanternSnuff') this.setState('snuffTele')
        else if (atk === 'slamChain') {
          this.slamsLeft = CHAIN_SLAMS
          this.setState('chainCrouch')
        } else if (atk === 'orbs') this.setState('orbsTele')
        else this.setState('spikesTele')
        break
      }
      case 'snuffTele':
        this.anim = 'cast'
        this.facePlayer(ctx)
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (this.st >= SNUFF_TELE_T) {
          if (typeof ctx.snuff === 'function') ctx.snuff(6)
          if (ctx.emit) ctx.emit('warden:snuff', { duration: 6 })
          this.setState('recover')
        }
        break
      case 'chainCrouch': {
        this.anim = 'telegraph'
        this.facePlayer(ctx)
        this.applyGravity(dt)
        this.move(dt, ctx)
        const ct = this.phase >= 3 ? CHAIN_CROUCH_T_P3 : CHAIN_CROUCH_T
        if (this.st >= ct) {
          const dx = ctx.player.x - b.x
          this.facing = dx < 0 ? -1 : 1
          b.vy = HOP_VY
          b.vx = Math.max(-260, Math.min(260, dx / 0.45)) * (this.phase >= 3 ? 1.3 : 1)
          this.airborne = false
          this.setState('chainAir')
        }
        break
      }
      case 'chainAir':
        this.anim = 'jump'
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (!b.onGround) this.airborne = true
        if (this.airborne && b.onGround && this.st > 0.15) {
          b.vx = 0
          if (ctx.emit) ctx.emit('fx:shake', {})
          this.setState('chainImpact')
        }
        break
      case 'chainImpact': {
        this.anim = 'slam'
        this.applyGravity(dt)
        this.move(dt, ctx)
        const ar = this.arena(ctx)
        const y = ar.floorY - 14
        const lw = Math.min(110, b.x - b.w / 2 - ar.minX)
        const rw = Math.min(110, ar.maxX - (b.x + b.w / 2))
        if (lw > 4) this.attacks.push({ x: b.x - b.w / 2 - lw / 2, y, w: lw, h: 28, dmg: 1, active: true })
        if (rw > 4) this.attacks.push({ x: b.x + b.w / 2 + rw / 2, y, w: rw, h: 28, dmg: 1, active: true })
        if (this.st >= (this.phase >= 3 ? IMPACT_T_P3 : IMPACT_T)) {
          this.slamsLeft--
          if (this.slamsLeft > 0) this.setState('chainCrouch')
          else this.setState('recover')
        }
        break
      }
      case 'orbsTele':
        this.anim = 'cast'
        this.facePlayer(ctx)
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (this.st >= ORBS_TELE_T) {
          this.spawnOrbs(ctx)
          this.setState('recover')
        }
        break
      case 'spikesTele':
        this.anim = 'cast'
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (!this.spikePlan) this.spikePlan = this.makeSpikePlan(ctx)
        this.telegraphs = this.spikePlan.map(x => ({ x, y: this.arena(ctx).floorY + 36 }))
        if (this.st >= SPIKES_TELE_T) {
          this.telegraphs = []
          this.setState('spikesActive')
        }
        break
      case 'spikesActive': {
        this.anim = 'cast'
        this.applyGravity(dt)
        this.move(dt, ctx)
        const fy = this.arena(ctx).floorY
        for (const x of this.spikePlan || []) {
          this.attacks.push({ x, y: fy + 36, w: 32, h: 72, dmg: 1, active: true })
        }
        if (this.st >= SPIKES_ACTIVE_T) {
          this.spikePlan = null
          this.setState('recover')
        }
        break
      }
      case 'recover':
        this.anim = 'idle'
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (this.st >= RECOVER_T) this.setState('idle')
        break
      default:
        this.setState('idle')
    }
  }

  spawnOrbs(ctx) {
    const b = this.body
    const p = ctx.player
    const base = Math.atan2(p.y - b.y, p.x - b.x)
    for (let i = 0; i < ORB_COUNT; i++) {
      const a = base + (i - 1) * 0.4
      this.projectiles.push({
        x: b.x,
        y: b.y,
        vx: Math.cos(a) * 180,
        vy: Math.sin(a) * 180,
        r: ORB_R,
        dmg: ORB_DMG,
        ttl: ORB_TTL
      })
    }
  }

  updateProjectiles(dt, ctx) {
    const ts = (ctx.world && ctx.world.ts) || 32
    const p = ctx.player
    const keep = []
    for (const o of this.projectiles) {
      o.ttl -= dt
      if (o.ttl <= 0) continue
      const dx = p.x - o.x
      const dy = p.y - o.y
      const d = Math.hypot(dx, dy) || 1
      o.vx += ((dx / d) * ORB_SPEED - o.vx) * Math.min(1, dt * 2.5)
      o.vy += ((dy / d) * ORB_SPEED - o.vy) * Math.min(1, dt * 2.5)
      o.x += o.vx * dt
      o.y += o.vy * dt
      const tx = Math.floor(o.x / ts)
      const ty = typeof ctx.world.rowAt === 'function' ? ctx.world.rowAt(o.y) : Math.floor(o.y / ts)
      if (ctx.world.tileAt(tx, ty) === 1) continue
      keep.push(o)
    }
    this.projectiles = keep
  }

  staggerStep(dt, ctx) {
    this.anim = 'stagger'
    this.applyGravity(dt)
    this.move(dt, ctx)
  }

  postUpdate(dt, ctx) {
    this.updateProjectiles(dt, ctx)
    if (this.clones.length > 0) {
      for (const c of this.clones) c.update(dt, ctx)
      this.clones = this.clones.filter(c => !c.dead)
    }
  }

  onDeath() {
    const ctx = this._ctx
    if (ctx && ctx.emit) ctx.emit('boss:end', { victory: true, id: 'warden' })
    this.projectiles = []
    this.clones = []
    this.telegraphs = []
  }
}

registerEnemy('warden', Warden)
