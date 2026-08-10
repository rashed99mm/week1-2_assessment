import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ApiError, formatApiErrors } from '../../lib/api'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { AuthCard, AuthShell } from './AuthShell'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login({ email, password })
      navigate(redirect.startsWith('/') ? redirect : '/')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.errors ? formatApiErrors(err.errors).join(' · ') : err.message)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-white">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Sign in to book your seats.</p>
      </div>
      <AuthCard>
        <Alert tone="info" className="mb-5">
          Demo account: <span className="font-mono">admin@example.com</span> /{' '}
          <span className="font-mono">password</span>
        </Alert>
        {error && (
          <Alert tone="error" className="mb-5">
            {error}
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" className="w-full" size="lg" loading={submitting}>
            Sign in
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted">
          No account?{' '}
          <Link to="/register" className="font-medium text-accent-soft hover:text-accent">
            Create one
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  )
}
