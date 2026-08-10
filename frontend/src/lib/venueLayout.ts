import type { Event, TicketType } from '../types'

export type SeatStatus = 'available' | 'sold'
export type StageMode = 'proscenium' | 'thrust' | 'arena' | 'openfloor'
export type TierName = 'Floor' | 'Mezzanine' | 'Balcony'

/**
 * Which structural block of the venue a seat belongs to. Only thrust layouts
 * use anything but `main`; the 3D view needs this to face wing chairs inward
 * and to run their risers along the depth axis instead of the width axis.
 */
export type SeatBlock = 'main' | 'left' | 'right' | 'back'

export interface Seat {
  id: string
  label: string
  /** row index within the seat's own section, used for the row letter */
  rowIndex: number
  colIndex: number
  /** row index across the whole venue, used for risers and rake */
  rowGlobal: number
  /** row index counted from the first row of this seat's tier and block */
  rowInTier: number
  block: SeatBlock
  ticketTypeId: number
  status: SeatStatus
  /** normalized 0..1 position for the 2D map */
  x: number
  y: number
  /** normalized 0..1 elevation for the 3D view */
  z: number
  tier: TierName | null
  isAccessible: boolean
  isPremium: boolean
}

export interface SeatSection {
  ticketType: TicketType
  seatIds: string[]
  soldCount: number
  tier: TierName | null
}

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Centre-to-centre seat spacing in normalized units. The 3D view sizes chair
 * geometry from this so seats can never overlap, however many are generated.
 */
export interface PlanMetrics {
  colPitch: number
  rowPitch: number
}

/**
 * One contiguous strip of seats sharing a tier, block and global row. The 3D
 * view extrudes each of these into a riser slab.
 */
export interface RowGeometry {
  key: string
  tier: TierName | null
  block: SeatBlock
  rowGlobal: number
  /** normalized centre of the row along the depth axis */
  y: number
  /** normalized extent along the width axis */
  xMin: number
  xMax: number
  /** normalized elevation of the seat bases on this row */
  elevation: number
  seatCount: number
}

export interface VenuePlan {
  sections: SeatSection[]
  seats: Seat[]
  rows: RowGeometry[]
  metrics: PlanMetrics
  sectionBounds: Record<number, Bounds>
  tierBounds: Record<string, Bounds>
  stageMode: StageMode
  tiered: boolean
  tiers: TierName[]
  priceRange: { min: number; max: number }
  totalSeats: number
  totalSold: number
  totalAvailable: number
}

/**
 * Normalized rectangle occupied by the stage, per stage mode. Shared by the 2D
 * SVG map and the 3D venue so both agree on where the stage sits.
 */
export const STAGE_BAND: Record<StageMode, Bounds> = {
  proscenium: { minX: 0.2, maxX: 0.8, minY: 0.88, maxY: 0.965 },
  thrust: { minX: 0.28, maxX: 0.72, minY: 0.78, maxY: 0.95 },
  arena: { minX: 0.34, maxX: 0.66, minY: 0.36, maxY: 0.64 },
  openfloor: { minX: 0.2, maxX: 0.8, minY: 0.88, maxY: 0.965 },
}

/** Normalized elevation of the first row of each tier. */
export const TIER_BASE: Record<TierName | 'none', number> = {
  Floor: 0,
  Mezzanine: 0.45,
  Balcony: 0.9,
  none: 0,
}

/** Elevation gained per row, as a fraction of the row pitch. */
export const RAKE_RATIO = 0.34

