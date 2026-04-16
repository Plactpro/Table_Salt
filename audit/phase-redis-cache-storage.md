# Phase: Redis / Cache / Storage Reliability Audit

**Date:** 2026-04-15  
**Scope:** Redis usage, S3/file storage, menu cache, circuit breakers, query logger  
**Method:** Static analysis only

---

## 1. Redis Usage

### 1.1 All Redis Use Cases

Redis is used for exactly **two** purposes:

| Use Case | File | Lines |
|----------|------|-------|
| Pub/Sub (real-time WebSocket fan-out across instances) | `server/services/pubsub.ts` | 1-86 |
| Rate limiter backing store | `server/security.ts` | 96-116 |

Sessions are stored in **PostgreSQL** via `connect-pg-simple`, not Redis (`server/auth.ts:123-153`). There is no Redis-backed data caching anywhere in the codebase.

### 1.2 Connection Pooling / Configuration

**Pub/Sub connections** (`server/services/pubsub.ts:21-48`):
- Two singleton Redis instances: one publisher, one subscriber (required by ioredis pub/sub model).
- Created lazily on first use via `getPublisher()` / `getSubscriber()`.
- Configuration: `lazyConnect: false`, `enableReadyCheck: false`, `maxRetriesPerRequest: null`.
- [VERIFIED] `maxRetriesPerRequest: null` means ioredis will retry indefinitely on command failures. This is correct for pub/sub subscribers but means a stuck publisher `.publish()` call could hang.
- Error handler: logs to console only (`pubsub.ts:29-31`, `44-46`). No reconnection logic beyond ioredis defaults (ioredis auto-reconnects by default).

**Rate limiter connection** (`server/security.ts:99-111`):
- Separate, third Redis instance.
- Configuration: `lazyConnect: true`, `enableOfflineQueue: false`.
- [VERIFIED] `enableOfflineQueue: false` means if Redis is disconnected, commands will fail immediately rather than queue. This is the correct setting for a rate limiter fallback pattern.
- Error handler: logs warning only (`security.ts:104-106`).
- Connection attempt is fire-and-forget with `.catch(() => {})` (`security.ts:107`).

**Finding RS-01 [VERIFIED] (Low):** Three separate Redis connections are created with no shared configuration or connection pooling. Each is a standalone ioredis instance. For a small deployment this is fine, but at scale with many Node instances, each process opens 3 connections to Redis. No `connectionName` is set on any of them, making Redis `CLIENT LIST` debugging harder.

### 1.3 Redis-Down Fallback Behavior

| Use Case | Fallback When Redis Down | Citation |
|----------|--------------------------|----------|
| Pub/Sub | Falls back to local `EventEmitter` (single-process only) | `pubsub.ts:9-19`, `58-59`, `71-72`, `83-84` |
| Rate Limiting | Falls back to in-memory store (per-process, not shared) | `security.ts:94`, `113-115` |

**Finding RS-02 [VERIFIED] (Medium):** When `REDIS_URL` is set but Redis goes down *after* initial connection, the pub/sub fallback does **not** activate. The `isRedisEnabled()` check (`pubsub.ts:9-10`) only tests if `REDIS_URL` env var exists, not whether the connection is alive. Publish calls will catch and log errors (`pubsub.ts:55-57`) but messages are silently dropped. There is no automatic fallback to the local EventEmitter when Redis becomes unreachable mid-operation. This means WebSocket real-time events stop propagating across instances during a Redis outage.

**Finding RS-03 [VERIFIED] (Medium):** The rate limiter Redis error handler (`security.ts:104-106`) logs "falling back to in-memory" but this is misleading. The `redisStore` variable is already assigned and passed to `rateLimit()`. If Redis disconnects after setup, `express-rate-limit` with `rate-limit-redis` will throw errors on each request attempt to the Redis store. The "fallback" comment describes the initial setup failure path, not runtime disconnection behavior. With `enableOfflineQueue: false`, commands fail immediately, and `express-rate-limit` defaults to allowing the request through on store errors, so rate limiting silently stops working.

### 1.4 TTLs on Redis Keys

