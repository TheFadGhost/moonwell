import { describe, it, expect } from 'vitest'
import { createEnemy } from '../src/entities/enemy_base.js'
import '../src/entities/enemies/husk.js'
import '../src/entities/enemies/maw.js'
import '../src/entities/enemies/stalker.js'
import '../src/entities/enemies/bloom.js'
import '../src/entities/enemies/wisp.js'
import '../src/entities/bosses/sacristan.js'
import '../src/entities/bosses/warden.js'

const TS = 32

function makeCtx(opts = {}) {
  const events = []
  const walls = opts.walls || new Set()
  const light = opts.light != null ? opts.light : 0.2
  const groundTxMax = opts.groundTxMax != null ? opts.groundTxMax : Infinity
  const ctx = {
    events,
    G: { bossArena: Object.assign({ minX: -400, maxX: 400, floorY: 0 }, opts.arena || {}) },
    player: Object.assign({ x: 0, y: 22, w: 24, h: 44, vx: 0, vy: 0, lit: false, dashing: false }, opts.player || {}),
    lightAt: () => light,
    emit(type, payload) { events.push({ type, payload }) },
    world: {
      ts: TS,
      _wallCols: [...(opts.walls || [])].map(s => s.split(',').map(Number)),
      tileAt(tx, row) {
        if (row >= 0) return tx <= groundTxMax ? 1 : 0
        const k = -row
        for (const [wtx, wty] of this._wallCols) {
          if (wtx === tx && -wty === k) return 1
        }
        return 0
      },
      rowAt(y) {
        return Math.floor(-y / TS)
      },
      _solid(x, y) {
        if (y < 0 && Math.floor(x / TS) <= groundTxMax) return true
        for (const [tx, ty] of this._wallCols) {
          if (Math.floor(x / TS) === tx && ty < 0) {
            const k = -ty
            if (y > (k - 1) * TS && y <= k * TS) return true
          }
        }
        return false
      },
      _bandSolid(x0, x1, y) {
        for (let tx = Math.floor(x0 / TS); tx <= Math.floor(x1 / TS); tx++) {
          if (this._solid(tx * TS + TS / 2, y)) return true
        }
        return false
      },
      moveBody(b, dt) {
        b.prevX = b.x
        b.prevY = b.y
        b.hitWall = 0
        b.hitCeil = false
        const hw = b.w / 2
        const hh = b.h / 2
        b.x += b.vx * dt
        if (b.vx !== 0) {
          const dir = Math.sign(b.vx)
          const edge = b.x + dir * hw
          const yTop = b.y + hh - 2
          const yBot = b.y - hh + 2
          if (this._solid(edge, yTop) || this._solid(edge, yBot)) {
            const tx = Math.floor(edge / TS)
            b.x = dir > 0 ? tx * TS - hw - 0.001 : (tx + 1) * TS + hw + 0.001
            b.vx = 0
            b.hitWall = dir
          }
        }
        b.y += b.vy * dt
        if (b.vy < 0) {
          const edgeY = b.y - hh
          if (this._bandSolid(b.x - hw + 2, b.x + hw - 2 - 0.001, edgeY)) {
            b.y = (Math.floor(edgeY / TS) + 1) * TS + hh + 0.001
            b.vy = 0
          }
        } else if (b.vy > 0) {
          const edgeY = b.y + hh
          if (this._bandSolid(b.x - hw + 2, b.x + hw - 2 - 0.001, edgeY)) {
            b.y = Math.floor(edgeY / TS) * TS - hh - 0.001
            b.vy = 0
            b.hitCeil = true
          }
        }
        b.onGround = false
        if (b.vy <= 0 && this._bandSolid(b.x - hw + 2, b.x + hw - 2 - 0.001, b.y - hh - 1)) {
          b.onGround = true
        }
      }
    }
  }
  if (opts.snuff) ctx.snuff = opts.snuff
  if (opts.spawnMinion) ctx.spawnMinion = opts.spawnMinion
  return ctx
}

function step(e, ctx, dt, n) {
  for (let i = 0; i < n; i++) e.update(dt, ctx)
}

function stepUntil(e, ctx, dt, maxN, pred) {
  for (let i = 0; i < maxN; i++) {
    e.update(dt, ctx)
    if (pred()) return i + 1
  }
  return -1
}

describe('registry', () => {
  it('throws on unknown type', () => {
    expect(() => createEnemy('ghoul', {}, 0, 0)).toThrow(/unknown/)
  })

  it('elite raises hp 1.6x ceil and scales hurtbox', () => {
    const c = makeCtx({ player: { x: 900 } })
    const h = createEnemy('husk', { elite: true }, 40, 17)
    expect(h.maxHp).toBe(5)
    expect(h.scale).toBeCloseTo(1.15)
    expect(h.hurtbox().w).toBeCloseTo(26 * 1.15)
    step(h, c, 1 / 60, 2)
  })
})

