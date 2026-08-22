import { TILE } from './tiles.js'

const SOLID = TILE.SOLID
const ONEWAY = TILE.ONEWAY

function charToTile(ch) {
  switch (ch) {
    case '#': return TILE.SOLID
    case '-': return TILE.ONEWAY
    case '^': return TILE.SPIKE
    default: return TILE.EMPTY
  }
}

export class PhysicsWorld {
  constructor(tileSize = 32) {
    this.ts = tileSize
    this.grid = null
    this.cols = 0
    this.rows = 0
    this.room = null
    this.H = 0
    this.W = 0
  }

  loadRoom(room) {
    this.room = room
    this.rows = room.height
    this.cols = room.width
    this.H = room.height * this.ts
    this.W = room.width * this.ts
    const grid = new Uint8Array(this.cols * this.rows)
    for (let ry = 0; ry < this.rows; ry++) {
      const row = room.rows[ry] || ''
      for (let rx = 0; rx < this.cols; rx++) {
        grid[ry * this.cols + rx] = charToTile(row[rx] || '.')
      }
    }
    this.grid = grid
  }

  tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return SOLID
    return this.grid[ty * this.cols + tx]
  }

  _vertTile(tx, ty) {
    if (tx < 0 || tx >= this.cols) return TILE.EMPTY
    if (ty >= this.rows) return SOLID
    if (ty < 0) return TILE.EMPTY
    return this.grid[ty * this.cols + tx]
  }

  rowAt(worldY) {
    return Math.floor((this.H - worldY) / this.ts)
  }

  rowTop(row) {
    return this.H - (row + 1) * this.ts
  }

  overlaps(rect, tileId) {
    const ts = this.ts
    const x0 = Math.floor((rect.x - rect.w / 2) / ts)
    const x1 = Math.floor((rect.x + rect.w / 2 - 0.001) / ts)
    const rTop = this.rowAt(rect.y + rect.h / 2)
    const rBot = this.rowAt(rect.y - rect.h / 2 + 0.001)
    for (let ty = rTop; ty <= rBot; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.tileAt(tx, ty) === tileId) return true
      }
    }
    return false
  }

  hazardHit(rect) {
    const inset = 8
    const r = { x: rect.x, y: rect.y, w: Math.max(4, rect.w - inset), h: Math.max(4, rect.h - inset) }
    if (this.overlaps(r, TILE.SPIKE)) return 'spike'
    return null
  }

  moveBody(b, dt) {
    b.prevX = b.x
    b.prevY = b.y
    b.hitWall = 0
    b.hitCeil = false

    const maxMove = 8
    let remX = b.vx * dt
    let remY = b.vy * dt
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(remX), Math.abs(remY)) / maxMove))
    const sx = remX / steps
    const sy = remY / steps

    let grounded = false
    for (let i = 0; i < steps; i++) {
      if (sx !== 0) this._moveX(b, sx)
      if (sy > 0) {
        if (this._moveUp(b, sy)) b.hitCeil = true
      } else if (sy < 0) {
        if (this._moveDown(b, sy)) grounded = true
      }
    }

    if (!grounded && b.vy <= 0) grounded = this._restingCheck(b)
    b.onGround = grounded
    return b
  }

  _moveX(b, delta) {
    const ts = this.ts
    const hw = b.w / 2
    const hh = b.h / 2 - 2
    const dir = Math.sign(delta)
    b.x += delta
    const edge = dir > 0 ? b.x + hw : b.x - hw
    const tx = Math.floor(edge / ts)
    const rTop = this.rowAt(b.y + hh)
    const rBot = this.rowAt(b.y - hh - 0.001)
    for (let ty = rTop; ty <= rBot; ty++) {
      if (this.tileAt(tx, ty) === SOLID) {
        b.x = dir > 0 ? tx * ts - hw - 0.001 : (tx + 1) * ts + hw + 0.001
        b.vx = 0
        b.hitWall = dir
        return
      }
    }
  }

  _moveUp(b, delta) {
    const ts = this.ts
    const hw = b.w / 2 - 2
    const hh = b.h / 2
    b.y += delta
    const edge = b.y + hh
    const ty = Math.floor((this.H - edge) / ts)
    const x0 = Math.floor((b.x - hw) / ts)
    const x1 = Math.floor((b.x + hw - 0.001) / ts)
    for (let tx = x0; tx <= x1; tx++) {
      if (this._vertTile(tx, ty) === SOLID) {
        b.y = this.rowTop(ty) - hh - 0.001
        b.vy = 0
        return true
      }
    }
    return false
  }

  _moveDown(b, delta) {
    const ts = this.ts
    const hw = b.w / 2 - 2
    const hh = b.h / 2
    b.y += delta
    const edge = b.y - hh
    const ty = Math.floor((this.H - edge) / ts)
    const x0 = Math.floor((b.x - hw) / ts)
    const x1 = Math.floor((b.x + hw - 0.001) / ts)
    const dropping = b.dropTimer > 0
    for (let tx = x0; tx <= x1; tx++) {
      const t = this._vertTile(tx, ty)
      if (t === SOLID) {
        b.y = this.rowTop(ty) + this.ts + hh + 0.001
        b.vy = 0
        return true
      }
      if (t === ONEWAY && !dropping) {
        const top = this.rowTop(ty) + this.ts
        const prevFeet = b.prevY - hh
        if (prevFeet >= top - 6) {
          b.y = top + hh + 0.001
          b.vy = 0
          return true
        }
      }
    }
    return false
  }

  _restingCheck(b) {
    const ts = this.ts
    const hw = b.w / 2 - 2
    const feet = b.y - b.h / 2
    const probeY = feet - 1
    const ty = Math.floor((this.H - probeY) / ts)
    const x0 = Math.floor((b.x - hw) / ts)
    const x1 = Math.floor((b.x + hw - 0.001) / ts)
    for (let tx = x0; tx <= x1; tx++) {
      const t = this._vertTile(tx, ty)
      if (t === SOLID) return true
      if (t === ONEWAY && !(b.dropTimer > 0)) {
        const top = this.rowTop(ty) + this.ts
        if (feet <= top + 4) return true
      }
    }
    return false
  }

  groundBelow(tx, ty) {
    const t = this.tileAt(tx, ty + 1)
    return t === SOLID || t === ONEWAY
  }

  solidAtWorld(wx, wy) {
    return this.tileAt(Math.floor(wx / this.ts), this.rowAt(wy)) === SOLID
  }
}
