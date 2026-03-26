import { AsyncLocalStorage } from "async_hooks";
import type { Pool, PoolClient } from "pg";

export const routeContext = new AsyncLocalStorage<{ route: string }>();

const SLOW_QUERY_THRESHOLD_MS = 500;

function wrapClientQuery(client: PoolClient): void {
  const originalQuery = client.query.bind(client);
  (client as unknown as Record<string, unknown>).query = function (...args: unknown[]) {
    const start = Date.now();
    const result = (originalQuery as (...a: unknown[]) => unknown)(...args);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).then(
        (res) => {
          const duration = Date.now() - start;
          if (duration > SLOW_QUERY_THRESHOLD_MS) {
            const ctx = routeContext.getStore();
            const sql = typeof args[0] === "string" ? args[0].substring(0, 200) : String(args[0]).substring(0, 200);
            console.warn(`[SLOW QUERY txn] ${duration}ms | route: ${ctx?.route ?? "unknown"} | query: ${sql}`);
          }
          return res;
        },
        (err: unknown) => {
          const duration = Date.now() - start;
          if (duration > SLOW_QUERY_THRESHOLD_MS) {
            const ctx = routeContext.getStore();
            const sql = typeof args[0] === "string" ? args[0].substring(0, 200) : String(args[0]).substring(0, 200);
            console.warn(`[SLOW QUERY txn ERROR] ${duration}ms | route: ${ctx?.route ?? "unknown"} | query: ${sql}`);
          }
          throw err;
        }
      );
    }
    return result;
  };
}

export function wrapPoolQuery(pool: Pool): void {
  const originalQuery = pool.query.bind(pool);
  (pool as unknown as Record<string, unknown>).query = function (...args: unknown[]) {
    const start = Date.now();
    const result = (originalQuery as (...a: unknown[]) => unknown)(...args);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).then(
        (res) => {
          const duration = Date.now() - start;
          if (duration > SLOW_QUERY_THRESHOLD_MS) {
            const ctx = routeContext.getStore();
            const sql = typeof args[0] === "string" ? args[0].substring(0, 200) : String(args[0]).substring(0, 200);
            const params = args[1] ? JSON.stringify(args[1]).substring(0, 200) : "";
            console.warn(
              `[SLOW QUERY] ${duration}ms | route: ${ctx?.route ?? "unknown"} | query: ${sql} | params: ${params}`
            );
          }
          return res;
        },
        (err: unknown) => {
          const duration = Date.now() - start;
          if (duration > SLOW_QUERY_THRESHOLD_MS) {
            const ctx = routeContext.getStore();
            const sql = typeof args[0] === "string" ? args[0].substring(0, 200) : String(args[0]).substring(0, 200);
            console.warn(
              `[SLOW QUERY ERROR] ${duration}ms | route: ${ctx?.route ?? "unknown"} | query: ${sql}`
            );
          }
          throw err;
        }
      );
    }
    return result;
  };

  const originalConnect = pool.connect.bind(pool);
  (pool as unknown as Record<string, unknown>).connect = function (...connectArgs: unknown[]) {
    if (typeof connectArgs[0] === "function") {
      const cb = connectArgs[0] as (err: Error | null, client: PoolClient, done: () => void) => void;
      return (originalConnect as (cb: typeof cb) => void)(function (err, client, done) {
        if (!err && client) wrapClientQuery(client);
        cb(err, client, done);
      });
    }
    return (originalConnect as () => Promise<PoolClient>)().then((client) => {
      wrapClientQuery(client);
      return client;
    });
  };
}