describe('husk', () => {
  it('patrols and turns at a wall', () => {
    const c = makeCtx({ walls: new Set(['3,-1', '3,-2']), player: { x: 600 } })
    const h = createEnemy('husk', {}, 60, 17)
    h.facing = 1
    let maxX = h.body.x
    let turned = false
    for (let i = 0; i < 180; i++) {
      h.update(1 / 60, c)
      maxX = Math.max(maxX, h.body.x)
      if (i > 10 && h.facing === -1) { turned = true; break }
    }
    expect(turned).toBe(true)
    expect(maxX).toBeLessThan(96)
    expect(h.body.x).toBeLessThan(90)
  })

  it('turns at ledges', () => {
    const c = makeCtx({ groundTxMax: 5, player: { x: 600 } })
    const h = createEnemy('husk', {}, 100, 17)
    h.facing = 1
    let flipped = false
    for (let i = 0; i < 240; i++) {
      h.update(1 / 60, c)
      if (h.facing === -1) { flipped = true; break }
    }
    expect(flipped).toBe(true)
    expect(h.body.x).toBeLessThan(192)
  })

  it('detect -> windup holds 0.5s then lunges with contact attack', () => {
    const c = makeCtx({ player: { x: 140 } })
    const h = createEnemy('husk', {}, 100, 17)
    h.facing = 1
    h.update(0.05, c)
    expect(h.state).toBe('windup')
    step(h, c, 0.05, 8)
    expect(h.st).toBeGreaterThan(0.35)
    expect(h.st).toBeLessThan(0.5)
    expect(h.anim).toBe('windup')
    expect(Math.abs(h.body.vx)).toBe(0)
    const lg = stepUntil(h, c, 0.05, 4, () => h.state === 'lunge')
    expect(lg).toBeGreaterThan(0)
    expect(lg).toBeLessThanOrEqual(3)
    h.update(0.05, c)
    expect(h.anim).toBe('lunge')
    expect(h.body.vx).toBeCloseTo(420 * h.facing, 0)
    expect(h.attacks.length).toBe(1)
    expect(h.attacks[0].dmg).toBe(1)
    expect(h.attacks[0].active).toBe(true)
    expect(h.touchDamage).toBe(1)
  })

  it('stagger interrupts lunge; lethal hit emits enemy:killed and corpse ignores hits', () => {
    const c = makeCtx({ player: { x: 600 } })
    const h = createEnemy('husk', {}, 100, 17)
    h.setState('lunge')
    h.body.vx = 420
    h.takeHit(1, -1)
    expect(h.hp).toBe(2)
    expect(h.hitstun).toBeGreaterThan(0)
    h.update(0.05, c)
    expect(h.anim).toBe('stagger')
    expect(Math.abs(h.body.vx)).toBeLessThan(420)
    h.takeHit(2, 1)
    expect(h.dead).toBe(true)
    expect(c.events.some(e => e.type === 'enemy:killed' && e.payload.type === 'husk')).toBe(true)
    expect(h.takeHit(1, 1)).toBe(false)
  })
})

