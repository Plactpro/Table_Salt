import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveAlerts, ActiveAlert } from "@/lib/active-alerts-context";
import { apiRequest } from "@/lib/queryClient";

export default function AllergyAckModal() {
  const { activeAlerts, removeAlert } = useActiveAlerts();
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const allergyAlerts = activeAlerts.filter(a => a.requiresAcknowledge);

  if (allergyAlerts.length === 0) return null;

  const current = allergyAlerts[0];

  const handleAcknowledge = async (alert: ActiveAlert) => {
    setAcknowledging(alert.eventId);
    try {
      await apiRequest("POST", `/api/alerts/events/${alert.eventId}/acknowledge`, {});
      removeAlert(alert.eventId);
    } catch (_) {
      removeAlert(alert.eventId);
    } finally {
      setAcknowledging(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-testid="modal-allergy-ack"
    >
      {allergyAlerts.length > 1 && (
        <div className="absolute top-4 right-4 bg-red-600 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow-lg">
          +{allergyAlerts.length - 1} more
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border-2 border-red-500 max-w-md w-full mx-4 overflow-hidden">
        <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
          <AlertTriangle className="h-7 w-7 text-white shrink-0" />
          <div>
            <h2 className="text-white text-xl font-bold tracking-wide">⚠️ ALLERGY ALERT</h2>
            {current.metadata?.orderRef && (
              <p className="text-red-100 text-sm" data-testid="text-allergy-order">
                Order #{current.metadata.orderRef as string}
                {current.metadata?.tableRef ? ` | Table ${current.metadata.tableRef}` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="px-6 py-6 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
            <span className="text-2xl">🚨</span>
            <p className="text-red-800 dark:text-red-200 font-semibold text-sm uppercase tracking-wide" data-testid="text-allergy-message">
              {current.message}
            </p>
          </div>

          <p className="text-gray-600 dark:text-gray-300 text-sm text-center">
            This order contains an allergy flag.
            <br />
            Verify with kitchen before serving.
          </p>
        </div>

        <div className="px-6 pb-6">
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 text-base"
            onClick={() => handleAcknowledge(current)}
            disabled={acknowledging === current.eventId}
            data-testid="button-allergy-acknowledge"
          >
            {acknowledging === current.eventId ? "Acknowledging..." : "✅ I ACKNOWLEDGE — Kitchen Notified"}
          </Button>
        </div>
      </div>
    </div>
  );
}
