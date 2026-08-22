import { bus } from '../core/events.js'

const STYLE_ID = 'mw-hud-style'
const GLYPHS = [
  ['lantern', 'L'],
  ['umbral_step', 'U'],
  ['veil_dash', 'D'],
  ['claws', 'C']
]
const LORE_TIME = 6
const ROOM_NAME_TIME = 2.6
const HURT_DECAY = 1.5

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return
  const s = doc.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
.mw-hud{position:absolute;inset:0;overflow:hidden;pointer-events:none;font-family:'Courier New',ui-monospace,Menlo,monospace;color:#cfc9b8;opacity:1;transition:opacity 400ms ease;z-index:20}
.mw-hud.hidden{opacity:0}
.mw-hp{position:absolute;top:24px;left:26px;display:flex;gap:10px}
.mw-pip{width:14px;height:14px;background:#d6cdb2;border-radius:0 50% 50% 50%;transform:rotate(45deg);box-shadow:0 0 7px rgba(214,205,178,.4),inset 0 0 3px rgba(255,242,206,.55)}
.mw-pip.lost{background:transparent;border:1px solid rgba(207,201,184,.26);box-shadow:none}
.mw-oilblock{position:absolute;top:58px;left:29px;display:flex;flex-direction:column;align-items:center;gap:6px}
.mw-oillabel{font-size:9px;letter-spacing:3px;color:rgba(207,201,184,.55)}
.mw-oiltrack{width:9px;height:84px;border:1px solid rgba(207,201,184,.28);background:rgba(2,3,4,.66);display:flex;align-items:flex-end;padding:1px;box-sizing:border-box}
.mw-oilfill{width:100%;height:100%;background:#aaa084;transition:height 220ms ease}
.mw-oil.low .mw-oilfill{animation:mwOilFlicker 850ms linear infinite}
.mw-oil.empty .mw-oilfill{background:#7a2020;animation:none}
@keyframes mwOilFlicker{0%,100%{opacity:1}17%{opacity:.35}33%{opacity:.85}51%{opacity:.22}68%{opacity:.7}84%{opacity:.42}}
.mw-glyphs{position:absolute;top:168px;left:26px;display:flex;gap:7px}
.mw-glyph{width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;letter-spacing:0;border:1px solid rgba(207,201,184,.2);color:rgba(207,201,184,.16);background:rgba(2,3,4,.5)}
.mw-glyph.lit{color:#d6cdb2;border-color:rgba(207,201,184,.6);box-shadow:0 0 6px rgba(214,205,178,.22);text-shadow:0 0 5px rgba(214,205,178,.55)}
.mw-boss{position:absolute;top:36px;left:50%;transform:translateX(-50%);width:min(560px,62vw);text-align:center;opacity:0;transition:opacity 500ms ease}
.mw-boss.on{opacity:1}
.mw-bossname{font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:5px;text-transform:uppercase;color:#cfc9b8;margin-bottom:8px;text-shadow:0 0 9px rgba(122,32,32,.85),0 1px 2px #000}
.mw-bosstrack{height:7px;border:1px solid rgba(207,201,184,.32);background:rgba(2,3,4,.78);padding:1px;box-sizing:border-box}
.mw-bossfill{height:100%;width:100%;background:linear-gradient(90deg,#3c1010,#7a2020);transition:width 180ms ease}
.mw-prompt{position:absolute;left:50%;bottom:12%;transform:translateX(-50%);padding:7px 16px;border:1px solid rgba(207,201,184,.28);background:rgba(2,3,4,.74);font-size:13px;letter-spacing:1px;color:#cfc9b8;opacity:0;transition:opacity 250ms ease;white-space:nowrap}
.mw-prompt.on{opacity:1}
.mw-lore{position:absolute;left:50%;top:67%;transform:translateX(-50%);max-width:700px;text-align:center;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:19px;line-height:1.55;color:#cfc9b8;text-shadow:0 2px 10px #000,0 0 24px rgba(0,0,0,.92);padding:0 24px;opacity:0;transition:opacity 650ms ease}
.mw-lore.on{opacity:.96}
.mw-roomname{position:absolute;top:26px;right:30px;font-family:Georgia,'Times New Roman',serif;font-size:15px;letter-spacing:4px;color:rgba(207,201,184,.85);text-shadow:0 0 10px #000,0 1px 2px #000;opacity:0;transition:opacity 900ms ease}
.mw-roomname.on{opacity:1}
.mw-vignette{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 190px 70px rgba(122,32,32,.95),inset 0 0 430px 170px rgba(56,8,8,.55);opacity:0}
`
  doc.head.appendChild(s)
}

function div(doc, cls) {
  const el = doc.createElement('div')
  el.className = cls
  return el
}

export class Hud {
  constructor() {
    this.doc = null
    this.root = null
    this.el = null
    this.hpRow = null
    this.pips = []
    this.lastMaxHp = -1
    this.oilBlock = null
    this.oilFill = null
    this.glyphRow = null
    this.glyphMap = new Map()
    this.boss = null
    this.bossName = null
    this.bossFill = null
    this.bossOn = false
    this.prompt = null
    this.promptKey = ''
    this.lore = null
    this.loreTime = 0
    this.roomEl = null
    this.roomShown = ''
    this.roomTime = 0
    this.vignette = null
    this.hurt = 0
    this._subs = []
  }

  mount(root) {
    this.root = root
    this.doc = root.ownerDocument
    ensureStyle(this.doc)
    const d = this.doc
    const wrap = div(d, 'mw-hud')

    this.hpRow = div(d, 'mw-hp')

    this.oilBlock = div(d, 'mw-oilblock mw-oil')
    const oLabel = div(d, 'mw-oillabel')
    oLabel.textContent = 'OIL'
    const oTrack = div(d, 'mw-oiltrack')
    this.oilFill = div(d, 'mw-oilfill')
    oTrack.appendChild(this.oilFill)
    this.oilBlock.appendChild(oLabel)
    this.oilBlock.appendChild(oTrack)

    this.glyphRow = div(d, 'mw-glyphs')
    for (const [id, ch] of GLYPHS) {
      const g = div(d, 'mw-glyph')
      g.textContent = ch
      this.glyphRow.appendChild(g)
      this.glyphMap.set(id, g)
    }

    this.boss = div(d, 'mw-boss')
    this.bossName = div(d, 'mw-bossname')
    const bTrack = div(d, 'mw-bosstrack')
    this.bossFill = div(d, 'mw-bossfill')
    bTrack.appendChild(this.bossFill)
    this.boss.appendChild(this.bossName)
    this.boss.appendChild(bTrack)

    this.prompt = div(d, 'mw-prompt')
    this.lore = div(d, 'mw-lore')
    this.roomEl = div(d, 'mw-roomname')
    this.vignette = div(d, 'mw-vignette')

    wrap.appendChild(this.hpRow)
    wrap.appendChild(this.oilBlock)
    wrap.appendChild(this.glyphRow)
    wrap.appendChild(this.boss)
    wrap.appendChild(this.prompt)
    wrap.appendChild(this.lore)
    wrap.appendChild(this.roomEl)
    wrap.appendChild(this.vignette)

    this.el = wrap
    root.appendChild(wrap)

    this._subs.push(
      bus.on('boss:start', (p) => this.onBossStart(p)),
      bus.on('boss:end', () => this.onBossEnd()),
      bus.on('lore:show', (p) => this.onLore(p)),
      bus.on('player:hurt', () => { this.hurt = 1 }),
      bus.on('fx:hurt', () => { this.hurt = 1 }),
      bus.on('room:enter', (p) => this.onRoomEnter(p))
    )
  }

  show() {
    if (this.el) this.el.classList.remove('hidden')
  }

  hide() {
    if (this.el) this.el.classList.add('hidden')
  }

  onBossStart(p) {
    const name = typeof p === 'string' ? p : (p && p.name) || ''
    this.bossName.textContent = name || 'IT STIRS BELOW'
    this.bossOn = true
    this.bossFill.style.width = '100%'
    this.boss.classList.add('on')
  }

  onBossEnd() {
    this.bossOn = false
    this.boss.classList.remove('on')
  }

  onLore(p) {
    const text = typeof p === 'string' ? p : (p && p.text) || ''
    if (!text) return
    this.lore.textContent = text
    this.lore.classList.add('on')
    this.loreTime = LORE_TIME
  }

  onRoomEnter(p) {
    const name = typeof p === 'string' ? p : (p && (p.name || p.roomName)) || ''
    if (!name || name === this.roomShown) return
    this.roomShown = name
    this.roomEl.textContent = name
    this.roomEl.classList.add('on')
    this.roomTime = ROOM_NAME_TIME
  }

  rebuildPips(n) {
    while (this.hpRow.firstChild) this.hpRow.removeChild(this.hpRow.firstChild)
    this.pips.length = 0
    for (let i = 0; i < n; i++) {
      const p = div(this.doc, 'mw-pip')
      this.hpRow.appendChild(p)
      this.pips.push(p)
    }
    this.lastMaxHp = n
  }

  update(dt, G) {
    if (!this.el) return
    const p = G && G.player
    if (p) {
      const maxHp = Math.max(1, p.maxHp | 0)
      if (maxHp !== this.lastMaxHp) this.rebuildPips(maxHp)
      for (let i = 0; i < this.pips.length; i++) {
        this.pips[i].classList.toggle('lost', i >= p.hp)
      }
      const oilPct = p.maxOil > 0 ? Math.max(0, Math.min(1, p.oil / p.maxOil)) : 0
      this.oilFill.style.height = (oilPct * 100).toFixed(1) + '%'
      this.oilBlock.classList.toggle('low', p.oil > 0 && p.oil < p.maxOil * 0.25)
      this.oilBlock.classList.toggle('empty', p.oil <= 0)
      const ab = p.abilities
      for (const [id, g] of this.glyphMap) {
        g.classList.toggle('lit', ab instanceof Set ? ab.has(id) : !!(ab && ab.has(id)))
      }
    }
    if (this.bossOn && G && typeof G.bossHp === 'number' && typeof G.bossMaxHp === 'number' && G.bossMaxHp > 0) {
      const f = Math.max(0, Math.min(1, G.bossHp / G.bossMaxHp))
      this.bossFill.style.width = (f * 100).toFixed(1) + '%'
    }
    const it = G && G.interact
    if (it && it.text) {
      const key = it.text + '|' + (typeof it.x === 'number' ? it.x : '') + ',' + (typeof it.y === 'number' ? it.y : '')
      if (key !== this.promptKey) {
        this.promptKey = key
        this.prompt.textContent = '[E] ' + it.text
        if (typeof it.x === 'number' && typeof it.y === 'number') {
          this.prompt.style.left = it.x + 'px'
          this.prompt.style.top = it.y + 'px'
          this.prompt.style.bottom = 'auto'
          this.prompt.style.transform = 'translate(-50%,-50%)'
        } else {
          this.prompt.style.left = '50%'
          this.prompt.style.top = 'auto'
          this.prompt.style.bottom = '12%'
          this.prompt.style.transform = 'translateX(-50%)'
        }
      }
      this.prompt.classList.add('on')
    } else {
      this.prompt.classList.remove('on')
      this.promptKey = ''
    }
    if (this.loreTime > 0) {
      this.loreTime -= dt
      if (this.loreTime <= 0) this.lore.classList.remove('on')
    }
    if (this.hurt > 0) {
      this.hurt = Math.max(0, this.hurt - dt * HURT_DECAY)
      this.vignette.style.opacity = this.hurt.toFixed(3)
    }
    if (this.roomTime > 0) {
      this.roomTime -= dt
      if (this.roomTime <= 0) this.roomEl.classList.remove('on')
    }
    if (G && G.roomName && G.roomName !== this.roomShown) this.onRoomEnter(G.roomName)
  }

  dispose() {
    for (const off of this._subs) off()
    this._subs.length = 0
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el)
    this.el = null
    this.pips.length = 0
    this.glyphMap.clear()
    this.bossOn = false
    this.hurt = 0
    this.loreTime = 0
    this.roomTime = 0
    this.roomShown = ''
    this.promptKey = ''
    this.doc = null
    this.root = null
  }
}
