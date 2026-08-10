import { useState } from 'react'
import type { Event, EventType } from '../../types'
import { fromLocalInputValue, toLocalInputValue } from '../../lib/format'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Input'
import { ImageDropzone } from '../../components/ui/ImageDropzone'
import { Modal } from '../../components/ui/Modal'

export interface EventFormValues {
  title: string
  description: string
  venue: string
  event_type_id: string
  starts_at: string
  ends_at: string
  total_tickets: string
  status: string
  /** A newly picked cover, or null to leave the stored one alone. */
  coverFile: File | null
  /** True when the admin asked to clear the existing cover. */
  removeCover: boolean
}

interface EventFormModalProps {
  open: boolean
  event: Event | null
  eventTypes: EventType[]
  submitting: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: EventFormValues) => void
}

export function EventFormModal({
  open,
  event,
  eventTypes,
  submitting,
  error,
  onClose,
  onSubmit,
}: EventFormModalProps) {
  const [values, setValues] = useState<EventFormValues>(() => ({
    title: event?.title ?? '',
    description: event?.description ?? '',
    venue: event?.venue ?? '',
    event_type_id: event?.event_type_id ? String(event.event_type_id) : '',
    starts_at: toLocalInputValue(event?.starts_at),
    ends_at: toLocalInputValue(event?.ends_at),
    total_tickets: event ? String(event.total_tickets) : '',
    status: event?.status ?? 'draft',
    coverFile: null,
    removeCover: false,
  }))

  if (!open) return null

  const set = (field: keyof EventFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      ...values,
      starts_at: fromLocalInputValue(values.starts_at),
      ends_at: values.ends_at ? fromLocalInputValue(values.ends_at) : '',
    })
  }

  return (
    <Modal
      open={open}
      title={event ? `Edit event #${event.id}` : 'New event'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="event-form" loading={submitting}>
            {event ? 'Save changes' : 'Create event'}
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert tone="error" className="mb-2">
            {error}
          </Alert>
        )}
        <Input label="Title" required value={values.title} onChange={(e) => set('title')(e.target.value)} />
        <Textarea
          label="Description"
          value={values.description}
          onChange={(e) => set('description')(e.target.value)}
        />
        <Input label="Venue" value={values.venue} onChange={(e) => set('venue')(e.target.value)} />
        <ImageDropzone
          currentUrl={event?.cover_image_url ?? null}
          file={values.coverFile}
          removed={values.removeCover}
          onSelect={(file) =>
            setValues((current) => ({ ...current, coverFile: file, removeCover: false }))
          }
          onRemove={() =>
            setValues((current) => ({ ...current, coverFile: null, removeCover: true }))
          }
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Starts at"
            type="datetime-local"
            required
            value={values.starts_at}
            onChange={(e) => set('starts_at')(e.target.value)}
          />
          <Input
            label="Ends at"
            type="datetime-local"
            value={values.ends_at}
            onChange={(e) => set('ends_at')(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Total tickets"
            type="number"
            min={0}
            placeholder="e.g. 500"
            value={values.total_tickets}
            onChange={(e) => set('total_tickets')(e.target.value)}
          />
          <Select
            label="Event type"
            value={values.event_type_id}
            onChange={(e) => set('event_type_id')(e.target.value)}
          >
            <option value="">None</option>
            {eventTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
          <Select
            label="Status"
            value={values.status}
            onChange={(e) => set('status')(e.target.value)}
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="cancelled">cancelled</option>
          </Select>
        </div>
      </form>
    </Modal>
  )
}
