import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  size?: 'sm' | 'md'
}

const SIZES = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-sm',
} as const

const BASE =
  'inline-flex items-center gap-1.5 rounded-full border font-medium ' +
  'transition-[color,border-color,background-color] duration-200 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/**
 * The thin outlined filter chip used for event types, seat tiers and the map
 * legend. An active chip is outlined with a faint accent tint rather than a
 * solid fill, which keeps solid crimson reserved for primary CTAs and selected
 * seats — the scarcity is what makes the accent read as meaningful.
 */
export function Pill({ active = false, size = 'md', className, ...props }: PillProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        BASE,
        SIZES[size],
        active
          ? 'border-accent/70 bg-accent/12 text-white'
          : 'border-line text-muted hover:border-white/35 hover:text-white',
        className,
      )}
      {...props}
    />
  )
}

/** Non-interactive variant for labels and legends. */
export function PillTag({
  className,
  size = 'sm',
  ...props
}: { size?: 'sm' | 'md' } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line font-medium text-muted',
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
