import { describe, it, expect } from "vitest";
import { assertTenantId } from "../server/lib/tenant-assertion";

describe("assertTenantId runtime guard", () => {
  it("passes for a valid UUID string", () => {
    expect(() => assertTenantId("abc-123-def", "testFn")).not.toThrow();
  });

  it("passes for any non-empty string", () => {
    expect(() => assertTenantId("t1", "testFn")).not.toThrow();
  });

  it("throws for null", () => {
    expect(() => assertTenantId(null, "updateCategory")).toThrow("[TENANT_GUARD]");
  });

  it("throws for undefined", () => {
    expect(() => assertTenantId(undefined, "deleteCategory")).toThrow("[TENANT_GUARD]");
  });

  it("throws for empty string", () => {
    expect(() => assertTenantId("", "getCategory")).toThrow("[TENANT_GUARD]");
    expect(() => assertTenantId("", "getCategory")).toThrow('""');
  });

  it("throws for a number", () => {
    expect(() => assertTenantId(42, "getBill")).toThrow("[TENANT_GUARD]");
  });

  it("throws for an object", () => {
    expect(() => assertTenantId({ id: "t1" }, "getUser")).toThrow("[TENANT_GUARD]");
  });

  it("throws for boolean", () => {
    expect(() => assertTenantId(true, "updateOrder")).toThrow("[TENANT_GUARD]");
  });

  it("error message includes the context (function name)", () => {
    try {
      assertTenantId(null, "updateCategory");
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("updateCategory");
      expect(err.message).toContain("[TENANT_GUARD]");
      expect(err.message).toContain("bug");
    }
  });

  it("error message includes the actual value for debugging", () => {
    try {
      assertTenantId(42, "getBill");
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("42");
    }
  });

  it("narrows the type after assertion (TypeScript compile check)", () => {
    const maybeTenantId: string | null = "valid-id";
    assertTenantId(maybeTenantId, "typeCheck");
    // After assertion, TypeScript knows this is a string
    const id: string = maybeTenantId;
    expect(id).toBe("valid-id");
  });
});
