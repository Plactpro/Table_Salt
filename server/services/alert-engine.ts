import { pool } from "../db";
import { emitToTenant } from "../realtime";

interface TriggerContext {
  tenantId: string;
  outletId?: string;
  referenceId?: string;
  referenceNumber?: string;
  message: string;
}

class AlertEngine {
  private repeatTimers = new Map<string, NodeJS.Timeout>();

  async trigger(alertCode: string, context: TriggerContext): Promise<void> {
    const { tenantId, outletId, referenceId, referenceNumber, message } = context;

    const defRes = await pool.query(
      `SELECT * FROM alert_definitions
       WHERE alert_code = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
       ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END
       LIMIT 1`,
      [alertCode, tenantId]
    );

    if (!defRes.rows[0]) return;
    const def = defRes.rows[0];
    if (!def.is_active) return;

    if (outletId) {
      const configRes = await pool.query(
        `SELECT * FROM alert_outlet_configs WHERE tenant_id = $1 AND outlet_id = $2 AND alert_code = $3`,
        [tenantId, outletId, alertCode]
      );
      const config = configRes.rows[0];
      if (config && config.is_enabled === false && def.can_be_disabled) return;
      const volume = Math.max(config?.volume_level ?? 80, def.min_volume ?? 0);

      const eventRes = await pool.query(
        `INSERT INTO alert_events (tenant_id, outlet_id, alert_code, urgency, reference_id, reference_number, message, target_roles)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [tenantId, outletId, alertCode, def.urgency, referenceId ?? null, referenceNumber ?? null, message, JSON.stringify(def.target_roles ?? [])]
      );
      const eventId = eventRes.rows[0].id;

      emitToTenant(tenantId, "alert:trigger", {
        eventId,
        alertCode,
        alertName: def.alert_name,
        soundKey: def.sound_key,
        volume,
        urgency: def.urgency,
        message,
        referenceId: referenceId ?? null,
        referenceNumber: referenceNumber ?? null,
        targetRoles: def.target_roles ?? [],
        requiresAcknowledge: def.requires_acknowledge ?? false,
      });

      if ((def.repeat_interval_sec ?? 0) > 0) {
        await this.scheduleRepeat(eventId, def, context);
      }
    } else {
      const volume = Math.max(80, def.min_volume ?? 0);

      const eventRes = await pool.query(
        `INSERT INTO alert_events (tenant_id, outlet_id, alert_code, urgency, reference_id, reference_number, message, target_roles)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [tenantId, null, alertCode, def.urgency, referenceId ?? null, referenceNumber ?? null, message, JSON.stringify(def.target_roles ?? [])]
      );
      const eventId = eventRes.rows[0].id;

      emitToTenant(tenantId, "alert:trigger", {
        eventId,
        alertCode,
        alertName: def.alert_name,
        soundKey: def.sound_key,
        volume,
        urgency: def.urgency,
        message,
        referenceId: referenceId ?? null,
        referenceNumber: referenceNumber ?? null,
        targetRoles: def.target_roles ?? [],
        requiresAcknowledge: def.requires_acknowledge ?? false,
      });

      if ((def.repeat_interval_sec ?? 0) > 0) {
        await this.scheduleRepeat(eventId, def, context);
      }
    }
  }

  async acknowledge(eventId: string, userId: string, tenantId: string): Promise<void> {
    await pool.query(
      `UPDATE alert_events SET is_resolved = true, acknowledged_by = $1, acknowledged_at = now() WHERE id = $2 AND tenant_id = $3`,
      [userId, eventId, tenantId]
    );
    this.cancelRepeat(eventId);
    emitToTenant(tenantId, "alert:acknowledged", { eventId, acknowledgedBy: userId });
  }

  private async scheduleRepeat(eventId: string, def: any, context: TriggerContext): Promise<void> {
    const intervalSec = def.repeat_interval_sec as number;
    const maxAgeMs = 60 * 60 * 1000;

    const handle = setTimeout(async () => {
      this.repeatTimers.delete(eventId);
      try {
        const res = await pool.query(
          `SELECT is_resolved, created_at FROM alert_events WHERE id = $1`,
          [eventId]
        );
        const row = res.rows[0];
        if (!row || row.is_resolved) return;

        const age = Date.now() - new Date(row.created_at).getTime();
        if (age > maxAgeMs) return;

        await this.trigger(def.alert_code, context);
      } catch (_) {}
    }, intervalSec * 1000);

    this.repeatTimers.set(eventId, handle);
  }

  private cancelRepeat(eventId: string): void {
    const handle = this.repeatTimers.get(eventId);
    if (handle) {
      clearTimeout(handle);
      this.repeatTimers.delete(eventId);
    }
  }
}

export const alertEngine = new AlertEngine();

export function startUnclockdInChecker(): void {
  const CHECK_INTERVAL = 15 * 60 * 1000;
  const firedKeys = new Set<string>();

  setInterval(async () => {
    try {
      const { rows: tenants } = await pool.query(
        `SELECT DISTINCT tenant_id FROM staff_schedules WHERE is_active = true`
      );

      const today = new Date().toISOString().slice(0, 10);
      const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

      for (const t of tenants) {
        const tenantId = t.tenant_id;
        const { rows: schedules } = await pool.query(
          `SELECT ss.*, u.name AS staff_name, u.id AS staff_id, u.outlet_id
           FROM staff_schedules ss
           JOIN users u ON u.id = ss.user_id
           WHERE ss.tenant_id = $1 AND ss.is_active = true`,
          [tenantId]
        );

        for (const sched of schedules) {
          if (!sched.start_time) continue;
          const [h, m] = (sched.start_time as string).split(':').map(Number);
          const shiftMinutes = h * 60 + m;
          const lateMinutes = nowMinutes - shiftMinutes;
          if (lateMinutes < 15) continue;

          const key = `${sched.staff_id}-${today}`;
          if (firedKeys.has(key)) continue;

          const { rows: attendance } = await pool.query(
            `SELECT id FROM attendance WHERE user_id = $1 AND date = $2 AND clock_in IS NOT NULL`,
            [sched.staff_id, today]
          );
          if (attendance.length > 0) continue;

          firedKeys.add(key);
          alertEngine.trigger('ALERT-12', {
            tenantId,
            outletId: sched.outlet_id ?? undefined,
            referenceId: sched.staff_id,
            message: `${sched.staff_name} hasn't clocked in — shift started ${lateMinutes} min ago`,
          }).catch(() => {});
        }
      }
    } catch (_) {}
  }, CHECK_INTERVAL);
}
