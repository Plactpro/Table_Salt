# Incident: Railway Pro plan upgrade caused unexpected service-stop, 2026-04-30

**Date:** 2026-04-30, ~midday UAE time
**Duration:** ~30 minutes
**Severity:** Brief production outage during dogfooding window (zero paying tenants at time of incident)
**Resolution:** "Deploy database" + Table_Salt redeploy. Volume intact, no data loss.

## What happened

Railway plan upgrade from Hobby to Pro triggered a service-stop on both the Postgres instance and the Table_Salt application service. Both remained stopped until manually redeployed.

## Symptom

Both services unreachable for ~30 minutes; production traffic 5xx during the window. Persistent volume unaffected.

## Root cause

Railway plan upgrades do not preserve service state across the upgrade transaction. Both database and application services entered a stopped state and required explicit redeploy to resume. This behavior is not surfaced in Railway's plan-upgrade UX at the time of the operation.

## Recovery

1. "Deploy database" via Railway dashboard — Postgres came back, volume mounted, schema/rows verified via TablePlus spot-check.
2. Table_Salt redeploy via Railway dashboard — application healthy, `/api/health` returned 200.

## Lessons

1. **Plan upgrades are NOT zero-downtime.** Treat as planned-maintenance: schedule outside business hours, verify each service comes back individually before declaring done.
2. **First action after any upgrade: verify both database AND application are running** — the dashboard does not surface the stopped state prominently.
3. **Backup capability now available** post-upgrade. First manual snapshot taken 2026-04-30 07:00 UTC, incremental size 149 MB. Scheduled/automated snapshots still not configured (separate backlog item).
4. **Volume persistence held.** No data loss across the stop. Confirms volumes are decoupled from compute lifecycle in Railway's architecture.
