import type { Seat as VenueSeat, StageMode } from '../../lib/venueLayout'
import type { SeatDirection } from '../../lib/seatNavigation'
import { metersFromStage, sightlineGrade } from '../../lib/venueGeometry'
import { formatCurrency } from '../../lib/format'
import { Button } from '../ui/Button'
import { PillTag } from '../ui/Pill'
import { cn } from '../../lib/cn'

interface SeatPreviewHUDProps {
  seat: VenueSeat
  mode: StageMode
  sectionName: string
  price: number
  isSelected: boolean
  onToggle: (seat: VenueSeat) => void
  onMove: (direction: SeatDirection) => void
  onExit: () => void
}

const GRADE_TONE: Record<'Great' | 'Good' | 'Fair', string> = {
  Great: 'border-accent/60 text-white',
  Good: 'border-line text-white',
  Fair: 'border-line text-muted',
}

/**
 * Details of the seat the viewer is currently sitting in, plus the controls for
 * moving to a neighbouring one. Kept out of the canvas so the text stays crisp
 * and takes part in the normal focus order.
 */
export function SeatPreviewHUD({
  seat,
  mode,
  sectionName,
  price,
  isSelected,
  onToggle,
  onMove,
  onExit,
}: SeatPreviewHUDProps) {
  const grade = sightlineGrade(seat, mode)

  // Focus deliberately stays on the canvas, which owns the arrow keys that move
  // between seats; the canvas carries its own label and live region.
  return (
    <div
      role="dialog"
      aria-label={`View from seat ${seat.label}`}
      className="absolute bottom-4 left-4 w-64 rounded-2xl border border-line bg-ink/85 p-4 backdrop-blur-md focus:outline-none"
    >
      <p className="text-xs uppercase tracking-wider text-muted">Sitting in</p>
      <p className="mt-0.5 text-lg font-semibold text-white">{seat.label}</p>
      {sectionName && <p className="text-sm text-muted">{sectionName}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <PillTag className={GRADE_TONE[grade]}>{grade} view</PillTag>
        <PillTag>≈ {metersFromStage(seat, mode)} m from stage</PillTag>
        {seat.tier && <PillTag>{seat.tier}</PillTag>}
      </div>

      <MovePad onMove={onMove} />

      <p className="mt-3 text-sm text-muted">
        <span className="text-base font-semibold text-white">{formatCurrency(price)}</span> per ticket
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Button
          className="flex-1"
          variant={isSelected ? 'secondary' : 'primary'}
          onClick={() => onToggle(seat)}
        >
          {isSelected ? 'Remove seat' : 'Book this seat'}
        </Button>
        <Button variant="secondary" onClick={onExit}>
          Exit
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        Drag to look · arrows to change seat · Esc to exit
      </p>
    </div>
  )
}

/** A four-way pad for stepping between neighbouring seats. */
function MovePad({ onMove }: { onMove: (direction: SeatDirection) => void }) {
  const cell =
    'flex size-8 items-center justify-center rounded-lg border border-line text-muted ' +
    'transition-colors duration-200 hover:border-white/35 hover:text-white ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

  return (
    <div className="mt-4 flex items-center gap-3">
      <div className="grid grid-cols-3 grid-rows-2 gap-1">
        <span />
        <button type="button" aria-label="Move a row toward the stage" className={cell} onClick={() => onMove('up')}>
          <Chevron className="rotate-180" />
        </button>
        <span />
        <button type="button" aria-label="Move one seat left" className={cn(cell)} onClick={() => onMove('left')}>
          <Chevron className="rotate-90" />
        </button>
        <button type="button" aria-label="Move a row back" className={cell} onClick={() => onMove('down')}>
          <Chevron />
        </button>
        <button type="button" aria-label="Move one seat right" className={cn(cell)} onClick={() => onMove('right')}>
          <Chevron className="-rotate-90" />
        </button>
      </div>
      <p className="text-xs leading-snug text-muted">
        Move seat to
        <br />
        compare the view
      </p>
    </div>
  )
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('size-3.5', className)}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