/** World units per unit of normalized elevation. Consumed by the 3D view. */
export const ELEVATION_SCALE = 0.5

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rowLabel(index: number): string {
  let label = ''
  let n = index
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

function stageModeFor(event: Event): StageMode {
  const slug = event.event_type?.slug
  switch (slug) {
    case 'theater':
    case 'concert':
    case 'conference':
      return 'proscenium'
    case 'workshop':
      return 'thrust'
    case 'sports':
      return 'arena'
    case 'festival':
    case 'meetup':
    case 'webinar':
      return 'openfloor'
    default:
      return event.event_type?.seating_model === 'general' ? 'openfloor' : 'proscenium'
  }
}

const PREMIUM_RE = /vip|premium|gold|box|stall|club|front/i

interface PlannedSeat {
  rawIndex: number
  rowIndex: number
  colIndex: number
  rowGlobal: number
  block: SeatBlock
  status: SeatStatus
  x: number
  y: number
  z: number
  tier: TierName | null
}

interface SectionPlan {
  ticketType: TicketType
  quantity: number
  soldCount: number
  tier: TierName | null
  isPremium: boolean
  seats: PlannedSeat[]
  accessCols: number[]
}

interface LayoutResult {
  sections: SectionPlan[]
  metrics: PlanMetrics
}

/**
 * Build an adaptive seat plan for an event from its ticket types and the
 * per-ticket-type sold counts (from the public availability endpoint). The
 * backend only stores quantities, so seats are generated on the client and
 * "sold" seats are derived deterministically from the sold counts so the map
 * is stable across renders. Geometry is shared by the 2D SVG map and the 3D
 * WebGL venue view.
 *
 * Selection is deliberately not an input: the plan is expensive to build and
 * callers pass `selectedIds` straight to the view components instead, so
 * clicking a seat never regenerates the layout.
 */
export function buildVenuePlan(
  event: Event,
  ticketTypes: TicketType[],
  soldCountByType: Record<number, number>,
): VenuePlan {
  const stageMode = stageModeFor(event)

  const sections = ticketTypes
    .filter((t) => t.quantity > 0)
    .sort((a, b) => Number(b.price) - Number(a.price))

  const sumQuantities = sections.reduce((sum, t) => sum + t.quantity, 0)
  const totalSeats = event.total_tickets > 0 ? event.total_tickets : sumQuantities
  const tiered = totalSeats > 600
  const prices = sections.map((t) => Number(t.price))
  const priceRange = prices.length
    ? { min: Math.min(...prices), max: Math.max(...prices) }
    : { min: 0, max: 0 }

  const sectionPlans: SectionPlan[] = sections.map((ticketType) => {
    const quantity = ticketType.quantity
    const soldCount = Math.max(0, soldCountByType[ticketType.id] ?? 0)
    const clampedSold = Math.min(soldCount, quantity)
    const rng = mulberry32(event.id * 7919 + ticketType.id * 104729)
    const indices = Array.from({ length: quantity }, (_, i) => i)
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
    }
    const soldSet = new Set(indices.slice(0, clampedSold))

    const accessCols: number[] = []
    for (let i = 0; i < quantity; i++) {
      if (rng() < 0.07) accessCols.push(i)
    }

    return {
      ticketType,
      quantity,
      soldCount: clampedSold,
      tier: null,
      isPremium: PREMIUM_RE.test(ticketType.name),
      seats: Array.from({ length: quantity }, (_, i) => ({
        rowIndex: 0,
        colIndex: 0,
        rowGlobal: 0,
        block: 'main' as SeatBlock,
        x: 0.5,
        y: 0.5,
        z: 0,
        status: soldSet.has(i) ? ('sold' as const) : ('available' as const),
        rawIndex: i,
        tier: null,
      })),
      accessCols,
    }
  })

  assignTiers(sectionPlans, tiered)

  const layout: LayoutResult = (() => {
    switch (stageMode) {
      case 'proscenium':
        return layoutProscenium(sectionPlans)
      case 'thrust':
        return layoutThrust(sectionPlans)
      case 'arena':
        return layoutArena(sectionPlans)
      case 'openfloor':
        return layoutOpenFloor(sectionPlans)
    }
  })()

  const placed = layout.sections
  const metrics = layout.metrics

  // Arena bakes its own continuous bowl elevation during layout; every other
  // mode gets a per-row rake applied here, once the global rows are known.
  if (stageMode !== 'arena') {
    applyRake(placed, metrics)
  }

  const seats: Seat[] = []
  const planSections: SeatSection[] = []
  let totalSold = 0
  let totalAvailable = 0

  for (const plan of placed) {
    const seatIds: string[] = []
    const colsMax = Math.max(...plan.seats.map((s) => s.colIndex), 0)
    for (const s of plan.seats) {
      const id = `${plan.ticketType.id}-s${s.rawIndex}`
      const label = `${rowLabel(s.rowIndex)}${s.colIndex + 1}`
      const accessible =
        plan.accessCols.includes(s.rawIndex) || s.colIndex === 0 || s.colIndex === colsMax
      seatIds.push(id)
      seats.push({
        id,
        label,
        rowIndex: s.rowIndex,
        colIndex: s.colIndex,
        rowGlobal: s.rowGlobal,
        rowInTier: s.rowGlobal,
        block: s.block,
        ticketTypeId: plan.ticketType.id,
        status: s.status,
        x: s.x,
        y: s.y,
        z: s.z,
        tier: plan.tier,
        isAccessible: accessible && s.status !== 'sold',
        isPremium: plan.isPremium,
      })
    }
    totalSold += plan.soldCount
    totalAvailable += plan.quantity - plan.soldCount
    planSections.push({
      ticketType: plan.ticketType,
      seatIds,
      soldCount: plan.soldCount,
      tier: plan.tier,
    })
  }

  assignRowsInTier(seats)

  const tiers: TierName[] = []
  for (const t of ['Floor', 'Mezzanine', 'Balcony'] as const) {
    if (planSections.some((s) => s.tier === t)) tiers.push(t)
  }

  return {
    sections: planSections,
    seats,
    rows: stageMode === 'arena' ? [] : buildRowGeometry(seats),
    metrics,
    sectionBounds: computeBounds(seats, (s) => String(s.ticketTypeId)),
    tierBounds: computeBounds(seats, (s) => s.tier ?? 'none'),
    stageMode,
    tiered,
    tiers,
    priceRange,
    totalSeats,
    totalSold,
    totalAvailable,
  }
}

