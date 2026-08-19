import { ChangeDetectionStrategy, Component } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { ConfirmDialog } from './shared/ui/confirm-dialog'
import { Toaster } from './shared/ui/toaster'

/**
 * Root component.
 *
 * Holds only the routed outlet and the two global overlays, so a toast raised
 * from anywhere — including a background socket push — is rendered once rather
 * than per feature.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Toaster, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <app-toaster />
    <app-confirm-dialog />
  `,
})
export class App {}
