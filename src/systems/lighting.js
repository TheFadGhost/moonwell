import * as THREE from 'three'
import { G } from '../core/state.js'
import { getSprite } from '../fx/textures.js'

const TILE = 32
const MAX_POINT_LIGHTS = 8
const POOL_SIZE = MAX_POINT_LIGHTS - 1
const LANTERN_DISTANCE = 260
const LANTERN_INTENSITY = 4.6
const STATIC_INTENSITY = 3.4

const ZONES = {
  nave: { sky: 0x0a1420, ground: 0x04080e, hemi: 0.18 },
  warrens: { sky: 0x141008, ground: 0x090703, hemi: 0.22 },
  gallery: { sky: 0x061416, ground: 0x02090a, hemi: 0.2 },
  sanctus: { sky: 0x0a0a12, ground: 0x040407, hemi: 0.12 }
}
ZONES.sanctum = ZONES.sanctus

function hashId(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h >>> 0
}

export class Lighting {
  constructor(scene, lightfield) {
    this.scene = scene
    this.lightfield = lightfield
    this.time = 0
    this.snuffVis = 1
    this.zone = 'nave'

    this.hemi = new THREE.HemisphereLight(ZONES.nave.sky, ZONES.nave.ground, ZONES.nave.hemi)
    scene.add(this.hemi)

    this.quadGeo = new THREE.PlaneGeometry(1, 1)

    this.roomGroup = new THREE.Group()
    scene.add(this.roomGroup)

    this.statics = []

    this.pool = []
    for (let k = 0; k < POOL_SIZE; k++) {
      const pl = new THREE.PointLight(0xffffff, 0, 300, 2)
      pl.visible = false
      scene.add(pl)
      this.pool.push({ light: pl, entry: null })
    }

    this.lanternLight = new THREE.PointLight(0xffdca8, 0, LANTERN_DISTANCE, 2)
    this.lanternLight.castShadow = true
    this.lanternLight.shadow.mapSize.set(512, 512)
    this.lanternLight.shadow.camera.near = 10
    this.lanternLight.shadow.camera.far = LANTERN_DISTANCE + 20
    this.lanternLight.shadow.bias = -0.004
    this.lanternLight.visible = false
    scene.add(this.lanternLight)
    this.lanternAttached = false

    this.selScore = new Float64Array(POOL_SIZE)
    this.selEntry = new Array(POOL_SIZE).fill(null)
  }

  setRoom(roomDef) {
    this.clearRoom()
    const zoneKey = roomDef && roomDef.zone && ZONES[roomDef.zone] ? roomDef.zone : 'nave'
    this.zone = zoneKey
    const z = ZONES[zoneKey]
    this.hemi.color.setHex(z.sky)
    this.hemi.groundColor.setHex(z.ground)
    this.hemi.intensity = z.hemi

    const lights = (roomDef && roomDef.lights) || []
    const rid = (roomDef && roomDef.id) || 'room'
    const roomH = ((roomDef && roomDef.height) || 0) * TILE
    for (let n = 0; n < lights.length; n++) {
      const L = lights[n]
      const id = rid + '_l' + n
      const wx = L.tx * TILE + TILE / 2
      const wy = roomH > 0 ? roomH - (L.ty * TILE + TILE / 2) : L.ty * TILE + TILE / 2
      const r = L.r || 120
      const i = L.i == null ? 0.8 : L.i
      this.lightfield.addStatic(id, wx, wy, r, i)

      const h = hashId(id)
      const style = h % 2
      const colorHex = style === 0 ? 0x8affce : 0xffb347
      const mat = new THREE.MeshBasicMaterial({
        map: getSprite('glow'),
        color: colorHex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0
      })
      const group = new THREE.Group()
      group.position.set(wx, wy, 6)
      const s = Math.min(28 + i * 22, 68)
      const main = new THREE.Mesh(this.quadGeo, mat)
      main.scale.set(s, s, 1)
      group.add(main)
      if (style === 0) {
        const a = new THREE.Mesh(this.quadGeo, mat)
        a.scale.set(s * 0.42, s * 0.42, 1)
        a.position.set(s * 0.5, -s * 0.28, 1)
        group.add(a)
        const b = new THREE.Mesh(this.quadGeo, mat)
        b.scale.set(s * 0.34, s * 0.34, 1)
        b.position.set(-s * 0.46, s * 0.24, 1)
        group.add(b)
      }
      this.roomGroup.add(group)

      this.statics.push({
        id,
        x: wx,
        y: wy,
        r,
        i,
        colorHex,
        mat,
        group,
        baseOpacity: Math.min(0.45 + i * 0.3, 0.9),
        phase: ((h % 628) | 0) / 100,
        speed: 1.6 + ((h >> 3) % 17) * 0.11
      })
    }
  }

