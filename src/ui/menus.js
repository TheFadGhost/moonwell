import { bus } from '../core/events.js'
import { G as stateG } from '../core/state.js'

const STYLE_ID = 'mw-menus-style'
const DEATH_RESPAWN_AT = 1.8
const BINDINGS = [
  ['MOVE', 'A · D · ARROWS'],
  ['JUMP', 'SPACE / Z'],
  ['ATTACK', 'J / X'],
  ['DASH', 'K / C / SHIFT'],
  ['INTERACT', 'E'],
  ['LANTERN', 'F'],
  ['MAP', 'M / TAB'],
  ['PAUSE', 'ESC'],
  ['CONFIRM', 'ENTER']
]

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return
  const s = doc.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
.mw-menus{position:absolute;inset:0;pointer-events:none;z-index:40;font-family:'Courier New',ui-monospace,Menlo,monospace;color:#cfc9b8}
.mw-screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;visibility:hidden;pointer-events:none;background:transparent;transition:opacity 400ms ease,visibility 0s linear 400ms}
.mw-screen.on{opacity:1;visibility:visible;pointer-events:auto;transition:opacity 400ms ease}
.mw-title-scr,.mw-end-scr{background:radial-gradient(ellipse at 50% 42%,#0a0c0e 0%,#050607 55%,#010203 100%)}
.mw-pause-scr{background:rgba(2,3,4,.84)}
.mw-death-scr{background:#010102}
.mw-title-word{font-family:Georgia,'Times New Roman',serif;font-size:clamp(58px,11vw,132px);letter-spacing:.22em;text-indent:.22em;color:#cfc9b8;text-shadow:0 0 34px rgba(207,201,184,.14),0 2px 6px #000;margin:0}
.mw-title-sub{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:16px;letter-spacing:4px;color:rgba(207,201,184,.52);margin-top:10px}
.mw-menu{display:flex;flex-direction:column;align-items:center;gap:15px;margin-top:56px;min-height:120px}
.mw-btn{position:relative;font-size:15px;letter-spacing:5px;color:rgba(207,201,184,.48);padding:7px 30px;cursor:pointer;user-select:none;transition:color 200ms ease,text-shadow 200ms ease}
.mw-btn:hover,.mw-btn.sel{color:#e9e3ce;text-shadow:0 0 9px rgba(207,201,184,.45)}
.mw-btn.sel::before{content:'';position:absolute;left:-4px;top:50%;width:12px;height:1px;background:#7a2020;box-shadow:0 0 6px rgba(122,32,32,.9)}
.mw-btn.sel::after{content:'';position:absolute;right:-4px;top:50%;width:12px;height:1px;background:#7a2020;box-shadow:0 0 6px rgba(122,32,32,.9)}
.mw-controls-panel{display:none;flex-direction:column;gap:7px;width:min(430px,86vw);border:1px solid rgba(207,201,184,.18);background:rgba(2,3,4,.88);padding:26px 34px;margin-top:34px;font-size:13px;letter-spacing:2px}
.mw-controls-panel.open{display:flex}
.mwc-row{display:flex;justify-content:space-between;color:rgba(207,201,184,.62)}
.mwc-row span:last-child{color:#cfc9b8}
.mw-pause-head{font-family:Georgia,'Times New Roman',serif;font-size:34px;letter-spacing:14px;text-indent:14px;color:#cfc9b8;text-shadow:0 1px 4px #000}
.mw-recap{display:flex;flex-direction:column;gap:5px;width:min(360px,80vw);margin-top:38px;font-size:11px;letter-spacing:2px;color:rgba(207,201,184,.42)}
.mw-recap .mwc-row span:last-child{color:rgba(207,201,184,.75)}
.mw-death-line{font-family:Georgia,'Times New Roman',serif;font-style:normal;font-size:clamp(20px,3.4vw,30px);letter-spacing:3px;color:rgba(207,201,184,.92);text-shadow:0 0 26px rgba(122,32,32,.35),0 2px 8px #000}
.mw-end-head{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:24px;letter-spacing:3px;color:rgba(207,201,184,.85);margin-bottom:34px}
.mw-stats{display:flex;flex-direction:column;gap:10px;width:min(340px,80vw);font-size:14px;letter-spacing:2px}
.mw-stat{display:flex;align-items:baseline;color:rgba(207,201,184,.6)}
.mw-stat i{flex:1;border-bottom:1px dotted rgba(207,201,184,.25);margin:0 10px;transform:translateY(-3px)}
.mw-stat span:last-child{color:#dcd6c0}
.mw-end-ded{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:18px;letter-spacing:2px;color:rgba(207,201,184,.72);margin-top:46px}
.mw-end-hint{font-size:11px;letter-spacing:4px;color:rgba(207,201,184,.42);margin-top:26px;animation:mwHintPulse 2400ms ease-in-out infinite}
@keyframes mwHintPulse{0%,100%{opacity:.42}50%{opacity:.85}}
`
  doc.head.appendChild(s)
}

function div(doc, cls) {
  const el = doc.createElement('div')
  el.className = cls
  return el
}

function fmtTime(t) {
  const s = Math.max(0, Math.floor(t))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const p = (n) => String(n).padStart(2, '0')
  return h > 0 ? h + ':' + p(m) + ':' + p(ss) : m + ':' + p(ss)
}

export class Menus {
  constructor() {
    this.doc = null
    this.root = null
    this.el = null
    this.scrTitle = null
    this.scrPause = null
    this.scrDeath = null
    this.scrEnd = null
    this.titleMenu = null
    this.controlsPanel = null
    this.pauseMenu = null
    this.endStats = null
    this.current = null
    this.idx = 0
    this.items = []
    this.controlsOpen = false
    this.muted = false
    this.hasSaveFlag = false
    this.deathT = 0
    this.deathEmitted = false
    this._key = null
    this._subs = []
  }

  gg(g) {
    return g || stateG
  }

  sfx(name) {
    bus.emit('ui:sfx', { name })
  }

  mount(root) {
    this.root = root
    this.doc = root.ownerDocument
    ensureStyle(this.doc)
    const d = this.doc

    const wrap = div(d, 'mw-menus')

    this.scrTitle = div(d, 'mw-screen mw-title-scr')
    const word = div(d, 'mw-title-word')
    word.textContent = 'MOONWELL'
    const sub = div(d, 'mw-title-sub')
    sub.textContent = 'a descent into Vael-Morra'
    this.titleMenu = div(d, 'mw-menu')
    this.controlsPanel = div(d, 'mw-controls-panel')
    for (const [k, v] of BINDINGS) {
      const row = div(d, 'mwc-row')
      const a = d.createElement('span')
      a.textContent = k
      const b = d.createElement('span')
      b.textContent = v
      row.appendChild(a)
      row.appendChild(b)
      this.controlsPanel.appendChild(row)
    }
    this.scrTitle.appendChild(word)
    this.scrTitle.appendChild(sub)
    this.scrTitle.appendChild(this.titleMenu)
    this.scrTitle.appendChild(this.controlsPanel)

    this.scrPause = div(d, 'mw-screen mw-pause-scr')
    const pauseInner = div(d, '')
    pauseInner.style.display = 'flex'
    pauseInner.style.flexDirection = 'column'
    pauseInner.style.alignItems = 'center'
    const pHead = div(d, 'mw-pause-head')
    pHead.textContent = 'STILL'
    this.pauseMenu = div(d, 'mw-menu')
    this.pauseMenu.style.marginTop = '44px'
    const recap = div(d, 'mw-recap')
    for (const [k, v] of BINDINGS) {
      const row = div(d, 'mwc-row')
      const a = d.createElement('span')
      a.textContent = k
      const b = d.createElement('span')
      b.textContent = v
      row.appendChild(a)
      row.appendChild(b)
      recap.appendChild(row)
    }
    pauseInner.appendChild(pHead)
    pauseInner.appendChild(this.pauseMenu)
    pauseInner.appendChild(recap)
    this.scrPause.appendChild(pauseInner)

    this.scrDeath = div(d, 'mw-screen mw-death-scr')
    const dLine = div(d, 'mw-death-line')
    dLine.textContent = 'the dark keeps what it drowns.'
    this.scrDeath.appendChild(dLine)

    this.scrEnd = div(d, 'mw-screen mw-end-scr')
    const endWrap = div(d, '')
    endWrap.style.display = 'flex'
    endWrap.style.flexDirection = 'column'
    endWrap.style.alignItems = 'center'
    const eHead = div(d, 'mw-end-head')
    eHead.textContent = 'the well is silent.'
    this.endStats = div(d, 'mw-stats')
    const ded = div(d, 'mw-end-ded')
    ded.textContent = 'for those who kept their light.'
    const hint = div(d, 'mw-end-hint')
    hint.textContent = 'PRESS ENTER'
    endWrap.appendChild(eHead)
    endWrap.appendChild(this.endStats)
    endWrap.appendChild(ded)
    endWrap.appendChild(hint)
    this.scrEnd.appendChild(endWrap)

    wrap.appendChild(this.scrTitle)
    wrap.appendChild(this.scrPause)
    wrap.appendChild(this.scrDeath)
    wrap.appendChild(this.scrEnd)

    this.el = wrap
    root.appendChild(wrap)

    this._key = (e) => this.onKey(e)
    window.addEventListener('keydown', this._key)

    this._subs.push(
      bus.on('save:exists', (p) => {
        this.hasSaveFlag = p === true || !!(p && p.value !== undefined ? p.value : p && p.exists)
        if (this.current === 'title') this.renderTitle()
      })
    )
  }

  show(name, opts) {
    if (!this.el) return
    if (name !== 'title' && name !== 'pause' && name !== 'death' && name !== 'ending') return
    this.current = name
    const map = { title: this.scrTitle, pause: this.scrPause, death: this.scrDeath, ending: this.scrEnd }
    for (const k of Object.keys(map)) map[k].classList.toggle('on', k === name)
    if (name === 'title') {
      this.controlsOpen = false
      this.controlsPanel.classList.remove('open')
      this.renderTitle()
    } else if (name === 'pause') {
      this.renderPause()
    } else if (name === 'death') {
      this.deathT = 0
      this.deathEmitted = false
    } else if (name === 'ending') {
      this.fillEnding(opts && opts.stats)
    }
  }

  hide() {
    if (!this.el) return
    this.current = null
    for (const scr of [this.scrTitle, this.scrPause, this.scrDeath, this.scrEnd]) {
      scr.classList.remove('on')
    }
  }

  fillEnding(stats) {
    const g = this.gg()
    const s = stats || {}
    const t = typeof s.time === 'number' ? s.time : g.time || 0
    const deaths = typeof s.deaths === 'number' ? s.deaths : g.deaths || 0
    let ex = typeof s.exploration === 'number' ? s.exploration : (g.stats && g.stats.exploration) || 0
    if (ex <= 1) ex *= 100
    const pct = Math.round(ex)
    const rows = [
      ['TIME BELOW', fmtTime(t)],
      ['DEATHS', String(deaths)],
      ['VAEL-MORRA CHARTED', pct + '%']
    ]
    while (this.endStats.firstChild) this.endStats.removeChild(this.endStats.firstChild)
    for (const [k, v] of rows) {
      const row = div(this.doc, 'mw-stat')
      const a = this.doc.createElement('span')
      a.textContent = k
      const dots = this.doc.createElement('i')
      const b = this.doc.createElement('span')
      b.textContent = v
      row.appendChild(a)
      row.appendChild(dots)
      row.appendChild(b)
      this.endStats.appendChild(row)
    }
  }

  mkButton(menu, label, act) {
    const b = div(this.doc, 'mw-btn')
    b.textContent = label
    const i = this.items.length
    b.addEventListener('mouseenter', () => {
      if (this.idx !== i) {
        this.idx = i
        this.sfx('ui_move')
        this.paint()
      }
    })
    b.addEventListener('click', () => {
      this.idx = i
      this.paint()
      this.select()
    })
    menu.appendChild(b)
    this.items.push({ el: b, act })
  }

  renderTitle() {
    while (this.titleMenu.firstChild) this.titleMenu.removeChild(this.titleMenu.firstChild)
    this.items.length = 0
    this.idx = 0
    if (this.controlsOpen) {
      this.mkButton(this.titleMenu, 'BACK', 'back')
    } else {
      this.mkButton(this.titleMenu, 'NEW DESCENT', 'newgame')
      const g = this.gg()
      if (this.hasSaveFlag || g.hasSave === true) this.mkButton(this.titleMenu, 'CONTINUE', 'continue')
      this.mkButton(this.titleMenu, 'CONTROLS', 'controls')
    }
    this.paint()
  }

  renderPause() {
    while (this.pauseMenu.firstChild) this.pauseMenu.removeChild(this.pauseMenu.firstChild)
    this.items.length = 0
    this.idx = 0
    this.mkButton(this.pauseMenu, 'RESUME', 'resume')
    this.mkButton(this.pauseMenu, 'SAVE & QUIT', 'savequit')
    this.mkButton(this.pauseMenu, 'MUTE: ' + (this.muted ? 'ON' : 'OFF'), 'mute')
    this.paint()
  }

  paint() {
    for (let i = 0; i < this.items.length; i++) {
      this.items[i].el.classList.toggle('sel', i === this.idx)
    }
  }

  move(d) {
    if (!this.items.length) return
    this.idx = (this.idx + d + this.items.length) % this.items.length
    this.sfx('ui_move')
    this.paint()
  }

  openControls() {
    this.controlsOpen = true
    this.controlsPanel.classList.add('open')
    this.renderTitle()
  }

  closeControls() {
    this.controlsOpen = false
    this.controlsPanel.classList.remove('open')
    this.renderTitle()
  }

  select() {
    const it = this.items[this.idx]
    if (!it) return
    this.sfx('ui_confirm')
    if (this.current === 'title') {
      if (it.act === 'newgame') {
        this.hide()
        bus.emit('ui:newgame')
      } else if (it.act === 'continue') {
        this.hide()
        bus.emit('ui:continue')
      } else if (it.act === 'controls') {
        this.openControls()
      } else if (it.act === 'back') {
        this.closeControls()
      }
    } else if (this.current === 'pause') {
      if (it.act === 'resume') {
        this.hide()
        bus.emit('ui:resume')
      } else if (it.act === 'savequit') {
        this.hide()
        bus.emit('ui:savequit')
      } else if (it.act === 'mute') {
        this.muted = !this.muted
        bus.emit('ui:mute', { muted: this.muted })
        this.renderPause()
      }
    } else if (this.current === 'ending') {
      this.hide()
      bus.emit('ui:title')
    }
  }

  onKey(e) {
    const c = this.current
    if (!c) return
    const up = e.code === 'ArrowUp' || e.code === 'KeyW'
    const dn = e.code === 'ArrowDown' || e.code === 'KeyS'
    const ent = e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space'
    const esc = e.code === 'Escape'
    if (c === 'title') {
      if (esc && this.controlsOpen) {
        this.closeControls()
        e.preventDefault()
        return
      }
      if (up) {
        this.move(-1)
        e.preventDefault()
      } else if (dn) {
        this.move(1)
        e.preventDefault()
      } else if (ent) {
        this.select()
        e.preventDefault()
      }
    } else if (c === 'pause') {
      if (esc) {
        this.hide()
        bus.emit('ui:resume')
        e.preventDefault()
        return
      }
      if (up) {
        this.move(-1)
        e.preventDefault()
      } else if (dn) {
        this.move(1)
        e.preventDefault()
      } else if (ent) {
        this.select()
        e.preventDefault()
      }
    } else if (c === 'ending') {
      if (ent) {
        this.select()
        e.preventDefault()
      }
    }
  }

  update(dt, g) {
    const G = this.gg(g)
    if (this.current === 'death' && !this.deathEmitted) {
      this.deathT += dt
      if (this.deathT >= DEATH_RESPAWN_AT) {
        this.deathEmitted = true
        bus.emit('ui:respawn-ready')
      }
    }
    return G
  }

  dispose() {
    if (this._key) window.removeEventListener('keydown', this._key)
    this._key = null
    for (const off of this._subs) off()
    this._subs.length = 0
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el)
    this.el = null
    this.items.length = 0
    this.current = null
    this.controlsOpen = false
    this.deathEmitted = true
    this.doc = null
    this.root = null
  }
}
