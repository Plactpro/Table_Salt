# F-254 Phase 1 — Static Investigation of Production 429 Rate-Limit Storm

**Date:** 2026-05-06
**Branch:** fix/F-254-phase1-investigation off main `ee5ce45`
**Scope:** Static reading of both server-side rate limiter config and client-side query/polling/WS code for the 7 endpoints flagged in the 2026-05-05 tester report. NO code edits, NO production network access, NO npm install / dev server. Output is hypothesis generation, not fix design.

---

## TL;DR

Three findings stand out from static reading, each capable of explaining production 429s on its own:

1. The rate limiter is keyed by IP, not by user, in practice. The keyGenerator at `server/security.ts:142-146` declares `user-${user.id}` if `req.user` is set, falling back to IP. But the limiter is mounted at `server/index.ts:39` BEFORE setupAuth runs (called from registerRoutes at `server/index.ts:568`). At keyGenerator time, `req.user` is undefined. Every request is keyed by IP. Multiple users behind one office NAT share a single 120-req/min budget.

2. Two unconditional always-on pollers consume ~10 req/min just for connectivity and impersonation. `client/src/lib/sync-manager.ts:159` polls `/api/health` every 15s (4 req/min). `client/src/lib/impersonation-context.tsx:56-67` polls `/api/admin/impersonation/status` every 10s with `staleTime: 0` (6 req/min). The impersonation poller is in a context provider that wraps the entire app, firing for every logged-in user.

3. The 120 req/min limit is tight for a real session. Header + sidebar + sync-manager combine for ~20 req/min baseline before any page-specific work. Pages like kitchen.tsx and parking.tsx add 5-10+ pollers on top. One tab can plausibly hit the limit; two tabs guarantee breach.

Static reading cannot prove causality. Phase 2 needs production network captures to rank these.

---
