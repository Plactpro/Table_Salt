import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { requireAuth, requireFreshSession } from "../auth";
import { storage } from "../storage";
import { pool } from "../db";
import { uploadFile, deleteFile } from "../services/file-storage";

const execFileAsync = promisify(execFile);

async function getVideoDurationFromBuffer(buffer: Buffer, ext: string): Promise<number | null> {
  const tmpPath = path.join(os.tmpdir(), `ad-video-${randomUUID()}${ext}`);
  try {
    fs.writeFileSync(tmpPath, buffer);
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      tmpPath,
    ]);
    const val = parseFloat(stdout.trim());
    return isNaN(val) ? null : val;
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const adUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "video/mp4", "video/webm",
      "text/html",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type ${file.mimetype} is not allowed`));
  },
});

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_MIMES = ["video/mp4", "video/webm"];
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const HTML_MAX_BYTES = 512 * 1024;

function getFileType(mime: string) {
  if (IMAGE_MIMES.includes(mime)) return "IMAGE";
  if (VIDEO_MIMES.includes(mime)) return "VIDEO";
  if (mime === "text/html") return "HTML_BANNER";
  return "IMAGE";
}

function validateFileSizeForType(mime: string, sizeBytes: number): string | null {
  if (IMAGE_MIMES.includes(mime) && sizeBytes > IMAGE_MAX_BYTES) {
    return `Image files must be ≤ 2 MB (got ${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`;
  }
  if (mime === "text/html" && sizeBytes > HTML_MAX_BYTES) {
    return `HTML banner files must be ≤ 512 KB (got ${(sizeBytes / 1024).toFixed(0)} KB)`;
  }
  return null;
}

function getEffectiveStatus(requestedStatus: string, campaignType: string): string {
  if (campaignType === "THIRD_PARTY" && requestedStatus === "active") {
    return "pending_approval";
  }
  return requestedStatus;
}

const impressionRateMap = new Map<string, { count: number; windowStart: number }>();
const IMPRESSION_RATE_WINDOW_MS = 60_000;
const IMPRESSION_MAX_PER_WINDOW = 60;

function checkImpressionRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = impressionRateMap.get(key);
  if (!entry || now - entry.windowStart > IMPRESSION_RATE_WINDOW_MS) {
    impressionRateMap.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= IMPRESSION_MAX_PER_WINDOW) return false;
  entry.count++;
  return true;
}

async function requireEnterprisePlan(req: any, res: any, next: any) {
  try {
    const tenant = await storage.getTenant(req.user.tenantId);
    if (tenant?.plan !== "enterprise") {
      return res.status(403).json({ error: "AD_FEATURE_RESTRICTED", currentPlan: tenant?.plan });
    }
    next();
  } catch (err) {
    next(err);
  }
}

const AD_MANAGEMENT_ROLES = ["owner", "franchise_owner", "hq_admin", "manager"];

function requireAdRole(req: any, res: any, next: any) {
  const role = req.user?.role as string;
  if (!AD_MANAGEMENT_ROLES.includes(role)) {
    return res.status(403).json({ error: "Insufficient role for ad management" });
  }
  next();
}

interface AdCampaignRow {
  id: string; tenant_id: string; outlet_id: string | null;
  campaign_name: string; campaign_type: string;
  advertiser_name: string | null; advertiser_contact: string | null;
  advertiser_phone: string | null; advertiser_email: string | null;
  status: string; start_date: string | null; end_date: string | null;
  active_hours_start: string | null; active_hours_end: string | null;
  active_days: number[]; display_locations: string[];
  display_duration_sec: number; display_priority: number;
  revenue_model: string | null; rate_per_day: number | null;
  rate_per_1000_imp: number | null; total_contract_value: number | null;
  amount_paid: number | null; balance_due: number | null;
  submitted_for_approval_at: string | null; approved_by: string | null;
  approved_at: string | null; rejection_reason: string | null;
  total_impressions: number; total_clicks: number;
  created_by: string | null; created_at: string; updated_at: string;
}

interface AdCreativeRow {
  id: string; tenant_id: string; campaign_id: string;
  creative_name: string; file_type: string; file_url: string;
  file_name: string; file_size_bytes: number; file_size_display: string;
  mime_type: string; dimensions: string | null; duration_seconds: number | null;
  display_order: number; is_active: boolean;
  passed_content_check: boolean; content_check_notes: string | null;
  uploaded_by: string | null; uploaded_at: string;
}

interface AdRevenueRow {
  id: string; tenant_id: string; campaign_id: string;
  advertiser_name: string; revenue_period: string;
  period_start: string | null; period_end: string | null;
  impressions: number | null; amount_earned: string;
  payment_status: string; invoice_number: string | null;
  paid_at: string | null; created_at: string;
}

interface AuthRequest {
  user: { id: string; tenantId: string; role: string };
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  ip: string;
  file?: { buffer: Buffer; originalname: string; mimetype: string; size: number };
}

function mapCampaign(row: AdCampaignRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    outletId: row.outlet_id,
    campaignName: row.campaign_name,
    campaignType: row.campaign_type,
    advertiserName: row.advertiser_name,
    advertiserContact: row.advertiser_contact,
    advertiserPhone: row.advertiser_phone,
    advertiserEmail: row.advertiser_email,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    activeHoursStart: row.active_hours_start,
    activeHoursEnd: row.active_hours_end,
    activeDays: row.active_days,
    displayLocations: row.display_locations,
    displayDurationSec: row.display_duration_sec,
    displayPriority: row.display_priority,
    revenueModel: row.revenue_model,
    ratePerDay: row.rate_per_day,
    ratePer1000Imp: row.rate_per_1000_imp,
    totalContractValue: row.total_contract_value,
    amountPaid: row.amount_paid,
    balanceDue: row.balance_due,
    submittedForApprovalAt: row.submitted_for_approval_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectionReason: row.rejection_reason,
    totalImpressions: row.total_impressions,
    totalClicks: row.total_clicks,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCreative(row: AdCreativeRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    campaignId: row.campaign_id,
    creativeName: row.creative_name,
    fileType: row.file_type,
    fileUrl: row.file_url,
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    fileSizeDisplay: row.file_size_display,
    mimeType: row.mime_type,
    dimensions: row.dimensions,
    durationSeconds: row.duration_seconds,
    displayOrder: row.display_order,
    isActive: row.is_active,
    passedContentCheck: row.passed_content_check,
    contentCheckNotes: row.content_check_notes,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}

function mapRevenueRecord(row: AdRevenueRow & { campaign_name?: string }) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    campaignId: row.campaign_id,
    advertiserName: row.advertiser_name,
    revenuePeriod: row.revenue_period,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    impressions: row.impressions,
    amountEarned: row.amount_earned,
    paymentStatus: row.payment_status,
    invoiceNumber: row.invoice_number,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

export function registerAdsRoutes(app: any) {
  const router = Router();

  router.get("/active", async (req: any, res: any) => {
    try {
      const kioskToken = req.headers["x-kiosk-token"] as string;
      if (!kioskToken) {
        return res.status(401).json({ error: "Kiosk token required" });
      }

      const device = await storage.getKioskDeviceByToken(kioskToken);
      if (!device || !device.active) {
        return res.status(401).json({ error: "Invalid or inactive kiosk device" });
      }

      const { location, outletId } = req.query;
      const tenantId = device.tenantId;

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();

      let q = `
        SELECT c.*, json_agg(cr.* ORDER BY cr.display_order) FILTER (WHERE cr.id IS NOT NULL AND cr.is_active = true) AS creatives
        FROM ad_campaigns c
        LEFT JOIN ad_creatives cr ON cr.campaign_id = c.id
        WHERE c.tenant_id = $1
          AND c.status = 'active'
          AND c.start_date <= $2::date
          AND c.end_date >= $2::date
          AND c.active_hours_start <= $3::time
          AND c.active_hours_end >= $3::time
          AND c.active_days @> $4::jsonb
      `;
      const params: any[] = [tenantId, today, timeStr, JSON.stringify([dayOfWeek])];

      if (location) {
        params.push(JSON.stringify([location]));
        q += ` AND c.display_locations @> $${params.length}::jsonb`;
      }
      if (outletId) {
        params.push(outletId);
        q += ` AND (c.outlet_id IS NULL OR c.outlet_id = $${params.length})`;
      }

      q += ` GROUP BY c.id ORDER BY c.display_priority DESC`;

      const { rows } = await pool.query(q, params);
      const campaigns = rows.map((r: any) => ({
        ...mapCampaign(r),
        creatives: (r.creatives || []).map(mapCreative),
      }));
      res.json(campaigns);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.use(requireAuth, requireAdRole, requireEnterprisePlan);

  router.get("/", async (req: any, res: any) => {
    try {
      const { status, type } = req.query;
      let q = `SELECT * FROM ad_campaigns WHERE tenant_id = $1`;
      const params: any[] = [req.user.tenantId];
      if (status) { params.push(status); q += ` AND status = $${params.length}`; }
      if (type) { params.push(type); q += ` AND campaign_type = $${params.length}`; }
      q += ` ORDER BY created_at DESC`;
      const { rows } = await pool.query(q, params);
      res.json(rows.map(mapCampaign));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/", async (req: any, res: any) => {
    try {
      const d = req.body;
      const campaignType = d.campaignType || "OWN";
      const requestedStatus = d.status || "draft";
      const effectiveStatus = getEffectiveStatus(requestedStatus, campaignType);
      const submittedAt = effectiveStatus === "pending_approval" ? "NOW()" : "NULL";

      const { rows } = await pool.query(
        `INSERT INTO ad_campaigns (tenant_id, outlet_id, campaign_name, campaign_type, advertiser_name, advertiser_contact, advertiser_phone, advertiser_email, status, start_date, end_date, active_hours_start, active_hours_end, active_days, display_locations, display_duration_sec, display_priority, revenue_model, rate_per_day, rate_per_1000_imp, total_contract_value, amount_paid, balance_due, created_by, submitted_for_approval_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,${submittedAt}) RETURNING *`,
        [
          req.user.tenantId, d.outletId ?? null, d.campaignName, campaignType,
          d.advertiserName ?? null, d.advertiserContact ?? null, d.advertiserPhone ?? null, d.advertiserEmail ?? null,
          effectiveStatus, d.startDate, d.endDate,
          d.activeHoursStart || "00:00", d.activeHoursEnd || "23:59",
          JSON.stringify(d.activeDays || [1,2,3,4,5,6,7]),
          JSON.stringify(d.displayLocations || ["KIOSK"]),
          d.displayDurationSec || 10, d.displayPriority || 5,
          d.revenueModel ?? null, d.ratePerDay ?? null, d.ratePer1000Imp ?? null,
          d.totalContractValue ?? null, d.amountPaid ?? 0, d.balanceDue ?? 0,
          req.user.id,
        ]
      );
      res.status(201).json(mapCampaign(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.patch("/:id", async (req: any, res: any) => {
    try {
      const d = req.body;

      const existingResult = await pool.query(
        `SELECT campaign_type, status FROM ad_campaigns WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.user.tenantId]
      );
      if (!existingResult.rows[0]) return res.status(404).json({ error: "Not found" });
      const existing = existingResult.rows[0];

      let requestedStatus = d.status;
      if (requestedStatus !== undefined) {
        const campaignType = d.campaignType || existing.campaign_type;
        d.status = getEffectiveStatus(requestedStatus, campaignType);
        if (d.status === "pending_approval" && requestedStatus === "active") {
          d.submittedForApprovalAt = new Date().toISOString();
        }
      }

      const fieldMap: Record<string, string> = {
        campaignName: "campaign_name", campaignType: "campaign_type",
        advertiserName: "advertiser_name", advertiserContact: "advertiser_contact",
        advertiserPhone: "advertiser_phone", advertiserEmail: "advertiser_email",
        status: "status", startDate: "start_date", endDate: "end_date",
        activeHoursStart: "active_hours_start", activeHoursEnd: "active_hours_end",
        activeDays: "active_days", displayLocations: "display_locations",
        displayDurationSec: "display_duration_sec", displayPriority: "display_priority",
        revenueModel: "revenue_model", ratePerDay: "rate_per_day", ratePer1000Imp: "rate_per_1000_imp",
        totalContractValue: "total_contract_value", amountPaid: "amount_paid", balanceDue: "balance_due",
        rejectionReason: "rejection_reason", approvedBy: "approved_by", approvedAt: "approved_at",
        submittedForApprovalAt: "submitted_for_approval_at",
      };
      const sets: string[] = [];
      const vals: any[] = [req.params.id, req.user.tenantId];
      for (const [k, col] of Object.entries(fieldMap)) {
        if (d[k] !== undefined) {
          let val = d[k];
          if (k === "activeDays" || k === "displayLocations") val = JSON.stringify(val);
          vals.push(val);
          sets.push(`${col} = $${vals.length}`);
        }
      }
      if (!sets.length) return res.status(400).json({ error: "No fields to update" });
      sets.push(`updated_at = NOW()`);
      const { rows } = await pool.query(
        `UPDATE ad_campaigns SET ${sets.join(",")} WHERE id=$1 AND tenant_id=$2 RETURNING *`, vals
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json(mapCampaign(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.delete("/:id", async (req: any, res: any) => {
    try {
      await pool.query(
        `UPDATE ad_campaigns SET status='expired', updated_at=NOW() WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.user.tenantId]
      );
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/:id/creatives", adUpload.single("file"), async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const { rows: camp } = await pool.query(
        `SELECT id FROM ad_campaigns WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.user.tenantId]
      );
      if (!camp[0]) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const mime = req.file.mimetype;
      const fileSizeBytes = req.file.size;
      const sizeError = validateFileSizeForType(mime, fileSizeBytes);
      if (sizeError) {
        return res.status(400).json({ error: sizeError });
      }

      const fileType = getFileType(mime);
      const fileSizeDisplay = fileSizeBytes < 1024 * 1024
        ? `${(fileSizeBytes / 1024).toFixed(1)} KB`
        : `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;

      if (IMAGE_MIMES.includes(mime)) {
        try {
          const meta = await sharp(req.file.buffer).metadata();
          const w = meta.width ?? 0;
          const h = meta.height ?? 0;
          if (w < 800 || h < 450) {
            return res.status(400).json({ error: `Image must be at least 800×450 px (got ${w}×${h})` });
          }
        } catch {
          return res.status(400).json({ error: "Could not read image dimensions" });
        }
      }

      let durationSeconds: number | null = null;
      if (VIDEO_MIMES.includes(mime)) {
        const ext = path.extname(req.file.originalname) || ".mp4";
        const dur = await getVideoDurationFromBuffer(req.file.buffer, ext);
        if (dur !== null) {
          if (dur > 30) {
            return res.status(400).json({ error: `Video must be ≤ 30 seconds (got ${Math.round(dur)}s)` });
          }
          durationSeconds = Math.round(dur);
        }
      }

      const fileUrl = await uploadFile(req.file.buffer, req.file.originalname, mime);

      const orderResult = await pool.query(
        `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM ad_creatives WHERE campaign_id=$1`, [req.params.id]
      );
      const nextOrder = orderResult.rows?.[0]?.next_order ?? 1;

      const { rows } = await pool.query(
        `INSERT INTO ad_creatives (tenant_id, campaign_id, creative_name, file_type, file_url, file_name, file_size_bytes, file_size_display, mime_type, duration_seconds, display_order, is_active, passed_content_check, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,false,$12) RETURNING *`,
        [
          req.user.tenantId, req.params.id,
          req.body.creativeName || req.file.originalname,
          fileType, fileUrl, req.file.originalname,
          fileSizeBytes, fileSizeDisplay, mime,
          durationSeconds, nextOrder,
          req.user.id,
        ]
      );
      res.status(201).json(mapCreative(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/:id/creatives", async (req: any, res: any) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM ad_creatives WHERE campaign_id=$1 AND tenant_id=$2 ORDER BY display_order`,
        [req.params.id, req.user.tenantId]
      );
      res.json(rows.map(mapCreative));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.patch("/:id/creatives/:creativeId", async (req: any, res: any) => {
    try {
      const { rows } = await pool.query(
        `UPDATE ad_creatives SET display_order=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *`,
        [req.body.displayOrder, req.params.creativeId, req.user.tenantId]
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json(mapCreative(rows[0]));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.delete("/:id/creatives/:creativeId", async (req: any, res: any) => {
    try {
      const { rows } = await pool.query(
        `DELETE FROM ad_creatives WHERE id=$1 AND tenant_id=$2 RETURNING file_url`,
        [req.params.creativeId, req.user.tenantId]
      );
      if (rows[0]?.file_url) {
        await deleteFile(rows[0].file_url).catch((e) => console.error("[ads] deleteFile error:", e));
      }
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.use("/api/ad-campaigns", router);

  app.get("/api/ad-creatives", requireAuth, requireAdRole, requireEnterprisePlan, async (req: any, res: any) => {
    try {
      const { campaignId } = req.query;
      let q = `SELECT * FROM ad_creatives WHERE tenant_id=$1`;
      const params: any[] = [req.user.tenantId];
      if (campaignId) { params.push(campaignId); q += ` AND campaign_id=$${params.length}`; }
      q += ` ORDER BY display_order`;
      const { rows } = await pool.query(q, params);
      res.json(rows.map(mapCreative));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/ad-creatives/:id", requireAuth, requireAdRole, requireEnterprisePlan, async (req: any, res: any) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM ad_creatives WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.user.tenantId]
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json(mapCreative(rows[0]));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/ad-creatives/:id", requireAuth, requireAdRole, requireEnterprisePlan, async (req: any, res: any) => {
    try {
      const d = req.body;
      const sets: string[] = [];
      const vals: any[] = [req.params.id, req.user.tenantId];
      const allowed: Record<string, string> = {
        creativeName: "creative_name", displayOrder: "display_order",
        isActive: "is_active", passedContentCheck: "passed_content_check",
        contentCheckNotes: "content_check_notes",
      };
      for (const [k, col] of Object.entries(allowed)) {
        if (d[k] !== undefined) { vals.push(d[k]); sets.push(`${col}=$${vals.length}`); }
      }
      if (!sets.length) return res.status(400).json({ error: "No fields to update" });
      const { rows } = await pool.query(
        `UPDATE ad_creatives SET ${sets.join(",")} WHERE id=$1 AND tenant_id=$2 RETURNING *`, vals
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json(mapCreative(rows[0]));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/ad-creatives/:id", requireAuth, requireAdRole, requireEnterprisePlan, async (req: any, res: any) => {
    try {
      const { rows } = await pool.query(
        `DELETE FROM ad_creatives WHERE id=$1 AND tenant_id=$2 RETURNING file_url`,
        [req.params.id, req.user.tenantId]
      );
      if (rows[0]?.file_url) {
        await deleteFile(rows[0].file_url).catch((e) => console.error("[ads] deleteFile error:", e));
      }
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/ad-impressions", async (req: any, res: any) => {
    try {
      const { tenantId, outletId, campaignId, creativeId, displayLocation, durationShownSec, deviceId, sessionId } = req.body;
      if (!tenantId || !campaignId || !creativeId) {
        return res.status(400).json({ error: "tenantId, campaignId, creativeId are required" });
      }

      const rateLimitKey = `${deviceId || req.ip}:${campaignId}`;
      if (!checkImpressionRateLimit(rateLimitKey)) {
        return res.status(429).json({ error: "Rate limit exceeded. Too many impressions recorded." });
      }

      const campaignCheck = await pool.query(
        `SELECT id FROM ad_campaigns WHERE id=$1 AND tenant_id=$2 AND status='active'`,
        [campaignId, tenantId]
      );
      if (!campaignCheck.rows[0]) {
        return res.status(400).json({ error: "Campaign not found or not active" });
      }

      const creativeCheck = await pool.query(
        `SELECT id FROM ad_creatives WHERE id=$1 AND campaign_id=$2 AND tenant_id=$3 AND is_active=true`,
        [creativeId, campaignId, tenantId]
      );
      if (!creativeCheck.rows[0]) {
        return res.status(400).json({ error: "Creative not found or does not belong to campaign" });
      }

      await pool.query(
        `INSERT INTO ad_impressions (tenant_id, outlet_id, campaign_id, creative_id, display_location, duration_shown_sec, device_id, session_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tenantId, outletId ?? null, campaignId, creativeId, displayLocation ?? null, durationShownSec ?? null, deviceId ?? null, sessionId ?? null]
      );
      await pool.query(
        `UPDATE ad_campaigns SET total_impressions = total_impressions + 1, updated_at = NOW() WHERE id=$1`,
        [campaignId]
      );
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/ad-revenue", requireAuth, requireAdRole, requireEnterprisePlan, async (req: any, res: any) => {
    try {
      const { rows } = await pool.query(
        `SELECT r.*, c.campaign_name FROM ad_revenue_records r
         LEFT JOIN ad_campaigns c ON c.id = r.campaign_id
         WHERE r.tenant_id=$1 ORDER BY r.created_at DESC`,
        [req.user.tenantId]
      );
      res.json(rows.map((r: any) => ({ ...mapRevenueRecord(r), campaignName: r.campaign_name })));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/ad-revenue", requireAuth, requireAdRole, requireEnterprisePlan, async (req: any, res: any) => {
    try {
      const d = req.body;
      const { rows } = await pool.query(
        `INSERT INTO ad_revenue_records (tenant_id, campaign_id, advertiser_name, revenue_period, period_start, period_end, impressions, amount_earned, payment_status, invoice_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.user.tenantId, d.campaignId, d.advertiserName ?? null, d.revenuePeriod ?? null,
         d.periodStart ?? null, d.periodEnd ?? null, d.impressions ?? 0,
         d.amountEarned ?? null, d.paymentStatus || "pending", d.invoiceNumber ?? null]
      );
      res.status(201).json(mapRevenueRecord(rows[0]));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/ad-revenue/:id", requireAuth, requireAdRole, requireEnterprisePlan, async (req: any, res: any) => {
    try {
      const d = req.body;
      const sets: string[] = [];
      const vals: any[] = [req.params.id, req.user.tenantId];
      const fieldMap: Record<string, string> = {
        paymentStatus: "payment_status", paidAt: "paid_at", invoiceNumber: "invoice_number",
        amountEarned: "amount_earned", impressions: "impressions",
      };
      for (const [k, col] of Object.entries(fieldMap)) {
        if (d[k] !== undefined) { vals.push(d[k]); sets.push(`${col} = $${vals.length}`); }
      }
      if (!sets.length) return res.status(400).json({ error: "No fields to update" });
      const { rows } = await pool.query(
        `UPDATE ad_revenue_records SET ${sets.join(",")} WHERE id=$1 AND tenant_id=$2 RETURNING *`, vals
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json(mapRevenueRecord(rows[0]));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/ad-approvals", requireAuth, async (req: any, res: any) => {
    try {
      if ((req.user.role as string) !== "super_admin") return res.status(403).json({ error: "Forbidden" });
      const { rows } = await pool.query(
        `SELECT c.*, t.name AS tenant_name FROM ad_campaigns c
         JOIN tenants t ON t.id = c.tenant_id
         WHERE c.status = 'pending_approval'
         ORDER BY c.submitted_for_approval_at ASC`
      );
      res.json(rows.map((r: any) => ({ ...mapCampaign(r), tenantName: r.tenant_name })));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/ad-approvals/:id/approve", requireAuth, requireFreshSession, async (req: any, res: any) => { 
    try {
      if ((req.user.role as string) !== "super_admin") return res.status(403).json({ error: "Forbidden" });
      await pool.query(
        `UPDATE ad_campaigns SET status='active', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [req.user.id, req.params.id]
      );
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/ad-approvals/:id/reject", requireAuth, requireFreshSession, async (req: any, res: any) => {
    try {
      if ((req.user.role as string) !== "super_admin") return res.status(403).json({ error: "Forbidden" });
      const { reason } = req.body;
      await pool.query(
        `UPDATE ad_campaigns SET status='rejected', rejection_reason=$1, updated_at=NOW() WHERE id=$2`,
        [reason ?? null, req.params.id]
      );
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
