import { createEnemy } from '../entities/enemy_base.js'
import '../entities/enemies/husk.js'
import '../entities/enemies/maw.js'
import '../entities/enemies/stalker.js'
import '../entities/enemies/bloom.js'
import '../entities/enemies/wisp.js'

function rectsOverlap(a, b) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h
}

export class EntityManager {
  constructor(G) {
    this.G = G
    this.enemies = []
    this.boss = null
    this.ctx = null
  }

  spawnRoom(room, world, lightfield, audio) {
    this.enemies.length = 0
    this.boss = null
    const G = this.G
    const emit = (name, payload) => this.emit(name, payload)
    this.ctx = {
      world,
      player: G.player,
      G,
      lightAt: (x, y) => lightfield.lightAt(x, y),
      emit,
      audio,
      snuff: (s) => this.snuffCb && this.snuffCb(s),
      spawnMinion: (type, opts) => this.spawnMinion(type, opts)
    }
    const roomH = room.height * 32
    for (const def of room.enemies || []) {
      const key = def.id || `${room.id}_${def.type}_${def.tx}_${def.ty}`
      if (def.elite && G.flags.elitesDefeated.has(key)) continue
      if (def.boss) {
        if (G.flags.bossesDefeated.has(def.type)) continue
        const w = { x: def.tx * 32 + 16, y: roomH - (def.ty * 32 + 16) }
        const e = createEnemy(def.type, { type: def.type }, w.x, w.y)
        this.boss = e
        this.enemies.push(e)
        continue
      }
      const w = { x: def.tx * 32 + 16, y: roomH - (def.ty * 32 + 16) }
      const e = createEnemy(def.type, def, w.x, w.y)
      e.roomKey = key
      this.enemies.push(e)
    }
  }

  on(name, cb) {
    if (name === 'snuff') this.snuffCb = cb
  }

  spawnMinion(type, opts = {}) {
    const e = createEnemy(type, { type, ...opts }, opts.x ?? 0, opts.y ?? 0)
    e.minion = true
    e.clone = !!opts.clone
    this.enemies.push(e)
    return e
  }

  emit(name, payload) {
    if (this.emitCb) this.emitCb(name, payload)
  }

  setEmitter(cb) {
    this.emitCb = cb
  }

  update(dt, player, attackBox, emit, audio) {
    const G = this.G
    const ctx = this.ctx
    if (!ctx) return
    ctx.player = G.player

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]
      e.update(dt, ctx)

      if (e.dead) {
        if (!e.minion && !e.clone && e !== this.boss && e.roomKey && !e.countedDead) {
          e.countedDead = true
          if (e.elite) G.flags.elitesDefeated.add(e.roomKey)
        }
        this.enemies.splice(i, 1)
        continue
      }

      const hb = e.hurtbox()
      if (e.touchDamage > 0 && Math.abs(hb.x - player.x) < 600 && Math.abs(hb.y - player.y) < 500) {
        if (rectsOverlap(hb, player) && player.invuln <= 0 && G.state === 'playing') {
          if (player.hurt(e.touchDamage, hb.x)) {
            audio.play('hit_player')
            emit('fx:hurt', {})
          }
        }
      }

      for (const atk of e.attacks || []) {
        if (!atk.active) continue
        if (rectsOverlap(atk, player) && player.invuln <= 0 && G.state === 'playing') {
          if (player.hurt(atk.dmg, atk.x)) {
            audio.play('hit_player')
            emit('fx:hurt', {})
          }
        }
      }

      if (attackBox && rectsOverlap(attackBox, hb)) {
        const kb = attackBox.x < hb.x ? 1 : -1
        if (e.takeHit(attackBox.dmg, kb)) {
          audio.play('hit_enemy')
          if (e.dead) {
            audio.play('enemy_die')
            emit('enemy:killed', { type: e.type, id: e.id })
          }
        }
      }

      for (const pr of e.projectiles || []) {
        pr.ttl -= dt
        const rect = { x: pr.x, y: pr.y, w: pr.r * 2, h: pr.r * 2 }
        if (pr.ttl > 0 && rectsOverlap(rect, player) && player.invuln <= 0 && G.state === 'playing') {
          if (player.hurt(pr.dmg, pr.x)) {
            audio.play('hit_player')
            emit('fx:hurt', {})
          }
          pr.ttl = 0
        }
      }
    }

    if (this.boss && !this.boss.dead) {
      G.bossHp = this.boss.hp
      G.bossMaxHp = this.boss.maxHp
    } else {
      G.bossHp = null
      G.bossMaxHp = null
    }
  }
}
