import { Enemy, registerEnemy } from '../enemy_base.js'

const TELEGRAPH_T = 0.45
const EMERGED_T = 1.1
const SUBMERGE_T = 0.5
const COOLDOWN_T = 2.2
const TRIGGER_R = 90
const SHIMMER_R = 140
const BITE_W = 56
const BITE_H = 48

export class Maw extends Enemy {
  static BASE_HP = 4
  static BODY_W = 36
  static BODY_H = 30
  static STAGGER = 0.3

  constructor(def, x, y) {
    super(def, x, y)
    this.cooldown = 0
    this.touchDamage = 0
    this.setState('dormant')
  }

  vulnerable() {
    return this.state === 'emerged' || this.state === 'telegraph'
  }

  think(dt, ctx) {
    const b = this.body
    b.vx = 0
    const p = ctx.player
    const dist = this.distToPlayer(ctx)
    const light = typeof ctx.lightAt === 'function' ? ctx.lightAt(b.x, b.y) : 1
    switch (this.state) {
      case 'dormant': {
        this.anim = 'dormant'
        this.alpha = light >= 0.5 && dist < SHIMMER_R ? 0.3 : 0.05
        if (this.cooldown > 0) {
          this.cooldown -= dt
          break
        }
        if (dist < TRIGGER_R && (light < 0.25 || Math.abs(p.vx) > 140)) {
          this.facePlayer(ctx)
          this.setState('telegraph')
        }
        break
      }
      case 'telegraph':
        this.anim = 'telegraph'
        this.alpha = Math.min(1, 0.3 + this.st / TELEGRAPH_T * 0.7)
        if (this.st >= TELEGRAPH_T) this.setState('emerged')
        break
      case 'emerged':
        this.anim = 'bite'
        this.alpha = 1
        this.attacks.push({
          x: b.x + this.facing * (BITE_W / 2 + 12),
          y: b.y - 26,
          w: BITE_W,
          h: BITE_H,
          dmg: 1,
          active: true
        })
        if (this.st >= EMERGED_T) this.setState('submerge')
        break
      case 'submerge':
        this.anim = 'submerge'
        this.alpha = Math.max(0.05, 1 - this.st / SUBMERGE_T)
        if (this.st >= SUBMERGE_T) {
          this.cooldown = COOLDOWN_T
          this.setState('dormant')
        }
        break
      default:
        this.setState('dormant')
    }
  }

  staggerStep() {
    this.anim = 'stagger'
    this.alpha = 1
  }

  onStaggerEnd() {
    if (this.state === 'emerged' || this.state === 'telegraph') {
      this.setState('submerge')
    } else {
      this.setState('dormant')
    }
  }
}

registerEnemy('maw', Maw)
