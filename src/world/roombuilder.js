import * as THREE from 'three'
import { getTileTexture, getDecoTexture } from '../fx/textures.js'
import { createFogMaterial, createMoonShaftMaterial, createWaterSurfaceMaterial } from '../fx/shaders.js'
import { makeItemMesh, makeDoorMesh, makeCheckpointMesh } from '../fx/bodies.js'

const TS = 32

export class RoomBuilder {
  constructor(scene) {
    this.scene = scene
    this.geoPlane = new THREE.PlaneGeometry(TS, TS)
    this.disposables = []
  }

  track(obj) {
    this.disposables.push(obj)
    return obj
  }

  build(room, opts = {}) {
    const zone = room.zone || 'nave'
    const group = new THREE.Group()
    const W = room.width * TS
    const H = room.height * TS

    const counts = { solid: [], oneway: [], spike: [], deco: [], water: [] }
    for (let ty = 0; ty < room.height; ty++) {
      const row = room.rows[ty] || ''
      for (let tx = 0; tx < room.width; tx++) {
        const ch = row[tx] || '.'
        const wx = tx * TS + TS / 2
        const wy = H - (ty * TS + TS / 2)
        const cell = { wx, wy, tx, ty }
        if (ch === '#') counts.solid.push(cell)
        else if (ch === '-') counts.oneway.push(cell)
        else if (ch === '^') counts.spike.push(cell)
        else if (ch === '%') counts.deco.push(cell)
        else if (ch === '~') counts.water.push(cell)
      }
    }

    this.addInstances(group, counts.solid, () => {
      const m = new THREE.MeshStandardMaterial({ map: getTileTexture(zone, 'solid'), roughness: 0.95 })
      return this.track(m)
    }, 0xfff2e2, -0.06)

    this.addInstances(group, counts.oneway, () => {
      const m = new THREE.MeshStandardMaterial({ map: getTileTexture(zone, 'oneway'), roughness: 0.9 })
      return this.track(m)
    }, 0xd8c8a8)

    this.addInstances(group, counts.spike, () => {
      const m = new THREE.MeshStandardMaterial({ map: getTileTexture(zone, 'spike'), transparent: true, roughness: 0.7 })
      return this.track(m)
    }, 0xcfc4a8)

    this.addInstances(group, counts.deco, () => {
      const m = new THREE.MeshBasicMaterial({ map: getDecoTexture(zone), transparent: true, opacity: 0.5, color: 0x555044 })
      return this.track(m)
    }, 0x777777, 0, -10)

    const waterMat = this.track(createWaterSurfaceMaterial(0x1d4a4e))
    const waterBody = this.track(new THREE.MeshBasicMaterial({ color: 0x10282c, transparent: true, opacity: 0.45 }))
    let lastSurfaceX = null
    let runZ = -6
    for (const c of counts.water) {
      const q = new THREE.Mesh(this.geoPlane, waterBody)
      q.position.set(c.wx, c.wy, runZ)
      group.add(q)
      const above = (room.rows[c.ty - 1] || '')[c.tx] || '.'
      if (above !== '~') {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(TS, 5), waterMat)
        this.track(s.geometry === this.geoPlane ? null : s.geometry)
        s.position.set(c.wx, c.wy + TS / 2 - 3, runZ + 1)
        group.add(s)
        lastSurfaceX = c.wx
      }
    }
    void lastSurfaceX

