import { createContext, useContext, ReactNode, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "./queryClient";

interface ImpersonationStatus {
  isImpersonating: boolean;
  originalAdmin?: { userId: string; userName: string; role: string };
}

interface ImpersonationContextType {
  isImpersonating: boolean;
  originalAdmin: { userId: string; userName: string; role: string } | undefined;
  endImpersonation: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextType>({
  isImpersonating: false,
  originalAdmin: undefined,
  endImpersonation: async () => {},
});

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data } = useQuery<ImpersonationStatus>({
    queryKey: ["/api/admin/impersonation/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/impersonation/status", { credentials: "include" });
      if (!res.ok) return { isImpersonating: false };
      return res.json();
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });

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

  return (
    <ImpersonationContext.Provider
      value={{
        isImpersonating: data?.isImpersonating ?? false,
        originalAdmin: data?.originalAdmin,
        endImpersonation,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  return useContext(ImpersonationContext);
}
