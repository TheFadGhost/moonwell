import { Enemy, registerEnemy } from '../enemy_base.js'

const CHASE_R = 200
const CHASE_SPEED = 40
const WANDER_RX = 46
const WANDER_RY = 12

export class Wisp extends Enemy {
  static BASE_HP = 2
  static BODY_W = 22
  static BODY_H = 22
  static STAGGER = 0

  constructor(def, x, y) {
    super(def, x, y)
    this.anchorX = x
    this.anchorY = y
    this.phase = Math.random() * Math.PI * 2
    this.driftVx = 0
    this.touchDamage = 1
    this.setState('drift')
  }

  onHit(kbx) {
    this.flash = 0.15
    this.driftVx = (kbx || 0) * 90
  }

  think(dt, ctx) {
    const b = this.body
    const p = ctx.player
    this.anim = 'float'
    this.driftVx *= Math.max(0, 1 - dt * 6)
    b.x += this.driftVx * dt
    const dx = p.x - b.x
    const dy = p.y - b.y
    if (Math.hypot(dx, dy) < CHASE_R) {
      this.facing = dx < 0 ? -1 : 1
      b.x += Math.sign(dx) * CHASE_SPEED * dt
      b.y += Math.sign(dy) * CHASE_SPEED * 0.4 * dt
    } else {
      const t = this.age + this.phase
      const tx = this.anchorX + Math.sin(t * 0.8) * WANDER_RX
      const ty = this.anchorY + Math.sin(t * 1.7) * WANDER_RY
      b.x += (tx - b.x) * Math.min(1, dt * 2)
      b.y += (ty - b.y) * Math.min(1, dt * 2)
    }
    b.y += Math.sin(this.age * 2.4) * 8 * dt
    this.alpha = 0.55 + 0.35 * Math.sin(this.age * 3.1)
  }
}

registerEnemy('wisp', Wisp)
