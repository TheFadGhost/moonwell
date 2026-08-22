export const ABILITY_ORDER = ['lantern', 'umbral_step', 'veil_dash', 'claws']

export function createState() {
  return {
    player: {
      x: 0, y: 0, vx: 0, vy: 0, w: 20, h: 36,
      facing: 1, onGround: false, prevX: 0, prevY: 0,
      hp: 4, maxHp: 4, invuln: 0,
      oil: 100, maxOil: 100, lanternOn: true,
      dashCd: 0, dashing: 0, airDashUsed: false,
      abilities: new Set(),
      wallCling: false,
      attackCd: 0
    },
    flags: {
      doorsOpened: new Set(),
      itemsCollected: new Set(),
      elitesDefeated: new Set(),
      checkpointsActivated: new Set(),
      roomsVisited: new Set(),
      bossesDefeated: new Set(),
      scaresSeen: new Set()
    },
    shards: 0,
    currentRoom: 'nave_01',
    respawn: { room: 'nave_01', x: 0, y: 0 },
    time: 0,
    deaths: 0,
    tension: 0,
    paused: false,
    state: 'title'
  }
}

export const G = createState()

export const SAVE_KEYS = ['player', 'flags', 'currentRoom', 'respawn', 'time', 'deaths', 'shards']