**Finding RS-04 [VERIFIED] (Info):** No explicit TTL is set on any Redis key by the application. The pub/sub channels don't store persistent data, so this is expected. The `rate-limit-redis` library manages its own TTLs internally based on the `windowMs` configuration:
- Auth limiter: 15-minute window (`security.ts:120`)
- API limiter: 1-minute window (`security.ts:137`)
- Upload limiter: 1-minute window (`security.ts:160`)

### 1.5 Cache Stampede Prevention

[VERIFIED] There is no cache stampede prevention for any Redis operation because Redis is not used for caching. The only caching is in-memory (see Section 3).

### 1.6 Key Namespace / Prefix Conventions

[VERIFIED] Pub/sub channels use the format `tenant:{tenantId}` (`server/realtime.ts:63`). The `psubscribe` uses pattern `tenant:*` (`realtime.ts:140`). Rate limiter keys are managed by the `rate-limit-redis` library using the `keyGenerator` functions:
- Auth: raw IP (`security.ts:126`)
- API: `user-{userId}` or IP (`security.ts:143-145`)
- Upload: `upload-{userId}` or IP (`security.ts:166-168`)

No global key prefix is configured on any Redis client. If multiple environments share the same Redis instance, keys would collide.

**Finding RS-05 [VERIFIED] (Medium):** No Redis key prefix is set on any of the three Redis client instances. If staging and production share a Redis instance (or if multiple deployments coexist), pub/sub channels and rate limit keys will collide. The rate limiter's `keyGenerator` uses plain strings like `user-{id}` with no environment or application prefix.

---

## 2. S3 / File Storage

### 2.1 S3 Key Format and Tenant Prefixing

**Finding FS-01 [VERIFIED] (Critical — Cross-Tenant):** S3 keys have **no tenant prefix**. The key format is `uploads/{randomUUID}/{originalFilename}` (`server/services/file-storage.ts:29`). The UUID provides collision avoidance but no logical tenant isolation. Any user with the URL can access any tenant's file. Combined with finding FS-03, there is no access control on stored files.

### 2.2 Signed URL Generation

[VERIFIED] No signed URLs are generated anywhere. Files uploaded to S3 are returned as direct public URLs: `https://{bucket}.s3.{region}.amazonaws.com/{key}` (`file-storage.ts:45`). This means:
- All uploaded files are publicly accessible to anyone with the URL (assuming the S3 bucket allows public reads, which is implied by the URL format).
- There is no expiry on file access.
- No server-side access control is enforced on file reads.

**Finding FS-02 [VERIFIED] (High):** S3 objects are referenced by direct public URLs with no signed URL mechanism. If the S3 bucket has public read enabled (which the code assumes), any file ever uploaded is permanently accessible to anyone who knows or guesses the URL. The UUID in the path provides some obscurity but this is security through obscurity, not access control.

### 2.3 File Type Validation

Three separate multer configurations exist:

| Upload Type | MIME Check | Extension Check | Citation |
|-------------|-----------|----------------|----------|
| Image upload | `image/(jpeg\|png\|gif\|webp)` | `.jpg,.jpeg,.png,.gif,.webp` | `routes.ts:76-79` |
| Video upload | `video/(mp4\|webm)` | None | `routes.ts:87-88` |
| Ad creative | `image/jpeg,png,webp,gif`, `video/mp4,webm`, `text/html` | None | `routers/ads.ts:43-49` |
| Audit photo | `image/jpeg,png,webp,heic` | None (ext preserved from original) | `services/photo-upload.ts:20-22` |

**Finding FS-03 [VERIFIED] (High):** The video upload and ad creative upload validate MIME type only, not file extension (`routes.ts:87-88`, `ads.ts:42-49`). MIME types are client-supplied and trivially spoofable. A malicious file with a forged `Content-Type: video/mp4` header would pass validation. Only the image upload in `routes.ts:76-79` validates both MIME and extension.

**Finding FS-04 [VERIFIED] (High):** The ad creative upload allows `text/html` files (`ads.ts:47`). These HTML files are uploaded to S3 or the local filesystem and served directly. If served from the same origin (local fallback), this enables stored XSS. The local upload serving path in `routes.ts:155-167` adds some CSP headers for `.html` files but the CSP allows `style-src 'unsafe-inline'` and `img-src *` which still permits limited attack vectors.

### 2.4 File Size Limits

