import { pool } from "../db";

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface WindowEntry {
  timestamp: number;
  isError: boolean;
}

export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly retryAfterMs: number = 30_000
  ) {
    super(`Circuit breaker '${circuitName}' is OPEN`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private window: WindowEntry[] = [];
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private halfOpenTestInFlight = false;

  constructor(
    public readonly name: string,
    private readonly errorThresholdPercent: number = 50,
    private readonly windowMs: number = 60_000,
    private readonly resetTimeoutMs: number = 30_000
  ) {}

  /**
   * Prune entries older than the window and push a new entry.
   * Called on EVERY record to keep the window bounded in memory.
   */
  private pushEntry(isError: boolean): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    // Prune expired entries before appending — keeps array bounded to windowMs traffic
    this.window = this.window.filter((e) => e.timestamp >= cutoff);
    this.window.push({ timestamp: now, isError });
  }

  private errorRate(): number {
    if (this.window.length === 0) return 0;
    const errors = this.window.filter((e) => e.isError).length;
    return (errors / this.window.length) * 100;
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    console.log(`[CircuitBreaker:${this.name}] state → ${newState} (was ${oldState})`);

    if (newState !== "OPEN" && this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    if (newState === "OPEN") {
      this.notifyOpen();
      this.resetTimer = setTimeout(() => {
        this.resetTimer = null;
        this.halfOpenTestInFlight = false;
        this.transitionTo("HALF_OPEN");
      }, this.resetTimeoutMs);
    }
  }

  private notifyOpen(): void {
    setImmediate(async () => {
      const message = `Circuit breaker '${this.name}' opened due to high error rate`;
      try {
        await pool.query(
          `INSERT INTO system_events (event_type, name, message, created_at)
           VALUES ($1, $2, $3, NOW())`,
          ["CIRCUIT_OPEN", this.name, message]
        );
      } catch (err) {
        console.error(`[CircuitBreaker:${this.name}] Failed to log system event:`, err);
      }

      // Notify super-admin (platform tenant) via WebSocket real-time event
      try {
        const { rows } = await pool.query(
          `SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1`
        );
        if (rows[0]?.id) {
          const { emitToTenant } = await import("../realtime");
          emitToTenant(rows[0].id, "circuit_breaker:open", {
            name: this.name,
            message,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error(`[CircuitBreaker:${this.name}] Failed to notify super-admin:`, err);
      }
    });
  }

  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if a request should be allowed and throw CircuitOpenError if not.
   * Callers should catch CircuitOpenError and respond with 503.
   */
  checkAndAllow(): void {
    if (this.state === "CLOSED") return;
    if (this.state === "OPEN") throw new CircuitOpenError(this.name, this.resetTimeoutMs);
    if (this.state === "HALF_OPEN") {
      if (!this.halfOpenTestInFlight) {
        this.halfOpenTestInFlight = true;
        return; // allow one test request through
      }
      throw new CircuitOpenError(this.name, this.resetTimeoutMs);
    }
    throw new CircuitOpenError(this.name, this.resetTimeoutMs);
  }

  /**
   * Record a successful downstream response.
   * In HALF_OPEN, only a genuine 2xx success transitions to CLOSED.
   */
  recordSuccess(): void {
    this.pushEntry(false);
    if (this.state === "HALF_OPEN") {
      this.halfOpenTestInFlight = false;
      this.window = []; // reset window on recovery
      this.transitionTo("CLOSED");
      setImmediate(async () => {
        try {
          await pool.query(
            `INSERT INTO system_events (event_type, name, message, created_at)
             VALUES ($1, $2, $3, NOW())`,
            ["CIRCUIT_CLOSED", this.name, `Circuit breaker '${this.name}' closed after successful test request`]
          );
        } catch {}
      });
    }
  }

  /**
   * Record an error response.
   * In CLOSED, checks if error rate exceeds threshold and opens if so.
   * In HALF_OPEN, re-opens immediately.
   */
  recordError(): void {
    this.pushEntry(true);
    if (this.state === "HALF_OPEN") {
      this.halfOpenTestInFlight = false;
      this.transitionTo("OPEN");
      return;
    }
    if (this.state === "CLOSED" && this.errorRate() > this.errorThresholdPercent) {
      this.transitionTo("OPEN");
    }
  }
}

class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  get(name: string, options?: { errorThresholdPercent?: number; windowMs?: number; resetTimeoutMs?: number }): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(
        name,
        new CircuitBreaker(
          name,
          options?.errorThresholdPercent,
          options?.windowMs,
          options?.resetTimeoutMs
        )
      );
    }
    return this.breakers.get(name)!;
  }

  getAll(): Map<string, CircuitBreaker> {
    return this.breakers;
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

import type { Request, Response, NextFunction } from "express";

export function withCircuitBreaker(name: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const breaker = circuitBreakerRegistry.get(name);

    try {
      breaker.checkAndAllow();
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        return res.status(503).json({
          code: "CIRCUIT_OPEN",
          message: `Service temporarily unavailable. The '${name}' circuit breaker is open due to high error rate.`,
          retryAfter: Math.ceil(err.retryAfterMs / 1000),
        });
      }
      return next(err);
    }

    // Use res.once('finish') to capture ALL response types (JSON, send, end, stream, 204 etc.)
    // Prevents HALF_OPEN from getting stuck when routes respond via non-JSON paths.
    //
    // Classification:
    //   2xx  → success (downstream worked)
    //   5xx  → error   (downstream failed)
    //   3xx/4xx → error in HALF_OPEN (re-open circuit; may be auth/validation before downstream)
    //            → neutral in CLOSED (auth/validation failures shouldn't count against circuit)
    //
    // This ensures HALF_OPEN always resolves to CLOSED or OPEN (never gets stuck).
    res.once("finish", () => {
      const isHalfOpen = breaker.getState() === "HALF_OPEN";
      if (res.statusCode >= 500) {
        breaker.recordError();
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        breaker.recordSuccess();
      } else if (isHalfOpen) {
        // In HALF_OPEN: 3xx/4xx treated as error so circuit re-opens (prevents stuck state)
        breaker.recordError();
      }
      // In CLOSED: 3xx/4xx are neutral — auth/validation failures shouldn't trip the breaker
    });

    next();
  };
}