describe('maw', () => {
  it('immune while dormant; shimmers alpha 0.3 under bright close light', () => {
    const c = makeCtx({ light: 0.6, player: { x: 300, vx: 0 } })
    const m = createEnemy('maw', {}, 200, 15)
    expect(m.takeHit(2, 1)).toBe(false)
    expect(m.hp).toBe(m.maxHp)
    step(m, c, 0.1, 10)
    expect(m.state).toBe('dormant')
    expect(m.alpha).toBe(0.3)
  })

  it('emerges on trigger, bites 56x48, vulnerable while emerged', () => {
    const c = makeCtx({ player: { x: 230, vx: 200 } })
    const m = createEnemy('maw', {}, 200, 15)
    m.update(0.05, c)
    expect(m.state).toBe('telegraph')
    const em = stepUntil(m, c, 0.05, 15, () => m.state === 'emerged')
    expect(em).toBeGreaterThan(0)
    m.update(0.05, c)
    expect(m.state).toBe('emerged')
    expect(m.attacks.length).toBe(1)
    const a = m.attacks[0]
    expect(a.w).toBe(56)
    expect(a.h).toBe(48)
    expect(a.dmg).toBe(1)
    expect(a.active).toBe(true)
    expect(m.takeHit(2, 1)).toBe(true)
    expect(m.hp).toBe(2)
    step(m, c, 0.05, 24)
    expect(['submerge', 'dormant']).toContain(m.state)
  })

  it('fast player wakes it in moderate light; still player does not', () => {
    const bright = makeCtx({ light: 0.4, player: { x: 230, vx: 200 } })
    const m1 = createEnemy('maw', {}, 200, 15)
    m1.update(0.05, bright)
    expect(m1.state).toBe('telegraph')
    const calm = makeCtx({ light: 0.4, player: { x: 230, vx: 0 } })
    const m2 = createEnemy('maw', {}, 200, 15)
    step(m2, calm, 0.1, 12)
    expect(m2.state).toBe('dormant')
  })

  it('cooldown after cycle keeps it dormant even with trigger held', () => {
    const c = makeCtx({ light: 0.1, player: { x: 230, vx: 300 } })
    const m = createEnemy('maw', {}, 200, 15)
    const em = stepUntil(m, c, 0.05, 20, () => m.state === 'emerged')
    expect(em).toBeGreaterThan(0)
    const dm = stepUntil(m, c, 0.05, 80, () => m.state === 'dormant')
    expect(dm).toBeGreaterThan(0)
    step(m, c, 0.1, 10)
    expect(m.state).toBe('dormant')
  })
})

describe('stalker', () => {
  it('ignores unlit quiet player; aggros lit player', () => {
    const dark = makeCtx({ player: { x: 150, lit: false } })
    const s1 = createEnemy('stalker', {}, 0, 20)
    step(s1, dark, 1 / 60, 30)
    expect(s1.state).toBe('idle')
    expect(s1.body.vx).toBe(0)
    const lit = makeCtx({ player: { x: 250, lit: true } })
    const s2 = createEnemy('stalker', {}, 0, 20)
    s2.update(1 / 60, lit)
    expect(s2.state).toBe('chase')
    step(s2, lit, 1 / 60, 2)
    expect(s2.body.vx).toBeGreaterThan(0)
  })

  it('whiffed lunge staggers 0.9s and takes double damage', () => {
    const c = makeCtx({ player: { x: 150, lit: true } })
    const s = createEnemy('stalker', {}, 0, 20)
    const n = stepUntil(s, c, 1 / 60, 90, () => s.state === 'dash')
    expect(n).toBeGreaterThan(0)
    c.player.x = 800
    const m = stepUntil(s, c, 1 / 60, 40, () => s.hitstun > 0)
    expect(m).toBeGreaterThan(0)
    expect(s.vulnMult).toBe(2)
    expect(s.hitstun).toBeGreaterThan(0.8)
    s.takeHit(3, 1)
    expect(s.hp).toBe(0)
    expect(s.dead).toBe(true)
    expect(c.events.some(e => e.type === 'enemy:killed' && e.payload.type === 'stalker')).toBe(true)
  })

  it('leashes back to home when dragged beyond 560u', () => {
    const c = makeCtx({ player: { x: 150, lit: true } })
    const s = createEnemy('stalker', {}, 0, 20)
    s.provoked = true
    s.body.x = 700
    s.setState('chase')
    const r = stepUntil(s, c, 1 / 60, 120, () => s.state === 'retreat')
    expect(r).toBeGreaterThan(0)
    const a = stepUntil(s, c, 1 / 60, 900, () => s.homeDist() < 80)
    expect(a).toBeGreaterThan(0)
  })
})

describe('bloom', () => {
  it('cycles idle->swell->burst with centered 96x96 attack only during burst', () => {
    const c = makeCtx()
    const b = createEnemy('bloom', {}, 0, 15)
    step(b, c, 0.1, 24)
    expect(b.state).toBe('idle')
    expect(b.attacks.length).toBe(0)
    step(b, c, 0.1, 2)
    expect(b.state).toBe('swell')
    expect(b.anim).toBe('swell')
    expect(b.attacks.length).toBe(0)
    step(b, c, 0.1, 10)
    expect(b.state).toBe('swell')
    b.update(0.1, c)
    expect(b.state).toBe('burst')
    b.update(0.1, c)
    expect(b.anim).toBe('burst')
    expect(b.attacks.length).toBe(1)
    const a = b.attacks[0]
    expect(a.w).toBe(96)
    expect(a.h).toBe(96)
    expect(a.x).toBe(0)
    expect(a.dmg).toBe(1)
    expect(a.active).toBe(true)
    step(b, c, 0.1, 9)
    expect(b.state).toBe('burst')
    expect(b.attacks.length).toBe(1)
    step(b, c, 0.1, 3)
    expect(b.state).toBe('idle')
    expect(b.attacks.length).toBe(0)
  })

  it('is always hittable', () => {
    const c = makeCtx()
    const b = createEnemy('bloom', {}, 0, 15)
    expect(b.vulnerable()).toBe(true)
    b.update(0.01, c)
    b.takeHit(2, 1)
    expect(b.dead).toBe(true)
    expect(c.events.some(e => e.type === 'enemy:killed' && e.payload.type === 'bloom')).toBe(true)
  })
})

