import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import { pool } from "./db";
import { storage } from "./storage";
import { parse as parseCookie } from "cookie";
import { publish, psubscribe, isRedisEnabled } from "./services/pubsub";

const tenantSockets = new Map<string, Set<WebSocket>>();

interface GuestSocketMeta {
  tableId: string;
}
const guestSocketMeta = new WeakMap<WebSocket, GuestSocketMeta>();

// PR-009: Track last-pong time per connection for the global sweep interval.
// `lastPongTime` is updated when the client responds to a server ping.
const lastPongTime = new WeakMap<WebSocket, number>();
// PR-009: Track when we last sent a ping to each socket.
// Used to enforce a strict "pong must arrive within PONG_TIMEOUT_MS after ping" protocol.
const lastPingTime = new WeakMap<WebSocket, number>();
// PR-009: Per-socket pong deadline timer.
// A timer is set when we ping a socket; if cleared by a pong it is cancelled,
// otherwise the socket is terminated exactly PONG_TIMEOUT_MS after the ping.
const pongDeadlineTimer = new WeakMap<WebSocket, ReturnType<typeof setTimeout>>();
// PR-009: Track user role per socket for server-side role-filtered event delivery.
const socketUserRole = new WeakMap<WebSocket, string>();

function addSocket(tenantId: string, ws: WebSocket) {
  if (!tenantSockets.has(tenantId)) tenantSockets.set(tenantId, new Set());
  tenantSockets.get(tenantId)!.add(ws);
}

function removeSocket(tenantId: string, ws: WebSocket) {
  tenantSockets.get(tenantId)?.delete(ws);
}

function fanOutToLocalSockets(tenantId: string, msg: string, event: string, payload: unknown) {
  const clients = tenantSockets.get(tenantId);
  if (!clients || clients.size === 0) return;

  const isTableRequestEvent = event.startsWith("table-request:");
  const requestTableId: string | undefined = isTableRequestEvent
    ? (payload as { request?: { tableId?: string }; tableId?: string })?.request?.tableId ??
      (payload as { tableId?: string })?.tableId
    : undefined;

  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const meta = guestSocketMeta.get(ws);
    if (meta) {
      if (!isTableRequestEvent) continue;
      if (requestTableId && meta.tableId !== requestTableId) continue;
    }
    try { ws.send(msg); } catch (_) {}
  }
}

export function emitToTenant(tenantId: string, event: string, payload: unknown) {
  const msg = JSON.stringify({ event, payload });

  if (isRedisEnabled()) {
    publish(`tenant:${tenantId}`, msg).catch((err) =>
      console.error("[realtime] Redis publish error:", err)
    );
  } else {
    fanOutToLocalSockets(tenantId, msg, event, payload);
  }
}

