# Phase 0 — Repository Map and Stack Identification

**Date:** 2026-04-15
**Branch:** audit/overnight-review
**Commit (HEAD):** d58ce4a

---

## 1. Directory Structure (2 levels deep)

| Directory | Purpose |
|---|---|
| `.agents/` | Replit AI agent configuration (asset metadata TOML) |
| `.auth/` | Stored browser session cookies for Playwright e2e test roles (owner, manager, kitchen) |
| `attached_assets/` | Pasted text snippets, screenshots, and a DOCX requirement doc used during development |
| `client/` | Frontend application root |
| `client/public/` | Static assets: favicon, manifest.json, service worker (sw.js), offline page, OG image |
| `client/src/` | React application source code |
| `client/src/components/` | UI components — organized by domain: admin, billing, cash, coordination, kds, layout, modifications, notifications, onboarding, packing, pos, resources, support, tickets, ui (shadcn/ui primitives) |
| `client/src/hooks/` | Custom React hooks — realtime, push notifications, idle timer, KOT dispatch, supervisor approval, etc. |
| `client/src/lib/` | Shared client utilities — auth context, API types, permissions, query client, sync manager, PDF export, sound player, etc. |
| `client/src/pages/` | Route-level page components, organized by role/module |
| `client/src/pages/admin/` | Super-admin pages: tenant management, analytics, audit log, security, breach incidents, vendor risks, support |
| `client/src/pages/dashboards/` | Role-specific dashboards: owner, manager, accountant, waiter, kitchen, KDS wall, delivery agent, service hub, wastage |
| `client/src/pages/modules/` | Feature module pages: POS, orders, menu, inventory, staff, reports, billing, CRM, delivery, procurement, cleaning, parking, GDPR, compliance, promotions, etc. |
| `client/src/pages/cash/` | Cash management page |
| `client/src/pages/kds/` | KDS coordinator page |
| `client/src/pages/menu/` | Menu pricing page |
| `client/src/pages/pos/` | POS bill-view page |
| `client/src/pages/procurement/` | Procurement sub-pages: purchase orders, quotations, returns, stock count, stock transfers, suppliers |
| `docs/` | Documentation |
| `docs/session-reports/` | Development session report PDFs |
| `script/` | Build script (build.ts) |
| `scripts/` | Operations scripts: create-super-admin, encrypt-existing-pii, post-merge hook, run-migrations, seed-stripe-plans |
| `server/` | Backend application root (Express + WebSocket) |
| `server/lib/` | Server library code: circuit breaker, recipe inventory deduction, menu cache, query logger, snapshot prep time |
| `server/middleware/` | Express middleware: check-restriction |
| `server/mock-feeds/` | Sample aggregator feed data: Swiggy, Uber Eats, Zomato |
| `server/routers/` | Express API routers — one per domain: auth, billing, orders, menu, kitchen, staff, tables, reservations, delivery, inventory, tips, cash, compliance, campaigns, franchise, kiosk, etc. (45+ routers) |
| `server/routes/` | Additional route files (kds-allergy-ack) |
| `server/services/` | Business-logic services: alert engine, cash calculator, chef assignment, cooking timer, coordination rules, email, ESC/POS builder, file storage, loyalty, packing charges, parking charges, photo upload, prep notifications, price resolution, printer, pub/sub, push sender, reservation reminders, SMS gateway, stock capacity, tip service, schedulers (daily report, stock report, wastage summary, advance order, trial warning), shift digest mailer, time aggregator/logger |
| `server/templates/` | Email template (email-base.ts) |
| `shared/` | Code shared between client and server: schema (Drizzle ORM), currency config, allergens, jurisdictions, permissions config, PIN utilities, units |
| `tests/` | Test suites |
| `tests/e2e/` | Playwright end-to-end tests and helpers |

---

## 2. Root Files

