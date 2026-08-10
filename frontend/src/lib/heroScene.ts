import { tokens } from './tokens'

export interface HeroScene {
  start(): void
  stop(): void
  resize(): void
  destroy(): void
}

interface HeroSceneOptions {
  reduced: boolean
  /**
   * Composite over whatever sits behind the canvas instead of painting an
   * opaque background. Used when a photograph backs the hero.
   */
  transparent?: boolean
}

interface Shaft {
  /** horizontal origin as a fraction of the canvas width */
  x: number
  baseAngle: number
  phase: number
  w: number
  h: number
  sprite: HTMLCanvasElement
}

interface Mote {
  x: number
  y: number
  r: number
  vy: number
  wobble: number
  phase: number
  alpha: number
}

const SHAFT_COUNT = 4
const MOTE_COUNT = 72
const GRAIN_SIZE = 128
const MAX_DPR = 1.5

/** Accent crimson at the shaft apex, matching the palette's `accent`. */
const SHAFT_RGB = '198, 57, 63'

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

/**
 * A single blurred light shaft, rasterized once. The blur is applied at bake
 * time because setting `ctx.filter` per frame is a well-known canvas perf trap.
 */
function bakeShaft(width: number, height: number, seed: number): HTMLCanvasElement {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, `rgba(${SHAFT_RGB}, 0.24)`)
  gradient.addColorStop(0.45, `rgba(${SHAFT_RGB}, 0.11)`)
  gradient.addColorStop(1, `rgba(${SHAFT_RGB}, 0)`)

  ctx.filter = 'blur(26px)'
  ctx.fillStyle = gradient
  ctx.beginPath()
  const topHalf = width * (0.1 + (seed % 3) * 0.03)
  ctx.moveTo(width / 2 - topHalf, 0)
  ctx.lineTo(width / 2 + topHalf, 0)
  ctx.lineTo(width * 0.92, height)
  ctx.lineTo(width * 0.08, height)
  ctx.closePath()
  ctx.fill()
  ctx.filter = 'none'

  return canvas
}

