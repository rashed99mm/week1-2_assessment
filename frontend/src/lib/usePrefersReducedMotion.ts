import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function currentPreference(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(QUERY).matches
}

/**
 * Track the user's reduced-motion preference.
 *
 * The CSS media query only reaches CSS transitions, so anything driven by
 * JavaScript — the WebGL camera flights and the hero canvas loop — has to read
 * the preference through this hook instead.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(currentPreference)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    media.addEventListener('change', onChange)
    setReduced(media.matches)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return reduced
}
