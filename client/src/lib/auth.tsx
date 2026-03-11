import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";
import { SubscriptionTier, BusinessType, hasFeatureAccess, getBusinessBadges, FeatureKey } from "./subscription";

export type Role = "owner" | "manager" | "waiter" | "kitchen" | "accountant" | "customer";

export interface TenantInfo {
  id: string;
  name: string;
  plan: SubscriptionTier;
  businessType: BusinessType;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  active: boolean | null;
  tenant?: TenantInfo;
}

interface AuthContextType {
  user: AuthUser | null;
  tenant: TenantInfo | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  register: (data: { restaurantName: string; name: string; username: string; password: string }) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  tenant: null,
  isLoading: true,
  login: async () => { throw new Error("Not initialized"); },
  register: async () => { throw new Error("Not initialized"); },
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  const { data: tenantData } = useQuery<TenantInfo | null>({
    queryKey: ["/api/tenant", user?.tenantId],
    queryFn: async () => {
      try {
        const res = await fetch("/api/tenant", { credentials: "include" });
        if (!res.ok) return null;
        const data = await res.json();
        return {
          id: data.id,
          name: data.name,
          plan: (data.plan || "basic") as SubscriptionTier,
          businessType: (data.businessType || "casual_dining") as BusinessType,
        };
      } catch {
        return null;
      }
    },
    enabled: !!user,
    retry: false,
    staleTime: 30000,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { restaurantName: string; name: string; username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
    },
  });

  const login = async (username: string, password: string) => {
    return loginMutation.mutateAsync({ username, password });
  };

  const register = async (data: { restaurantName: string; name: string; username: string; password: string }) => {
    return registerMutation.mutateAsync(data);
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const tenant = tenantData ?? null;

  return (
    <AuthContext.Provider value={{ user: user ?? null, tenant, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export function useSubscription() {
  const { tenant } = useAuth();
  const tier: SubscriptionTier = tenant?.plan ?? "basic";
  const businessType: BusinessType = tenant?.businessType ?? "casual_dining";

  const checkFeatureAccess = (feature: FeatureKey) => hasFeatureAccess(tier, feature);
  const badges = getBusinessBadges(businessType, tier);

  return {
    tier,
    businessType,
    tenant,
    hasFeatureAccess: checkFeatureAccess,
    badges,
  };
}