import { TILE } from '../systems/tiles.js'

const RUN_SPEED = 240
const GROUND_ACCEL = 2600
const AIR_ACCEL = 1800
const GROUND_DECEL = 2800
const AIR_DECEL = 420
const JUMP_V = 560
const DOUBLE_JUMP_V = 520
const GRAVITY_RISE_HOLD = 1050
const GRAVITY_RISE_CUT = 2300
const GRAVITY_FALL = 1500
const MAX_FALL = 900
const COYOTE_T = 0.1
const BUFFER_T = 0.14
const DASH_SPEED = 620
const DASH_T = 0.16
const DASH_CD = 0.45
const WALL_SLIDE_MAX = 90
const WALL_JUMP_VX = 380
const WALL_JUMP_VY = 560
const WALL_LOCK_T = 0.12
const ATTACK_CD = 0.38
const ATTACK_ACTIVE_T = 0.12
const OIL_DRAIN = 1.4

export class Player {
  constructor(G) {
    this.G = G
    const p = G.player
    this.p = p
    this.coyote = 0
    this.buffer = 0
    this.wallLock = 0
    this.attackT = 0
    this.stepPhase = 0
    this.wasOnGround = false
    this.prevVy = 0
    this.jumpCount = 0
    this.wallDir = 0
    this.dropTimer = 0
  }

  hasAbility(id) {
    return this.p.abilities.has(id)
  }

  hurt(dmg, fromX) {
    const p = this.p
    if (p.invuln > 0 || this.G.state !== 'playing') return false
    p.hp -= dmg
    p.invuln = 1.0
    const dir = fromX < p.x ? -1 : 1
    p.vx = dir * 260
    p.vy = -260
    p.dashing = 0
    this.G.tension = Math.min(1, this.G.tension + 0.3)
    return true
  }

