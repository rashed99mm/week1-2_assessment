import { Injectable, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { ApiService } from '../api/api.service'
import { decodeJwt, isExpired, type JwtClaims } from './jwt.util'
import { TokenStorage } from './token.storage'

export interface AuthUser {
  id: number
  name: string
  email: string
  role: 'user' | 'admin'
}

interface AuthResult {
  user: AuthUser
  token: string
}

/**
 * Session state for the CMS.
 *
 * The token is the source of truth for identity; `user` is what the API last
 * told us, used for display. Everything the UI decides from these is
 * cosmetic — the API enforces every permission independently.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService)
  private readonly storage = inject(TokenStorage)
  private readonly router = inject(Router)

  private readonly _token = signal<string | null>(this.storage.read())
  private readonly _user = signal<AuthUser | null>(null)

  readonly token = this._token.asReadonly()
  readonly user = this._user.asReadonly()

  readonly claims = computed<JwtClaims | null>(() => decodeJwt(this._token()))
  readonly isAuthenticated = computed(() => {
    const claims = this.claims()
    return claims !== null && !isExpired(claims)
  })
  readonly isAdmin = computed(() => this.claims()?.role === 'admin')

  /** Display name, from the token so it is available before /auth/me returns. */
  readonly displayName = computed(
    () => this._user()?.name ?? this.claims()?.name ?? 'Administrator',
  )

  /** The signed-in user's id, for guards like "you cannot demote yourself". */
  readonly userId = computed(() => {
    const sub = this.claims()?.sub
    return sub ? Number.parseInt(sub, 10) : null
  })

  private refreshTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Sign in.
   *
   * A non-administrator is rejected here rather than being let into a shell
   * where every panel 403s. The API refuses them regardless; this is about
   * saying so once, clearly.
   */
  async login(email: string, password: string): Promise<void> {
    const result = await firstValueFrom(
      this.api.post<AuthResult>('auth/login', { email, password }),
    )

    const claims = decodeJwt(result.token)

    if (claims?.role !== 'admin') {
      throw new Error('This account does not have administrator access.')
    }

    this.setSession(result.token, result.user)
  }

  async logout(): Promise<void> {
    try {
      // Best-effort: the server blacklists the token. A failure here still
      // ends the local session, which is what the user asked for.
      await firstValueFrom(this.api.post('auth/logout'))
    } catch {
      // Ignore.
    }

    this.clearSession()
    await this.router.navigate(['/login'])
  }

  /** Load the current user, to confirm the stored token is still good. */
  async loadUser(): Promise<void> {
    const user = await firstValueFrom(this.api.get<AuthUser>('auth/me'))
    this._user.set(user)
  }

  /**
   * Exchange the current token for a fresh one.
   *
   * The old token is blacklisted server-side by this call, so anything still
   * holding it must switch to the new one — see refresh.interceptor.
   */
  async refresh(): Promise<string> {
    const result = await firstValueFrom(this.api.post<AuthResult>('auth/refresh'))

    this.setSession(result.token, result.user)

    return result.token
  }

  setSession(token: string, user?: AuthUser | null): void {
    this._token.set(token)
    this.storage.write(token)

    if (user) this._user.set(user)

    this.scheduleRefresh()
  }

  clearSession(): void {
    this._token.set(null)
    this._user.set(null)
    this.storage.clear()

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  /**
   * Refresh shortly before the token expires.
   *
   * A dashboard left open polls in the background; without this it would 401
   * mid-poll and the user would see an error for something they did not do.
   */
  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)

    const claims = this.claims()
    if (!claims?.exp) return

    const msUntilRefresh = claims.exp * 1000 - Date.now() - 60_000

    if (msUntilRefresh <= 0) return

    this.refreshTimer = setTimeout(() => {
      void this.refresh().catch(() => this.clearSession())
    }, msUntilRefresh)
  }
}
