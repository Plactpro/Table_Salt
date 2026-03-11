import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";

export type Role = "owner" | "manager" | "waiter" | "kitchen" | "accountant" | "customer";

export interface AuthUser {
  id: string;
  tenantId: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  active: boolean | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  register: (data: { restaurantName: string; name: string; username: string; password: string }) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
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

  const login = async (username: string, password: string) => {
    return loginMutation.mutateAsync({ username, password });
  };

  const register = async (data: { restaurantName: string; name: string; username: string; password: string }) => {
    return registerMutation.mutateAsync(data);
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);