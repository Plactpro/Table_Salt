import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

type Outlet = {
  id: string;
  timezone?: string | null;
};

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function useOutletTimezone(outletId?: string | null): string {
  const { user, tenant } = useAuth();

  const { data: outlets = [] } = useQuery<Outlet[]>({
    queryKey: ["/api/outlets"],
    staleTime: 5 * 60 * 1000,
  });

  const tenantTimezone: string = (tenant as any)?.timezone || getBrowserTimezone() || "UTC";

  if (outletId) {
    const outlet = outlets.find((o) => o.id === outletId);
    if (outlet?.timezone) return outlet.timezone;
  }

  const userOutletId = (user as any)?.outletId;
  if (userOutletId) {
    const outlet = outlets.find((o) => o.id === userOutletId);
    if (outlet?.timezone) return outlet.timezone;
  }

  if (outlets.length === 1 && outlets[0]?.timezone) {
    return outlets[0].timezone;
  }

  return tenantTimezone;
}

export function formatLocal(
  date: string | Date | null | undefined,
  timezone: string,
  opts?: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "—";
    const tz = timezone || "UTC";
    return new Intl.DateTimeFormat(locale || "en-US", {
      timeZone: tz,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      ...opts,
    }).format(d);
  } catch {
    try {
      const d = typeof date === "string" ? new Date(date) : date;
      return d.toLocaleString();
    } catch {
      return String(date);
    }
  }
}

export function formatLocalDate(
  date: string | Date | null | undefined,
  timezone: string,
  opts?: Intl.DateTimeFormatOptions
): string {
  return formatLocal(date, timezone, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: undefined,
    minute: undefined,
    hour12: undefined,
    ...opts,
  });
}

export function formatLocalTime(
  date: string | Date | null | undefined,
  timezone: string,
  opts?: Intl.DateTimeFormatOptions
): string {
  return formatLocal(date, timezone, {
    year: undefined,
    month: undefined,
    day: undefined,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...opts,
  });
}
