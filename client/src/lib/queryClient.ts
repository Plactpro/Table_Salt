import { QueryClient, QueryFunction, MutationCache, Mutation } from "@tanstack/react-query";

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

/**
 * PR-001: Operation-aware timeout helper.
 * fast    = 5s  — menu/list GETs
 * standard = 8s — order mutations, most POST/PATCH
 * heavy   = 30s — analytics, reports, CSV exports
 */
export type TimeoutType = "fast" | "standard" | "heavy";

export function getTimeout(type: TimeoutType): number {
  switch (type) {
    case "fast":
      return 5_000;
    case "standard":
      return 8_000;
    case "heavy":
      return 30_000;
    default:
      return 8_000;
  }
}

function getTimeoutForUrl(url: string, method: string): TimeoutType {
  const isGet = method.toUpperCase() === "GET";
  const isHeavy =
    url.includes("/reports") ||
    url.includes("/analytics") ||
    url.includes("/export") ||
    url.includes("/csv") ||
    url.includes("/stock-reports") ||
    url.includes("/time-performance");

  if (isHeavy) return "heavy";
  if (isGet) return "fast";
  return "standard";
}

/** PR-009: Fire a custom event when the server signals an expired grace period.
 *  Checks both the X-Subscription-Warning header and the response body field.
 */
function checkSubscriptionWarning(res: Response, body?: any) {
  try {
    const headerWarning = res.headers.get("X-Subscription-Warning");
    const bodyWarning = body?.subscriptionWarning;
    if (headerWarning === "expired_grace" || bodyWarning === "expired_grace") {
      window.dispatchEvent(new CustomEvent("subscription-grace-warning"));
    }
  } catch {}
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { timeoutType?: TimeoutType; idempotencyKey?: string }
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  const csrf = getCsrfToken();
  if (csrf) headers["x-csrf-token"] = csrf;
  if (options?.idempotencyKey) headers["x-idempotency-key"] = options.idempotencyKey;

  const timeoutType = options?.timeoutType ?? getTimeoutForUrl(url, method);
  const timeoutMs = getTimeout(timeoutType);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      signal: controller.signal,
    });

    checkSubscriptionWarning(res);
    await throwIfResNotOk(res);
    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      const timeoutErr = new Error(`Request timed out after ${timeoutMs / 1000}s — tap to retry`);
      timeoutErr.name = "TimeoutError";
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const timeoutType = getTimeoutForUrl(url, "GET");
    const timeoutMs = getTimeout(timeoutType);
    const csrf = getCsrfToken();

    const headers: Record<string, string> = {};
    if (csrf) headers["x-csrf-token"] = csrf;

    try {
      const res = await fetch(url, {
        credentials: "include",
        signal: AbortSignal.timeout(timeoutMs),
        headers,
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      // PR-001: Handle SESSION_CONFLICT from server
      if (res.status === 401) {
        try {
          const body = await res.clone().json();
          if (body?.code === "SESSION_CONFLICT") {
            window.dispatchEvent(new CustomEvent("session-conflict"));
          }
        } catch {}
      }

      await throwIfResNotOk(res);
      const responseBody = await res.json();
      // PR-009: Check for subscription grace warning in header or response body
      checkSubscriptionWarning(res, responseBody);
      return responseBody;
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
        const timeoutErr = new Error(`Request timed out — tap to retry`);
        timeoutErr.name = "TimeoutError";
        window.dispatchEvent(new CustomEvent("api-timeout", {
          detail: {
            message: timeoutErr.message,
            retryFn: () => queryClient.invalidateQueries({ queryKey }),
          },
        }));
        throw timeoutErr;
      }
      throw err;
    }
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

function isNetworkError(error: Error): boolean {
  return (
    error.name === "TypeError" ||
    error.message.includes("Failed to fetch") ||
    error.message.includes("NetworkError") ||
    error.name === "TimeoutError"
  );
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: (failureCount, error) => {
        if (failureCount >= 3) return false;
        const err = error as Error;
        if (isNetworkError(err)) {
          return true;
        }
        const statusMatch = err.message.match(/^(\d{3}):/);
        if (statusMatch) {
          const status = parseInt(statusMatch[1]);
          if (status >= 400) return false;
        }
        return false;
      },
      retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 30000),
    },
    mutations: {
      retry: false,
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      handleReadOnlyError(error as Error);
      // PR-001: Dispatch session-conflict event for mutations
      try {
        const cause = (error as { cause?: { code?: string } }).cause;
        if (cause?.code === "SESSION_CONFLICT") {
          window.dispatchEvent(new CustomEvent("session-conflict"));
        }
      } catch {}
      // PR-001: Dispatch timeout event so global UI can show "tap to retry" toast with actual retry callback
      if ((error as Error).name === "TimeoutError") {
        const retryFn = () => {
          const vars = (mutation as Mutation).state.variables;
          (mutation as Mutation).execute(vars);
        };
        window.dispatchEvent(new CustomEvent("api-timeout", { detail: { message: (error as Error).message, retryFn } }));
      }
    },
  }),
});
