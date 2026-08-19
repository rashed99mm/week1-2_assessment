import { Link } from 'react-router-dom'
import { Logo } from './Logo'

const columns = [
  {
    heading: 'Browse',
    links: [
      { to: '/events', label: 'All events' },
      { to: '/events?type=1', label: 'Concerts' },
      { to: '/events?type=4', label: 'Sports' },
      { to: '/events?type=5', label: 'Theatre' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { to: '/orders', label: 'My orders' },
      { to: '/register', label: 'Create account' },
      { to: '/login', label: 'Sign in' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-ink">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              Pick your seat from an adaptive map, walk the venue in first person,
              and check out in seconds.
            </p>
            <p className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1">
                <span className="size-1.5 rounded-full bg-accent" />
                Instant e-tickets
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1">
                <span className="size-1.5 rounded-full bg-accent" />
                Secure checkout
              </span>
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
                {column.heading}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-muted transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} tic-ets. A demo build — React frontend, Laravel API.
          </p>
          <p className="text-xs text-muted">
            Seat maps generated per venue · 3D venue view · Mock payment gateway
          </p>
        </div>
      </div>
    </footer>
  )
}
