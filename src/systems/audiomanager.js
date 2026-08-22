const SCARE_STINGERS = new Set(['stinger_close', 'stinger_discover'])
const COMBAT_HITS = new Set(['slash', 'hit_enemy', 'hit_player', 'enemy_die'])
const ZONE_LEVELS = { nave: 1, warrens: 1, gallery: 1, sanctum: 1 }

export class AudioManager {
  constructor() {
    this.ac = null
    this.ready = false
    this.time = 0
    this.mutedState = false
    this.masterLevel = 0.85
    this.zoneDesired = null
    this.zoneActive = null
    this.tensionTarget = 0
    this.tensionSmooth = 0
    this.hbOn = false
    this.hbNext = 0
    this.bossOn = false
    this.bossNext = 0
    this.bossBeat = 0
    this.strideAccum = 0
    this.strideInterval = 0.34
    this.dripNext = 0
    this.groanNext = 0
    this.glissNext = 0
    this.pulseNext = 0
    this.lastScare = -Infinity
    this.lastPlay = new Map()
    this.noiseBuffers = new Map()
    this.beds = new Map()
    this.loops = new Map()
    this.loopSeq = 0
    this.state = { zone: 'nave', tension: 0, threatNear: false, inWater: false, moving: false, onGround: true }
    this.oneShots = {
      step_stone: (v, r) => this._stepStone(v, r),
      step_water: (v, r) => this._stepWater(v, r),
      slash: (v, r) => this._slash(v, r),
      hit_enemy: (v, r) => this._hitEnemy(v, r),
      hit_player: (v, r) => this._hitPlayer(v, r),
      enemy_die: (v, r) => this._enemyDie(v, r),
      door_open: (v, r) => this._doorOpen(v, r),
      item_get: (v, r) => this._itemGet(v, r),
      checkpoint: (v, r) => this._checkpoint(v, r),
      stinger_close: (v, r) => this._stingerClose(v, r),
      stinger_discover: (v, r) => this._stingerDiscover(v, r),
      maw_emerge: (v, r) => this._mawEmerge(v, r),
      bloom_burst: (v, r) => this._bloomBurst(v, r),
      ui_move: (v, r) => this._uiMove(v, r),
      ui_confirm: (v, r) => this._uiConfirm(v, r)
    }
  }

  _clock() {
    return this.ac ? this.ac.currentTime : this.time
  }

  init() {
    if (this.ac) {
      this.unlock()
      return
    }
    const Ctor =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : typeof window !== 'undefined'
          ? window.AudioContext || window.webkitAudioContext
          : null
    if (!Ctor) return
    try {
      this.ac = new Ctor()
    } catch (e) {
      this.ac = null
    }
    if (!this.ac) return
    this._buildGraph()
    this.ready = true
    this.dripNext = this.time + 1
    this.groanNext = this.time + 12
    this.glissNext = this.time + 8
    this.pulseNext = this.time + 1
    this.masterGain.gain.value = this.mutedState ? 0.0001 : this.masterLevel
    if (this.zoneDesired) this.setZone(this.zoneDesired)
    this.setTension(this.tensionTarget)
    this.unlock()
  }

  unlock() {
    if (this.ac && this.ac.state === 'suspended') {
      try {
        this.ac.resume()
      } catch (e) {}
    }
  }

  mute(m) {
    this.mutedState = !!m
    if (!this.ready) return
    const now = this.ac.currentTime
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setTargetAtTime(this.mutedState ? 0.0001 : this.masterLevel, now, 0.04)
  }

  setTension(t) {
    const v = Math.min(1, Math.max(0, Number(t) || 0))
    this.tensionTarget = v
    if (!this.ready) return
    const now = this.ac.currentTime
    this.padGain.gain.setTargetAtTime(v * v * 0.14, now, 0.5)
    this.padFilter.frequency.setTargetAtTime(180 + v * 650, now, 0.6)
  }

  heartbeat(on) {
    this.hbOn = !!on
    if (this.hbOn) this.hbNext = this.time
  }

