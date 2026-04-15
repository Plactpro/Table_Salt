/**
 * Runtime tenant_id guard for storage functions.
 *
 * Call this at the top of every storage function that operates on
 * tenant-scoped data, before any DB query. Example:
 *
 *   assertTenantId(tenantId, 'updateCategory');
 *
 * Throws immediately if tenantId is null, undefined, empty, or not a
 * string. This prevents unscoped queries from reaching the database —
 * a missing tenantId is always a bug, never expected behavior.
 *
 * The `context` parameter is included in the error message so the
 * failing function is identifiable in stack traces and log aggregators
 * without needing to parse the stack itself.
 */
export function assertTenantId(
  tenantId: unknown,
  context: string,
): asserts tenantId is string {
  if (
    tenantId === null ||
    tenantId === undefined ||
    typeof tenantId !== "string" ||
    tenantId === ""
  ) {
    throw new Error(
      `[TENANT_GUARD] ${context} called without a valid tenantId` +
      ` (got ${tenantId === "" ? '""' : String(tenantId)})` +
      ` — this is a bug, not a user error`,
    );
  }
}
