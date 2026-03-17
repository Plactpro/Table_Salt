import type { SyncService, ConfigCache } from "./sync-interfaces";

const DB_NAME = "tablesalt_sync";
const DB_VERSION = 1;
const QUEUE_STORE = "sync_queue";
const CONFIG_STORE = "config_cache";

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

export type SyncStatus = "online" | "offline" | "syncing";

type SyncListener = (status: SyncStatus, pendingCount: number) => void;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const qs = db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        qs.createIndex("status", "status", { unique: false });
        qs.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, { keyPath: "key" });
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
    this.setStatus("syncing");
    await this.processQueue();
    await this.refreshPendingCount();
    this.setStatus(this._pendingCount > 0 ? "syncing" : "online");
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
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(finalPayload),
        });
        if (res.ok) {
          return { queued: false, orderId };
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
        await this.addToQueue(orderId, finalPayload);
        return { queued: true, orderId };
      }
    }

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

  private async processQueue(): Promise<void> {
    if (!this.db) return;
    const items = await this.getPendingItems();
    if (items.length === 0) return;

    this.setStatus("syncing");

    for (const item of items) {
      if (item.retryCount >= item.maxRetries) {
        await this.updateQueueItem(item.id, { status: "failed", error: "Max retries exceeded" });
        continue;
      }

      const backoff = Math.min(this.baseBackoffMs * Math.pow(2, item.retryCount), 60000);
      if (item.lastAttemptAt && Date.now() - item.lastAttemptAt < backoff) continue;

      await this.updateQueueItem(item.id, { status: "in_flight", lastAttemptAt: Date.now() });

      try {
        const endpoint = (item.payload._endpoint as string) || "/api/orders";
        const kioskToken = item.payload._kioskToken as string | undefined;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (kioskToken) headers["X-Kiosk-Token"] = kioskToken;

        const { _endpoint: _e, _kioskToken: _k, ...cleanPayload } = item.payload;
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          credentials: kioskToken ? "omit" : "include",
          body: JSON.stringify(cleanPayload),
        });

        if (res.ok || res.status === 409) {
          await this.updateQueueItem(item.id, { status: "completed" });
        } else if (res.status >= 400 && res.status < 500 && res.status !== 408) {
          const errData = await res.json().catch(() => ({ message: "Client error" }));
          await this.updateQueueItem(item.id, {
            status: "failed",
            error: errData.message || `HTTP ${res.status}`,
          });
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
    await this.refreshConfig("menu-items", "/api/menu-items");
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
