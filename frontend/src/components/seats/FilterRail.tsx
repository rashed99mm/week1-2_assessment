import type { VenuePlan, TierName } from '../../lib/venueLayout'
import { Pill } from '../ui/Pill'
import { SeatLegend } from './SeatLegend'
import { formatCurrency } from '../../lib/format'

export interface SeatFilters {
  tier: 'all' | TierName
  price: [number, number]
  accessibleOnly: boolean
}

export const defaultFilters = (plan: VenuePlan): SeatFilters => ({
  tier: 'all',
  price: [plan.priceRange.min, plan.priceRange.max],
  accessibleOnly: false,
})

interface FilterRailProps {
  plan: VenuePlan
  filters: SeatFilters
  onChange: (filters: SeatFilters) => void
}

export function FilterRail({ plan, filters, onChange }: FilterRailProps) {
  const set = (patch: Partial<SeatFilters>) => onChange({ ...filters, ...patch })

  return (
    <div className="space-y-6 rounded-2xl border border-line bg-panel p-5">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Tier</h3>
        <div className="flex flex-wrap gap-2">
          <Pill active={filters.tier === 'all'} onClick={() => set({ tier: 'all' })}>
            All
          </Pill>
          {plan.tiers.map((tier) => (
            <Pill key={tier} active={filters.tier === tier} onClick={() => set({ tier })}>
              {tier}
            </Pill>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Price range</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={filters.price[0]}
            onChange={(e) => set({ price: [Number(e.target.value) || 0, filters.price[1]] })}
            aria-label="Minimum price"
            className="w-full rounded-lg border border-line bg-ink px-3 py-1.5 text-sm text-white transition-colors focus:border-accent focus:outline-none"
          />
          <span className="text-muted">–</span>
          <input
            type="number"
            min={0}
            value={filters.price[1]}
            onChange={(e) => set({ price: [filters.price[0], Number(e.target.value) || 0] })}
            aria-label="Maximum price"
            className="w-full rounded-lg border border-line bg-ink px-3 py-1.5 text-sm text-white transition-colors focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{formatCurrency(plan.priceRange.min)}</span>
          <span>{formatCurrency(plan.priceRange.max)}</span>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Accessibility</h3>
        <Pill
          active={filters.accessibleOnly}
          onClick={() => set({ accessibleOnly: !filters.accessibleOnly })}
        >
          Accessible seats only
        </Pill>
      </section>

      <section className="border-t border-line pt-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Legend</h3>
        <SeatLegend />
      </section>
    </div>
  )
}
