import type { Paginated } from '../../types'
import { cn } from '../../lib/cn'

interface PaginationProps<T> {
  page: Paginated<T>
  onPageChange: (page: number) => void
}

export function Pagination<T>({ page, onPageChange }: PaginationProps<T>) {
  if (page.last_page <= 1) return null

  const pages: number[] = []
  const current = page.current_page
  const last = page.last_page
  const start = Math.max(1, current - 2)
  const end = Math.min(last, current + 2)
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
      <PageButton
        disabled={!page.prev_page_url}
        onClick={() => onPageChange(current - 1)}
        label="Previous"
      />
      {start > 1 && (
        <>
          <PageButton active={current === 1} onClick={() => onPageChange(1)} label="1" />
          {start > 2 && <Ellipsis />}
        </>
      )}
      {pages.map((p) => (
        <PageButton key={p} active={current === p} onClick={() => onPageChange(p)} label={String(p)} />
      ))}
      {end < last && (
        <>
          {end < last - 1 && <Ellipsis />}
          <PageButton active={current === last} onClick={() => onPageChange(last)} label={String(last)} />
        </>
      )}
      <PageButton
        disabled={!page.next_page_url}
        onClick={() => onPageChange(current + 1)}
        label="Next"
      />
    </nav>
  )
}

function PageButton({
  active,
  disabled,
  onClick,
  label,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-w-9 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-white'
          : 'bg-transparent text-muted ring-1 ring-inset ring-muted/40 hover:bg-white/5 hover:text-white',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {label}
    </button>
  )
}

function Ellipsis() {
  return <span className="px-1 text-muted/60">…</span>
}
