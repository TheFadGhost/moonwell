export class Progression {
  constructor(G) {
    this.G = G
    this.room = null
    this.transition = null
  }

  setRoom(room) {
    this.room = room
    this.transition = null
  }

  reqMet(req) {
    if (!req || req === 'none') return true
    if (req.startsWith('flag:')) return this.G.flags.bossesDefeated.has(req.slice(5))
    return this.G.player.abilities.has(req)
  }

  tileToWorld(tx, ty) {
    const h = (this.room && this.room.height) ? this.room.height : 0
    const y = h > 0 ? h * 32 - (ty * 32 + 16) : ty * 32 + 16
    return { x: tx * 32 + 16, y }
  }

  update(dt, player, inputApi, emit, audio) {
    const G = this.G
    const room = this.room
    if (!room || G.state !== 'playing') {
      G.interact = null
      return null
    }

    G.interact = null
    const pw = { x: player.x, y: player.y }

    for (const item of room.items || []) {
      if (G.flags.itemsCollected.has(item.id)) continue
      const w = this.tileToWorld(item.tx, item.ty)
      const d = Math.hypot(w.x - pw.x, w.y - pw.y)
      if (item.kind === 'lore') {
        if (d < 52) {
          G.interact = { text: 'Read' }
          if (inputApi.pressed('interact')) {
            G.flags.itemsCollected.add(item.id)
            emit('lore:show', { text: item.text })
            audio.play('ui_confirm')
          }
        }
        continue
      }
      if (d < 34) {
        this.collect(item, emit, audio)
      }
    }

    for (const cp of room.checkpoints || []) {
      const w = this.tileToWorld(cp.tx, cp.ty)
      const d = Math.hypot(w.x - pw.x, w.y - pw.y)
      if (d < 56) {
        if (!G.flags.checkpointsActivated.has(cp.id)) {
          G.interact = { text: 'Kindle' }
          if (inputApi.pressed('interact')) this.activateCheckpoint(cp, emit, audio)
        } else {
          G.interact = { text: 'Rest' }
          if (inputApi.pressed('interact')) this.activateCheckpoint(cp, emit, audio)
        }
      }
    }

    for (const door of room.doors || []) {
      const w = this.tileToWorld(door.tx, door.ty)
      const d = Math.hypot(w.x - pw.x, w.y - pw.y)
      if (d < 64) {
        const opened = G.flags.doorsOpened.has(door.id)
        if (opened) {
          G.interact = { text: 'Pass' }
          if (inputApi.pressed('interact')) {
            const s = door.spawn
            this.transition = { to: door.to || door.leadsTo, tx: s.tx, ty: s.ty }
            return this.transition
          }
        } else if (this.reqMet(door.requires)) {
          G.interact = { text: 'Unseal' }
          if (inputApi.pressed('interact')) {
            G.flags.doorsOpened.add(door.id)
            audio.play('door_open')
            emit('door:opened', { id: door.id })
          }
        } else {
          G.interact = { text: 'Sealed' }
        }
      }
    }

    const ts = 32
    const W = room.width * ts
    const H = room.height * ts
    const links = room.links || {}
    const ls = room.linkSpawns || {}
    if (links.left && pw.x < 22 && player.vx <= 1) {
      const s = ls.left
      if (s) {
        this.transition = { to: links.left, tx: s.tx, ty: s.ty }
        return this.transition
      }
    }
    if (links.right && pw.x > W - 22 && player.vx >= -1) {
      const s = ls.right
      if (s) {
        this.transition = { to: links.right, tx: s.tx, ty: s.ty }
        return this.transition
      }
    }
    if (links.up && pw.y > H - 26 && player.vy >= -50) {
      const s = ls.up
      if (s) {
        this.transition = { to: links.up, tx: s.tx, ty: s.ty }
        return this.transition
      }
    }
    if (links.down && pw.y < 26 && player.vy <= 50) {
      const s = ls.down
      if (s) {
        this.transition = { to: links.down, tx: s.tx, ty: s.ty }
        return this.transition
      }
    }

    return null
  }

  collect(item, emit, audio) {
    const G = this.G
    G.flags.itemsCollected.add(item.id)
    audio.play('item_get')
    if (item.kind === 'ability') {
      G.player.abilities.add(item.ability)
      emit('ability:unlocked', { id: item.ability })
      const names = {
        lantern: ['The Ashlantern', 'A pale flame that drinks oil and pushes back the dark. [F] to shutter it.'],
        umbral_step: ['Umbral Step', 'Your legs remember a second jump, stolen from shadow. Press jump again in air.'],
        veil_dash: ['Veil Dash', 'You can tear sideways through the dark itself. [Shift/C/K]'],
        claws: ['Gravewrought Claws', 'Grave-iron hooks grown from your knuckles. Slide down walls; leap between them.']
      }
      const n = names[item.ability]
      if (n) emit('lore:show', { text: `${n[0]} — ${n[1]}` })
    } else if (item.kind === 'shard') {
      G.shards += 1
      if (G.shards % 2 === 0) {
        G.player.maxHp += 1
        G.player.hp = G.player.maxHp
      }
    } else if (item.kind === 'oil') {
      G.player.oil = Math.min(G.player.maxOil, G.player.oil + 25)
    }
    emit('item:collected', { id: item.id, kind: item.kind })
  }

  activateCheckpoint(cp, emit, audio) {
    const G = this.G
    const first = !G.flags.checkpointsActivated.has(cp.id)
    G.flags.checkpointsActivated.add(cp.id)
    const w = this.tileToWorld(cp.tx, cp.ty)
    G.respawn = { room: G.currentRoom, x: w.x, y: w.y + 8 }
    G.player.hp = G.player.maxHp
    G.player.oil = G.player.maxOil
    G.player.lanternOn = true
    audio.play('checkpoint')
    emit('checkpoint', { id: cp.id, first })
    if (first) emit('lore:show', { text: 'A wellspring kindles. The dark recedes, for now.' })
  }
}
