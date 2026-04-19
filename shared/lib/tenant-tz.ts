import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type TenantTzInput =
  | string
  | { timezone?: string | null }
  | null
  | undefined;

function resolveTenantTz(tenant: TenantTzInput): string {
  if (typeof tenant === "string" && tenant.length > 0) return tenant;
  if (tenant && typeof tenant === "object" && tenant.timezone) {
    return tenant.timezone;
  }
  console.warn("[tenant-tz] Falling back to UTC — tenant timezone missing");
  return "UTC";
}

export function tenantNow(tenant: TenantTzInput): Date {
  resolveTenantTz(tenant);
  return new Date();
}

type FormatStyle = "full" | "long" | "medium" | "short";

const DATE_PATTERNS: Record<FormatStyle, string> = {
  full: "EEEE, MMMM d, yyyy",
  long: "MMMM d, yyyy",
  medium: "MMM d, yyyy",
  short: "M/d/yyyy",
};

const TIME_PATTERNS: Record<FormatStyle, string> = {
  full: "h:mm:ss a zzzz",
  long: "h:mm:ss a z",
  medium: "h:mm:ss a",
  short: "h:mm a",
};

export function formatInTenantTz(
  instant: Date | string,
  tenant: TenantTzInput,
  opts?: { dateStyle?: FormatStyle; timeStyle?: FormatStyle },
): string {
  const tz = resolveTenantTz(tenant);
  let dateStyle: FormatStyle | undefined;
  let timeStyle: FormatStyle | undefined;
  if (opts === undefined || (opts.dateStyle === undefined && opts.timeStyle === undefined)) {
    dateStyle = "medium";
    timeStyle = "short";
  } else {
    dateStyle = opts.dateStyle;
    timeStyle = opts.timeStyle;
  }
  const parts: string[] = [];
  if (dateStyle) parts.push(DATE_PATTERNS[dateStyle]);
  if (timeStyle) parts.push(TIME_PATTERNS[timeStyle]);
  return formatInTimeZone(instant, tz, parts.join(", "));
}

export function wallClockToUtc(
  localString: string,
  tenant: TenantTzInput,
): Date {
  const tz = resolveTenantTz(tenant);
  return fromZonedTime(localString, tz);
}

export function tenantDateKey(
  instant: Date | string,
  tenant: TenantTzInput,
): string {
  const tz = resolveTenantTz(tenant);
  return formatInTimeZone(instant, tz, "yyyy-MM-dd");
}

export function localDateToKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}
