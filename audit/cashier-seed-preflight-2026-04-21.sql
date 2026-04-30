-- audit/cashier-seed-preflight-2026-04-21.sql
--
-- Purpose: Preflight check for scripts/seed-cashier-test-user.ts.
-- Confirms that the anchor "owner" user (username='owner',
-- email='alex@grandkitchen.com') is present in the target DB, without
-- exposing any user columns beyond a boolean.
--
-- How to run:
--   Open in TablePlus against the DB you plan to seed into, execute as a
--   single block. Per CLAUDE.md hard rule 1, Claude Code does not run this.
--
-- Safety:
--   * Wrapped in BEGIN; ... ROLLBACK; — nothing commits.
--   * SET LOCAL default_transaction_read_only = on; blocks any write.
--   * SELECTs only aggregate booleans/counts — no user rows returned.

BEGIN;
SET LOCAL default_transaction_read_only = on;
SET LOCAL statement_timeout = '10s';

-- 1. Is the anchor owner user present with the expected email?
--    Expected: found=true, matches_email=true, count=1.
SELECT
  EXISTS (
    SELECT 1 FROM users WHERE username = 'owner'
  ) AS owner_username_found,
  EXISTS (
    SELECT 1 FROM users
    WHERE username = 'owner'
      AND email = 'alex@grandkitchen.com'
  ) AS owner_username_and_email_match,
  (SELECT COUNT(*) FROM users WHERE username = 'owner') AS owner_row_count;

-- 2. Does the target username already exist? (Idempotency check.)
--    Expected before first run: exists=false.
SELECT
  EXISTS (
    SELECT 1 FROM users WHERE username = 'cashier.test'
  ) AS cashier_test_already_exists;

-- NOTE ON EMAIL MATCH:
-- server/storage.ts:941-945 encrypts PII fields (including email) before
-- insert. If USER_PII_FIELDS includes email, the stored value is ciphertext
-- and the plaintext equality check above will return false even when the
-- user exists. If owner_username_found=true but the email check returns
-- false, that is likely the explanation rather than a real mismatch.
-- The seed script decrypts before comparing (it calls
-- storage.getUserByUsername which decrypts), so the script's own runtime
-- check is authoritative.

ROLLBACK;
