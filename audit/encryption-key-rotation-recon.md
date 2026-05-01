# Encryption Key Rotation — Recon

**Date:** 2026-04-30 AM
**Branch:** main, HEAD `96d9ba4`
**Author:** read-only investigation, no production access, no code changes
**Severity:** 1 (launch blocker per `audit/launch-checklist.md` §"Severity 1" #1)

---
## Status (as of 2026-05-01)

**DEFERRED to post-launch** per founder decision. Procedure below
remains valid; revisit when real customer PII enters production or
within 30 days of first paying customer, whichever first. See
`audit/00-backlog.md` PL-1.

Pre-flight verification completed 2026-05-01:
- Phase 0.3 unit tests: 86/86 pass, including 14 rotation tests
- Phase 0.4 QQ-7 (waitlist gap): fixed by PR #17 / commit 36ccfe0,
  verified 2026-05-01
- QQ-1 (SESSION_SECRET state): unresolved, deferred until pre-rotation
  pre-flight is re-run post-launch

Re-run all of Phase 0 again before any future rotation attempt.

---

## Summary

ENCRYPTION_KEY was committed in `.replit:54` since commit `e523dfa` and remains in git history forever, even though the file itself was untracked in commit `b6f5e72` ("chore: untrack .replit and add to .gitignore"). The key is therefore considered fully compromised and guards every PII column the platform encrypts at rest. Until rotated, the encryption story is theatre — anyone with git history access can decrypt every `enc:`-prefixed row.

The good news is that the rotation primitives are **already built and tested**. `server/encryption-rotation.ts` exposes `deriveKey`, `encryptWithKey`, `decryptWithKey`, and `rotateField`; `server/admin-routes.ts:1980-2110` exposes a super-admin-only `POST /api/admin/encryption/rotate-key` endpoint that re-encrypts every PII column per tenant inside a per-tenant DB transaction; `tests/unit.test.ts:400-516` has 9 unit tests covering success, skip, no-op, and tenant-isolation paths. This work landed in commits `a54bddb`/`8152a27` ("Task #56 … encryption key rotation endpoint") and `3314f9d` ("Improve encryption key rotation with enhanced error tracking and testing"). No new code is required to perform the rotation itself — only an operational procedure and post-rotation verification.

Estimated complexity: **low (operational, ~30-60 min)** assuming the existing endpoint works as designed; the engineering risk is concentrated in the env-var-swap step, which is the point of no return without a DB restore.

---

## Current encryption design

### Algorithm and primitives (`server/encryption.ts`)

- Algorithm: `aes-256-gcm` (`server/encryption.ts:3`).
- IV: 16 random bytes per encrypt (`server/encryption.ts:4`, `:23`). Random per call → semantic security.
- Auth tag: 16 bytes (`server/encryption.ts:5`, `:27`).
- Key derivation: `scryptSync(rawKey, "table-salt-encryption-v1", 32)` (`server/encryption.ts:16`). The salt is a hard-coded constant string — there is no per-row, per-tenant, or per-key-version salt. Same raw key always derives the same 32-byte buffer.
- Ciphertext format: `enc:<iv-hex(32)>:<authTag-hex(32)>:<ciphertext-hex>` — single text column, four colon-separated parts, `enc:` literal prefix is the disambiguator (`server/encryption.ts:28`, `:32`).
- No version metadata in ciphertext, no schema column tagging which key version was used.

### Key handling (singleton cache)

- `let derivedKey: Buffer | null = null;` at module level (`server/encryption.ts:8`).
- `getKey()` reads `process.env.ENCRYPTION_KEY` only once on first call, caches the derived buffer, returns the cache forever after (`server/encryption.ts:10-18`).
- Implication: changing `ENCRYPTION_KEY` env var does NOT take effect on the running process — a process restart is required.
- Missing-key behavior: throws `new Error("ENCRYPTION_KEY environment variable is not set")` from `getKey()` at first PII read/write (`server/encryption.ts:13-15`). **NOT** a boot-time check — contrast with `SESSION_SECRET` which is fatal at boot (`server/index.ts:16-19`). The app starts fine without ENCRYPTION_KEY and only fails at first PII operation.

### Decryption error mode

- `decryptField()` wraps `decipher.final()` in try/catch and on failure logs `decryptField: decryption failed — returning ciphertext as-is` and returns the raw `enc:…` string (`server/encryption.ts:51-54`). Means: a wrong key during a read does not 500 the request — it leaks ciphertext into the response. This is by design (degrades gracefully) but worth knowing during rotation.
- Malformed ciphertext (wrong IV/authTag length): `console.warn` and return as-is (`server/encryption.ts:39-42`).

### Rotation primitives (`server/encryption-rotation.ts`)

Same algorithm/salt/format constants (`server/encryption-rotation.ts:3-6`), but multi-key:

- `deriveKey(rawKey)` — pure function, returns Buffer, no caching (`:8-10`).
- `encryptWithKey(plaintext, key)` — explicit Buffer key (`:12-19`).
- `decryptWithKey(ciphertext, key)` — explicit Buffer key, returns ciphertext-as-is on decrypt failure (silent, no console output) (`:21-42`).
- `rotateField(ciphertext, oldKey, newKey)` — combines decrypt-with-old + re-encrypt-with-new. Returns `{result, rotated, skipped}`. Skips non-encrypted values (passthrough), skips values that fail to decrypt with `oldKey` (means they were encrypted with a third unknown key) (`:48-61`).

### Test coverage

`tests/unit.test.ts:400-516` covers:
- `deriveKey`: 32-byte buffer, deterministic, different keys → different buffers.
- `encryptWithKey` / `decryptWithKey`: round-trip, random IV (different ciphertext same plaintext), wrong-key returns ciphertext, passthrough for non-encrypted.
- `rotateField`: success path, skip path (wrong key), no-op path (null/undefined/non-encrypted), tenant-isolation (one bad field doesn't poison others).

---

## Encrypted data inventory

### Field-list constants (`server/storage.ts:29-33`)

| Constant | Fields | Tables |
|---|---|---|
| `USER_PII_FIELDS` | `email`, `phone` | `users` |
| `CUSTOMER_PII_FIELDS` | `email`, `phone` | `customers` |
| `RESERVATION_PII_FIELDS` | `customerPhone` | `reservations` |
| `DELIVERY_PII_FIELDS` | `customerPhone`, `customerAddress` | `delivery_orders` |
| `WAITLIST_PII_FIELDS` | `customerPhone` | `waitlist_entries` |

A second copy of `USER_PII_FIELDS` is declared at `server/admin-routes.ts:19` (`as const`). Should be DRYd in cleanup; not blocking.

### Schema column types (`shared/schema.ts`)

All encrypted columns are generic `text()` or `varchar()` — no encryption type marker, no `_enc` suffix, no version column (`shared/schema.ts:103, 142-143, 371, 406, 410, 498, 687-688, 840-841, 894-895, 1025-1026, 1729-1730, 4999, 5029, 5342`).

### Encryption call sites (writes)

`encryptField` / `encryptPiiFields`:
- `server/storage.ts:942` — `createUser`
- `server/storage.ts:947` — `updateUser`
- `server/storage.ts:1080` — `createWaitlistEntry`
- `server/storage.ts:1085` — `updateWaitlistEntry`
- `server/storage.ts:1100` — `createReservation`
- `server/storage.ts:1105` — `updateReservation`
- `server/storage.ts:1306` — `createCustomer`
- `server/storage.ts:1312` — `updateCustomer`
- `server/storage.ts:1374` — `createDeliveryOrder`
- `server/storage.ts:1379` — `updateDeliveryOrder`
- `server/storage.ts:1410` — second customer-update path
- `server/admin-routes.ts:861` — admin user create (USER_PII_FIELDS via local copy)
- `server/admin-routes.ts:1301` — admin user update
- `scripts/encrypt-existing-pii.ts:13-14, 26-27, 39, 49-50, 62` — one-time bulk migration (already run for existing rows)

### Decryption call sites (reads)

`decryptField` / `decryptPiiFields`:
- `server/storage.ts:928, 935, 939, 944, 949, 953` — user reads
- `server/storage.ts:1077, 1082, 1087` — waitlist reads
- `server/storage.ts:1097, 1102, 1107` — reservation reads
- `server/storage.ts:1303, 1308, 1314` — customer reads
- `server/storage.ts:1367, 1371, 1376, 1381` — delivery-order reads
- `server/storage.ts:1407, 1412, 1419, 1423` — additional customer reads
- `server/admin-routes.ts:52` — `stripSensitiveFields` helper
- `server/admin-routes.ts:1084, 1262` — admin list endpoints

### Other modules importing the encryption helpers

`Grep encryptField|decryptField|encryptPii|decryptPii|isEncrypted` across server: 5 files only — `server/storage.ts`, `server/admin-routes.ts`, `server/encryption.ts`, `server/encryption-rotation.ts`, `server/routers/compliance.ts`. The compliance router was not deep-read in this pass — flagged as **QQ-4**.

### Plaintext-PII-shaped fields NOT in any \*_PII_FIELDS

Two columns on `delivery_orders` look like PII but are stored plaintext (`shared/schema.ts:840-844`):
- `delivery_orders.driver_phone` — `text("driver_phone")` — not in `DELIVERY_PII_FIELDS`, not encrypted on write
- `delivery_orders.driver_name` — `text("driver_name")` — same

The rotation endpoint at `server/admin-routes.ts:2072` *does* call `rotateField(d.driverPhone, oldKey, newKey)`. Because driverPhone rows are plaintext at rest, `rotateField` returns `{rotated: false, skipped: false}` (passthrough for non-`enc:` values per `server/encryption-rotation.ts:53-55`). No-op, but worth noting:

**Finding:** `delivery_orders.driver_phone` is plaintext PII at rest. Not blocking this rotation, but should be added to `DELIVERY_PII_FIELDS` in a follow-up PR. Already noted in `audit/02-new-blockers-recon.md:1554`.

`tracking_notes` (`shared/schema.ts:851`, populated with `customerName:…` per `audit/02-new-blockers-recon.md:1622, 1686`) is also plaintext PII at rest. Same backlog status.

---

## Multi-key support assessment

### Static analysis

- **Rotation primitives**: yes (`server/encryption-rotation.ts`).
- **Runtime decryption**: NO multi-key fallback. `decryptField()` (`server/encryption.ts:31-55`) uses only the cached key from `process.env.ENCRYPTION_KEY` via `getKey()`. There is no chain of "try newKey, then oldKey, then …". A wrong key → silent passthrough of ciphertext (`:51-54`).
- **Implication for downtime-free rotation**: there is a window between (a) running the rotation endpoint and (b) updating the env var + restarting where:
  - The running process has OLD key cached.
  - Rows for tenant N (rotated) are encrypted with NEW key.
  - Reads against tenant N's PII return raw `enc:…` ciphertext (decrypt fails silently).
- The endpoint warning at `server/admin-routes.ts:2108` acknowledges this explicitly: *"All PII fields have been re-encrypted with the new key. You MUST now update the ENCRYPTION_KEY secret and restart the server for decryption to work correctly with the new key."*

### What it would take to add hot-swap

Two pieces of work, both deferred (out of scope):

1. **Env var pair**: `ENCRYPTION_KEY` (current) + `ENCRYPTION_KEY_PREVIOUS` (previous, optional). `getKey()` becomes `getKeys()` returning an array.
2. **Decrypt fallback chain**: `decryptField()` tries each key in order, returns first success. No-fallback failure path stays the same.

Estimated effort: ~50 lines of code in `server/encryption.ts` plus tests. Useful for future rotations but **not required for this rotation** — the existing rotation endpoint works fine if rotation runs synchronously and the env var is swapped immediately after.

---

## Existing rotation infrastructure

### Endpoint: `POST /api/admin/encryption/rotate-key` (`server/admin-routes.ts:1980-2110`)

- **Authn/authz**: `requireSuperAdmin` + `requireFreshSession` (`:1980`). Rotation cannot run from a stale session, prevents cookie-replay misuse.
- **Body**: `{newKey: string (min 16 chars)}` — Zod-validated (`:1981-1987`).
- **Pre-flight checks**: ENCRYPTION_KEY must be set in env (`:1989-1992`); newKey must differ from oldKey (`:1995-1997`).
- **Per-tenant transaction** (`:2010-2089`): for each tenant, opens a `db.transaction(async tx => …)` covering users, customers, reservations, delivery_orders for THAT tenant. Failure inside one tenant rolls back that tenant only, accumulates into `errors[]`, continues to next tenant.
- **Tables rotated** (4 of 5):
  - `users.email`, `users.phone` (`:2016-2030`)
  - `customers.email`, `customers.phone` (`:2032-2046`)
  - `reservations.customerPhone` (`:2048-2059`)
  - `delivery_orders.customerPhone`, `delivery_orders.driverPhone` (`:2061-2078`)
- **Tables NOT rotated**: `waitlist_entries.customerPhone` — present in `WAITLIST_PII_FIELDS` (`server/storage.ts:33`) and encrypted on write (`server/storage.ts:1080, 1085`), but **the rotation endpoint never touches it**. **Finding:** `waitlist_entries` PII is silently skipped by the rotation endpoint. Means: after rotation, all encrypted waitlist phone numbers become unreadable when the env var swaps. **Severity: High — must be fixed before running rotation.** See QQ-7 below and **Out of scope** below.
- **Audit logging**: writes a `encryption_key_rotated` audit event with `{tenantsProcessed, fieldsRotated, fieldsSkipped, errors: errors.length}` (`:2091-2101`).
- **Response**: `{tenantsProcessed, fieldsRotated, fieldsSkipped, errors[], warning}` (`:2103-2109`).

### Other rotation-adjacent files

- `scripts/encrypt-existing-pii.ts` — **not** rotation. One-time bulk encrypt of pre-existing plaintext PII. Already run (evidenced by `isEncrypted()` guards making it idempotent). Out of scope.
- `tests/unit.test.ts:400-516` — 9 unit tests on `encryption-rotation.ts`. All green per most recent CI assumption.

### Pre-existing audit notes on this work

- `audit/launch-checklist.md:21` — flags `ENCRYPTION_KEY` as still burned.
- `audit/launch-checklist.md:164` — Severity 1 #1: lists ENCRYPTION_KEY (`.replit:54`), VAPID_PRIVATE_KEY (`.replit:55-56`), `.auth/*.json` cookies as the "compromised secrets in git history" cluster.
- `audit/launch-checklist.md:192` — Recommended next 3 items #1: rotate all three.
- `audit/FINDINGS.md:233-234` — F-217 and F-218, both marked "Mitigated (rotated 2026-04-15)". **This contradicts the launch checklist.** See QQ-1 below.
- `audit/OPEN-QUESTIONS.md:10, 82` — Q-006, Q-078 still open re. SESSION_SECRET rotation status.
- `audit/00-orientation.md:475, 495` — flags `.replit:54-57` as rotation candidate.
- `audit/FINAL-REPORT.md:99-100, 237, 304` — reiterates rotation as Top-5 fix.
- `audit/02-new-blockers-recon.md:1512-1686` — describes the encryption format and DELIVERY_PII_FIELDS contract in the context of the backfill PR.

---

## Proposed rotation procedure

### Phase 0 — pre-flight (no production change)

| Step | Action | Verify | Rollback |
|---|---|---|---|
| 0.1 | Confirm super-admin account exists with PIN/TOTP | login locally with `npm run dev`, no production access | n/a |
| 0.2 | Generate new key: `openssl rand -hex 32` | length 64 hex chars | n/a — discard and regenerate |
| 0.3 | Verify rotation primitives still pass: `npm run test -- unit.test.ts` (the 9 rotation tests at lines 400-516). Note: this runs against local code only, no prod access. | all 9 tests pass | n/a — investigate failure first |
| 0.4 | **Fix waitlist_entries gap (QQ-7) FIRST** — either (a) add waitlist rotation block to the endpoint, or (b) confirm zero encrypted rows in `waitlist_entries.customer_phone` and accept the gap. Without this, rotation will silently abandon waitlist PII. See QQ-7. | code change merged or operator confirmation logged | n/a |
| 0.5 | Confirm DB backup: take a fresh Railway Postgres snapshot before starting. Operator action — Claude does not have prod access. | snapshot timestamp recorded in run log | n/a — re-take snapshot |
| 0.6 | Optional: schedule a low-traffic window (publishable status / banner). Not strictly required given the endpoint is per-tenant transactional, but reduces the within-tenant write-collision window described in Risk #3. | banner up | banner down |

### Phase 1 — rotation execution (per-tenant tx, reversible until env-var swap)

| Step | Action | Verify | Rollback |
|---|---|---|---|
| 1.1 | Operator authenticates as super-admin in production (fresh session). | session age satisfies `requireFreshSession` | n/a |
| 1.2 | Operator sends `POST /api/admin/encryption/rotate-key` with `{newKey: NEW_VALUE}` (NEW_VALUE = the openssl-rand-hex-32 output from 0.2). | endpoint returns 200 | abort, no rollback needed (env var unchanged, app keeps using old key fine) |
| 1.3 | Inspect response body: `errors.length === 0`, `tenantsProcessed === total tenant count`, `fieldsRotated > 0`, `fieldsSkipped` reasonable (skipped includes plaintext driverPhone rows — expected to be high). | match expected counts | re-run endpoint with same newKey while env var still holds OLD key — idempotent per Risk #2 below |
| 1.4 | Spot-check one tenant in TablePlus (read-only): confirm `users.email` for one row is `enc:…` and decryptable with NEW key (using a temporary scratch script, no code in repo). Optional — endpoint already audit-logged. | row prefix `enc:`, IV/tag length sane | re-run rotation if doubt, before env swap |

### Phase 2 — env var swap + restart (POINT OF NO RETURN)

| Step | Action | Verify | Rollback |
|---|---|---|---|
| 2.1 | Update `ENCRYPTION_KEY` in Railway dashboard → Variables → set to NEW_VALUE. | Railway shows new variable value | revert env var, redeploy — but any rows that re-encrypted with NEW key are now unreadable until DB-restore from 0.5 snapshot |
| 2.2 | Trigger Railway redeploy (empty commit, same pattern used 2026-04-30 AM at commit `c3a81c1`). Forces every running instance to drop its cached `derivedKey` and re-init. | deployment succeeds, /api/health 200 | redeploy off OLD env var would resurrect old key — only works if step 1 NOT run (no rotated rows exist) |
| 2.3 | Smoke test: create a test customer (`POST /api/customers`), read it back, confirm round-trip works. Then delete the test customer. | round-trip equals input | restore from 0.5 snapshot if smoke test fails |
| 2.4 | Spot-check 3 tenants: read one user, one customer, one reservation, one delivery order, one waitlist entry. Confirm none return `enc:…` strings (which would indicate decrypt failed silently). | all values plaintext | restore from snapshot |

### Phase 3 — cleanup + audit log update

| Step | Action | Verify |
|---|---|---|
| 3.1 | Update `audit/FINDINGS.md` F-217: change to "Mitigated (rotated 2026-04-30)" with a link to this recon doc. | text updated |
| 3.2 | Update `audit/launch-checklist.md` Severity 1 #1: strike through ENCRYPTION_KEY portion; leave VAPID + .auth/* portions if not yet rotated. | text updated |
| 3.3 | Update `audit/00-backlog.md`: mark this item Done with commit hash. Add follow-up entry: "driver_phone + tracking_notes plaintext PII — add to DELIVERY_PII_FIELDS." | entries added |
| 3.4 | Optional — add audit-log filter on `encryption_key_rotated` event to verify the rotation was logged. | event present in audit_events |

### Phase 4 — VAPID rotation (separate, can be same window or later)

| Step | Action | Notes |
|---|---|---|
| 4.1 | Generate new VAPID keypair: `npx web-push generate-vapid-keys` (run locally, no prod access needed for keygen). | output: publicKey, privateKey |
| 4.2 | Update `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Railway. | Railway accepts new values |
| 4.3 | DELETE FROM platform_settings_kv WHERE key IN ('vapid_public_key','vapid_private_key') — otherwise stale DB rows could shadow if env vars later get cleared (`server/services/push-sender.ts:42-46` falls back to DB only if env unset; but consistency is better). | row count 0 or 2 |
| 4.4 | Trigger Railway redeploy. | deploy 200 |
| 4.5 | Communicate to users: existing push subscriptions become invalid; clients must re-subscribe. Per `audit/FINAL-REPORT.md:99`. | banner / email |

### Phase 5 — SESSION_SECRET rotation (conditional on QQ-1)

If QQ-1 confirms SESSION_SECRET was NOT rotated since `12fc00b` (12fc00b is the commit that committed `.auth/*.json` cookies):

| Step | Action | Notes |
|---|---|---|
| 5.1 | Generate new secret: `openssl rand -hex 32`. | length 64 |
| 5.2 | Update `SESSION_SECRET` in Railway. | accepted |
| 5.3 | Trigger Railway redeploy. | All active sessions invalidated. CSRF tokens recomputed (since CSRF is HMAC-SHA256 of sessionId keyed with SESSION_SECRET per `server/security.ts:10-11`). All users must re-login. |
| 5.4 | Run SESSION_SECRET rotation **AFTER** ENCRYPTION_KEY rotation completes successfully. Reason: rotation endpoint requires super-admin session; rotating SESSION_SECRET first logs everyone out, including the operator running step 1.2. | order matters |

---

## Risk assessment

### Risk 1 — Stale module-level cache during rotation

- **What**: `derivedKey` cache in `server/encryption.ts:8` is set on first call and never invalidated. Updating ENCRYPTION_KEY env var has no effect on the running process until restart.
- **Detection**: After Phase 2.1, decryption of newly-rotated rows returns `enc:…` ciphertext as-is (silent passthrough — no 500). User-visible symptom: PII fields appear as `enc:abc123:def456:…` in admin tables and detail panels.
- **Recovery**: Phase 2.2 (redeploy) is the recovery — drop cache by restarting all instances.

### Risk 2 — Partial tenant failure mid-rotation

- **What**: Tenants A, B, C succeed; tenant D fails (e.g., DB lock timeout, FK violation, network hiccup). Now rows for A, B, C use NEW key; rows for D use OLD key.
- **Detection**: `errors[]` in endpoint response is non-empty after step 1.2.
- **Recovery (BEFORE env swap)**: re-run the endpoint with the same newKey. Idempotent because:
  - Tenants A, B, C: rows are NEW-key-encrypted; `rotateField` tries to decrypt with OLD key (still in `process.env.ENCRYPTION_KEY`) → fails → returns `skipped: true`. No DB update.
  - Tenant D: rows still OLD-key-encrypted → rotate succeeds → rows now NEW-key-encrypted.
- **Recovery (AFTER env swap)**: harder. Tenant D rows are unreadable (cached key is NEW, rows are OLD-encrypted). Two options:
  1. Restore from snapshot (Phase 0.5), retry from Phase 1.
  2. Set env var BACK to OLD, redeploy, run endpoint again with newKey, rerun env swap. But this means the smoke test in Phase 2.3 should have caught this — that's why 2.3 specifically reads a user/customer/reservation/delivery/waitlist for spot tenants.

### Risk 3 — Concurrent writes during a tenant's rotation transaction

- **What**: `rotateField` reads `users.email` ciphertext, decrypts with old, re-encrypts with new, writes back inside a tx. A concurrent write from the application that updates the same user's email between read-time and write-time gets clobbered when the tx commits — the rotated old value overwrites the new value.
- **Detection**: hard to detect generically; would manifest as user reports of "I just changed my email and it reverted."
- **Mitigation**: low-traffic window (Phase 0.6); no SELECT FOR UPDATE in the rotation tx so the window is non-zero. Acceptable given pre-launch scale.

### Risk 4 — VAPID env-var/DB drift (Phase 4)

- **What**: `server/services/push-sender.ts:39-47` reads env vars first, falls back to `platform_settings_kv` rows if env is empty. If env is set to NEW values but DB still holds OLD values, current behavior is correct (env wins). But if env is later cleared (intentionally or by mis-config), DB resurrects OLD compromised values.
- **Mitigation**: Phase 4.3 — delete the DB rows.

### Risk 5 — Plaintext PII bypassed by rotation

- **What**: `delivery_orders.driver_phone` and `tracking_notes` are stored plaintext (`shared/schema.ts:840-844, 851`); rotation gracefully skips them (Risk: zero — they're already plaintext, not encrypted with the compromised key). But these columns are themselves a separate, ongoing PII-at-rest finding unrelated to key rotation.
- **Mitigation**: backlog item, not blocking.

### Risk 6 — Waitlist-entries silently skipped by rotation endpoint

- **What**: `WAITLIST_PII_FIELDS = ["customerPhone"]` is encrypted on write (`server/storage.ts:1080, 1085`) but the rotation endpoint at `server/admin-routes.ts:1980-2110` does NOT include a waitlist-entries block. If rotation runs and env var swaps, every encrypted waitlist phone becomes unreadable.
- **Mitigation**: Phase 0.4 — add the waitlist block to the endpoint OR confirm zero encrypted rows in production. **This is the most likely undetected breaker in the whole procedure** and must be addressed BEFORE Phase 1.2.

---

## Open questions

| ID | Question | Why it matters |
|---|---|---|
| QQ-1 | What is the actual rotation status of SESSION_SECRET? `audit/FINDINGS.md:233-234` says "Mitigated (rotated 2026-04-15)" for both F-217 and F-218; `audit/launch-checklist.md:164, 192` lists it as still pending; `audit/OPEN-QUESTIONS.md:10, 82` (Q-006, Q-078) is still open; user prompt says "reportedly rotated on April 17". Three different states. | Determines whether Phase 5 runs at all and what the current `.auth/*.json` cookie validity is. |
| QQ-2 | Are the values in `.replit:54-57` (ENCRYPTION_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) the same values currently set in Railway production env, or sandbox-only fakes that never matched production? `audit/00-orientation.md:495` raised this and it was never closed. | If sandbox-only, the rotation is hygiene-only; if production, the rotation is genuinely mitigating exploitable exposure. Doesn't change the procedure but changes the urgency framing. |
| QQ-3 | How many PII rows per tenant on average and at peak? Largest tenant's PII row count? | Sizing the rotation transaction duration. Per-tenant tx with 10K+ rows could take a non-trivial wall-clock time; need to confirm Railway tx timeout (default unknown to me). No production access to count — operator must report. |
| QQ-4 | Does `server/routers/compliance.ts` (one of 5 files importing the encryption helpers) introduce any encrypted columns I missed? | Recon reads of compliance.ts deferred. If it does, those rows are also at-risk and must be added to the rotation endpoint. |
| QQ-5 | `.env.migration` exists in working tree (gitignored at `.gitignore:34`) and contains `DATABASE_URL=postgresql://postgres:YOUR_COPIED_PASSWORD@monorail.proxy.rlwy.net:59994/railway`. Is this leftover from a one-time migration, or actively used? Out of scope for this PR but flagged. | Hygiene; not blocking rotation. |
| QQ-6 | `delivery_orders.driver_phone` and `delivery_orders.tracking_notes` (which contains `customerName:…`) are plaintext PII. Add to `DELIVERY_PII_FIELDS` in this rotation cycle, or defer to a separate PR? | Already noted in `audit/02-new-blockers-recon.md:1554, 1686`. Recommend defer — adding columns mid-rotation increases blast radius. |
| QQ-7 | **The rotation endpoint at `server/admin-routes.ts:1980-2110` does NOT touch `waitlist_entries.customerPhone`**, even though that column IS encrypted on write (`server/storage.ts:1080, 1085`). Was this an oversight or deliberate? **This must be answered and addressed before running the rotation in production**, or every encrypted waitlist phone becomes unreadable after env swap. | Direct break risk. Highest priority among the QQs. |
| QQ-8 | What is the operational super-admin login flow in production? `requireFreshSession` (`server/admin-routes.ts:1980`) needs the operator to re-auth recently. Is there a documented "elevate to super-admin" path? | Phase 1.1 needs concrete steps. |

---

## Out of scope for this PR

- Adding hot-swap multi-key support to `server/encryption.ts` (env var pair + decrypt fallback chain). Estimated 50 LoC; useful for future rotations but not required this round.
- Adding `delivery_orders.driver_phone`, `delivery_orders.driver_name`, `delivery_orders.tracking_notes` to `DELIVERY_PII_FIELDS`. Backlog item. Per-row backfill encryption needed at the same time, mirroring `scripts/encrypt-existing-pii.ts` pattern.
- Removing the duplicate `USER_PII_FIELDS` constant at `server/admin-routes.ts:19` (DRY).
- Replacing the hard-coded salt `"table-salt-encryption-v1"` (`server/encryption.ts:6`) with a per-key version-tagged salt. Would require ciphertext format change (new prefix `enc2:` or version field). Future PR.
- Adding a per-row `encryption_key_version` column to encrypted tables. Would simplify rotations and rollbacks but requires schema migration on every encrypted table. Future PR.
- VAPID private key rotation procedure detail beyond Phase 4 above (e.g., user-facing communication about re-subscribing).
- SESSION_SECRET rotation procedure (covered in Phase 5, contingent on QQ-1).
- `.env.migration` cleanup (QQ-5).
- The `audit/FINDINGS.md` vs `audit/launch-checklist.md` consistency reconciliation re. F-217/F-218 (QQ-1).

---

## Estimated execution time and risk window

Assuming QQ-7 is resolved (waitlist rotation block added or confirmed empty) and a fresh DB snapshot is in hand:

| Phase | Wall-clock | Risk if it fails here |
|---|---|---|
| 0 — pre-flight | 15 min | none — abort cheaply |
| 1 — rotation | 5-15 min (depends on tenant + PII row count, QQ-3) | low — env var unchanged, can re-run idempotently |
| 2 — env swap + restart | 10 min | **HIGH — point of no return absent restore** |
| 3 — audit-doc cleanup | 5 min | none — docs only |
| 4 — VAPID rotation | 10 min | medium — push subs invalidated, user-visible |
| 5 — SESSION_SECRET rotation (if QQ-1 negative) | 5 min | medium — all sessions invalidated, user-visible |
| **Total** | **~50-60 min** | concentrated in Phase 2 |

Recommended risk window: 30-60 min low-traffic window, ideally during a documented maintenance announcement. Tomorrow morning (2026-05-01 AM, ~4 AM UAE time = 2:30 AM India = 12:30 AM UK) is plausible if testers are not actively exercising flows. Operator confirms.
