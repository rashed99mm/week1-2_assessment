/**
 * Append a value to FormData only when it has one.
 *
 * Ported from `appendIfSet` in the React portal's AdminEventsPage.
 *
 * Laravel's `nullable` rule short-circuits on a real null but not on an empty
 * string, so sending `venue=""` runs the remaining rules against "" and can
 * fail validation for a field the user simply left blank. Omitting the key
 * entirely is what "not provided" has to look like over multipart.
 */
export function appendIfSet(
  form: FormData,
  key: string,
  value: string | number | null | undefined,
): void {
  if (value === null || value === undefined || value === '') return

  form.append(key, String(value))
}

/**
 * Build the body for an event update.
 *
 * POST with a spoofed `_method`, not a real PUT: PHP does not populate
 * `$_FILES` for PUT requests, so a genuine PUT would silently drop the cover
 * image while appearing to succeed.
 */
export function withMethodOverride(form: FormData, method: 'PUT' | 'PATCH' | 'DELETE'): FormData {
  form.append('_method', method)
  return form
}
