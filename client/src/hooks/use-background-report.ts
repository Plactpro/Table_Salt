import { useQuery } from "@tanstack/react-query";

interface JobResponse {
  status: "generating" | "ready" | "failed";
  jobId: string;
  result?: unknown;
}

export function useBackgroundReport<T>(
  queryKey: string[],
  url: string
): { data: T | undefined; isLoading: boolean; isGenerating: boolean; jobId: string | undefined } {
  const { data: initial, isLoading } = useQuery<JobResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to fetch ${url}`);
      return res.json();
    },
  });

  const jobId = initial?.jobId;
  const isGenerating = initial?.status === "generating";

  const { data: polled } = useQuery<JobResponse>({
    queryKey: [...queryKey, "__poll", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/status/${jobId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Status fetch failed");
      return res.json();
    },
    enabled: !!jobId && isGenerating,
    refetchInterval: (query) => (query.state.data?.status === "generating" ? 5000 : false),
  });

  const effective = polled ?? initial;
  const data = effective?.status === "ready" ? (effective.result as T) : undefined;

  return { data, isLoading, isGenerating: effective?.status === "generating" ?? false, jobId };
}
