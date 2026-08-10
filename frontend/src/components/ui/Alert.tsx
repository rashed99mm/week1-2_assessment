import { cn } from '../../lib/cn'

type Tone = 'info' | 'success' | 'error'

const toneClasses: Record<Tone, string> = {
  info: 'border-muted/30 bg-panel text-slate-200',
  success: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200',
  error: 'border-accent/50 bg-accent/10 text-accent-soft',
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone
  title?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        toneClasses[tone],
        className,
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className="mt-1">{children}</div>}
    </div>
  )
}
