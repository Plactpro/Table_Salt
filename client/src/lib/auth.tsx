import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";
import { SubscriptionTier, BusinessType, hasFeatureAccess, getBusinessBadges, FeatureKey } from "./subscription";

export type { UserRole as Role } from "@shared/permissions-config";

export interface TenantInfo {
  id: string;
  name: string;
  plan: SubscriptionTier;
  businessType: BusinessType;
  currency?: string;
  timezone?: string;
  timeFormat?: string;
  currencyPosition?: string;
  currencyDecimals?: number;
  taxRate?: string;
  taxType?: string;
  compoundTax?: boolean;
  serviceCharge?: string;
  onboardingCompleted?: boolean;
  phone?: string;
  cuisineStyle?: string;
  country?: string;
  address?: string;
  subscriptionStatus?: string;
  trialEndsAt?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  logo?: string | null;
  gstin?: string | null;
  cgstRate?: string | null;
  sgstRate?: string | null;
  invoicePrefix?: string | null;
  razorpayEnabled?: boolean | null;
  razorpayKeyId?: string | null;
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
  login: (username: string, password: string, totpCode?: string) => Promise<AuthUser | { requires2FA: true; userId: string }>;
  register: (data: { restaurantName: string; name: string; username: string; password: string; email?: string; phone?: string }) => Promise<AuthUser>;
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
          currency: data.currency || "USD",
          timezone: data.timezone || "UTC",
          timeFormat: data.timeFormat || "12hr",
          currencyPosition: data.currencyPosition || "before",
          currencyDecimals: data.currencyDecimals ?? 2,
          taxRate: data.taxRate || "0",
          taxType: data.taxType || "vat",
          compoundTax: data.compoundTax ?? false,
          serviceCharge: data.serviceCharge || "0",
          onboardingCompleted: data.onboardingCompleted ?? false,
          phone: data.phone,
          cuisineStyle: data.cuisineStyle,
          country: data.country,
          address: data.address,
          subscriptionStatus: data.subscriptionStatus ?? "trialing",
          trialEndsAt: data.trialEndsAt ?? null,
          stripeCustomerId: data.stripeCustomerId ?? null,
          stripeSubscriptionId: data.stripeSubscriptionId ?? null,
          gstin: data.gstin ?? null,
          cgstRate: data.cgstRate ?? null,
          sgstRate: data.sgstRate ?? null,
          invoicePrefix: data.invoicePrefix ?? null,
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
    mutationFn: async ({ username, password, totpCode }: { username: string; password: string; totpCode?: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", { username, password, totpCode });
      return res.json();
    },
    onSuccess: (data) => {
      if (!data.requires2FA) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
      }
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { restaurantName: string; name: string; username: string; password: string; email?: string; phone?: string }) => {
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
    },
  });

  const login = async (username: string, password: string, totpCode?: string) => {
    return loginMutation.mutateAsync({ username, password, totpCode });
  };

  const register = async (data: { restaurantName: string; name: string; username: string; password: string; email?: string; phone?: string }) => {
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
