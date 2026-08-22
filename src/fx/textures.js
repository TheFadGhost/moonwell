import * as THREE from 'three'
import { mulberry32 } from '../core/rng.js'

const cache = new Map()
const TILE_PX = 64
const DECO_PX = 128
const SPRITE_PX = 32
export const SPRITE_FRAMES = { dust: 0, spore: 1, ember: 2, mote: 3, splash: 4, glow: 5 }
const ATLAS_COLS = 3
const ATLAS_ROWS = 2

function hexRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
}

function rgbCss(c) {
  return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'
}

function mix(c1, c2, t) {
  return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t]
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function valueNoise(seed, cells) {
  const rnd = mulberry32(seed)
  const lat = new Float32Array(cells * cells)
  for (let i = 0; i < lat.length; i++) lat[i] = rnd()
  return function (u, v) {
    const x = u * cells
    const y = v * cells
    const fx = Math.floor(x)
    const fy = Math.floor(y)
    const xi = ((fx % cells) + cells) % cells
    const yi = ((fy % cells) + cells) % cells
    const x1 = (xi + 1) % cells
    const y1 = (yi + 1) % cells
    let xf = x - fx
    let yf = y - fy
    xf = xf * xf * (3 - 2 * xf)
    yf = yf * yf * (3 - 2 * yf)
    const a = lat[yi * cells + xi]
    const b = lat[yi * cells + x1]
    const c = lat[y1 * cells + xi]
    const d = lat[y1 * cells + x1]
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf
  }
}

function fbmFactory(seed) {
  const n1 = valueNoise(seed, 4)
  const n2 = valueNoise(seed ^ 0x9e37, 8)
  const n3 = valueNoise(seed ^ 0x51ab, 16)
  return function (u, v) {
    return n1(u, v) * 0.5 + n2(u, v) * 0.3 + n3(u, v) * 0.2
  }
}

function makeCanvas(w, h) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return cv
}

const PALETTES = {
  nave: { dark: hexRgb(0x1d2531), mid: hexRgb(0x2e3b49), light: hexRgb(0x44556a), feature: '#141b24', accent: '#5a6d84' },
  warrens: { dark: hexRgb(0x241f12), mid: hexRgb(0x39301c), light: hexRgb(0x4d5a2e), feature: '#181408', accent: '#6b7a3a' },
  gallery: { dark: hexRgb(0x0c2026), mid: hexRgb(0x15353d), light: hexRgb(0x205059), feature: '#071318', accent: '#2e6e5a' },
  sanctus: { dark: hexRgb(0x070709), mid: hexRgb(0x101014), light: hexRgb(0x1c1c24), feature: '#000000', accent: '#9aa6bc' }
}
PALETTES.sanctum = PALETTES.sanctus

const ZONE_SEEDS = { nave: 11, warrens: 22, gallery: 33, sanctus: 44, sanctum: 44 }

function normZone(zone) {
  return PALETTES[zone] ? zone : 'nave'
}

function palOf(zone) {
  return PALETTES[normZone(zone)]
}

function seedOf(zone, salt) {
  return ((ZONE_SEEDS[normZone(zone)] || 11) * 7919 + salt) >>> 0
}

