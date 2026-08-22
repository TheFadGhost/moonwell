import * as THREE from 'three'
import { mulberry32 } from '../core/rng.js'
import { getSpriteAtlas, SPRITE_FRAMES } from './textures.js'

const MAX = 2000

const PRESETS = {
  dust: { frame: SPRITE_FRAMES.dust, pushX: 3, pushY: 1, grav: 0, drag: 0.5, life: [3, 5.5], size: [2, 5], speed: [2, 9], color: 0xcdd6e4, alpha: 0.32, shrink: 0, count: 10, ambientRate: 3 },
  spore: { frame: SPRITE_FRAMES.spore, pushX: 1, pushY: 5, grav: 1.5, drag: 0.4, life: [3, 6], size: [2, 4], speed: [2, 10], color: 0x9fe8c0, alpha: 0.5, shrink: 0, count: 8, ambientRate: 2 },
  ember: { frame: SPRITE_FRAMES.ember, pushX: 0, pushY: 22, grav: -14, drag: 0.9, life: [0.5, 1.3], size: [2, 5], speed: [16, 55], color: 0xffa040, alpha: 0.95, shrink: 1, count: 14, ambientRate: 0 },
  mote: { frame: SPRITE_FRAMES.mote, pushX: 0, pushY: 0, grav: -240, drag: 0.15, life: [0.45, 0.9], size: [2, 4], speed: [30, 120], color: 0xb02230, alpha: 0.95, shrink: 1, count: 12, ambientRate: 0 },
  splash: { frame: SPRITE_FRAMES.splash, pushX: 0, pushY: 34, grav: -330, drag: 0.1, life: [0.35, 0.7], size: [3, 6], speed: [50, 150], color: 0xaadcec, alpha: 0.85, shrink: 1, count: 10, ambientRate: 0 },
  glow: { frame: SPRITE_FRAMES.glow, pushX: 0, pushY: 0, grav: 0, drag: 2, life: [0.25, 0.6], size: [10, 24], speed: [0, 12], color: 0xfff2d0, alpha: 1, shrink: 1, count: 6, ambientRate: 0 }
}

const POINT_VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
attribute float aFrame;
varying vec3 vColor;
varying float vAlpha;
varying float vFrame;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vFrame = aFrame;
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const POINT_FRAG = `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
varying float vFrame;
void main() {
  if (vAlpha <= 0.004) discard;
  float col = mod(vFrame, 3.0);
  float row = floor(vFrame / 3.0);
  vec2 uv = (vec2(col, row) + vec2(0.04) + gl_PointCoord * 0.92) / vec2(3.0, 2.0);
  vec4 tex = texture2D(uMap, uv);
  gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
}
`

