import {
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  type ApplicationConfig,
} from '@angular/core'
import { provideHttpClient, withInterceptors } from '@angular/common/http'
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router'
import { authInterceptor } from './core/interceptors/auth.interceptor'
import { errorInterceptor } from './core/interceptors/error.interceptor'
import { refreshInterceptor } from './core/interceptors/refresh.interceptor'
import { routes } from './app.routes'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    // Zoneless. Nothing in this app is zone-dependent — no 3D canvas, no
    // imperative third-party widgets — and dropping zone.js removes a
    // monkey-patch of every async API from the bundle. All state here is
    // signals.
    provideZonelessChangeDetection(),

    provideRouter(
      routes,
      // Route params bind straight to component inputs, so a detail page does
      // not need to inject ActivatedRoute to read an id.
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),

    // Order matters. Requests pass down the list and responses come back up,
    // so: auth adds the token, refresh sees a 401 and retries with a new one,
    // and error — outermost on the way back — converts whatever is left into
    // an ApiError.
    provideHttpClient(
      withInterceptors([authInterceptor, refreshInterceptor, errorInterceptor]),
    ),
  ],
}
