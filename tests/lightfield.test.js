import { describe, it, expect } from 'vitest'
import { LightField } from '../src/systems/lightfield.js'

describe('LightField', () => {
  it('linear falloff: full intensity at center, zero at and beyond radius', () => {
    const lf = new LightField()
    lf.addStatic('l', 0, 0, 100, 0.6)
    expect(lf.lightAt(0, 0)).toBeCloseTo(0.6)
    expect(lf.lightAt(50, 0)).toBeCloseTo(0.3)
    expect(lf.lightAt(0, 50)).toBeCloseTo(0.3)
    expect(lf.lightAt(100, 0)).toBeCloseTo(0)
    expect(lf.lightAt(120, 0)).toBe(0)
    expect(lf.lightAt(0, -120)).toBe(0)
  })

  it('sums contributions from multiple sources and clamps at 1', () => {
    const lf = new LightField()
    lf.addStatic('a', 0, 0, 100, 0.8)
    lf.addStatic('b', 10, 0, 100, 0.8)
    const midOnly = lf.lightAt(-200, 0)
    expect(midOnly).toBe(0)
    expect(lf.lightAt(0, 0)).toBe(1)
    expect(lf.lightAt(60, 0)).toBeLessThanOrEqual(1)
  })

  it('setDynamic upserts position and contributes like a static', () => {
    const lf = new LightField()
    lf.setDynamic('lantern', 0, 0, 80, 0.5)
    expect(lf.lightAt(0, 0)).toBeCloseTo(0.5)
    lf.setDynamic('lantern', 200, 0, 80, 0.5)
    expect(lf.lightAt(0, 0)).toBe(0)
    expect(lf.lightAt(200, 0)).toBeCloseTo(0.5)
    lf.setDynamic('lantern', 200, 0, 80, 1)
    expect(lf.lightAt(160, 0)).toBeCloseTo(0.5)
  })

  it('snuffAll zeroes all sources then auto-recovers after seconds', () => {
    const lf = new LightField()
    lf.addStatic('s', 0, 0, 100, 0.5)
    lf.setDynamic('d', 20, 0, 80, 0.5)
    lf.snuffAll(2)
    expect(lf.lightAt(0, 0)).toBe(0)
    lf.update(1.5)
    expect(lf.lightAt(0, 0)).toBe(0)
    lf.update(0.6)
    const expected = 0.5 + 0.5 * (1 - 20 / 80)
    expect(lf.lightAt(0, 0)).toBeCloseTo(expected)
  })

  it('update without snuff is a no-op for lighting values', () => {
    const lf = new LightField()
    lf.addStatic('s', 0, 0, 100, 0.5)
    lf.update(10)
    expect(lf.lightAt(0, 0)).toBeCloseTo(0.5)
    expect(lf.snuffed).toBe(false)
  })

  it('removeStatic removes the source', () => {
    const lf = new LightField()
    lf.addStatic('a', 0, 0, 100, 0.5)
    lf.addStatic('b', 40, 0, 100, 0.5)
    const both = lf.lightAt(0, 0)
    lf.removeStatic('a')
    expect(lf.lightAt(0, 0)).toBeCloseTo(0.5 * (1 - 40 / 100))
    expect(both).toBeGreaterThan(lf.lightAt(0, 0))
    lf.removeStatic('missing')
    expect(lf.lightAt(40, 0)).toBeCloseTo(0.5)
  })

  it('clearTemporaries removes dynamics but keeps statics', () => {
    const lf = new LightField()
    lf.addStatic('s', 0, 0, 100, 0.4)
    lf.setDynamic('d', 0, 0, 100, 0.9)
    expect(lf.lightAt(0, 0)).toBe(1)
    lf.clearTemporaries()
    expect(lf.lightAt(0, 0)).toBeCloseTo(0.4)
    lf.clearTemporaries()
    expect(lf.lightAt(0, 0)).toBeCloseTo(0.4)
  })

  it('re-adding after removal reuses the slot correctly', () => {
    const lf = new LightField()
    lf.addStatic('a', 0, 0, 100, 0.5)
    lf.removeStatic('a')
    expect(lf.lightAt(0, 0)).toBe(0)
    lf.addStatic('a', 30, 0, 100, 0.5)
    expect(lf.lightAt(0, 0)).toBeCloseTo(0.35)
    lf.setDynamic('a', 0, 0, 50, 1)
    lf.clearTemporaries()
    expect(lf.lightAt(30, 0)).toBeCloseTo(0.5)
  })
})
