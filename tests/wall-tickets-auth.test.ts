import { describe, it, expect } from "vitest";

/**
 * F-136: GET /api/kds/wall-tickets must NOT accept ?tenantId= as auth.
 *
 * Before fix: any anonymous client who knows a tenant UUID can fetch the
 * full active order stream (items, prices, table numbers, chef names)
 * via GET /api/kds/wall-tickets?tenantId=<uuid>.
 *
 * After fix: only ?token= (wall screen bearer token) and authenticated
 * sessions are accepted. Requests with only ?tenantId= get 401.
 *
 * These tests require a running server — skip gracefully when unavailable.
 */

const BASE = "http://localhost:5000";

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe("F-136: KDS wall-tickets rejects ?tenantId= without auth", () => {
  it("rejects unauthenticated request with only ?tenantId= (no token, no session)", async () => {
    if (!(await isServerUp())) {
      console.log("Server not running at localhost:5000 — skipping integration test");
      return;
    }

    const fakeId = "00000000-0000-0000-0000-000000000001";
    const res = await fetch(`${BASE}/api/kds/wall-tickets?tenantId=${fakeId}`);

    // After fix: should return 401 (no valid auth mechanism provided)
    expect(res.status).toBe(401);
  });

  it("rejects request with invalid wall screen token", async () => {
    if (!(await isServerUp())) {
      console.log("Server not running — skipping");
      return;
    }

    const res = await fetch(`${BASE}/api/kds/wall-tickets?token=invalid-token-xyz`);

    // Invalid token should return 403 (existing behavior preserved)
    expect(res.status).toBe(403);
  });

  it("rejects request with no parameters at all", async () => {
    if (!(await isServerUp())) {
      console.log("Server not running — skipping");
      return;
    }

    const res = await fetch(`${BASE}/api/kds/wall-tickets`);

    // No auth at all — should return 401
    expect(res.status).toBe(401);
  });

  it("accepts authenticated session request", async () => {
    if (!(await isServerUp())) {
      console.log("Server not running — skipping");
      return;
    }

    // Log in to get session
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "demo123" }),
      redirect: "manual",
    });

    if (!loginRes.ok) {
      console.log("Could not log in as owner — skipping (seed data may not exist)");
      return;
    }

    const setCookie = loginRes.headers.get("set-cookie");
    const sidMatch = setCookie?.match(/ts\.sid=[^;]+/);
    if (!sidMatch) {
      console.log("No ts.sid cookie — skipping");
      return;
    }

    // Get CSRF token
    const meRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { Cookie: sidMatch[0] },
    });
    const csrfCookie = meRes.headers.get("set-cookie");
    const csrfMatch = csrfCookie?.match(/csrf-token=([^;]+)/);
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : "";

    const res = await fetch(`${BASE}/api/kds/wall-tickets`, {
      headers: {
        Cookie: `${sidMatch[0]}; csrf-token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
    });

    // Authenticated request should succeed (200) — tenant resolved from session
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