describe('wisp', () => {
  it('drifts toward nearby player, pulses alpha, ignores terrain, dies to hits', () => {
    const c = makeCtx({ player: { x: 320, y: 10 } })
    const w = createEnemy('wisp', {}, 280, 5)
    const x0 = w.body.x
    step(w, c, 1 / 60, 30)
    expect(w.body.x).toBeGreaterThan(x0)
    expect(w.alpha).toBeGreaterThanOrEqual(0.19)
    expect(w.alpha).toBeLessThanOrEqual(0.91)
    expect(w.touchDamage).toBe(1)
    expect(w.takeHit(2, 1)).toBe(true)
    expect(w.dead).toBe(true)
    expect(c.events.some(e => e.type === 'enemy:killed' && e.payload.type === 'wisp')).toBe(true)
  })
})

describe('sacristan', () => {
  it('phase 2 at hp<=15: 1.3x speed, debris telegraphs then falling attack boxes', () => {
    const c = makeCtx()
    const boss = createEnemy('sacristan', {}, -200, 45)
    boss.nextAttack = 'debris'
    step(boss, c, 0.1, 13)
    expect(boss.phase).toBe(1)
    const tg = stepUntil(boss, c, 0.1, 10, () => boss.telegraphs.length === 3)
    expect(tg).toBeGreaterThan(0)
    expect(boss.state).toBe('debrisTele')
    boss.takeHit(16, 1)
    expect(boss.hp).toBe(14)
    boss.update(0.01, c)
    expect(boss.phase).toBe(2)
    expect(boss.speedMult).toBeCloseTo(1.3)
    const ff = stepUntil(boss, c, 0.1, 30, () => boss.attacks.length === 3)
    expect(ff).toBeGreaterThan(0)
    expect(boss.state).toBe('debrisFall')
    expect(boss.telegraphs.length).toBe(0)
    for (const a of boss.attacks) expect(a.dmg).toBe(1)
  })

  it('overhead slam shakes screen and waves stay within 220u on the floor', () => {
    const c = makeCtx({ player: { x: -100 } })
    const boss = createEnemy('sacristan', {}, -200, 45)
    boss.nextAttack = 'overheadSlam'
    const n = stepUntil(boss, c, 0.05, 80, () => boss.state === 'slamWave')
    expect(n).toBeGreaterThan(0)
    expect(c.events.some(e => e.type === 'fx:shake')).toBe(true)
    const wv = stepUntil(boss, c, 0.05, 20, () => boss.attacks.length >= 1)
    expect(wv).toBeGreaterThan(0)
    for (const a of boss.attacks) {
      expect(a.w).toBeLessThanOrEqual(220.001)
      expect(a.h).toBe(26)
      expect(Math.abs(a.y + a.h / 2 + 1)).toBeLessThan(2)
      expect(a.dmg).toBe(1)
    }
  })

  it('sweepDash crosses arena with contact attack', () => {
    const c = makeCtx({ player: { x: -380 } })
    const boss = createEnemy('sacristan', {}, -350, 45)
    boss.nextAttack = 'sweepDash'
    const n = stepUntil(boss, c, 0.05, 80, () => boss.state === 'dash')
    expect(n).toBeGreaterThan(0)
    const done = stepUntil(boss, c, 0.05, 80, () => boss.body.vx === 0 && boss.state !== 'dash')
    expect(done).toBeGreaterThan(0)
    expect(boss.body.x).toBeLessThan(-340)
    expect(c.events.some(e => e.type === 'enemy:killed')).toBe(false)
  })

  it('caps summons at 2 alive and dies emitting boss:end', () => {
    const summoned = []
    const c = makeCtx({
      player: { x: -260 },
      spawnMinion: (type, def) => { summoned.push({ type, def }); return { dead: false } }
    })
    const boss = createEnemy('sacristan', {}, -200, 45)
    boss.nextAttack = 'summon'
    step(boss, c, 0.1, 20)
    expect(summoned.length).toBe(1)
    expect(summoned[0].type).toBe('husk')
    boss.nextAttack = 'summon'
    step(boss, c, 0.1, 20)
    expect(summoned.length).toBe(2)
    boss.minions.push({ dead: false }, { dead: false })
    boss.nextAttack = 'summon'
    step(boss, c, 0.1, 20)
    expect(summoned.length).toBe(2)
    boss.takeHit(999, 1)
    expect(boss.dead).toBe(true)
    const end = c.events.find(e => e.type === 'boss:end')
    expect(end).toBeDefined()
    expect(end.payload).toEqual({ victory: true, id: 'sacristan' })
    boss.update(0.1, c)
    expect(boss.dead).toBe(true)
  })
})

