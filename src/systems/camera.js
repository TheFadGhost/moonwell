import * as THREE from 'three'

const LOOKAHEAD = 56
const FOLLOW_X = 5.2
const FOLLOW_Y = 6.4

export class GameCamera {
  constructor(aspectProvider) {
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 1000)
    this.aspectProvider = aspectProvider
    this.viewH = 640
    this.shakeT = 0
    this.shakeMag = 0
    this.pos = new THREE.Vector2(0, 0)
    this.init = false
    this.locked = false
  }

  resize(w, h) {
    const viewH = this.viewH
    const viewW = viewH * (w / h)
    this.cam.left = -viewW / 2
    this.cam.right = viewW / 2
    this.cam.top = viewH / 2
    this.cam.bottom = -viewH / 2
    this.cam.updateProjectionMatrix()
  }

  snap(x, y) {
    this.pos.set(x, y)
    this.init = true
  }

  shake(mag, dur = 0.3) {
    this.shakeMag = Math.max(this.shakeMag, mag)
    this.shakeT = Math.max(this.shakeT, dur)
  }

  lock() {
    this.locked = true
  }

  unlock() {
    this.locked = false
  }

  update(dt, target, roomDims) {
    if (!this.init && target) {
      this.snap(target.x, target.y)
    }
    if (target && !this.locked) {
      const tx = target.x + target.facing * LOOKAHEAD * 0.5
      const ty = target.y + 24
      const kx = 1 - Math.exp(-FOLLOW_X * dt)
      const ky = 1 - Math.exp(-FOLLOW_Y * dt)
      this.pos.x += (tx - this.pos.x) * kx
      this.pos.y += (ty - this.pos.y) * ky
    }
    let cx = this.pos.x
    let cy = this.pos.y
    if (roomDims) {
      const halfW = (this.cam.right - this.cam.left) / 2
      const halfH = (this.cam.top - this.cam.bottom) / 2
      const minX = roomDims.minX + halfW
      const maxX = roomDims.maxX - halfW
      const minY = roomDims.minY + halfH
      const maxY = roomDims.maxY - halfH
      cx = minX > maxX ? (minX + maxX) / 2 : Math.max(minX, Math.min(maxX, cx))
      cy = minY > maxY ? (minY + maxY) / 2 : Math.max(minY, Math.min(maxY, cy))
      this.pos.x += (cx - this.pos.x) * Math.min(1, dt * 8)
      this.pos.y += (cy - this.pos.y) * Math.min(1, dt * 8)
      cx = this.pos.x
      cy = this.pos.y
    }
    let sx = 0
    let sy = 0
    if (this.shakeT > 0) {
      this.shakeT -= dt
      const m = this.shakeMag * Math.max(0, this.shakeT / 0.3)
      sx = (Math.random() * 2 - 1) * m
      sy = (Math.random() * 2 - 1) * m
      if (this.shakeT <= 0) this.shakeMag = 0
    }
    this.cam.position.set(cx + sx, cy + sy, 10)
    this.cam.lookAt(cx + sx, cy + sy, 0)
  }
}
