import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, formatApiErrors } from '../../lib/api'
import type { Event, EventType, Paginated } from '../../types'
import { Badge, statusTone } from '../../components/ui/Badge'
import { Button, Spinner } from '../../components/ui/Button'
import { Card, CardBody } from '../../components/ui/Card'
import { Pagination } from '../../components/ui/Pagination'
import { Alert } from '../../components/ui/Alert'
import { formatDateTime } from '../../lib/format'
import { EventFormModal, type EventFormValues } from './EventFormModal'

/**
 * Skip empty strings when building the multipart body.
 *
 * Laravel's `nullable` rule only short-circuits on a real null, so sending an
 * empty string for an optional integer or date field would fail validation —
 * a problem the previous JSON payload avoided by dropping undefined keys.
 */
function appendIfSet(form: FormData, key: string, value: string): void {
  if (value !== '') form.append(key, value)
}

export function AdminEventsPage() {
  const [pageData, setPageData] = useState<Paginated<Event> | null>(null)
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Event | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async (targetPage: number) => {
    setLoading(true)
    setError(null)
    try {
      const [data, types] = await Promise.all([
        api.get<Paginated<Event>>(`/api/events?per_page=10&page=${targetPage}`),
        api.get<EventType[]>('/api/event-types'),
      ])
      setPageData(data)
      setEventTypes(types)
      setPage(targetPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(1)
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (event: Event) => {
    setEditing(event)
    setFormError(null)
    setModalOpen(true)
  }

  const handleSubmit = async (values: EventFormValues) => {
    setSubmitting(true)
    setFormError(null)
    try {
      const form = new FormData()
      // Laravel needs POST for multipart — PHP never populates $_FILES on PUT —
      // so updates are spoofed with a _method field in the body.
      if (editing) form.append('_method', 'PUT')

      form.append('title', values.title)
      appendIfSet(form, 'description', values.description)
      appendIfSet(form, 'venue', values.venue)
      appendIfSet(form, 'event_type_id', values.event_type_id)
      form.append('starts_at', values.starts_at)
      appendIfSet(form, 'ends_at', values.ends_at)
      appendIfSet(form, 'total_tickets', values.total_tickets)
      form.append('status', values.status)

      if (values.coverFile) form.append('cover_image', values.coverFile)
      else if (editing && values.removeCover) form.append('remove_cover', '1')

      await api.post(editing ? `/api/events/${editing.id}` : '/api/events', form)
      setModalOpen(false)
      void load(page)
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.errors ? formatApiErrors(err.errors).join(' · ') : err.message)
      } else {
        setFormError('Failed to save the event.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (event: Event) => {
    if (!window.confirm(`Delete "${event.title}"? This cannot be undone.`)) return
    try {
      await api.delete(`/api/events/${event.id}`)
      void load(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the event.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Admin · Events</h1>
          <p className="mt-1 text-muted">Create, edit and remove events.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/admin/ticket-types">
            <Button variant="secondary">Ticket types</Button>
          </Link>
          <Button onClick={openCreate}>New event</Button>
        </div>
      </div>

      {error && (
        <Alert tone="error" title="Failed to load events">
          {error}
        </Alert>
      )}

      {loading && !pageData && (
        <div className="flex justify-center py-16 text-accent">
          <Spinner className="size-8" />
        </div>
      )}

      {pageData && (
        <div className="space-y-3">
          {pageData.data.map((event) => (
            <Card key={event.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted/70">#{event.id}</span>
                    <Badge tone={statusTone(event.status)}>{event.status}</Badge>
                  </div>
                  <p className="mt-1 truncate font-semibold text-white">{event.title}</p>
                  <p className="text-sm text-muted">
                    {event.venue ?? 'Venue TBA'} · {formatDateTime(event.starts_at)}
                  </p>
                  <p className="text-xs text-muted/70">
                    {event.total_tickets} total tickets
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link to={`/events/${event.id}`}>
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </Link>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(event)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(event)}>
                    Delete
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {pageData && <Pagination page={pageData} onPageChange={(p) => void load(p)} />}

      {pageData && pageData.data.length === 0 && !loading && (
        <Alert tone="info" title="No events yet">
          Create your first event to start selling tickets.
        </Alert>
      )}

      <EventFormModal
        // The modal seeds its state once, so it needs a fresh instance per
        // event; without this, editing shows the previous event's values.
        key={editing ? `event-${editing.id}` : 'event-new'}
        open={modalOpen}
        event={editing}
        eventTypes={eventTypes}
        submitting={submitting}
        error={formError}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
