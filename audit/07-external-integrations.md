# Phase 7: External Integration Security & Reliability Audit

Date: 2026-04-15
Auditor: Claude Opus 4.6

---

## 1. Stripe Integration (end-to-end)

### 1.1 Client Initialization

**Files:** `server/stripeClient.ts`, `server/stripe.ts`

The Stripe client is initialized from `STRIPE_SECRET_KEY` env var (line 9). An empty-string fallback is used (`|| ""`), but `getUncachableStripeClient()` throws if the key is empty (line 14). [VERIFIED]

There is a secondary Stripe client path via `getPaymentStripeClient()` (`server/stripe.ts:17-23`) that first checks for a `stripe_key_secret` stored in the `platform_settings` DB table (line 10). This means **two different Stripe accounts** can be active simultaneously:
- The env-var key for subscription billing
- The DB-stored key for payment processing

**Finding (existing F-054):** [VERIFIED] The platform Stripe secret is stored in `platform_settings.stripe_key_secret` as plaintext -- no encryption applied at write time (`server/admin-routes.ts:1511-1521`). The `encryptField` utility exists in the codebase but is not used for gateway credentials.

### 1.2 Price Discovery & Plan Mapping

**File:** `server/stripe.ts:69-93`

`discoverPriceIds()` fetches all active prices from Stripe, matches products by `metadata.plan_key`, and populates an in-memory `STRIPE_PRICE_IDS` map. This runs at startup (`server/index.ts:568`). [VERIFIED]

- Plans: `basic`, `standard`, `premium` (line 77)
- `planFromPriceId()` defaults to `"basic"` if a price ID is unrecognized (line 47) -- a downgrade if the mapping is stale.
- Price IDs are stored only in memory -- a new Stripe price requires server restart or webhook-triggered rediscovery.

### 1.3 Subscription Checkout Flow

**File:** `server/routers/billing.ts:138-184`

1. `POST /api/billing/create-checkout-session` -- requires `owner`, `franchise_owner`, or `hq_admin` role (line 141).
2. Creates a Stripe Checkout Session in `subscription` mode (line 160).
3. `tenantId` and `plan` stored in session metadata (line 166).
4. If tenant has no `stripeCustomerId`, sets `customer_creation: "always"` (line 163).
5. On Stripe error, distinguishes gateway outages (503) from app errors (500) (lines 172-183). Gateway failures logged to `system_events` table. [VERIFIED]

**Security:** Role check is correct. Plan validated against whitelist (line 148). No price manipulation -- priceId comes from server-side discovery, not client.

### 1.4 Plan Changes

Plan changes are handled entirely through the **Stripe Billing Portal** (`POST /api/billing/portal`, lines 186-222). The app delegates upgrade/downgrade/cancellation to Stripe's hosted UI. Plan changes arrive back via the `customer.subscription.updated` webhook event.

There is NO direct plan change endpoint in the app (besides F-023: the tenant PATCH that lets owners self-set `plan`).

### 1.5 Webhook Events Handled

**File:** `server/routers/billing.ts:224-372`

The billing webhook at `POST /api/webhooks/stripe` handles 4 event types:

| Event | Action | Lines |
|-------|--------|-------|
| `checkout.session.completed` | Dual purpose: (a) subscription activation -- sets plan, status, stripeCustomerId, stripeSubscriptionId; (b) order/guest payment -- marks orders paid, frees tables, deducts inventory | 256-315 |
| `customer.subscription.updated` | Resolves tenant by customer, maps Stripe status to local status, updates plan from price ID | 317-338 |
| `customer.subscription.deleted` | Resets tenant to `basic` plan, status `canceled`, clears subscription ID | 340-350 |
| `invoice.payment_failed` | Sets tenant to `past_due` status | 352-362 |

**Notable:** `checkout.session.completed` branches on `metadata.orderPayment === "true"` (line 258) for restaurant order payments vs. subscription payments. The order payment branch marks orders as `paid` and handles kiosk inventory deduction.

