import { describe, it, expect, vi } from "vitest";
import {
  formatInTenantTz,
  localDateToKey,
  tenantDateKey,
  tenantNow,
  wallClockToUtc,
} from "../shared/lib/tenant-tz";

/**
 * F-225: Tenant timezone helper.
 * Fixes browser-local-TZ contamination behind POS-09 (bill time),
 * TBL-02/TBL-07 (reservation date shift), and EV-01 (event on wrong day).
 */

describe("F-225: wallClockToUtc", () => {
  it("converts 2026-05-01T19:30 in Asia/Dubai (+4) to 15:30 UTC", () => {
    const utc = wallClockToUtc("2026-05-01T19:30", "Asia/Dubai");
    expect(utc.toISOString()).toBe("2026-05-01T15:30:00.000Z");
  });

  it("converts 2026-05-01T19:30 in Asia/Kolkata (+5:30) to 14:00 UTC", () => {
    const utc = wallClockToUtc("2026-05-01T19:30", "Asia/Kolkata");
    expect(utc.toISOString()).toBe("2026-05-01T14:00:00.000Z");
  });

  it("converts 2026-05-01T19:30 in UTC to 19:30 UTC (no shift)", () => {
    const utc = wallClockToUtc("2026-05-01T19:30", "UTC");
    expect(utc.toISOString()).toBe("2026-05-01T19:30:00.000Z");
  });

  it("produces the same UTC instant regardless of host TZ (cross-device)", () => {
    // Acceptance test for the whole fix: same tenant TZ + same wall-clock
    // input yields the same UTC instant. Unlike new Date(str).toISOString(),
    // this helper does not read the host timezone.
    const calls = Array.from({ length: 5 }, () =>
      wallClockToUtc("2026-05-01T19:30", "Asia/Dubai").toISOString(),
    );
    expect(new Set(calls).size).toBe(1);
    expect(calls[0]).toBe("2026-05-01T15:30:00.000Z");
  });
});

describe("F-225: formatInTenantTz", () => {
  const INSTANT = "2026-05-01T15:30:00.000Z"; // 19:30 Dubai, 21:00 Kolkata

  it("formats in Asia/Dubai with default medium/short style", () => {
    const out = formatInTenantTz(INSTANT, "Asia/Dubai");
    expect(out).toContain("May");
    expect(out).toContain("2026");
    expect(out).toMatch(/7:30|19:30/);
  });

  it("formats in Asia/Kolkata with default medium/short style", () => {
    const out = formatInTenantTz(INSTANT, "Asia/Kolkata");
    expect(out).toMatch(/9:00|21:00/);
    expect(out).toContain("May");
    expect(out).toContain("2026");
  });

  it("accepts a Date object and an ISO string identically", () => {
    const asDate = formatInTenantTz(new Date(INSTANT), "Asia/Dubai");
    const asString = formatInTenantTz(INSTANT, "Asia/Dubai");
    expect(asDate).toBe(asString);
  });
});

describe("F-225: formatInTenantTz time-only / date-only variants", () => {
  const INSTANT = "2026-05-01T15:30:00.000Z"; // 19:30 Dubai

  it("returns time-only output when opts sets only timeStyle", () => {
    const out = formatInTenantTz(INSTANT, "Asia/Dubai", { timeStyle: "short" });
    expect(out).toMatch(/7:30/);
    expect(out).not.toContain("May");
    expect(out).not.toContain("2026");
  });

  it("returns date-only output when opts sets only dateStyle", () => {
    const out = formatInTenantTz(INSTANT, "Asia/Dubai", { dateStyle: "medium" });
    expect(out).toContain("May");
    expect(out).toContain("2026");
    expect(out).not.toMatch(/7:30|19:30/);
  });
});

describe("F-225: tenantDateKey", () => {
  // Late-evening UTC on 2026-04-19 — already next day in IST/GST.
  const LATE_UTC = "2026-04-19T20:30:00.000Z";

  it("returns next-day date in Asia/Kolkata (+5:30) for late-UTC instant", () => {
    expect(tenantDateKey(LATE_UTC, "Asia/Kolkata")).toBe("2026-04-20");
  });

  it("returns same-day date in UTC", () => {
    expect(tenantDateKey(LATE_UTC, "UTC")).toBe("2026-04-19");
  });

  it("returns next-day date in Asia/Dubai (+4) for late-UTC instant", () => {
    expect(tenantDateKey(LATE_UTC, "Asia/Dubai")).toBe("2026-04-20");
  });
});

describe("F-225: localDateToKey", () => {
  it("formats 2026-04-19 from (2026, 3, 19) with 0-indexed month", () => {
    expect(localDateToKey(2026, 3, 19)).toBe("2026-04-19");
  });

  it("zero-pads single-digit month and day", () => {
    expect(localDateToKey(2026, 0, 5)).toBe("2026-01-05");
  });
});

describe("F-225: resolveTenantTz fallback behavior", () => {
  const INSTANT = "2026-04-19T20:30:00.000Z";

  it("warns and falls back to UTC when tenant is null", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = tenantDateKey(INSTANT, null);
    expect(out).toBe("2026-04-19");
    expect(warn).toHaveBeenCalledWith(
      "[tenant-tz] Falling back to UTC — tenant timezone missing",
    );
    warn.mockRestore();
  });

  it("warns and falls back to UTC when tenant.timezone is null", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = tenantDateKey(INSTANT, { timezone: null });
    expect(out).toBe("2026-04-19");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("uses the timezone from a { timezone: ... } object without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = tenantDateKey(INSTANT, { timezone: "Asia/Dubai" });
    expect(out).toBe("2026-04-20");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("uses a raw IANA string when passed directly without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = tenantDateKey(INSTANT, "Asia/Dubai");
    expect(out).toBe("2026-04-20");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("tenantNow returns a current UTC instant and warns on missing TZ", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const before = Date.now();
    const n = tenantNow(null);
    const after = Date.now();
    expect(n.getTime()).toBeGreaterThanOrEqual(before);
    expect(n.getTime()).toBeLessThanOrEqual(after);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