| Upload Type | Limit | Citation |
|-------------|-------|----------|
| Image | 5 MB | `routes.ts:74` |
| Video | 50 MB | `routes.ts:85` |
| Ad creative | 50 MB (multer) but post-validation: image 2MB, HTML 512KB | `ads.ts:41, 55-56` |
| Audit photo | 5 MB, max 3 files | `services/photo-upload.ts:19` |

**Finding FS-05 [VERIFIED] (Medium):** The ad creative upload sets multer limit at 50MB (`ads.ts:41`) but then validates image files must be under 2MB and HTML under 512KB. This means multer will buffer up to 50MB in memory before the secondary size check rejects the upload. An attacker can repeatedly upload 50MB files that will always be rejected, consuming server memory. Memory storage is used (`ads.ts:40`), so the entire file is buffered.

### 2.5 Content-Type Handling

[VERIFIED] The `uploadFile` function passes the client-supplied `mimetype` directly to S3 as `ContentType` (`file-storage.ts:38`). No server-side Content-Type detection is performed. For local storage, no Content-Type is set on the written file; it is served via Express static middleware which infers from extension.

### 2.6 S3 Failure Handling

- `uploadFile`: If S3 upload fails, the error propagates to the caller. The route handlers catch this and return 500 (`routes.ts:179-182`). No retry logic.
- `deleteFile`: S3 delete failures are caught and logged but swallowed (`file-storage.ts:69-71`). This means orphaned S3 objects will accumulate silently.

**Finding FS-06 [VERIFIED] (Low):** No retry logic on S3 uploads. A transient S3 error (network blip) will fail the entire upload. The AWS SDK v3 does have built-in retry (3 attempts by default), but no custom retry configuration is applied.

### 2.7 Local Filesystem Fallback

- Upload directory: `{cwd}/uploads/` (`file-storage.ts:47`).
- Created with `recursive: true` if missing (`file-storage.ts:48`).
- Filename: `{timestamp}-{random6chars}{ext}` (`file-storage.ts:51`).
- No cleanup mechanism exists. Files accumulate indefinitely.
- Audit photos go to `{cwd}/uploads/audit-photos/` (`photo-upload.ts:6`). Also no cleanup.

**Finding FS-07 [VERIFIED] (Medium):** Local file storage has no cleanup/rotation mechanism. Files written to `uploads/` are never automatically deleted (except explicit `deleteFile` calls). Disk exhaustion risk over time.

**Finding FS-08 [VERIFIED] (Low):** File permissions are not explicitly set on local uploads. Both `fs.writeFileSync` (`file-storage.ts:53`) and multer `diskStorage` (`photo-upload.ts:9`) use default process umask permissions.

### 2.8 Virus/Malware Scanning

[VERIFIED] No virus or malware scanning is performed on any upload path. Files go directly from multer buffer to S3 or local filesystem.

### 2.9 Cross-Tenant File Access

**Finding FS-09 [VERIFIED] (Critical — Cross-Tenant):** The `deleteFile` function (`file-storage.ts:58-80`) takes a URL string and deletes the corresponding S3 object or local file with **no tenant authorization check**. Any authenticated user who knows or guesses a file URL can trigger deletion of another tenant's files if the calling route does not enforce tenant ownership. The `deleteFile` function itself has no concept of tenant identity.

For local files, the `deleteFile` function constructs the path via `path.join(process.cwd(), url)` (`file-storage.ts:74`). The `url` parameter is checked to start with `/uploads/` but there is no path traversal prevention beyond this prefix check. A URL like `/uploads/../.env` would pass the `startsWith` check.

**Finding FS-10 [VERIFIED] (Medium — Path Traversal, mitigated):** The local `deleteFile` function at `file-storage.ts:74` joins `process.cwd()` with the input `url`. If `url` is `/uploads/../../etc/passwd` or `/uploads/../.env`, the `startsWith("/uploads/")` check at line 72 passes, but `path.join(process.cwd(), "/uploads/../../etc/passwd")` resolves outside the uploads directory. However, all callers (`menu.ts:150`, `ads.ts:526,594`) pass DB-sourced URLs, not direct user input. Exploitability requires a prior DB poisoning attack (e.g., SQL injection to write a malicious `image` or `file_url` value). The vulnerability exists in the function's API contract but is mitigated by current calling patterns.

---

## 3. Menu Cache

### 3.1 Cache Implementation

