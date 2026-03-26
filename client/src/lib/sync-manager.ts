import type { SyncService, ConfigCache } from "./sync-interfaces";

function getCsrfToken(): string | null {
  try {
    const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

const DB_NAME = "tablesalt_sync";
const DB_VERSION = 3;
const QUEUE_STORE = "sync_queue";
const CONFIG_STORE = "config_cache";
const MENU_CACHE_STORE = "menu_cache";
const OPEN_ORDERS_STORE = "open_orders";
const ACTIVE_CART_STORE = "active_cart";
const OFFLINE_ORDERS_STORE = "offline_orders";

export interface SyncQueueItem {
  id: string;
  type: "order" | "config_update";
  payload: Record<string, unknown>;
  status: "pending" | "in_flight" | "failed" | "completed";
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  lastAttemptAt: number | null;
  error: string | null;
}

export interface ConfigSnapshot {
  key: string;
  data: unknown;
  updatedAt: number;
  version: number;
}

export interface MenuCacheEntry {
  outletId: string;
  categories: unknown[];
  items: unknown[];
  cachedAt: number;
}

export interface OpenOrdersCache {
  outletId: string;
  orders: unknown[];
  cachedAt: number;
}

export interface ActiveCartEntry {
  key: string;
  cart: unknown;
  updatedAt: number;
}

export interface OfflineOrder {
  localId: string;
  localTicket: string;
  outletId: string | null;
  payload: Record<string, unknown>;
  status: "queued" | "synced" | "failed";
  serverId: string | null;
  createdAt: number;
}

export type SyncStatus = "online" | "offline" | "syncing";

type SyncListener = (status: SyncStatus, pendingCount: number) => void;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const qs = db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        qs.createIndex("status", "status", { unique: false });
        qs.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, { keyPath: "key" });
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(MENU_CACHE_STORE)) {
          db.createObjectStore(MENU_CACHE_STORE, { keyPath: "outletId" });
        }
        if (!db.objectStoreNames.contains(OPEN_ORDERS_STORE)) {
          db.createObjectStore(OPEN_ORDERS_STORE, { keyPath: "outletId" });
        }
        if (!db.objectStoreNames.contains(ACTIVE_CART_STORE)) {
          db.createObjectStore(ACTIVE_CART_STORE, { keyPath: "key" });
        }
      }
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains(OFFLINE_ORDERS_STORE)) {
          const os = db.createObjectStore(OFFLINE_ORDERS_STORE, { keyPath: "localId" });
          os.createIndex("status", "status", { unique: false });
          os.createIndex("outletId", "outletId", { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

class SyncManager implements SyncService, ConfigCache {
  private db: IDBDatabase | null = null;
  private listeners: Set<SyncListener> = new Set();
  private _status: SyncStatus = "online";
  private _pendingCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private configRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private baseBackoffMs = 2000;
  private _syncCompleteCallbacks: Array<(count: number) => void> = [];

  get status(): SyncStatus {
    return this._status;
  }

  get pendingCount(): number {
    return this._pendingCount;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      this.db = await openDB();
      this.initialized = true;
      this.setupConnectivityListeners();
      this.startConnectivityPolling();
      this.startConfigRefresh();
      await this.refreshPendingCount();
      await this.checkConnectivity();
    } catch (err) {
      console.warn("[SyncManager] IndexedDB not available, running in memory-only mode");
      this.initialized = true;
    }
  }

  private setupConnectivityListeners(): void {
    window.addEventListener("online", () => this.handleOnline());
    window.addEventListener("offline", () => this.setStatus("offline"));
  }

  private startConnectivityPolling(): void {
    this.pollTimer = setInterval(() => this.checkConnectivity(), 15000);
  }

  private startConfigRefresh(): void {
    this.configRefreshTimer = setInterval(() => this.refreshAllConfigs(), 120000);
  }

  private async checkConnectivity(): Promise<void> {
    try {
      const res = await fetch("/api/health", { method: "GET", cache: "no-store" });
      if (res.ok) {
        if (this._status === "offline") this.handleOnline();
        else if (this._status !== "syncing") this.setStatus("online");
      } else {
        this.setStatus("offline");
      }
    } catch {
      this.setStatus("offline");
    }
  }

  private async handleOnline(): Promise<void> {
    const hadPending = this._pendingCount;
    this.setStatus("syncing");
    const successCount = await this.processQueue();
    await this.refreshPendingCount();
    const remaining = this._pendingCount;
    const failedAfterSync = await this.getFailedQueueItems();
    this.setStatus(remaining > 0 ? "syncing" : "online");
    if (remaining === 0 && failedAfterSync.length === 0 && successCount > 0) {
      for (const cb of this._syncCompleteCallbacks) {
        try { cb(successCount); } catch {}
      }
    }
  }

  onSyncComplete(cb: (count: number) => void): () => void {
    this._syncCompleteCallbacks.push(cb);
    return () => {
      this._syncCompleteCallbacks = this._syncCompleteCallbacks.filter(f => f !== cb);
    };
  }

  private setStatus(status: SyncStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const fn of this.listeners) {
      try { fn(this._status, this._pendingCount); } catch {}
    }
  }

  subscribe(fn: SyncListener): () => void {
    this.listeners.add(fn);
    fn(this._status, this._pendingCount);
    return () => this.listeners.delete(fn);
  }

  async enqueueOrder(payload: Record<string, unknown>): Promise<{ queued: boolean; orderId: string }> {
    const orderId = (payload.clientOrderId as string) || generateId();
    const finalPayload = { ...payload, clientOrderId: orderId };

    if (this._status === "online") {
      try {
        const csrfHeaders: Record<string, string> = { "Content-Type": "application/json" };
        const csrfTok = getCsrfToken();
        if (csrfTok) csrfHeaders["x-csrf-token"] = csrfTok;
        // PR-001: idempotency key for order creation — same as clientOrderId so replays are deterministic
        csrfHeaders["x-idempotency-key"] = orderId;
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: csrfHeaders,
          credentials: "include",
          body: JSON.stringify(finalPayload),
        });
        if (res.ok) {
          const data = await res.json();
          return { queued: false, orderId: data.id || orderId };
        }
        if (res.status === 409) {
          const existing = await res.json();
          return { queued: false, orderId: existing.order?.id || orderId };
        }
        if (res.status === 403) {
          const errData = await res.json();
          throw Object.assign(new Error(errData.message || "Permission denied"), { status: 403, data: errData });
        }
        if (res.status >= 400 && res.status < 500) {
          const errData = await res.json();
          throw new Error(errData.message || `Server error ${res.status}`);
        }
        throw new Error(`Server returned ${res.status}`);
      } catch (err: any) {
        if (err.status === 403 || (err instanceof Error && err.message.includes("Permission denied"))) {
          throw err;
        }
        const localTicketFallback = `LOCAL-${orderId.slice(-6).toUpperCase()}`;
        const fallbackOfflineOrder: OfflineOrder = {
          localId: orderId,
          localTicket: localTicketFallback,
          outletId: (finalPayload.outletId as string) || null,
          payload: finalPayload,
          status: "queued",
          serverId: null,
          createdAt: Date.now(),
        };
        await this.saveOfflineOrder(fallbackOfflineOrder);
        await this.addToQueue(orderId, finalPayload);
        return { queued: true, orderId };
      }
    }

    const localTicket = `LOCAL-${orderId.slice(-6).toUpperCase()}`;
    const offlineOrder: OfflineOrder = {
      localId: orderId,
      localTicket,
      outletId: (finalPayload.outletId as string) || null,
      payload: finalPayload,
      status: "queued",
      serverId: null,
      createdAt: Date.now(),
    };
    await this.saveOfflineOrder(offlineOrder);
    await this.addToQueue(orderId, finalPayload);
    return { queued: true, orderId };
  }

  private async addToQueue(id: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.db) return;
    const item: SyncQueueItem = {
      id,
      type: "order",
      payload,
      status: "pending",
      retryCount: 0,
      maxRetries: 10,
      createdAt: Date.now(),
      lastAttemptAt: null,
      error: null,
    };
    const tx = this.db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put(item);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await this.refreshPendingCount();
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.processQueue(), this.baseBackoffMs);
  }

  private async processQueue(): Promise<number> {
    if (!this.db) return 0;
    const items = await this.getPendingItems();
    if (items.length === 0) return 0;

    this.setStatus("syncing");
    let successCount = 0;

    for (const item of items) {
      if (item.retryCount >= item.maxRetries) {
        await this.updateQueueItem(item.id, { status: "failed", error: "Max retries exceeded" });
        await this.updateOfflineOrderStatus(item.id, "failed");
        continue;
      }

      const backoff = Math.min(this.baseBackoffMs * Math.pow(2, item.retryCount), 60000);
      if (item.lastAttemptAt && Date.now() - item.lastAttemptAt < backoff) continue;

      await this.updateQueueItem(item.id, { status: "in_flight", lastAttemptAt: Date.now() });

      try {
        const endpoint = (item.payload._endpoint as string) || "/api/orders";
        const kioskToken = item.payload._kioskToken as string | undefined;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (kioskToken) {
          headers["X-Kiosk-Token"] = kioskToken;
        } else {
          const queueCsrf = getCsrfToken();
          if (queueCsrf) headers["x-csrf-token"] = queueCsrf;
        }

        const { _endpoint: _e, _kioskToken: _k, ...cleanPayload } = item.payload;
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          credentials: kioskToken ? "omit" : "include",
          body: JSON.stringify(cleanPayload),
        });

        if (res.ok || res.status === 409) {
          const responseData = await res.json().catch(() => null);
          await this.updateQueueItem(item.id, { status: "completed" });
          const serverId = responseData?.id || responseData?.order?.id || null;
          await this.updateOfflineOrderStatus(item.id, "synced", serverId || undefined);
          successCount++;
        } else if (res.status >= 400 && res.status < 500 && res.status !== 408) {
          const errData = await res.json().catch(() => ({ message: "Client error" }));
          await this.updateQueueItem(item.id, {
            status: "failed",
            error: errData.message || `HTTP ${res.status}`,
          });
          await this.updateOfflineOrderStatus(item.id, "failed");
        } else {
          await this.updateQueueItem(item.id, {
            status: "pending",
            retryCount: item.retryCount + 1,
          });
        }
      } catch {
        await this.updateQueueItem(item.id, {
          status: "pending",
          retryCount: item.retryCount + 1,
          lastAttemptAt: Date.now(),
        });
        this.setStatus("offline");
        this.scheduleRetry();
        break;
      }
    }

    await this.refreshPendingCount();
    if (this._pendingCount > 0) {
      this.scheduleRetry();
    } else {
      this.setStatus("online");
    }
    return successCount;
  }

  private async getPendingItems(): Promise<SyncQueueItem[]> {
    if (!this.db) return [];
    const tx = this.db.transaction(QUEUE_STORE, "readonly");
    const store = tx.objectStore(QUEUE_STORE);
    const idx = store.index("status");
    const pending = idx.getAll("pending");
    const inFlight = idx.getAll("in_flight");

    return new Promise((resolve) => {
      const results: SyncQueueItem[] = [];
      pending.onsuccess = () => { results.push(...(pending.result || [])); };
      inFlight.onsuccess = () => { results.push(...(inFlight.result || [])); };
      tx.oncomplete = () => resolve(results.sort((a, b) => a.createdAt - b.createdAt));
      tx.onerror = () => resolve([]);
    });
  }

  private async updateQueueItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const getReq = store.get(id);

    return new Promise((resolve) => {
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (item) {
          store.put({ ...item, ...updates });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      getReq.onerror = () => resolve();
    });
  }

  private async refreshPendingCount(): Promise<void> {
    if (!this.db) return;
    const items = await this.getPendingItems();
    const newCount = items.length;
    if (newCount !== this._pendingCount) {
      this._pendingCount = newCount;
      this.notifyListeners();
    }
  }

  async getQueueItems(): Promise<SyncQueueItem[]> {
    if (!this.db) return [];
    const tx = this.db.transaction(QUEUE_STORE, "readonly");
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async getFailedQueueItems(): Promise<SyncQueueItem[]> {
    if (!this.db) return [];
    const tx = this.db.transaction(QUEUE_STORE, "readonly");
    const store = tx.objectStore(QUEUE_STORE);
    const idx = store.index("status");
    const req = idx.getAll("failed");
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async requeueFailedItem(id: string): Promise<void> {
    await this.updateQueueItem(id, { status: "pending", retryCount: 0, error: null, lastAttemptAt: null });
    await this.updateOfflineOrderStatus(id, "queued");
    await this.refreshPendingCount();
    this.scheduleRetry();
  }

  async discardQueueItem(id: string): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    await this.deleteOfflineOrder(id);
    await this.refreshPendingCount();
  }

  async clearCompleted(): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const idx = store.index("status");
    const req = idx.getAll("completed");
    req.onsuccess = () => {
      for (const item of req.result || []) {
        store.delete(item.id);
      }
    };
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    await this.refreshPendingCount();
  }

  async cacheConfig(key: string, data: unknown, version: number = 1): Promise<void> {
    if (!this.db) return;
    const snapshot: ConfigSnapshot = { key, data, updatedAt: Date.now(), version };
    const tx = this.db.transaction(CONFIG_STORE, "readwrite");
    tx.objectStore(CONFIG_STORE).put(snapshot);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async getCachedConfig<T = unknown>(key: string): Promise<{ data: T; updatedAt: number; version: number } | null> {
    if (!this.db) return null;
    const tx = this.db.transaction(CONFIG_STORE, "readonly");
    const req = tx.objectStore(CONFIG_STORE).get(key);
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const snap = req.result as ConfigSnapshot | undefined;
        if (snap) resolve({ data: snap.data as T, updatedAt: snap.updatedAt, version: snap.version });
        else resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  }

  async refreshConfig(key: string, fetchUrl: string, version: number = 1): Promise<unknown | null> {
    try {
      const res = await fetch(fetchUrl, { credentials: "include", cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      await this.cacheConfig(key, data, version);
      return data;
    } catch {
      return null;
    }
  }

  async getOrFetchConfig<T = unknown>(key: string, fetchUrl: string, maxAgeMs: number = 300000): Promise<T | null> {
    const cached = await this.getCachedConfig<T>(key);
    if (cached && Date.now() - cached.updatedAt < maxAgeMs) {
      return cached.data;
    }

    const fresh = await this.refreshConfig(key, fetchUrl);
    if (fresh) return fresh as T;

    if (cached) return cached.data;
    return null;
  }

  private async refreshAllConfigs(): Promise<void> {
    if (this._status === "offline") return;
    const menuRes = await this.refreshConfig("menu-items", "/api/menu-items") as any;
    if (menuRes && menuRes.data) await this.cacheConfig("menu-items", menuRes.data);
    await this.refreshConfig("menu-categories", "/api/menu-categories");
    await this.refreshConfig("offers", "/api/offers");
  }

  async enqueueKioskOrder(
    payload: Record<string, unknown>,
    kioskToken: string
  ): Promise<{ queued: boolean; orderId: string; responseData?: Record<string, unknown> }> {
    const orderId = (payload.clientOrderId as string) || generateId();
    const finalPayload = { ...payload, clientOrderId: orderId };

    if (this._status === "online") {
      try {
        const res = await fetch("/api/kiosk/order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Kiosk-Token": kioskToken,
          },
          body: JSON.stringify(finalPayload),
        });
        if (res.ok || res.status === 409) {
          const data = await res.json();
          return { queued: false, orderId, responseData: data };
        }
        if (res.status >= 400 && res.status < 500) {
          const errData = await res.json();
          throw new Error(errData.message || `Error ${res.status}`);
        }
        throw new Error(`Server returned ${res.status}`);
      } catch (err: any) {
        const msg = err?.message || "";
        const isClientError = msg.startsWith("Error ") && !msg.startsWith("Error 5");
        if (isClientError) {
          throw err;
        }
        await this.addToQueue(orderId, { ...finalPayload, _kioskToken: kioskToken, _endpoint: "/api/kiosk/order" });
        return { queued: true, orderId };
      }
    }

    await this.addToQueue(orderId, { ...finalPayload, _kioskToken: kioskToken, _endpoint: "/api/kiosk/order" });
    return { queued: true, orderId };
  }

  async setMenuCache(outletId: string, data: { categories: unknown[]; items: unknown[] }): Promise<void> {
    if (!this.db) return;
    const entry: MenuCacheEntry = {
      outletId,
      categories: data.categories,
      items: data.items,
      cachedAt: Date.now(),
    };
    const tx = this.db.transaction(MENU_CACHE_STORE, "readwrite");
    tx.objectStore(MENU_CACHE_STORE).put(entry);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async getMenuCache(outletId: string): Promise<MenuCacheEntry | null> {
    if (!this.db) return null;
    const tx = this.db.transaction(MENU_CACHE_STORE, "readonly");
    const req = tx.objectStore(MENU_CACHE_STORE).get(outletId);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async setOpenOrdersCache(outletId: string, orders: unknown[]): Promise<void> {
    if (!this.db) return;
    const entry: OpenOrdersCache = { outletId, orders, cachedAt: Date.now() };
    const tx = this.db.transaction(OPEN_ORDERS_STORE, "readwrite");
    tx.objectStore(OPEN_ORDERS_STORE).put(entry);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async getOpenOrdersCache(outletId: string): Promise<OpenOrdersCache | null> {
    if (!this.db) return null;
    const tx = this.db.transaction(OPEN_ORDERS_STORE, "readonly");
    const req = tx.objectStore(OPEN_ORDERS_STORE).get(outletId);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async saveActiveCart(key: string, cart: unknown): Promise<void> {
    if (!this.db) return;
    const entry: ActiveCartEntry = { key, cart, updatedAt: Date.now() };
    const tx = this.db.transaction(ACTIVE_CART_STORE, "readwrite");
    tx.objectStore(ACTIVE_CART_STORE).put(entry);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async getActiveCart(key: string): Promise<unknown | null> {
    if (!this.db) return null;
    const tx = this.db.transaction(ACTIVE_CART_STORE, "readonly");
    const req = tx.objectStore(ACTIVE_CART_STORE).get(key);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result?.cart ?? null);
      req.onerror = () => resolve(null);
    });
  }

  async clearActiveCart(key: string): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(ACTIVE_CART_STORE, "readwrite");
    tx.objectStore(ACTIVE_CART_STORE).delete(key);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async saveOfflineOrder(order: OfflineOrder): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(OFFLINE_ORDERS_STORE, "readwrite");
    tx.objectStore(OFFLINE_ORDERS_STORE).put(order);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async getOfflineOrders(outletId: string | null): Promise<OfflineOrder[]> {
    if (!this.db) return [];
    const tx = this.db.transaction(OFFLINE_ORDERS_STORE, "readonly");
    const store = tx.objectStore(OFFLINE_ORDERS_STORE);
    const req = outletId ? store.index("outletId").getAll(outletId) : store.getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async updateOfflineOrderStatus(localId: string, status: "queued" | "synced" | "failed", serverId?: string): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(OFFLINE_ORDERS_STORE, "readwrite");
    const store = tx.objectStore(OFFLINE_ORDERS_STORE);
    const getReq = store.get(localId);
    return new Promise((resolve) => {
      getReq.onsuccess = () => {
        const item = getReq.result as OfflineOrder | undefined;
        if (item) {
          store.put({ ...item, status, ...(serverId ? { serverId } : {}) });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      getReq.onerror = () => resolve();
    });
  }

  async deleteOfflineOrder(localId: string): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(OFFLINE_ORDERS_STORE, "readwrite");
    tx.objectStore(OFFLINE_ORDERS_STORE).delete(localId);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  destroy(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.configRefreshTimer) clearInterval(this.configRefreshTimer);
    this.listeners.clear();
    if (this.db) this.db.close();
    this.db = null;
    this.initialized = false;
  }
}

export const syncManager = new SyncManager();
