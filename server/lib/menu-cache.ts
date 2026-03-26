type CacheEntry = {
  items: any[];
  cachedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

class MenuCacheStore {
  private cache = new Map<string, CacheEntry>();

  get(outletId: string): any[] | null {
    const entry = this.cache.get(outletId);
    if (!entry) {
      console.log(`[menu-cache] MISS outletId=${outletId}`);
      return null;
    }
    const age = Date.now() - entry.cachedAt;
    if (age > CACHE_TTL_MS) {
      this.cache.delete(outletId);
      console.log(`[menu-cache] EXPIRED outletId=${outletId} age=${age}ms`);
      return null;
    }
    console.log(`[menu-cache] HIT outletId=${outletId} age=${age}ms items=${entry.items.length}`);
    return entry.items;
  }

  set(outletId: string, items: any[]): void {
    this.cache.set(outletId, { items, cachedAt: Date.now() });
    console.log(`[menu-cache] SET outletId=${outletId} items=${items.length}`);
  }

  invalidate(key: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      console.log(`[menu-cache] INVALIDATED key=${key}`);
    }
  }

  invalidateByTenant(tenantId: string): void {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key === tenantId || key.startsWith(`${tenantId}:`)) {
        this.cache.delete(key);
        count++;
      }
    }
    if (count > 0) console.log(`[menu-cache] INVALIDATED TENANT ${tenantId} (${count} entries)`);
  }

  invalidateAll(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[menu-cache] INVALIDATED ALL (${size} entries)`);
  }
}

export const MenuCache = new MenuCacheStore();
