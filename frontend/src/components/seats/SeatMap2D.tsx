import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { STAGE_BAND, type VenuePlan, type Seat as VenueSeat } from '../../lib/venueLayout'
import {
  firstSelectableSeat,
  lastSelectableSeat,
  nextSeatInDirection,
  type SeatDirection,
} from '../../lib/seatNavigation'
import { tokens, venueTokens } from '../../lib/tokens'
import { cn } from '../../lib/cn'

export interface MapTransform {
  scale: number
  tx: number
  ty: number
}

interface SeatMap2DProps {
  plan: VenuePlan
  selectedIds: string[]
  dimmedIds: Set<string>
  transform: MapTransform
  onToggleSeat: (seat: VenueSeat) => void
}

const X = (x: number) => 10 + x * 980
const Y = (y: number) => 20 + y * 620

const ARROW_KEYS: Record<string, SeatDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

export function SeatMap2D({ plan, selectedIds, dimmedIds, transform, onToggleSeat }: SeatMap2DProps) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const skip = useCallback(
    (seat: VenueSeat) => seat.status === 'sold' || dimmedIds.has(seat.id),
    [dimmedIds],
  )

  // Roving tabindex: exactly one seat is tabbable, arrows move between them.
  // 1500 individual tab stops would be worse for keyboard users than none.
  const [focusedId, setFocusedId] = useState<string | null>(null)

  useEffect(() => {
    setFocusedId((current) => {
      if (current && plan.seats.some((s) => s.id === current && !skip(s))) return current
      return firstSelectableSeat(plan.seats, skip)?.id ?? null
    })
  }, [plan.seats, skip])

  const moveFocus = (seat: VenueSeat | null) => {
    if (!seat) return
    setFocusedId(seat.id)
    document.getElementById(`seat-${seat.id}`)?.focus()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<SVGElement>, seat: VenueSeat) => {
    const direction = ARROW_KEYS[event.key]
    if (direction) {
      event.preventDefault()
      moveFocus(nextSeatInDirection(plan.seats, seat.id, direction, skip))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      moveFocus(firstSelectableSeat(plan.seats, skip))
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      moveFocus(lastSelectableSeat(plan.seats, skip))
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggleSeat(seat)
    }
  }

  return (
    <svg
      viewBox="0 0 1000 660"
      className="h-full w-full"
      role="application"
      aria-label={`${plan.stageMode} seat map, ${plan.totalAvailable} seats available`}
    >
      <defs>
        <linearGradient id="stage-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={venueTokens.stageTop} />
          <stop offset="100%" stopColor={venueTokens.stageBottom} />
        </linearGradient>
      </defs>

      <g
        transform={`translate(${500 + transform.tx} ${330 + transform.ty}) scale(${transform.scale}) translate(-500 -330)`}
      >
        <Stage mode={plan.stageMode} />
        {plan.stageMode === 'openfloor' && <ZoneOutlines plan={plan} />}
        {plan.seats.map((seat) => (
          <SeatShape
            key={seat.id}
            seat={seat}
            mode={plan.stageMode}
            isSelected={selectedSet.has(seat.id)}
            isDimmed={dimmedIds.has(seat.id)}
            isTabStop={seat.id === focusedId}
            sectionName={
              plan.sections.find((s) => s.ticketType.id === seat.ticketTypeId)?.ticketType.name ?? ''
            }
            onToggle={onToggleSeat}
            onKeyDown={handleKeyDown}
            onFocus={setFocusedId}
          />
        ))}
      </g>
    </svg>
  )
}

function Stage({ mode }: { mode: VenuePlan['stageMode'] }) {
  const band = STAGE_BAND[mode]

  if (mode === 'arena') {
    return (
      <g>
        <ellipse
          cx={X(0.5)}
          cy={Y(0.5)}
          rx={155}
          ry={96}
          fill="none"
          stroke={venueTokens.stageEdge}
          strokeWidth={2}
        />
        <ellipse
          cx={X(0.5)}
          cy={Y(0.5)}
          rx={110}
          ry={70}
          fill={tokens.page}
          stroke={venueTokens.stageRim}
          strokeWidth={2}
        />
        <circle cx={X(0.5)} cy={Y(0.5)} r={54} fill="url(#stage-grad)" stroke={venueTokens.stageEdge} />
        <StageLabel x={X(0.5)} y={Y(0.5) + 4} />
      </g>
    )
  }

  return (
    <g>
      <rect
        x={X(band.minX)}
        y={Y(band.minY)}
        width={X(band.maxX) - X(band.minX)}
        height={Y(band.maxY) - Y(band.minY)}
        rx={mode === 'thrust' ? 10 : 12}
        fill="url(#stage-grad)"
        stroke={venueTokens.stageEdge}
      />
      {mode !== 'thrust' && (
        <line
          x1={X(band.minX)}
          y1={Y(band.minY + 0.02)}
          x2={X(band.maxX)}
          y2={Y(band.minY + 0.02)}
          stroke={venueTokens.stageRim}
          strokeWidth={1}
        />
      )}
      <StageLabel x={X(0.5)} y={Y((band.minY + band.maxY) / 2) + 4} />
    </g>
  )
}

