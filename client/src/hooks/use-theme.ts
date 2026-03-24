import { useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type ThemePreference = "light" | "dark" | "system";

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "dark") {
    root.classList.add("dark");
  } else if (preference === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }
}

export function useTheme(themePreference?: ThemePreference) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (themePreference) {
      applyTheme(themePreference);
    }
  }, [themePreference]);

  useEffect(() => {
    if (themePreference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [themePreference]);

  const mutation = useMutation({
    mutationFn: async (pref: ThemePreference) => {
      const res = await apiRequest("PATCH", "/api/users/preferences", { themePreference: pref });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const setTheme = useCallback((pref: ThemePreference) => {
    applyTheme(pref);
    mutation.mutate(pref);
  }, [mutation]);

  return { setTheme, isUpdating: mutation.isPending };
}

export { applyTheme };
