import { createContext, useContext, ReactNode, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "./queryClient";
import { useToast } from "@/hooks/use-toast";

interface ImpersonationStatus {
  isImpersonating: boolean;
  expired?: boolean;
  originalAdmin?: { userId: string; userName: string; role: string };
  tenantName?: string | null;
  accessMode?: string;
  sessionId?: string | null;
  reason?: string | null;
  ticketId?: string | null;
  startedAt?: number | null;
  timeoutMinutes?: number;
}

interface ImpersonationContextType {
  isImpersonating: boolean;
  originalAdmin: { userId: string; userName: string; role: string } | undefined;
  tenantName: string | null;
  accessMode: string;
  sessionId: string | null;
  reason: string | null;
  ticketId: string | null;
  startedAt: number | null;
  timeoutMinutes: number;
  endImpersonation: () => Promise<void>;
  unlockEditMode: (reason: string) => Promise<void>;
  returnToReadOnly: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextType>({
  isImpersonating: false,
  originalAdmin: undefined,
  tenantName: null,
  accessMode: "READ_ONLY",
  sessionId: null,
  reason: null,
  ticketId: null,
  startedAt: null,
  timeoutMinutes: 30,
  endImpersonation: async () => {},
  unlockEditMode: async () => {},
  returnToReadOnly: async () => {},
});

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const expiredHandled = useRef(false);

  const { data } = useQuery<ImpersonationStatus>({
    queryKey: ["/api/admin/impersonation/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/impersonation/status", { credentials: "include" });
      if (!res.ok) return { isImpersonating: false };
      return res.json();
    },
    refetchInterval: 10000,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });

  // Handle session expiry: navigate back to /admin with toast
  useEffect(() => {
    if (data?.expired && !data?.isImpersonating && !expiredHandled.current) {
      expiredHandled.current = true;
      toast({
        title: "Support session expired",
        description: "Your support session has timed out and you have been returned to admin.",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/admin");
    }
    if (data?.isImpersonating) {
      expiredHandled.current = false;
    }
  }, [data?.expired, data?.isImpersonating, navigate, queryClient, toast]);

  const endImpersonation = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/admin/impersonate/end");
    } catch {
      try {
        await apiRequest("POST", "/api/session/impersonate/end");
      } catch {
        window.location.href = "/admin";
        return;
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation/status"] });
    navigate("/admin");
  }, [navigate, queryClient]);

  const unlockEditMode = useCallback(async (reason: string) => {
    await apiRequest("POST", "/api/admin/impersonation/unlock-edit", { reason });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation/status"] });
  }, [queryClient]);

  const returnToReadOnly = useCallback(async () => {
    await apiRequest("POST", "/api/admin/impersonation/return-readonly");
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation/status"] });
  }, [queryClient]);

  return (
    <ImpersonationContext.Provider
      value={{
        isImpersonating: data?.isImpersonating ?? false,
        originalAdmin: data?.originalAdmin,
        tenantName: data?.tenantName ?? null,
        accessMode: data?.accessMode ?? "READ_ONLY",
        sessionId: data?.sessionId ?? null,
        reason: data?.reason ?? null,
        ticketId: data?.ticketId ?? null,
        startedAt: data?.startedAt ?? null,
        timeoutMinutes: data?.timeoutMinutes ?? 30,
        endImpersonation,
        unlockEditMode,
        returnToReadOnly,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  return useContext(ImpersonationContext);
}
