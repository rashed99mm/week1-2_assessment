import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, formatApiErrors } from '../../lib/api'
import type { Event, Paginated, TicketType } from '../../types'
import { Badge } from '../../components/ui/Badge'
import { Button, Spinner } from '../../components/ui/Button'
import { Card, CardBody } from '../../components/ui/Card'
import { Alert } from '../../components/ui/Alert'
import { Select } from '../../components/ui/Input'
import { formatCurrency } from '../../lib/format'
import { TicketTypeFormModal } from './TicketTypeFormModal'

export function AdminTicketTypesPage() {
  const [ticketTypes, setTicketTypes] = useState<TicketType[] | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [eventFilter, setEventFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<TicketType | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async (filter: string) => {
    setLoading(true)
    setError(null)
    try {
      const query = filter ? `?event_id=${filter}` : ''
      const [types, eventsData] = await Promise.all([
        api.get<TicketType[]>(`/api/ticket-types${query}`),
        api.get<Paginated<Event>>('/api/events?per_page=100').then((paginated) => paginated.data),
      ])
      setTicketTypes(types)
      setEvents(eventsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket types.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load('')
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (ticketType: TicketType) => {
    setEditing(ticketType)
    setFormError(null)
    setModalOpen(true)
  }

  const handleSubmit = async (values: {
    event_id: string
    name: string
    price: string
    quantity: string
  }) => {
    setSubmitting(true)
    setFormError(null)
    try {
      const payload = {
        event_id: Number(values.event_id),
        name: values.name,
        price: Number(values.price),
        quantity: Number(values.quantity),
      }
      if (editing) {
        await api.put(`/api/ticket-types/${editing.id}`, payload)
      } else {
        await api.post('/api/ticket-types', payload)
      }
      setModalOpen(false)
      void load(eventFilter)
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.errors ? formatApiErrors(err.errors).join(' · ') : err.message)
      } else {
        setFormError('Failed to save the ticket type.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (ticketType: TicketType) => {
    if (!window.confirm(`Delete ticket type "${ticketType.name}"?`)) return
    try {
      await api.delete(`/api/ticket-types/${ticketType.id}`)
      void load(eventFilter)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to delete the ticket type.')
      }
    }
  }

  const eventTitle = (eventId: number) =>
    events.find((event) => event.id === eventId)?.title ?? `Event #${eventId}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Admin · Ticket types</h1>
          <p className="mt-1 text-muted">Define pricing and seat counts per event.</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-56">
            <Select
              label="Filter by event"
              value={eventFilter}
              onChange={(e) => {
                const value = e.target.value
                setEventFilter(value)
                void load(value)
              }}
            >
              <option value="">All events</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </Select>
          </div>
          <Link to="/admin/events">
            <Button variant="ghost">← Events</Button>
          </Link>
          <Button onClick={openCreate}>New ticket type</Button>
        </div>
      </div>

      {error && (
        <Alert tone="error" title="Error">
          {error}
        </Alert>
      )}

      {loading && !ticketTypes && (
        <div className="flex justify-center py-16 text-accent">
          <Spinner className="size-8" />
        </div>
      )}

      {ticketTypes && (
        <div className="space-y-3">
          {ticketTypes.map((ticketType) => (
            <Card key={ticketType.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted/70">#{ticketType.id}</span>
                    <Badge tone="muted">{eventTitle(ticketType.event_id)}</Badge>
                  </div>
                  <p className="mt-1 truncate font-semibold text-white">{ticketType.name}</p>
                  <p className="text-sm text-muted">
                    {formatCurrency(ticketType.price)} · {ticketType.quantity} seats
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(ticketType)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(ticketType)}>
                    Delete
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
          {ticketTypes.length === 0 && !loading && (
            <Alert tone="info" title="No ticket types">
              Create a ticket type to start selling seats.
            </Alert>
          )}
        </div>
      )}

      <TicketTypeFormModal
        open={modalOpen}
        ticketType={editing}
        events={events}
        submitting={submitting}
        error={formError}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
