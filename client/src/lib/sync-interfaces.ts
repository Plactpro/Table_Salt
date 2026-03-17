export interface OrderRepository {
  createOrder(data: Record<string, unknown>): Promise<{ id: string; [key: string]: unknown }>;
  getOrderByClientId(tenantId: string, clientOrderId: string): Promise<{ id: string; [key: string]: unknown } | null>;
  getOrdersByTenant(tenantId: string): Promise<Array<{ id: string; [key: string]: unknown }>>;
}

export interface SyncService {
  readonly status: "online" | "offline" | "syncing";
  readonly pendingCount: number;

  init(): Promise<void>;
  subscribe(fn: (status: "online" | "offline" | "syncing", pendingCount: number) => void): () => void;
  enqueueOrder(payload: Record<string, unknown>): Promise<{ queued: boolean; orderId: string }>;
  enqueueKioskOrder(payload: Record<string, unknown>, kioskToken: string): Promise<{ queued: boolean; orderId: string; responseData?: Record<string, unknown> }>;
  getQueueItems(): Promise<Array<{ id: string; status: string; payload: Record<string, unknown>; retryCount: number; createdAt: number; error: string | null }>>;
  clearCompleted(): Promise<void>;
  destroy(): void;
}

export interface ConfigCache {
  cacheConfig(key: string, data: unknown, version?: number): Promise<void>;
  getCachedConfig<T = unknown>(key: string): Promise<{ data: T; updatedAt: number; version: number } | null>;
  refreshConfig(key: string, fetchUrl: string, version?: number): Promise<unknown | null>;
  getOrFetchConfig<T = unknown>(key: string, fetchUrl: string, maxAgeMs?: number): Promise<T | null>;
}