  update(dt, inputApi, world, emit) {
    const p = this.p
    const G = this.G
    if (G.state !== 'playing') {
      p.vx = 0
      p.vy = Math.max(p.vy - GRAVITY_FALL * dt, -MAX_FALL)
      return
    }

    p.prevX = p.x
    p.prevY = p.y
    this.prevVy = p.vy

    if (p.invuln > 0) p.invuln -= dt
    if (p.dashCd > 0) p.dashCd -= dt
    if (this.wallLock > 0) this.wallLock -= dt
    if (this.dropTimer > 0) this.dropTimer -= dt
    if (this.attackT > 0) this.attackT -= dt
    if (p.attackCd > 0) p.attackCd -= dt

    const ax = inputApi.axis()
    const jumpPressed = inputApi.pressed('jump')
    const jumpHeld = inputApi.down('jump')
    const canDash = this.hasAbility('veil_dash')
    const canCling = this.hasAbility('claws')
    const canDouble = this.hasAbility('umbral_step')

    if (inputApi.pressed('toggleLight') && this.hasAbility('lantern')) {
      p.lanternOn = !p.lanternOn && p.oil > 0 ? true : !p.lanternOn
      if (p.oil <= 0) p.lanternOn = false
    }

    if (this.hasAbility('lantern') && p.lanternOn) {
      p.oil = Math.max(0, p.oil - OIL_DRAIN * dt)
      if (p.oil <= 0) p.lanternOn = false
    }

    if (jumpPressed) this.buffer = BUFFER_T
    else this.buffer = Math.max(0, this.buffer - dt)

    this.wallDir = 0
    if (!p.onGround) {
      if (this.touchingWall(world, -1)) this.wallDir = -1
      else if (this.touchingWall(world, 1)) this.wallDir = 1
    }

    let clinging = false
    if (canCling && !p.onGround && this.wallDir !== 0 && ax === this.wallDir && p.vy > -40 && this.wallLock <= 0) {
      clinging = true
      p.wallCling = true
    } else {
      p.wallCling = false
    }

    if (inputApi.pressed('dash') && canDash && p.dashCd <= 0 && p.dashing <= 0) {
      if (p.onGround || !p.airDashUsed) {
        p.dashing = DASH_T
        p.dashCd = DASH_CD
        if (!p.onGround) p.airDashUsed = true
        p.vy = 0
        p.vx = (ax !== 0 ? Math.sign(ax) : p.facing) * DASH_SPEED
        p.facing = Math.sign(p.vx) || p.facing
      }
    }

    if (p.dashing > 0) {
      p.dashing -= dt
      p.vy = 0
      p.vx = Math.sign(p.vx) * DASH_SPEED
      if (p.dashing <= 0) {
        p.vx = p.facing * RUN_SPEED
      }
    } else {
      if (this.wallLock <= 0) {
        if (ax !== 0) {
          const accel = p.onGround ? GROUND_ACCEL : AIR_ACCEL
          p.vx += ax * accel * dt
          p.vx = Math.max(-RUN_SPEED, Math.min(RUN_SPEED, p.vx))
          p.facing = ax > 0 ? 1 : -1
        } else {
          const decel = p.onGround ? GROUND_DECEL : AIR_DECEL
          const mag = Math.max(0, Math.abs(p.vx) - decel * dt)
          p.vx = Math.sign(p.vx) * mag
        }
      }

      if (clinging) {
        p.vy = Math.max(p.vy - GRAVITY_FALL * dt, -WALL_SLIDE_MAX)
        this.jumpCount = 0
        if (this.buffer > 0) {
          this.buffer = 0
          p.vy = -WALL_JUMP_VY
          p.vx = -this.wallDir * WALL_JUMP_VX
          p.facing = -this.wallDir
          this.wallLock = WALL_LOCK_T
          this.jumpCount = 1
          p.wallCling = false
        }
      } else {
        let gravity = GRAVITY_FALL
        if (p.vy > 0) gravity = jumpHeld ? GRAVITY_RISE_HOLD : GRAVITY_RISE_CUT
        p.vy -= gravity * dt
        if (p.vy < -MAX_FALL) p.vy = -MAX_FALL

        if (this.buffer > 0) {
          if (p.onGround || this.coyote > 0) {
            this.buffer = 0
            this.coyote = 0
            p.vy = JUMP_V
            this.jumpCount = 1
          } else if (canDouble && this.jumpCount < 2 && this.wallLock <= 0) {
            this.buffer = 0
            p.vy = DOUBLE_JUMP_V
            this.jumpCount = 2
          }
        }

        if ((inputApi.down('down')) && jumpPressed && p.onGround && this.standingOnOneway(world)) {
          this.dropTimer = 0.18
          p.onGround = false
        }
      }
    }

    world.moveBody(p, dt)

    if (p.onGround) {
      this.coyote = COYOTE_T
      this.jumpCount = 0
      p.airDashUsed = false
      if (!this.wasOnGround && this.prevVy < -300) {
        emit('player:landed', { vy: -this.prevVy })
      }
    } else {
      this.coyote = Math.max(0, this.coyote - dt)
    }

    if (inputApi.pressed('attack') && p.attackCd <= 0) {
      p.attackCd = ATTACK_CD
      this.attackT = ATTACK_ACTIVE_T
    }

    this.wasOnGround = p.onGround

    if (p.y < -200 || world.hazardHit({ x: p.x, y: p.y, w: p.w, h: p.h })) {
      this.kill(emit)
    }
  }

  attackBox() {
    if (this.attackT <= 0) return null
    const p = this.p
    return { x: p.x + p.facing * 26, y: p.y + 2, w: 36, h: 32, dmg: 1 }
  }

  touchingWall(world, dir) {
    const p = this.p
    const ts = world.ts
    const probeX = p.x + dir * (p.w / 2 + 4)
    const rTop = world.rowAt(p.y + p.h / 2 - 6)
    const rBot = world.rowAt(p.y - p.h / 2 + 6)
    for (let ty = rTop; ty <= rBot; ty++) {
      if (world.tileAt(Math.floor(probeX / ts), ty) === TILE.SOLID) return true
    }
    return false
  }

  standingOnOneway(world) {
    const p = this.p
    const ts = world.ts
    const feet = p.y - p.h / 2 - 1
    const ty = world.rowAt(feet)
    const x0 = Math.floor((p.x - p.w / 2 + 4) / ts)
    const x1 = Math.floor((p.x + p.w / 2 - 4) / ts)
    for (let tx = x0; tx <= x1; tx++) {
      if (world.tileAt(tx, ty) === TILE.ONEWAY) return true
    }
    return false
  }

  kill(emit) {
    if (this.G.state === 'dead') return
    emit('player:death', {})
  }
}
