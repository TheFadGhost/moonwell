import * as THREE from 'three'
import { bus } from './core/events.js'
import { G, createState } from './core/state.js'
import { input } from './core/input.js'
import { saveGame, loadGame, wipeSave, hasSave } from './core/save.js'
import { PhysicsWorld } from './systems/physics.js'
import { LightField } from './systems/lightfield.js'
import { Lighting } from './systems/lighting.js'
import { Particles } from './fx/particles.js'
import { AudioManager } from './systems/audiomanager.js'
import { GameCamera } from './systems/camera.js'
import { RoomBuilder } from './world/roombuilder.js'
import { Progression } from './systems/progression.js'
import { HorrorDirector } from './systems/horror.js'
import { EntityManager } from './systems/entitymanager.js'
import { Player } from './entities/player.js'
import { getRoom, ROOMS, SPAWN } from './world/mapdata.js'
import { Hud } from './ui/hud.js'
import { Menus } from './ui/menus.js'
import { MapScreen } from './ui/mapscreen.js'
import { createPostPlane } from './fx/shaders.js'
import { makeEnemyMesh, animateBody } from './fx/bodies.js'
import { getSpriteAtlas } from './fx/textures.js'

const STEP = 1 / 60

class Game {
  constructor() {
    this.canvasWrap = document.getElementById('app')
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setClearColor(0x000000, 1)
    this.canvasWrap.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.cam = new GameCamera(() => window.innerWidth / window.innerHeight)
    this.cam.resize(window.innerWidth, window.innerHeight)

    this.physics = new PhysicsWorld(32)
    this.lightfield = new LightField()
    this.lighting = new Lighting(this.scene, this.lightfield)
    this.particles = new Particles(this.scene)
    this.audio = new AudioManager()
    this.builder = new RoomBuilder(this.scene)
    this.progression = new Progression(G)
    this.horror = new HorrorDirector(G, this.lightfield)
    this.entities = new EntityManager(G)
    this.player = new Player(G)

    const post = createPostPlane()
    this.postScene = new THREE.Scene()
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.postQuad = post
    this.postScene.add(post)
    this.postU = post.material.uniforms

    const atlas = getSpriteAtlas()
    this.glowSprite = atlas

    this.uiRoot = document.getElementById('ui')
    this.hud = new Hud()
    this.hud.mount(this.uiRoot)
    this.menus = new Menus()
    this.menus.mount(this.uiRoot)
    this.mapscreen = new MapScreen()
    this.mapscreen.mount(this.uiRoot)

    this.enemyViews = new Map()
    this.handle = null
    this.room = null
    this.acc = 0
    this.time = 0
    this.bossActive = null
    this.silhouette = null

    this.bindEvents()
    input.attach()

    G.hasSave = hasSave()
    bus.emit('save:exists', { value: G.hasSave })
    this.menus.show('title')

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight)
      this.cam.resize(window.innerWidth, window.innerHeight)
    })

    window.addEventListener('pointerdown', () => { this.audio.init(); this.audio.unlock() }, { once: true })
    window.addEventListener('keydown', () => { this.audio.init(); this.audio.unlock() }, { once: true })

    this.lastT = performance.now()
    this.fpsAcc = 0
    this.fpsN = 0
    this.qualityDropped = false
    requestAnimationFrame((t) => this.frame(t))
  }

  bindEvents() {
    bus.on('ui:newgame', () => {
      wipeSave()
      this.resetState(createState(), true)
      this.startRun(SPAWN.room, SPAWN.tx, SPAWN.ty)
    })
    bus.on('ui:continue', () => {
      const data = loadGame()
      if (!data) return
      this.resetState(data, false)
      const r = G.respawn && G.respawn.room ? G.respawn : { room: G.currentRoom, x: null }
      if (r.x == null) {
        const sp = SPAWN.room === r.room ? SPAWN : null
        this.startRun(r.room, sp ? sp.tx : 3, sp ? sp.ty : 3)
      } else {
        this.startRun(r.room, null, null, r.x, r.y)
      }
    })
    bus.on('ui:savequit', () => {
      saveGame(G)
      window.location.reload()
    })
    bus.on('ui:mute', (e) => this.audio.mute(!!(e && e.muted)))
    bus.on('ui:sfx', (e) => this.audio.play(e.name))
    bus.on('ui:title', () => window.location.reload())
    bus.on('ui:respawn-ready', () => this.respawn())

    bus.on('checkpoint', () => saveGame(G))
    bus.on('player:hurt', () => {
      this.postU.uHurt.value = Math.min(1, (this.postU.uHurt.value || 0) + 0.7)
      this.cam.shake(5, 0.25)
    })
    bus.on('fx:hurt', () => {
      this.postU.uHurt.value = Math.min(1, (this.postU.uHurt.value || 0) + 0.4)
    })
    bus.on('fx:shake', (e) => this.cam.shake((e && e.mag) || 7, (e && e.dur) || 0.35))
    bus.on('player:landed', (e) => {
      if (e.vy > 500) this.cam.shake(3, 0.15)
    })
    bus.on('warden:snuff', () => {
      this.audio.play('stinger_close', { volume: 0.8 })
      this.cam.shake(6, 0.5)
    })
    bus.on('boss:end', (e) => this.onBossEnd(e))

    bus.on('fx:silhouette', (e) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x05050a, transparent: true, opacity: 0.85 })
      const geo = new THREE.PlaneGeometry(26, 84)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(e.x, e.y, 30)
      this.scene.add(mesh)
      this.silhouette = { mesh, life: 0.7 }
    })
    bus.on('fx:collapse', (e) => {
      this.particles.emitBurst('dust', e.x, e.y + 40, { count: 24, speed: 120, life: 0.9, size: 6, color: 0x8a8478 })
    })

    this.entities.setEmitter((name, payload) => {
      if (name === 'enemy:killed') {
        const e = payload
        void e
      }
      bus.emit(name, payload)
    })
    this.entities.on('snuff', (s) => this.lightfield.snuffAll(s))
  }

  resetState(data, fresh) {
    const keepHasSave = G.hasSave
    Object.keys(G).forEach(k => delete G[k])
    Object.assign(G, data)
    G.player.abilities = new Set(data.player.abilities || [])
    for (const key of ['doorsOpened', 'itemsCollected', 'elitesDefeated', 'checkpointsActivated', 'roomsVisited', 'bossesDefeated', 'scaresSeen']) {
      G.flags[key] = new Set(data.flags[key] || [])
    }
    G.hasSave = fresh ? false : keepHasSave
    G.state = 'playing'
    this.player = new Player(G)
    G.stats = { exploration: 0 }
  }

  startRun(roomId, tx, ty, px, py) {
    G.state = 'playing'
    this.loadRoom(roomId)
    if (px != null) {
      G.player.x = px
      G.player.y = py
    } else {
      const w = this.progression.tileToWorld(tx, ty)
      G.player.x = w.x
      G.player.y = w.y + 20
    }
    if (!G.flags.checkpointsActivated.size && !G.respawn.x) {
      G.respawn = { room: roomId, x: G.player.x, y: G.player.y }
    }
    this.cam.snap(G.player.x, G.player.y)
    this.audio.init()
    this.audio.unlock()
    this.audio.setZone(G.zone)
    this.menus.hide()
    this.hud.show()
    this.audio.play('item_get', { volume: 0.4 })
  }

  loadRoom(roomId) {
    const room = getRoom(roomId)
    const prevZone = G.zone
    this.builder.dispose(this.handle)
    this.lighting.clearRoom()
    this.handle = this.builder.build(room, { glowSprite: this.glowSprite })
    this.physics.loadRoom(room)

    if (!room._lightsNorm) {
      room._lightsNorm = (room.lights || []).map(l => ({
        tx: l.tx, ty: l.ty,
        r: (l.radius || l.r || 5) * 32,
        i: l.i == null ? 0.85 : l.i
      }))
    }
    const normRoom = Object.assign({}, room, { lights: room._lightsNorm })
    this.lighting.setRoom(normRoom)

    this.lightfield.clearTemporaries()
    this.lighting.attachLantern(G.player.x || 100, G.player.y || 100)

    this.entities.spawnRoom(room, this.physics, this.lightfield, this.audio)
    this.rebuildEnemyViews()

    this.particles.clearAmbient()
    const zoneParticles = { nave: 'dust', warrens: 'spores', gallery: 'motes', sanctum: 'embers' }[room.zone]
    this.particles.attachAmbient(zoneParticles, { x: 64, y: 64, w: room.width * 32 - 128, h: room.height * 32 - 128 })

    const first = !G.flags.roomsVisited.has(roomId)
    G.flags.roomsVisited.add(roomId)
    const from = G.currentRoom
    G.currentRoom = roomId
    G.roomName = room.name || room.id
    G.zone = room.zone
    G.inWater = false
    this.room = room
    this.progression.setRoom(room)
    this.horror.setRoom(room)

    bus.emit('room:enter', { from, to: roomId })
    if (prevZone !== room.zone) bus.emit('zone:enter', { zone: room.zone })
    this.audio.setZone(room.zone)
    void first
  }

  rebuildEnemyViews() {
    for (const v of this.enemyViews.values()) this.scene.remove(v.mesh)
    this.enemyViews.clear()
    for (const e of this.entities.enemies) {
      const mesh = makeEnemyMesh(e.type, this.glowSprite)
      mesh.traverse(o => { if (o.isMesh) o.castShadow = true })
      this.scene.add(mesh)
      this.enemyViews.set(e.id, { mesh, enemy: e })
    }
  }

  respawn() {
    const r = G.respawn
    G.player.hp = G.player.maxHp
    G.player.oil = G.player.maxOil
    G.player.lanternOn = true
    G.player.vx = 0
    G.player.vy = 0
    G.player.invuln = 1.2
    G.tension = 0
    G.state = 'playing'
    this.startRun(r.room, null, null, r.x, r.y)
    this.hud.show()
  }

  onBossEnd(e) {
    if (!e.victory) return
    G.flags.bossesDefeated.add(e.id)
    this.audio.bossLayer(false)
    this.audio.heartbeat(false)
    this.bossActive = null
    G.bossHp = null
    if (e.id === 'sacristan') {
      bus.emit('lore:show', { text: 'The Sacristan collapses into ash. Something behind the altar unseals.' })
      const gate = this.room.doors.find(d => d.requires === 'flag:sacristan_dead')
      if (gate) {
        G.flags.doorsOpened.add(gate.id)
        this.audio.play('door_open')
      }
    } else if (e.id === 'warden') {
      this.endGame()
    }
  }

  endGame() {
    G.state = 'ending'
    this.hud.hide()
    G.stats.exploration = G.flags.roomsVisited.size / ROOMS.length
    setTimeout(() => {
      this.menus.show('ending', {
        stats: {
          time: fmtTime(G.time),
          deaths: G.deaths,
          exploration: Math.round(G.stats.exploration * 100)
        }
      })
    }, 2200)
    this.cam.shake(10, 0.8)
    this.audio.play('stinger_discover', { volume: 0.9 })
  }

  maybeStartBoss() {
    if (!this.room || !this.room.boss || this.bossActive) return
    if (G.flags.bossesDefeated.has(this.room.boss.type)) return
    const bossEnt = this.entities.boss
    if (!bossEnt || bossEnt.dead) return
    const d = Math.abs(bossEnt.body.x - G.player.x)
    if (d < 300 && Math.abs(bossEnt.body.y - G.player.y) < 400) {
      this.bossActive = this.room.boss.type
      bus.emit('boss:start', { name: bossEnt.type === 'warden' ? 'Warden of the Moonwell' : 'The Sacristan' })
      this.audio.bossLayer(true)
      this.audio.play('stinger_discover', { volume: 0.8 })
      G.tension = 1
    }
  }

  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt))
    let dt = (t - this.lastT) / 1000
    this.lastT = t
    if (dt > 0.25) dt = 0.25

    this.fpsAcc += dt
    this.fpsN++
    if (this.fpsAcc >= 5) {
      const fps = this.fpsN / this.fpsAcc
      if (fps < 42 && !this.qualityDropped) {
        this.qualityDropped = true
        this.renderer.setPixelRatio(1)
        this.renderer.shadowMap.enabled = false
      }
      this.fpsAcc = 0
      this.fpsN = 0
    }

    const playing = G.state === 'playing'

    if (input.pressed('pause') && (G.state === 'playing' || G.state === 'paused')) {
      if (G.state === 'playing') {
        G.state = 'paused'
        this.menus.show('pause')
      } else {
        G.state = 'playing'
        this.menus.hide()
      }
    }
    if (input.pressed('map') && playing) this.mapscreen.toggle()
    if (this.mapscreen.visible && input.pressed('jump')) this.mapscreen.toggle()

    const active = playing && !this.mapscreen.visible

    if (active || G.state === 'ending') {
      this.acc += dt
      let steps = 0
      while (this.acc >= STEP && steps < 5) {
        this.step(STEP)
        this.acc -= STEP
        steps++
      }
      if (steps === 5) this.acc = 0
      G.time += dt
    }

    this.render(dt)
    input.endFrame()
  }

  step(dt) {
    const p = G.player

    if (G.state === 'playing') {
      this.player.update(dt, input, this.physics, (n, pay) => bus.emit(n, pay))
      const trans = this.progression.update(dt, p, input, (n, pay) => bus.emit(n, pay), this.audio)
      if (trans) {
        this.loadRoom(trans.to)
        const w = this.progression.tileToWorld(trans.tx, trans.ty)
        p.x = w.x
        p.y = w.y + 20
        p.vx = 0
        this.cam.snap(p.x, p.y)
        return
      }
      this.maybeStartBoss()

      const feetChar = this.charAtFeet()
      G.inWater = feetChar === '~'
    } else {
      this.player.update(dt, input, this.physics, (n, pay) => bus.emit(n, pay))
    }

    this.lightfield.update(dt)
    this.lighting.update(dt, p, G.zone)

    const attackBox = this.player.attackBox()
    if (attackBox && attackBox.w > 0) {
      this.particles.emitBurst('motes', attackBox.x + attackBox.w * 0.4 * (p.facing || 1), attackBox.y, { count: 2, speed: 40, life: 0.18, size: 3, color: 0xcfd8ff })
    }
    this.entities.update(dt, p, attackBox, (n, pay) => bus.emit(n, pay), this.audio)

    this.horror.update(dt, this.entities.enemies.filter(e => !e.dead), (n, pay) => bus.emit(n, pay), this.audio)

    if (p.hp <= 0 && G.state === 'playing') {
      G.deaths++
      G.state = 'dead'
      this.audio.heartbeat(false)
      this.audio.bossLayer(false)
      this.bossActive = null
      this.menus.show('death')
    }

    this.syncEnemyVisuals(dt)
    this.builder.update(dt, this.time += dt, this.handle, G)
    this.particles.update(dt)
    this.hud.update(dt, G)
    this.menus.update(dt, G)
    this.mapscreen.update(dt, G)

    if (this.silhouette) {
      this.silhouette.life -= dt
      this.silhouette.mesh.material.opacity = Math.max(0, this.silhouette.life / 0.7)
      if (this.silhouette.life <= 0) {
        this.scene.remove(this.silhouette.mesh)
        this.silhouette = null
      }
    }

    this.postU.uTime.value = this.time
    this.postU.uHurt.value = Math.max(0, (this.postU.uHurt.value || 0) - dt * 1.8)
    this.postU.uDread.value = G.tension * 0.35
    this.postU.uVignette.value = 0.55 + G.tension * 0.18
  }

  charAtFeet() {
    if (!this.room) return '.'
    const p = G.player
    const H = this.room.height * 32
    const tx = Math.floor(p.x / 32)
    const ty = Math.floor((H - p.y - 14) / 32)
    const row = this.room.rows[ty] || ''
    return row[tx] || '.'
  }

  syncEnemyVisuals(dt) {
    for (const [id, entry] of this.enemyViews) {
      const e = entry.enemy
      if (e.dead) {
        this.scene.remove(entry.mesh)
        this.enemyViews.delete(id)
        this.particles.emitBurst('motes', e.body.x, e.body.y, { count: 14, speed: 90, life: 0.5, size: 4, color: 0x553322 })
        continue
      }
      const v = e.view()
      entry.mesh.position.set(e.body.x, e.body.y, 4)
      animateBody(entry.mesh, v, dt)
      entry.mesh.visible = v.alpha > 0.02
      entry.mesh.traverse(o => {
        if (o.isMesh && o.material && o.material.transparent !== undefined) {
          if (v.alpha < 1) {
            o.material.transparent = true
            o.material.opacity = v.alpha
          }
        }
      })
    }
  }

  render(dt) {
    this.cam.update(dt, G.player, this.room ? {
      minX: 32, maxX: this.room.width * 32 - 32,
      minY: 32, maxY: this.room.height * 32 - 32
    } : null)

    this.renderer.render(this.scene, this.cam.cam)
    this.renderer.autoClear = false
    this.renderer.render(this.postScene, this.postCam)
    this.renderer.autoClear = true
  }
}

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

bus.on('fx:silhouette', (e) => {
  void e
})

window.addEventListener('DOMContentLoaded', () => {
  new Game()
})
