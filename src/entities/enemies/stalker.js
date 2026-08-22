import { Enemy, registerEnemy } from '../enemy_base.js'

const AGGRO_R = 320
const DEAGGRO_R = 384
const LEASH_R = 560
const RETURN_R = 80
const LUNGE_CD = 1.6
const LUNGE_TRIGGER_R = 200
const TELEGRAPH_T = 0.4
const DASH_T = 0.3
const DASH_SPEED = 520
const HOP_VY = 380
const WHIFF_STAGGER = 0.9

export class Stalker extends Enemy {
  static BASE_HP = 6
  static BODY_W = 30
  static BODY_H = 40
  static STAGGER = 0.35

  constructor(def, x, y) {
    super(def, x, y)
    this.homeX = x
    this.homeY = y
    this.lungeCd = 0
    this.dashHit = false
    this.touchDamage = 1
    this.setState('idle')
  }

  aggro(ctx) {
    if (this.provoked) return true
    const p = ctx.player
    if (!(p.lit === true || p.dashing === true)) return false
    return this.distToPlayer(ctx) < AGGRO_R
  }

  homeDist() {
    const b = this.body
    return Math.hypot(b.x - this.homeX, b.y - this.homeY)
  }

  think(dt, ctx) {
    const b = this.body
    const p = ctx.player
    if (this.lungeCd > 0) this.lungeCd -= dt
    switch (this.state) {
      case 'idle':
        this.anim = 'idle'
        b.vx = 0
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (this.aggro(ctx)) this.setState('chase')
        break
      case 'chase': {
        this.anim = 'run'
        const light = typeof ctx.lightAt === 'function' ? ctx.lightAt(p.x, p.y) : 1
        const speed = 120 + 260 * (1 - light)
        this.facing = p.x < b.x ? -1 : 1
        b.vx = this.facing * speed
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (b.hitWall !== 0 && b.onGround) b.vy = HOP_VY
        if (!this.provoked && this.distToPlayer(ctx) > DEAGGRO_R) {
          b.vx = 0
          this.setState('idle')
          break
        }
        if (this.homeDist() > LEASH_R) {
          b.vx = 0
          this.setState('retreat')
          break
        }
        if (this.distToPlayer(ctx) < LUNGE_TRIGGER_R && this.lungeCd <= 0) {
          this.lungeCd = LUNGE_CD
          this.facePlayer(ctx)
          b.vx = 0
          this.setState('lungeTele')
        }
        break
      }
      case 'retreat': {
        this.anim = 'run'
        this.facing = this.homeX < b.x ? -1 : 1
        b.vx = this.facing * 140
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (b.hitWall !== 0 && b.onGround) b.vy = HOP_VY
        if (this.homeDist() < RETURN_R) {
          this.provoked = false
          b.vx = 0
          this.setState('idle')
        }
        break
      }
      case 'lungeTele':
        this.anim = 'telegraph'
        b.vx = 0
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (this.st >= TELEGRAPH_T) {
          b.vx = DASH_SPEED * this.facing
          this.dashHit = false
          this.setState('dash')
        }
        break
      case 'dash':
        this.anim = 'dash'
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (this.overlapsPlayer(ctx)) this.dashHit = true
        if (this.st >= DASH_T || b.hitWall !== 0) {
          b.vx = 0
          if (!this.dashHit) {
            this.vulnMult = 2
            this.hitstun = WHIFF_STAGGER
            this.anim = 'stagger'
          } else {
            this.setState('recover')
          }
        }
        break
      case 'recover':
        this.anim = 'recover'
        b.vx = 0
        this.applyGravity(dt)
        this.move(dt, ctx)
        if (this.st >= 0.5) this.setState(this.aggro(ctx) ? 'chase' : 'idle')
        break
      default:
        this.setState('idle')
    }
  }

  staggerStep(dt, ctx) {
    this.anim = 'stagger'
    this.applyGravity(dt)
    this.body.vx *= 0.85
    this.move(dt, ctx)
  }

  onStaggerEnd() {
    this.setState('recover')
  }
}

registerEnemy('stalker', Stalker)
