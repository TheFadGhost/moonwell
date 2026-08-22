import { describe, it, expect } from 'vitest'
import { PhysicsWorld } from '../src/systems/physics.js'
import { TILE } from '../src/systems/tiles.js'

const TS = 32

function makeRoom(rows) {
  return { id: 'test', zone: 'nave', width: rows[0].length, height: rows.length, rows }
}

function body(x, y, w = 20, h = 36) {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, prevX: x, prevY: y, dropTimer: 0 }
}

describe('physics collision edge cases', () => {
  const GRAV = 1500

  function fallStep(b) {
    b.vy = Math.max(b.vy - (GRAV / 60), -900)
    return b.vy
  }

  it('lands flush on solid floor', () => {
    const rows = [
      '................',
      '................',
      '################'
    ]
    const world = new PhysicsWorld(TS)
    world.loadRoom(makeRoom(rows))
    const b = body(5 * TS, TS)
    b.vy = -500
    for (let i = 0; i < 120; i++) {
      fallStep(b)
      world.moveBody(b, 1 / 60)
    }
    const floorTopWorldY = (3 - 2) * TS
    expect(Math.abs((b.y - b.h / 2) - floorTopWorldY)).toBeLessThan(1.5)
    expect(b.onGround).toBe(true)
  })

  it('does not tunnel through single-tile floor at terminal velocity', () => {
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '#.........',
      '#.........'
    ]
    const world = new PhysicsWorld(TS)
    world.loadRoom(makeRoom(rows))
    const b = body(16, 10 * TS, 20, 36)
    b.vy = -900
    let landed = false
    let minFeet = Infinity
    for (let i = 0; i < 240 && !landed; i++) {
      b.vy = Math.max(b.vy - 1500 / 60, -900)
      world.moveBody(b, 1 / 60)
      minFeet = Math.min(minFeet, b.y - b.h / 2)
      landed = b.onGround
    }
    expect(landed).toBe(true)
    const floorTopWorldY = (13 - 11) * TS + TS * 0
    expect(Math.abs((b.y - b.h / 2) - floorTopWorldY)).toBeLessThan(1.5)
    expect(minFeet).toBeGreaterThanOrEqual(floorTopWorldY - 1.5)
  })

  it('slides along ground and stops flush at a wall', () => {
    const rows = [
      '#############',
      '.............',
      '.............',
      '#############'
    ]
    const world = new PhysicsWorld(TS)
    world.loadRoom(makeRoom(rows))
    const b = body(2 * TS, (4 - 1) * TS + TS + 18, 20, 36)
    b.vx = 240
    for (let i = 0; i < 120; i++) {
      world.moveBody(b, 1 / 60)
      b.vx = 240
      if (b.hitWall !== 0) break
    }
    expect(b.onGround).toBe(true)
    expect(b.x).toBeLessThan(12 * TS)
    expect(b.y - b.h / 2).toBeGreaterThan((4 - 3) * TS - 2)
  })

  it('one-way platforms catch from above only', () => {
    const rows = [
      '......',
      '......',
      '------',
      '......',
      '......',
      '######'
    ]
    const world = new PhysicsWorld(TS)
    world.loadRoom(makeRoom(rows))
    const platformTopWorldY = (6 - 2) * TS
    const b = body(3 * TS, platformTopWorldY + 40, 20, 30)
    b.vy = -300
    for (let i = 0; i < 90; i++) {
      fallStep(b)
      world.moveBody(b, 1 / 60)
    }
    expect(b.onGround).toBe(true)
    expect(Math.abs(b.y - b.h / 2 - platformTopWorldY)).toBeLessThan(2)

    const jumper = body(3 * TS, platformTopWorldY + 20, 20, 30)
    jumper.vy = 400
    for (let i = 0; i < 30; i++) {
      jumper.vy -= 1500 / 60
      world.moveBody(jumper, 1 / 60)
    }
    expect(jumper.y).toBeGreaterThan(platformTopWorldY + 10)
  })

  it('drops through one-way with dropTimer', () => {
    const rows = [
      '......',
      '......',
      '------',
      '......',
      '......',
      '######'
    ]
    const world = new PhysicsWorld(TS)
    world.loadRoom(makeRoom(rows))
    const platformTopWorldY = (6 - 2) * TS
    const b = body(3 * TS, platformTopWorldY + 16, 20, 30)
    b.vy = -50
    b.dropTimer = 0.18
    for (let i = 0; i < 40; i++) {
      if (b.dropTimer > 0) b.dropTimer -= 1 / 60
      fallStep(b)
      world.moveBody(b, 1 / 60)
    }
    expect(b.y + b.h / 2).toBeLessThan(platformTopWorldY + 5)
    expect(b.onGround || b.y - b.h / 2 < platformTopWorldY).toBe(true)
  })

  it('spike hitbox is forgiving at graze, lethal on overlap', () => {
    const rows = [
      '........',
      '..^^^...',
      '########'
    ]
    const world = new PhysicsWorld(TS)
    world.loadRoom(makeRoom(rows))
    const spikeTileLeft = 2 * TS
    const spikeTileTop = (3 - 1) * TS
    const spikeCenterX = spikeTileLeft + TS / 2

    const grazeCorner = body(spikeCenterX, spikeTileTop + 20, 20, 36)
    expect(world.hazardHit(grazeCorner)).toBeNull()

    const grazeSide = body(spikeTileLeft - 8, spikeTileTop - 10, 20, 36)
    expect(world.hazardHit(grazeSide)).toBeNull()

    const diver = body(spikeCenterX, spikeTileTop - TS / 2, 20, 36)
    expect(world.hazardHit(diver)).toBe('spike')
  })

  it('treats out-of-bounds as solid', () => {
    const rows = ['....', '....']
    const world = new PhysicsWorld(TS)
    world.loadRoom(makeRoom(rows))
    expect(world.tileAt(-1, 0)).toBe(TILE.SOLID)
    expect(world.tileAt(0, -1)).toBe(TILE.SOLID)
    expect(world.tileAt(99, 0)).toBe(TILE.SOLID)
    expect(world.tileAt(0, 99)).toBe(TILE.SOLID)
    expect(world.tileAt(1, 1)).toBe(TILE.EMPTY)
  })
})
