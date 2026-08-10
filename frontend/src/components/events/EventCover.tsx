import { useState } from 'react'
import type { Event } from '../../types'
import { EventPoster } from './EventPoster'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { cn } from '../../lib/cn'

interface EventCoverProps {
  event: Event
  /** Set for above-the-fold covers so they load eagerly at high priority. */
  priority?: boolean
  className?: string
}

/**
 * An event's cover image, with the procedural poster acting as both the
 * placeholder underneath and the fallback when no cover exists.
 *
 * That layering means there is no separate skeleton asset to maintain, and an
 * absent, null or 404 cover degrades to something deliberate rather than an
 * empty grey box.
 */
export function EventCover({ event, priority = false, className }: EventCoverProps) {
  const src = event.cover_image_url?.trim() || null
  const [state, setState] = useState<'idle' | 'loaded' | 'error'>('idle')
  const reduced = usePrefersReducedMotion()

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-panel', className)}>
      <EventPoster event={event} />

      {src && state === 'idle' && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 animate-[shimmer_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/6 to-transparent" />
        </div>
      )}

      {src && state !== 'error' && (
        <img
          src={src}
          // Decorative: the card and detail hero already render the title.
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className={cn(
            'absolute inset-0 h-full w-full object-cover',
            !reduced && 'transition-[opacity,filter,transform] duration-500 ease-out',
            state === 'loaded'
              ? 'scale-100 opacity-100 blur-0'
              : 'scale-105 opacity-0 blur-[10px]',
          )}
        />
      )}
    </div>
  )
}
