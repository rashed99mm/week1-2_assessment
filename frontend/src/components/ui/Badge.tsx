import { cn } from '../../lib/cn'
import type { HTMLAttributes } from 'react'

type Tone = 'green' | 'amber' | 'rose' | 'accent' | 'muted'

const toneClasses: Record<Tone, string> = {
  green: 'text-emerald-300/90 ring-emerald-400/30',
  amber: 'text-amber-300/90 ring-amber-400/30',
  rose: 'text-accent-soft ring-accent/40',
  accent: 'bg-accent/10 text-accent ring-accent/50',
  muted: 'text-muted ring-muted/40',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

export function Badge({ tone = 'muted', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  )
}

export function statusTone(status: string): Tone {
  switch (status) {
    case 'paid':
    case 'success':
    case 'published':
    case 'available':
      return 'green'
    case 'pending':
      return 'amber'
    case 'failed':
    case 'cancelled':
    case 'draft':
      return 'rose'
    case 'selected':
      return 'accent'
    default:
      return 'muted'
  }
}