  bossLayer(on) {
    this.bossOn = !!on
    this.bossBeat = 0
    if (this.bossOn) this.bossNext = this.time
  }

  setZone(zone) {
    this.zoneDesired = zone
    if (!this.ready) return
    const now = this.ac.currentTime
    for (const [name, bed] of this.beds) {
      if (name === zone) continue
      bed.gain.gain.cancelScheduledValues(now)
      bed.gain.gain.setValueAtTime(bed.gain.gain.value, now)
      bed.gain.gain.linearRampToValueAtTime(0.0001, now + 2)
      for (const s of bed.sources) {
        try {
          s.stop(now + 2.15)
        } catch (e) {}
      }
      this.beds.delete(name)
    }
    let bed = this.beds.get(zone)
    if (!bed) {
      bed = this._buildBed(zone)
      this.beds.set(zone, bed)
    }
    bed.gain.gain.cancelScheduledValues(now)
    bed.gain.gain.setValueAtTime(bed.gain.gain.value, now)
    bed.gain.gain.linearRampToValueAtTime(ZONE_LEVELS[zone] || 1, now + 2)
    this.zoneActive = zone
  }

  play(name, opts) {
    const o = opts || {}
    if (!this.ready) {
      if (name === 'wisp_hum' && o.loop) return { id: -1, stop: () => {} }
      return false
    }
    if (name === 'wisp_hum') {
      if (o.loop) return this._startWisp(o)
      return false
    }
    const fn = this.oneShots[name]
    if (!fn) return false
    if (!this._cooldownOk(name)) return false
    const v = o.volume == null ? 1 : Math.max(0, o.volume)
    const r = o.rate == null ? 1 : Math.max(0.05, o.rate)
    fn(v, r)
    return true
  }

  update(dt, ctx) {
    if (!ctx) return
    const d = Number(dt) || 0
    this.time += d
    if (typeof ctx.zone === 'string' && ctx.zone !== this.state.zone) this.setZone(ctx.zone)
    if (typeof ctx.tension === 'number') this.setTension(ctx.tension)
    if ('threatNear' in ctx) this.state.threatNear = !!ctx.threatNear
    if ('inWater' in ctx) this.state.inWater = !!ctx.inWater
    if ('moving' in ctx) this.state.moving = !!ctx.moving
    if ('onGround' in ctx) this.state.onGround = !!ctx.onGround
    this.state.zone = this.zoneDesired || this.state.zone
    this.state.tension = this.tensionTarget
    if (!this.ready || d <= 0) return
    this.tensionSmooth += (this.tensionTarget - this.tensionSmooth) * Math.min(1, d * 3)
    this.strideInterval = 0.34 - 0.06 * this.tensionSmooth
    this._tickFootsteps(d)
    this._tickHeartbeat()
    this._tickBoss()
    this._tickZoneEvents()
  }

  dispose() {
    if (!this.ac) return
    const now = this.ac.currentTime
    for (const [, bed] of this.beds) {
      for (const s of bed.sources) {
        try {
          s.stop(now)
        } catch (e) {}
      }
      try {
        bed.gain.disconnect()
      } catch (e) {}
    }
    this.beds.clear()
    for (const [, l] of this.loops) {
      for (const o of l.oscs) {
        try {
          o.stop(now)
        } catch (e) {}
      }
      try {
        l.gain.disconnect()
      } catch (e) {}
    }
    this.loops.clear()
    for (const o of this.graphOscs) {
      try {
        o.stop(now)
      } catch (e) {}
    }
    for (const n of this.graphNodes) {
      try {
        n.disconnect()
      } catch (e) {}
    }
    try {
      this.ac.close()
    } catch (e) {}
    this.ac = null
    this.ready = false
    this.zoneActive = null
  }

