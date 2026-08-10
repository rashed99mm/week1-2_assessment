import type { Seat } from './venueLayout'

export type SeatDirection = 'up' | 'down' | 'left' | 'right'

/**
 * Find the nearest seat in a direction from the given seat.
 *
 * Candidates must lie on the correct side of the origin along the direction's
 * primary axis. The score weights drift across the axis far more heavily than
 * distance along it, so pressing "right" walks along a row rather than jumping
 * diagonally to a nearer seat in the row behind.
 */
export function nextSeatInDirection(
  seats: Seat[],
  fromId: string,
  dir: SeatDirection,
  skip: (seat: Seat) => boolean = () => false,
): Seat | null {
  const origin = seats.find((s) => s.id === fromId)
  if (!origin) return null

  const horizontal = dir === 'left' || dir === 'right'
  const sign = dir === 'right' || dir === 'down' ? 1 : -1

  let best: Seat | null = null
  let bestScore = Infinity

  for (const seat of seats) {
    if (seat.id === fromId || skip(seat)) continue

    // In the 2D map, +y runs away from the stage at the bottom of the SVG, so
    // "up" (toward the stage) is a decrease in y — the same sign convention the
    // horizontal axis uses for x.
    const along = horizontal ? seat.x - origin.x : seat.y - origin.y
    const across = horizontal ? seat.y - origin.y : seat.x - origin.x

    if (along * sign <= 1e-6) continue

    const score = Math.abs(along) + Math.abs(across) * 6
    if (score < bestScore) {
      bestScore = score
      best = seat
    }
  }

  return best
}

/** First selectable seat in the plan, used to seed the roving tab stop. */
export function firstSelectableSeat(
  seats: Seat[],
  skip: (seat: Seat) => boolean = () => false,
): Seat | null {
  return seats.find((seat) => !skip(seat)) ?? null
}

/** Last selectable seat in the plan, for the End key. */
export function lastSelectableSeat(
  seats: Seat[],
  skip: (seat: Seat) => boolean = () => false,
): Seat | null {
  for (let i = seats.length - 1; i >= 0; i--) {
    if (!skip(seats[i])) return seats[i]
  }
  return null
}