### 1.6 Signature Verification

**File:** `server/routers/billing.ts:228-242`

- Uses `stripeClient.webhooks.constructEvent(rawBody, sig, webhookSecret)` (line 238).
- The Stripe SDK internally uses `crypto.timingSafeEqual` for HMAC verification. [VERIFIED -- this is standard Stripe SDK behavior]
- `rawBody` is captured via `express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })` at `server/index.ts:108-113`. [VERIFIED]
- Webhook secret comes from `STRIPE_WEBHOOK_SECRET` env var (line 231).

**There is a SECOND Stripe webhook** at `POST /api/stripe/webhook` (`server/index.ts:42-62`) for `stripe-replit-sync`. This uses `express.raw()` and delegates to `sync.processWebhook()`. Both endpoints coexist.

### 1.7 Idempotency

**Partial.** For `checkout.session.completed` order payments, there is a check `orderToUpdate.status !== "paid"` (line 263). For subscription events, no idempotency guard -- re-processing the same event re-applies the update (which is safe since it's an idempotent set operation on the tenant record). For guest payments (line 280), all unpaid orders for the table are marked paid without checking for duplicates.

**Finding F-180 [NEW, Medium, Idempotency]:** `checkout.session.completed` guest payment path (`server/routers/billing.ts:276-293`) fetches ALL orders for a table and marks unpaid ones as paid. There is no event deduplication -- if the webhook is retried, this code runs again (harmless on second run since orders are already paid, but the table/session release calls are re-executed).

### 1.8 Amount Reconciliation

**Finding (existing F-105):** [VERIFIED] `checkout.session.completed` for order payments does NOT verify the Stripe payment amount against the order total. The order is marked paid regardless of the actual amount charged (`server/routers/billing.ts:262-263`).

**Finding (existing F-105, subscription path):** For subscriptions, amount reconciliation is N/A -- Stripe manages recurring billing amounts.

### 1.9 Webhook Delivery Failure

If processing fails after signature verification, the handler returns HTTP 500 (line 368). Stripe will retry per its standard exponential backoff (up to ~3 days). There is no dead-letter queue or manual retry mechanism in the app. On signature verification failure, returns 400 (line 241). [VERIFIED]

### 1.10 Webhook Secret Storage

The webhook secret is stored as the `STRIPE_WEBHOOK_SECRET` environment variable (`server/routers/billing.ts:231`). Not in the database. [VERIFIED]

### 1.11 stripe-replit-sync

**File:** `server/stripeClient.ts:29-42`, `server/index.ts:534-562`

`stripe-replit-sync` (npm package `^1.0.0`, `package.json:110`) is a Stripe data synchronization library. It:

1. **Runs DB migrations** creating `stripe.*` schema tables (`server/index.ts:537-544`).
2. **Registers a managed webhook** at `/api/stripe/webhook` via `findOrCreateManagedWebhook()` (line 552). This auto-creates the webhook endpoint in the Stripe dashboard.
3. **Backfills** existing Stripe data via `syncBackfill()` (line 555) -- runs asynchronously, non-blocking.
4. **Processes webhook events** via `sync.processWebhook()` (`server/index.ts:55`) -- keeps local `stripe.*` tables in sync with Stripe objects.

**Finding (existing F-104):** [VERIFIED] This is Replit-specific infrastructure. On Railway deployment, it creates unnecessary DB tables and a redundant webhook endpoint. The managed webhook at `/api/stripe/webhook` runs in parallel with the app webhook at `/api/webhooks/stripe` -- both receive the same events.

---

## 2. Razorpay Integration (end-to-end)

### 2.1 Payment Link Creation

**File:** `server/razorpay.ts:51-89`

Flow:
1. `createPaymentLink()` accepts `amountRupees`, `currency`, `description`, `billId`, and optional per-tenant credentials.
2. Converts to paise: `Math.round(params.amountRupees * 100)` (line 60).
3. Sets `reference_id` to `billId` (line 67) -- used for webhook reconciliation.
4. Links expire in 15 minutes (`expire_by: Math.floor(Date.now() / 1000) + 900`, line 69).
5. Notifications disabled (line 68).

**Finding (existing F-101):** [VERIFIED] `Math.round(amount * 100)` is a floating-point risk. For example, `19.99 * 100 = 1998.9999999999998`, which rounds correctly, but `0.29 * 100 = 28.999999999999996` rounds to 29 (correct). Edge cases exist for certain values.

**Finding (existing F-106):** [VERIFIED] The `* 100` conversion assumes a centesimal currency. For BHD (3 decimal places) or JPY (0 decimals), this produces wrong amounts.

### 2.2 Credential Resolution

**File:** `server/razorpay.ts:35-40`

`getCredentials()` checks per-tenant keys first, falls back to global env vars:
```
const keyId = tenantKeyId || process.env.RAZORPAY_KEY_ID;
const keySecret = tenantKeySecret || process.env.RAZORPAY_KEY_SECRET;
```

Per-tenant credentials stored in `tenants.razorpayKeyId` / `tenants.razorpayKeySecret` (plaintext, per F-012).

### 2.3 Webhook Handler

**File:** `server/index.ts:64-106`

- Registered BEFORE `express.json()` with `express.raw()` to get the raw body (line 67).
- Handles event `payment_link.paid` only (line 78).
- Resolves bill via `reference_id` from the payment link entity (line 83).
- Calls `finalizeBillCompletion()` to mark bill paid, record payment, free table, accrue loyalty.

### 2.4 Signature Verification -- TIMING ATTACK

**File:** `server/razorpay.ts:109-114`

```typescript
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;  // LINE 113: Non-constant-time comparison
}
```

**Finding (existing F-045):** [VERIFIED] Uses `===` instead of `crypto.timingSafeEqual()`. The comparison is vulnerable to timing attacks. An attacker can byte-by-byte brute-force the HMAC signature by measuring response times.

### 2.5 Idempotency

**File:** `server/index.ts:85`

```typescript
if (bill && bill.paymentStatus !== "paid") {
```

The check `bill.paymentStatus !== "paid"` provides basic idempotency, but:

**Finding (existing F-044):** [VERIFIED] No database-level lock. Concurrent webhook delivery AND polling (`restaurant-billing.ts:1185-1197`) can both check `paymentStatus !== "paid"` simultaneously, both pass the check, and both call `finalizeBillCompletion()`. This creates duplicate payment records and double loyalty accrual.

### 2.6 Amount Reconciliation

**Finding (existing F-103):** [VERIFIED] The webhook handler passes `pl.amount / 100` as `amountStr` (`server/index.ts:95`) but `finalizeBillCompletion()` uses this amount only for recording the payment row -- it does NOT compare it against `bill.totalAmount` (`server/routers/restaurant-billing.ts:64-68`). A payment link for a different amount would be accepted.

### 2.7 Per-Tenant Webhook Secret

**Finding (existing F-050):** [VERIFIED] `RAZORPAY_WEBHOOK_SECRET` is a single global env var (`server/razorpay.ts:110`). All tenants share the same webhook secret, even though they can have different Razorpay credentials (per-tenant `keyId`/`keySecret`). This means:
- If tenant A's webhook secret is compromised, all tenants are affected.
- There is no way to have per-tenant webhook endpoints.

---

## 3. Email / SMTP

### 3.1 SMTP Transporter Configuration

**Files:** `server/email.ts:4-19`, `server/services/email-service.ts:3-21`

There are **two separate transporter factories** -- a code duplication issue:

| File | Function | Used By |
|------|----------|---------|
| `server/email.ts:4-18` | `createTransport()` | Password reset, sales/support stubs |
| `server/services/email-service.ts:3-21` | `getSmtpTransport()` | Welcome, trial warning, staff invite, support reply |

Both read `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` from env vars. Minor difference: `email.ts` checks `SMTP_SECURE` env var; `email-service.ts` derives secure mode from port (`port === 465`).

### 3.2 Connection Pooling

**No connection pooling.** Both factories create a new `nodemailer.createTransport()` on every call. `createTransport()` in `email.ts` is called per send. `getSmtpTransport()` in `email-service.ts` is called per send. No singleton, no pool.

**Finding F-181 [NEW, Low, Performance]:** [VERIFIED] `server/services/email-service.ts:32` creates a new SMTP transport for every email send. Under load (e.g., batch trial warning emails), this creates a TCP connection per email with no reuse.

### 3.3 Failure Handling

**File:** `server/services/email-service.ts:45-48`

On SMTP failure:
- Error is caught, logged to console (`console.error`), and **swallowed** (line 45-48).
- No retry, no queue, no dead-letter.
- The caller gets no indication of failure.

**File:** `server/email.ts:36` -- password reset email: throws on failure (no try/catch in `sendPasswordResetEmail`). The caller in `server/routers/auth.ts` must handle the error.

**Finding F-182 [NEW, Medium, Reliability]:** [VERIFIED] `server/services/email-service.ts:45-48` -- all email types (welcome, trial warning, staff invite, support reply) silently swallow SMTP errors. The user sees a success response even if the email was never sent. Staff invite emails contain the temporary password -- if this email fails, the staff member has no way to get their credentials.

### 3.4 PII in Email Logs

**File:** `server/services/email-service.ts:44,46`

```typescript
console.log(`[EmailService] Sent "${opts.subject}" to ${opts.to}`);
console.error(`[EmailService] Failed to send email to ${opts.to}: ${err.message}`);
```

- Recipient email address logged on every send (line 44) and every failure (line 46). [VERIFIED]
- Password reset email: redacted (`server/email.ts:48` -- "email redacted for security"). [VERIFIED]
- Staff invite: the email body contains the temporary password -- but this is not logged (only the `to` address is logged). [VERIFIED]

**File:** `server/email.ts:67-68` -- Sales email logging includes `businessName` and `businessType` (PII/business data) to console.

### 3.5 Rate Limiting

No rate limiting on email sends. No per-tenant throttle. No global throttle. A compromised account could trigger unlimited password reset emails or staff invites.

### 3.6 Email Types Sent

| # | Type | File | Line | Description |
|---|------|------|------|-------------|
| 1 | Password Reset | `email.ts` | 23-49 | Token-based reset link, 1hr expiry |
| 2 | Welcome | `email-service.ts` | 50-70 | Post-registration, mentions 14-day trial |
| 3 | Trial Warning | `email-service.ts` | 72-96 | 1/3/7 day warnings before trial expires |
| 4 | Staff Invite | `email-service.ts` | 98-132 | Contains temp password in plaintext |
| 5 | Support Reply | `email-service.ts` | 134-154 | Admin reply to support ticket |
| 6 | Sales Inquiry (stub) | `email.ts` | 66-70 | Logs only, no actual send |
| 7 | Support Email (stub) | `email.ts` | 72-77 | Logs only, no actual send |

**Finding F-183 [NEW, Medium, Security]:** [VERIFIED] `server/services/email-service.ts:121` -- Staff invite email contains the temporary password in the HTML body (`${tempPassword}`) and plaintext body (line 131). This password is sent over SMTP, potentially unencrypted if TLS is not enforced. The same password is also returned in the HTTP response (`server/admin-routes.ts:1164`).

---

## 4. SMS (Twilio + MSG91)

### 4.1 Provider Selection

**File:** `server/services/sms-gateway.ts:43-46`

```typescript
const cleaned = phone.replace(/[^+d]/g, "");  // BUG: \d not [^+d]
const isIndia = cleaned.startsWith("+91") || cleaned.startsWith("91") || (cleaned.length === 10 && !cleaned.startsWith("+"));
const result = isIndia ? await sendViaMSG91(cleaned, message, tenantId) : await sendViaTwilio(cleaned, message);
```

- India (+91) -> MSG91 flow-based API
- International -> Twilio
- Selection based on phone number prefix, not tenant region.

**Finding F-184 [NEW, Medium, Bug]:** [VERIFIED] `server/services/sms-gateway.ts:44` -- The regex `/[^+d]/g` is incorrect. It strips everything except `+` and the literal character `d`, not digits. The correct regex should be `/[^+\d]/g`. This means digit characters ARE stripped from phone numbers, breaking SMS delivery entirely. Only numbers that are already clean (no formatting) would work.

### 4.2 Error Handling & Retry

No retry on failure. Both `sendViaMSG91` and `sendViaTwilio` catch all errors and return `{ sent: false, error: "..." }` (lines 18-20, 38-40). The caller (`sendSms`) does not retry. [VERIFIED]

### 4.3 SMS Logging

**File:** `server/services/sms-gateway.ts:48-53`

Every SMS attempt is logged to `sms_log` table:

```sql
INSERT INTO sms_log (tenant_id, phone, message, provider, sent, message_id, error) VALUES (...)
```

**Schema** (`server/admin-migrations.ts:4177-4187`):
- `phone VARCHAR(20)` -- full phone number stored
- `message TEXT` -- full SMS content stored (truncated to 500 chars, line 51)
- `provider`, `sent`, `message_id`, `error` -- operational data

**Finding F-185 [NEW, Medium, Privacy]:** [VERIFIED] `server/services/sms-gateway.ts:50-51` -- Full phone numbers and SMS message content stored in `sms_log` table without encryption. PII retention with no documented cleanup policy.

**Finding F-186 [NEW, Low, Bug]:** [VERIFIED] `server/services/sms-gateway.ts:50` -- The SQL query uses placeholder `VALUES (,,,,,,)` without `$1,$2,...` parameter markers. This SQL will fail on execution -- no SMS is actually logged. The `catch((_) => {})` on line 53 silently swallows this error.

### 4.4 Rate Limiting / Cost Protection

No rate limiting on SMS sends. No per-tenant SMS budget or quota. No global send limit. A single `sendSms` call is made per table-ready notification (`server/routers/tables.ts:295`), but there is no protection against a malicious actor triggering thousands of notifications.

**Finding F-187 [NEW, High, Cost/Abuse]:** [VERIFIED] `server/routers/tables.ts:295` -- SMS send is triggered by `POST /api/waitlist/:id/notify` (requires waiter+ role). No rate limit per tenant, per phone number, or per time window. A compromised waiter account could send unlimited SMS messages, incurring Twilio/MSG91 charges with no cap.

### 4.5 Per-Tenant SMS Limiting

None. The `tenantId` is passed for logging purposes only. No per-tenant quota, budget, or configuration.

---

## 5. Web Push

### 5.1 VAPID Key Management

**File:** `server/services/push-sender.ts:36-54`

Initialization priority:
1. `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` env vars (line 39-40)
2. DB lookup in `platform_settings_kv` table (line 9-13)
3. Auto-generate and store in DB (lines 19-29)

**Finding (existing F-002):** VAPID keys were found hardcoded in `.replit` file.

The auto-generation path is a reasonable fallback, but the private key is stored in `platform_settings_kv` as plaintext (line 24-25). [VERIFIED]

`VAPID_SUBJECT` defaults to `"mailto:admin@tablesalt.app"` (line 49). [VERIFIED]

### 5.2 Subscription Storage & Cleanup

**File:** `server/services/push-sender.ts:72-74, 90-94`

Subscriptions stored in `push_subscriptions` table with `user_id`, `endpoint`, `p256dh`, `auth` columns.

**Cleanup:** On 410 (Gone) or 404 (Not Found) response from push service, the subscription is deleted (lines 90-94, 126-129). [VERIFIED]

No periodic cleanup of stale subscriptions beyond the push-failure path.

### 5.3 Push Failure Handling

**File:** `server/services/push-sender.ts:87-97`

```typescript
try {
  await webpush.sendNotification(subscription, notification);
} catch (err: any) {
  if (err.statusCode === 410 || err.statusCode === 404) {
    await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [row.endpoint]);
  } else {
    console.warn(`[PushSender] Failed to send push to endpoint: ${err.message}`);
  }
}
```

- 410/404: Subscription deleted (correct)
- Other errors (429, 500, network): Logged and ignored. No retry. No dead-letter.
- Uses `Promise.allSettled()` (line 81) so one failed push doesn't block others. [VERIFIED]

### 5.4 Rate Limiting

No rate limiting on push sends. `sendPushToTenant()` (line 103) sends to ALL subscriptions for a tenant without batching or throttling. A tenant with 1000+ subscriptions would fire 1000 concurrent HTTP requests to push services. [VERIFIED]

**Finding F-188 [NEW, Low, Performance]:** [VERIFIED] `server/services/push-sender.ts:116-133` -- `sendPushToTenant()` fires all push notifications in parallel via `Promise.allSettled()` with no concurrency limit. Large tenants could overwhelm the push service or trigger rate limiting.

---

## 6. Third-Party Webhooks (Aggregators)

### 6.1 Supported Aggregators

**File:** `server/aggregator-adapters.ts:213-218`

Four adapters registered:
- **Talabat** (lines 158-211)
- **Swiggy** (lines 37-75)
- **Zomato** (lines 77-115)
- **UberEats** (lines 117-155)

### 6.2 Two Sets of Webhook Endpoints

There are **two separate webhook systems** for aggregators:

#### A. Generic adapter-based endpoint (PRODUCTION)

**File:** `server/routers/channels.ts:179-255`

`POST /api/aggregator/webhook/:platform` -- a public unauthenticated endpoint that:
1. Reads signature headers (lines 183-187) but **NEVER VERIFIES THEM** (no HMAC check follows)
2. Logs the webhook to `webhook_events` table (lines 191-200)
3. Resolves tenant from channel config (lines 205-214)
4. Parses order via adapter and creates it in the database

**Finding F-189 [NEW, Critical, Auth]:** [VERIFIED] `server/routers/channels.ts:179-254` -- The `/api/aggregator/webhook/:platform` endpoint reads signature headers (`x-talabat-signature`, `x-zomato-signature`, `x-hub-signature-256`) at lines 183-187 but NEVER validates them. The comment on line 181 says "HMAC signature verification" but no verification code exists. Any unauthenticated request can inject fraudulent orders into any tenant's order stream by knowing the platform slug.

#### B. Stub endpoints (UNUSED)

**File:** `server/routers/service-coordination.ts:731-777`

Three stub endpoints at `/api/webhooks/zomato`, `/api/webhooks/swiggy`, `/api/webhooks/ubereats` that:
1. Check a Bearer token from `Authorization` header
2. Log the payload
3. Return `{ received: true }` with no processing

### 6.3 Hardcoded Default Tokens

**Finding (existing F-141):** [VERIFIED] `server/routers/service-coordination.ts:734,750,766`

```typescript
const expectedToken = process.env.ZOMATO_WEBHOOK_TOKEN || "zomato-webhook-token";   // line 734
const expectedToken = process.env.SWIGGY_WEBHOOK_TOKEN || "swiggy-webhook-token";   // line 750
const expectedToken = process.env.UBEREATS_WEBHOOK_TOKEN || "ubereats-webhook-token"; // line 766
```

All three default to trivially guessable strings. The token comparison uses `!==` (non-constant-time). However, these endpoints are currently stubs and do not process orders.

### 6.4 Aggregator Webhook -- No Tenant Scoping

**File:** `server/routers/channels.ts:204-214`

The generic webhook resolves tenant from the `order_channels` table by matching the platform slug:
```sql
SELECT oc.id, cc.tenant_id ... FROM order_channels oc JOIN channel_configs cc ON cc.channel_id = oc.id WHERE oc.slug = $1 AND oc.active = true LIMIT 1
```

**Finding F-190 [NEW, High, Multi-Tenancy]:** [VERIFIED] `server/routers/channels.ts:210-213` -- The query uses `LIMIT 1` when matching by platform slug. If multiple tenants have a channel with slug `"zomato"`, only the first (arbitrary) tenant receives the order. There is no way to route a webhook to the correct tenant -- the endpoint has no tenant identifier in the URL or payload mapping.

### 6.5 Aggregator Ingest (Authenticated)

**File:** `server/routers/channels.ts:114-177`

`POST /api/aggregator/ingest` requires `owner` or `manager` role (line 114). This is a manual order import endpoint, properly tenant-scoped via `user.tenantId`. [VERIFIED]

---

## Summary of New Findings

| ID | Severity | Category | File | Line(s) | Description |
|----|----------|----------|------|---------|-------------|
| F-180 | Medium | Idempotency | `server/routers/billing.ts` | 276-293 | Stripe checkout guest payment path re-executes table/session release on webhook retry |
| F-181 | Low | Performance | `server/services/email-service.ts` | 32 | New SMTP transport created per email -- no connection pooling |
| F-182 | Medium | Reliability | `server/services/email-service.ts` | 45-48 | All email sends silently swallow SMTP errors -- staff invite password may never arrive |
| F-183 | Medium | Security | `server/services/email-service.ts` | 121,131 | Staff invite sends temp password in email body over potentially unencrypted SMTP |
| F-184 | Medium | Bug | `server/services/sms-gateway.ts` | 44 | Regex `/[^+d]/g` strips digits instead of non-digits -- SMS phone cleaning broken |
| F-185 | Medium | Privacy | `server/services/sms-gateway.ts` | 50-51 | Full phone numbers and SMS content stored in `sms_log` unencrypted, no retention policy |
| F-186 | Low | Bug | `server/services/sms-gateway.ts` | 50 | SQL INSERT uses `(,,,,,,)` without `$1-$7` params -- query always fails, silently swallowed |
| F-187 | High | Cost/Abuse | `server/routers/tables.ts` | 295 | No rate limit on SMS sends -- unlimited Twilio/MSG91 charges via notification endpoint |
| F-188 | Low | Performance | `server/services/push-sender.ts` | 116-133 | `sendPushToTenant()` fires all pushes in parallel with no concurrency limit |
| F-189 | Critical | Auth | `server/routers/channels.ts` | 179-254 | Aggregator webhook reads signature headers but NEVER validates them -- unauthenticated order injection |
| F-190 | High | Multi-Tenancy | `server/routers/channels.ts` | 210-213 | Aggregator webhook uses `LIMIT 1` on platform slug -- misroutes orders when multiple tenants use same platform |

---

## Open Questions

1. **stripe-replit-sync on Railway:** Is the `stripe-replit-sync` package functional on Railway, or does it fail silently? Does it attempt to register webhooks with Stripe on every startup?
2. **Razorpay multi-tenant webhooks:** How are tenants with their own Razorpay credentials supposed to receive webhooks? The global webhook secret cannot validate signatures from different Razorpay accounts.
3. **SMS actually working?** Given the broken regex (F-184) and broken SQL (F-186), has SMS ever successfully worked in production?
4. **Aggregator webhook routing:** Is the intent for `/api/aggregator/webhook/:platform` to support multi-tenant delivery? If so, how would the platform distinguish between tenants (URL path, payload field, separate webhook URLs per tenant)?
5. **Email delivery monitoring:** With all email failures silently swallowed, how is the team aware of SMTP outages or misconfigurations?
