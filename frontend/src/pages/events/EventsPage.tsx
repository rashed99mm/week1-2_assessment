import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import type { Event, EventType, Paginated, TicketType } from '../../types'
import { Spinner } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { Pagination } from '../../components/ui/Pagination'
import { Select } from '../../components/ui/Input'
import { EventCard } from '../../components/events/EventCard'
import { Pill } from '../../components/ui/Pill'

const PER_PAGE = 9

function useDebouncedValue(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') ?? '')
  const [sort, setSort] = useState(searchParams.get('sort') ?? 'soonest')
  const [page, setPage] = useState(Number(searchParams.get('page') ?? 1))

  const [pageData, setPageData] = useState<Paginated<Event> | null>(null)
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const debouncedSearch = useDebouncedValue(search)
  const skipUrlSync = useRef(true)

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true)
      setError(null)
      const sortConfig: Record<string, { sort_by: string; sort_order: string }> = {
        soonest: { sort_by: 'starts_at', sort_order: 'asc' },
        newest: { sort_by: 'created_at', sort_order: 'desc' },
        az: { sort_by: 'title', sort_order: 'asc' },
      }
      const { sort_by, sort_order } = sortConfig[sort] ?? sortConfig.soonest
      try {
        const [events, types, tickets] = await Promise.all([
          api.get<Paginated<Event>>(
            `/api/events?per_page=${PER_PAGE}&page=${targetPage}&filters[status]=published&filters[search]=${encodeURIComponent(debouncedSearch)}&filters[event_type_id]=${typeFilter}&sort_by=${sort_by}&sort_order=${sort_order}`,
          ),
          api.get<EventType[]>('/api/event-types'),
          api.get<TicketType[]>('/api/ticket-types'),
        ])
        setPageData(events)
        setEventTypes(types)
        setTicketTypes(tickets)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load events.')
      } finally {
        setLoading(false)
      }
    },
    [debouncedSearch, typeFilter, sort],
  )

  useEffect(() => {
    void load(page)
  }, [load, page])

  useEffect(() => {
    if (skipUrlSync.current) {
      skipUrlSync.current = false
      return
    }
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (typeFilter) params.set('type', typeFilter)
    if (sort !== 'soonest') params.set('sort', sort)
    if (page > 1) params.set('page', String(page))
    setSearchParams(params, { replace: true })
  }, [search, typeFilter, sort, page, setSearchParams])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, typeFilter, sort])

  const total = pageData?.total ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Events</h1>
        <p className="mt-1 text-muted">Search upcoming events by name or venue.</p>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-accent">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events…"
              className="w-full rounded-full border-0 bg-ink py-2.5 pl-10 pr-3 text-sm text-white ring-1 ring-inset ring-muted/40 placeholder:text-muted focus:ring-2 focus:ring-inset focus:ring-accent focus:outline-none"
            />
          </div>
          <div className="w-full sm:w-48">
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
              <option value="soonest">Soonest first</option>
              <option value="newest">Newest first</option>
              <option value="az">Title A–Z</option>
            </Select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Pill active={typeFilter === ''} onClick={() => setTypeFilter('')}>
            All types
          </Pill>
          {eventTypes.map((type) => (
            <Pill
              key={type.id}
              active={typeFilter === String(type.id)}
              onClick={() => setTypeFilter(String(type.id))}
            >
              {type.name}
            </Pill>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted">
        {loading ? 'Loading…' : `${total} event${total === 1 ? '' : 's'} found`}
      </p>

      {error && (
        <Alert tone="error" title="Failed to load events">
          {error}
        </Alert>
      )}

      {loading && !pageData && (
        <div className="flex justify-center py-24 text-accent">
          <Spinner className="size-10" />
        </div>
      )}

      {pageData && (
        <>
          {pageData.data.length === 0 ? (
            <Alert tone="info" title="No events match your search">
              Try a different keyword or clear the filters.
            </Alert>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pageData.data.map((event) => (
                <EventCard key={event.id} event={event} ticketTypes={ticketTypes} />
              ))}
            </div>
          )}
          <Pagination page={pageData} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}

function SearchIcon() {
  return (
    <svg className="size-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
        clipRule="evenodd"
      />
    </svg>
  )
}
