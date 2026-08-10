import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VenuePlan, Seat as VenueSeat, TierName } from '../../lib/venueLayout'
import type { Event } from '../../types'
import { SeatMap2D, type MapTransform } from './SeatMap2D'
import { IconButton } from '../ui/IconButton'
import { MinusIcon, PlusIcon, RecenterIcon } from '../ui/icons'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { cn } from '../../lib/cn'

const Venue3DLazy = lazy(() => import('./Venue3D').then((m) => ({ default: m.Venue3D })))

interface SeatViewerProps {
  event: Event
  plan: VenuePlan
  selectedIds: string[]
  dimmedIds: Set<string>
  onToggleSeat: (seat: VenueSeat) => void
  priceOf?: (ticketTypeId: number) => number
}

const IDENTITY: MapTransform = { scale: 1, tx: 0, ty: 0 }

/** Crossfade length; also how long the 3D canvas lingers after switching away. */
const FADE_MS = 620
const LINGER_MS = 800

type Phase = 'idle2d' | 'to3d' | 'idle3d' | 'to2d'

export function SeatViewer({
  event,
  plan,
  selectedIds,
  dimmedIds,
  onToggleSeat,
  priceOf,
}: SeatViewerProps) {
  const [phase, setPhase] = useState<Phase>('idle2d')
  const [mounted3d, setMounted3d] = useState(false)
  const [transform, setTransform] = useState<MapTransform>(IDENTITY)
  const reduced = usePrefersReducedMotion()
  const timers = useRef<number[]>([])

  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id))
    },
    [],
  )

  const view = phase === 'idle3d' || phase === 'to3d' ? '3d' : '2d'
  // Both layers stay mounted through a transition so the camera move and the
  // cross-dissolve read as one continuous motion instead of a hard swap.
  const show3d = phase !== 'idle2d'
  const show2d = phase !== 'idle3d'

  // Warm the three.js chunk before the click so the switch is never a cold load.
  const preload3d = useCallback(() => {
    void import('./Venue3D')
  }, [])

  const goTo = (next: '2d' | '3d') => {
    if (next === view) return
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []

    if (next === '3d') {
      setMounted3d(true)
      if (reduced) {
        setPhase('idle3d')
        return
      }
      setPhase('to3d')
      timers.current.push(window.setTimeout(() => setPhase('idle3d'), FADE_MS))
      return
    }

    if (reduced) {
      setPhase('idle2d')
      setMounted3d(false)
      return
    }
    setPhase('to2d')
    timers.current.push(window.setTimeout(() => setPhase('idle2d'), FADE_MS))
    timers.current.push(window.setTimeout(() => setMounted3d(false), FADE_MS + LINGER_MS))
  }

  const drillTier = (tier: TierName | 'all') => {
    if (!plan.tiered) return
    if (tier === 'all') {
      setTransform(IDENTITY)
      return
    }
    const bounds = plan.tierBounds[tier]
    if (!bounds) return
    const cx = toPxX((bounds.minX + bounds.maxX) / 2)
    const cy = toPxY((bounds.minY + bounds.maxY) / 2)
    const scale = 2.4
    setTransform({ scale, tx: 500 - cx * scale, ty: 330 - cy * scale })
  }

  const zoomBy = (factor: number) =>
    setTransform((t) => ({ ...t, scale: Math.min(6, Math.max(1, t.scale * factor)) }))

  const reset = () => setTransform(IDENTITY)

  const floatingButtons = useMemo(
    () => (
      <>
        <IconButton aria-label="Zoom in" onClick={() => zoomBy(1.3)}>
          <PlusIcon />
        </IconButton>
        <IconButton aria-label="Zoom out" onClick={() => zoomBy(1 / 1.3)}>
          <MinusIcon />
        </IconButton>
        <IconButton aria-label="Reset view" onClick={reset}>
          <RecenterIcon />
        </IconButton>
      </>
    ),
    [],
  )

  const fadeClass = (visible: boolean) =>
    cn(
      'absolute inset-0 transition-opacity ease-out',
      reduced ? 'duration-0' : 'duration-[620ms]',
      visible ? 'opacity-100' : 'pointer-events-none opacity-0',
    )

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-2xl border border-line bg-ink">
      <div className={fadeClass(show2d)} aria-hidden={!show2d}>
        <SeatMap2D
          plan={plan}
          selectedIds={selectedIds}
          dimmedIds={dimmedIds}
          transform={transform}
          onToggleSeat={onToggleSeat}
        />
      </div>

      {mounted3d && (
        <div className={fadeClass(show3d)} aria-hidden={!show3d}>
          <Suspense
            fallback={
              <div className="absolute bottom-4 left-4 rounded-full border border-line bg-ink/80 px-3 py-1 text-xs text-muted backdrop-blur-sm">
                Loading 3D venue…
              </div>
            }
          >
            <Venue3DLazy
              event={event}
              plan={plan}
              selectedIds={selectedIds}
              dimmedIds={dimmedIds}
              onToggleSeat={onToggleSeat}
              entry="fromTop"
              mapTransform={transform}
              priceOf={priceOf}
            />
          </Suspense>
        </div>
      )}

      {plan.tiered && view === '2d' && (
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          {(['all', ...plan.tiers] as const).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => drillTier(tier)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm',
                'transition-[color,border-color,background-color] duration-200',
                tier === 'all' && transform.scale === 1
                  ? 'border-accent/70 bg-accent/12 text-white'
                  : 'border-line bg-black/40 text-muted hover:border-white/35 hover:text-white',
              )}
            >
              {tier === 'all' ? 'All' : tier}
            </button>
          ))}
        </div>
      )}

      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          {view === '2d' ? floatingButtons : null}
          <div
            role="group"
            aria-label="Seat map view"
            className="flex items-center gap-1 rounded-full border border-line bg-ink/80 p-1 backdrop-blur-sm"
          >
            <ViewToggle
              label="Two dimensional map"
              text="2D"
              active={view === '2d'}
              onSelect={() => goTo('2d')}
            />
            <ViewToggle
              label="Three dimensional venue"
              text="3D"
              active={view === '3d'}
              onSelect={() => goTo('3d')}
              onPreload={preload3d}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ViewToggle({
  label,
  text,
  active,
  onSelect,
  onPreload,
}: {
  label: string
  text: string
  active: boolean
  onSelect: () => void
  onPreload?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onSelect}
      onPointerEnter={onPreload}
      onFocus={onPreload}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200',
        active ? 'bg-accent text-white' : 'text-muted hover:text-white',
      )}
    >
      {text}
    </button>
  )
}

function toPxX(x: number): number {
  return 10 + x * 980
}

function toPxY(y: number): number {
  return 20 + y * 620
}
