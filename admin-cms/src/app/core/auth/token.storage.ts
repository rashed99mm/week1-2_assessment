import { Injectable } from '@angular/core'

/**
 * Where the CMS keeps its bearer token.
 *
 * The key is deliberately NOT the portal's `tickets_token`. nginx serves both
 * apps from one origin, so they share localStorage — and with a shared key, an
 * administrator browsing the shop as a customer and logging out would silently
 * end their CMS session too. Two keys, two independent sessions.
 *
 * See docs/contracts/README.md.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  private static readonly KEY = 'admin_cms_token'

  read(): string | null {
    try {
      return localStorage.getItem(TokenStorage.KEY)
    } catch {
      // Private browsing, or storage disabled. Treat as signed out rather
      // than crashing the whole app on boot.
      return null
    }
  }

  write(token: string): void {
    try {
      localStorage.setItem(TokenStorage.KEY, token)
    } catch {
      // Nothing useful to do: the session simply will not survive a reload.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(TokenStorage.KEY)
    } catch {
      // Ignore.
    }
  }
}