function assignTiers(sections: SectionPlan[], tiered: boolean) {
  if (!tiered) {
    for (const s of sections) {
      s.tier = null
      for (const seat of s.seats) seat.tier = null
    }
    return
  }
  const total = sections.reduce((sum, s) => sum + s.quantity, 0)
  let cum = 0
  for (const s of sections) {
    cum += s.quantity
    const frac = cum / total
    s.tier = frac <= 0.42 ? 'Floor' : frac <= 0.72 ? 'Mezzanine' : 'Balcony'
    for (const seat of s.seats) seat.tier = s.tier
  }
}

/**
 * Raise each row above the one in front of it so back rows can see over the
 * heads of the rows ahead. Rows are counted from the first row of their own
 * tier and block, so a tier starts its rake from its own base elevation.
 */
function applyRake(sections: SectionPlan[], metrics: PlanMetrics) {
  const firstRowOf = new Map<string, number>()
  for (const section of sections) {
    for (const seat of section.seats) {
      const key = `${seat.tier ?? 'none'}:${seat.block}`
      const current = firstRowOf.get(key)
      if (current === undefined || seat.rowGlobal < current) {
        firstRowOf.set(key, seat.rowGlobal)
      }
    }
  }

  for (const section of sections) {
    for (const seat of section.seats) {
      const key = `${seat.tier ?? 'none'}:${seat.block}`
      const rowInTier = seat.rowGlobal - (firstRowOf.get(key) ?? 0)
      seat.z = TIER_BASE[seat.tier ?? 'none'] + rowInTier * metrics.rowPitch * RAKE_RATIO
    }
  }
}

/** Fill in `rowInTier` on the finished seats, mirroring `applyRake`'s grouping. */
function assignRowsInTier(seats: Seat[]) {
  const firstRowOf = new Map<string, number>()
  for (const seat of seats) {
    const key = `${seat.tier ?? 'none'}:${seat.block}`
    const current = firstRowOf.get(key)
    if (current === undefined || seat.rowGlobal < current) {
      firstRowOf.set(key, seat.rowGlobal)
    }
  }
  for (const seat of seats) {
    const key = `${seat.tier ?? 'none'}:${seat.block}`
    seat.rowInTier = seat.rowGlobal - (firstRowOf.get(key) ?? 0)
  }
}