describe('warden', () => {
  it('phase thresholds 40/15, fx:dread 0.8, two mirror clones spawned once', () => {
    const c = makeCtx()
    const w = createEnemy('warden', {}, 0, 60)
    expect(w.phase).toBe(1)
    w.takeHit(21, 1)
    expect(w.hp).toBe(39)
    w.update(0.01, c)
    expect(w.phase).toBe(2)
    expect(c.events.some(e => e.type === 'fx:dread' && e.payload.amount === 0.8)).toBe(true)
    expect(w.clones.length).toBe(2)
    expect(w.clones[0].view().tint).toBe('mirror')
    expect(w.clones[0].maxHp).toBe(4)
    w.takeHit(1, 1)
    w.update(0.01, c)
    expect(w.clones.length).toBe(2)
    w.takeHit(25, 1)
    w.update(0.01, c)
    expect(w.phase).toBe(3)
  })

  it('lanternSnuff calls ctx.snuff(6) and emits warden:snuff', () => {
    const calls = []
    const c = makeCtx({ snuff: (s) => calls.push(s) })
    const w = createEnemy('warden', {}, 0, 60)
    w.nextAttack = 'lanternSnuff'
    const n = stepUntil(w, c, 0.1, 40, () => calls.length > 0)
    expect(n).toBeGreaterThan(0)
    expect(calls[0]).toBe(6)
    expect(c.events.some(e => e.type === 'warden:snuff' && e.payload.duration === 6)).toBe(true)
  })

  it('slamChain marches exactly 3 slams with screen shake each', () => {
    const c = makeCtx({ player: { x: -150 } })
    const w = createEnemy('warden', {}, 0, 60)
    w.nextAttack = 'slamChain'
    const done = stepUntil(w, c, 0.05, 240, () => c.events.filter(e => e.type === 'fx:shake').length >= 3)
    expect(done).toBeGreaterThan(0)
    const rec = stepUntil(w, c, 0.05, 40, () => w.slamsLeft === 0 && w.state === 'recover')
    expect(rec).toBeGreaterThan(0)
    expect(c.events.filter(e => e.type === 'fx:shake').length).toBe(3)
  })

  it('orbs spawn 3 homing projectiles that expire by ttl', () => {
    const c = makeCtx({ player: { x: 0, y: 300 } })
    const w = createEnemy('warden', {}, 0, 60)
    w.nextAttack = 'orbs'
    const n = stepUntil(w, c, 0.1, 30, () => w.projectiles.length === 3)
    expect(n).toBeGreaterThan(0)
    for (const o of w.projectiles) {
      expect(o.r).toBe(8)
      expect(o.dmg).toBe(1)
      expect(o.ttl).toBeGreaterThan(3.8)
    }
    w.think = () => {}
    step(w, c, 0.1, 42)
    expect(w.projectiles.length).toBe(0)
  })

  it('floorSpikes telegraph 4 columns then raise 32x72 attack boxes', () => {
    const c = makeCtx({ player: { x: 0 } })
    const w = createEnemy('warden', {}, 0, 60)
    w.nextAttack = 'floorSpikes'
    const seen = stepUntil(w, c, 0.1, 40, () => w.telegraphs.length === 4)
    expect(seen).toBeGreaterThan(0)
    const fired = stepUntil(w, c, 0.1, 20, () => w.attacks.length === 4)
    expect(fired).toBeGreaterThan(0)
    for (const a of w.attacks) {
      expect(a.w).toBe(32)
      expect(a.h).toBe(72)
      expect(a.y).toBe(36)
      expect(a.dmg).toBe(1)
    }
  })

  it('dies emitting boss:end victory for warden', () => {
    const c = makeCtx()
    const w = createEnemy('warden', {}, 0, 60)
    w.update(0.01, c)
    w.takeHit(60, 1)
    expect(w.dead).toBe(true)
    const end = c.events.find(e => e.type === 'boss:end')
    expect(end).toBeDefined()
    expect(end.payload).toEqual({ victory: true, id: 'warden' })
  })
})
