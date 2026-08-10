import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'eventflow.saved'

function readSaved(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((n): n is number => typeof n === 'number')
  } catch {
    return []
  }
}

export function useSavedEvents() {
  const [saved, setSaved] = useState<number[]>(readSaved)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      // ignore storage write errors (private mode, etc.)
    }
  }, [saved])

  const toggleSaved = useCallback((eventId: number) => {
    setSaved((current) =>
      current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId],
    )
  }, [])

  const isSaved = useCallback(
    (eventId: number) => saved.includes(eventId),
    [saved],
  )

  return { saved, toggleSaved, isSaved }
}
