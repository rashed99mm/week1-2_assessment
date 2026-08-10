import { cn } from '../../lib/cn'

const items = [
  {
    key: 'available',
    label: 'Available',
    swatch: 'border border-muted bg-transparent',
  },
  {
    key: 'selected',
    label: 'Selected',
    swatch: 'border border-accent bg-accent',
  },
  {
    key: 'reserved',
    label: 'Reserved',
    swatch: 'border border-panel bg-panel',
  },
  {
    key: 'vip',
    label: 'VIP',
    swatch: 'border border-white bg-white',
  },
  {
    key: 'accessible',
    label: 'Accessible',
    swatch: 'relative border border-surface bg-transparent',
  },
]

export function SeatLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-2 gap-y-2', className)}>
      {items.map((item) => (
        <li
          key={item.key}
          className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted"
        >
          <span className={cn('relative inline-block size-3 rounded-[4px]', item.swatch)}>
            {item.key === 'accessible' && (
              <span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface" />
            )}
          </span>
          {item.label}
        </li>
      ))}
    </ul>
  )
}
