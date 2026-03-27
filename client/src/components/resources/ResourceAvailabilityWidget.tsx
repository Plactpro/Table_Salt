import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users } from "lucide-react";

interface ResourceAvailability {
  id: string;
  resourceName: string;
  resourceIcon: string;
  resourceCode: string;
  isTrackable: boolean;
  totalUnits: number;
  availableUnits: number;
  inUseUnits: number;
  underCleaningUnits: number;
  damagedUnits: number;
}

interface UpcomingNeed {
  reservationId: string;
  customerName: string;
  dateTime: string;
  tableNumber: number | null;
  resourceRequirements?: { resourceId: string; resourceName: string; icon?: string; quantity: number }[];
  resources?: { resourceId: string; resourceName: string; icon?: string; quantity: number }[];
}

interface Props {
  outletId: string;
  compact?: boolean;
}

export function ResourceAvailabilityWidget({ outletId, compact = false }: Props) {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();

  const { data: availability = [], isLoading } = useQuery<ResourceAvailability[]>({
    queryKey: ["/api/resources/availability", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/resources/availability?outletId=${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
    enabled: !!outletId,
  });

  const { data: upcomingNeeds = [] } = useQuery<UpcomingNeed[]>({
    queryKey: ["/api/resources/upcoming-needs", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/resources/upcoming-needs?outletId=${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 60000,
    enabled: !!outletId && !compact,
  });

  const handleResourceUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/resources/availability", outletId] });
    queryClient.invalidateQueries({ queryKey: ["/api/resources/upcoming-needs", outletId] });
  }, [queryClient, outletId]);

  useRealtimeEvent("resource:updated", handleResourceUpdated);

  if (isLoading) {
    return (
      <Card data-testid="widget-resource-availability">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">Loading resources...</CardContent>
      </Card>
    );
  }

  if (availability.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2" data-testid="widget-resource-availability">
        {availability.map(r => {
          const isUnavailable = r.isTrackable && r.availableUnits === 0;
          const isLow = r.isTrackable && r.availableUnits === 1 && r.totalUnits > 1;
          return (
            <div
              key={r.id}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${
                isUnavailable ? "bg-red-100 text-red-700 border-red-200" :
                isLow ? "bg-amber-100 text-amber-700 border-amber-200" :
                "bg-green-100 text-green-700 border-green-200"
              }`}
              data-testid={`row-resource-status-${r.id}`}
            >
              <span>{r.resourceIcon}</span>
              <span>{r.isTrackable ? r.availableUnits : "∞"}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Card data-testid="widget-resource-availability">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <span>🪑</span>
          Special Resources — Live Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Resource</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">⬜ Avail</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">🔵 In Use</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">🧹 Cleaning</th>
                <th className="px-4 py-2 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {availability.map(r => {
                const isUnavailable = r.isTrackable && r.availableUnits === 0;
                const isLow = r.isTrackable && r.availableUnits === 1 && r.totalUnits > 1;
                const isUnlimited = !r.isTrackable;
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-resource-status-${r.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{r.resourceIcon}</span>
                        <span className="font-medium">{r.resourceName}</span>
                      </div>
                    </td>
                    <td className="text-center px-3 py-3">
                      <span className="font-semibold" data-testid={`badge-available-count-${r.id}`}>
                        {isUnlimited ? "∞" : r.availableUnits}
                      </span>
                    </td>
                    <td className="text-center px-3 py-3">
                      <span className="text-muted-foreground" data-testid={`badge-inuse-count-${r.id}`}>
                        {isUnlimited ? "—" : r.inUseUnits}
                      </span>
                    </td>
                    <td className="text-center px-3 py-3">
                      <span className="text-muted-foreground">
                        {isUnlimited ? "—" : r.underCleaningUnits}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isUnlimited ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">✅ Unlimited access</Badge>
                      ) : isUnavailable ? (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">🔴 All in use</Badge>
                      ) : isLow ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">⚠️ Only 1 left</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">✅ Available</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {upcomingNeeds.length > 0 && (
          <div className="px-4 py-3 border-t" data-testid="list-upcoming-resource-needs">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Upcoming (next 4 hrs needing resources)
            </p>
            <div className="space-y-1.5">
              {upcomingNeeds.map(need => (
                <div key={need.reservationId} className="flex items-center gap-2 text-xs">
                  <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">
                    {new Date(need.dateTime).toLocaleTimeString(i18n.language, { hour: "numeric", minute: "2-digit" })}
                  </span>
                  {need.tableNumber && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span>T{need.tableNumber}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">·</span>
                  <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span>{need.customerName}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>
                    {(need.resourceRequirements ?? need.resources ?? []).map(r => `${r.icon || "🪑"}×${r.quantity}`).join(" ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