  clearRoom() {
    for (let n = 0; n < this.statics.length; n++) {
      const e = this.statics[n]
      this.lightfield.removeStatic(e.id)
      e.mat.dispose()
    }
    this.statics.length = 0
    for (let c = this.roomGroup.children.length - 1; c >= 0; c--) {
      this.roomGroup.remove(this.roomGroup.children[c])
    }
    for (let k = 0; k < this.pool.length; k++) {
      this.pool[k].light.visible = false
      this.pool[k].light.intensity = 0
      this.pool[k].entry = null
    }
  }

  attachLantern(playerX, playerY) {
    this.lanternAttached = true
    this.lanternLight.position.set(playerX, playerY, 40)
    this.lanternLight.visible = true
    this.lightfield.setDynamic('lantern', playerX, playerY, LANTERN_DISTANCE, 1)
  }

  snuffAll(seconds) {
    this.lightfield.snuffAll(seconds)
  }

  update(dt, player, zone) {
    this.time += dt
    const p = player || G.player

    if (zone && ZONES[zone]) {
      if (zone !== this.zone || this.hemi.intensity !== ZONES[zone].hemi) {
        this.zone = zone
        const z = ZONES[zone]
        this.hemi.color.setHex(z.sky)
        this.hemi.groundColor.setHex(z.ground)
      }
    }

    const snuffed = this.lightfield.snuffed
    const target = snuffed ? 0 : 1
    const rate = snuffed ? 9 : 2.4
    this.snuffVis += (target - this.snuffVis) * Math.min(1, dt * rate)
    if (Math.abs(target - this.snuffVis) < 0.002) this.snuffVis = target
    const sv = this.snuffVis

    const lit = !!(p.oil > 0 && p.lanternOn)
    if (this.lanternAttached) {
      this.lightfield.setDynamic('lantern', p.x, p.y, LANTERN_DISTANCE, lit ? 1 : 0)
      const t = this.time
      const fl = 0.88 + 0.07 * Math.sin(t * 7.3) + 0.04 * Math.sin(t * 13.7 + 1.7) + 0.03 * Math.sin(t * 23.1 + 4.2)
      this.lanternLight.position.set(p.x, p.y, 40)
      this.lanternLight.intensity = lit ? LANTERN_INTENSITY * fl * sv : 0
      this.lanternLight.visible = lit && sv > 0.01
    }

    const zh = ZONES[this.zone]
    this.hemi.intensity = zh.hemi * (0.3 + 0.7 * sv)

    for (let n = 0; n < this.statics.length; n++) {
      const e = this.statics[n]
      const pulse = 0.85 + 0.15 * Math.sin(this.time * e.speed + e.phase)
      e.mat.opacity = e.baseOpacity * pulse * sv
      e.group.visible = sv > 0.01
    }

    const px = p.x
    const py = p.y
    const nSlots = POOL_SIZE
    for (let k = 0; k < nSlots; k++) {
      this.selScore[k] = -1
      this.selEntry[k] = null
    }
    for (let n = 0; n < this.statics.length; n++) {
      const e = this.statics[n]
      const dx = e.x - px
      const dy = e.y - py
      const reach = e.r * 3 + 160
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d >= reach) continue
      const score = e.i * (1 - d / reach)
      if (score <= 0) continue
      let slot = -1
      for (let k = 0; k < nSlots; k++) {
        if (this.selEntry[k] === null || score > this.selScore[k]) {
          slot = k
          break
        }
      }
      if (slot >= 0) {
        for (let k = nSlots - 1; k > slot; k--) {
          this.selScore[k] = this.selScore[k - 1]
          this.selEntry[k] = this.selEntry[k - 1]
        }
        this.selScore[slot] = score
        this.selEntry[slot] = e
      }
    }

    const t = this.time
    for (let k = 0; k < this.pool.length; k++) {
      const s = this.pool[k]
      const e = this.selEntry[k]
      if (!e || sv <= 0.004) {
        s.light.visible = false
        s.light.intensity = 0
        s.entry = null
        continue
      }
      if (s.entry !== e) {
        s.entry = e
        s.light.color.setHex(e.colorHex)
        s.light.distance = e.r * 1.05
      }
      s.light.visible = true
      const fl = 0.86 + 0.09 * Math.sin(t * e.speed + e.phase) + 0.05 * Math.sin(t * e.speed * 2.7 + e.phase * 1.3)
      s.light.position.set(e.x, e.y, 44)
      s.light.intensity = e.i * STATIC_INTENSITY * fl * sv
    }
  }

  dispose() {
    this.clearRoom()
    this.scene.remove(this.roomGroup)
    this.scene.remove(this.hemi)
    this.scene.remove(this.lanternLight)
    for (let k = 0; k < this.pool.length; k++) {
      this.scene.remove(this.pool[k].light)
      this.pool[k].light.dispose()
    }
    this.lanternLight.dispose()
    this.hemi.dispose()
    this.quadGeo.dispose()
    this.statics = []
    this.pool = []
  }
}
