import { useId } from 'react'
import type { Event } from '../../types'
import { tokens } from '../../lib/tokens'
import { cn } from '../../lib/cn'

function hashString(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

const BGS = [
  ['#2a1f1f', tokens.page],
  ['#1f262a', tokens.page],
  ['#262019', tokens.page],
  ['#1f2026', tokens.page],
  ['#241f28', tokens.page],
  ['#16251f', tokens.page],
]

interface PosterProps {
  event: Event
  className?: string
}

export function EventPoster({ event, className }: PosterProps) {
  const seed = hashString(`${event.id}-${event.title}-${event.event_type_id ?? 0}`)
  const bg = BGS[seed % BGS.length]
  const accent = seed % 3 === 0 ? tokens.accentSoft : tokens.muted
  const slug = event.event_type?.slug ?? 'default'

  // Gradient ids are document-global, so seeding them from the event id would
  // collide whenever the same event renders twice (a card and the detail hero).
  // React's useId emits «r0»-style delimiters, which are invalid in url(#…).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const bgId = `bg-${uid}`
  const glowId = `glow-${uid}`

  return (
    <svg
      viewBox="0 0 640 400"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={event.title}
      className={cn('block h-full w-full', className)}
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={bg[0]} />
          <stop offset="100%" stopColor={bg[1]} />
        </linearGradient>
        <radialGradient id={glowId} cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="640" height="400" fill={`url(#${bgId})`} />
      <rect width="640" height="400" fill={`url(#${glowId})`} />

      <Art slug={slug} accent={accent} seed={seed} />

      <rect x="36" y="338" width="3" height="26" rx="1.5" fill={accent} />
      <text
        x="50"
        y="357"
        fill="#ffffff"
        fontSize="20"
        fontWeight="600"
        fontFamily="Inter, system-ui, sans-serif"
      >
        {truncate(event.title, 34)}
      </text>
    </svg>
  )
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function Art({ slug, accent, seed }: { slug: string; accent: string; seed: number }) {
  switch (slug) {
    case 'concert':
      return <ConcertArt accent={accent} />
    case 'conference':
      return <ConferenceArt accent={accent} />
    case 'sports':
      return <ArenaArt accent={accent} />
    case 'festival':
      return <FestivalArt accent={accent} />
    case 'theater':
      return <TheaterArt accent={accent} />
    case 'workshop':
      return <WorkshopArt accent={accent} seed={seed} />
    case 'webinar':
      return <OnlineArt accent={accent} />
    case 'meetup':
      return <MeetupArt accent={accent} seed={seed} />
    default:
      return <DefaultArt accent={accent} />
  }
}

function ConcertArt({ accent }: { accent: string }) {
  const beams = [0, 1, 2, 3, 4]
  return (
    <g>
      <rect x="0" y="300" width="640" height="12" fill="#161616" opacity="0.9" />
      {beams.map((i) => {
        const x = 120 + i * 100
        return (
          <polygon
            key={i}
            points={`${x},80 ${x + 36},80 ${x - 60},300 ${x - 150},300`}
            fill="#ffffff"
            opacity={0.05 + i * 0.02}
          />
        )
      })}
      <line x1="120" y1="80" x2="120" y2="300" stroke={accent} strokeWidth="3" opacity="0.8" />
      <circle cx="120" cy="74" r="6" fill={accent} opacity="0.9" />
    </g>
  )
}

function ConferenceArt({ accent }: { accent: string }) {
  return (
    <g>
      <rect x="180" y="250" width="280" height="10" fill="#ffffff" opacity="0.18" />
      <rect x="150" y="150" width="60" height="40" rx="4" fill="#161616" stroke="#ffffff" strokeOpacity="0.25" />
      <rect x="150" y="196" width="60" height="40" rx="4" fill="#161616" stroke="#ffffff" strokeOpacity="0.25" />
      <rect x="440" y="150" width="60" height="40" rx="4" fill="#161616" stroke="#ffffff" strokeOpacity="0.25" />
      <rect x="440" y="196" width="60" height="40" rx="4" fill="#161616" stroke="#ffffff" strokeOpacity="0.25" />
      <rect x="300" y="236" width="120" height="14" rx="7" fill={accent} opacity="0.85" />
      <circle cx="330" cy="243" r="3" fill="#ffffff" opacity="0.6" />
    </g>
  )
}

function ArenaArt({ accent }: { accent: string }) {
  const rings = [60, 90, 120, 150, 180]
  return (
    <g transform="translate(320,180)">
      {rings.map((r) => (
        <ellipse key={r} rx={r} ry={r * 0.55} fill="none" stroke="#ffffff" strokeOpacity={0.08 + (rings.length - rings.indexOf(r)) * 0.03} strokeWidth="2" />
      ))}
      <ellipse rx={34} ry={20} fill="#161616" stroke={accent} strokeWidth="3" opacity="0.95" />
      {rings.slice(0, 3).map((r) => (
        <line key={r} x1={-r} y1="0" x2={r} y2="0" stroke="#ffffff" strokeOpacity="0.05" />
      ))}
    </g>
  )
}

function FestivalArt({ accent }: { accent: string }) {
  const flags = [0, 1, 2, 3, 4]
  return (
    <g>
      <line x1="0" y1="330" x2="640" y2="330" stroke="#ffffff" strokeOpacity="0.15" strokeWidth="2" />
      {flags.map((i) => {
        const x = 120 + i * 100
        return (
          <g key={i}>
            <line x1={x} y1="120" x2={x} y2="330" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="2" />
            <polygon points={`${x},120 ${x + 44},132 ${x},144`} fill={i % 2 === 0 ? accent : '#a5a5a5'} opacity={0.9} />
          </g>
        )
      })}
      <circle cx="540" cy="90" r="34" fill={accent} opacity="0.5" />
      <circle cx="540" cy="90" r="18" fill="#161616" />
    </g>
  )
}

function TheaterArt({ accent }: { accent: string }) {
  return (
    <g>
      <path d="M90,90 L550,90 L550,300 L90,300 Z" fill="#161616" opacity="0.9" stroke="#ffffff" strokeOpacity="0.2" />
      <path d="M110,110 L530,110 L530,240 L110,240 Z" fill="#0f0f0f" />
      <path d="M170,240 L310,120 L450,240 Z" fill={accent} opacity="0.55" />
      <rect x="120" y="300" width="400" height="10" fill="#ffffff" opacity="0.15" />
    </g>
  )
}

function WorkshopArt({ accent, seed }: { accent: string; seed: number }) {
  const blocks = [0, 1, 2, 3, 4, 5]
  return (
    <g>
      {blocks.map((i) => {
        const col = i % 3
        const row = Math.floor(i / 3)
        const x = 120 + col * 140
        const y = 120 + row * 110
        const w = 100 + (seed % 2) * 20
        const h = 70 + (seed % 3) * 12
        return (
          <rect key={i} x={x} y={y} width={w} height={h} rx="8" fill="#161616" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="2" />
        )
      })}
      <rect x="120" y="314" width="400" height="10" rx="5" fill={accent} opacity="0.7" />
    </g>
  )
}

function OnlineArt({ accent }: { accent: string }) {
  return (
    <g transform="translate(320,180)">
      <rect x="-90" y="-52" width="180" height="104" rx="10" fill="#161616" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" />
      <rect x="-70" y="-32" width="140" height="64" rx="6" fill="#ffffff" opacity="0.06" />
      <circle cx="-20" cy="0" r="16" fill="none" stroke={accent} strokeWidth="3" opacity="0.9" />
      <path d="M -20,-14 A 14,14 0 0 1 -20,14 M -30,-4 A 24,24 0 0 1 -30,4" fill="none" stroke={accent} strokeWidth="3" opacity="0.6" />
      <rect x="18" y="-20" width="26" height="10" rx="2" fill="#ffffff" opacity="0.15" />
      <rect x="18" y="-2" width="18" height="6" rx="2" fill="#ffffff" opacity="0.1" />
    </g>
  )
}

function MeetupArt({ accent, seed }: { accent: string; seed: number }) {
  const dots = Array.from({ length: 24 })
  return (
    <g transform="translate(320,180)">
      {dots.map((_, i) => {
        const angle = (i / dots.length) * Math.PI * 2 + (seed % 5)
        const r = 40 + (i % 4) * 26
        return (
          <circle
            key={i}
            cx={Math.cos(angle) * r}
            cy={Math.sin(angle) * r}
            r={i % 3 === 0 ? 9 : 5}
            fill={i % 4 === 0 ? accent : '#a5a5a5'}
            opacity={0.35 + (i % 3) * 0.18}
          />
        )
      })}
    </g>
  )
}

function DefaultArt({ accent }: { accent: string }) {
  return (
    <g transform="translate(320,180)">
      <rect x="-120" y="-70" width="240" height="140" rx="16" fill="#161616" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" />
      <circle cx="-40" cy="0" r="26" fill="none" stroke={accent} strokeWidth="3" opacity="0.9" />
      <circle cx="46" cy="0" r="26" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="3" />
    </g>
  )
}
