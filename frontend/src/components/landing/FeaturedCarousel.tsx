import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Event, TicketType } from '../../types'
import { EventCover } from '../events/EventCover'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { formatCurrency, formatDateTime } from '../../lib/format'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { cn } from '../../lib/cn'

interface FeaturedCarouselProps {
  events: Event[]
  ticketTypes: TicketType[]
}

const DWELL_MS = 6000

/**
 * Auto-advancing spotlight for the featured events.
 *
 * Slides are all mounted and cross-faded rather than swapped, so the cover
 * photos stay warm in the browser cache and the transition never flashes empty.
 * Advancing pauses on hover, on keyboard focus, when the tab is hidden and
 * whenever the viewer prefers reduced motion.
 */
export function FeaturedCarousel({ events, ticketTypes }: FeaturedCarouselProps) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = usePrefersReducedMotion()
  const timer = useRef<number | undefined>(undefined)

  const count = events.length

  const go = useCallback(
    (next: number) => {
      if (count === 0) return
      setIndex(((next % count) + count) % count)
    },
    [count],
  )

  useEffect(() => {
    if (reduced || paused || count < 2) return

    const tick = () => setIndex((current) => (current + 1) % count)
    timer.current = window.setInterval(tick, DWELL_MS)

    const onVisibility = () => {
      if (document.hidden) {
        window.clearInterval(timer.current)
      } else {
        window.clearInterval(timer.current)
        timer.current = window.setInterval(tick, DWELL_MS)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(timer.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reduced, paused, count])

  if (count === 0) return null

  const active = events[index]

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured events"
      className="relative overflow-hidden rounded-3xl border border-line bg-ink"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative aspect-[16/10] sm:aspect-[21/9]">
        {events.map((event, i) => (
          <div
            key={event.id}
            aria-hidden={i !== index}
            className={cn(
              'absolute inset-0',
              !reduced && 'transition-opacity duration-700 ease-out',
              i === index ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            <EventCover event={event} priority={i === 0} />
          </div>
        ))}

        {/* Scrim so the copy stays readable over any photograph. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(18,18,18,0.94) 0%, rgba(18,18,18,0.72) 42%, rgba(18,18,18,0.15) 100%)',
          }}
        />

        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:justify-center sm:p-10">
          <div className="max-w-lg">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-accent-soft">
              {active.event_type?.name ?? 'Featured'}
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-4xl">
              {active.title}
            </h3>
            <p className="mt-2 text-sm text-muted sm:text-base">
              {active.venue ?? 'Venue TBA'} · {formatDateTime(active.starts_at)}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link to={`/events/${active.id}`}>
                <Button size="lg">Get tickets</Button>
              </Link>
              <FromPrice event={active} ticketTypes={ticketTypes} />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-5 right-5 flex items-center gap-2 sm:bottom-6 sm:right-6">
        <IconButton aria-label="Previous featured event" onClick={() => go(index - 1)}>
          <Arrow className="rotate-90" />
        </IconButton>
        <IconButton aria-label="Next featured event" onClick={() => go(index + 1)}>
          <Arrow className="-rotate-90" />
        </IconButton>
      </div>

      <div className="absolute bottom-7 left-6 flex items-center gap-2 sm:bottom-8 sm:left-10">
        {events.map((event, i) => (
          <button
            key={event.id}
            type="button"
            aria-label={`Show ${event.title}`}
            aria-current={i === index}
            onClick={() => go(i)}
            className={cn(
              'h-1 rounded-full transition-all duration-300',
              i === index ? 'w-7 bg-accent' : 'w-3 bg-white/25 hover:bg-white/50',
            )}
          />
        ))}
      </div>

      <span aria-live="polite" className="sr-only">
        {`Slide ${index + 1} of ${count}: ${active.title}`}
      </span>
    </section>
  )
}

function FromPrice({ event, ticketTypes }: { event: Event; ticketTypes: TicketType[] }) {
  const prices = ticketTypes
    .filter((type) => type.event_id === event.id)
    .map((type) => Number(type.price))

  if (prices.length === 0) return null

  return (
    <p className="text-sm text-muted">
      from <span className="text-lg font-semibold text-white">{formatCurrency(Math.min(...prices))}</span>
    </p>
  )
}

function Arrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('size-4', className)}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
