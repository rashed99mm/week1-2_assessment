import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Event, EventType, Paginated, TicketType } from '../types'
import { Button, Spinner } from '../components/ui/Button'
import { EventCard } from '../components/events/EventCard'
import { HeroAmbient } from '../components/landing/HeroAmbient'
import { FeaturedCarousel } from '../components/landing/FeaturedCarousel'
import { Alert } from '../components/ui/Alert'

const highlights = [
  {
    title: 'Adaptive seat maps',
    description:
      'Every venue lays itself out from the stage type — proscenium rows, thrust wings, arena rings or open floor — so the map always matches the room.',
  },
  {
    title: 'Sit before you buy',
    description:
      'Drop into any seat in first person, look around, then step to the seat beside it and compare the view before committing.',
  },
  {
    title: 'Tiered pricing, plainly',
    description:
      'Filter by tier, price and accessibility. Availability updates from live orders, so what you see is what is left.',
  },
]

/** Live counters for the landing band. */
function StatsBand({
  eventCount,
  typeCount,
  loading,
}: {
  eventCount: number
  typeCount: number
  loading: boolean
}) {
  const stats = [
    { value: loading ? '—' : String(eventCount), label: 'events on sale' },
    { value: loading ? '—' : String(typeCount), label: 'categories' },
    { value: '2D + 3D', label: 'ways to pick a seat' },
    { value: '60s', label: 'from browse to booked' },
  ]

  return (
    <section className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-panel px-5 py-6 text-center">
          <p className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {stat.value}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wider text-muted">{stat.label}</p>
        </div>
      ))}
    </section>
  )
}

const steps = [
  {
    number: '01',
    title: 'Browse events',
    description: 'Search by name or venue and filter by event type.',
  },
  {
    number: '02',
    title: 'Pick your seats',
    description: 'Explore an adaptive seat map or a 3D venue view and choose exactly where you sit.',
  },
  {
    number: '03',
    title: 'Check out securely',
    description: 'Create an account, pay online, and get your tickets instantly.',
  },
]

export function LandingPage() {
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [featured, setFeatured] = useState<Paginated<Event> | null>(null)
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [types, events, tickets] = await Promise.all([
          api.get<EventType[]>('/api/event-types'),
          api.get<Paginated<Event>>(
            '/api/events?per_page=9&filters[status]=published&sort_by=starts_at&sort_order=asc',
          ),
          api.get<TicketType[]>('/api/ticket-types'),
        ])
        setEventTypes(types)
        setFeatured(events)
        setTicketTypes(tickets)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load events.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  return (
    <div className="space-y-16 sm:space-y-24">
      {/* Negative margins bleed the hero to the viewport edge inside Layout's
          max-w-7xl container; the mask dissolves the darker hero into the page. */}
      <section className="relative isolate -mx-4 overflow-hidden bg-ink px-4 py-16 text-center [mask-image:linear-gradient(to_bottom,black_78%,transparent)] sm:-mx-6 sm:rounded-3xl sm:px-6 sm:py-24">
        {/* Photograph, then a scrim to protect the type, then the live canvas. */}
        <img
          src="/hero-bg.jpg"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          // Partly desaturated so the stage's amber does not compete with the
          // crimson accent, which is meant to be the only colour that carries
          // meaning in the interface.
          className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover object-center opacity-60 saturate-[0.55]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(72% 62% at 50% 45%, rgba(18,18,18,0.62), rgba(18,18,18,0.93) 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(18,18,18,0.55) 0%, rgba(18,18,18,0) 35%, rgba(18,18,18,0.75) 100%)',
          }}
        />
        <HeroAmbient transparent />
        <div className="relative z-10">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted">
            Concerts · Sports · Theater · Conferences
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Your seat. Your show. Booked in seconds.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted sm:text-lg">
            Browse live events, explore an adaptive seat map with a 3D venue view,
            and check out in a couple of clicks.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/events">
              <Button size="lg">Browse events</Button>
            </Link>
            <Link to="/register">
              <Button variant="secondary" size="lg">
                Register free
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {featured && featured.data.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">On sale now</h2>
              <p className="mt-1 text-sm text-muted">Handpicked events happening soon.</p>
            </div>
            <Link to="/events" className="text-sm font-medium text-muted hover:text-white">
              View all →
            </Link>
          </div>
          <FeaturedCarousel events={featured.data.slice(0, 5)} ticketTypes={ticketTypes} />
        </section>
      )}

      <StatsBand
        eventCount={featured?.total ?? 0}
        typeCount={eventTypes.length}
        loading={loading}
      />

      {eventTypes.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Browse by type</h2>
            <Link to="/events" className="text-sm font-medium text-muted hover:text-white">
              View all →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {eventTypes.map((type) => (
              <Link
                key={type.id}
                to={`/events?type=${type.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium text-muted transition-[color,border-color] duration-200 hover:border-white/35 hover:text-white"
              >
                {type.name}
                {type.is_online && (
                  <span className="ml-1.5 text-xs text-accent-soft">online</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Upcoming events</h2>
            <p className="mt-1 text-sm text-muted">Everything opening its doors soon.</p>
          </div>
          <Link to="/events" className="text-sm font-medium text-muted hover:text-white">
            View all →
          </Link>
        </div>

        {loading && (
          <div className="flex justify-center py-16 text-accent">
            <Spinner className="size-8" />
          </div>
        )}

        {error && (
          <Alert tone="error" title="Failed to load events">
            {error}
          </Alert>
        )}

        {featured && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.data.map((event) => (
              <EventCard key={event.id} event={event} ticketTypes={ticketTypes} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-8">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-white">How it works</h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="rounded-2xl border border-line bg-panel p-6 text-center transition-colors duration-300 hover:border-white/18"
            >
              <span className="mx-auto flex size-10 items-center justify-center rounded-full border border-line font-mono text-sm font-semibold text-accent">
                {step.number}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm text-muted">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {highlights.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-line bg-panel p-6 transition-colors duration-300 hover:border-white/18"
          >
            <h3 className="text-base font-semibold text-white">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.description}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-line bg-ink px-6 py-12 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Ready to grab your seat?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Create an account to book tickets, track orders, and never miss a show.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/register">
            <Button size="lg">Register free</Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" size="lg">
              I already have an account
            </Button>
          </Link>
        </div>
      </section>
    </div>
  )
}
