import { describe, it, expect } from "vitest";

/**
 * F-131: POST /api/admin/circuit-breakers/reset must require authentication.
 *
 * These tests verify the endpoint rejects unauthenticated and non-admin
 * requests. They run against a live server at localhost:5000 — skip if
 * the server is not running (CI-friendly).
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

async function getSessionCookie(username: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    redirect: "manual",
  });
  if (!res.ok) return null;
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/ts\.sid=[^;]+/);
  return match ? match[0] : null;
}

describe("F-131: Circuit breaker reset requires authentication", () => {
  it("rejects unauthenticated requests (no session cookie)", async () => {
    if (!(await isServerUp())) {
      console.log("Server not running at localhost:5000 — skipping integration test");
      return;
    }

    const res = await fetch(`${BASE}/api/admin/circuit-breakers/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    // Before fix: the unauthed route at index.ts:212 returns 200
    // After fix: the authed route at admin-routes.ts:2332 returns 401
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(res.status).toBeLessThanOrEqual(403);
  });

  it("rejects non-admin authenticated requests", async () => {
    if (!(await isServerUp())) {
      console.log("Server not running at localhost:5000 — skipping integration test");
      return;
    }

    const cookie = await getSessionCookie("waiter", "demo123");
    if (!cookie) {
      console.log("Could not log in as waiter — skipping (seed data may not exist)");
      return;
    }

    // Get CSRF token from the cookie jar
    const meRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    const csrfCookie = meRes.headers.get("set-cookie");
    const csrfMatch = csrfCookie?.match(/csrf-token=([^;]+)/);
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : "";

    const res = await fetch(`${BASE}/api/admin/circuit-breakers/reset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${cookie}; csrf-token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
    });

    // Waiter is not super_admin — should get 403
    expect(res.status).toBe(403);
  });

  // Note: Testing with a valid super_admin session is skipped because the seed
  // data does not create a super_admin user (super_admin is created via
  // POST /api/platform/setup which requires no existing super_admin). Setting
  // this up in an integration test would mutate the database.
});
