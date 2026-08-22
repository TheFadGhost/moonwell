import { G as stateG } from '../core/state.js'

const STYLE_ID = 'mw-map-style'
const RW = 86
const RH = 54
const CELL_W = 150
const CELL_H = 118
const BONE = '#cfc9b8'
const AMBER = '#c9a24b'
const EMBER = '#e0953e'

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return
  const s = doc.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
.mw-map{position:absolute;inset:0;background:rgba(2,3,4,.94);opacity:0;visibility:hidden;pointer-events:none;z-index:30;font-family:'Courier New',ui-monospace,Menlo,monospace;color:${BONE};transition:opacity 400ms ease,visibility 0s linear 400ms}
.mw-map.on{opacity:1;visibility:visible;pointer-events:auto;transition:opacity 400ms ease}
.mw-map-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.mw-map-title{position:absolute;top:34px;left:0;right:0;text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:14px;color:rgba(207,201,184,.9);text-shadow:0 0 18px rgba(0,0,0,.9);pointer-events:none}
.mw-map-fail{position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);text-align:center;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:19px;color:rgba(207,201,184,.6);opacity:0;transition:opacity 600ms ease;pointer-events:none}
.mw-map-fail.on{opacity:1}
.mw-map-legend{position:absolute;left:28px;bottom:26px;display:flex;flex-direction:column;gap:8px;font-size:11px;letter-spacing:2px;color:rgba(207,201,184,.62);pointer-events:none}
.mw-map-legend>div{display:flex;align-items:center;gap:10px}
.mwl-line{display:inline-block;width:30px;height:1px;background:rgba(207,201,184,.55)}
.mwl-sealed{display:inline-block;width:30px;height:1px;background:repeating-linear-gradient(90deg,${AMBER} 0 5px,transparent 5px 9px)}
.mwl-flame{display:inline-block;width:7px;height:7px;border-radius:50%;background:${EMBER};box-shadow:0 0 6px rgba(224,149,62,.8)}
.mwl-relic{display:inline-block;width:12px;height:12px;line-height:11px;text-align:center;font-size:9px;border:1px solid ${AMBER};color:${AMBER};box-sizing:border-box}
`
  doc.head.appendChild(s)
}

function div(doc, cls) {
  const el = doc.createElement('div')
  el.className = cls
  return el
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export class MapScreen {
  constructor() {
    this.doc = null
    this.root = null
    this.el = null
    this.canvas = null
    this.ctx = null
    this.failEl = null
    this._vis = false
    this.t = 0
    this.rooms = null
    this.doorsExtra = null
    this.vw = 0
    this.vh = 0
    this.dpr = 1
    this._resize = null
  }

  get visible() {
    return this._vis
  }

  mount(root) {
    this.root = root
    this.doc = root.ownerDocument
    ensureStyle(this.doc)
    const d = this.doc
    const wrap = div(d, 'mw-map')
    this.canvas = d.createElement('canvas')
    this.canvas.className = 'mw-map-canvas'
    const title = div(d, 'mw-map-title')
    title.textContent = 'VAEL-MORRA'
    this.failEl = div(d, 'mw-map-fail')
    this.failEl.textContent = 'The way is unclear.'
    const legend = div(d, 'mw-map-legend')
    legend.innerHTML =
      '<div><span class="mwl-line"></span><span>passage</span></div>' +
      '<div><span class="mwl-sealed"></span><span>sealed way</span></div>' +
      '<div><span class="mwl-flame"></span><span>kindled shrine</span></div>' +
      '<div><span class="mwl-relic">R</span><span>relic claimed</span></div>'
    wrap.appendChild(this.canvas)
    wrap.appendChild(title)
    wrap.appendChild(this.failEl)
    wrap.appendChild(legend)
    this.el = wrap
    root.appendChild(wrap)
    this.ctx = this.canvas.getContext('2d')
    this.fit()
    this._resize = () => this.fit()
    window.addEventListener('resize', this._resize)
    this._loadData()
  }

  async _loadData() {
    let rooms = null
    let doorsExtra = null
    try {
      const mod = await import('../world/mapdata.js')
      rooms = this._normRooms(mod)
      doorsExtra = mod && Array.isArray(mod.DOORS) ? mod.DOORS : null
    } catch (e) {
      rooms = null
    }
    if (!this.el) return
    this.rooms = rooms && rooms.length ? rooms : null
    this.doorsExtra = doorsExtra
    if (this.failEl) this.failEl.classList.toggle('on', !this.rooms)
  }

  _normRooms(mod) {
    const raw = mod && mod.ROOMS
    if (!raw) return null
    const arr = []
    const push = (id, r) => {
      if (!r || id === undefined || id === null) return
      const gp = r.gridPos || {}
      arr.push({
        id: String(id),
        gx: Number.isFinite(gp.gx) ? gp.gx : 0,
        gy: Number.isFinite(gp.gy) ? gp.gy : 0,
        checkpoint: r.checkpoint === true,
        item: typeof r.item === 'string' ? r.item : (r.item && r.item.id) || null,
        itemGlyph:
          (typeof r.itemGlyph === 'string' && r.itemGlyph) ||
          (r.item && typeof r.item === 'object' && typeof r.item.glyph === 'string' && r.item.glyph) ||
          null,
        doors: Array.isArray(r.doors) ? r.doors : []
      })
    }
    if (Array.isArray(raw)) {
      for (const r of raw) push(r && (r.id !== undefined ? r.id : r.name), r)
    } else if (typeof raw === 'object') {
      for (const k of Object.keys(raw)) push(k, raw[k])
    }
    return arr.length ? arr : null
  }

  _edges() {
    const byId = new Map()
    for (const r of this.rooms) byId.set(r.id, r)
    const seen = new Set()
    const out = []
    const add = (a, b, req) => {
      a = String(a)
      b = String(b)
      if (!byId.has(a) || !byId.has(b) || a === b) return
      const k = a < b ? a + '\u0000' + b : b + '\u0000' + a
      if (seen.has(k)) return
      seen.add(k)
      out.push({ a, b, req: req || null })
    }
    if (this.doorsExtra) {
      for (const dd of this.doorsExtra) {
        if (!dd) continue
        add(dd.a !== undefined ? dd.a : dd.from, dd.b !== undefined ? dd.b : dd.to, dd.requires || dd.req)
      }
    }
    for (const r of this.rooms) {
      for (const dr of r.doors) {
        if (!dr) continue
        if (typeof dr === 'string') add(r.id, dr, null)
        else add(r.id, dr.to, dr.requires || dr.req)
      }
    }
    return out
  }

  _pairOpened(set, a, b) {
    if (!(set instanceof Set)) return false
    return (
      set.has(a + '>' + b) || set.has(b + '>' + a) ||
      set.has(a + ':' + b) || set.has(b + ':' + a) ||
      set.has(a + '/' + b) || set.has(b + '/' + a)
    )
  }

  fit() {
    if (!this.root || !this.canvas) return
    const w = this.root.clientWidth || (typeof window !== 'undefined' && window.innerWidth) || 960
    const h = this.root.clientHeight || (typeof window !== 'undefined' && window.innerHeight) || 540
    this.dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 1.5)
    this.vw = w
    this.vh = h
    this.canvas.width = Math.max(1, (w * this.dpr) | 0)
    this.canvas.height = Math.max(1, (h * this.dpr) | 0)
  }

  show() {
    if (!this.el) return
    this._vis = true
    this.fit()
    this.el.classList.add('on')
  }

  hide() {
    if (!this.el) return
    this._vis = false
    this.el.classList.remove('on')
  }

  toggle() {
    if (this._vis) this.hide()
    else this.show()
  }

  update(dt, g) {
    this.t += dt
    const G = g || stateG
    if (this._vis) this.draw(G)
  }

  draw(G) {
    const ctx = this.ctx
    if (!ctx) return
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.vw, this.vh)
    if (!this.rooms) return
    const flags = (G && G.flags) || {}
    const visited = flags.roomsVisited instanceof Set ? flags.roomsVisited : new Set()
    const abilities = G && G.player && G.player.abilities instanceof Set ? G.player.abilities : new Set()
    const opened = flags.doorsOpened instanceof Set ? flags.doorsOpened : new Set()
    const shrines = flags.checkpointsActivated instanceof Set ? flags.checkpointsActivated : new Set()
    const relics = flags.itemsCollected instanceof Set ? flags.itemsCollected : new Set()

    const visRooms = this.rooms.filter((r) => visited.has(r.id))
    let cur = G && G.currentRoom != null ? this.rooms.find((r) => r.id === G.currentRoom) : null
    if (!visRooms.length && !cur) return

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const known = visRooms.slice()
    if (cur && !visited.has(cur.id)) known.push(cur)
    for (const r of known) {
      if (r.gx < minX) minX = r.gx
      if (r.gy < minY) minY = r.gy
      if (r.gx > maxX) maxX = r.gx
      if (r.gy > maxY) maxY = r.gy
    }
    const bw = Math.max(1, maxX - minX) * CELL_W + RW
    const bh = Math.max(1, maxY - minY) * CELL_H + RH
    const pad = Math.max(80, Math.min(this.vw, this.vh) * 0.16)
    const sc = Math.max(0.35, Math.min((this.vw - pad * 2) / bw, (this.vh - pad * 2) / bh, 1.5))
    const ox = (this.vw - bw * sc) / 2
    const oy = (this.vh - bh * sc) / 2 + 12
    const P = (r) => ({
      x: ox + (r.gx - minX) * CELL_W * sc + (bw * sc - RW * sc) / 2,
      y: oy + (r.gy - minY) * CELL_H * sc + (bh * sc - RH * sc) / 2
    })
    const C = (r) => ({ x: P(r).x + (RW * sc) / 2, y: P(r).y + (RH * sc) / 2 })
    const byId = new Map()
    for (const r of this.rooms) byId.set(r.id, r)
    const rw = RW * sc
    const rh = RH * sc

    for (const e of this._edges()) {
      const ra = byId.get(e.a)
      const rb = byId.get(e.b)
      const aVis = visited.has(e.a)
      const bVis = visited.has(e.b)
      if (!aVis && !bVis) continue
      const ca = C(ra)
      const cb = C(rb)
      ctx.beginPath()
      ctx.moveTo(ca.x, ca.y)
      ctx.lineTo(cb.x, cb.y)
      if (aVis && bVis) {
        ctx.setLineDash([])
        ctx.strokeStyle = 'rgba(207,201,184,.3)'
        ctx.lineWidth = 1.25
      } else {
        const locked =
          !!e.req &&
          !abilities.has(e.req) &&
          !this._pairOpened(opened, e.a, e.b)
        if (locked) {
          ctx.setLineDash([7 * sc + 3, 6])
          ctx.strokeStyle = AMBER
          ctx.lineWidth = 1.4
        } else {
          ctx.setLineDash([])
          ctx.strokeStyle = 'rgba(207,201,184,.55)'
          ctx.lineWidth = 1.4
        }
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    for (const r of visRooms) {
      const p = P(r)
      rr(ctx, p.x, p.y, rw, rh, 7 * sc)
      ctx.fillStyle = 'rgba(207,201,184,.05)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(207,201,184,.5)'
      ctx.lineWidth = 1.25
      ctx.stroke()
      if (cur && r.id === cur.id) {
        const pulse = 0.32 + 0.3 * Math.sin(this.t * 4.2)
        rr(ctx, p.x - 2, p.y - 2, rw + 4, rh + 4, 9 * sc)
        ctx.strokeStyle = BONE
        ctx.globalAlpha = pulse
        ctx.lineWidth = 2
        ctx.shadowColor = 'rgba(207,201,184,.8)'
        ctx.shadowBlur = 10
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
      }
      if (r.checkpoint && shrines.has(r.id)) {
        const c = C(r)
        ctx.beginPath()
        ctx.arc(c.x, c.y + rh * 0.28, 3.4, 0, Math.PI * 2)
        ctx.fillStyle = EMBER
        ctx.shadowColor = 'rgba(224,149,62,.9)'
        ctx.shadowBlur = 8
        ctx.fill()
        ctx.shadowBlur = 0
      }
      if (r.item && relics.has(r.item)) {
        const letter = (r.itemGlyph || (r.item.replace(/^item_/, '')[0] || 'R')).toUpperCase()
        ctx.font = (10 * Math.max(sc, 0.8)).toFixed(1) + "px 'Courier New',monospace"
        ctx.textAlign = 'right'
        ctx.textBaseline = 'top'
        ctx.fillStyle = AMBER
        ctx.fillText(letter, p.x + rw - 6, p.y + 5)
        ctx.strokeStyle = AMBER
        ctx.lineWidth = 1
        ctx.strokeRect(p.x + rw - 17, p.y + 4, 13, 13)
      }
    }

    if (cur && (visited.has(cur.id) || visRooms.length === 0)) {
      const c = C(cur)
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5)
      const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 15 + pulse * 4)
      halo.addColorStop(0, 'rgba(239,233,214,.85)')
      halo.addColorStop(1, 'rgba(239,233,214,0)')
      ctx.beginPath()
      ctx.arc(c.x, c.y, 15 + pulse * 4, 0, Math.PI * 2)
      ctx.fillStyle = halo
      ctx.fill()
      ctx.beginPath()
      ctx.arc(c.x, c.y, 2.4 + pulse * 0.8, 0, Math.PI * 2)
      ctx.fillStyle = '#f4eeda'
      ctx.shadowColor = 'rgba(244,238,218,.95)'
      ctx.shadowBlur = 9
      ctx.fill()
      ctx.shadowBlur = 0
    }
  }

  dispose() {
    if (this._resize && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._resize)
    }
    this._resize = null
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el)
    this.el = null
    this.canvas = null
    this.ctx = null
    this.failEl = null
    this.rooms = null
    this.doorsExtra = null
    this._vis = false
    this.doc = null
    this.root = null
  }
}
