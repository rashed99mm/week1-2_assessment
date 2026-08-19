/**
 * Conversions between an <input type="datetime-local"> value and ISO 8601.
 *
 * Ported verbatim from the React portal's `src/lib/format.ts`, because the
 * backend's expectations have not changed and reimplementing the conversion
 * is how the two front-ends start disagreeing about what "8pm" means.
 */

/** ISO (UTC) to the local wall-clock string the input expects. */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ''

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  // Shift by the offset so toISOString yields local wall-clock time, which is
  // what the control displays and what the user typed.
  const offsetMs = date.getTimezoneOffset() * 60_000

  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

/** The input's local wall-clock string back to ISO (UTC). */
export function fromLocalInputValue(value: string | null | undefined): string | null {
  if (!value) return null

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
