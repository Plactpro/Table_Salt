import { QueryClient, QueryFunction, MutationCache } from "@tanstack/react-query";

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      const text = await res.text();
      throw new Error(`${res.status}: ${text || res.statusText}`);
    }
    const err = new Error(`${res.status}: ${(body as { message?: string })?.message ?? res.statusText}`);
    (err as { cause?: unknown }).cause = body;
    throw err;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  const csrf = getCsrfToken();
  if (csrf) headers["x-csrf-token"] = csrf;

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Global READ_ONLY_SESSION handler — fires a custom event so the banner can show a toast
function handleReadOnlyError(error: Error) {
  try {
    const cause = (error as { cause?: unknown }).cause as { error?: string } | undefined;
    if (cause?.error === "READ_ONLY_SESSION") {
      window.dispatchEvent(new CustomEvent("read-only-session-blocked"));
    }
  } catch {}
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
  mutationCache: new MutationCache({
    onError: (error) => {
      handleReadOnlyError(error as Error);
    },
  }),
});
