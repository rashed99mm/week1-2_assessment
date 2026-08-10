import { useState } from 'react'
import type { TicketType } from '../../types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'

interface TicketTypeFormValues {
  event_id: string
  name: string
  price: string
  quantity: string
}

interface TicketTypeFormModalProps {
  open: boolean
  ticketType: TicketType | null
  events: Array<{ id: number; title: string }>
  submitting: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: TicketTypeFormValues) => void
}

export function TicketTypeFormModal({
  open,
  ticketType,
  events,
  submitting,
  error,
  onClose,
  onSubmit,
}: TicketTypeFormModalProps) {
  const [values, setValues] = useState<TicketTypeFormValues>(() => ({
    event_id: ticketType ? String(ticketType.event_id) : events[0] ? String(events[0].id) : '',
    name: ticketType?.name ?? '',
    price: ticketType ? String(ticketType.price) : '',
    quantity: ticketType ? String(ticketType.quantity) : '',
  }))

  if (!open) return null

  const set = (field: keyof TicketTypeFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(values)
  }

  return (
    <Modal
      open={open}
      title={ticketType ? `Edit ticket type #${ticketType.id}` : 'New ticket type'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="ticket-type-form" loading={submitting}>
            {ticketType ? 'Save changes' : 'Create ticket type'}
          </Button>
        </>
      }
    >
      <form id="ticket-type-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert tone="error" className="mb-2">
            {error}
          </Alert>
        )}
        <Select
          label="Event"
          value={values.event_id}
          onChange={(e) => set('event_id')(e.target.value)}
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </Select>
        <Input
          label="Name"
          required
          placeholder="e.g. VIP"
          value={values.name}
          onChange={(e) => set('name')(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Price (USD)"
            type="number"
            min={0}
            step="0.01"
            required
            placeholder="50.00"
            value={values.price}
            onChange={(e) => set('price')(e.target.value)}
          />
          <Input
            label="Quantity"
            type="number"
            min={1}
            required
            placeholder="100"
            value={values.quantity}
            onChange={(e) => set('quantity')(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  )
}
