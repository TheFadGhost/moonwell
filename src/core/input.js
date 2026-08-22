const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  Space: 'jump', KeyZ: 'jump',
  KeyJ: 'attack', KeyX: 'attack',
  KeyK: 'dash', KeyC: 'dash', ShiftLeft: 'dash',
  KeyE: 'interact',
  KeyF: 'toggleLight',
  KeyM: 'map', Tab: 'map',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm'
}

const held = new Set()
const pressedNow = new Set()

function onKeyDown(e) {
  const a = KEYMAP[e.code]
  if (!a) return
  if (['jump', 'map', 'pause', 'toggleLight', 'interact', 'confirm', 'attack', 'dash'].includes(a)) e.preventDefault()
  if (!held.has(a)) pressedNow.add(a)
  held.add(a)
}

function onKeyUp(e) {
  const a = KEYMAP[e.code]
  if (!a) return
  held.delete(a)
}

function onBlur() {
  held.clear()
}

export const input = {
  down(a) { return held.has(a) },
  pressed(a) { return pressedNow.has(a) },
  axis() {
    let x = 0
    if (held.has('left')) x -= 1
    if (held.has('right')) x += 1
    return x
  },
  endFrame() { pressedNow.clear() },
  attach() {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
  },
  detach() {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    held.clear(); pressedNow.clear()
  }
}