async function getTenantFromRequest(req: IncomingMessage): Promise<{ tenantId: string; role?: string } | null> {
  try {
    const rawCookie = req.headers.cookie;
    if (!rawCookie) return null;
    const cookies = parseCookie(rawCookie);
    // PA-1 compat: fall back to legacy connect.sid cookie for users who haven't re-logged-in
    let sid = cookies["ts.sid"] || cookies["connect.sid"];
    if (!sid) return null;

    if (sid.startsWith("s:")) sid = sid.slice(2);
    const dotIdx = sid.lastIndexOf(".");
    if (dotIdx === -1) return null;
    const sessionId = decodeURIComponent(sid.slice(0, dotIdx));

        const secret = process.env.SESSION_SECRET;
    if (!secret) return null;
    const { createHmac } = await import("crypto");
    const expectedSig = createHmac("sha256", secret).update(sessionId).digest("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const actualSig = sid.slice(dotIdx + 1);
    if (expectedSig !== actualSig) return null;

    const result = await pool.query(
      `SELECT sess FROM session WHERE sid = $1 AND expire > NOW()`,
      [sessionId]
    );
    if (!result.rows[0]) return null;
    const sess = result.rows[0].sess;
    const userId = sess?.passport?.user;
    if (!userId) return null;

    const user = await storage.getUser(userId);
    if (!user?.tenantId) return null;
    return { tenantId: user.tenantId, role: user.role };
  } catch {
    return null;
  }
}

/**
 * PR-009: Emit event only to sockets belonging to manager/owner roles (server-side filtering).
 * Prevents sensitive account-sharing alerts from leaking to non-privileged staff sockets.
 * deviceInfo (IP) is stripped from the payload before sending.
 */
export function emitToTenantManagers(tenantId: string, event: string, payload: unknown): void {
  const managerRoles = new Set(["owner", "franchise_owner", "hq_admin", "super_admin", "manager"]);
  const clients = tenantSockets.get(tenantId);
  if (!clients || clients.size === 0) return;
  // Sanitize payload: keep user-agent (helpful for identifying device) but strip IP address.
  const rawPayload = payload as Record<string, unknown>;
  const safePayload: Record<string, unknown> = { ...rawPayload };
  if (typeof safePayload.deviceInfo === "string") {
    // Keep only the first part (user-agent) before the " — IP:" separator
    safePayload.deviceInfo = safePayload.deviceInfo.split(" — IP:")[0].trim();
  }
  const msg = JSON.stringify({ event, payload: safePayload });
  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const role = socketUserRole.get(ws);
    if (!role || !managerRoles.has(role)) continue; // Skip non-manager sockets
    try { ws.send(msg); } catch (_) {}
  }
}

let redisPsubscribed = false;

async function setupRedisPubSub() {
  if (!isRedisEnabled() || redisPsubscribed) return;
  redisPsubscribed = true;

  await psubscribe("tenant:*", (channel: string, rawMsg: string) => {
    const tenantId = channel.replace(/^tenant:/, "");
    try {
      const parsed = JSON.parse(rawMsg) as { event: string; payload: unknown };
      fanOutToLocalSockets(tenantId, rawMsg, parsed.event, parsed.payload);
    } catch (_) {}
  });

  console.log("[WS] Redis pub/sub active — subscribed to tenant:* channels");
}

