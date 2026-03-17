import { useState, useCallback } from "react";

interface SupervisorState {
  open: boolean;
  action: string;
  actionLabel: string;
  pendingCallback: ((credentials: { username: string; password: string }) => void) | null;
}

export function useSupervisorApproval() {
  const [state, setState] = useState<SupervisorState | null>(null);

  const handleApiError = useCallback(
    (error: Error, retryWithOverride: (credentials: { username: string; password: string }) => void, actionLabel: string) => {
      if (error.message.startsWith("__SUPERVISOR_REQUIRED__:")) {
        const action = error.message.split(":")[1] || "unknown";
        setState({
          open: true,
          action,
          actionLabel,
          pendingCallback: retryWithOverride,
        });
        return true;
      }
      return false;
    },
    []
  );

  const handleApproved = useCallback(
    (_supervisorId: string, credentials: { username: string; password: string }) => {
      if (state?.pendingCallback) {
        state.pendingCallback(credentials);
      }
      setState(null);
    },
    [state]
  );

  const close = useCallback(() => setState(null), []);

  return {
    supervisorDialog: state,
    handleApiError,
    handleApproved,
    closeSupervisorDialog: close,
  };
}

export async function parseApiError(res: Response): Promise<Response> {
  if (res.status === 403) {
    const data = await res.json();
    if (data.requiresSupervisor) {
      throw new Error("__SUPERVISOR_REQUIRED__:" + (data.action || "unknown"));
    }
    throw new Error(data.message || "Permission denied");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(data.message || "Request failed");
  }
  return res;
}