function StageLabel({ x, y }: { x: number; y: number }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill={tokens.muted}
      fontSize="11"
      fontWeight="600"
      letterSpacing="3"
      pointerEvents="none"
    >
      STAGE
    </text>
  )
}

function ZoneOutlines({ plan }: { plan: VenuePlan }) {
  return (
    <g>
      {plan.sections.map((section) => {
        const bounds = plan.sectionBounds[section.ticketType.id]
        if (!bounds) return null
        const minX = bounds.minX - 0.018
        const maxX = bounds.maxX + 0.018
        const minY = bounds.minY - 0.02
        const maxY = bounds.maxY + 0.02
        return (
          <g key={section.ticketType.id}>
            <rect
              x={X(minX)}
              y={Y(minY)}
              width={X(maxX) - X(minX)}
              height={Y(maxY) - Y(minY)}
              rx={12}
              fill="none"
              stroke={venueTokens.stageEdge}
              strokeWidth={1.5}
              strokeDasharray="6 6"
            />
            <text
              x={X(maxX)}
              y={Y(minY) + 16}
              textAnchor="end"
              fill={tokens.muted}
              fontSize="12"
              fontWeight="600"
            >
              {section.ticketType.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function SeatShape({
  seat,
  mode,
  isSelected,
  isDimmed,
  isTabStop,
  sectionName,
  onToggle,
  onKeyDown,
  onFocus,
}: {
  seat: VenueSeat
  mode: VenuePlan['stageMode']
  isSelected: boolean
  isDimmed: boolean
  isTabStop: boolean
  sectionName: string
  onToggle: (seat: VenueSeat) => void
  onKeyDown: (event: ReactKeyboardEvent<SVGElement>, seat: VenueSeat) => void
  onFocus: (id: string) => void
}) {
  const cx = X(seat.x)
  const cy = Y(seat.y)
  const isSold = seat.status === 'sold'
  const interactive = !isSold && !isDimmed

  const state = isSold ? 'reserved' : isDimmed ? 'filtered out' : isSelected ? 'selected' : 'available'

  const common = {
    id: `seat-${seat.id}`,
    className: cn('seat transition-all', isSelected && 'seat-selected'),
    opacity: isDimmed ? 0.12 : isSold ? 0.55 : 1,
    onClick: interactive ? () => onToggle(seat) : undefined,
    onKeyDown: interactive ? (e: ReactKeyboardEvent<SVGElement>) => onKeyDown(e, seat) : undefined,
    onFocus: interactive ? () => onFocus(seat.id) : undefined,
    role: interactive ? 'button' : undefined,
    tabIndex: interactive && isTabStop ? 0 : -1,
    'aria-pressed': interactive ? isSelected : undefined,
    'aria-label': `Seat ${seat.label}${sectionName ? `, ${sectionName}` : ''}, ${state}`,
    style: interactive ? { cursor: 'pointer' } : { cursor: 'not-allowed' },
  }

  const accessible = seat.isAccessible && !isSold && !isSelected

  // Rendered inside the shape so pointer users get the native SVG tooltip;
  // screen readers use the aria-label on the shape itself instead.
  const tooltip = (
    <title>
      {seat.label} — {state}
    </title>
  )

  const shapes = (() => {
    if (mode === 'arena') {
      const r = isSelected ? 9.5 : 8
      return (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={seatFill(seat, isSelected)}
          stroke={seatStroke(seat, isSelected, isSold)}
          strokeWidth={isSelected || seat.isPremium ? 0 : 1}
          {...common}
        >
          {tooltip}
        </circle>
      )
    }
    const w = mode === 'openfloor' ? 20 : 16
    const h = mode === 'openfloor' ? 15 : 12
    return (
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={3.5}
        fill={seatFill(seat, isSelected)}
        stroke={seatStroke(seat, isSelected, isSold)}
        strokeWidth={isSelected || seat.isPremium ? 0 : 1}
        {...common}
      >
        {tooltip}
      </rect>
    )
  })()

  return (
    <g>
      {shapes}
      {accessible && <circle cx={cx} cy={cy} r={2.4} fill={tokens.surface} pointerEvents="none" />}
      {seat.isPremium && !isSold && !isDimmed && !isSelected && (
        <circle cx={cx + 4.5} cy={cy - 4.5} r={1.4} fill={tokens.accent} pointerEvents="none" />
      )}
    </g>
  )
}

function seatFill(seat: VenueSeat, isSelected: boolean): string {
  if (isSelected) return tokens.accent
  if (seat.status === 'sold') return venueTokens.seatSold2D
  if (seat.isPremium) return venueTokens.seatPremium2D
  return 'transparent'
}

function seatStroke(seat: VenueSeat, isSelected: boolean, isSold: boolean): string {
  if (isSelected) return tokens.accent
  if (isSold) return venueTokens.seatSold2D
  if (seat.isPremium) return venueTokens.seatPremium2D
  if (seat.isAccessible) return tokens.surface
  return tokens.muted
}
