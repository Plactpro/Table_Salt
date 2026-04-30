# QQ-1 — SESSION_SECRET rotation status

**Date:** 2026-04-30 AM
**Source:** `audit/encryption-key-rotation-recon.md` QQ-1
**Investigator:** read-only, no production access

---

## Question

From `audit/encryption-key-rotation-recon.md` Open Questions, QQ-1:

> What is the actual rotation status of SESSION_SECRET? `audit/FINDINGS.md:233-234` says "Mitigated (rotated 2026-04-15)" for both F-217 and F-218; `audit/launch-checklist.md:164, 192` lists it as still pending; `audit/OPEN-QUESTIONS.md:10, 82` (Q-006, Q-078) is still open; user prompt says "reportedly rotated on April 17". Three different states.

The same question implicitly applies to ENCRYPTION_KEY (F-217's other half) since both findings share the same "Mitigated (rotated 2026-04-15)" status string.

---

## Evidence found

### Source 1: git log for SESSION_SECRET-related commits

`git log --all --oneline --grep="SESSION_SECRET\|session.secret"` returns:

```
df5a1c3 docs(audit): add 3 backlog entries from encryption rotation recon — waitlist gap, plaintext PII, SESSION_SECRET status
b1e52a2 TD-6: remove hardcoded SESSION_SECRET fallback from security.ts
e7b7d72 fix(security): hard-fail on missing SESSION_SECRET in production (TD-3)
aa02e1f fix: CSRF token race condition + cleanup bugs (Task #134)
9af59ba Rebrand ServeOS to Table Salt
164c7e5 Rebrand ServeOS to Table Salt
```

Filtering to commits that *act on* the secret value (not just code paths that read it):
- `b1e52a2` removes a hardcoded fallback in `server/security.ts` — code change, not a value rotation.
- `e7b7d72` adds a fatal-on-missing check at boot — code change, not a value rotation.

**Neither commit rotates the SESSION_SECRET value itself.** Rotation of an env var happens in Railway's dashboard and leaves no git trace by design.

### Source 2: git log in the 2026-04-15 to 2026-04-17 window

`git log --all --oneline --since="2026-04-15" --until="2026-04-17"` returns ~50 commits, all from the F-*** systemic audit fix sweep. Notable security-adjacent commits in window:

- `4f5f31d fix(security): F-222 remove demo123 default password, redact credentials and PII from logs`
- `8736d0b fix(api): F-189 validate aggregator webhook HMAC signatures`
- `08bdcbc fix(security): F-033 close cross-tenant IDOR on transfer-table, merge-tables, split-bill`
- `9a01bfc fix(kds): F-016-FU remove ?tenantId= from KDS wall frontend`
- `8e79a99 fix(seed): F-222-FU seed reads DEFAULT_STAFF_PASSWORD env var, adds production startup guard`

**No commit in this window mentions SESSION_SECRET, ENCRYPTION_KEY, VAPID, key rotation, or env var changes.** Consistent with the rotation being a Railway-dashboard action that doesn't touch the repo.

### Source 3: `audit/FINDINGS.md` lines 233-234 (verbatim)

```
| F-217 | Critical | Secrets | `.replit` + git history | commits e523dfa, 280047f | ENCRYPTION_KEY and VAPID_PRIVATE_KEY in git history since initial commits — recoverable even if removed from HEAD; key must be considered fully compromised | Mitigated (rotated 2026-04-15) |
| F-218 | High | Secrets | `.auth/*.json` + git history | commit 12fc00b | Session cookies for owner/manager/kitchen committed in git history; expires ~2026-04-20; valid if SESSION_SECRET unchanged | Mitigated (rotated 2026-04-15) |
```

**Claim:** Both ENCRYPTION_KEY and SESSION_SECRET were rotated on 2026-04-15. F-218's status is the indirect signal — the ".auth/* cookies attack window" only closes if SESSION_SECRET rotated.

### Source 4: `audit/launch-checklist.md` line 164 (verbatim)

```
1. **Compromised secrets in git history must be rotated.** ENCRYPTION_KEY (`.replit:54` since `e523dfa`), VAPID private key (`.replit:55-56` since `280047f`), and `.auth/*.json` session cookies (since `12fc00b`) are recoverable from git history forever. The ENCRYPTION_KEY guards all PII; until it is rotated, the entire encryption story is theatre. Top-5 finding in `audit/FINAL-REPORT.md`.
```

**Claim:** All three secrets (ENCRYPTION_KEY, VAPID private key, `.auth/*.json` session cookies — i.e. SESSION_SECRET indirectly) are still pending rotation as of the document's date (2026-04-29 PM, line 3 of the same file). Direct contradiction of F-217/F-218.

### Source 5: `audit/launch-checklist.md` line 192 (verbatim)

```
1. **Rotate ENCRYPTION_KEY, VAPID private key, and SESSION_SECRET; re-encrypt all PII; force a Railway redeploy to flush sessions.** Top-5 critical from `audit/FINAL-REPORT.md`. This is the single highest-leverage hour of work in the entire audit — it converts the encryption story from "theatre" to "real" without any code change. Pair it with a `.env`-only ingestion path so future Claude/contributors cannot recommit a key. Verify by re-reading `.replit` after rotation and `git grep` for the old key prefix.
```

**Claim:** SESSION_SECRET rotation is the #1 recommended next item. Same direct contradiction of F-218.

### Source 6: `audit/OPEN-QUESTIONS.md` Q-006 (verbatim, line 10)

```
| Q-006 | 0 | Are the `.auth/*.json` session cookies still valid? | Expiry timestamps are ~2026-04-20. If the SESSION_SECRET hasn't rotated, they may still authenticate. |
```

**Status:** Open, priority 0. As of the document's last write, the question was unanswered.

### Source 7: `audit/OPEN-QUESTIONS.md` Q-078 (verbatim, line 82)

```
| Q-078 | 9 | Has the SESSION_SECRET been rotated since commit 12fc00b (when .auth/ cookies were committed)? | If not, the committed session cookies (owner/manager/kitchen) are still valid until ~2026-04-20. |
```

**Status:** Open, priority 9 (highest in this doc's scale). As of the document's last write, the question was unanswered.

---

## Conclusion

**The FINDINGS.md "Mitigated (rotated 2026-04-15)" status on F-217 and F-218 is unverified and likely incorrect.** Three pieces of evidence support this:

1. **Document recency wins.** `audit/launch-checklist.md` is dated 2026-04-29 PM (line 3) — fourteen days *after* the alleged 2026-04-15 rotation. If the rotation had happened, the launch checklist author would have known. They explicitly list all three secrets as still pending and place SESSION_SECRET rotation as the #1 recommended action. This is not the kind of mistake a careful auditor makes about something they would have done themselves two weeks earlier.

2. **No corroborating git activity.** Source 2's window of commits is dominated by F-*** systemic audit fixes, not env var rotation announcements. While env var rotation in Railway leaves no git trace by design, a real rotation usually triggers at least one of: a Railway redeploy commit (e.g. an empty commit), a CLAUDE.md or runbook update documenting the rotation date, or an audit log entry. None exists in the window.

3. **OPEN-QUESTIONS.md still asks the question.** Q-006 (priority 0) and Q-078 (priority 9) remain open. If F-218's status had been authoritatively updated to "Mitigated", the corresponding Q-078 should have been closed — and it wasn't.

**Most likely chain of events:** Someone updated F-217 and F-218 in FINDINGS.md to "Mitigated (rotated 2026-04-15)" speculatively or based on a verbal confirmation that wasn't carried through, and forgot to (a) close the related open questions or (b) update the launch checklist. The 2-day discrepancy between FINDINGS.md ("April 15") and the user's recall ("reportedly April 17") further suggests the date itself is loose.

**Practical implication for the rotation procedure:**

- **ENCRYPTION_KEY**: assume STILL UNROTATED. Phase 1-2 of `audit/encryption-key-rotation-recon.md` must run. The committed `.replit:54` value remains decryptable against current production rows until proven otherwise.
- **SESSION_SECRET**: assume STILL UNROTATED. Phase 5 of the rotation recon must run.
- **`.auth/*.json` cookies attack window**: `expires ~2026-04-20` < today 2026-04-30. Even if SESSION_SECRET was *not* rotated, the committed cookies are past-expiry and would be rejected by the session validation regardless. So F-218's *exploitable* risk has aged out, but the underlying SESSION_SECRET hygiene issue (signing fresh cookies with the same compromised secret used at the time `.auth/*` was committed) remains.

**Confidence level:** medium-high. The conclusion can only be definitively confirmed by checking the Railway env var dashboard's last-modified timestamp on `ENCRYPTION_KEY` and `SESSION_SECRET` — operator action, not Claude. Recommend: ask operator to take one screenshot of each env var's "last updated" field in Railway before tomorrow's rotation window.

---

## Action items

If conclusion above is accepted:

1. **Update `audit/FINDINGS.md`** F-217 and F-218 status from `Mitigated (rotated 2026-04-15)` to one of:
   - `Open — verify rotation status in Railway dashboard before assuming mitigated`, OR
   - `Open — to be rotated 2026-05-01 per audit/encryption-key-rotation-recon.md`.
   Whichever the operator confirms after looking at Railway.

2. **Close `audit/OPEN-QUESTIONS.md` Q-006 partially:** the cookies-attack-window question can be closed as "expired naturally on 2026-04-20"; the underlying SESSION_SECRET hygiene question (Q-078) stays open until rotation.

3. **Close `audit/OPEN-QUESTIONS.md` Q-078** with the answer recorded here (status: assumed unrotated until Railway-dashboard verification).

4. **Update `audit/encryption-key-rotation-recon.md` QQ-1**: replace with a reference to this doc's conclusion. Phase 5 (SESSION_SECRET rotation) becomes unconditional, not conditional.

5. **Operator action (no Claude write):** before tomorrow's rotation window, screenshot Railway's "last updated" timestamp on `ENCRYPTION_KEY`, `SESSION_SECRET`, `VAPID_PRIVATE_KEY`. If any timestamp is `>= 2026-04-15`, the corresponding finding may legitimately be already-mitigated and Phase X can be skipped. If `< 2026-04-15` (or unknown), run that phase.

If conclusion above is **rejected** (operator confirms F-217/F-218 were correctly marked Mitigated and FINDINGS.md is right):

1. Update `audit/launch-checklist.md` Severity 1 #1 (line 164) and #1 in Recommended next 3 (line 192) — strike through the now-completed rotations.
2. Close `audit/OPEN-QUESTIONS.md` Q-006 and Q-078.
3. Update `audit/encryption-key-rotation-recon.md` to skip Phase 5 entirely; revise estimated time downward.

Either way, the three docs (FINDINGS.md, launch-checklist.md, OPEN-QUESTIONS.md) need to align with each other before Phase 1.2 of the rotation procedure runs — operating with three contradictory statuses on the same security finding is itself a quality-of-audit risk.
