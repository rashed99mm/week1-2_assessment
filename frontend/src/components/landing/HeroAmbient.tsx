import { useEffect, useRef } from 'react'
import { createHeroScene } from '../../lib/heroScene'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { cn } from '../../lib/cn'

/**
 * Live ambient backdrop for the landing hero. Purely decorative, so it is
 * hidden from assistive tech and never accepts pointer events.
 *
 * The loop is suspended whenever the tab is hidden or the hero scrolls out of
 * view, and never starts at all when the user prefers reduced motion.
 */
export function HeroAmbient({
  className,
  transparent = false,
}: {
  className?: string
  /** Composite over a photograph behind the canvas rather than over flat ink. */
  transparent?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scene = createHeroScene(canvas, { reduced, transparent })
    let visible = true
    let onScreen = true

    const sync = () => {
      if (visible && onScreen) scene.start()
      else scene.stop()
    }

    const onVisibility = () => {
      visible = !document.hidden
      sync()
    }

    const resizeObserver = new ResizeObserver(() => scene.resize())
    resizeObserver.observe(canvas)

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        sync()
      },
      { threshold: 0 },
    )
    intersectionObserver.observe(canvas)

    document.addEventListener('visibilitychange', onVisibility)
    sync()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      scene.destroy()
    }
  }, [reduced, transparent])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    />
  )
}
