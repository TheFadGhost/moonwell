import { Enemy, registerEnemy } from '../enemy_base.js'

const PATROL_SPEED = 60
const DETECT_R = 180
const WINDUP_T = 0.5
const LUNGE_T = 0.35
const RECOVER_T = 0.6
const LUNGE_SPEED = 420

export class Husk extends Enemy {
  static BASE_HP = 3
  static BODY_W = 26
  static BODY_H = 34
  static STAGGER = 0.35

  constructor(def, x, y) {
    super(def, x, y)
    this.touchDamage = 1
    this.setState('patrol')
    this.facing = Math.random() < 0.5 ? -1 : 1
  }

  think(dt, ctx) {
    const b = this.body
    this.applyGravity(dt)
    switch (this.state) {
      case 'patrol': {
        this.anim = 'walk'
        b.vx = this.facing * PATROL_SPEED
        this.move(dt, ctx)
        if (b.hitWall !== 0) {
          this.facing = -b.hitWall
          b.vx = this.facing * PATROL_SPEED
        } else if (b.onGround && !this.groundAhead(ctx)) {
          this.facing *= -1
          b.vx = this.facing * PATROL_SPEED
        }
        if (this.distToPlayer(ctx) < DETECT_R) {
          this.facePlayer(ctx)
          b.vx = 0
          this.setState('windup')
        }
        break
      }
      case 'windup':
        this.anim = 'windup'
        b.vx = 0
        this.move(dt, ctx)
        if (this.st >= WINDUP_T) {
          b.vx = LUNGE_SPEED * this.facing
          this.setState('lunge')
        }
        break
      case 'lunge':
        this.anim = 'lunge'
        this.move(dt, ctx)
        this.attacks.push(Object.assign(this.hurtbox(), { dmg: 1, active: true }))
        if (this.st >= LUNGE_T || b.hitWall !== 0) {
          b.vx = 0
          this.setState('recover')
        }
        break
      case 'recover':
        this.anim = 'recover'
        b.vx = 0
        this.move(dt, ctx)
        if (this.st >= RECOVER_T) this.setState('patrol')
        break
      default:
        this.setState('patrol')
    }
  }

  staggerStep(dt, ctx) {
    this.anim = 'stagger'
    this.applyGravity(dt)
    this.body.vx *= 0.85
    this.move(dt, ctx)
  }

  onStaggerEnd() {
    this.setState('patrol')
  }
}

registerEnemy('husk', Husk)
