import * as THREE from 'three'

const geoCache = new Map()

function box(w, h, d) {
  const k = `b${w}_${h}_${d}`
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d))
  return geoCache.get(k)
}
function sph(r, seg = 10) {
  const k = `s${r}_${seg}`
  if (!geoCache.has(k)) geoCache.set(k, new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)))
  return geoCache.get(k)
}
function cone(r, h, seg = 8) {
  const k = `c${r}_${h}_${seg}`
  if (!geoCache.has(k)) geoCache.set(k, new THREE.ConeGeometry(r, h, seg))
  return geoCache.get(k)
}
function cyl(rt, rb, h, seg = 10) {
  const k = `y${rt}_${rb}_${h}_${seg}`
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg))
  return geoCache.get(k)
}

const matCache = new Map()
function mat(hex, opts = {}) {
  const key = hex + JSON.stringify(opts)
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, metalness: 0.08, ...opts }))
  return matCache.get(key)
}
function emat(hex, intensity = 1) {
  const key = `e${hex}_${intensity}`
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: intensity, roughness: 0.6 }))
  return matCache.get(key)
}

function addEye(group, x, y, r, hex = 0xffc46a) {
  const e = new THREE.Mesh(sph(r, 6), new THREE.MeshBasicMaterial({ color: hex }))
  e.position.set(x, y, 6)
  group.add(e)
  return e
}

export function makeEnemyMesh(kind, glowSprite) {
  const g = new THREE.Group()
  g.userData.kind = kind
  if (kind === 'husk') {
    const body = new THREE.Mesh(sph(13), mat(0x2b2620))
    body.scale.set(1, 1.25, 0.7)
    body.position.y = 2
    const hood = new THREE.Mesh(cone(11, 20), mat(0x1c1814))
    hood.position.set(0, 16, 0)
    const rag = new THREE.Mesh(cone(12, 14, 7), mat(0x211d18))
    rag.rotation.x = Math.PI
    rag.position.y = -8
    g.add(body, hood, rag)
    addEye(g, 4, 14, 1.6, 0xd8843a)
    addEye(g, -4, 14, 1.6, 0xd8843a)
    g.userData.animRoot = g
  } else if (kind === 'maw') {
    const mound = new THREE.Mesh(sph(15), mat(0x181510))
    mound.scale.set(1.3, 0.45, 0.8)
    const jaw = new THREE.Group()
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Mesh(cone(2.2, 8, 5), mat(0xcfc4a8))
      const a = -0.9 + i * 0.36
      t.position.set(Math.sin(a) * 10, 2, Math.cos(a) * 4)
      t.rotation.z = -a * 0.5
      jaw.add(t)
    }
    jaw.position.y = 4
    g.add(mound, jaw)
    g.userData.jaw = jaw
    g.userData.animRoot = g
  } else if (kind === 'stalker') {
    const torso = new THREE.Mesh(cyl(4.5, 6, 34), mat(0xa8a094))
    torso.position.y = 8
    const head = new THREE.Mesh(sph(5), mat(0xc4bcac))
    head.position.y = 27
    const armL = new THREE.Mesh(cyl(1.6, 1.2, 30), mat(0x8f887c))
    armL.position.set(-7, 4, 0)
    const armR = armL.clone()
    armR.position.x = 7
    const legL = new THREE.Mesh(cyl(1.8, 1.4, 22), mat(0x8f887c))
    legL.position.set(-3.5, -21, 0)
    const legR = legL.clone()
    legR.position.x = 3.5
    g.add(torso, head, armL, armR, legL, legR)
    addEye(g, 2, 28, 1.2, 0xe8e4d8)
    addEye(g, -2, 28, 1.2, 0xe8e4d8)
    g.userData.animRoot = g
  } else if (kind === 'bloom') {
    const bulb = new THREE.Mesh(sph(13), mat(0x6f7d2a, { emissive: 0x39430f, emissiveIntensity: 0.5 }))
    const stem = new THREE.Mesh(cyl(3, 5, 12), mat(0x4a4426))
    stem.position.y = -10
    g.add(bulb, stem)
    g.userData.bulb = bulb
    g.userData.animRoot = g
  } else if (kind === 'wisp') {
    const core = new THREE.Mesh(sph(4, 8), emat(0xffa040, 1.6))
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({
      map: glowSprite, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xff9040, opacity: 0.55
    }))
    g.add(core, halo)
    g.userData.animRoot = g
  } else if (kind === 'sacristan') {
    const robe = new THREE.Mesh(cone(30, 84, 10), mat(0x241016))
    robe.position.y = -4
    const head = new THREE.Mesh(sph(12), mat(0xd8cfba))
    head.position.y = 42
    const halo = new THREE.Mesh(cyl(20, 20, 1.4, 20), emat(0x8a6a30, 0.9))
    halo.rotation.x = Math.PI / 2
    halo.position.y = 52
    const armL = new THREE.Mesh(cyl(4, 3, 36), mat(0x1a0d10))
    armL.position.set(-22, 16, 0)
    armL.rotation.z = 0.5
    const armR = armL.clone()
    armR.rotation.z = -0.5
    armR.position.x = 22
    g.add(robe, head, halo, armL, armR)
    addEye(g, 4, 44, 2, 0x30160c)
    addEye(g, -4, 44, 2, 0x30160c)
    g.userData.animRoot = g
  } else if (kind === 'warden') {
    const mass = new THREE.Mesh(sph(34), mat(0x0d0d14, { roughness: 0.55, metalness: 0.35 }))
    mass.scale.set(1.15, 1.5, 0.75)
    mass.position.y = 10
    const crownGroup = new THREE.Group()
    for (let i = 0; i < 7; i++) {
      const t = new THREE.Mesh(cone(3.4, 22 + (i % 3) * 8, 6), mat(0x16161f, { metalness: 0.5 }))
      const a = (i / 7) * Math.PI * 2
      t.position.set(Math.sin(a) * 20, 62 + Math.cos(a * 2) * 4, Math.cos(a) * 8)
      t.rotation.z = -Math.sin(a) * 0.35
      crownGroup.add(t)
    }
    const veil = new THREE.Mesh(cone(38, 50, 12), mat(0x08080c))
    veil.rotation.x = Math.PI
    veil.position.y = -32
    g.add(mass, crownGroup, veil)
    addEye(g, 9, 34, 3.4, 0xcfd8ff)
    addEye(g, -9, 34, 3.4, 0xcfd8ff)
    g.userData.animRoot = g
  }
  return g
}

