# F-225 Day 4 Recon Summary

**Date:** 2026-04-20
**Branch:** fix/F-225-tenant-tz-helper at 979e5f1
**Status:** Recon complete. Audit SQL written. Migration not yet written.

## Goal

Convert three columns from PostgreSQL `timestamp` (no time zone) to `timestamptz` (with time zone):
- `reservations.date_time`
- `events.start_date`
- `events.end_date`

## Why this matters

`timestamp` stores wall-clock values without timezone context. A tenant in Dubai booking a reservation for "19:00" stores literally `19:00` with no context. A server process running in UTC interprets that as `19:00 UTC`, which is `23:00` Dubai time — silent drift. `timestamptz` fixes this by storing an absolute UTC instant and converting on read.

Pre-launch, this is a real bug waiting to happen as multi-timezone tenants onboard.

## Current schema (from shared/schema.ts)

Three columns:
- reservations.date_time — timestamp("date_time").notNull()
- events.start_date — timestamp("start_date").notNull()
- events.end_date — timestamp("end_date").notNull()

All three are plain timestamp, no withTimezone: true. Comparable columns elsewhere in the schema (e.g., trialEndsAt) use withTimezone: true — so the distinction is intentional, just outdated for these three.

## What F-225 already fixed (big win)

Prior commits on this branch neutralized the write paths:
- 6b8f305: shared/lib/tenant-tz.ts helper module (wallClockToUtc, formatInTenantTz, tenantDateKey, tenantNow)
- 15448b8: extended helper (time-only style, localDateToKey)
- fc1f8b4: wired tables.tsx — reservations.date_time all client call sites fully wrapped
- 11dc799: wired events.tsx — events.start_date / events.end_date submit path wrapped
- ae08340: escpos-builder / printer-service use tenant TZ for receipt timestamps
- 979e5f1: Dockerfile sets container TZ=UTC explicitly

Net result: all 6 server writer files (server/routers/reservations.ts, server/routers/events.ts, server/storage.ts, server/seed.ts, client/src/pages/modules/tables.tsx, client/src/pages/modules/events.tsx) now wrap values in `new Date(...)` which serializes to ISO-with-Z. Under either column type (timestamp or timestamptz), the stored bytes are identical.

Writers are migration-neutral. No writer breaks.

## Reader risk

12 distinct files read these three columns. Of those:
- 3 already use tenant-tz helpers (tables.tsx, events.tsx, escpos-builder.ts) — resilient
- 9 still use naive new Date(...) for display — pre-existing bugs (filed as F-226/F-227/F-228), independent of this migration. Migration doesn't fix or break them.

Semantics-shifting readers: only three raw-SQL BETWEEN NOW() + INTERVAL ... queries (in reservation-reminders.ts and resource-service.ts). Under timestamp, Postgres coerces both sides using the session TZ. With session TZ pinned to UTC (via 979e5f1), those readers already produce the same result they will under timestamptz. Migration locks in that safety.

## The one real hazard: pre-F-225 production data

Rows written BEFORE F-225 commits fc1f8b4 / 11dc799 (landed ~2026-04-18) likely have tenant-local wall-clock values stored as-if-UTC (the classic naive mistake). Rows written AFTER F-225 store the correct UTC instant.

Both cohorts are stored as timestamp bytes. From the DB alone, we cannot tell which cohort a row belongs to.

If we flip the column to timestamptz without addressing this:
- Old bad rows remain bad — they just get a shinier type label
- Type flip itself is safe (stored bytes unchanged)
- Latent bug persists until we also do a data-fix UPDATE

## Audit strategy

Read-only SQL script at D:\audits\Table_Salt\audit\f225-day4-audit.sql. Gitignored (per *.sql rule from audit item A-02). Safe against production — wrapped in BEGIN; SET LOCAL default_transaction_read_only = on; ROLLBACK;.

Strategy per column:

