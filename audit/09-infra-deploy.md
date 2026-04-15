# Phase 9 — Infrastructure, Deployment, and Operational Readiness

**Date:** 2026-04-15
**Scope:** Dockerfile, docker-compose, Replit config, deployment target, CI/CD, env vars, logging, observability, backup, secrets in git history, patch scripts, configuration drift.

---

## 1. Dockerfile

**File:** `Dockerfile` (37 lines, multi-stage)

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| Base image | `node:20-alpine` | Good — minimal attack surface |
| Build stage | `npm ci` → `npm run build` | Good — full dependency install for build |
| Production stage | `npm ci --omit=dev` + `npm cache clean --force` | Good — no dev deps in image |
| User | `addgroup -S appgroup && adduser -S appuser -G appgroup` → `USER appuser` | **Good** — non-root |
| Port | `EXPOSE 5000` | Matches app config |
| Health check | `wget -qO- http://localhost:5000/api/health` every 30s | Good |
| Volumes | `mkdir -p uploads && chown -R appuser:appgroup uploads` | Good — writable uploads dir |
| Secrets at build time | **None** — no ARG/ENV with secrets in build | Good |
| `.dockerignore` | Excludes `node_modules`, `dist`, `.DS_Store`, `.git`, `*.tar.gz` | **Missing:** `.env`, `.auth/`, `.replit` not excluded — could leak into image |

### Dockerfile Issues

- `.dockerignore` does NOT exclude `.env`, `.auth/`, or `.replit`. If a `.env` file exists at build time, it's copied into the builder stage via `COPY . .`. While the production stage only copies `dist/`, the builder layer remains in the image history and can be extracted.
- No `COPY --chown=appuser:appgroup` for the dist copy — files owned by root, readable by appuser (acceptable for read-only code).

---

## 2. docker-compose.yml

**File:** `docker-compose.yml` (74 lines)

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| Services | `app` (Node), `db` (PostgreSQL 16 Alpine) | Minimal |
| Redis | **Commented out** | WS pub/sub and rate limiting are single-instance only |
| Postgres credentials | `POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres` | **Insecure** — default creds |
| DATABASE_URL | `postgresql://postgres:postgres@db:5432/tablesalt` | Hardcoded credentials |
| Secrets | `SESSION_SECRET`, `STRIPE_*`, `RAZORPAY_*` — all `${VAR}` from host env | Good — not hardcoded |
| Resource limits | **None** — no `deploy.resources.limits` | Gap — containers can consume unlimited CPU/memory |
| Networks | Default bridge | Acceptable for dev; production should use isolated networks |
| Volumes | `pgdata` (persistent DB), `uploads` (file storage) | Good |
| Health check (db) | `pg_isready` every 10s | Good |
| `depends_on` | `db: service_healthy` | Good — waits for healthy DB |
| Restart policy | `unless-stopped` | Good |

---

## 3. Replit Configuration

**File:** `.replit` (57 lines)

| Aspect | Value | Assessment |
|--------|-------|------------|
| Modules | nodejs-20, python-3.11, web, postgresql-16 | Standard |
| Run command | `npm run dev` | Dev mode |
| Deployment target | `autoscale` | Replit Deployments |
| Build | `["npm", "run", "build"]` | Standard |
| Start | `["node", "./dist/index.cjs"]` | Production bundle |
| Port | 5000 → 80 (external) | Standard |
| **`[userenv.shared]`** | ENCRYPTION_KEY, VAPID keys, VAPID subject | **CRITICAL** — secrets committed to repo |

### Secrets in .replit (F-001, F-002 — reconfirmed)

```ini
ENCRYPTION_KEY = "496b8d2b5325b3f03962b3cb793db895f63e16971d9ba8bc71365836e8242a1e"
VAPID_PUBLIC_KEY = "BBaQPfMeJc1K2oexbQxXH7p1d-kuYUAVATlc1xFvR2xOvR6HVksgC8i-4HJx_bujSpofKBDxQ-KzaiGi2L6_4Yk"
VAPID_PRIVATE_KEY = "127HVONIuUM4QYLsky46Wg-tvUskuzLZC3t2Gg-Vp5E"
VAPID_SUBJECT = "mailto:admin@tablesalt.app"
```

