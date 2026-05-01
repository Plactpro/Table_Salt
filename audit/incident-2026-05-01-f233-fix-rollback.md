# Incident — F-233 Fix Attempt 1 Rolled Back

**Date:** 2026-05-01  
**Severity:** Process record (no production data lost, no customers affected — pre-launch test environment)

## Timeline

- ~13:00 IST: F-233 fix committed as 434240a on branch
  fix/F-233-bill-button-persistence
- ~13:30 IST: Pre-merge verification clean. Fast-forward merge to main,
  push to origin succeeded (623d067..434240a).
- ~13:35 IST: Railway deployment ACTIVE on F-233 fix
- ~13:40 IST: Manual verification by Perplexity (per founder Commitment
  3 delegation). Reported 3/8 criteria PASS, 5 NOT TESTED in initial
  round.
- ~14:00 IST: Follow-up Perplexity round targeting the 5 missing
  criteria. Reported C8 FAIL (tab auto-switch after Send to Kitchen)
  and C3 FAIL (fresh order tab navigation broken — clicking tab routes
  to Dashboard instead of POS).
- ~14:35 IST: Rollback executed per Commitment 2. Revert commit
  741c6ea, push to origin (434240a..741c6ea), Railway redeployed.
- ~14:40 IST: Railway ACTIVE on revert. Production back at pre-fix state.

## What Was Reported

Perplexity follow-up reported two failures:

1. **C8 FAIL — Tab auto-switch after Send to Kitchen.** Active tab
   reportedly switched from T7 (the order being sent) to T88888
   (a different order) automatically after clicking Send to Kitchen.

2. **C3 FAIL — Fresh order tab broken.** Reportedly clicking the T7
   tab after Send to Kitchen navigated to the Dashboard
   (https://www.inifinit.com/) instead of loading the POS order view.

## What Is Verified

- F-233 fix code change itself is small, surgical, and was
  type-clean (npm run check passed for client/, no errors in pos.tsx).
- Static analysis by Claude Code prior to ship found no setActiveTabId
  in the place-order success path. Auto-switch behavior is not in
  the code path Claude Code traced.
- Build, Deploy, Post-deploy stages on Railway all completed cleanly.
  No build errors, no runtime startup errors.

## What Is Unverified

- Whether the two reported failures are genuine bugs in production,
  or Perplexity misinterpretation of UI state (which has happened
  before in F-233 investigation).
- Whether the tab navigation behavior is related to the F-233 fix
  at all (could be a pre-existing bug Perplexity surfaced for the
  first time in this test session).

## Discipline Held

- Commitment 2 (rollback at first failure, no fix-forward) was
  honored. Pre-loaded rollback command was paste-and-execute under
  ~3 minutes.
- Commitment 3 (verification before ship) was partially honored —
  delegated to Perplexity with founder rationale (paid subscription,
  trust in QA tooling). Honest limitation worth noting: Perplexity's
  earlier rounds today have shown both correct findings and
  misinterpretations, so reliance on Perplexity verification
  introduced an unmeasured risk.

## Monday Investigation Plan

1. Claude Code static trace of tab-click handler (likely
   client/src/pages/modules/pos.tsx around line 1913 where
   tab-bar onClick fires) — confirm whether there's any
   navigation logic that would route to / instead of staying
   in /pos.

2. Claude Code static trace of Send-to-Kitchen success effect —
   re-verify (with fresh context) the analysis that no
   setActiveTabId fires in the success path. Specifically look
   for: useEffect dependencies on tabs[] or activeTabId that
   could trigger a setter; any side effect from invalidateQueries
   that affects local UI state.

3. If static analysis still says "auto-switch is not real":
   request operator manually reproduce the exact sequence
   Perplexity reported, using their own eyes (no Perplexity),
   to confirm or refute. Particular attention to: did
   Perplexity click anything between steps; did a modal
   transiently appear; did focus shift due to keyboard event.

4. Based on findings: either (a) re-attempt F-233 fix with
   knowledge of the auto-switch / tab-navigation behavior,
   (b) split into two PRs (Bill button + tab-state fix), or
   (c) determine the reported failures were misinterpretation
   and re-attempt original fix unchanged.

## Test Data Cleanup Pending

Multiple test orders left in production from today's investigation:
- T7 (Spring Rolls + Fresh Orange Juice, AED 14.47, Sent)
- T88888 (Chicken Wings + Spring Rolls, AED 28.95, pre-existing)
- T4 (Calamari Fritti, AED 12.41, bill opened but no payment)
- T1, T2, T5, T10 (various pre-existing test orders)

Cleanup planned as separate Monday task.