/** Soft round haze sprite, drawn many times per frame at varying scale. */
function bakeHaze(): HTMLCanvasElement {
  const size = 64
  const canvas = makeCanvas(size, size)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, `rgba(${SHAFT_RGB}, 0.5)`)
  gradient.addColorStop(0.5, `rgba(${SHAFT_RGB}, 0.14)`)
  gradient.addColorStop(1, `rgba(${SHAFT_RGB}, 0)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return canvas
}

/**
 * A tile of static noise. It is generated once and re-drawn each frame at a
 * random integer offset, which reads as live grain without the cost of
 * regenerating the noise.
 */
function bakeGrain(): HTMLCanvasElement {
  const canvas = makeCanvas(GRAIN_SIZE, GRAIN_SIZE)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.createImageData(GRAIN_SIZE, GRAIN_SIZE)
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 120 + Math.random() * 135
    image.data[i] = value
    image.data[i + 1] = value
    image.data[i + 2] = value
    image.data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function bakeVignette(width: number, height: number): HTMLCanvasElement {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const gradient = ctx.createRadialGradient(
    width / 2,
    height * 0.42,
    Math.min(width, height) * 0.1,
    width / 2,
    height * 0.5,
    Math.max(width, height) * 0.78,
  )
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(0.62, 'rgba(0,0,0,0.28)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.72)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  return canvas
}

/**
 * The landing hero's ambient backdrop: slow-drifting stage-light shafts and a
 * haze of motes over near-black, finished with grain and a vignette.
 *
 * Deliberately Canvas 2D rather than WebGL. Every visual element is pre-baked
 * into an offscreen sprite at init, so a frame is roughly eighty `drawImage`
 * calls of already-rasterized bitmaps — and it costs nothing in bundle size,
 * where pulling three.js onto the highest-traffic route would cost ~230 KB
 * gzipped for four blurred gradients.
 */
export function createHeroScene(
  canvas: HTMLCanvasElement,
  { reduced, transparent = false }: HeroSceneOptions,
): HeroScene {
  const ctx = canvas.getContext('2d', { alpha: transparent })

  let width = 0
  let height = 0
  let raf = 0
  let running = false
  let last = 0
  let time = 0

  let shafts: Shaft[] = []
  let motes: Mote[] = []
  let vignette = makeCanvas(1, 1)
  const haze = bakeHaze()
  const grain = bakeGrain()
  const grainPattern = ctx?.createPattern(grain, 'repeat') ?? null

  function measure() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const rect = canvas.getBoundingClientRect()
    width = Math.max(1, Math.round(rect.width))
    height = Math.max(1, Math.round(rect.height))
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function rebuild() {
    const shaftW = width * 0.42
    const shaftH = height * 1.6
    shafts = Array.from({ length: SHAFT_COUNT }, (_, i) => ({
      x: 0.16 + i * 0.23,
      baseAngle: (i - (SHAFT_COUNT - 1) / 2) * 0.14,
      phase: i * 1.7,
      w: shaftW,
      h: shaftH,
      sprite: bakeShaft(shaftW, shaftH, i),
    }))

    motes = Array.from({ length: MOTE_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 4 + Math.random() * 22,
      vy: 4 + Math.random() * 14,
      wobble: 0.3 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.05 + Math.random() * 0.16,
    }))

    vignette = bakeVignette(width, height)
  }

  function draw(dt: number) {
    if (!ctx) return
    time += dt

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    if (transparent) {
      ctx.clearRect(0, 0, width, height)
    } else {
      ctx.fillStyle = tokens.ink
      ctx.fillRect(0, 0, width, height)
    }

    ctx.globalCompositeOperation = 'lighter'
    for (const shaft of shafts) {
      const angle = shaft.baseAngle + Math.sin(time * 0.07 + shaft.phase) * 0.06
      ctx.save()
      ctx.translate(shaft.x * width, -height * 0.15)
      ctx.rotate(angle)
      ctx.globalAlpha = 0.34 + 0.26 * Math.sin(time * 0.11 + shaft.phase)
      ctx.drawImage(shaft.sprite, -shaft.w / 2, 0, shaft.w, shaft.h)
      ctx.restore()
    }

    for (const mote of motes) {
      mote.y -= mote.vy * dt
      mote.x += Math.sin(time * mote.wobble + mote.phase) * 6 * dt
      if (mote.y < -40) {
        mote.y = height + 40
        mote.x = Math.random() * width
      }
      ctx.globalAlpha = mote.alpha
      ctx.drawImage(haze, mote.x - mote.r, mote.y - mote.r, mote.r * 2, mote.r * 2)
    }

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(vignette, 0, 0, width, height)

    if (grainPattern) {
      ctx.globalAlpha = 0.032
      ctx.fillStyle = grainPattern
      ctx.save()
      ctx.translate(-((Math.random() * GRAIN_SIZE) | 0), -((Math.random() * GRAIN_SIZE) | 0))
      ctx.fillRect(0, 0, width + GRAIN_SIZE, height + GRAIN_SIZE)
      ctx.restore()
      ctx.globalAlpha = 1
    }
  }

  function frame(now: number) {
    // Clamp so a backgrounded tab does not fast-forward the scene on resume.
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    draw(dt)
    raf = requestAnimationFrame(frame)
  }

  measure()
  rebuild()
  // Under reduced motion the scene is a single static frame and the animation
  // loop never starts.
  draw(0)

  return {
    start() {
      if (reduced || running) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    },
    stop() {
      if (!running) return
      running = false
      cancelAnimationFrame(raf)
      raf = 0
    },
    resize() {
      measure()
      rebuild()
      draw(0)
    },
    destroy() {
      running = false
      cancelAnimationFrame(raf)
      raf = 0
      shafts = []
      motes = []
    },
  }
}
