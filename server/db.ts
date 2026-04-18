import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { wrapPoolQuery } from "./lib/query-logger";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

// ============================================================================
// DATABASE_URL SSL GUARDRAIL — READ BEFORE MODIFYING
// ============================================================================
// Do NOT append ?sslmode=require, ?sslmode=verify-full, or ?sslmode=verify-ca
// to Railway's DATABASE_URL env var. Railway's internal Postgres uses a
// self-signed cert. Since pg 8.17 / pg-connection-string 3.x, those three
// sslmode values are aliases for verify-full, which rejects self-signed certs
// with SELF_SIGNED_CERT_IN_CHAIN and puts the app in a crash loop.
//
// Railway's internal network is already WireGuard-encrypted; application-layer
// TLS is architecturally unavailable on postgres.railway.internal. The correct
// DATABASE_URL is the bare ${{Postgres.DATABASE_URL}} reference with no query
// string suffix.
//
// Incident of record: 2026-04-18 morning — docs/audits/incident-2026-04-18-database-url-sslmode.md
// Attempted code-side fix via Pool.ssl option does NOT override connection-
// string sslmode (node-postgres #3355).
// ============================================================================
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

wrapPoolQuery(pool);

export const db = drizzle(pool, { schema });