export class Particles {
  constructor(scene) {
    this.scene = scene
    this.rnd = mulberry32(0xbeef01)
    this.cursor = 0
    this.liveCount = 0

    this.pos = new Float32Array(MAX * 3)
    this.col = new Float32Array(MAX * 3)
    this.sizeA = new Float32Array(MAX)
    this.alphaA = new Float32Array(MAX)
    this.frameA = new Float32Array(MAX)
    this.vel = new Float32Array(MAX * 2)
    this.life = new Float32Array(MAX)
    this.maxLife = new Float32Array(MAX)
    this.size0 = new Float32Array(MAX)
    this.alpha0 = new Float32Array(MAX)
    this.grav = new Float32Array(MAX)
    this.drag = new Float32Array(MAX)
    this.mode = new Uint8Array(MAX)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizeA, 1))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphaA, 1))
    geo.setAttribute('aFrame', new THREE.BufferAttribute(this.frameA, 1))

    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: getSpriteAtlas() } },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    this.points = new THREE.Points(geo, this.material)
    this.points.frustumCulled = false
    scene.add(this.points)

    this.ambient = []
  }

  _write(i, preset, x, y, ang, spd, life, size, alphaMul, colorHex) {
    const wasDead = this.life[i] <= 0
    const j = i * 2
    const k = i * 3
    this.pos[k] = x
    this.pos[k + 1] = y
    this.pos[k + 2] = 0
    this.vel[j] = Math.cos(ang) * spd + preset.pushX
    this.vel[j + 1] = Math.sin(ang) * spd + preset.pushY
    this.life[i] = life
    this.maxLife[i] = life
    this.size0[i] = size
    this.alpha0[i] = preset.alpha * alphaMul
    this.grav[i] = preset.grav
    this.drag[i] = preset.drag
    this.mode[i] = preset.shrink
    this.frameA[i] = preset.frame
    this.sizeA[i] = size
    this.alphaA[i] = this.alpha0[i]
    let c = colorHex == null ? preset.color : colorHex
    if (Array.isArray(c)) c = c[(this.rnd() * c.length) | 0]
    this.col[k] = ((c >> 16) & 255) / 255
    this.col[k + 1] = ((c >> 8) & 255) / 255
    this.col[k + 2] = (c & 255) / 255
    if (wasDead) this.liveCount++
  }

  emitBurst(name, x, y, opts = {}) {
    const p = PRESETS[name] || PRESETS.dust
    const count = opts.count == null ? p.count : opts.count
    const sMul = opts.speed == null ? 1 : opts.speed
    const lMul = opts.life == null ? 1 : opts.life
    const szMul = opts.size == null ? 1 : opts.size
    const baseAng = opts.angle || 0
    const arc = opts.arc == null ? Math.PI * 2 : opts.arc
    const full = arc >= Math.PI * 2
    for (let n = 0; n < count; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % MAX
      const ang = baseAng + (full ? this.rnd() * Math.PI * 2 : (this.rnd() - 0.5) * arc)
      const spd = (p.speed[0] + this.rnd() * (p.speed[1] - p.speed[0])) * sMul
      const life = (p.life[0] + this.rnd() * (p.life[1] - p.life[0])) * lMul
      const size = (p.size[0] + this.rnd() * (p.size[1] - p.size[0])) * szMul
      this._write(i, p, x, y, ang, spd, life, size, 1, opts.color)
    }
  }

  attachAmbient(name, rect) {
    const p = PRESETS[name] || PRESETS.dust
    this.ambient.push({
      preset: p,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      rate: p.ambientRate,
      acc: 0
    })
  }

  clearAmbient() {
    this.ambient.length = 0
  }

  update(dt) {
    const rnd = this.rnd
    const ambients = this.ambient
    for (let a = 0; a < ambients.length; a++) {
      const em = ambients[a]
      em.acc += em.rate * dt
      const p = em.preset
      while (em.acc >= 1) {
        em.acc -= 1
        const i = this.cursor
        this.cursor = (this.cursor + 1) % MAX
        const x = em.x + rnd() * em.w
        const y = em.y + rnd() * em.h
        const life = p.life[0] + rnd() * (p.life[1] - p.life[0])
        const size = p.size[0] + rnd() * (p.size[1] - p.size[0])
        this._write(i, p, x, y, rnd() * Math.PI * 2, p.speed[0] * 0.4 + rnd() * p.speed[0], life, size, 0.8, null)
      }
    }

    if (this.liveCount > 0) {
      const pos = this.pos
      const vel = this.vel
      let live = 0
      for (let i = 0; i < MAX; i++) {
        if (this.life[i] <= 0) continue
        this.life[i] -= dt
        if (this.life[i] <= 0) {
          this.alphaA[i] = 0
          this.sizeA[i] = 0
          continue
        }
        live++
        const j = i * 2
        const k = i * 3
        vel[j + 1] += this.grav[i] * dt
        const dr = 1 / (1 + this.drag[i] * dt)
        vel[j] *= dr
        vel[j + 1] *= dr
        pos[k] += vel[j] * dt
        pos[k + 1] += vel[j + 1] * dt
        const t = this.life[i] / this.maxLife[i]
        const age = 1 - t
        const fadeIn = age < 0.125 ? age * 8 : 1
        this.alphaA[i] = this.alpha0[i] * fadeIn * (this.mode[i] ? t : t * t)
        this.sizeA[i] = this.mode[i] ? this.size0[i] * (0.35 + 0.65 * t) : this.size0[i]
      }
      this.liveCount = live
      const g = this.points.geometry
      g.attributes.position.needsUpdate = true
      g.attributes.aColor.needsUpdate = true
      g.attributes.aSize.needsUpdate = true
      g.attributes.aAlpha.needsUpdate = true
      g.attributes.aFrame.needsUpdate = true
    }
  }

  dispose() {
    this.scene.remove(this.points)
    this.points.geometry.dispose()
    this.material.dispose()
    this.ambient.length = 0
  }
}
