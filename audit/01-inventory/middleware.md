# Phase 1 — Middleware Inventory

**Source:** `server/index.ts`, `server/security.ts`, `server/auth.ts`, `server/routes.ts`, `server/middleware.ts`, `server/middleware/check-restriction.ts`

---

## Middleware Registration Order

Middleware is registered in the order shown below. Order matters for security.

### 1. Compression (server/index.ts:31)
```
app.use(compression())
```
- Compresses all HTTP responses via gzip/deflate.

### 2. Security Headers — setupSecurity() (server/security.ts:55-178)

Registered via `setupSecurity(app)` at `server/index.ts:33`.

| Middleware | Config | Purpose |
|-----------|--------|---------|
| `helmet()` | CSP enforcing (not report-only), `crossOriginEmbedderPolicy: false` | Sets Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, etc. |
| `helmet.hsts()` | maxAge: 1 year, includeSubDomains, preload | Strict-Transport-Security |
| `helmet.referrerPolicy()` | strict-origin-when-cross-origin | Referrer-Policy header |
| `helmet.permittedCrossDomainPolicies()` | none | X-Permitted-Cross-Domain-Policies |
| Auth rate limiter | 15 req / 15 min per IP | Applied to `/api/auth/login` and `/api/auth/register` |
| API rate limiter | 120 req / 60 sec per user (or IP) | Applied to all `/api/` routes; skips auth endpoints |
| Upload rate limiter | 10 req / 60 sec per user | Applied to `/api/upload` |
| Permissions-Policy | camera=(), microphone=(), geolocation=(self), payment=() | Browser feature policy |

**Rate limiter backing store:** Redis (via `rate-limit-redis`) if `REDIS_URL` set; in-memory otherwise.

**Trust proxy:** `app.set("trust proxy", 1)` — trusts first proxy hop for `X-Forwarded-For`.

### 3. Stripe Webhook (server/index.ts:42-62)
```
app.post("/api/stripe/webhook", express.raw(...), handler)
```
- Registered BEFORE `express.json()` to receive raw body for signature verification.

### 4. Razorpay Webhook (server/index.ts:65-106)
```
app.post("/api/webhooks/razorpay", express.raw(...), handler)
```
- Same pattern: raw body for HMAC signature verification.

### 5. Body Parsers (server/index.ts:108-116)
```
app.use(express.json({ verify: stores rawBody }))
app.use(express.urlencoded({ extended: false }))
```
- JSON parser stores raw body on `req.rawBody` for any route that needs it.

### 6. API Rate Anomaly Sampler (server/index.ts:225-231)
- Non-blocking sampler on every authenticated GET `/api/*` request.
- Calls `checkApiRateAnomaly()` (fire-and-forget).

### 7. Route Context Logger (server/index.ts:233-239)
- Sets async local storage context with `{ route: "METHOD /path" }` for query logging.
- Only for `/api/*` routes.

### 8. Request Logger (server/index.ts:241-280)
- Logs method, path, status, duration for all `/api/*` requests.
- Production: structured JSON. Development: human-readable.
- Redacts response body for sensitive routes (`/api/gdpr/*`, `/api/auth/login`, `/api/auth/register`, `/api/security`).

---

## Middleware Registered in registerRoutes() (server/routes.ts)

### 9. Session + Passport — setupAuth() (server/auth.ts:122-238)

| Middleware | Config | Purpose |
|-----------|--------|---------|
| Cookie migration | Copies legacy `connect.sid` to `ts.sid` if present | Backward compatibility |
| `express-session` | PG store (connect-pg-simple), cookie name `ts.sid`, 30-day maxAge, httpOnly, secure in prod, sameSite lax, prune every 15 min | Session management |
| `passport.initialize()` | | Passport setup |
| `passport.session()` | | Session-based auth via passport |

**Session store:** PostgreSQL via `connect-pg-simple` (creates table if missing). `memorystore` is a dependency but NOT used in the auth setup — PG store is always used.

**Serialization:** Stores `user.id` in session. Deserialization fetches full user + subscription grace status.

### 10. CSRF Protection — setupCsrf() (server/security.ts:181-221)

- Sets `csrf-token` cookie (httpOnly: false, sameSite: strict, secure in prod) on every `/api/` request.
- Token = HMAC-SHA256(sessionId, SESSION_SECRET).
- Validates `x-csrf-token` header matches cookie for all mutating methods (POST/PUT/PATCH/DELETE).
- **Exemptions:** login, register, forgot-password, reset-password, Stripe webhook, guest/*, kiosk/*, table-requests, client errors, aggregator webhooks, ad-impressions.

### 11. IP Allowlist — setupIpAllowlistMiddleware() (server/security.ts:277-319)

- Checks per-tenant `moduleConfig.ipAllowlistEnabled`.
- Skips for: non-API paths, public paths, non-authenticated, super_admin, non-privileged roles.
- For privileged roles (owner, hq_admin, franchise_owner, manager, accountant): validates client IP against allowlist CIDRs.
- Supports per-role and global allowlists.
- **Fail behavior:** Deny on error (fail closed).

### 12. Subscription Restriction — blockIfRestricted (server/middleware/check-restriction.ts)

- Imported and applied to all routes after auth setup.
- Purpose: Blocks API access for restricted/suspended tenants.

### 13. Circuit Breaker Middleware (server/routes.ts:107-150)

- Applied per path prefix for high-impact operations.
- See endpoints.md for coverage map.

---

## Auth Middleware Functions (server/auth.ts + server/middleware.ts)

| Function | File | Purpose |
|----------|------|---------|
| `requireAuth` | auth.ts:241-295 | Verifies `req.isAuthenticated()`, checks idle timeout (default 30 min), updates `session.lastActivity`, promotes expired trials, injects subscription warning header |
| `requireRole(...roles)` | auth.ts:297-307 | Checks `req.user.role` is in allowed roles list |
| `requireSuperAdmin` | auth.ts:309-317 | Checks `req.user.role === "super_admin"` |
| `requireFreshSession` | auth.ts:329-371 | Concurrent session detection — compares session token with DB token; fires throttled account-sharing alert on mismatch (alert-only, does not block) |
| `requirePermission(perm)` | server/permissions.ts (exported via middleware.ts) | Fine-grained permission check against role-based permission config |

### Password Security (server/auth.ts)
- **Hashing:** scrypt (64-byte output, 16-byte random salt) — NOT bcrypt despite bcrypt being in dependencies.
- **Lockout:** In-memory map, 5 attempts in 15 min window.
- **Policy:** min 8 chars, uppercase + lowercase + digit + special required, prevent reuse of last 5, 90-day expiration.

---

## CSP Directives (server/security.ts:40-53)

| Directive | Value |
|-----------|-------|
| default-src | 'self' |
| script-src | 'self' 'unsafe-inline' 'unsafe-eval' |
| style-src | 'self' 'unsafe-inline' https://fonts.googleapis.com |
| font-src | 'self' data: https://fonts.gstatic.com |
| img-src | 'self' data: blob: https: |
| connect-src | 'self' wss: https://api.stripe.com https://api.razorpay.com |
| frame-src | 'self' https://js.stripe.com https://hooks.stripe.com https://api.razorpay.com https://checkout.razorpay.com |
| worker-src | 'self' blob: |
| object-src | 'none' |
| base-uri | 'self' |
| form-action | 'self' |
| frame-ancestors | 'none' |