| File | Purpose |
|---|---|
| `.dockerignore` | Files excluded from Docker build context |
| `.env.example` | Template of all environment variables with placeholder values |
| `.gitignore` | Git ignore rules |
| `.replit` | Replit platform configuration: modules, ports, deployment target, env vars |
| `CLAUDE.md` | Audit instructions for this Claude Code session |
| `Dockerfile` | Multi-stage Docker build (Node 20 Alpine) |
| `LICENSE` | MIT license |
| `bun.lock` | Bun package manager lockfile |
| `components.json` | shadcn/ui configuration (New York style, Lucide icons) |
| `customer-requests-panel.png` | Screenshot (development reference) |
| `docker-compose.yml` | Local dev/prod compose: app + Postgres 16, optional Redis |
| `drizzle.config.ts` | Drizzle Kit config — schema at shared/schema.ts, PostgreSQL dialect |
| `live-requests-filters.png` | Screenshot (development reference) |
| `package-lock.json` | npm lockfile |
| `package.json` | Project manifest, dependencies, scripts |
| `patch_all.mjs` | Hotpatch script (JS) |
| `patch_fix_c4c7.mjs` | Targeted hotpatch script (JS) |
| `patch_pos.mjs` | POS-specific hotpatch script (JS) |
| `patch_pos_modifiers.py` | POS modifier hotpatch script (Python) |
| `playwright.config.ts` | Playwright e2e test configuration |
| `postcss.config.js` | PostCSS configuration (autoprefixer) |
| `replit.md` | Replit-generated project documentation |
| `tables-qr-codes-panel.png` | Screenshot (development reference) |
| `tsconfig.json` | TypeScript config — strict mode, ESNext, path aliases @/ and @shared/ |
| `vite-plugin-meta-images.ts` | Custom Vite plugin for meta/OG images |
| `vite.config.ts` | Vite config — React, Tailwind CSS v4, Replit plugins |
| `vitest.config.ts` | Vitest unit test configuration |

---

## 3. Stack Identification

| Layer | Technology |
|---|---|
| **Language** | TypeScript (strict mode), one Python hotpatch script |
| **Frontend framework** | React 19 with Vite 7 |
| **Routing (client)** | wouter 3.x |
| **UI components** | shadcn/ui (Radix primitives) + Tailwind CSS v4 + Lucide icons |
| **State / data fetching** | TanStack React Query 5 |
| **Forms** | react-hook-form + zod + @hookform/resolvers |
| **i18n** | i18next + react-i18next |
| **Animation** | framer-motion |
| **Backend framework** | Express 5 |
| **ORM** | Drizzle ORM 0.39 + drizzle-zod |
| **Database** | PostgreSQL 16 |
| **Session store** | express-session + connect-pg-simple (PG-backed) + memorystore (fallback) |
| **Cache / pub-sub** | ioredis (optional Redis via ElastiCache) |
| **WebSocket** | ws 8.x |
| **Auth** | Passport.js (passport-local strategy) |
| **Password hashing** | bcrypt 6 |
| **TOTP** | otpauth 9.x |
| **Payments** | Stripe 20 + Razorpay (custom integration at server/razorpay.ts) |
| **File upload** | multer 2 -> AWS S3 (@aws-sdk/client-s3, @aws-sdk/lib-storage) + sharp for image processing |
| **Email** | nodemailer 8 (SES SMTP) |
| **Push notifications** | web-push 3 (VAPID) |
| **Scheduled tasks** | node-cron 4 |
| **PDF generation** | jspdf + jspdf-autotable |
| **QR codes** | qrcode |
| **Rate limiting** | express-rate-limit + rate-limit-redis |
| **Security headers** | helmet 8 |
| **Schema validation** | zod 3 |
| **Encryption** | Custom (server/encryption.ts, server/encryption-rotation.ts) |
| **Package managers** | npm (lockfile present), Bun (bun.lock present) |
| **Bundler** | Vite 7 (dev + client build), esbuild (server build via script/build.ts) |
| **Test frameworks** | Vitest 4 (unit), Playwright 1.58 (e2e) |
| **Deployment** | Replit (primary, autoscale), Docker + Railway support, Dockerfile present |

---

## 4. Dependencies

### 4a. Full Dependency List (production)

Total: 99 production dependencies, 11 devDependencies, 1 optional.

#### Security-Sensitive Dependencies (flagged)

