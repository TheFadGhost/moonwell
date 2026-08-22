import * as THREE from 'three'

const QUAD_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const POST_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const POST_FRAG = `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;
uniform float uHurt;
uniform float uDread;
varying vec2 vUv;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 dir = vUv - 0.5;
  float ca = uHurt * 0.014;
  float rr = texture2D(tDiffuse, vUv + dir * ca).r;
  vec4 base = texture2D(tDiffuse, vUv);
  float bb = texture2D(tDiffuse, vUv - dir * ca).b;
  vec3 col = vec3(rr, base.g, bb);
  float d = length(dir) * 1.4142;
  col *= 1.0 - uVignette * smoothstep(0.4, 1.3, d);
  float n = hash(vUv * vec2(731.7, 913.3) + fract(uTime) * 91.7);
  col += (n - 0.5) * uGrain;
  col *= 1.0 - uDread * (0.1 + 0.06 * sin(uTime * 0.83));
  gl_FragColor = vec4(col, base.a);
}
`

const FOG_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
void main() {
  float g = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6);
  g += 0.05 * sin(vUv.x * 6.2831 + uTime * 0.4) * (1.0 - vUv.y);
  float a = clamp(g, 0.0, 1.0) * uOpacity;
  gl_FragColor = vec4(uColor, a);
}
`

const SHAFT_FRAG = `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float cx = vUv.x - 0.5 + sin(uTime * 0.22 + vUv.y * 2.2) * 0.06;
  float band = exp(-cx * cx * 140.0);
  float vf = smoothstep(0.0, 0.15, vUv.y) * pow(vUv.y, 1.25);
  float a = band * vf * uIntensity;
  gl_FragColor = vec4(uColor * a, a);
}
`

const WATER_FRAG = `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float b1 = sin(vUv.x * 36.0 - uTime * 1.7) * 0.5 + 0.5;
  float b2 = sin(vUv.x * 23.0 + uTime * 1.1 + 2.4) * 0.5 + 0.5;
  float spark = smoothstep(0.68, 0.97, b1 * b2);
  float prof = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
  float a = spark * prof * uOpacity;
  gl_FragColor = vec4(uColor, a);
}
`

export function createPostPlane() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uVignette: { value: 0.55 },
      uGrain: { value: 0.05 },
      uHurt: { value: 0 },
      uDread: { value: 0 }
    },
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    depthTest: false,
    depthWrite: false
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  mesh.frustumCulled = false
  mesh.renderOrder = 999
  return mesh
}

export function createFogMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color == null ? 0x0a1420 : color) },
      uOpacity: { value: 1 },
      uTime: { value: 0 }
    },
    vertexShader: QUAD_VERT,
    fragmentShader: FOG_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  })
}

export function createMoonShaftMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color == null ? 0xcfe8ff : color) },
      uIntensity: { value: 0.5 },
      uTime: { value: 0 }
    },
    vertexShader: QUAD_VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  })
}

export function createWaterSurfaceMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color == null ? 0x2a6a78 : color) },
      uOpacity: { value: 0.85 },
      uTime: { value: 0 }
    },
    vertexShader: QUAD_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
}
