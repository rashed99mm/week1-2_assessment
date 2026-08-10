import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  ELEVATION_SCALE,
  STAGE_BAND,
  type Bounds,
  type PlanMetrics,
  type RowGeometry,
  type Seat,
  type StageMode,
} from './venueLayout'

/** Normalized-to-world scale factor for the seating bowl. */
export const WORLD_SCALE = 1.7

/** World-space z of normalized y = 0, for the stage-facing layouts. */
export const Z_ORIGIN = 0.85

/**
 * Rough real-world scale of the model, used only to phrase the "≈ N m from
 * stage" readout in the seat preview. The bowl is 1.7 world units deep and a
 * mid-size venue is on the order of 40 m front to back.
 */
export const METERS_PER_WORLD_UNIT = 24

/** Seated eye height above the seat pad, in world units. */
export const EYE_HEIGHT = 0.055

export interface ChairDims {
  w: number
  d: number
  padH: number
  backH: number
  backT: number
}

/** Map a normalized (x, y) pair plus an elevation into world space. */
export function worldFromNormalized(
  x: number,
  y: number,
  z: number,
  mode: StageMode,
): THREE.Vector3 {
  const wx = (x - 0.5) * WORLD_SCALE
  const wy = z * ELEVATION_SCALE
  const wz = mode === 'arena' ? (y - 0.5) * WORLD_SCALE : Z_ORIGIN - y * WORLD_SCALE
  return new THREE.Vector3(wx, wy, wz)
}

export function worldPos(seat: Seat, mode: StageMode): THREE.Vector3 {
  return worldFromNormalized(seat.x, seat.y, seat.z, mode)
}

/** Yaw that turns a chair to face the stage. */
export function seatYaw(seat: Seat, mode: StageMode): number {
  if (mode === 'arena') {
    const p = worldPos(seat, mode)
    return Math.atan2(-p.x, -p.z)
  }
  if (seat.block === 'left') return Math.PI / 2
  if (seat.block === 'right') return -Math.PI / 2
  return 0
}

export function stageCenter(mode: StageMode): THREE.Vector3 {
  const band = STAGE_BAND[mode]
  return worldFromNormalized((band.minX + band.maxX) / 2, (band.minY + band.maxY) / 2, 0, mode)
}

export function defaultTarget(mode: StageMode): THREE.Vector3 {
  return mode === 'arena' ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0, 0.28, -0.35)
}

export function defaultPos(mode: StageMode): THREE.Vector3 {
  return mode === 'arena' ? new THREE.Vector3(0, 2.2, 2.6) : new THREE.Vector3(0, 2.1, 2.9)
}

export function stageLookAt(mode: StageMode): THREE.Vector3 {
  const c = stageCenter(mode)
  return new THREE.Vector3(c.x, 0.12, c.z)
}

/** Position of the warm key light above and slightly in front of the stage. */
export function stageLightPos(mode: StageMode): THREE.Vector3 {
  const c = stageCenter(mode)
  return new THREE.Vector3(c.x, 1.15, mode === 'arena' ? c.z : c.z + 0.35)
}

/**
 * Chair proportions derived from the layout's seat pitch, so chairs shrink as
 * the venue gets denser and can never overlap however many seats are generated.
 */
export function chairDims(metrics: PlanMetrics): ChairDims {
  // 82% of the pitch leaves a visible aisle gap at every seat count.
  const w = Math.min(metrics.colPitch * WORLD_SCALE * 0.82, 0.034)
  const d = Math.min(metrics.rowPitch * WORLD_SCALE * 0.72, 0.03)
  return { w, d, padH: d * 0.2, backH: d * 0.85, backT: d * 0.2 }
}

/**
 * A chair as a single merged geometry: seat pad plus a slightly reclined
 * backrest. One geometry means one InstancedMesh, so the whole bowl is a single
 * draw call with a single raycast target and `instanceId` picking still works.
 *
 * The local origin sits at floor level in the centre of the pad footprint, and
 * the chair faces -Z before the instance yaw is applied.
 */
export function buildChairGeometry(metrics: PlanMetrics): THREE.BufferGeometry {
  const { w, d, padH, backH, backT } = chairDims(metrics)

  const pad = new THREE.BoxGeometry(w, padH, d)
  pad.translate(0, padH / 2, 0)

  // Rotate about the geometry origin first, then translate into place —
  // BoxGeometry.rotateX pivots about the origin, so the order matters.
  const back = new THREE.BoxGeometry(w, backH, backT)
  back.rotateX(-0.14)
  back.translate(0, padH + backH / 2, d / 2 - backT / 2)

  const merged = mergeGeometries([pad, back], false)
  pad.dispose()
  back.dispose()
  if (!merged) throw new Error('Failed to merge chair geometry')
  merged.computeVertexNormals()
  return merged
}

/**
 * Every riser strip and section floor as one merged geometry, so the entire
 * tier structure costs a single draw call.
 *
 * Arena venues pass no rows: their seats already carry a continuous bowl
 * elevation, so they read as tiered without explicit risers.
 */
