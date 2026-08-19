import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { describeError } from '../../core/api/api-error'
import { AuthService } from '../../core/auth/auth.service'

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 1rem; }
    .card {
      width: min(24rem, 100%);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem 1.75rem;
      box-shadow: 0 12px 40px rgb(0 0 0 / 0.14);
    }
    h1 { margin: 0 0 0.25rem; font-size: 1.3rem; }
    .sub { margin: 0 0 1.5rem; color: var(--muted); font-size: 0.88rem; }
    label { display: block; margin-bottom: 0.9rem; font-size: 0.85rem; }
    label span { display: block; margin-bottom: 0.3rem; color: var(--muted); }
    input {
      width: 100%;
      padding: 0.6rem 0.7rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--surface-2);
      color: var(--text);
      font-size: 0.92rem;
    }
    button {
      width: 100%;
      padding: 0.65rem;
      margin-top: 0.4rem;
      border: none;
      border-radius: 6px;
      background: var(--accent);
      color: #fff;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
    }
    button:disabled { opacity: 0.6; cursor: progress; }
    .error {
      margin-bottom: 1rem;
      padding: 0.6rem 0.75rem;
      border-radius: 6px;
      border-left: 3px solid #dc2626;
      background: color-mix(in srgb, #dc2626 10%, transparent);
      font-size: 0.85rem;
    }
  `],
  template: `
    <div class="wrap">
      <div class="card">
        <h1>Tickets CMS</h1>
        <p class="sub">Sign in with an administrator account.</p>

        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>
            <span>Email</span>
            <input type="email" formControlName="email" autocomplete="username" required />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              formControlName="password"
              autocomplete="current-password"
              required
            />
          </label>

          <button type="submit" [disabled]="form.invalid || submitting()">
            {{ submitting() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder)
  private readonly auth = inject(AuthService)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)

  readonly submitting = signal(false)
  readonly error = signal<string | null>(null)

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  })

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) return

    this.submitting.set(true)
    this.error.set(null)

    try {
      const { email, password } = this.form.getRawValue()
      await this.auth.login(email, password)

      // Only same-origin paths are honoured. An absolute URL here would make
      // the login form an open redirect — a phishing link that ends on
      // somebody else's site after a genuine sign-in.
      const redirect = this.route.snapshot.queryParamMap.get('redirect')
      const target = redirect?.startsWith('/') ? redirect : '/dashboard'

      await this.router.navigateByUrl(target)
    } catch (error) {
      this.error.set(describeError(error))
    } finally {
      this.submitting.set(false)
    }
  }
}
