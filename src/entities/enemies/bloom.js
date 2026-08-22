import { Enemy, registerEnemy } from '../enemy_base.js'

const IDLE_T = 2.5
const SWELL_T = 1.2
const BURST_T = 1.2
const BURST_SIZE = 96

export class Bloom extends Enemy {
  static BASE_HP = 2
  static BODY_W = 30
  static BODY_H = 30
  static STAGGER = 0

  constructor(def, x, y) {
    super(def, x, y)
    this.anchorX = x
    this.anchorY = y
    this.touchDamage = 0
    this.setState('idle')
  }

  onHit() {
    this.flash = 0.15
  }

  think(dt, ctx) {
    const b = this.body
    b.vx = 0
    switch (this.state) {
      case 'swell':
        this.anim = 'swell'
        if (this.st >= SWELL_T) this.setState('burst')
        break
      case 'burst':
        this.anim = 'burst'
        this.attacks.push({ x: b.x, y: b.y, w: BURST_SIZE, h: BURST_SIZE, dmg: 1, active: true })
        if (this.st >= BURST_T) this.setState('idle')
        break
      case 'idle':
      default:
        this.anim = 'idle'
        if (this.state !== 'idle') this.setState('idle')
        else if (this.st >= IDLE_T) this.setState('swell')
        break
    }
  }
}

registerEnemy('bloom', Bloom)
