/**
 * The single TypeScript source for every colour consumed outside CSS — the SVG
 * seat map, the three.js venue, and the procedural event posters.
 *
 * CSS cannot import TypeScript, so `src/index.css`'s `@theme` block stays the
 * authoring source for the palette and this file mirrors it. `assertTokensInSync`
 * guards the two against drifting apart during development.
 */

export const tokens = {
  /** app background */
  page: '#161616',
  /** deeper surface: navbar, modals, hero, 3D canvas */
  ink: '#121212',
  /** cards, inputs, elevated panels */
  panel: '#232323',
  /** crimson — primary CTA and selected seats, used sparingly */
  accent: '#c6393f',
  /** hover / link accent */
  accentSoft: '#c7675b',
  /** secondary text */
  muted: '#a5a5a5',
  /** accessible-seat marker */
  surface: '#bfbfbf',
  /** all borders */
  line: 'rgba(255, 255, 255, 0.1)',
} as const

/**
 * Shades derived from the palette for the seat map and 3D venue. These are not
 * part of the brand palette — strictly interpolations between ink, panel and
 * surface — so they live apart from `tokens` and never appear in `@theme`.
 */
export const venueTokens = {
  seatAvailable: '#3d3d3d',
  seatAvailable2D: 'transparent',
  seatSold: '#1f1f1f',
  seatSold2D: '#232323',
  seatPremium: '#ececec',
  seatPremium2D: '#f2f2f2',
  seatAccessible: '#b8b8b8',
  seatDimmed: '#151515',
  stageTop: '#2c2c2c',
  stageBottom: '#1c1c1c',
  stageEdge: '#3a3a3a',
  stageRim: '#4a4a4a',
  stageBody: '#262626',
  riser: '#1a1a1a',
  riserEdge: '#242424',
  /** the warm stage wash — the only glow in the product */
  wash: '#ffd0b0',
} as const

export type TokenName = keyof typeof tokens

const SYNCED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['--color-page', tokens.page],
  ['--color-ink', tokens.ink],
  ['--color-panel', tokens.panel],
  ['--color-accent', tokens.accent],
  ['--color-accent-soft', tokens.accentSoft],
  ['--color-muted', tokens.muted],
  ['--color-surface', tokens.surface],
]

/**
 * Warn in development when `index.css` and this module disagree about a colour.
 * Tailwind v4 emits the `@theme` block as `:root { --color-accent: #c6393f }`,
 * so the values are readable from the computed style of the document element.
 */
export function assertTokensInSync(): void {
  if (!import.meta.env.DEV || typeof document === 'undefined') return

  const computed = getComputedStyle(document.documentElement)
  for (const [cssVar, tsValue] of SYNCED_PAIRS) {
    const actual = computed.getPropertyValue(cssVar).trim().toLowerCase()
    if (actual && actual !== tsValue.toLowerCase()) {
      console.warn(
        `[tokens] drift on ${cssVar}: index.css has ${actual}, tokens.ts has ${tsValue}`,
      )
    }
  }
}