| Package | Category | Why Sensitive |
|---|---|---|
| `bcrypt` 6.0 | Auth / crypto | Password hashing — misconfiguration weakens all passwords |
| `passport` 0.7 + `passport-local` 1.0 | Auth | Authentication framework — core auth boundary |
| `express-session` 1.18 | Session | Session management — session fixation, cookie config |
| `connect-pg-simple` 10.0 | Session | Stores sessions in PostgreSQL |
| `memorystore` 1.6 | Session | In-memory session store — not suitable for production multi-instance |
| `otpauth` 9.5 | Auth / crypto | TOTP 2FA — implementation flaws break 2FA |
| `stripe` 20.0 | Payment | Stripe payment processing |
| `stripe-replit-sync` 1.0 | Payment | Replit-specific Stripe integration |
| `razorpay` (custom) | Payment | India payments (no npm package — custom server/razorpay.ts) |
| `multer` 2.1 | File upload | File upload handling — path traversal, file type bypass |
| `@aws-sdk/client-s3` + `lib-storage` 3.x | Storage | S3 file storage — bucket policy, key leaks |
| `web-push` 3.6 | Push notifications | VAPID keys — impersonation if leaked |
| `nodemailer` 8.0 | Email | SMTP credential handling |
| `ws` 8.18 | Real-time | Raw WebSocket — auth, origin validation, DoS |
| `ioredis` 5.10 | Cache / pub-sub | Redis access — if unauthed, data exposure |
| `helmet` 8.1 | Security | HTTP security headers — misconfiguration weakens all responses |
| `express-rate-limit` 8.3 + `rate-limit-redis` 4.2 | Security | Rate limiting — bypass = brute force possible |
| `sharp` 0.34 | Image processing | Native binary — historically has had CVEs, processes untrusted input |
| `zod` 3.25 | Validation | Schema validation — bypasses lead to injection |
| `input-otp` 1.4 | Auth (client) | OTP input component |

#### Non-Security Dependencies (abbreviated by category)