function buildRowGeometry(seats: Seat[]): RowGeometry[] {
  const groups = new Map<string, Seat[]>()
  for (const seat of seats) {
    const key = `${seat.tier ?? 'none'}:${seat.block}:${seat.rowGlobal}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(seat)
    else groups.set(key, [seat])
  }

  const rows: RowGeometry[] = []
  for (const [key, group] of groups) {
    let xMin = Infinity
    let xMax = -Infinity
    let ySum = 0
    for (const seat of group) {
      if (seat.x < xMin) xMin = seat.x
      if (seat.x > xMax) xMax = seat.x
      ySum += seat.y
    }
    const first = group[0]
    rows.push({
      key,
      tier: first.tier,
      block: first.block,
      rowGlobal: first.rowGlobal,
      y: ySum / group.length,
      xMin,
      xMax,
      elevation: first.z,
      seatCount: group.length,
    })
  }
  return rows
}

/**
 * Bounding boxes keyed by an arbitrary grouping. Computed once here because
 * the callers used to recompute them with `Math.min(...seats)` on every render,
 * which is both O(n) per frame and a spread-argument hazard at high seat counts.
 */
function computeBounds(seats: Seat[], keyOf: (seat: Seat) => string): Record<string, Bounds> {
  const result: Record<string, Bounds> = {}
  for (const seat of seats) {
    const key = keyOf(seat)
    const bounds = result[key]
    if (!bounds) {
      result[key] = { minX: seat.x, maxX: seat.x, minY: seat.y, maxY: seat.y }
      continue
    }
    if (seat.x < bounds.minX) bounds.minX = seat.x
    if (seat.x > bounds.maxX) bounds.maxX = seat.x
    if (seat.y < bounds.minY) bounds.minY = seat.y
    if (seat.y > bounds.maxY) bounds.maxY = seat.y
  }
  return result
}

const SEAT_W = 0.016
const SEAT_GAP = 0.006

function layoutProscenium(sections: SectionPlan[]): LayoutResult {
  const yBottom = 0.8
  const yTop = 0.06
  const rowsTotal = sections.reduce((sum, s) => {
    const cols = clamp(Math.ceil(Math.sqrt(s.quantity * 2.1)), 4, 26)
    return sum + Math.ceil(s.quantity / cols)
  }, 0)
  const rowH = (yBottom - yTop) / Math.max(1, rowsTotal)
  let cumRows = 0

  for (const s of sections) {
    const cols = clamp(Math.ceil(Math.sqrt(s.quantity * 2.1)), 4, 26)
    const rows = Math.max(1, Math.ceil(s.quantity / cols))
    for (let i = 0; i < s.seats.length; i++) {
      const r = Math.floor(i / cols)
      const c = i % cols
      const rowY = yBottom - (cumRows + r + 0.5) * rowH
      const x = 0.5 + (c - (cols - 1) / 2) * (SEAT_W + SEAT_GAP)
      const t = cols > 1 ? c / (cols - 1) : 0.5
      const bow = 4 * t * (1 - t) * rowH * 1.1
      const seat = s.seats[i]
      seat.rowIndex = r
      seat.colIndex = c
      seat.rowGlobal = cumRows + r
      seat.block = 'main'
      seat.x = x
      seat.y = rowY + bow
    }
    cumRows += rows
  }

  return { sections, metrics: { colPitch: SEAT_W + SEAT_GAP, rowPitch: rowH } }
}

function layoutThrust(sections: SectionPlan[]): LayoutResult {
  // Stage thrusts in from the front (bottom); seats wrap the back and both sides.

  const blockCols = (n: number, max: number) => clamp(Math.ceil(Math.sqrt(n * 2.1)), 2, max)
  const blockRows = (n: number, max: number) => Math.max(1, Math.ceil(n / blockCols(n, max)))

  const backRowsTotal = sections.reduce((sum, s) => {
    const back = Math.round(s.quantity * 0.45)
    return back > 0 ? sum + blockRows(back, 20) : sum
  }, 0)
  const wingRowsTotal = sections.reduce((sum, s) => {
    const side = Math.round(s.quantity * 0.275)
    return side > 0 ? sum + blockRows(side, 6) : sum
  }, 0)

  const backRowH = (0.7 - 0.06) / Math.max(1, backRowsTotal)
  const wingRowH = (0.9 - 0.76) / Math.max(1, wingRowsTotal)

  let backCursor = 0.7
  let leftCursor = 0.76
  let rightCursor = 0.76
  let backRowsUsed = 0
  let leftRowsUsed = 0
  let rightRowsUsed = 0
  let maxBackCols = 2

  const placeBlock = (
    seats: PlannedSeat[],
    count: number,
    cols: number,
    xMin: number,
    xMax: number,
    cursorY: number,
    rowH: number,
    direction: 'up' | 'down',
    block: SeatBlock,
    rowsUsed: number,
    rowOffset = 0,
  ) => {
    const rows = Math.max(1, Math.ceil(count / cols))
    const step = (xMax - xMin) / Math.max(1, cols)
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / cols)
      const c = i % cols
      const rowY = direction === 'down' ? cursorY - (r + 0.5) * rowH : cursorY + (r + 0.5) * rowH
      const seat = seats[i]
      seat.rowIndex = r + rowOffset
      seat.colIndex = c
      seat.rowGlobal = rowsUsed + r
      seat.block = block
      seat.x = xMin + (c + 0.5) * step
      seat.y = rowY
    }
    return { depth: rows * rowH, rows }
  }

  for (const s of sections) {
    const back = Math.round(s.quantity * 0.45)
    const left = Math.round(s.quantity * 0.275)
    const right = s.quantity - back - left
    let offset = 0

    if (back > 0) {
      const cols = blockCols(back, 20)
      maxBackCols = Math.max(maxBackCols, cols)
      const used = placeBlock(
        s.seats.slice(offset, offset + back),
        back, cols, 0.1, 0.9, backCursor, backRowH, 'down', 'back', backRowsUsed,
      )
      backCursor -= used.depth
      backRowsUsed += used.rows
      offset += back
    }
    if (left > 0) {
      const cols = blockCols(left, 6)
      const used = placeBlock(
        s.seats.slice(offset, offset + left),
        left, cols, 0.06, 0.24, leftCursor, wingRowH, 'up', 'left', leftRowsUsed, 40,
      )
      leftCursor += used.depth
      leftRowsUsed += used.rows
      offset += left
    }
    if (right > 0) {
      const cols = blockCols(right, 6)
      const used = placeBlock(
        s.seats.slice(offset, offset + right),
        right, cols, 0.76, 0.94, rightCursor, wingRowH, 'up', 'right', rightRowsUsed, 80,
      )
      rightCursor += used.depth
      rightRowsUsed += used.rows
    }
  }

  return {
    sections,
    metrics: {
      colPitch: (0.9 - 0.1) / maxBackCols,
      rowPitch: Math.min(backRowH, wingRowH),
    },
  }
}

function layoutArena(sections: SectionPlan[]): LayoutResult {
  const total = sections.reduce((sum, s) => sum + s.quantity, 0)
  const cx = 0.5
  const cy = 0.5
  const baseR = 0.15
  const step = 0.045
  const arc = 0.05

  const radii: number[] = []
  let capacity = 0
  let ring = 0
  while (capacity < total && ring < 14) {
    const r = baseR + step * ring
    const cap = Math.max(8, Math.floor((2 * Math.PI * r) / arc))
    radii.push(r)
    capacity += cap
    ring++
  }

  const used: number[] = radii.map(() => 0)
  const caps = radii.map((r) => Math.floor((2 * Math.PI * r) / arc))
  const maxR = radii[radii.length - 1]

  for (const s of sections) {
    for (let i = 0; i < s.seats.length; i++) {
      const ringIdx = used.findIndex((u, idx) => u < caps[idx])
      const r = radii[ringIdx]
      const pos = used[ringIdx]
      const angle = (pos / caps[ringIdx]) * Math.PI * 2 + i * 0.0007
      const seat = s.seats[i]
      seat.rowIndex = ringIdx
      seat.colIndex = pos
      seat.rowGlobal = ringIdx
      seat.block = 'main'
      seat.x = cx + r * Math.cos(angle)
      seat.y = cy + r * Math.sin(angle) * 0.62
      seat.z = r / maxR
      const frac = r / maxR
      seat.tier = frac <= 0.38 ? 'Floor' : frac <= 0.7 ? 'Mezzanine' : 'Balcony'
      used[ringIdx]++
    }
  }
  for (const s of sections) {
    s.tier = s.seats[0]?.tier ?? null
  }

  return { sections, metrics: { colPitch: arc, rowPitch: step } }
}

function layoutOpenFloor(sections: SectionPlan[]): LayoutResult {
  // Standing zones with wide spacing; the layout reuses proscenium stacking
  // but seats are drawn as larger spots with section outlines.
  const yBottom = 0.82
  const yTop = 0.06
  const rowsTotal = sections.reduce((sum, s) => {
    const cols = clamp(Math.ceil(Math.sqrt(s.quantity * 2.6)), 4, 22)
    return sum + Math.max(1, Math.ceil(s.quantity / cols))
  }, 0)
  const rowH = (yBottom - yTop) / Math.max(1, rowsTotal)
  const stepW = SEAT_W * 1.6 + SEAT_GAP
  let cumRows = 0

  for (const s of sections) {
    const cols = clamp(Math.ceil(Math.sqrt(s.quantity * 2.6)), 4, 22)
    const rows = Math.max(1, Math.ceil(s.quantity / cols))
    for (let i = 0; i < s.seats.length; i++) {
      const r = Math.floor(i / cols)
      const c = i % cols
      const rowY = yBottom - (cumRows + r + 0.5) * rowH
      const x = 0.5 + (c - (cols - 1) / 2) * stepW
      const seat = s.seats[i]
      seat.rowIndex = r
      seat.colIndex = c
      seat.rowGlobal = cumRows + r
      seat.block = 'main'
      seat.x = x
      seat.y = rowY
    }
    cumRows += rows
  }

  return { sections, metrics: { colPitch: stepW, rowPitch: rowH } }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
