import { useSavedEvents } from '../../lib/savedEvents'
import { cn } from '../../lib/cn'

interface SaveButtonProps {
  eventId: number
  className?: string
}

export function SaveButton({ eventId, className }: SaveButtonProps) {
  const { isSaved, toggleSaved } = useSavedEvents()
  const saved = isSaved(eventId)

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved' : 'Save event'}
      title={saved ? 'Saved' : 'Save'}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleSaved(eventId)
      }}
      className={cn(
        'flex size-9 items-center justify-center rounded-full border bg-black/45 backdrop-blur-sm transition-all',
        saved
          ? 'border-accent/70 text-accent'
          : 'border-white/15 text-white hover:border-white/40 hover:bg-black/60',
        className,
      )}
    >
      <svg
        viewBox="0 0 20 20"
        fill={saved ? 'currentColor' : 'none'}
        className="size-4"
        aria-hidden
      >
        <path
          d="M10 17.5 8.7 16.3C4.4 12.4 1.5 9.8 1.5 6.6 1.5 4 3.5 2 6.1 2c1.5 0 2.9.7 3.9 1.8A5.2 5.2 0 0 1 13.9 2c2.6 0 4.6 2 4.6 4.6 0 3.2-2.9 5.8-7.2 9.7L10 17.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    </button>
  )
}
