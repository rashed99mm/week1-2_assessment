import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../../components/layout/Logo'

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-page px-4 py-10">
      <Link to="/" aria-label="tic-ets home">
        <Logo />
      </Link>
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  )
}

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-8 shadow-2xl shadow-black/30">
      {children}
    </div>
  )
}
