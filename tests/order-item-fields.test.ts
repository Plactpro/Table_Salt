import { describe, it, expect } from "vitest";
import { ORDER_ITEM_EDITABLE_FIELDS, filterOrderItemEditable } from "../server/lib/order-item-fields";

/**
 * F-121-FU: PATCH /api/order-items/:id must NOT allow modification of
 * monetary, identity, status, or timing fields. Only annotation/hold
 * fields are editable via this generic endpoint.
 */

describe("F-121-FU: Order item PATCH field allowlist", () => {

  describe("ORDER_ITEM_EDITABLE_FIELDS constant", () => {
    it("allows annotation fields", () => {
      for (const field of ["notes", "specialNote"]) {
        expect(ORDER_ITEM_EDITABLE_FIELDS.has(field)).toBe(true);
      }
    });

    it("allows course assignment fields", () => {
      for (const field of ["course", "courseNumber"]) {
        expect(ORDER_ITEM_EDITABLE_FIELDS.has(field)).toBe(true);
      }
    });

    it("allows hold fields", () => {
      for (const field of ["holdReason", "holdUntilItemId", "holdUntilMinutes"]) {
        expect(ORDER_ITEM_EDITABLE_FIELDS.has(field)).toBe(true);
      }
    });

    it("blocks price (monetary)", () => {
      expect(ORDER_ITEM_EDITABLE_FIELDS.has("price")).toBe(false);
    });

    it("blocks quantity (monetary — affects totals)", () => {
      expect(ORDER_ITEM_EDITABLE_FIELDS.has("quantity")).toBe(false);
    });

    it("blocks itemDiscount (monetary)", () => {
      expect(ORDER_ITEM_EDITABLE_FIELDS.has("itemDiscount")).toBe(false);
    });

    it("blocks orderId (structural reference)", () => {
      expect(ORDER_ITEM_EDITABLE_FIELDS.has("orderId")).toBe(false);
    });

    it("blocks tenantId (structural reference)", () => {
      expect(ORDER_ITEM_EDITABLE_FIELDS.has("tenantId")).toBe(false);
    });

    it("blocks id (primary key)", () => {
      expect(ORDER_ITEM_EDITABLE_FIELDS.has("id")).toBe(false);
    });

    it("blocks menuItemId (identity)", () => {
      expect(ORDER_ITEM_EDITABLE_FIELDS.has("menuItemId")).toBe(false);
    });

    it("blocks name (identity)", () => {
      expect(ORDER_ITEM_EDITABLE_FIELDS.has("name")).toBe(false);
    });

    it("blocks status (managed by KDS endpoints)", () => {
      expect(ORDER_ITEM_EDITABLE_FIELDS.has("status")).toBe(false);
    });

    it("blocks cookingStatus (managed by KDS endpoints)", () => {
      expect(ORDER_ITEM_EDITABLE_FIELDS.has("cookingStatus")).toBe(false);
    });

    it("blocks isVoided (managed by void approval flow)", () => {
      expect(ORDER_ITEM_EDITABLE_FIELDS.has("isVoided")).toBe(false);
    });

    it("blocks timing fields", () => {
      for (const field of ["startedAt", "readyAt", "servedAt", "kotSentAt",
        "ticketAcknowledgedAt", "waiterPickupAt", "preparationStartedAt"]) {
        expect(ORDER_ITEM_EDITABLE_FIELDS.has(field)).toBe(false);
      }
    });

    it("blocks chef assignment fields", () => {
      for (const field of ["chefId", "chefName", "counterId", "counterName"]) {
        expect(ORDER_ITEM_EDITABLE_FIELDS.has(field)).toBe(false);
      }
    });
  });

  describe("filterOrderItemEditable()", () => {
    it("passes through allowed fields", () => {
      const input = { notes: "no onion", courseNumber: 2 };
      expect(filterOrderItemEditable(input)).toEqual({ notes: "no onion", courseNumber: 2 });
    });

    it("strips price from request body", () => {
      const input = { notes: "no onion", price: "0.01" };
      const result = filterOrderItemEditable(input);
      expect(result).toEqual({ notes: "no onion" });
      expect(result).not.toHaveProperty("price");
    });

    it("strips quantity from request body", () => {
      const input = { notes: "extra spicy", quantity: 999 };
      const result = filterOrderItemEditable(input);
      expect(result).toEqual({ notes: "extra spicy" });
      expect(result).not.toHaveProperty("quantity");
    });

    it("strips multiple blocked fields while preserving allowed ones", () => {
      const input = {
        notes: "legit note",
        price: "0.01",
        quantity: 999,
        status: "ready",
        orderId: "injected-order",
        tenantId: "injected-tenant",
        holdReason: "waiting for table 5",
      };
      const result = filterOrderItemEditable(input);
      expect(result).toEqual({
        notes: "legit note",
        holdReason: "waiting for table 5",
      });
    });

    it("returns empty object when all fields are blocked", () => {
      const input = { price: "0.01", quantity: 999, status: "paid", tenantId: "x" };
      expect(filterOrderItemEditable(input)).toEqual({});
    });

    it("skips undefined values for allowed fields", () => {
      const input = { notes: "hello", specialNote: undefined, price: "0.01" };
      const result = filterOrderItemEditable(input);
      expect(result).toEqual({ notes: "hello" });
      expect(result).not.toHaveProperty("specialNote");
    });
  });
});
