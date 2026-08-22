import { TILE } from '../systems/tiles.js'

let ID_COUNTER = 0

export const GRAVITY = 1500

const REGISTRY = {}

export class Enemy {
  static BASE_HP = 1
  static BODY_W = 24
  static BODY_H = 32
  static STAGGER = 0.3

  constructor(def, x, y) {
    this.type = def.type
    this.def = def
    this.elite = !!def.elite
    this.clone = !!def.clone
    this.scale = this.elite ? 1.15 : 1
    this.id = def.id || `${this.type}_${++ID_COUNTER}`
    const baseHp = def.hp != null ? def.hp : this.constructor.BASE_HP
    this.maxHp = this.elite ? Math.ceil(baseHp * 1.6) : baseHp
    this.hp = this.maxHp
    this.body = {
      x, y,
      w: this.constructor.BODY_W,
      h: this.constructor.BODY_H,
      vx: 0, vy: 0,
      onGround: false,
      hitWall: 0,
      hitCeil: false,
      dropTimer: 0
    }
    this.spawnX = x
    this.spawnY = y
    this.facing = -1
    this.state = 'idle'
    this.st = 0
    this.age = 0
    this.anim = 'idle'
    this.alpha = 1
    this.flash = 0
    this.hitstun = 0
    this.kbx = 0
    this.provoked = false
    this.touchDamage = 0
    this.vulnMult = 1
    this.attacks = []
    this.telegraphs = []
    this.projectiles = []
    this._ctx = null
  }

  get dead() { return this.hp <= 0 }

  get ctx() { return this._ctx }

  setState(s) {
    this.state = s
    this.st = 0
  }

  applyGravity(dt) {
    this.body.vy = Math.max(this.body.vy - GRAVITY * dt, -1100)
  }

  move(dt, ctx) {
    ctx.world.moveBody(this.body, dt)
  }

  distToPlayer(ctx) {
    const p = ctx.player
    return Math.hypot(p.x - this.body.x, p.y - this.body.y)
  }

  facePlayer(ctx) {
    this.facing = ctx.player.x < this.body.x ? -1 : 1
  }

  playerRect(ctx) {
    const p = ctx.player
    return { x: p.x, y: p.y, w: p.w || 24, h: p.h || 44 }
  }

  overlapsPlayer(ctx, r) {
    const p = this.playerRect(ctx)
    const a = r || this.hurtbox()
    return Math.abs(a.x - p.x) < (a.w + p.w) / 2 && Math.abs(a.y - p.y) < (a.h + p.h) / 2
  }

  groundAhead(ctx, ts) {
    const T = ts || ctx.world.ts || 32
    const b = this.body
    const footX = b.x + this.facing * (b.w / 2 + 4)
    const tx = Math.floor(footX / T)
    const probeY = b.y - b.h / 2 - 4
    let ty
    if (typeof ctx.world.rowAt === 'function') {
      ty = ctx.world.rowAt(probeY)
    } else {
      ty = Math.floor((b.y + b.h / 2 + 6) / T)
    }
    const t = ctx.world.tileAt(tx, ty)
    return t === TILE.SOLID || t === TILE.ONEWAY
  }

  hurtbox() {
    const b = this.body
    const s = this.scale
    return { x: b.x, y: b.y, w: b.w * s, h: b.h * s }
  }

  view() {
    return {
      kind: this.type,
      anim: this.anim,
      flip: this.facing < 0,
      alpha: this.alpha,
      t: this.st,
      tint: this.clone ? 'mirror' : null,
      elite: this.elite,
      flash: this.flash > 0
    }
  }

  vulnerable() { return true }

  takeHit(dmg, kbx) {
    if (this.dead || !this.vulnerable()) return false
    const applied = Math.max(1, Math.round(dmg * this.vulnMult))
    this.hp -= applied
    this.flash = 0.15
    this.provoked = true
    if (this.hp <= 0) {
      this.hp = 0
      this.onKilled()
    } else {
      this.kbx = kbx || 0
      this.onHit(this.kbx)
    }
    return true
  }

  onHit(kbx) {
    this.hitstun = Math.max(this.hitstun, this.constructor.STAGGER)
    if (kbx) this.body.vx = kbx * 160
  }

  onKilled() {
    const ctx = this._ctx
    if (ctx && typeof ctx.emit === 'function') {
      ctx.emit('enemy:killed', { type: this.type, id: this.id })
    }
    this.onDeath()
  }

  onDeath() {}

  onStaggerEnd(ctx) {}

  update(dt, ctx) {
    this._ctx = ctx
    this.age += dt
    this.st += dt
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt)
    this.attacks = []
    this.telegraphs = []
    if (this.dead) return
    if (this.hitstun > 0) {
      this.hitstun -= dt
      if (this.hitstun <= 0) {
        this.hitstun = 0
        this.vulnMult = 1
        this.onStaggerEnd(ctx)
      }
      this.staggerStep(dt, ctx)
    } else {
      this.think(dt, ctx)
    }
    this.postUpdate(dt, ctx)
  }

  think(dt, ctx) {}
  staggerStep(dt, ctx) {}
  postUpdate(dt, ctx) {}
}

export function registerEnemy(type, cls) {
  REGISTRY[type] = cls
}

export function createEnemy(type, def, x, y) {
  const cls = REGISTRY[type]
  if (!cls) throw new Error(`unknown enemy type: ${type}`)
  return new cls(Object.assign({}, def, { type }), x, y)
}
