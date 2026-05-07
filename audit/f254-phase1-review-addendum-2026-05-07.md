# F-254 Phase 1 — Review Addendum

**Date:** 2026-05-07
**Reviewed by:** External static read of `f254-phase1-static-investigation-2026-05-06.md`, with independent verification against source code.
**Purpose:** Corrections, framing fixes, and additions to the Phase 1 doc before Phase 2 begins. Confirmed against source. Does not alter hypothesis ranking. Phase 2 sequencing preserved as observation-only per CLAUDE.md phase discipline.

---

## Errors in the Original Document

### E-1 — uploadLimiter has the same ordering bug as apiLimiter (not documented)

The table in "Rate limiter location and config" notes that `uploadLimiter` keys by `upload-${user.id}` if authenticated, else IP. Independent verification against source confirms this is incorrect in practice.

`uploadLimiter` is mounted at `server/security.ts:173` (`app.use("/api/upload", uploadLimiter)`), which runs inside `setupSecurity()` — invoked from `server/index.ts:39`, before `setupAuth` at `server/routes.ts:97`. The keyGenerator at `security.ts:165-169` reads `req.user`, which is undefined at limiter time for exactly the same reason as apiLimiter. The doc's table at line 35 reads "Keyed by: `upload-${user.id}` if set, else IP" with no ordering-bug flag, while the apiLimiter row immediately above is annotated with "(see ordering bug below)".

This is a factual error in the original document.

**Action:** when implementing the H-1 fix, the middleware swap fixes BOTH `apiLimiter` and `uploadLimiter` simultaneously. No separate fix needed for uploadLimiter — it inherits the correction.

---

### E-2 — H-5 confirmation step requires a header that does not exist

The H-5 "Confirms in production" section at line 213-214 says:

> Two requests to the same endpoint from the same browser session land on different processes (visible via `X-Process-Id` if logged)

`X-Process-Id` is not a header emitted by the server today (verified by repo-wide grep — the only hit is inside the audit doc itself). The hedge "if logged" partially preserves the doc, but the practical effect is that no observation-only path to verify multi-process dilution exists today.

**Correction:** replace "if logged" with explicit framing — *"this requires either a startup-log inspection (Q-F254-1) or a one-line server change to emit X-Process-Id"*. H-5 can also be confirmed without that header:

- Check Railway env vars for `REDIS_URL` (Q-F254-1 already covers this).
- Check application startup logs for `[rate-limit] Using Redis store for rate limiters` vs the fallback warning.
- If two consecutive requests show `RateLimit-Remaining` values that do not decrement by exactly 1 (for example request 1 shows 95 and request 2 shows 102, or both show 95), processes are not sharing state. Observable from DevTools without code change.

---

### E-3 — Stale "AWS ALB" code comment at server/index.ts:138 (NEW FINDING)

While verifying F-2, I confirmed the AWS ALB reference in the original doc traces back to a stale code comment at `server/index.ts:138`:

> `// used by AWS ALB target group health checks and super admin dashboard`

This comment is misleading documentation. The production stack is Railway, not AWS. The comment likely predates the migration to Railway (per CLAUDE.md product information). The original Phase 1 doc faithfully echoed the comment without flagging its staleness.

**Action:** When the F-254a fix branch is opened, also update or remove this comment in the same PR. Cost: one-line documentation correction. Risk: zero — comment-only change.

---

## Framing Weaknesses

### F-1 — In-memory fallback paragraph is imprecisely framed (not technically contradictory)

The "Server-side anomalies" section at line 86 says:

> with multiple Node processes, one user's requests are distributed across processes and effective limit is `processCount × 120` per minute. Conversely, if all traffic happens to land on one process, behaviour is consistent but observed limit may differ from expected.

The reviewer paraphrased this as "looser" vs "tighter or inconsistent" and called it contradictory. On closer reading, the doc never literally says "tighter" — the second case is "consistent but limit may differ from expected", which is closer to "matches design intent but inconsistent across users". So this is **imprecise framing**, not contradiction.

The prose is muddled: "Conversely" implies opposition, but both cases describe the same root anomaly (in-memory counters per process), differentiated only by traffic-distribution assumptions. Honest replacement framing:

> If Redis is unavailable and Node runs multiple processes, each process maintains an independent counter. The same root anomaly produces two observable outcomes depending on traffic distribution: (a) traffic distributed across processes makes the effective per-IP budget appear larger than 120/min, (b) traffic sticky to one process makes the budget appear correctly capped at 120/min for that user but inconsistent across users on the same IP. Either outcome differs from design intent, which is a single shared budget enforced uniformly.

---

### F-2 — AWS ALB reference traces to stale source comment (see E-3)

Q-F254-6 asks about "AWS ALB health-check rate against `/api/health`". The reviewer flagged this as architecturally unanchored to the Railway stack.

The doc was not inventing the AWS ALB reference — it was faithfully echoing a stale code comment (now logged as E-3). The underlying question (external probe contribution to the IP-keyed budget) remains valid for any production environment.

**Reframe Q-F254-6 as:**

> Q-F254-6 (revised): Does Railway's platform health-probe rate against `/api/health`, OR any external uptime monitor (Pingdom, UptimeRobot, etc.), contribute to the IP-keyed budget? If the probe source IP is shared with tenant traffic ranges, contributions stack. Worth confirming the probe source IP range and whether it lands in a separate IP bucket or could affect tenant budgets.

---

## Undersold Findings (Severity/Context Additions)

### U-1 — `/api/health` whitelist as candidate post-fix polish (not parallel observation step)

The reviewer initially proposed whitelisting `/api/health` from `apiLimiter` as a "zero-downside parallel action" during Phase 2. Two issues with that framing:

1. **It is a code change.** Phase 2 in the original doc is observation-only. Inserting a fix into Phase 2 violates CLAUDE.md's phase discipline (one fix per branch, explicit approval).
2. **It is not zero-downside.** Whitelisting removes the cap entirely. An attacker on the IP-keyed budget could flood `/api/health` to exercise the DB pool (`pool.query("SELECT 1")` at `server/index.ts:147` plus tenant count query at `:159`). The 5-second cache at `index.ts:141-143` blunts most of this, but per-request cost remains. So "zero-downside" overstates it.

**Reframed recommendation:** treat the `/api/health` whitelist as a **candidate post-fix polish**, evaluated AFTER Phase 2 captures and AFTER the H-1 fix. Once H-1 is fixed, the per-USER 120 budget makes the 4 req/min health poll trivial — the whitelist may become unnecessary. If captures still show /api/health 429s after the H-1 fix, then introduce it as a one-line `skip` in apiLimiter config.

---

### U-2 — Impersonation poller is wasteful in normal operation, independent of 429s

Confirmed at `client/src/lib/impersonation-context.tsx:50-67`. ImpersonationProvider wraps the entire app, the query has no `enabled` gate, runs every 10s with `staleTime: 0`, `refetchOnWindowFocus: "always"`. A cashier, kitchen staff, or guest-facing role gets the same 6 req/min cost as a super-admin running an actual support session.

The original doc captures this at line 100 ("fires for every logged-in user, not just admins") but only frames it as a 429 contributor. Even if 429s vanished tomorrow, this remains wasted DB/network work for ~95%+ of sessions where impersonation is impossible by role.

**Recommendation:** gate `enabled: user?.role === "super_admin"` on the impersonation query. Independent of which F-254 hypothesis confirms. Worth its own commit, can be paired with the H-1 fix or done separately.

---

### U-3 — `staleTime: 0` + `refetchOnWindowFocus: "always"` will amplify Phase 2 capture counts

Confirmed at `impersonation-context.tsx:66`: `refetchOnWindowFocus: "always"`. Testers in Phase 2 will be flipping between DevTools and the app tab to read network captures. Each focus gain triggers an extra impersonation refetch on top of the 10s interval.

This will inflate `/api/admin/impersonation/status` request counts in tester captures relative to a real user's experience and could mislead H-1 vs H-2 discrimination.

**Phase 2 capture instruction:** testers should keep DevTools docked (attached to the same window as the app) rather than detached into a separate window. This minimises the window-focus event fires. If detached DevTools is unavoidable, instruct testers to record how many times they switched between DevTools and the app tab during the 60-second capture (this is QA-A below).

---

### U-4 — F-256 comparison missing outcome (not opaque)

The original doc at line 248 reads: *"This mirrors the F-256 pattern (Phase 1 found three sub-bugs, Phase 2a fixed the cleanest one first, deferred H-2/H-3 pending recon)."*

The parenthetical does explain the mechanism, just not the outcome. Recent commits show F-256a was verified PASS in production (commit `ee5ce45`). Adding one phrase closes the loop:

> *"This mirrors the F-256 pattern (Phase 1 found three sub-bugs, Phase 2a fixed the cleanest one first and was verified PASS in production, deferred H-2/H-3 pending recon)."*

---

### U-5 — H-1 confirmation criterion needs role-asymmetry caveat (NEW FINDING)

The H-1 "Confirms in production" criterion at line 158-159 reads:

> A second user logging in from the same IP receives 429s on the same approximate schedule as user A — they share the budget.

This is true only if both users have similar polling profiles. Real role-based polling differences:

- Super-admin: ~20 req/min baseline (impersonation poll + sidebar pollers gated by role + header pollers).
- Cashier/non-admin: ~14 req/min baseline (no security-alerts poll, no inventory-alerts poll, but still impersonation poll).

A super-admin paired with a cashier on the same IP will NOT show tightly-correlated 429s — the admin will 429 first, the cashier later, even though they share the budget. Weak correlation could be misread as "H-1 ruled out" when it is actually "H-1 confirmed but masked by role asymmetry".

**Phase 2 capture instruction:** for H-1 confirmation, both testers must use the SAME role (e.g., both Owner) during the coordinated test. Role-asymmetric pairing produces ambiguous results.

If asymmetric data is the only data available, do not draw H-1 conclusions from request-time correlation alone. Use the absolute count of 429s on each tester relative to their expected baseline as the discriminator instead.

---

## Additional Tester Questions for Phase 2

The existing Q-F254-1 through Q-F254-6 cover system-level questions: Redis config, process count, shared IP, WS reconnect, endpoint breadth, ALB probes. The following cover user-session-level diagnostics:

| ID | Question | Distinguishes |
|----|----------|---------------|
| **QA-A** | During the 60-second capture, how many times did you switch between DevTools and the app tab? | Quantifies `refetchOnWindowFocus` amplification for the impersonation poller (see U-3) |
| **QA-B** | How many browser tabs were open per tester at the moment 429s were first reported? | H-3 depends on tab count; existing questions ask about IP sharing but not per-user tab count |
| **QA-C** | What role were testers logged in as during captures? | Security-alerts sidebar poller is gated to owner/hq_admin/franchise_owner. Privileged roles have ~20 req/min baseline; others ~14 req/min. Changes H-2 severity calculation. Critical for U-5 role-asymmetry interpretation |
| **QA-D** | Did 429s occur immediately on page load, or only after the page had been open for 30–60 seconds? | Immediate = remount-and-refetch burst (multiple useQuery subscribers firing at mount). Delayed = steady polling accumulation |
| **QA-E** | Were 429s ever observed on the login form itself (before reaching any app page)? | `authLimiter` (15 req / 15 min) is separate from `apiLimiter`. If yes, this is a different limiter and out of current scope |
| **QA-F** | Did 429s self-resolve after approximately 60 seconds, or persist longer across browser restarts? | Self-resolution in ~60s = limiter window working as designed. Persistence beyond that = possible window reset bug or Redis state not flushing (H-5) |

---

## Phase 2 Sequencing — Confirmed Original (no fix work in Phase 2)

The original doc's Phase 2 framing (observation-only) is correct per CLAUDE.md phase discipline. The reviewer initially proposed inserting code changes into Phase 2; that proposal is rejected. Sequencing remains:

1. **Phase 1 (this addendum, no code changes):** confirm uploadLimiter has the same H-1 bug (E-1 — already confirmed by static reading). Flag stale AWS ALB comment (E-3). Add U-5 role-asymmetry caveat to H-1 confirmation.
2. **Phase 2 (observation only):** capture per the original doc + QA-A through QA-F. Testers same-role for H-1 confirmation per U-5. DevTools docked per U-3.
3. **Fix phase (post-Phase 2):** if H-1 confirmed, swap middleware order in `server/index.ts` — fixes both `apiLimiter` AND `uploadLimiter` in one change. Update stale AWS ALB comment (E-3) in the same PR. Gate impersonation poller on super_admin role (U-2) — same PR or separate, owner's choice.
4. **Optional polish (post-fix):** if `/api/health` 429s persist after H-1 fix, add `skip` to apiLimiter for `req.path === "/health"` (U-1).

The H-1 middleware swap is strictly higher-leverage than `/api/health` whitelist because it fixes both limiters simultaneously and addresses the structural cause rather than one symptomatic endpoint.