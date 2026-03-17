import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { syncManager } from "@/lib/sync-manager";

export function useCachedQuery<T>(
  queryKey: string[],
  fetchUrl: string,
  options?: Partial<UseQueryOptions<T>> & {
    customFetcher?: (url: string) => Promise<Response>;
  }
) {
  const [fallbackData, setFallbackData] = useState<T | null>(null);

  const cacheKey = queryKey.join(":");
  const { customFetcher, ...queryOptions } = options || {};

  useEffect(() => {
    syncManager.init().then(() => {
      syncManager.getCachedConfig<T>(cacheKey).then(cached => {
        if (cached) setFallbackData(cached.data);
      });
    });
  }, [cacheKey]);

  const query = useQuery<T>({
    queryKey,
    queryFn: async () => {
      const fetcher = customFetcher || ((url: string) => fetch(url, { credentials: "include" }));
      const res = await fetcher(fetchUrl);
      if (!res.ok) throw new Error(`Failed to fetch ${fetchUrl}`);
      const data = await res.json();
      syncManager.cacheConfig(cacheKey, data);
      return data;
    },
    ...queryOptions,
  });

  const effectiveData = query.data ?? fallbackData ?? (queryOptions?.initialData as T | undefined) ?? undefined;

  return {
    ...query,
    data: effectiveData as T,
    isOfflineCached: !query.data && !!fallbackData,
  };
}