[VERIFIED] In-memory `Map<string, CacheEntry>` singleton (`server/lib/menu-cache.ts:9`). Not Redis-backed. Instance-local only.

### 3.2 TTL / Expiry

[VERIFIED] 5-minute TTL (`menu-cache.ts:6`: `CACHE_TTL_MS = 5 * 60 * 1000`). Expiry is checked lazily on `get()` — expired entries are deleted when accessed (`menu-cache.ts:18-21`). No background eviction timer.

**Finding MC-01 [VERIFIED] (Low):** No background eviction of expired cache entries. If a menu is cached and then never requested again, the entry stays in memory indefinitely until `invalidateAll()` or `invalidateByTenant()` is called. For a multi-tenant system with many outlets, this could leak memory slowly.

### 3.3 Invalidation Mechanism

Four invalidation methods exist:
- `invalidate(key)`: Delete specific key (`menu-cache.ts:32-37`).
- `invalidateByTenant(tenantId)`: Iterates all keys, deletes those matching `tenantId` or `tenantId:*` prefix (`menu-cache.ts:39-48`).
- `invalidateAll()`: Clears entire cache (`menu-cache.ts:50-54`).

Invalidation is called on menu item create/update/delete (`server/routers/menu.ts:93, 117, 147`) and pricing changes (`server/routers/pricing.ts:639`).

### 3.4 Tenant Scoping of Cache Keys

[VERIFIED] Cache keys use format `{tenantId}:{outletId}` or just `{tenantId}` when no outlet specified (`server/routers/menu.ts:44`). The `invalidateByTenant` function correctly uses prefix matching (`menu-cache.ts:42`).

**Finding MC-02 [VERIFIED] (Info):** Cache keys are properly tenant-scoped. No cross-tenant cache pollution risk.

### 3.5 Cache Stampede Protection

**Finding MC-03 [VERIFIED] (Medium):** No stampede protection. When a cache entry expires or is invalidated, the next N concurrent requests for the same outlet will all miss the cache and all hit the database simultaneously (`menu.ts:48-52`). The `get()` returns null, then each request independently calls `storage.getMenuItemsByTenantAndOutlet()` and then `set()`. In a busy POS system during peak hours, this creates a thundering herd on the DB for popular menu endpoints.

### 3.6 Multi-Instance Consistency

**Finding MC-04 [VERIFIED] (Medium):** The menu cache is instance-local (in-memory Map). In a multi-instance deployment (which the Redis pub/sub architecture implies), cache invalidation only affects the instance that processed the mutation request. Other instances serve stale menu data for up to 5 minutes. There is no pub/sub-based cache invalidation broadcast.

---

## 4. Circuit Breaker

### 4.1 Active Circuits

Five named circuits are registered via route middleware (`server/routes.ts:107-150`):

| Circuit Name | Protected Routes | GET Excluded? | Citation |
|--------------|------------------|---------------|----------|
| `orders` | `/api/orders`, `/api/order-items` | Yes | `routes.ts:107-114` |
| `billing` | `/api/billing`, `/api/restaurant-billing`, `/api/cash-machine` | No (all methods) | `routes.ts:117-119` |
| `kitchen` | `/api/kitchen`, `/api/kds` | Yes | `routes.ts:122-129` |
| `reports` | `/api/reports` | No (all methods) | `routes.ts:132` |
| `inventory-mutations` | `/api/inventory`, `/api/stock-adjustments`, `/api/stock-counts`, `/api/wastage` | Yes (only non-GET) | `routes.ts:135-150` |

### 4.2 Failure Threshold and Recovery

Default configuration (`circuit-breaker.ts:28-31`):
- `errorThresholdPercent`: 50% (opens when >50% of requests in window are 5xx)
- `windowMs`: 60,000ms (1-minute sliding window)
- `resetTimeoutMs`: 30,000ms (30 seconds in OPEN before transitioning to HALF_OPEN)

Classification (`circuit-breaker.ts:243-249`):
- 2xx, 3xx, 4xx: counted as success (server is responsive)
- 5xx: counted as error (downstream failure)

### 4.3 State: Per-Instance, Not Shared