export function setupWebSocket(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  

  // WS-PROD: Explicit upgrade handler for production proxy compatibility
  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url || '/', `http://${req.headers.host}`);
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  setupRedisPubSub().catch((err) =>
    console.error("[WS] Redis pub/sub setup failed:", err)
  );

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const authResult = await getTenantFromRequest(req);
    let resolvedTenantId: string | null = authResult?.tenantId ?? null;
    let resolvedRole: string | undefined = authResult?.role;
    let isGuest = false;
    let guestTableId: string | null = null;

    if (!resolvedTenantId && req.url) {
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?") + 1) : "";
      const qp = new URLSearchParams(qs);
      const wallToken = qp.get("token");
      const qrToken = qp.get("qrToken");

      // F-016 fix: removed ?tenantId= path — it required no auth and granted
      // full event stream access to any party with a tenant UUID.
      // Only authenticated paths remain: session cookie, ?token= (wall screen),
      // and ?qrToken= (guest QR).
      if (wallToken) {
        const tenant = await storage.getTenantByWallScreenToken(wallToken).catch(() => null);
        if (tenant) resolvedTenantId = tenant.id;
      } else if (qrToken) {
        const tableToken = await storage.getQrTokenByValue(qrToken).catch(() => null);
        if (tableToken?.active) {
          resolvedTenantId = tableToken.tenantId;
          guestTableId = tableToken.tableId;
          isGuest = true;
        }
      }
    }

    if (!resolvedTenantId) {
      ws.close(4001, "Unauthorized");
      return;
    }

    const tenantId = resolvedTenantId;

    if (isGuest && guestTableId) {
      guestSocketMeta.set(ws, { tableId: guestTableId });
    } else if (isGuest) {
      guestSocketMeta.set(ws, { tableId: "" });
    }

    // PR-009: Track user role per socket for server-side role-filtered event delivery
    if (resolvedRole) {
      socketUserRole.set(ws, resolvedRole);
    }

    addSocket(tenantId, ws);
    lastPongTime.set(ws, Date.now()); // Initialize with connection time

    try {
      ws.send(JSON.stringify({ event: "connected", payload: { ok: true } }));
    } catch (_) {}

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { event?: string };
        if (msg.event === "pong") {
          // PR-009: Client responded to server ping — cancel the 10s deadline timer.
          lastPongTime.set(ws, Date.now());
          const timer = pongDeadlineTimer.get(ws);
          if (timer) { clearTimeout(timer); pongDeadlineTimer.delete(ws); }
        } else if (msg.event === "ping") {
          // Legacy client-initiated keepalive ping — echo pong for backward compat.
          lastPongTime.set(ws, Date.now());
          const timer = pongDeadlineTimer.get(ws);
          if (timer) { clearTimeout(timer); pongDeadlineTimer.delete(ws); }
          try { ws.send(JSON.stringify({ event: "pong" })); } catch (_) {}
        }
      } catch (_) {}
    });

    // PR-009: Single authoritative heartbeat via global sweep (every 30s).
    // Per-socket native ping removed to avoid dual-heartbeat complexity.
    ws.on("close", () => removeSocket(tenantId, ws));
    ws.on("error", () => removeSocket(tenantId, ws));
  });

  console.log("[WS] WebSocket server listening on /ws");

  // PR-009: Global heartbeat sweep — every 30 seconds.
  // Strict protocol: server sends JSON { event: "ping" }, client must respond with
  // { event: "pong" } within PONG_TIMEOUT_MS. A per-socket deadline timer enforces
  // eviction exactly 10s after ping (not at the next 30s sweep).
  const SWEEP_INTERVAL_MS = 30_000;
  const PONG_TIMEOUT_MS = 10_000;
  setInterval(() => {
    const now = Date.now();
    for (const [, socketSet] of tenantSockets) {
      for (const ws of socketSet) {
        if (ws.readyState !== WebSocket.OPEN) {
          socketSet.delete(ws);
          continue;
        }
        // Cancel any lingering deadline from previous sweep (pong already cleared it).
        const existing = pongDeadlineTimer.get(ws);
        if (existing) { clearTimeout(existing); pongDeadlineTimer.delete(ws); }

        // Send JSON ping and record when we sent it.
        try {
          ws.send(JSON.stringify({ event: "ping" }));
          lastPingTime.set(ws, now);
        } catch {
          socketSet.delete(ws);
          try { ws.terminate(); } catch {}
          continue;
        }

        // Schedule per-socket 10s pong deadline — fires if client does not pong in time.
        const deadline = setTimeout(() => {
          pongDeadlineTimer.delete(ws);
          const lastPong = lastPongTime.get(ws);
          const lastPing = lastPingTime.get(ws) ?? now;
          // Only terminate if no pong arrived after this ping.
          if (lastPong === undefined || lastPong < lastPing) {
            socketSet.delete(ws);
            try { ws.terminate(); } catch {}
            console.log("[WS] Cleanup: terminated 1 stale connection (missed pong within 10s)");
          }
        }, PONG_TIMEOUT_MS);
        pongDeadlineTimer.set(ws, deadline);
      }
    }
  }, SWEEP_INTERVAL_MS);

  // PR-009: Log active connection count every 5 minutes for leak detection.
  setInterval(() => {
    let total = 0;
    for (const [, socketSet] of tenantSockets) {
      for (const ws of socketSet) {
        if (ws.readyState === WebSocket.OPEN) total++;
      }
    }
    console.log(`[WS] Active connections: ${total}`);
  }, 5 * 60_000);

  return wss;
}

// PR-011: Export function to get active WebSocket connection count for health endpoint
export function getWssClientCount(): number {
  let total = 0;
  for (const [, socketSet] of tenantSockets) {
    for (const ws of socketSet) {
      if (ws.readyState === WebSocket.OPEN) total++;
    }
  }
  return total;
}
