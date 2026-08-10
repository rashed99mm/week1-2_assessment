import { useId } from 'react'
import { cn } from '../../lib/cn'

/**
 * The tic-ets mark: a ticket stub leaning into its own speed lines.
 *
 * The notch on the leading edge is the hyphen in the wordmark — the ticket is
 * literally torn in two, which is where the name comes from.
 */
export function LogoMark({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const gradientId = `logo-${uid}`

  return (
    <svg
      viewBox="0 0 40 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn('size-8', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-accent-soft)" />
          <stop offset="100%" stopColor="var(--color-accent)" />
        </linearGradient>
      </defs>

      {/* Speed lines trailing behind the stub. */}
      <g stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" opacity="0.55">
        <path d="M2 9h7" />
        <path d="M0 16h6" />
        <path d="M3 23h7" />
      </g>

      {/* The stub, sheared forward so it reads as moving. */}
      <g transform="skewX(-9) translate(3 0)">
        <path
          d="M14 4h20a3 3 0 0 1 3 3v3.2a3.4 3.4 0 0 0 0 6.8V25a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3v-3.2a3.4 3.4 0 0 0 0-6.8V7a3 3 0 0 1 3-3Z"
          fill={`url(#${gradientId})`}
        />
        {/* Perforation down the tear line. */}
        <path
          d="M24 8v3M24 14v3M24 20v3"
          stroke="var(--color-ink)"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.75"
        />
      </g>
    </svg>
  )
}

/** Full lockup: mark plus wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight text-white">
        tic<span className="text-accent">-</span>ets
      </span>
    </span>
  )
}
