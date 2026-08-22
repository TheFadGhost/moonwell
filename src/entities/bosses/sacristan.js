import { Enemy, registerEnemy } from '../enemy_base.js'

const INTRO_T = 1.2
const SLAM_TELE_T = 0.6
const DASH_TELE_T = 0.5
const SUMMON_TELE_T = 0.5
const DEBRIS_TELE_T = 0.7
const RECOVER_T = 0.7
const WAVE_T = 0.45
const SHOCK_REACH = 220
const WAVE_H = 26
const DASH_SPEED = 480
const JUMP_VY = 560
const PHASE2_HP = 15
const DEBRIS_COUNT = 3
const MAX_MINIONS = 2

export class Sacristan extends Enemy {
  static BASE_HP = 30
  static BODY_W = 70
  static BODY_H = 90
  static STAGGER = 0

  constructor(def, x, y) {
    super(def, x, y)
    this.phase = 1
    this.attack = null
    this.nextAttack = null
    this.minions = []
    this.debrisPlan = null
    this.debris = []
    this.airborne = false
    this.setState('intro')
  }

  get speedMult() { return this.phase >= 2 ? 1.3 : 1 }

  arena(ctx) {
    const a = ctx && ctx.G && ctx.G.bossArena
    if (a) return a
    return {
      minX: this.spawnX - 480,
      maxX: this.spawnX + 480,
      floorY: this.spawnY + this.body.h / 2
    }
  }

  aliveMinions() {
    this.minions = this.minions.filter(m => m && !m.dead)
    return this.minions.length
  }

  onHit() {
    this.flash = 0.15
    this.provoked = true
  }

  pickAttack(ctx) {
    if (this.nextAttack) {
      const a = this.nextAttack
      this.nextAttack = null
      return a
    }
    const pool = ['overheadSlam', 'overheadSlam', 'sweepDash', 'sweepDash']
    if (ctx && typeof ctx.spawnMinion === 'function' && this.aliveMinions() < MAX_MINIONS) {
      pool.push('summon')
    }
    if (this.phase >= 2) pool.push('debris', 'debris')
    return pool[Math.floor(Math.random() * pool.length)]
  }

  makeDebrisPlan(ctx) {
    const ar = this.arena(ctx)
    const plan = []
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const x = ar.minX + 40 + Math.random() * Math.max(1, ar.maxX - ar.minX - 80)
      plan.push({ x, y: ar.floorY + 320 })
    }
    return plan
  }

  checkPhase() {
    if (this.phase === 1 && this.hp <= PHASE2_HP) this.phase = 2
  }

  landSlam(ctx) {
    const c = this._ctx || ctx
    if (c && c.emit) c.emit('fx:shake', {})
  }

  shockBoxes(ctx) {
    const b = this.body
    const ar = this.arena(ctx)
    const p = Math.min(1, this.st / WAVE_T)
    const reach = SHOCK_REACH * p
    if (reach > 6) {
      const y = ar.floorY - WAVE_H / 2 - 1
      const lw = Math.max(0, Math.min(reach, b.x - b.w / 2 - ar.minX))
      const rw = Math.max(0, Math.min(reach, ar.maxX - (b.x + b.w / 2)))
      if (lw > 4) this.attacks.push({ x: b.x - b.w / 2 - lw / 2, y, w: lw, h: WAVE_H, dmg: 1, active: true })
      if (rw > 4) this.attacks.push({ x: b.x + b.w / 2 + rw / 2, y, w: rw, h: WAVE_H, dmg: 1, active: true })
    }
  }

  think(dt, ctx) {
    const b = this.body
    this.checkPhase()
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
        const atk = this.pickAttack(ctx)
        this.attack = atk
        if (atk === 'overheadSlam') this.setState('slamTele')
        else if (atk === 'sweepDash') this.setState('dashTele')
        else if (atk === 'summon') this.setState('summonTele')
        else this.setState('debrisTele')
        break
      }
      case 'slamTele':
        this.anim = 'telegraph'
        this.facePlayer(ctx)
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (this.st >= SLAM_TELE_T / this.speedMult) {
          const dx = ctx.player.x - b.x
          this.facing = dx < 0 ? -1 : 1
          b.vy = JUMP_VY
          b.vx = Math.max(-360, Math.min(360, dx / 0.7)) * this.speedMult
          this.airborne = false
          this.setState('slamJump')
        }
        break
      case 'slamJump':
        this.anim = 'jump'
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (!b.onGround) this.airborne = true
        if (this.airborne && b.onGround && this.st > 0.15) {
          b.vx = 0
          this.landSlam(ctx)
          this.setState('slamWave')
        }
        break
      case 'slamWave':
        this.anim = 'slam'
        this.applyGravity(dt)
        this.move(dt, ctx)
        this.shockBoxes(ctx)
        if (this.st >= WAVE_T) this.setState('recover')
        break
      case 'dashTele':
        this.anim = 'telegraph'
        this.facePlayer(ctx)
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (this.st >= DASH_TELE_T / this.speedMult) {
          b.vx = DASH_SPEED * this.speedMult * this.facing
          this.setState('dash')
        }
        break
      case 'dash': {
        this.anim = 'dash'
        this.applyGravity(dt)
        this.move(dt, ctx)
        this.attacks.push(Object.assign(this.hurtbox(), { dmg: 1, active: true }))
        const ar = this.arena(ctx)
        if (b.hitWall !== 0 || b.x <= ar.minX + b.w / 2 || b.x >= ar.maxX - b.w / 2) {
          b.vx = 0
          this.setState('recover')
        }
        break
      }
      case 'summonTele': {
        this.anim = 'cast'
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (this.st >= SUMMON_TELE_T) {
          if (typeof ctx.spawnMinion === 'function' && this.aliveMinions() < MAX_MINIONS) {
            const m = ctx.spawnMinion('husk', { x: b.x + this.facing * 80, y: b.y })
            if (m) this.minions.push(m)
          }
          this.setState('recover')
        }
        break
      }
      case 'debrisTele':
        this.anim = 'cast'
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (!this.debrisPlan) this.debrisPlan = this.makeDebrisPlan(ctx)
        this.telegraphs = this.debrisPlan.map(d => ({ x: d.x, y: d.y }))
        if (this.st >= DEBRIS_TELE_T) {
          this.debris = this.debrisPlan.map(d => ({ x: d.x, y: d.y, vy: -120, w: 26, h: 26 }))
          this.debrisPlan = null
          this.telegraphs = []
          this.setState('debrisFall')
        }
        break
      case 'debrisFall': {
        this.anim = 'cast'
        this.applyGravity(dt)
        this.move(dt, ctx)
        const ar2 = this.arena(ctx)
        for (const d of this.debris) {
          d.vy = Math.max(d.vy - 900 * dt, -700)
          d.y += d.vy * dt
        }
        this.debris = this.debris.filter(d => d.y > ar2.floorY - 10)
        for (const d of this.debris) {
          this.attacks.push({ x: d.x, y: d.y, w: d.w, h: d.h, dmg: 1, active: true })
        }
        if (this.debris.length === 0) this.setState('recover')
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

  staggerStep(dt, ctx) {
    this.anim = 'stagger'
    this.applyGravity(dt)
    this.move(dt, ctx)
  }

  postUpdate(dt, ctx) {
    this.aliveMinions()
  }

  onDeath() {
    const ctx = this._ctx
    if (ctx && ctx.emit) ctx.emit('boss:end', { victory: true, id: 'sacristan' })
    this.minions = []
    this.debris = []
  }
}

registerEnemy('sacristan', Sacristan)
