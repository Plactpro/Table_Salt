import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { syncManager } from "@/lib/sync-manager";

export function useCachedQuery<TData, TRaw = TData>(
  queryKey: string[],
  fetchUrl: string,
  options?: Partial<UseQueryOptions<TRaw, Error, TData>> & {
    customFetcher?: (url: string) => Promise<Response>;
  }
) {
  const [fallbackData, setFallbackData] = useState<TData | null>(null);

  const cacheKey = queryKey.join(":");
  const { customFetcher, ...queryOptions } = options || {};

  useEffect(() => {
    syncManager.init().then(() => {
      syncManager.getCachedConfig<TData>(cacheKey).then(cached => {
        if (cached) setFallbackData(cached.data);
      });
    });
  }, [cacheKey]);

  const query = useQuery<TRaw, Error, TData>({
    queryKey,
    queryFn: async () => {
      const fetcher = customFetcher || ((url: string) => fetch(url, { credentials: "include" }));
      const res = await fetcher(fetchUrl);
      if (!res.ok) throw new Error(`Failed to fetch ${fetchUrl}`);
      const rawData = await res.json() as TRaw;
      const selectFn = queryOptions?.select as ((r: TRaw) => TData) | undefined;
      const selectedData: TData = selectFn ? selectFn(rawData) : (rawData as unknown as TData);
      syncManager.cacheConfig(cacheKey, selectedData);
      return rawData;
    },
    ...queryOptions,
  });

  const effectiveData = query.data ?? fallbackData ?? (queryOptions?.initialData as TData | undefined) ?? undefined;

  return {
    ...query,
    data: effectiveData as TData,
    isOfflineCached: !query.data && !!fallbackData,
  };
}
