import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, setUnauthorizedHandler } from '../lib/api'
import { getToken, setToken, clearToken } from '../lib/auth'
import type { AuthResult, LoginPayload, RegisterPayload, User } from '../types'

interface AuthContextValue {
  user: User | null
  token: string | null
  loading: boolean
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [loading, setLoading] = useState(true)

  const applyAuth = useCallback((result: AuthResult) => {
    setToken(result.token)
    setTokenState(result.token)
    setUser(result.user)
  }, [])

  const login = useCallback(
    async (payload: LoginPayload) => {
      const result = await api.post<AuthResult>('/api/auth/login', payload)
      applyAuth(result)
    },
    [applyAuth],
  )

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const result = await api.post<AuthResult>('/api/auth/register', payload)
      applyAuth(result)
    },
    [applyAuth],
  )

  const logout = useCallback(async () => {
    try {
      if (getToken()) {
        await api.post('/api/auth/logout')
      }
    } catch {
      // Ignore logout network errors; the token is cleared locally regardless.
    }
    clearToken()
    setTokenState(null)
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    const result = await api.post<AuthResult>('/api/auth/refresh')
    applyAuth(result)
  }, [applyAuth])

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get<User>('/api/auth/me')
      .then(setUser)
      .catch(() => {
        clearToken()
        setTokenState(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setTokenState(null)
      setUser(null)
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, refresh }),
    [user, token, loading, login, register, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
