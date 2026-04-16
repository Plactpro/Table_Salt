import { describe, it, expect } from "vitest";
import { assertTenantId } from "../server/lib/tenant-assertion";

/**
 * Batch 2: Outlet currency storage function tenant isolation.
 *
 * Tests verify the assertTenantId guard fires before any DB query,
 * preventing cross-tenant access to outlet currency settings.
 */

describe("Batch 2: Outlet currency tenant isolation guards", () => {

  describe("getOutletCurrencySettings(outletId, tenantId)", () => {
    it("throws if tenantId is null", () => {
      expect(() => assertTenantId(null, "getOutletCurrencySettings")).toThrow("[TENANT_GUARD]");
      expect(() => assertTenantId(null, "getOutletCurrencySettings")).toThrow("getOutletCurrencySettings");
    });

    it("throws if tenantId is undefined", () => {
      expect(() => assertTenantId(undefined, "getOutletCurrencySettings")).toThrow("[TENANT_GUARD]");
    });

    it("throws if tenantId is empty string", () => {
      expect(() => assertTenantId("", "getOutletCurrencySettings")).toThrow("[TENANT_GUARD]");
    });

    it("passes with valid tenantId", () => {
      expect(() => assertTenantId("tenant-abc-123", "getOutletCurrencySettings")).not.toThrow();
    });
  });

  describe("updateOutletCurrencySettings(outletId, tenantId, data)", () => {
    it("throws if tenantId is null", () => {
      expect(() => assertTenantId(null, "updateOutletCurrencySettings")).toThrow("[TENANT_GUARD]");
      expect(() => assertTenantId(null, "updateOutletCurrencySettings")).toThrow("updateOutletCurrencySettings");
    });

    it("throws if tenantId is undefined", () => {
      expect(() => assertTenantId(undefined, "updateOutletCurrencySettings")).toThrow("[TENANT_GUARD]");
    });

    it("throws if tenantId is empty string", () => {
      expect(() => assertTenantId("", "updateOutletCurrencySettings")).toThrow("[TENANT_GUARD]");
    });

    it("passes with valid tenantId", () => {
      expect(() => assertTenantId("tenant-abc-123", "updateOutletCurrencySettings")).not.toThrow();
    });
  });
});
