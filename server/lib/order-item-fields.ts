/**
 * F-121-FU fix: Allowlist of fields editable via PATCH /api/order-items/:id.
 *
 * Monetary fields (price, quantity, itemDiscount), identity fields (orderId,
 * tenantId, menuItemId, name), status fields (status, cookingStatus, isVoided),
 * and timing fields are all blocked — they are managed by dedicated endpoints
 * (KDS status, void approval, chef assignment, timing engine).
 *
 * MAINTENANCE: If a new column is added to order_items that should be
 * editable via the generic PATCH endpoint, add it here explicitly.
 */
export const ORDER_ITEM_EDITABLE_FIELDS = new Set([
  "notes",
  "specialNote",
  "course",
  "courseNumber",
  "holdReason",
  "holdUntilItemId",
  "holdUntilMinutes",
]);

/**
 * Filter a request body to only include order-item-editable fields.
 * Strips undefined values.
 */
export function filterOrderItemEditable(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ORDER_ITEM_EDITABLE_FIELDS.has(key) && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
