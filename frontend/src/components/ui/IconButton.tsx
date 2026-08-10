import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — these buttons are icon-only, so they have no accessible name otherwise. */
  'aria-label': string
}

/**
 * Round, thin-outlined control used for the floating map and venue controls.
 */
export function IconButton({ className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex size-9 items-center justify-center rounded-full border border-line bg-ink/70',
        'text-muted backdrop-blur-sm transition-colors duration-200',
        'hover:border-white/30 hover:text-white',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...props}
    />
  )
}