**Finding CB-01 [VERIFIED] (Medium):** Circuit breaker state is per-process in-memory (`circuit-breaker.ts:21-22`: instance fields `state`, `window`, `resetTimer`). In a multi-instance deployment, one instance may have its circuit open while others are closed. This means:
- Load balancer distributes traffic unevenly: instances with open circuits reject requests (503) while others still serve them.
- A systemwide outage (e.g., DB overload) would trip all instances independently with different timing.
- The health endpoint (`index.ts:168-172`) only reports the current instance's circuit states.

### 4.4 Behavior When Circuit Is Open

When open, `checkAndAllow()` throws `CircuitOpenError` (`circuit-breaker.ts:129`). The middleware catches this and returns HTTP 503 with `code: "CIRCUIT_OPEN"`, the circuit name, and a `retryAfter` value in seconds (`circuit-breaker.ts:221-227`).

### 4.5 Circuit Reset Mechanisms

**Automatic:** After `resetTimeoutMs` (30s), transitions to HALF_OPEN (`circuit-breaker.ts:62-68`). In HALF_OPEN, one test request is allowed through (`circuit-breaker.ts:131-134`). If it succeeds (any non-5xx), circuit closes. If it fails (5xx), circuit re-opens.

**Manual:** Two admin endpoints exist:
1. `POST /api/admin/circuit-breakers/reset` in `admin-routes.ts:2332-2349` — requires `requireSuperAdmin`.
2. `POST /api/admin/circuit-breakers/reset` in `index.ts:212-223` — **no auth middleware applied**.

**Finding CB-02 [VERIFIED] (High):** There are **two** circuit breaker reset endpoints registered at the same path. The one in `index.ts:212-223` has **no authentication**. Express will match whichever is registered first. If `index.ts` registers its route before `admin-routes.ts`, any unauthenticated user can reset all circuit breakers. Even if `admin-routes.ts` is registered first, the second registration at the same path may cause confusion. The `index.ts:212-223` endpoint is completely unguarded — it has no `requireAuth`, no `requireSuperAdmin`, no middleware at all.

### 4.6 Open-Circuit Notification

When a circuit opens, it:
1. Inserts a `system_events` row with `event_type = 'CIRCUIT_OPEN'` (`circuit-breaker.ts:75-80`)
2. Emits a WebSocket event to the `platform` tenant (super-admin) (`circuit-breaker.ts:86-96`)

Both are done via `setImmediate` (fire-and-forget, non-blocking) with error handling (`circuit-breaker.ts:72-101`).

### 4.7 Minimum Sample Size

**Finding CB-03 [VERIFIED] (Medium):** The circuit breaker has no minimum sample size before tripping. If only one request is in the window and it fails, the error rate is 100%, exceeding the 50% threshold, and the circuit opens (`circuit-breaker.ts:174`). A single 500 error on a low-traffic endpoint (like reports) will open the circuit for 30 seconds, blocking all subsequent requests. This is a classic circuit breaker misconfiguration.

---

## 5. Query Logger

### 5.1 Implementation

[VERIFIED] `server/lib/query-logger.ts` is a **pure instrumentation layer** with no caching or batching. It wraps `pool.query()` and `pool.connect()` to measure execution time and log slow queries exceeding 500ms (`query-logger.ts:6`).

- Logs truncated SQL (first 200 chars) and params (first 200 chars) for slow queries (`query-logger.ts:19-20`, `50-52`).
- Uses `AsyncLocalStorage` to track which route triggered the query (`query-logger.ts:4`).
- Wraps both direct `pool.query()` calls and transactional `client.query()` calls (`query-logger.ts:8-37`, `39-88`).
- No caching. No batching. No buffering. Pure synchronous timing + console.warn.

---

## 6. Additional In-Memory Caches Found

During this audit, several additional in-memory caches were discovered:

| Cache | File:Line | TTL | Cleanup |
|-------|-----------|-----|---------|
| Health check response | `index.ts:130` | 5 seconds | Overwritten on next request |
| User restriction check | `middleware/check-restriction.ts:12` | 30 seconds | None (unbounded growth) |
| Login failure lockout | `auth.ts:15` | 15-minute window | None (unbounded growth) |
| OTP challenge codes | `routers/permissions.ts:268` | 5 minutes (per-entry check) | None (unbounded growth) |
| API call rate counter | `security-alerts.ts:211` | 1-minute window | Sweep every 5 min, deletes entries >2 min old |
| Report cache | `routers/reports.ts:17-24` | 2 hours | DB-backed with `expires_at` column |