  _cooldownOk(name) {
    const now = this._clock()
    if (SCARE_STINGERS.has(name)) {
      if (now - this.lastScare < 45) return false
      const last = this.lastPlay.get(name)
      if (last != null && now - last < 45) return false
      this.lastScare = now
      this.lastPlay.set(name, now)
      return true
    }
    const gap = COMBAT_HITS.has(name) ? 0.15 : 0.05
    const last = this.lastPlay.get(name)
    if (last != null && now - last < gap) return false
    this.lastPlay.set(name, now)
    return true
  }

  _buildGraph() {
    const ac = this.ac
    this.graphNodes = []
    this.graphOscs = []
    this.masterGain = ac.createGain()
    this.comp = ac.createDynamicsCompressor()
    this.comp.threshold.value = -18
    this.comp.knee.value = 24
    this.comp.ratio.value = 4
    this.comp.attack.value = 0.004
    this.comp.release.value = 0.18
    this.masterGain.connect(this.comp)
    this.comp.connect(ac.destination)
    const bus = (level) => {
      const g = ac.createGain()
      g.gain.value = level
      g.connect(this.masterGain)
      this.graphNodes.push(g)
      return g
    }
    this.sfxBus = bus(0.62)
    this.uiBus = bus(0.5)
    this.ambientBus = bus(0.95)
    this.padBus = bus(0.85)
    this.heartBus = bus(0.8)
    this.bossBus = bus(0.75)
    this.padFilter = ac.createBiquadFilter()
    this.padFilter.type = 'bandpass'
    this.padFilter.frequency.value = 200
    this.padFilter.Q.value = 1.4
    this.padGain = ac.createGain()
    this.padGain.gain.value = 0
    this.padFilter.connect(this.padGain)
    this.padGain.connect(this.padBus)
    const sawA = ac.createOscillator()
    sawA.type = 'sawtooth'
    sawA.frequency.value = 108
    const sawB = ac.createOscillator()
    sawB.type = 'sawtooth'
    sawB.frequency.value = 108.7
    const beat = ac.createOscillator()
    beat.type = 'sine'
    beat.frequency.value = 0.13
    const beatDepth = ac.createGain()
    beatDepth.gain.value = 4
    beat.connect(beatDepth)
    beatDepth.connect(sawB.detune)
    sawA.connect(this.padFilter)
    sawB.connect(this.padFilter)
    sawA.start()
    sawB.start()
    beat.start()
    this.graphOscs.push(sawA, sawB, beat)
    this.graphNodes.push(this.padFilter, this.padGain, beatDepth)
  }

  _noiseBuffer(kind) {
    const key = kind === 'white' ? 'white2' : 'pink4'
    let buf = this.noiseBuffers.get(key)
    if (!buf) {
      const sr = this.ac.sampleRate
      if (kind === 'white') {
        buf = this.ac.createBuffer(1, sr * 2, sr)
        const d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      } else {
        buf = this.ac.createBuffer(1, sr * 4, sr)
        const d = buf.getChannelData(0)
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
        for (let i = 0; i < d.length; i++) {
          const w = Math.random() * 2 - 1
          b0 = 0.99886 * b0 + w * 0.0555179
          b1 = 0.99332 * b1 + w * 0.0750759
          b2 = 0.969 * b2 + w * 0.153852
          b3 = 0.8665 * b3 + w * 0.3104856
          b4 = 0.55 * b4 + w * 0.5329522
          b5 = -0.7616 * b5 - w * 0.016898
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
          b6 = w * 0.115926
        }
      }
      this.noiseBuffers.set(key, buf)
    }
    return buf
  }

  _src(loop, kind) {
    const s = this.ac.createBufferSource()
    s.buffer = this._noiseBuffer(kind)
    s.loop = !!loop
    return s
  }

  _filter(type, freq, q) {
    const f = this.ac.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q == null ? 0.7 : q
    return f
  }

  _gainNode(v) {
    const g = this.ac.createGain()
    g.gain.value = v == null ? 1 : v
    return g
  }

  _osc(type, freq) {
    const o = this.ac.createOscillator()
    o.type = type
    o.frequency.value = freq
    return o
  }

