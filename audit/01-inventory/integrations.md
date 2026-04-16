# Phase 1 — External Integrations Inventory

**Total external service integrations:** 8

---

## 1. Stripe (Payment Processing — International)

| Aspect | Detail |
|--------|--------|
| **Library** | `stripe` 20.0 + `stripe-replit-sync` 1.0 |
| **API Version** | 2025-02-24.acacia |
| **Config files** | `server/stripeClient.ts`, `server/stripe.ts` |
| **Credentials** | `STRIPE_SECRET_KEY` (env), `STRIPE_PUBLISHABLE_KEY` (env), `STRIPE_WEBHOOK_SECRET` (env); fallback: `platform_settings.stripe_key_secret` (DB) |
| **Webhook** | `POST /api/stripe/webhook` — registered before `express.json()` for raw body access |
| **Usage** | Subscription billing, payment sessions, plan management, price discovery |
| **Called from** | `server/index.ts` (setup), `server/routers/billing.ts` (checkout/subscription), `server/routers/restaurant-billing.ts` (payment sessions) |
| **DB tables** | `stripe.*` schema managed by stripe-replit-sync; `tenants.stripeCustomerId`, `tenants.stripeSubscriptionId` |

## 2. Razorpay (Payment Processing — India/UAE)

| Aspect | Detail |
|--------|--------|
| **Library** | Custom integration (`server/razorpay.ts`) — no npm package |
| **Config file** | `server/razorpay.ts` |
| **Credentials** | `RAZORPAY_KEY_ID` (env), `RAZORPAY_KEY_SECRET` (env), `RAZORPAY_WEBHOOK_SECRET` (env); per-tenant: `tenants.razorpayKeyId`, `tenants.razorpayKeySecret` |
| **Webhook** | `POST /api/webhooks/razorpay` — HMAC-SHA256 signature verification |
| **Usage** | Payment link creation/retrieval for restaurant bills |
| **Called from** | `server/index.ts` (webhook), `server/routers/restaurant-billing.ts` (payment links) |
| **Error handling** | `GatewayDownError` class for network failures; circuit breaker compatible |
| **Payment methods** | Card, UPI, others (derived from Razorpay `payment.method`) |

## 3. Nodemailer / SMTP (Email)

| Aspect | Detail |
|--------|--------|
| **Library** | `nodemailer` 8.0 |
| **Config files** | `server/email.ts`, `server/services/email-service.ts` |
| **Credentials** | `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` / `FROM_EMAIL` (default `noreply@tablesalt.app`) |
| **Usage** | Password reset, staff invitations, reservation reminders, daily reports, shift digests, trial warnings, support replies, welcome email |
| **Called from** | `server/email.ts` (password reset, contact), `server/services/email-service.ts` (transactional), `server/services/daily-report-scheduler.ts`, `server/services/shift-digest-mailer.ts`, `server/services/trial-warning-mailer.ts`, `server/services/reservation-reminders.ts` |
| **Graceful degradation** | Logs to console if SMTP not configured; does not fail requests |

## 4. Twilio (SMS — International)

| Aspect | Detail |
|--------|--------|
| **Library** | REST API (no npm package — uses `fetch`) |
| **Config file** | `server/services/sms-gateway.ts` |
| **Credentials** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| **API endpoint** | `https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json` |
| **Usage** | SMS for non-India phone numbers |
| **Routing** | Auto-selected when phone does NOT match India prefix (+91 or 10-digit local) |
| **Logging** | SMS attempts logged to `sms_log` table |

## 5. MSG91 (SMS — India)

| Aspect | Detail |
|--------|--------|
| **Library** | REST API (no npm package — uses `fetch`) |
| **Config file** | `server/services/sms-gateway.ts` |
| **Credentials** | `MSG91_API_KEY`, `MSG91_SENDER_ID` (default `TBSALT`), `MSG91_FLOW_ID` |
| **API endpoint** | `https://control.msg91.com/api/v5/flow/` |
| **Usage** | SMS for India phone numbers (+91 prefix or 10-digit local) |
| **Routing** | Auto-selected by phone prefix detection in `sms-gateway.ts` |

## 6. Web Push (VAPID Push Notifications)

| Aspect | Detail |
|--------|--------|
| **Library** | `web-push` 3.6 |
| **Config file** | `server/services/push-sender.ts` |
| **Credentials** | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (env); auto-generated and stored in `platform_settings_kv` table if not set |
| **Usage** | Prep task notifications, alerts, order updates to browser-subscribed staff |
| **Functions** | `sendPushToUser()` (per-user), `sendPushToTenant()` (broadcast) |
| **Subscription storage** | `push_subscriptions` table (endpoint, p256dh, auth keys) |
| **Cleanup** | Auto-removes subscriptions returning 410/404 (unsubscribed) |

## 7. AWS S3 (File Storage)

| Aspect | Detail |
|--------|--------|
| **Library** | `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` 3.x |
| **Config file** | `server/services/file-storage.ts` |
| **Credentials** | `AWS_S3_BUCKET`, `AWS_REGION` (default `us-east-1`); AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY from env or IAM role |
| **S3 key format** | `uploads/{UUID}/{originalName}` |
| **Usage** | Restaurant photos, menu item images, documents, receipts |
| **Called from** | `server/routes.ts` (upload endpoints), `server/services/photo-upload.ts` |
| **Fallback** | Local filesystem `./uploads/` directory if `AWS_S3_BUCKET` not set |
| **Functions** | `uploadFile()` (buffer -> S3 or disk), `deleteFile()` (S3 key or local path) |

## 8. Redis (Distributed Pub/Sub)

| Aspect | Detail |
|--------|--------|
| **Library** | `ioredis` 5.10 |
| **Config file** | `server/services/pubsub.ts` |
| **Credentials** | `REDIS_URL` (env, optional) |
| **Usage** | WebSocket event broadcasting across multiple server instances; rate limiter storage |
| **Called from** | `server/realtime.ts` (tenant-scoped pub/sub), `server/security.ts` (rate limit store) |
| **Fallback** | In-process EventEmitter (single-instance only) for pub/sub; in-memory store for rate limits |
| **Channels** | Pattern: `tenant:*` (e.g., `tenant:abc-123`) |
| **Functions** | `publish()`, `subscribe()`, `psubscribe()`, `isRedisEnabled()` |

---

## Integration NOT Found (listed in .env.example but no code usage detected)

| Service | Env Vars | Status |
|---------|----------|--------|
| **OpenAI** | `OPENAI_API_KEY` | Listed in .env.example but no import/usage found in codebase |
| **Cloudinary** | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Listed in .env.example but no import/usage found |
| **Google OAuth** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Listed in .env.example but no Google OAuth strategy implemented |
| **Google Maps** | `GOOGLE_MAPS_API_KEY` | Listed in .env.example but no usage found |
| **Twilio WhatsApp** | `TWILIO_WHATSAPP_NUMBER` | Listed in .env.example but no WhatsApp-specific code found |

---

## Credential Storage Summary

| Integration | Primary Credential Source | Fallback |
|------------|--------------------------|----------|
| Stripe | Environment variable | `platform_settings` DB table |
| Razorpay | Environment variable | Per-tenant in `tenants` table (**plaintext**) |
| SMTP | Environment variable | None (graceful degrade) |
| Twilio | Environment variable | None |
| MSG91 | Environment variable | None |
| VAPID | Environment variable | Auto-generated into `platform_settings_kv` DB table |
| AWS S3 | Environment variable / IAM role | None (falls back to local disk) |
| Redis | Environment variable | None (falls back to EventEmitter) |
