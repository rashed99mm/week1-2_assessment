# Authentication: JWT contract

`tickets-backend` is the only issuer. `notification-service` and `analytics-service` verify tokens
but cannot mint them. Both front-ends are bearers only.

## Algorithm: RS256

Laravel signs with a 2048-bit RSA **private** key. The other services hold only the **public** key.

This is deliberate. Under the previous HS256 scheme the signing secret had to be copied into three
runtimes, which meant a leak from any one of them let an attacker mint admin tokens for the whole
system. With RS256 the Node and .NET services can verify a token and cannot forge one.

```
JWT_ALGO=RS256
JWT_PRIVATE_KEY=/run/secrets/jwt-private.pem     # tickets-backend only
JWT_PUBLIC_KEY=/run/secrets/jwt-public.pem       # every service
```

Generating the pair:

```bash
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
```

The private key is a deployment secret and never enters the repository. `config/jwt.php` in Laravel
already supports this configuration; only the env values change.

## Claims

```jsonc
{
  "iss":  "http://localhost/api/v1/auth/login",  // the login URL — environment-dependent
  "iat":  1755345296,
  "exp":  1755348896,                            // iat + 3600 (JWT_TTL=60 minutes)
  "nbf":  1755345296,
  "jti":  "aBcD…",                               // used by Laravel's logout blacklist
  "sub":  "12",                                  // user id, as a STRING
  "prv":  "23bd5c…",                             // sha1 of the auth provider class — Laravel internal, ignore
  "role": "admin",                               // "user" | "admin"
  "name": "Demo Admin",
  "email": "admin@example.com"
}
```

`role`, `name` and `email` are custom claims added by `User::getJWTCustomClaims()`. They exist so the
CMS can render a user chip and the foreign services can authorize without a round-trip to Laravel.

> **`config/jwt.php` must list them in `persistent_claims`.**
> `auth('api')->refresh()` rebuilds the payload and drops any custom claim not named there. Without
> it, every admin is silently demoted to a role-less token roughly an hour into their session — a
> bug that is miserable to reproduce because it only appears after the first refresh.
> `AuthApiTest::test_refresh_preserves_role_claim` guards this.

## Rules for verifying a token outside Laravel

1. **Pin the algorithm to `RS256`.** Accept nothing else. A verifier that honours the token's own
   `alg` header can be handed `alg: none`, or an HS256 token signed with the public key as if it
   were a shared secret. Both are classic forgeries and both are trivially blocked by pinning.
2. **`ValidateIssuer = false`.** `iss` is the full login URL, so it differs between local, CI and
   production. It is not a useful check here.
3. **`ValidateAudience = false`.** The library emits no `aud` claim at all; enabling audience
   validation rejects every token.
4. **`ValidateLifetime = true`**, with roughly 30 seconds of clock skew.
5. **`sub` is a string.** Parse it to an integer before comparing with a database id. `"12" != 12`
   in most languages, and the comparison silently fails rather than erroring.
6. **Authorize on the `role` claim** — `role === "admin"`. In .NET use
   `RequireClaim("role", "admin")`, not `RequireRole(...)`, so the check does not depend on
   claim-type mapping.

### .NET specifically

```csharp
// BEFORE AddAuthentication — this line is not optional
JsonWebTokenHandler.DefaultInboundClaimTypeMap.Clear();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey  = new RsaSecurityKey(publicRsa),
            ValidAlgorithms   = [SecurityAlgorithms.RsaSha256],
            ValidateIssuer    = false,
            ValidateAudience  = false,
            ValidateLifetime  = true,
            ClockSkew         = TimeSpan.FromSeconds(30),
            NameClaimType     = "sub",
            RoleClaimType     = "role",
        };
    });

builder.Services.AddAuthorization(o =>
    o.AddPolicy("AdminOnly", p => p.RequireAuthenticatedUser().RequireClaim("role", "admin")));
```

Without `DefaultInboundClaimTypeMap.Clear()` and `MapInboundClaims = false`, the handler rewrites
`sub` to `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier` and
`User.FindFirst("sub")` returns null. The token validates, the claim is present, and authorization
fails anyway — which is why "works in Postman, 403s in .NET" is the most-reported symptom of this
setup.

Also override `OnChallenge` and `OnForbidden` to write the shared response envelope. ASP.NET's
default 401/403 body is empty, which no client in this system can parse.

## Trust boundary

**`tickets-backend` authorizes from the database, not from the claim.** `EnsureUserIsAdmin` and
`OrderPolicy` read `auth()->user()->role`. The claim is a cache; the row is the truth. Demoting an
admin takes effect immediately on the service that owns the data.

**`notification-service` and `analytics-service` authorize from the claim.** They have no access to
the users table and must not acquire one — a read-model service reaching into the system of
record's database is the coupling this architecture exists to avoid.

The consequence, accepted deliberately: a role change is invisible to those two services until the
user's next login or token refresh, at most 60 minutes. Neither service performs a destructive
action, so the exposure is a stale dashboard read.

## Revocation is local to Laravel

`blacklist_enabled` is on. Logging out, and refreshing, add the token's `jti` to Laravel's cache and
Laravel rejects it thereafter. **That blacklist is invisible to Node and .NET.** A logged-out token
still verifies there until it expires.

This is documented rather than fixed. Closing it properly needs a shared revocation store that all
three services read on every request, which trades a network hop per request for at most 60 minutes
of staleness on two read-only services. Not worth it for the MVP. If it becomes worth it: point
Laravel's cache at the shared Redis and have both services check `laravel_cache_:jti:<jti>`.

## Token lifecycle for clients

| Endpoint | Effect |
|---|---|
| `POST /api/v1/auth/login` | `{ user, token }`. Rate limited to 5 attempts per minute. |
| `POST /api/v1/auth/register` | 201, same shape as login |
| `GET /api/v1/auth/me` | The current user, including `role` |
| `POST /api/v1/auth/refresh` | A new token; **blacklists the one used to call it** |
| `POST /api/v1/auth/logout` | Blacklists the current token |

Transport is `Authorization: Bearer <token>`.

**The refresh trap.** Because refresh blacklists the old token, a client that retries a failed
request with the *old* header after refreshing gets another 401 and loops forever. Any 401-retry
interceptor must:

- run the refresh **single-flight** — concurrent 401s wait on one refresh, they do not each fire one;
- retry with the **new** token;
- retry **once**, then log out;
- never trigger on `/auth/refresh` or `/auth/login` themselves.

Both front-ends should also refresh proactively at `exp - 60s` so a long-lived dashboard does not
401 in the middle of a poll.

## Password rules

Set by `RegisterRequest`: minimum 8 characters, at least one lowercase, one uppercase and one digit,
and `password_confirmation` must match. Emails are lowercased before storage and comparison.

Login failures return a generic 401 regardless of whether the account exists — do not "improve" this
message; distinguishing the two cases turns the endpoint into a user-enumeration oracle.