export function buildRiserGeometry(
  rows: RowGeometry[],
  sectionBounds: Record<number, Bounds>,
  metrics: PlanMetrics,
  mode: StageMode,
): THREE.BufferGeometry | null {
  if (rows.length === 0) return null

  const parts: THREE.BufferGeometry[] = []
  const depth = metrics.rowPitch * WORLD_SCALE
  // The riser top sits just below the chair base so chairs read as resting on it.
  const lift = 0.004

  for (const row of rows) {
    const isWing = row.block === 'left' || row.block === 'right'
    const pad = metrics.colPitch * 0.6
    const a = worldFromNormalized(row.xMin - pad, row.y, 0, mode)
    const b = worldFromNormalized(row.xMax + pad, row.y, 0, mode)

    const span = Math.abs(b.x - a.x) || depth
    const width = isWing ? depth : span
    const length = isWing ? span : depth
    const h = Math.max(row.elevation * ELEVATION_SCALE + lift, 0.006)

    const slab = new THREE.BoxGeometry(width, h, length)
    slab.translate((a.x + b.x) / 2, h / 2 - lift, (a.z + b.z) / 2)
    parts.push(slab)
  }

  // A thin floor plate under each section, inset slightly so the riser strips
  // still read as separate steps sitting on top of it.
  for (const bounds of Object.values(sectionBounds)) {
    const a = worldFromNormalized(bounds.minX, bounds.minY, 0, mode)
    const b = worldFromNormalized(bounds.maxX, bounds.maxY, 0, mode)
    const width = Math.abs(b.x - a.x) + metrics.colPitch * WORLD_SCALE
    const length = Math.abs(b.z - a.z) + depth
    if (width <= 0 || length <= 0) continue
    const plate = new THREE.BoxGeometry(width, 0.004, length)
    plate.translate((a.x + b.x) / 2, -0.004, (a.z + b.z) / 2)
    parts.push(plate)
  }

  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  if (!merged) return null
  merged.computeVertexNormals()
  return merged
}

/** Radial-gradient sprite used for the stage floor wash. Baked once. */
export function createWashTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.42)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * A lit stand-in for the stage screen, used until the event's photo loads and
 * kept when an event has no cover. Anything is better than a black rectangle,
 * which reads as a broken render rather than a dark room.
 */
export function createScreenFallbackTexture(): THREE.CanvasTexture {
  const w = 512
  const h = 288
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, '#3a2226')
    gradient.addColorStop(0.55, '#c6393f')
    gradient.addColorStop(1, '#2a1b1d')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)

    // A soft hot spot, as a lit panel would have.
    const glow = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.5)
    glow.addColorStop(0, 'rgba(255,225,205,0.55)')
    glow.addColorStop(1, 'rgba(255,225,205,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)

    // Faint scan lines so it reads as a screen rather than a painted panel.
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * A seated spectator silhouette, drawn once and reused for every occupied seat.
 *
 * The crowd is deliberately cheap set dressing rather than modelled geometry:
 * flat quads facing the stage, in the spirit of the sprite crowds older sports
 * games used. Per-instance colour and scale supply the variety.
 */
export function createCrowdTexture(): THREE.CanvasTexture {
  const w = 64
  const h = 64
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#ffffff'

    // Shoulders: a rounded trapezoid occupying the lower two thirds.
    ctx.beginPath()
    ctx.moveTo(w * 0.16, h)
    ctx.quadraticCurveTo(w * 0.2, h * 0.52, w * 0.5, h * 0.5)
    ctx.quadraticCurveTo(w * 0.8, h * 0.52, w * 0.84, h)
    ctx.closePath()
    ctx.fill()

    // Head.
    ctx.beginPath()
    ctx.arc(w * 0.5, h * 0.3, w * 0.17, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function easeOutCubic(k: number): number {
  return 1 - Math.pow(1 - k, 3)
}

export function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
}

/**
 * A coarse sightline grade for a seat, from its distance to the stage and how
 * far off the stage's centre line it sits.
 */
export function sightlineGrade(seat: Seat, mode: StageMode): 'Great' | 'Good' | 'Fair' {
  const p = worldPos(seat, mode)
  const stage = stageLookAt(mode)
  const distance = p.distanceTo(stage)
  const offAxis = Math.abs(Math.atan2(p.x - stage.x, Math.abs(p.z - stage.z) || 0.001))

  if (distance < 0.9 && offAxis < 0.5) return 'Great'
  if (distance < 1.5 && offAxis < 0.85) return 'Good'
  return 'Fair'
}

/** Approximate metres from a seat to the front of the stage. */
export function metersFromStage(seat: Seat, mode: StageMode): number {
  const p = worldPos(seat, mode)
  const stage = stageLookAt(mode)
  return Math.round(p.distanceTo(stage) * METERS_PER_WORLD_UNIT)
}