export function makeItemMesh(kind, glowSprite) {
  const g = new THREE.Group()
  if (kind === 'ability') {
    const stone = new THREE.Mesh(box(16, 22, 8), mat(0x3a3f46, { metalness: 0.3, roughness: 0.5 }))
    const rune = new THREE.Mesh(box(8, 12, 2), emat(0xbfd8ff, 1.1))
    rune.position.z = 5
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), new THREE.MeshBasicMaterial({
      map: glowSprite, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x9fc0ff, opacity: 0.4
    }))
    g.add(stone, rune, halo)
    g.userData.halo = halo
  } else if (kind === 'shard') {
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshBasicMaterial({
      map: glowSprite, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffd9a0, opacity: 0.85
    }))
    g.add(flame)
    g.userData.halo = flame
  } else if (kind === 'oil') {
    const vial = new THREE.Mesh(cyl(5, 6, 14, 8), mat(0x584a30, { transparent: true, opacity: 0.85 }))
    const oil = new THREE.Mesh(cyl(3.6, 4.4, 8, 8), emat(0x120c06, 0.01))
    oil.material = new THREE.MeshBasicMaterial({ color: 0x0a0704 })
    oil.position.y = -2
    g.add(vial, oil)
  } else if (kind === 'lore') {
    const obelisk = new THREE.Mesh(box(14, 40, 10), mat(0x33363c))
    obelisk.position.y = 12
    const glyph = new THREE.Mesh(box(6, 20, 2), emat(0x7fa08a, 0.5))
    glyph.position.set(0, 14, 6)
    g.add(obelisk, glyph)
  }
  return g
}

export function makeDoorMesh(style) {
  const g = new THREE.Group()
  const pillarL = new THREE.Mesh(box(12, 72, 14), mat(0x2c3038))
  pillarL.position.set(-18, 20, 0)
  const pillarR = pillarL.clone()
  pillarR.position.x = 18
  const lintel = new THREE.Mesh(box(48, 12, 14), mat(0x23272e))
  lintel.position.y = 60
  const seal = new THREE.Mesh(cyl(12, 12, 3, 18), emat(0x7a2020, 0.8))
  seal.rotation.x = Math.PI / 2
  seal.position.set(0, 34, 8)
  g.add(pillarL, pillarR, lintel, seal)
  g.userData.seal = seal
  g.userData.pillars = [pillarL, pillarR]
  return g
}

export function makeCheckpointMesh(glowSprite) {
  const g = new THREE.Group()
  const basin = new THREE.Mesh(cyl(14, 9, 16, 12), mat(0x2c2c30))
  basin.position.y = 2
  const stem = new THREE.Mesh(cyl(6, 8, 18, 8), mat(0x242428))
  stem.position.y = -14
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({
    map: glowSprite, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffc87a, opacity: 0
  }))
  flame.position.y = 22
  g.add(basin, stem, flame)
  g.userData.flame = flame
  return g
}

const tmpQ = new THREE.Quaternion()
const tmpS = new THREE.Vector3()

export function animateBody(mesh, view, dt) {
  const root = mesh.userData.animRoot || mesh
  const t = view.t || 0
  root.rotation.z = 0
  root.scale.set(view.flip ? -Math.abs(root.scale.x) || -1 : Math.abs(root.scale.x) || 1, root.scale.y, root.scale.z)
  if (mesh.userData.kind === 'maw') {
    const emerged = view.anim === 'emerged' || view.anim === 'emerge'
    const target = emerged ? 1 : 0.001
    const jaw = mesh.userData.jaw
    jaw.scale.y += (target - jaw.scale.y) * Math.min(1, dt * 10)
    mesh.children[0].visible = !emerged || view.alpha > 0.5
  }
  if (view.flash) {
    root.traverse(o => {
      if (o.isMesh && o.material.emissiveIntensity !== undefined) {
        o.material.emissiveIntensity = Math.max(o.material.emissiveIntensity, 0.8)
      }
    })
  }
  switch (view.anim) {
    case 'walk':
      root.position.y = Math.abs(Math.sin(t * 9)) * 2.4
      root.rotation.z = Math.sin(t * 9) * 0.05
      break
    case 'windup':
      root.rotation.z = -0.18 * (view.flip ? -1 : 1)
      break
    case 'lunge':
      root.scale.multiply(tmpS.set(1.25, 0.85, 1))
      break
    case 'stagger':
      root.rotation.z = 0.3 * (view.flip ? -1 : 1)
      break
    case 'swell':
      root.scale.multiply(tmpS.set(1 + t * 0.25, 1 + t * 0.25, 1))
      break
    case 'idle':
    default:
      root.position.y = Math.sin(t * 2.2) * 1.2
  }
  void tmpQ
}
