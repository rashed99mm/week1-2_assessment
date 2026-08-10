/**
 * Rewrite a backend asset URL to a same-origin path.
 *
 * The API returns absolute URLs (e.g. http://127.0.0.1:8000/storage/covers/x.jpg).
 * That is fine for an <img>, but WebGL textures are read back by the GPU and a
 * cross-origin image taints the canvas unless the server sends CORS headers —
 * which Laravel's static file handler does not do, since the CORS config only
 * covers `api/*`.
 *
 * Vite proxies `/storage` in development and production serves it from the same
 * origin, so reducing the URL to its path sidesteps the problem entirely.
 */
export function sameOriginAsset(url: string | null | undefined): string | null {
  const trimmed = url?.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed, window.location.origin)
    if (parsed.pathname.startsWith('/storage/')) {
      return parsed.pathname + parsed.search
    }
    return trimmed
  } catch {
    return trimmed
  }
}