function paintNoiseBase(ctx, size, pal, seed) {
  const img = ctx.createImageData(size, size)
  const d = img.data
  const f = fbmFactory(seed)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = clamp01((f(x / size, y / size) - 0.18) / 0.64)
      const c = v < 0.5 ? mix(pal.dark, pal.mid, v * 2) : mix(pal.mid, pal.light, (v - 0.5) * 2)
      const o = (y * size + x) * 4
      d[o] = c[0]
      d[o + 1] = c[1]
      d[o + 2] = c[2]
      d[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

function cracks(ctx, size, seed, color, count, width) {
  const rnd = mulberry32(seed)
  ctx.strokeStyle = color
  ctx.lineWidth = width || 1
  ctx.lineCap = 'round'
  for (let c = 0; c < count; c++) {
    let x = rnd() * size
    let y = rnd() * size
    let ang = rnd() * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    const segs = 3 + Math.floor(rnd() * 3)
    for (let s = 0; s < segs; s++) {
      ang += (rnd() - 0.5) * 1.5
      x += Math.cos(ang) * (4 + rnd() * 9)
      y += Math.sin(ang) * (4 + rnd() * 9)
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

function veins(ctx, size, seed, color, count, width) {
  const rnd = mulberry32(seed)
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  for (let c = 0; c < count; c++) {
    const sx = rnd() * size
    const sy = rnd() * size
    const mx = sx + (rnd() - 0.5) * size * 0.7
    const my = sy + rnd() * size * 0.6
    const ex = sx + (rnd() - 0.5) * size * 0.9
    const ey = sy + rnd() * size * 0.8
    ctx.lineWidth = width * (0.6 + rnd() * 0.8)
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.quadraticCurveTo(mx, my, ex, ey)
    ctx.stroke()
  }
}

function blobs(ctx, size, seed, color, count, rMin, rMax) {
  const rnd = mulberry32(seed)
  ctx.fillStyle = color
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.12 + rnd() * 0.16
    const r = rMin + rnd() * (rMax - rMin)
    ctx.beginPath()
    ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function algaeStreaks(ctx, size, seed, color, count) {
  const rnd = mulberry32(seed)
  for (let i = 0; i < count; i++) {
    const x = rnd() * size
    const w = 2 + rnd() * 4
    const h = 12 + rnd() * 26
    const y = rnd() * Math.max(1, size - h)
    const g = ctx.createLinearGradient(x, y, x, y + h)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = 0.14 + rnd() * 0.14
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
  }
  ctx.globalAlpha = 1
}

function brickGrid(ctx, size, seed, pal) {
  const rnd = mulberry32(seed)
  const rowH = 16
  ctx.strokeStyle = pal.feature
  ctx.lineWidth = 1
  for (let ry = rowH; ry < size; ry += rowH) {
    ctx.beginPath()
    ctx.moveTo(0, ry + 0.5)
    ctx.lineTo(size, ry + 0.5)
    ctx.stroke()
  }
  let row = 0
  for (let ry = 0; ry < size; ry += rowH) {
    const off = row % 2 === 0 ? 0 : 21
    for (let cx = off; cx <= size; cx += 42) {
      ctx.beginPath()
      ctx.moveTo(cx + 0.5, ry)
      ctx.lineTo(cx + 0.5, Math.min(ry + rowH, size))
      ctx.stroke()
      if (cx < size) {
        ctx.globalAlpha = 0.08 + rnd() * 0.08
        ctx.fillStyle = rnd() > 0.5 ? rgbCss(pal.light) : rgbCss(pal.dark)
        ctx.fillRect(cx + 1, ry + 1, 40, rowH - 2)
        ctx.globalAlpha = 1
      }
    }
    row++
  }
}

function bevelEdges(ctx, size) {
  ctx.strokeStyle = 'rgba(0,0,0,0.38)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, size - 2, size - 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(1, size - 1)
  ctx.lineTo(1, 1)
  ctx.lineTo(size - 1, 1)
  ctx.stroke()
}

function tileSolidCanvas(zone) {
  const pal = palOf(zone)
  const zk = normZone(zone)
  const cv = makeCanvas(TILE_PX, TILE_PX)
  const ctx = cv.getContext('2d')
  paintNoiseBase(ctx, TILE_PX, pal, seedOf(zk, 1))
  if (zk === 'gallery') {
    brickGrid(ctx, TILE_PX, seedOf(zk, 2), pal)
    algaeStreaks(ctx, TILE_PX, seedOf(zk, 3), '#3f8a63', 5)
    bevelEdges(ctx, TILE_PX)
  } else if (zk === 'warrens') {
    veins(ctx, TILE_PX, seedOf(zk, 2), pal.feature, 4, 2.2)
    blobs(ctx, TILE_PX, seedOf(zk, 3), pal.accent, 6, 1.5, 4)
    bevelEdges(ctx, TILE_PX)
  } else if (zk === 'sanctus') {
    cracks(ctx, TILE_PX, seedOf(zk, 2), 'rgba(154,166,188,0.55)', 4, 1)
    const sheen = ctx.createLinearGradient(0, 0, TILE_PX, TILE_PX)
    sheen.addColorStop(0, 'rgba(120,130,160,0.10)')
    sheen.addColorStop(0.5, 'rgba(0,0,0,0)')
    sheen.addColorStop(1, 'rgba(90,60,120,0.07)')
    ctx.fillStyle = sheen
    ctx.fillRect(0, 0, TILE_PX, TILE_PX)
    bevelEdges(ctx, TILE_PX)
  } else {
    cracks(ctx, TILE_PX, seedOf(zk, 2), pal.feature, 5, 1)
    ctx.strokeStyle = 'rgba(122,142,164,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0.5, 31.5)
    ctx.lineTo(TILE_PX - 0.5, 31.5)
    ctx.moveTo(31.5, 0.5)
    ctx.lineTo(31.5, TILE_PX - 0.5)
    ctx.stroke()
    bevelEdges(ctx, TILE_PX)
  }
  return cv
}

function tileOnewayCanvas(zone) {
  const pal = palOf(zone)
  const cv = makeCanvas(TILE_PX, TILE_PX)
  const ctx = cv.getContext('2d')
  const rnd = mulberry32(seedOf(zone, 5))
  const top = 2
  const h = 17
  ctx.fillStyle = '#3a2c1c'
  ctx.fillRect(0, top, TILE_PX, h)
  for (let y = top + 3; y < top + h - 2; y += 2) {
    ctx.strokeStyle = rnd() > 0.5 ? 'rgba(44,33,20,0.75)' : 'rgba(70,53,35,0.65)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    const wob = rnd() * 3 - 1.5
    ctx.quadraticCurveTo(TILE_PX / 2, y + 0.5 + wob, TILE_PX, y + 0.5)
    ctx.stroke()
  }
  ctx.fillStyle = '#5b4630'
  ctx.fillRect(0, top, TILE_PX, 2)
  ctx.fillStyle = '#1c140c'
  ctx.fillRect(0, top + h - 2, TILE_PX, 2)
  ctx.fillStyle = '#171009'
  ctx.beginPath()
  ctx.arc(8, top + h / 2, 1.6, 0, Math.PI * 2)
  ctx.arc(TILE_PX - 8, top + h / 2, 1.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = rgbCss(pal.mid)
  ctx.fillRect(0, top, TILE_PX, h)
  ctx.globalAlpha = 1
  return cv
}

function tileSpikeCanvas() {
  const S = TILE_PX
  const cv = makeCanvas(S, S)
  const ctx = cv.getContext('2d')
  const rnd = mulberry32(seedOf('nave', 77))
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  for (let i = 0; i < 3; i++) {
    const cx = 11 + i * 21 + (rnd() * 4 - 2)
    ctx.beginPath()
    ctx.ellipse(cx, 60, 9, 3, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 3; i++) {
    const cx = 11 + i * 21 + (rnd() * 4 - 2)
    const tipY = 5 + rnd() * 7
    const half = 7 + rnd() * 2
    const g = ctx.createLinearGradient(0, tipY, 0, 61)
    g.addColorStop(0, '#ece2cc')
    g.addColorStop(0.55, '#c4b79c')
    g.addColorStop(1, '#8f8268')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(cx - half, 61)
    ctx.quadraticCurveTo(cx - half * 0.35, 30, cx, tipY)
    ctx.quadraticCurveTo(cx + half * 0.35, 30, cx + half, 61)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#57492f'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,250,235,0.7)'
    ctx.beginPath()
    ctx.moveTo(cx - 1.5, tipY + 5)
    ctx.lineTo(cx - 3, 56)
    ctx.stroke()
  }
  return cv
}

function decoNave(ctx, S) {
  cracks(ctx, S, seedOf('nave', 21), 'rgba(10,15,22,0.85)', 6, 1.5)
  const rnd = mulberry32(seedOf('nave', 23))
  ctx.fillStyle = '#2a3644'
  for (let i = 0; i < 10; i++) {
    ctx.globalAlpha = 0.3 + rnd() * 0.3
    ctx.fillRect(rnd() * S, S - 6 - rnd() * 14, 2 + rnd() * 4, 2 + rnd() * 3)
  }
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(122,142,164,0.18)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(S / 2, S + 10, S * 0.62, Math.PI * 1.15, Math.PI * 1.85)
  ctx.stroke()
}

function decoWarrens(ctx, S) {
  const rnd = mulberry32(seedOf('warrens', 21))
  for (let r = 0; r < 5; r++) {
    const sx = rnd() * S
    let x = sx
    let y = -6
    let w = 4.5 + rnd() * 2.5
    while (y < S + 6) {
      const ny = y + 10 + rnd() * 12
      const nx = x + (rnd() - 0.5) * 26
      ctx.strokeStyle = '#1c170a'
      ctx.lineWidth = w
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo((x + nx) / 2 + (rnd() - 0.5) * 10, (y + ny) / 2, nx, ny)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(107,122,58,0.4)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo((x + nx) / 2, (y + ny) / 2, nx, ny)
      ctx.stroke()
      x = nx
      y = ny
      w *= 0.78
    }
  }
  blobs(ctx, S, seedOf('warrens', 27), '#4e5c2c', 12, 1.5, 3.5)
}

function decoGallery(ctx, S) {
  algaeStreaks(ctx, S, seedOf('gallery', 21), '#3f8a63', 9)
  const rnd = mulberry32(seedOf('gallery', 23))
  ctx.strokeStyle = 'rgba(18,48,55,0.9)'
  ctx.lineWidth = 1.4
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S
    ctx.beginPath()
    ctx.moveTo(x, rnd() * S * 0.4)
    ctx.lineTo(x + (rnd() - 0.5) * 6, rnd() * S * 0.6 + S * 0.4)
    ctx.stroke()
  }
  blobs(ctx, S, seedOf('gallery', 29), 'rgba(80,180,150,0.5)', 8, 1, 3)
}

function decoSanctus(ctx, S) {
  const rnd = mulberry32(seedOf('sanctus', 21))
  ctx.strokeStyle = 'rgba(174,184,204,0.55)'
  ctx.lineWidth = 1
  const cxp = S / 2
  const cyp = S / 2
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.4
    const len = S * (0.28 + rnd() * 0.22)
    const ex = cxp + Math.cos(a) * len
    const ey = cyp + Math.sin(a) * len
    ctx.beginPath()
    ctx.moveTo(cxp, cyp)
    ctx.quadraticCurveTo(cxp + Math.cos(a + 0.5) * len * 0.6, cyp + Math.sin(a + 0.5) * len * 0.6, ex, ey)
    ctx.stroke()
  }
  for (let i = 0; i < 6; i++) {
    const a1 = rnd() * Math.PI * 2
    const a2 = rnd() * Math.PI * 2
    const r1 = S * (0.15 + rnd() * 0.3)
    const r2 = S * (0.15 + rnd() * 0.3)
    ctx.beginPath()
    ctx.moveTo(cxp + Math.cos(a1) * r1, cyp + Math.sin(a1) * r1)
    ctx.lineTo(cxp + Math.cos(a2) * r2, cyp + Math.sin(a2) * r2)
    ctx.stroke()
  }
  const glow = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, S * 0.3)
  glow.addColorStop(0, 'rgba(190,200,225,0.14)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, S, S)
}

export function getTileTexture(zone, kind = 'solid') {
  const key = 'tile:' + zone + ':' + kind
  if (!cache.has(key)) {
    let cv
    if (kind === 'oneway') cv = tileOnewayCanvas(zone)
    else if (kind === 'spike') cv = tileSpikeCanvas()
    else cv = tileSolidCanvas(zone)
    cache.set(key, toTexture(cv, true))
  }
  return cache.get(key)
}

export function getDecoTexture(zone) {
  const key = 'deco:' + zone
  if (!cache.has(key)) {
    const zk = normZone(zone)
    const cv = makeCanvas(DECO_PX, DECO_PX)
    const ctx = cv.getContext('2d')
    if (zk === 'warrens') decoWarrens(ctx, DECO_PX)
    else if (zk === 'gallery') decoGallery(ctx, DECO_PX)
    else if (zk === 'sanctus') decoSanctus(ctx, DECO_PX)
    else decoNave(ctx, DECO_PX)
    cache.set(key, toTexture(cv, false))
  }
  return cache.get(key)
}

export function drawSprite(ctx, name, S) {
  const r = S / 2
  const grad = (stops) => {
    const gr = ctx.createRadialGradient(r, r, 0, r, r, r)
    for (let i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1])
    return gr
  }
  let fill
  if (name === 'spore') fill = grad([[0, 'rgba(225,255,238,0.95)'], [0.4, 'rgba(130,220,170,0.55)'], [1, 'rgba(130,220,170,0)']])
  else if (name === 'ember') fill = grad([[0, 'rgba(255,244,200,1)'], [0.35, 'rgba(255,170,60,0.9)'], [1, 'rgba(255,120,30,0)']])
  else if (name === 'mote') fill = grad([[0, 'rgba(255,190,190,1)'], [0.4, 'rgba(190,40,52,0.9)'], [1, 'rgba(150,20,32,0)']])
  else if (name === 'splash') fill = grad([[0, 'rgba(180,225,240,0)'], [0.55, 'rgba(180,225,240,0)'], [0.75, 'rgba(210,240,250,0.85)'], [1, 'rgba(210,240,250,0)']])
  else if (name === 'glow') fill = grad([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']])
  else fill = grad([[0, 'rgba(230,235,245,0.9)'], [0.5, 'rgba(200,208,222,0.4)'], [1, 'rgba(200,208,222,0)']])
  ctx.fillStyle = fill
  ctx.clearRect(0, 0, S, S)
  ctx.fillRect(0, 0, S, S)
}

export function getSprite(name) {
  const key = 'spr:' + name
  if (!cache.has(key)) {
    const cv = makeCanvas(SPRITE_PX, SPRITE_PX)
    drawSprite(cv.getContext('2d'), name, SPRITE_PX)
    cache.set(key, toTexture(cv, false))
  }
  return cache.get(key)
}

export function getSpriteAtlas() {
  if (!cache.has('atlas')) {
    const names = ['dust', 'spore', 'ember', 'mote', 'splash', 'glow']
    const cv = makeCanvas(ATLAS_COLS * SPRITE_PX, ATLAS_ROWS * SPRITE_PX)
    const ctx = cv.getContext('2d')
    for (let i = 0; i < names.length; i++) {
      const ox = (i % ATLAS_COLS) * SPRITE_PX
      const oy = ((i / ATLAS_COLS) | 0) * SPRITE_PX
      ctx.save()
      ctx.translate(ox, oy)
      drawSprite(ctx, names[i], SPRITE_PX)
      ctx.restore()
    }
    const t = toTexture(cv, false)
    t.flipY = false
    t.generateMipmaps = false
    t.minFilter = THREE.LinearFilter
    cache.set('atlas', t)
  }
  return cache.get('atlas')
}

function toTexture(cv, repeat) {
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
  }
  return t
}
