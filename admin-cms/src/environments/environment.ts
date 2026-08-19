/**
 * Production configuration.
 *
 * All paths are relative and same-origin: nginx serves this app at /admin/ and
 * proxies /api/v1, /analytics/api and /notifications to the services behind it.
 * That means no CORS, no build-time host to get wrong, and the same bundle
 * works on any hostname.
 */
export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
  analyticsBaseUrl: '/analytics/api/v1/analytics',
  notificationsBaseUrl: '/notifications/api/v1',
  socketUrl: '',
  socketPath: '/notifications/ws',
} as const