  _burst(o) {
    const ac = this.ac
    const t0 = o.when == null ? ac.currentTime : o.when
    const s = this._src(false, o.kind || 'white')
    const fl = this._filter(o.filter || 'bandpass', o.f0 == null ? 800 : o.f0, o.q)
    const g = this._gainNode(0.0001)
    s.connect(fl)
    fl.connect(g)
    g.connect(o.dest || this.sfxBus)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(o.peak == null ? 0.3 : o.peak, t0 + (o.attack == null ? 0.003 : o.attack))
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
    if (o.f1 != null) {
      fl.frequency.setValueAtTime(o.f0 == null ? 800 : o.f0, t0)
      fl.frequency.linearRampToValueAtTime(o.f1, t0 + o.dur)
    }
    s.start(t0)
    s.stop(t0 + o.dur + 0.05)
    return s
  }

  _tone(o) {
    const ac = this.ac
    const t0 = o.when == null ? ac.currentTime : o.when
    const osc = this._osc(o.type || 'sine', o.f0 == null ? 220 : o.f0)
    const g = this._gainNode(0.0001)
    osc.connect(g)
    g.connect(o.dest || this.sfxBus)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(o.peak == null ? 0.2 : o.peak, t0 + (o.attack == null ? 0.004 : o.attack))
    g.gain.exponentialRampToValueAtTime(o.end == null ? 0.0001 : o.end, t0 + o.dur)
    if (o.f1 != null) {
      osc.frequency.setValueAtTime(o.f0 == null ? 220 : o.f0, t0)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + (o.glideDur == null ? o.dur : o.glideDur))
    }
    osc.start(t0)
    osc.stop(t0 + o.dur + 0.05)
    return osc
  }

  _buildBed(zone) {
    const ac = this.ac
    const bed = { gain: this._gainNode(0.0001), sources: [], extras: {} }
    bed.gain.connect(this.ambientBus)
    this.graphNodes.push(bed.gain)
    const track = (n) => {
      bed.sources.push(n)
      return n
    }
    if (zone === 'nave') {
      const air = track(this._src(true, 'white'))
      const hp = this._filter('highpass', 1000, 0.5)
      const gAir = this._gainNode(0.045)
      air.connect(hp)
      hp.connect(gAir)
      gAir.connect(bed.gain)
      const sway = this._osc('sine', 0.05)
      const swayG = this._gainNode(0.014)
      sway.connect(swayG)
      swayG.connect(gAir.gain)
      sway.start()
      air.start()
      const d1 = track(this._osc('sine', 55))
      const gD1 = this._gainNode(0.05)
      d1.connect(gD1)
      gD1.connect(bed.gain)
      d1.start()
      const d2 = track(this._osc('triangle', 58))
      const gD2 = this._gainNode(0.032)
      d2.connect(gD2)
      gD2.connect(bed.gain)
      d2.start()
      this.graphNodes.push(hp, gAir, swayG, gD1, gD2)
      this.graphOscs.push(sway)
    } else if (zone === 'warrens') {
      const wet = track(this._src(true, 'pink'))
      const lp = this._filter('lowpass', 380, 0.8)
      const gW = this._gainNode(0.095)
      wet.connect(lp)
      lp.connect(gW)
      gW.connect(bed.gain)
      wet.start()
      const murk = track(this._src(true, 'pink'))
      const bp = this._filter('bandpass', 160, 1.1)
      const gM = this._gainNode(0.05)
      murk.connect(bp)
      bp.connect(gM)
      gM.connect(bed.gain)
      murk.start()
      this.graphNodes.push(lp, gW, bp, gM)
    } else if (zone === 'gallery') {
      const rumble = track(this._src(true, 'pink'))
      const lp = this._filter('lowpass', 130, 0.7)
      const gR = this._gainNode(0.085)
      rumble.connect(lp)
      lp.connect(gR)
      gR.connect(bed.gain)
      rumble.start()
      const swell = this._osc('sine', 0.06)
      const swellG = this._gainNode(0.035)
      swell.connect(swellG)
      swellG.connect(gR.gain)
      swell.start()
      const watery = track(this._src(true, 'pink'))
      const wp = this._filter('bandpass', 420, 1.2)
      const gP = this._gainNode(0.012)
      watery.connect(wp)
      wp.connect(gP)
      gP.connect(bed.gain)
      watery.start()
      this.graphNodes.push(lp, gR, swellG, wp, gP)
      this.graphOscs.push(swell)
    } else if (zone === 'sanctum') {
      const sub = track(this._osc('sine', 40))
      const gSub = this._gainNode(0.0001)
      sub.connect(gSub)
      gSub.connect(bed.gain)
      sub.start()
      bed.extras.subGain = gSub
      const haze = track(this._src(true, 'pink'))
      const hz = this._filter('bandpass', 600, 0.6)
      const gH = this._gainNode(0.014)
      haze.connect(hz)
      hz.connect(gH)
      gH.connect(bed.gain)
      haze.start()
      this.graphNodes.push(gSub, hz, gH)
    } else {
      const generic = track(this._src(true, 'pink'))
      const glp = this._filter('lowpass', 300, 0.7)
      const gG = this._gainNode(0.06)
      generic.connect(glp)
      glp.connect(gG)
      gG.connect(bed.gain)
      generic.start()
      this.graphNodes.push(glp, gG)
    }
    return bed
  }

  _startWisp(opts) {
    const ac = this.ac
    const r = opts.rate == null ? 1 : Math.max(0.05, opts.rate)
    const v = opts.volume == null ? 1 : Math.max(0, opts.volume)
    const id = ++this.loopSeq
    const g = this._gainNode(0.0001)
    const lp = this._filter('lowpass', 1200, 0.6)
    const o1 = this._osc('sine', 512 * r)
    const o2 = this._osc('sine', 516.5 * r)
    const vib = this._osc('sine', 4.5)
    const vibG = this._gainNode(6)
    vib.connect(vibG)
    vibG.connect(o1.detune)
    vibG.connect(o2.detune)
    o1.connect(lp)
    o2.connect(lp)
    lp.connect(g)
    g.connect(this.sfxBus)
    const now = ac.currentTime
    g.gain.setValueAtTime(0.0001, now)
    g.gain.linearRampToValueAtTime(0.06 * v, now + 0.8)
    o1.start(now)
    o2.start(now)
    vib.start(now)
    const rec = { gain: g, oscs: [o1, o2, vib] }
    this.loops.set(id, rec)
    const self = this
    return {
      id,
      stop() {
        const lrec = self.loops.get(id)
        if (!lrec) return
        self.loops.delete(id)
        const t = self.ac.currentTime
        lrec.gain.gain.cancelScheduledValues(t)
        lrec.gain.gain.setValueAtTime(lrec.gain.gain.value, t)
        lrec.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
        for (const o of lrec.oscs) {
          try {
            o.stop(t + 0.5)
          } catch (e) {}
        }
      }
    }
  }

  _tickFootsteps(d) {
    if (this.state.moving && this.state.onGround) {
      this.strideAccum += d
      if (this.strideAccum >= this.strideInterval) {
        this.strideAccum = -Math.random() * 0.06
        this.play(this.state.inWater ? 'step_water' : 'step_stone', { volume: 0.9 })
      }
    } else {
      this.strideAccum = 0
    }
  }

  _tickHeartbeat() {
    if (!this.hbOn) return
    if (this.time > this.hbNext + 2) this.hbNext = this.time
    const f = this.state.threatNear ? Math.max(this.tensionSmooth, 0.85) : this.tensionSmooth
    while (this.time >= this.hbNext) {
      this._heartPair()
      this.hbNext += 60 / Math.min(95, Math.max(55, 55 + 40 * f))
    }
  }

  _heartPair() {
    const t = this.ac.currentTime
    this._tone({ when: t, type: 'sine', f0: 58, f1: 38, dur: 0.14, peak: 0.5, attack: 0.005, dest: this.heartBus })
    this._tone({ when: t + 0.16, type: 'sine', f0: 52, f1: 36, dur: 0.12, peak: 0.34, attack: 0.005, dest: this.heartBus })
  }

  _tickBoss() {
    if (!this.bossOn) return
    if (this.time > this.bossNext + 2) this.bossNext = this.time
    while (this.time >= this.bossNext) {
      this._bossThump(this.bossBeat % 4 === 0)
      this.bossBeat++
      this.bossNext += 0.46
    }
  }

  _bossThump(accent) {
    const t = this.ac.currentTime
    this._tone({ when: t, type: 'sine', f0: 54, f1: 34, dur: 0.3, peak: accent ? 0.5 : 0.28, attack: 0.004, dest: this.bossBus })
    this._burst({ when: t, filter: 'lowpass', f0: 320, dur: 0.07, peak: accent ? 0.16 : 0.08, dest: this.bossBus })
    if (accent) {
      this._tone({ when: t + 0.23, type: 'sine', f0: 50, f1: 33, dur: 0.24, peak: 0.24, attack: 0.004, dest: this.bossBus })
    }
  }

  _tickZoneEvents() {
    if (this.zoneActive === 'warrens' && this.time >= this.dripNext) {
      this.dripNext = this.time + 0.6 + Math.random() * 1.8
      this._drip()
    }
    if (this.zoneActive === 'gallery' && this.time >= this.groanNext) {
      this.groanNext = this.time + 14 + Math.random() * 16
      this._groan()
    }
    if (this.zoneActive === 'sanctum') {
      if (this.time >= this.pulseNext) {
        this.pulseNext = this.time + 2.4
        this._sanctumPulse()
      }
      if (this.time >= this.glissNext) {
        this.glissNext = this.time + 9 + Math.random() * 11
        this._glissando()
      }
    }
  }

  _drip() {
    const f = 700 + Math.random() * 1800
    const t = this.ac.currentTime
    const osc = this._osc('sine', f)
    const bp = this._filter('bandpass', f, 9)
    const g = this._gainNode(0.0001)
    osc.connect(bp)
    bp.connect(g)
    g.connect(this.ambientBus)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.09 + Math.random() * 0.05, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, f * 0.72), t + 0.11)
    osc.start(t)
    osc.stop(t + 0.16)
  }

  _groan() {
    const t = this.ac.currentTime
    const bp = this._filter('bandpass', 280, 2)
    const lp = this._filter('lowpass', 400, 0.7)
    const g = this._gainNode(0.0001)
    bp.connect(lp)
    lp.connect(g)
    g.connect(this.ambientBus)
    const o1 = this._osc('triangle', 165)
    const o2 = this._osc('triangle', 168.4)
    o1.connect(bp)
    o2.connect(bp)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.028, t + 0.8)
    g.gain.linearRampToValueAtTime(0.0001, t + 2.4)
    o1.frequency.setValueAtTime(165, t)
    o1.frequency.linearRampToValueAtTime(146, t + 2.4)
    o2.frequency.setValueAtTime(168.4, t)
    o2.frequency.linearRampToValueAtTime(149, t + 2.4)
    o1.start(t)
    o2.start(t)
    o1.stop(t + 2.5)
    o2.stop(t + 2.5)
  }

  _sanctumPulse() {
    const bed = this.beds.get('sanctum')
    if (!bed || !bed.extras.subGain) return
    const t = this.ac.currentTime
    const p = (w, pk) => {
      const gg = bed.extras.subGain.gain
      gg.setValueAtTime(0.0001, w)
      gg.linearRampToValueAtTime(pk, w + 0.08)
      gg.exponentialRampToValueAtTime(0.0001, w + 0.55)
    }
    p(t, 0.17)
    p(t + 0.34, 0.11)
  }

  _glissando() {
    const t = this.ac.currentTime
    const f0 = 1150 + Math.random() * 400
    const osc = this._osc('sine', f0)
    const g = this._gainNode(0.0001)
    osc.connect(g)
    g.connect(this.ambientBus)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.013, t + 1.3)
    g.gain.linearRampToValueAtTime(0.0001, t + 3.6)
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.linearRampToValueAtTime(f0 * 0.82, t + 3.6)
    osc.start(t)
    osc.stop(t + 3.7)
  }

  _stepStone(v, r) {
    const f = (520 + Math.random() * 480) * r
    this._burst({ filter: 'bandpass', f0: f, q: 1.2, dur: 0.09, peak: 0.28 * v, attack: 0.002 })
    this._tone({ type: 'sine', f0: 120 * r, f1: 80 * r, dur: 0.07, peak: 0.12 * v, attack: 0.002 })
  }

  _stepWater(v, r) {
    this._burst({ filter: 'bandpass', f0: 2200 * r, f1: 700 * r, q: 0.8, dur: 0.2, peak: 0.26 * v, attack: 0.004 })
    this._burst({ filter: 'highpass', f0: 3000, dur: 0.08, peak: 0.1 * v, attack: 0.002 })
  }

  _slash(v, r) {
    this._burst({ filter: 'bandpass', f0: 3600 * r, f1: 500 * r, q: 1, dur: 0.14, peak: 0.4 * v, attack: 0.003 })
    this._tone({ type: 'sawtooth', f0: 300 * r, f1: 90 * r, dur: 0.1, peak: 0.07 * v, attack: 0.003 })
  }

  _hitEnemy(v, r) {
    this._tone({ type: 'sine', f0: 190 * r, f1: 95 * r, dur: 0.12, peak: 0.42 * v, attack: 0.002 })
    this._burst({ filter: 'bandpass', f0: 800 * r, q: 1, dur: 0.05, peak: 0.18 * v, attack: 0.002 })
  }

  _hitPlayer(v, r) {
    this._tone({ type: 'sine', f0: 100 * r, f1: 48 * r, dur: 0.22, peak: 0.5 * v, attack: 0.002 })
    this._tone({ when: this.ac.currentTime + 0.02, type: 'triangle', f0: 1750 * r, dur: 0.06, peak: 0.11 * v, attack: 0.002 })
  }

  _enemyDie(v, r) {
    const t = this.ac.currentTime
    this._burst({ when: t, filter: 'lowpass', f0: 2600 * r, f1: 160 * r, dur: 0.38, peak: 0.42 * v, attack: 0.004 })
    this._tone({ when: t, type: 'square', f0: 210 * r, f1: 50 * r, dur: 0.32, peak: 0.16 * v, attack: 0.003 })
    this._burst({ when: t + 0.05, filter: 'bandpass', f0: 900 * r, q: 0.9, dur: 0.12, peak: 0.2 * v, attack: 0.002 })
  }

  _doorOpen(v, r) {
    const t = this.ac.currentTime
    this._burst({ when: t, filter: 'lowpass', f0: 140 * r, f1: 420 * r, q: 0.6, dur: 1.5, peak: 0.3 * v, attack: 0.18, kind: 'pink' })
    this._tone({ when: t, type: 'sawtooth', f0: 44 * r, f1: 52 * r, dur: 1.4, peak: 0.05 * v, attack: 0.25, dest: this.sfxBus })
    this._burst({ when: t + 1.42, filter: 'highpass', f0: 1200, dur: 0.03, peak: 0.2 * v, attack: 0.001 })
  }

  _itemGet(v, r) {
    const t = this.ac.currentTime
    const note = (when, f, pk, dur) => {
      this._tone({ when, type: 'sine', f0: f * r, dur, peak: pk * v, attack: 0.02 })
      this._tone({ when, type: 'sine', f0: (f + 1.5) * r, dur, peak: pk * 0.5 * v, attack: 0.02 })
      this._tone({ when, type: 'triangle', f0: f * 0.5 * r, dur: dur * 0.7, peak: pk * 0.3 * v, attack: 0.02 })
    }
    note(t, 392, 0.15, 0.75)
    note(t + 0.26, 466.16, 0.17, 1.15)
  }

  _checkpoint(v, r) {
    const t = this.ac.currentTime
    const partials = [
      [131 * r, 0.3, 2.6],
      [262.5 * r, 0.15, 2.0],
      [394 * r, 0.07, 1.4],
      [523 * r, 0.04, 0.9]
    ]
    for (const [f, pk, dur] of partials) {
      this._tone({ when: t, type: 'sine', f0: f, dur, peak: pk * v, attack: 0.004 })
    }
    this._burst({ when: t, filter: 'bandpass', f0: 2000, q: 1, dur: 0.03, peak: 0.1 * v, attack: 0.001 })
  }

  _stingerClose(v, r) {
    const t = this.ac.currentTime
    const eg = this._gainNode(0.0001)
    const bp = this._filter('bandpass', 700 * r, 0.8)
    bp.connect(eg)
    eg.connect(this.sfxBus)
    eg.gain.setValueAtTime(0.0001, t)
    eg.gain.linearRampToValueAtTime(1, t + 0.05)
    eg.gain.setValueAtTime(1, t + 0.45)
    eg.gain.linearRampToValueAtTime(0.0001, t + 0.58)
    const freqs = [415.3, 440, 466.16, 493.88]
    for (const f of freqs) {
      const o = this._osc('sawtooth', f * r)
      o.detune.value = (Math.random() * 2 - 1) * 9
      const og = this._gainNode(0.055)
      o.connect(og)
      og.connect(bp)
      o.start(t)
      o.stop(t + 0.62)
    }
    this._burst({
      when: t,
      filter: 'bandpass',
      f0: 2600 * r,
      q: 0.7,
      dur: 0.5,
      peak: 0.13 * v,
      attack: 0.12
    })
  }

  _stingerDiscover(v, r) {
    const t = this.ac.currentTime
    this._tone({ when: t, type: 'sine', f0: 58 * r, f1: 29 * r, dur: 0.9, peak: 0.55 * v, attack: 0.006 })
    const s = this._src(false, 'pink')
    const bp = this._filter('bandpass', 300 * r, 1)
    const g = this._gainNode(0.0001)
    s.connect(bp)
    bp.connect(g)
    g.connect(this.sfxBus)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.26 * Math.max(0.05, v), t + 0.62)
    g.gain.setValueAtTime(0.0001, t + 0.63)
    s.start(t)
    s.stop(t + 0.68)
  }

  _mawEmerge(v, r) {
    const t = this.ac.currentTime
    this._burst({ when: t, filter: 'lowpass', f0: 500 * r, f1: 180 * r, dur: 0.3, peak: 0.38 * v, attack: 0.01 })
    this._tone({ when: t, type: 'sawtooth', f0: 140 * r, f1: 34 * r, dur: 0.55, peak: 0.3 * v, attack: 0.01 })
    this._tone({ when: t, type: 'sine', f0: 70 * r, f1: 30 * r, dur: 0.5, peak: 0.28 * v, attack: 0.008 })
  }

  _bloomBurst(v, r) {
    const t = this.ac.currentTime
    this._tone({ when: t, type: 'sine', f0: 420 * r, f1: 920 * r, dur: 0.07, peak: 0.28 * v, attack: 0.003 })
    this._burst({ when: t, filter: 'highpass', f0: 4000, dur: 0.5, peak: 0.14 * v, attack: 0.005 })
    this._tone({ when: t, type: 'sine', f0: 180 * r, f1: 90 * r, dur: 0.12, peak: 0.14 * v, attack: 0.003 })
  }

  _uiMove(v, r) {
    this._tone({ type: 'square', f0: 900 * r, dur: 0.025, peak: 0.07 * v, attack: 0.001, dest: this.uiBus })
  }

  _uiConfirm(v, r) {
    const t = this.ac.currentTime
    this._tone({ when: t, type: 'sine', f0: 233 * r, dur: 0.5, peak: 0.13 * v, attack: 0.006, dest: this.uiBus })
    this._tone({ when: t + 0.02, type: 'sine', f0: 349 * r, dur: 0.45, peak: 0.08 * v, attack: 0.006, dest: this.uiBus })
  }
}
