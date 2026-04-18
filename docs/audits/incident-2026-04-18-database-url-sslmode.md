# Incident: DATABASE_URL sslmode=require outage

**Date:** 2026-04-18, ~00:00 to ~10:00 IST
**Severity:** Full production outage (zero paying tenants at time of incident — impact limited to dogfooding)
**Resolution time:** ~10 hours after initial crash, ~45 minutes after active engagement

## Timeline

- **2026-04-17 evening:** Yesterday's session tested `?sslmode=require` on DATABASE_URL (Path B of A-01 investigation). Test failed with SSL error. Rollback clicked in Railway.
- **2026-04-17 23:16 IST:** A-04 (tsconfig split) merge triggered a Railway rebuild. Build pulled pg 8.17.1 (up from 8.16.3). Container entered migration phase, hit `SELF_SIGNED_CERT_IN_CHAIN`, crash-looped.
- **2026-04-18 09:15 IST:** Incident detected.
- **2026-04-18 09:30 IST:** F-223 shipped (`Pool ssl: { rejectUnauthorized: false }`). No-op — connection-string sslmode overrides Pool ssl options.
- **2026-04-18 09:58 IST:** Railway DATABASE_URL suffix stripped in Variables tab. Service restored in ~30 seconds.

## Root cause

Two independent faults combined:

1. **Railway rollback restored code and image but NOT environment variables.** `?sslmode=require` remained on DATABASE_URL despite the rollback.
2. **pg 8.17 (released Oct 2025) treats sslmode=require/prefer/verify-ca as aliases for verify-full.** Railway's internal Postgres presents a self-signed cert. Under pg 8.16, sslmode=require was permissive; under 8.17, it rejects. The suffix was latent for ~18 hours until A-04's merge caused Railway to rebuild with a newer lockfile resolution.

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
3. **Dependency minor-version bumps on managed platforms can surface latent config issues hours or days after the config change was made.** The failure happens at the next rebuild, not at the config-change time.
