import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import { pool } from "./db";
import { storage } from "./storage";
import { parse as parseCookie } from "cookie";

const tenantSockets = new Map<string, Set<WebSocket>>();

interface GuestSocketMeta {
  tableId: string;
}
const guestSocketMeta = new WeakMap<WebSocket, GuestSocketMeta>();

function addSocket(tenantId: string, ws: WebSocket) {
  if (!tenantSockets.has(tenantId)) tenantSockets.set(tenantId, new Set());
  tenantSockets.get(tenantId)!.add(ws);
}

function removeSocket(tenantId: string, ws: WebSocket) {
  tenantSockets.get(tenantId)?.delete(ws);
}

export function emitToTenant(tenantId: string, event: string, payload: unknown) {
  const clients = tenantSockets.get(tenantId);
  if (!clients || clients.size === 0) return;

  const isTableRequestEvent = event.startsWith("table-request:");
  const requestTableId: string | undefined = isTableRequestEvent
    ? (payload as { request?: { tableId?: string }; tableId?: string })?.request?.tableId ??
      (payload as { tableId?: string })?.tableId
    : undefined;

  const msg = JSON.stringify({ event, payload });

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

async function getTenantFromRequest(req: IncomingMessage): Promise<string | null> {
  try {
    const rawCookie = req.headers.cookie;
    if (!rawCookie) return null;
    const cookies = parseCookie(rawCookie);
    let sid = cookies["connect.sid"];
    if (!sid) return null;

    if (sid.startsWith("s:")) sid = sid.slice(2);
    const dotIdx = sid.lastIndexOf(".");
    if (dotIdx === -1) return null;
    const sessionId = decodeURIComponent(sid.slice(0, dotIdx));

    const secret = process.env.SESSION_SECRET || "table-salt-secret-key-change-in-prod";
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
    return user?.tenantId ?? null;
  } catch {
    return null;
  }
}

export function setupWebSocket(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    let resolvedTenantId = await getTenantFromRequest(req);
    let isGuest = false;
    let guestTableId: string | null = null;

    if (!resolvedTenantId && req.url) {
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?") + 1) : "";
      const qp = new URLSearchParams(qs);
      const wallToken = qp.get("token");
      const rawId = qp.get("tenantId");
      const qrToken = qp.get("qrToken");

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
      } else if (rawId) {
        const tenant = await storage.getTenant(rawId).catch(() => null);
        if (tenant) {
          resolvedTenantId = rawId;
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

    addSocket(tenantId, ws);

    try {
      ws.send(JSON.stringify({ event: "connected", payload: { ok: true } }));
    } catch (_) {}

    ws.on("close", () => removeSocket(tenantId, ws));
    ws.on("error", () => removeSocket(tenantId, ws));

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.ping(); } catch (_) {}
      } else {
        clearInterval(ping);
      }
    }, 25000);

    ws.on("close", () => clearInterval(ping));
  });

  console.log("[WS] WebSocket server listening on /ws");
  return wss;
}