These are readable to anyone with repo access. The ENCRYPTION_KEY is used to encrypt user PII (email, phone). Compromised = all encrypted PII is decryptable.

---

## 4. Deployment Target

**Ambiguity:** CLAUDE.md says "Deployed on Railway at inifinit.com". `.replit` says `deploymentTarget = "autoscale"`. No `railway.json`, `railway.toml`, `Procfile`, or `nixpacks.toml` found.

**Evidence suggests Replit is the actual deployment platform:**
- `.replit` has full deployment config
- `replit.md` exists with project documentation
- `@replit/vite-plugin-*` packages in dependencies
- `stripe-replit-sync` library used
- `REPL_ID` referenced in vite.config.ts

**No Railway-specific configuration exists in the repository.** If deployed on Railway, it uses the Dockerfile (which is Railway's default). If deployed on Replit, it uses the `.replit` config.

---

## 5. CI/CD

**Confirmed absent.** No automated testing, linting, security scanning, or deployment pipelines.

| Expected | Found |
|----------|-------|
| `.github/workflows/` | Not present |
| `.gitlab-ci.yml` | Not present |
| Pre-commit hooks (Husky) | Not present |
| ESLint config | Not present |
| Prettier config | Not present |
| Test automation on push | Not present |
| Deploy automation | Not present |
| Dependency vulnerability scanning | Not present |

**Impact:**
- No automated tests run before deploy — manual `npm run build` + deploy
- No SAST/DAST scanning — vulnerabilities discovered only by manual audit
- No dependency audit (`npm audit`) in any pipeline
- No secrets scanning (GitLeaks, TruffleHog, etc.)
- Patch scripts at repo root suggest manual code patching as the deployment strategy

---

## 6. Environment Variables Audit

### Variables in `.env.example` vs Actual Code Usage

| Variable | In .env.example | Used In Code | Default | Issue |
|----------|----------------|-------------|---------|-------|
| `SESSION_SECRET` | Yes | `auth.ts` | None (required in prod) | **Fatal if missing** (process.exit) — good |
| `JWT_SECRET` | Yes | **Not found** | None | **Dead variable** — JWT is not used anywhere |
| `JWT_EXPIRES_IN` | Yes | **Not found** | `7d` | **Dead variable** |
| `DATABASE_URL` | Yes | `db.ts` | None (required) | Good |
| `ENCRYPTION_KEY` | **Not in .env.example** | `encryption.ts` | None (throws) | **Missing from docs** — only in `.replit` |
| `BCRYPT_ROUNDS` | Yes | **Not found** | `12` | **Dead** — bcrypt uses hardcoded `10` for PINs |
| `CORS_ORIGIN` | Yes | **Not found** | None | **Dead** — no CORS middleware configured |
| `DEFAULT_TENANT_ID` | Yes | **Not found** | `1` | **Dead** |
| `MAX_LOCATIONS_PER_TENANT` | Yes | **Not found** | `50` | **Dead** |
| `OPENAI_API_KEY` | Yes | **Not found** | None | **Dead** |
| `CLOUDINARY_*` | Yes (3 vars) | **Not found** | None | **Dead** |
| `GOOGLE_*` | Yes (3 vars) | **Not found** | None | **Dead** |
| `MSG91_API_KEY` | **Not in .env.example** | `sms-gateway.ts` | None | **Missing from docs** |
| `MSG91_SENDER_ID` | **Not in .env.example** | `sms-gateway.ts` | `TBSALT` | **Missing from docs** |
| `MSG91_FLOW_ID` | **Not in .env.example** | `sms-gateway.ts` | None | **Missing from docs** |
| `SHIFT_END_HOUR` | **Not in .env.example** | `shift-digest-mailer.ts` | `22` | **Missing from docs** |
| `CSP_REPORT_ONLY` | **Not in .env.example** | `security.ts` | `false` | **Missing from docs** |

### Insecure Defaults

| Item | Location | Default | Risk |
|------|----------|---------|------|
| Staff password | `users.ts:49` | `"demo123"` | High — trivially guessable |
| Kiosk tokens in seed | `seed.ts:1646-1648` | `"kiosk-demo-token-*"` | High — guessable if seed runs in prod |
| Aggregator webhook tokens | `service-coordination.ts:734,750,766` | `"zomato-webhook-token"` etc. | High — trivially guessable |
| Session secret | None — **required** | Exits if missing in prod | Good |
| `drizzle.config.ts` strict | `strict: false` | No confirmation on destructive schema changes | Medium |

---

## 7. Logging

### What's Logged

| Source | What | PII Risk |
|--------|------|----------|
| Request logger (`index.ts:241-280`) | method, path, status, duration, response body (dev only) | **Dev:** response bodies may contain PII. **Prod:** structured JSON, no body |
| Slow query logger (`query-logger.ts`) | SQL text (first 200 chars) + params (first 200 chars) | **Yes** — query params can contain names, emails, phones |
| Seed output (`seed.ts:1639-1648`) | "all passwords: demo123" + kiosk token URLs | **Yes** — credentials logged to stdout |
| Password reset email (`email.ts:48`) | "Sent to user (email redacted)" | Good — email redacted |
| Sensitive route redaction (`index.ts:270-271`) | GDPR, auth/login, security routes excluded from response logging | Good |
| Audit events (`auditEvents` table) | entity changes with before/after JSONB, IP address, user agent | **Yes** — before/after may contain PII |

### Where Logs Go

All logging uses `console.log` / `console.error` / `console.warn`. No structured log aggregation service configured. Logs go to:
- **Replit:** Replit console (ephemeral unless Replit logging is configured)
- **Docker/Railway:** stdout/stderr (captured by container runtime)
- **No log rotation** — relies on container orchestrator

### Log Retention

No explicit log retention policy. Audit events in the DB have a 24-month retention (retention-cleanup.ts). Console logs have no retention configuration.

---

## 8. Observability

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| Health endpoint | `GET /api/health` — DB, pool, memory, WS count, circuit breakers | **Good** — comprehensive |
| Health logging | `system_health_log` table every 5 min | Good |
| Error tracking | `POST /api/errors/client` for frontend errors | Client-only; no server-side error tracking |
| **APM / traces** | **None** — no Sentry, Datadog, New Relic, etc. | **Gap** |
| Metrics | API request counter (`api-counter.ts`), but no metrics endpoint | Gap — no Prometheus/Grafana |
| Alerting | In-app alerts via `alert_engine.ts`; no external alerting (PagerDuty, OpsGenie) | **Gap** — no ops team notification |
| Uptime monitoring | None configured | Gap |
| Rate anomaly detection | `security-alerts.ts` — detects unusual API patterns | Good |

---

## 9. Backup and Disaster Recovery

**No backup configuration found anywhere in the repository.**

| Expected | Found |
|----------|-------|
| Database backup script | Not present |
| Automated DB snapshots (RDS/Replit) | Unknown — depends on infrastructure provider |
| Backup retention policy | Not documented |
| Restore procedure | Not documented |
| RPO/RTO targets | Not documented |
| File/upload backup | Not configured (S3 has versioning/lifecycle policies, but none configured here) |

The `.gitignore` excludes `*.sql`, `*_database_backup*`, `*.dump`, `*.pg_dump` — suggesting manual backups have been taken at some point, but no automation exists.

---

## 10. Secrets in Git History

### Confirmed Secrets in Git History

| Commit | File | Secret Type | Current Status |
|--------|------|-------------|---------------|
| `e523dfa` | `.replit` | `ENCRYPTION_KEY` (64-char hex) | **Still in repo** — line 54 |
| `280047f` | `.replit` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | **Still in repo** — lines 55-56 |
| `12fc00b` | `.auth/*.json` | Session cookies + CSRF tokens for owner/manager/kitchen | **Still in repo** (now gitignored after Phase 0 fix) |
| `3dd9105` | `server/seed.ts` | Password `"demo123"` for all seed users + kiosk tokens | **Still in code** — seed.ts:1639-1648 |

### Analysis

- The ENCRYPTION_KEY has been in every commit since `e523dfa`. Even if removed from HEAD, it's recoverable from git history. **The key must be considered fully compromised.**
- The VAPID_PRIVATE_KEY is similarly compromised since `280047f`.
- The `.auth/` session cookies have expiry timestamps around 2026-04-20. If the SESSION_SECRET hasn't changed since commit `12fc00b`, these cookies are still valid and can authenticate as owner/manager/kitchen roles.
- No evidence of `git filter-branch`, `BFG Repo-Cleaner`, or similar history-rewriting tools having been used. Secrets remain in full git history.

---

## 11. Patch Scripts

### Purpose

All four patch scripts are **source code modification tools** that add the modifier groups feature to the POS and menu modules. They are NOT runtime patches — they modify `.ts` and `.tsx` files on disk.

| Script | Purpose | Target Files |
|--------|---------|-------------|
| `patch_all.mjs` | Full modifier feature: endpoint paths, state vars, queries, UI tabs, dialog | `server/routers/modifiers.ts`, `client/src/pages/modules/menu.tsx` |
| `patch_fix_c4c7.mjs` | Targeted fix for C4+C7 of the above (modifier queries + tab trigger) | `client/src/pages/modules/menu.tsx` |
| `patch_pos.mjs` | POS modifier dialog: import, state, intercept addToCart, order mapping, KDS display | `client/src/pages/modules/pos.tsx`, `client/src/pages/dashboards/kitchen-board.tsx` |
| `patch_pos_modifiers.py` | Python duplicate of `patch_pos.mjs` (identical functionality) | Same files |

### Risk Assessment

- **Not dangerous at runtime** — they are developer tools, not live patches
- **Indicate workflow:** Code changes are applied by running scripts that do string replacement on source files, then building. This suggests a development workflow without proper branching/PRs.
- The Python variant (`patch_pos_modifiers.py`) is unusual — the entire codebase is TypeScript/JavaScript. It suggests the developer used different tools at different times.
- All patches use `string.replace()` / `replaceAll()` with literal text anchors — fragile and breaks if the target code changes.

---

## 12. Configuration Drift Risks

### Hardcoded Values That Should Be Env Vars

| Value | File:Line | Should Be |
|-------|----------|-----------|
| `"demo123"` default password | `users.ts:49` | Env var or REMOVED |
| DB pool max=20 | `db.ts:12` | Env var `DB_POOL_MAX` |
| Session TTL 30 days | `auth.ts:140,147` | Env var `SESSION_TTL_DAYS` |
| Idle timeout default 30 min | `auth.ts:248` | Configurable (already per-outlet) |
| Circuit breaker failure threshold | `circuit-breaker.ts` | Env var |
| KOT max retry attempts=3 | `printer-service.ts:172` | Env var |
| Heartbeat interval 30s | `realtime.ts:259` | Env var |
| Max concurrent sessions=5 | `auth.ts:249` (approx) | Env var |
| Rate limiter: 120/min API, 15/15min auth, 10/min upload | `security.ts` | Env vars (partially — `RATE_LIMIT_*` exist but only for API limiter) |

### Dev-Mode Flags That Could Leak

| Flag | File | Risk |
|------|------|------|
| `NODE_ENV !== "production"` | `index.ts:258-274` | Dev mode logs full response bodies including PII |
| `process.env.NODE_ENV === "test"` | `security.ts:91,128,152` | Test mode skips ALL rate limiting |
| `drizzle.config.ts` `strict: false` | `drizzle.config.ts:11` | Destructive schema changes without confirmation |
| `CSP_REPORT_ONLY=true` | `security.ts:60` | Disables CSP enforcement |

### Build Script Observations

`script/build.ts`: Uses esbuild to bundle server code. The allowlist at lines 7-33 includes packages that are NOT in `package.json` (e.g., `@google/generative-ai`, `axios`, `jsonwebtoken`, `nanoid`, `openai`, `uuid`, `xlsx`, `cors`). These are bundled if present but don't exist — esbuild ignores missing externals. This suggests either planned features or copy-paste from a template.
