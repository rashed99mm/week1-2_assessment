/**
 * Development configuration.
 *
 * Points at the services running directly on the host. `ng serve` proxies
 * these through proxy.conf.json so the browser still sees one origin.
 */
export const environment = {
  production: false,
  apiBaseUrl: '/api/v1',
  analyticsBaseUrl: '/analytics/api/v1/analytics',
  notificationsBaseUrl: '/notifications/api/v1',
  socketUrl: '',
  socketPath: '/notifications/ws',
} as const