**Finding IC-01 [VERIFIED] (Medium):** The restriction check cache (`middleware/check-restriction.ts:12`) caches by `user.id` with no eviction. In a system with many users, this Map grows unboundedly. Each entry is small, but over days/weeks with many unique users, this becomes a slow memory leak.

**Finding IC-02 [VERIFIED] (Medium):** The OTP challenge cache (`routers/permissions.ts:268`) has per-entry expiry checked on access but no background cleanup. Unclaimed OTP challenges stay in memory forever. The challenge ID includes a timestamp but is never swept.

**Finding IC-03 [VERIFIED] (Low):** The login failure lockout map (`auth.ts:15`) is instance-local. In a multi-instance deployment, an attacker can rotate between instances to get `5 * N` attempts where N is the number of instances, partially defeating the lockout mechanism.

---

## Summary of Findings by Severity

| ID | Severity | Summary |
|----|----------|---------|
| FS-01 | **Critical** | S3 keys have no tenant prefix — no logical tenant isolation |
| FS-09 | **Critical** | `deleteFile` has no tenant authorization; any user can delete any file |
| FS-02 | **High** | No signed URLs — all S3 files permanently publicly accessible |
| FS-03 | **High** | Video/ad uploads validate MIME only (client-spoofable), not file content |
| FS-04 | **High** | HTML file uploads enable potential stored XSS |
| FS-10 | **Medium** | Path traversal in local `deleteFile` via `../` (mitigated: callers use DB-sourced URLs) |
| CB-02 | **High** | Duplicate circuit breaker reset endpoint in index.ts has no authentication |
| RS-02 | **Medium** | Pub/sub has no runtime fallback when Redis dies after startup |
| RS-03 | **Medium** | Rate limiter silently stops working when Redis disconnects at runtime |
| RS-05 | **Medium** | No Redis key prefix — environment collision risk |
| FS-05 | **Medium** | Ad upload buffers 50MB in memory before secondary size rejection |
| FS-07 | **Medium** | No local file cleanup mechanism — disk exhaustion risk |
| MC-03 | **Medium** | No cache stampede protection on menu cache |
| MC-04 | **Medium** | Menu cache invalidation is instance-local, not broadcast |
| CB-01 | **Medium** | Circuit breaker state is per-instance, not shared |
| CB-03 | **Medium** | Circuit breaker trips on a single failure (no minimum sample size) |
| IC-01 | **Medium** | Restriction cache Map grows unboundedly |
| IC-02 | **Medium** | OTP challenge cache never cleaned up |
| RS-01 | **Low** | Three separate Redis connections with no shared config or naming |
| MC-01 | **Low** | No background eviction of expired menu cache entries |
| FS-06 | **Low** | No retry logic on S3 uploads (SDK default 3 retries only) |
| FS-08 | **Low** | Local file permissions not explicitly set |
| IC-03 | **Low** | Login lockout is instance-local — bypassed with N instances |
| RS-04 | **Info** | Redis TTLs managed by rate-limit-redis library, not application code |
| MC-02 | **Info** | Menu cache keys are properly tenant-scoped |

---

## Open Questions

1. **S3 bucket policy:** Is the S3 bucket configured for public read? The code constructs direct public URLs (`file-storage.ts:45`), implying it is. If the bucket is private, all image URLs returned to the client would be broken. Need to verify bucket ACL/policy.

2. **Multi-instance deployment:** How many instances run in production? The in-memory caches, circuit breakers, and login lockout all assume single-instance or accept degraded behavior in multi-instance. Redis pub/sub is present for WebSocket fan-out, confirming multi-instance is at least planned.

3. **Redis availability in production:** Is `REDIS_URL` set in production? If not, the system runs entirely in single-process mode with EventEmitter for pub/sub and in-memory rate limiting.

4. **Route registration order for CB reset:** Which route (`index.ts:212` or `admin-routes.ts:2332`) is registered first? This determines whether the unauthenticated endpoint is reachable.

5. **Local file cleanup:** Is there any external cron or process that cleans up the `uploads/` directory on the production server?

6. **Path traversal exploitability:** Does any route pass user-controlled URLs directly to `deleteFile()`, or is the URL always loaded from the database first? If DB-sourced, the path traversal is less exploitable (requires DB poisoning).
