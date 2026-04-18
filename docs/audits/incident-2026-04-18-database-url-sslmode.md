# Incident: DATABASE_URL sslmode=require outage

**Date:** 2026-04-18, ~00:00 to ~10:00 IST
**Severity:** Full production outage (zero paying tenants at time of incident — impact limited to dogfooding)
**Resolution time:** ~10 hours after initial crash, ~45 minutes after active engagement

## Timeline

- **2026-04-17 evening:** Yesterday's session tested `?sslmode=require` on DATABASE_URL (Path B of A-01 investigation). Test failed with SSL error. Rollback clicked in Railway.
- **2026-04-17 23:16 IST:** A-04 (tsconfig split) merge triggered a fresh Railway deploy. New container attempted fresh Postgres connections under the suffixed DATABASE_URL, hit `SELF_SIGNED_CERT_IN_CHAIN`, crash-looped.
- **2026-04-18 09:15 IST:** Incident detected.
- **2026-04-18 09:30 IST:** F-223 shipped (`Pool ssl: { rejectUnauthorized: false }`). No-op — connection-string sslmode overrides Pool ssl options.
- **2026-04-18 09:58 IST:** Railway DATABASE_URL suffix stripped in Variables tab. Service restored in ~30 seconds.

## Root cause

Three faults combined:

1. **Yesterday's Path B test appended `?sslmode=require` to Railway's DATABASE_URL variable.** The test deploy crashed. The rollback click restored code and the deployment image but NOT the environment variable. The suffix remained in place after rollback.
2. **The running container (from before Path B) maintained an open pg connection pool that didn't renegotiate SSL on each query** — long-lived connections reused the handshake from their initial establishment. The broken DATABASE_URL therefore had no effect on the already-running container, which served traffic normally for ~18 hours.
3. **This morning's A-04 merge triggered a fresh Railway deploy**, which required a fresh container with fresh Postgres connections. Those new connections had to handshake under the current (suffixed) DATABASE_URL, which invoked cert validation, which rejected Railway's self-signed cert with `SELF_SIGNED_CERT_IN_CHAIN`. Crash loop ensued.

Note: Railway builds use the Dockerfile with `npm ci`, so pg version is pinned by `package-lock.json` — there was no dependency drift at build time. The pg version (8.16.3 per lockfile) was the same before and after. The issue was purely the `?sslmode=require` suffix on the connection string.

## Why the code-side fix (F-223) failed

Connection-string sslmode overrides Pool ssl options in node-postgres (upstream issue [#3355](https://github.com/brianc/node-postgres/issues/3355)). The explicit `ssl: { rejectUnauthorized: false }` was never reached because pg-connection-string parses sslmode from the URL before Pool options are applied.

## What fixed it

Removed `?sslmode=require` suffix from DATABASE_URL in Railway's Variables tab. No code change was needed.

## Guardrails now in place

- `server/db.ts` has a prominent comment block warning against re-adding sslmode to DATABASE_URL
- This incident note for future searches (`docs/audits/incident-2026-04-18-database-url-sslmode.md`)
- A-01's compose file already uses `sslmode=disable` for local Docker (unaffected by this incident)

## Lessons for future Railway work

1. **Railway rollback does NOT restore environment variables.** After any rollback, independently verify the Variables tab matches expected state.
2. **A DATABASE_URL query-string sslmode cannot be overridden by `pg.Pool({ ssl })` config.** Only string manipulation before Pool construction can override it, or removing the sslmode from the URL entirely.
3. **Long-lived pg connection pools can mask environment variable errors for hours** until the next container restart. After any change to DATABASE_URL (or any env var that affects DB connections), force a Railway redeploy immediately to flush connections and surface problems.
4. **Railway builder is now pinned to Dockerfile via `railway.toml`.** This ensures `npm ci` is used (deterministic installs from lockfile), preventing dependency drift at build time.