    const bgMat = this.track(new THREE.MeshBasicMaterial({ color: ZONE_BG[zone] || 0x05060a }))
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(W + 400, H + 400), bgMat)
    bg.position.set(W / 2, H / 2, -46)
    group.add(bg)

    const fog1 = new THREE.Mesh(new THREE.PlaneGeometry(W + 200, H * 0.7), this.track(createFogMaterial(ZONE_FOG[zone] || 0x0a0f16)))
    fog1.position.set(W / 2, H * 0.42, -30)
    group.add(fog1)

    if (zone !== 'warrens') {
      const nShafts = 1 + ((room.id.length * 7) % 3)
      for (let i = 0; i < nShafts; i++) {
        const h = hashStr(room.id + '_' + i)
        const sw = 90 + (h % 120)
        const sh = H * (0.5 + ((h >> 3) % 40) / 100)
        const shaft = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), this.track(createMoonShaftMaterial(ZONE_SHAFT[zone] || 0x8aa0c0)))
        shaft.position.set((h % Math.max(1, (W - 300))) + 150, H - sh / 2 - 20, -24)
        group.add(shaft)
      }
    }

    const doors = new Map()
    for (const d of room.doors || []) {
      const m = makeDoorMesh(d.style || 'rune')
      m.position.set(d.tx * TS + TS / 2, H - (d.ty * TS + TS / 2), 0)
      group.add(m)
      doors.set(d.id, m)
    }

    const items = new Map()
    for (const it of room.items || []) {
      const m = makeItemMesh(it.kind, opts.glowSprite)
      const w = { x: it.tx * TS + TS / 2, y: H - (it.ty * TS + TS / 2) }
      m.position.set(w.x, w.y, 2)
      group.add(m)
      items.set(it.id, { mesh: m, baseY: w.y })
    }

    const checkpoints = new Map()
    for (const cp of room.checkpoints || []) {
      const m = makeCheckpointMesh(opts.glowSprite)
      const w = { x: cp.tx * TS + TS / 2, y: H - (cp.ty * TS + TS / 2) }
      m.position.set(w.x, w.y, 2)
      group.add(m)
      checkpoints.set(cp.id, m)
    }

    this.scene.add(group)
    return { group, doors, items, checkpoints }
  }

  addInstances(group, cells, matFactory, tint, yJitter = 0, z = 0) {
    if (!cells.length) return
    const geo = this.geoPlane
    const matl = matFactory()
    const inst = new THREE.InstancedMesh(geo, matl, cells.length)
    inst.frustumCulled = false
    const mtx = new THREE.Matrix4()
    const col = new THREE.Color()
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]
      mtx.makeTranslation(c.wx, c.wy - yJitter, z)
      inst.setMatrixAt(i, mtx)
      const v = 0.82 + ((i * 2654435761 >>> 28) % 24) / 100
      col.setRGB(v, v, v)
      inst.setColorAt(i, col)
    }
    inst.instanceMatrix.needsUpdate = true
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
    group.add(inst)
  }

  update(dt, time, handle, G) {
    if (!handle) return
    for (const [id, entry] of handle.items) {
      const collected = G.flags.itemsCollected.has(id)
      entry.mesh.visible = !collected
      if (!collected) {
        entry.mesh.position.y = entry.baseY + Math.sin(time * 2.1 + entry.baseY * 0.11) * 4
        if (entry.mesh.userData.halo) entry.mesh.userData.halo.material.opacity = 0.35 + Math.sin(time * 3.1) * 0.12
      }
    }
    for (const [id, doorMesh] of handle.doors) {
      const opened = G.flags.doorsOpened.has(id)
      const seal = doorMesh.userData.seal
      if (seal) {
        const target = opened ? 90 : 34
        seal.position.y += (target - seal.position.y) * Math.min(1, dt * 6)
        seal.material.emissiveIntensity += ((opened ? 0 : 0.8) - seal.material.emissiveIntensity) * Math.min(1, dt * 6)
      }
    }
    for (const [id, cpMesh] of handle.checkpoints) {
      const lit = G.flags.checkpointsActivated.has(id)
      const flame = cpMesh.userData.flame
      if (flame) {
        const target = lit ? 0.75 + Math.sin(time * 9 + id.length) * 0.15 : 0
        flame.material.opacity += (target - flame.material.opacity) * Math.min(1, dt * 5)
        flame.scale.setScalar(1 + Math.sin(time * 7.3) * 0.08)
      }
    }
  }

  dispose(handle) {
    if (!handle) return
    this.scene.remove(handle.group)
    handle.group.traverse(o => {
      if (o.isMesh && o.geometry !== this.geoPlane) o.geometry.dispose()
    })
  }
}

const ZONE_BG = {
  nave: 0x04060b,
  warrens: 0x070503,
  gallery: 0x03100f,
  sanctum: 0x030308
}
const ZONE_FOG = {
  nave: 0x0b1420,
  warrens: 0x140f07,
  gallery: 0x06181a,
  sanctum: 0x08080f
}
const ZONE_SHAFT = {
  nave: 0x93a8c8,
  gallery: 0x5fa89a,
  sanctum: 0xb8c0dd
}

function hashStr(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
