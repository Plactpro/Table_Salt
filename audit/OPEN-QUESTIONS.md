# Open Questions

| ID | Phase | Question | Context |
|----|-------|----------|---------|
| Q-001 | 0 | Is `memorystore` used as session store in production, or only as a dev fallback? | If used in prod with multiple instances, sessions won't be shared — auth issues. |
| Q-002 | 0 | Which lockfile is canonical — `package-lock.json` or `bun.lock`? | Dockerfile uses `npm ci`, but bun.lock exists. Dependency resolution could differ. |
| Q-003 | 0 | Is the `ENCRYPTION_KEY` in `.replit` the same key used in production? | If so, it is fully compromised via git history. |
| Q-004 | 0 | What do the four `patch_*.mjs` / `.py` scripts do and are they run in production? | They suggest out-of-band live patching. |
| Q-005 | 0 | How is deployment to Railway triggered? | No railway.json, no CI/CD config. Replit config says autoscale. CLAUDE.md says Railway. Unclear which is actually used. |
| Q-006 | 0 | Are the `.auth/*.json` session cookies still valid? | Expiry timestamps are ~2026-04-20. If the SESSION_SECRET hasn't rotated, they may still authenticate. |
| Q-007 | 0 | Is there a `JWT_SECRET` env var in use alongside session-based auth? | `.env.example` defines both `SESSION_SECRET` and `JWT_SECRET` — need to determine if JWT is actually used and where. |
| Q-008 | 0 | What is `stripe-replit-sync` and what does it do? | Not a standard npm package. Needs investigation. |
| Q-009 | 1 | Is `POST /api/admin/circuit-breakers/reset` intentionally unauthenticated? | Registered in `server/index.ts:212` with no auth middleware. The admin-routes version (if any) has `requireSuperAdmin`. |
| Q-010 | 1 | Are the 7 global tables (no tenant_id) properly access-controlled at the application layer? | `session`, `platformSettings`, `systemEvents`, etc. have no DB-level tenant isolation. |
| Q-011 | 1 | Are the Razorpay credentials in the `tenants` table encrypted by `server/encryption.ts` at rest? | `razorpayKeyId` and `razorpayKeySecret` are `text` columns. Need to verify if encryption middleware wraps reads/writes. |
| Q-012 | 1 | Why does the WebSocket accept bare `?tenantId=` with no session? | `realtime.ts:196-199` — could allow any party to subscribe to a tenant's event stream. |
| Q-013 | 1 | Q-001 is now answered: `memorystore` is NOT used — `connect-pg-simple` is the session store. | However, memorystore remains as an unused production dependency. |
| Q-014 | 1 | Does any router path overlap between the duplicate tips routers (`tips.ts` and `tip-management.ts`)? | Both define `GET /api/tips/settings/:outletId` and others — potential route shadowing. |
| Q-015 | 1 | How does `server/encryption.ts` encrypt PII? What algorithm, key derivation, IV handling? | `ENCRYPTION_KEY` env var exists; `server/encryption.ts` and `server/encryption-rotation.ts` are unread. |
| Q-016 | 2 | Does `seedDatabase()` run in production? The only guard is `if (existing.length > 0) return`. | If it runs on a fresh prod DB, 8 users with password "demo123" are created. |
| Q-017 | 2 | Is the `plan` field on PATCH /api/tenant intentional for admin use, or should it be excluded from owner self-service? | Owner can set `plan: "premium"` without going through Stripe billing. |
| Q-018 | 2 | What happens to the Stripe customer record when registration fails partway (orphan tenant)? | Stripe customer created but tenant may have no owner. |
| Q-019 | 2 | Are the cross-tenant transfer/merge/split endpoints (orders.ts:1257-1359) ever called from the UI, or are they dead code from an earlier iteration? | They use `parseInt` on UUID params which would produce NaN. |
| Q-020 | 2 | Is the promotions engine (`evaluateRules`) evaluating server-side or trusting client discount values? | orders.ts:504+ runs promotions, but bill creation (restaurant-billing.ts) trusts client discount. |
| Q-021 | 2 | Is there any bill-level locking mechanism to prevent concurrent split payments from exceeding the bill total? | restaurant-billing.ts:518-570 has no `SELECT FOR UPDATE` or version check on bills. |
| Q-022 | 2 | Are UAE restaurants required to produce FTA-compliant tax invoices with TRN and sequential numbers? | If yes, F-059 and F-060 are compliance blockers for UAE market launch. |
| Q-023 | 3 | Are UUIDs used as primary keys throughout the schema? | If IDs are sequential integers, IDOR severity increases substantially since enumeration is trivial. UUIDs provide obscurity but not security. |
| Q-024 | 3 | Is there a reverse proxy or API gateway that could enforce tenant isolation at the network layer? | If not, all tenant isolation depends solely on application-layer checks in each endpoint. |
| Q-025 | 3 | Are the transfer-table/merge-tables/split-bill endpoints (orders.ts:1257-1359) actually reachable from the frontend? | They use `parseInt(req.params.id)` on what are likely UUID params, which would produce NaN and may fail silently. If reachable, these are critical. If dead code, they are still a latent risk. |
| Q-026 | 3 | Why do the loyalty tier config endpoints (customers.ts:150-227) use `x-tenant-id` header instead of `user.tenantId`? | This pattern exists nowhere else in the codebase and appears to be a developer error rather than intentional design. |
| Q-027 | 3 | Are tenant UUIDs considered secret? If discoverable via guest URLs/QR codes, WebSocket `?tenantId=` spoofing (F-055) becomes trivially exploitable. | Determines whether F-055 is theoretical or actively exploitable. |
| Q-028 | 3 | Is `outlets.assignment_settings` JSONB user-writable (via PATCH /api/outlets/:id)? | If yes, SQL injection at chef-assignment.ts:585 is exploitable by any manager. |
| Q-029 | 3 | Is there a reverse proxy or API gateway enforcing tenant isolation at the network layer? | If not, all 172 tenant-scoped tables depend solely on application-layer WHERE clauses. |
| Q-030 | 3 | How are the ~24 storage functions without tenant_id in WHERE actually called? Are callers always pre-validating? | Need exhaustive call-graph analysis to determine which unscoped storage functions are reachable without pre-validation. |
| Q-031 | 3 | Does the impersonation `accessMode` validation exist anywhere outside the string equality check at admin-routes.ts:367? | If not, any string other than `"READ_ONLY"` grants write access during impersonation. |
| Q-032 | 4 | Does any tenant currently operate outlets in multiple currencies? | Determines whether F-107/F-112/F-113/F-114/F-116 are theoretical or actively producing wrong numbers. |
| Q-033 | 4 | Is `stripe-replit-sync` in `package.json` dependencies? | If yes, dead weight; if no, calling `getStripeSync()` crashes at runtime. |
| Q-034 | 4 | Are there any non-centesimal currencies (JPY, KRW, BHD) configured for any tenant? | Determines real-world impact of F-106. |
| Q-035 | 4 | Is the Razorpay webhook at `server/index.ts:64-106` the only Razorpay webhook handler? | No reconciliation of Razorpay amount vs bill total exists anywhere. |
| Q-036 | 4 | Do the QuickBooks/Xero exports get used in production? | If yes, F-109 means accounting imports may silently use wrong currency. |
| Q-037 | 4 | Where is `applyRounding()` actually called in the order/billing flow? | It exists in `shared/currency.ts` but may only be used in the cash drawer module, not in order totals. |
| Q-038 | 4 | Is `manualDiscountAmount` validated on the client side? | If not, the lack of server-side cap (F-124) is actively exploitable by any staff member. |
| Q-039 | 4 | Are there tenants with explicitly `cgstRate: 0, sgstRate: 0`? | If yes, they get different GST treatment in orders (50/50) vs bills (both zero) — a real billing discrepancy. |
| Q-040 | 4 | Is `convertCurrency()` used for any financial calculation, or only display? | If used for aggregation, static exchange rates (F-064) become Critical. |
| Q-041 | 4 | Does any tenant have outlets configured with different `currencyCode` values? | Determines real-world impact of all cross-currency aggregation findings. |
| Q-042 | 5 | Is the circuit breaker reset in index.ts:212 intentional for emergency recovery, or a leftover from debugging? | It overrides the authenticated version in admin-routes.ts:2332. |
| Q-043 | 5 | What is the intended permission distinction between franchise_owner and owner? | Both have 35/35 identical permissions — no difference exists in the permission model. |
| Q-044 | 5 | Is tips.ts (registerTipsRoutes) actually registered? It is not imported in routes.ts. | If dead code, the only /api/tips/config/:outletId is the unauthenticated version in tip-management.ts. |
| Q-045 | 5 | How many Railway instances are deployed in production? | Determines whether the in-memory rate limiter fallback is a real bypass vector. |
| Q-046 | 5 | Are the Zomato/Swiggy/UberEats webhook tokens configured in production env vars? | Default values are trivially guessable ("zomato-webhook-token" etc.). |
| Q-047 | 5 | Is the Razorpay webhook (`/api/webhooks/razorpay`) correctly excluded from CSRF by registration order (before `setupCsrf`), or should it be in the explicit exemption list? | Currently works by accident of middleware ordering. |
| Q-048 | 5 | Should password change (`/api/auth/change-password`) invalidate other sessions like password reset does? | Password reset destroys all sessions (auth.ts:571); password change does not. Inconsistent behavior. |
| Q-049 | 5 | Is bcrypt (`bcrypt` 6.0 in package.json) used anywhere other than PIN hashing? | scrypt is used for passwords; bcrypt for PINs. If bcrypt is only for PINs, the dependency is overweight. |
| Q-050 | 5 | Q-015 answered: encryption.ts uses AES-256-GCM with scrypt key derivation, random IVs, GCM auth tags. Static salt is the only concern. | But TOTP secrets and recovery codes bypass this encryption entirely. |
| Q-051 | 5 | Q-011 partially answered: Razorpay credentials in `tenants` table are NOT encrypted by the encryption module. | Only `email` and `phone` on users pass through `encryptPiiFields`. Razorpay keys are plaintext. |
| Q-052 | 6 | Is there a client-side KDS polling mechanism that compensates for missed WebSocket events? | If KDS only relies on WebSocket, a 5-second disconnect means missed KOT arrivals with no recovery. |
| Q-053 | 6 | Is there a startup reconciliation job for orders stuck in `sent_to_kitchen` without print jobs? | Not found in server/index.ts boot sequence. Lost KOTs after crash are permanent. |
| Q-054 | 6 | Why are print jobs created twice — route-level AND inside routeAndPrint()? | May be intentional (KDS display record vs physical print record), but creates confusion and duplicate data. |
| Q-055 | 6 | What is the expected max offline duration for a kitchen printer before it becomes a Critical operational issue? | The 3-attempt limit with 30s intervals means ~90s max. For a busy kitchen, 90s of lost tickets is severe. |
| Q-056 | 6 | How many WebSocket connections does a typical tenant have at peak? | Determines DoS impact of F-166 and reconnection storm severity of F-172. |
| Q-057 | 7 | Is `stripe-replit-sync` functional on Railway, or does it fail silently on every startup? | Creates unnecessary DB tables and a redundant webhook endpoint if running. |
| Q-058 | 7 | How are tenants with their own Razorpay credentials supposed to receive webhooks? | Global webhook secret cannot validate signatures from different Razorpay accounts per-tenant. |
| Q-059 | 7 | Has SMS ever successfully worked in production? | The regex bug (F-184) strips digits, and the SQL INSERT (F-186) has no param markers — both break silently. |
| Q-060 | 7 | How should aggregator webhooks route to the correct tenant when multiple tenants use the same platform? | Current `LIMIT 1` on slug means only one tenant per platform is supported. |
| Q-061 | 7 | How is the team alerted to SMTP outages? | All email send failures are silently swallowed in email-service.ts with no monitoring or alerting. |
| Q-062 | 7 | Q-008 answered: `stripe-replit-sync` manages local `stripe.*` schema tables, auto-registers a managed webhook, and syncs Stripe data. Replit-specific infrastructure, redundant on Railway. | See Phase 7 Section 1.11. |
| Q-063 | 7 | Q-046 partially answered: The stub endpoints with hardcoded tokens are in service-coordination.ts but appear unused. The production aggregator webhook at channels.ts:179 has NO token validation at all. | F-189 is the real vulnerability; F-141 is academic. |
| Q-064 | 7 | How many Railway instances are currently running? | If >1, all duplicate-work findings (F-191, F-193, F-194) are active production bugs right now. |
| Q-065 | 7 | What is the current active tenant count? | If >100, coordination rules (F-192) are silently broken for excess tenants. |
| Q-066 | 7 | Is `generateAndSaveReport()` (stock reports) idempotent? | If not, multi-instance creates duplicate stock reports daily. |
| Q-067 | 7 | Is the S3 bucket configured as public-read? | Code returns permanent public URLs (F-200). If bucket is public, all uploads are permanently accessible. |
| Q-068 | 7 | Is `REDIS_URL` set in production? | Determines whether rate limiting, pub/sub, and lockout are cross-instance or per-instance only. |
| Q-069 | 7 | Are ad creatives with `text/html` MIME type served with `Content-Disposition: attachment`? | If served inline, F-199 enables stored XSS via uploaded HTML files. |
| Q-070 | 8 | Does `POST /api/print/receipt/:billId` escape user data in its HTML response? | If not, F-205 (BillPreviewModal writing server HTML to popup) escalates to High — stored XSS via bill data. |
| Q-071 | 8 | Can users or admins create custom payment method names? | If payment method names come from a fixed enum, F-206 is not exploitable. If user-configurable, stored XSS is possible in shift report print popup. |
| Q-072 | 8 | What error messages does the server return in JSON error responses? | If raw Drizzle/PostgreSQL errors leak through, F-208 (verbatim toast display) becomes High severity information disclosure. |
| Q-073 | 8 | Are tenant UUIDs visible in guest QR URLs or other public-facing channels? | Determines whether `/kds/wall?tenantId=` is trivially exploitable by external parties. |
| Q-074 | 8 | Does ANY server-side middleware enforce subscription plan restrictions on API access? | If not, F-211 means all "premium" and "enterprise" features are accessible to every tenant via direct API calls. |
| Q-075 | 8 | Are loyalty tier discount percentages (5%/10%/15%) also validated server-side, or only client-side? | If only client, F-213 allows any staff to apply arbitrary loyalty discounts to any bill. |
| Q-076 | 8 | Is it common for multiple staff to share the same browser on a POS terminal? | If yes, F-214 (unscoped localStorage) means staff members see each other's carts and customer PII. |
| Q-077 | 9 | Is the deployment actually on Replit (autoscale) or Railway? | No Railway config exists; all evidence points to Replit. CLAUDE.md says Railway — needs clarification. |
| Q-078 | 9 | Has the SESSION_SECRET been rotated since commit 12fc00b (when .auth/ cookies were committed)? | If not, the committed session cookies (owner/manager/kitchen) are still valid until ~2026-04-20. |
| Q-079 | 9 | Has the ENCRYPTION_KEY been rotated since commit e523dfa? | If not, all user PII encrypted with the compromised key is decryptable by anyone with repo access. |
| Q-080 | 9 | Are database backups managed by the hosting provider (Replit/Railway managed Postgres)? | If not, there is zero backup automation and a single DELETE FROM or DB corruption is unrecoverable. |
| Q-081 | 9 | Q-004 answered: The 4 patch scripts are source-code modification tools for the modifier feature, not runtime patches. | They indicate a workflow of running scripts to modify source files before building, rather than using git branches and PRs. |
| Q-082 | 9 | Q-007 answered: `JWT_SECRET` and `JWT_EXPIRES_IN` are documented in .env.example but JWT is NEVER used anywhere in the codebase. | Dead configuration — can be removed from .env.example to reduce confusion. |