reservations.date_time — no created_at column exists on reservations, so cohort split is impossible. Falls back to:
- Full-population aggregates (total rows, live rows, min/max)
- Per-tenant breakdown with apparent_tz_offset_hours = EXTRACT(EPOCH FROM (MIN(date_time) AT TIME ZONE 'UTC') - (MIN(date_time) AT TIME ZONE tenant.timezone)) / 3600 (an invariant equal to tenant UTC offset; useful as sanity readout not cohort signal)
- Hour-of-day histogram (the actual diagnostic): compare HOUR(date_time) (raw UTC) vs HOUR(date_time AT TIME ZONE tenant.timezone) (tenant-local)
- 20-row sample for human eyeballing of non-UTC tenants

Interpretation: if correctly-stored rows should cluster in dinner hours (18-22) tenant-local, and historical data instead clusters in those hours raw UTC, those rows were written tenant-local-as-UTC and need correction.

events.start_date / events.end_date — events HAS created_at, so cohort split works cleanly:
- Cutoff: created_at < '2026-04-18 00:00:00' → pre-F-225, else post-F-225
- Per-tenant breakdown + hour-of-day histogram split by cohort
- 20-row sample of pre-F-225 + non-UTC-tenant rows
- Note: end_date often at 23:59 for all_day events (documented design — don't flag as bug)

## Decision gates after running the audit

If audit shows zero bad rows (test data only, all tenants UTC, no pre-F-225 non-UTC activity):
→ Simple migration. Just ALTER TABLE ... ALTER COLUMN ... TYPE timestamptz. ~10 lines SQL.

If audit shows handful of bad rows (only Arun's own testing, 1-2 tenants affected):
→ Type flip + targeted UPDATE to fix those specific rows, in same migration.

If audit shows many bad rows across multiple tenants:
→ Pause. Decide whether to fix or accept the drift. Bulk UPDATE possible but needs per-tenant treatment.

## Data-fix approach (if needed)

For a row written tenant-local-as-UTC in Dubai timezone at 19:00 local:
- Stored as: 2026-04-10 19:00:00 (should have been 15:00 UTC)
- Fix: UPDATE reservations SET date_time = date_time AT TIME ZONE tenant.timezone AT TIME ZONE 'UTC' WHERE ...
- Joins reservations → tenants to get each row's declared timezone
- Must be done BEFORE the type flip (or in same migration before the ALTER)

## Rollout order (TBD based on audit results)

1. Run audit → quantify bad-row cohort
2. Write migration file (Drizzle format) — schema change + optional data-fix UPDATE
3. Write rollback plan
4. Backup production DB
5. Apply migration in same transaction
6. Force Railway redeploy (connection pool flush — standing rule after DATABASE_URL/schema changes)
7. Verify via a lightweight post-migration sanity query

## Files touched by this migration (blast radius)

Writers (6 files, all already resilient post-F-225):
1. server/routers/reservations.ts
2. server/routers/events.ts
3. server/storage.ts
4. server/seed.ts
5. client/src/pages/modules/tables.tsx
6. client/src/pages/modules/events.tsx

Readers (10 files, 4 overlap with writers):
1. server/storage.ts (overlap)
2. server/services/reservation-reminders.ts
3. server/services/resource-service.ts
4. server/routers/tables.ts
5. server/routers/compliance.ts
6. server/routers/events.ts (overlap, pass-through)
7. client/src/pages/modules/tables.tsx (overlap)
8. client/src/pages/modules/events.tsx (overlap)
9. client/src/pages/modules/offers.tsx
10. client/src/pages/modules/procurement.tsx
11. client/src/pages/modules/staff.tsx
12. client/src/components/resources/ResourceAvailabilityWidget.tsx

Distinct total: 12 files. 3 already TZ-aware. 9 still naive (F-226/F-227/F-228 territory, pre-existing bugs, not this migration's concern).

## References

- Full session notes: docs/audits/session-handoff-2026-04-20.md
- Bug inventory: docs/audits/bug-inventory.md
- F-226/F-227/F-228 followups: F-229-through-F-233-escpos-tz-followups.md at repo root (untracked)
- Audit SQL (not in repo): D:\audits\Table_Salt\audit\f225-day4-audit.sql