- **UI/Radix:** 27 @radix-ui/* packages (accordion through tooltip)
- **Styling:** tailwindcss, tailwind-merge, tailwindcss-animate, tw-animate-css, class-variance-authority, clsx, autoprefixer, postcss
- **Data/Charts:** recharts, @tanstack/react-query, @tanstack/react-virtual
- **Forms:** react-hook-form, @hookform/resolvers
- **i18n:** i18next, react-i18next, i18next-browser-languagedetector, i18next-http-backend
- **PDF/QR:** jspdf, jspdf-autotable, jszip, qrcode
- **Animation:** framer-motion, embla-carousel-react
- **Date:** date-fns
- **Router:** wouter
- **Theme:** next-themes
- **UI misc:** cmdk, vaul, sonner, lucide-react, react-day-picker, react-resizable-panels
- **Build:** vite, @vitejs/plugin-react, @tailwindcss/vite, esbuild, tsx, typescript
- **Replit:** @replit/vite-plugin-runtime-error-modal, @replit/vite-plugin-cartographer (dev), @replit/vite-plugin-dev-banner (dev)
- **Compression:** compression
- **Cron:** node-cron
- **Drizzle:** drizzle-orm, drizzle-zod, drizzle-kit (dev)
- **Type defs (dev):** @types/bcrypt, @types/compression, @types/connect-pg-simple, @types/express, @types/express-session, @types/ioredis, @types/jszip, @types/multer, @types/node, @types/nodemailer, @types/passport, @types/passport-local, @types/qrcode, @types/react, @types/react-dom, @types/web-push, @types/ws
- **Optional:** bufferutil (WebSocket performance)

---

## 5. Environment Variables (.env.example)

| Variable | Category |
|---|---|
| `NODE_ENV` | Application |
| `PORT` | Application |
| `APP_URL` | Application |
| `SESSION_SECRET` | Auth / session |
| `JWT_SECRET` | Auth / session |
| `JWT_EXPIRES_IN` | Auth / session |
| `DATABASE_URL` | Database |
| `AWS_REGION` | Storage |
| `AWS_ACCESS_KEY_ID` | Storage (credential) |
| `AWS_SECRET_ACCESS_KEY` | Storage (credential) |
| `AWS_S3_BUCKET` | Storage |
| `AWS_S3_URL` | Storage |
| `REDIS_URL` | Cache / pub-sub |
| `STRIPE_SECRET_KEY` | Payment gateway (credential) |
| `STRIPE_PUBLISHABLE_KEY` | Payment gateway |
| `STRIPE_WEBHOOK_SECRET` | Payment gateway (credential) |
| `RAZORPAY_KEY_ID` | Payment gateway (credential) |
| `RAZORPAY_KEY_SECRET` | Payment gateway (credential) |
| `RAZORPAY_WEBHOOK_SECRET` | Payment gateway (credential) |
| `SMTP_HOST` | Email |
| `SMTP_PORT` | Email |
| `SMTP_USER` | Email (credential) |
| `SMTP_PASS` | Email (credential) |
| `SMTP_FROM` | Email |
| `TWILIO_ACCOUNT_SID` | SMS / WhatsApp (credential) |
| `TWILIO_AUTH_TOKEN` | SMS / WhatsApp (credential) |
| `TWILIO_PHONE_NUMBER` | SMS / WhatsApp |
| `TWILIO_WHATSAPP_NUMBER` | SMS / WhatsApp |
| `GOOGLE_CLIENT_ID` | OAuth (credential) |
| `GOOGLE_CLIENT_SECRET` | OAuth (credential) |
| `GOOGLE_MAPS_API_KEY` | API key |
| `VAPID_PUBLIC_KEY` | Push notifications (credential) |
| `VAPID_PRIVATE_KEY` | Push notifications (credential) |
| `VAPID_EMAIL` | Push notifications |
| `CLOUDINARY_CLOUD_NAME` | Storage (alternative) |
| `CLOUDINARY_API_KEY` | Storage (credential) |
| `CLOUDINARY_API_SECRET` | Storage (credential) |
| `OPENAI_API_KEY` | API key (AI features) |
| `RATE_LIMIT_WINDOW_MS` | Security |
| `RATE_LIMIT_MAX_REQUESTS` | Security |
| `BCRYPT_ROUNDS` | Auth / crypto |
| `CORS_ORIGIN` | Security |
| `DEFAULT_TENANT_ID` | Multi-tenant |
| `MAX_LOCATIONS_PER_TENANT` | Multi-tenant |

**Additional variables found in .replit [userenv.shared] (committed to repo):**

| Variable | Category | Note |
|---|---|---|
| `ENCRYPTION_KEY` | Crypto (credential) | **Hardcoded real value in .replit — NOT in .env.example** |
| `VAPID_PUBLIC_KEY` | Push (credential) | **Hardcoded real value in .replit** |
| `VAPID_PRIVATE_KEY` | Push (credential) | **Hardcoded real value in .replit** |
| `VAPID_SUBJECT` | Push | **Hardcoded in .replit** |

---

## 6. Docker Configuration

### Dockerfile
- **Multi-stage build:** builder (Node 20 Alpine) -> runner (Node 20 Alpine)
- **Build:** `npm ci` -> `npm run build` -> copies `dist/` to runner
- **Runtime:** Creates non-root user (`appuser:appgroup`), runs as that user
- **Port:** Exposes 5000
- **Health check:** `wget http://localhost:5000/api/health` every 30s
- **Volumes:** Creates `uploads/` directory, owned by appuser

### docker-compose.yml
- **Services:**
  - `app` — the application, port 5000, depends on `db`
  - `db` — PostgreSQL 16 Alpine, port 5432, `pgdata` volume
  - `redis` — commented out, Redis 7 Alpine on port 6379
- **Volumes:** `pgdata` (persistent DB), `uploads` (file uploads)
- **Concerns noted for Phase 0:**
  - DB credentials hardcoded as `postgres:postgres` in compose DATABASE_URL
  - Redis service commented out — multi-instance WebSocket pub/sub won't work without it

---

## 7. CI/CD and Tooling

| Item | Present? | Notes |
|---|---|---|
| `.github/workflows/` | **No** | No GitHub Actions CI/CD |
| `.gitlab-ci.yml` | **No** | No GitLab CI |
| `railway.json` / `railway.toml` | **No** | No Railway config file (though CLAUDE.md says deployed on Railway) |
| Terraform / Pulumi / IaC | **No** | No infrastructure-as-code |
| ESLint | **No** | No .eslintrc or eslint.config |
| Prettier | **No** | No .prettierrc |
| Husky / lint-staged | **No** | No pre-commit hooks |
| `.replit` | **Yes** | Replit platform config with deployment target "autoscale" |
| `components.json` | **Yes** | shadcn/ui config |
| `postcss.config.js` | **Yes** | PostCSS with autoprefixer |
| `tsconfig.json` | **Yes** | TypeScript strict mode |
| `drizzle.config.ts` | **Yes** | Drizzle Kit for DB schema push |
| `scripts/post-merge.sh` | **Yes** | Post-merge git hook (referenced in .replit) |

**Summary:** No CI/CD pipeline, no linting, no pre-commit hooks, no infrastructure-as-code. Deployment appears to be through Replit's built-in deployment with autoscale target.

---

## 8. Tests

### tests/unit.test.ts
- Single unit test file at root of tests/

### tests/e2e/ (Playwright)
| File | Domain |
|---|---|
| `global-setup.ts` | Global test setup |
| `helpers/auth.helper.ts` | Authentication helper for tests |
| `helpers/test-data.ts` | Test data fixtures |
| `auth.spec.ts` | Authentication flows |
| `billing.spec.ts` | Billing/subscription |
| `kitchen.spec.ts` | Kitchen display system |
| `menu.spec.ts` | Menu management |
| `order-management.spec.ts` | Order lifecycle |
| `pos-checkout.spec.ts` | POS checkout flow |
| `staff.spec.ts` | Staff management |
| `support.spec.ts` | Support system |

**Summary:** 1 unit test file + 8 e2e spec files covering core flows. No integration tests. No API-level tests. Coverage appears thin for a codebase of this size (100+ pages, 45+ routers, 30+ services).

---

## 9. Surprising / Potentially Concerning Observations

These are flagged for future phase analysis. No judgment is rendered here — just inventory.

### 9a. Secrets committed to repository

- **`.replit` lines 54-57:** Contains `[userenv.shared]` section with what appear to be real cryptographic secrets: an `ENCRYPTION_KEY` (64-char hex), `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY`. These are in the git history.
- **`.auth/` directory:** Contains three JSON files (`owner.json`, `manager.json`, `kitchen.json`) with signed `connect.sid` session cookies and CSRF tokens. These are Playwright auth state files but contain real signed session tokens. The `.auth/` directory is **not in `.gitignore`** — it is committed to the repository.
- **`.gitignore` line 8:** The pattern `*.cookies.txt.auth/` does NOT match the `.auth/` directory. This appears to be a malformed gitignore entry — likely intended to ignore `.auth/` but concatenated with the `cookies.txt` pattern on the previous line.

### 9b. No CI/CD pipeline

No automated testing, linting, or security scanning in any CI system. For a multi-tenant SaaS handling payments, this is notable.

### 9c. No linting or formatting enforcement

No ESLint, Prettier, or pre-commit hooks. Code style is not enforced.

### 9d. Dual lockfiles

Both `package-lock.json` (npm) and `bun.lock` (Bun) exist. Dockerfile uses `npm ci`. Unclear which is canonical.

### 9e. Hotpatch scripts at repo root

Four patch files (`patch_all.mjs`, `patch_fix_c4c7.mjs`, `patch_pos.mjs`, `patch_pos_modifiers.py`) suggest live-patching of production without going through a normal deploy. Python script among an otherwise TypeScript codebase.

### 9f. Express 5.0.1

Express 5 is relatively new. Middleware and error-handling behavior differs from Express 4. Worth verifying all middleware is compatible.

### 9g. `drizzle.config.ts` strict: false

Drizzle Kit runs with `strict: false`, which suppresses confirmation prompts for destructive schema changes.

### 9h. Large surface area

45+ routers, 30+ services, 100+ page components, 16 hooks, 16 lib files. Significant attack surface for a security audit.

### 9i. memorystore in dependencies

`memorystore` is listed as a production dependency alongside `connect-pg-simple`. If memorystore is used as the session store in production with multiple instances, sessions won't be shared and could lead to auth bypass via session confusion.

### 9j. `ENCRYPTION_KEY` not in .env.example

The `ENCRYPTION_KEY` variable (used by `server/encryption.ts`) is not documented in `.env.example` but is set in `.replit`. This suggests it was added ad-hoc and may not be properly managed across environments.

---

## Appendix: File Counts

| Directory | File Count |
|---|---|
| `server/routers/` | 45 files |
| `server/services/` | 33 files |
| `server/` (root-level .ts files) | 19 files |
| `server/lib/` | 5 files |
| `client/src/pages/` | ~105 files |
| `client/src/components/` | ~100+ files (incl. ~50 ui primitives) |
| `client/src/hooks/` | 16 files |
| `client/src/lib/` | 16 files |
| `shared/` | 7 files |
| `tests/` | 11 files |
| `scripts/` | 5 files |
