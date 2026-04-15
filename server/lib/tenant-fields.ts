/**
 * F-023 fix: Allowlist of fields an owner may self-service edit via
 * PATCH /api/tenant.
 *
 * System-managed fields (plan, subscriptionStatus, stripeCustomerId,
 * stripeSubscriptionId, trialEndsAt, etc.) are excluded — they are
 * only set by Stripe webhooks (billing.ts) or super-admin routes
 * (admin-routes.ts).
 *
 * MAINTENANCE: If a new column is added to the tenants table, it must
 * be explicitly added here to be owner-editable. See F-023-FU.
 */
export const OWNER_EDITABLE_FIELDS = new Set([
  "name",
  "address",
  "timezone",
  "timeFormat",
  "taxRate",
  "taxType",
  "compoundTax",
  "serviceCharge",
  "gstin",
  "cgstRate",
  "sgstRate",
  "invoicePrefix",
  "currency",
  "currencyPosition",
  "currencyDecimals",
  "businessType",
  "razorpayEnabled",
  "razorpayKeyId",
  "razorpayKeySecret",
]);

/**
 * Filter a request body to only include owner-editable fields.
 * Strips undefined values as well.
 */
export function filterOwnerEditable(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (OWNER_EDITABLE_FIELDS.has(key) && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
