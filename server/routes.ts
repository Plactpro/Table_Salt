import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { setupAuth, requireAuth } from "./auth";
import { registerAdminRoutes } from "./admin-routes";
import { setupCsrf, setupIpAllowlistMiddleware } from "./security";
import { uploadFile } from "./services/file-storage";

import { registerAuthRoutes } from "./routers/auth";
import { registerUsersRoutes } from "./routers/users";
import { registerMenuRoutes } from "./routers/menu";
import { registerTablesRoutes } from "./routers/tables";
import { registerReservationsRoutes } from "./routers/reservations";
import { registerOrdersRoutes } from "./routers/orders";
import { registerInventoryRoutes } from "./routers/inventory";
import { registerCustomersRoutes } from "./routers/customers";
import { registerStaffRoutes } from "./routers/staff";
import { registerBillingRoutes } from "./routers/billing";
import { registerTenantRoutes } from "./routers/tenant";
import { registerDeliveryRoutes } from "./routers/delivery";
import { registerContactRoutes } from "./routers/contact";
import { registerAttendanceRoutes } from "./routers/attendance";
import { registerCleaningRoutes } from "./routers/cleaning";
import { registerRecipesRoutes } from "./routers/recipes";
import { registerKitchenRoutes } from "./routers/kitchen";
import { registerChannelsRoutes } from "./routers/channels";
import { registerFranchiseRoutes } from "./routers/franchise";
import { registerProcurementRoutes } from "./routers/procurement";
import { registerWorkforceRoutes } from "./routers/workforce";
import { registerPermissionsRoutes } from "./routers/permissions";
import { registerKioskRoutes } from "./routers/kiosk";
import { registerGuestRoutes } from "./routers/guest";
import { registerEventsRoutes } from "./routers/events";
import { registerComplianceRoutes } from "./routers/compliance";
import { registerRestaurantBillingRoutes } from "./routers/restaurant-billing";
import { registerPrintJobRoutes } from "./routers/print-jobs";
import { registerTableRequestRoutes } from "./routers/table-requests";
import { registerKitchenAssignmentRoutes } from "./routers/kitchen-assignment";
import { registerStockReportsRoutes } from "./routers/stock-reports";
import { registerPrepNotificationRoutes } from "./routers/prep-notifications";
import { registerPushSubscriptionRoutes } from "./routers/push-subscriptions";
import { registerServiceCoordinationRoutes } from "./routers/service-coordination";
import { registerCoordinationRoutes } from "./routers/coordination";
import { registerModificationsRoutes } from "./routers/modifications";
import { registerWastageRoutes } from "./routers/wastage";
import { registerPrinterRoutes } from "./routers/printers";
import { registerPricingRoutes } from "./routers/pricing";
import { registerTimePerformanceRoutes } from "./routers/time-performance";
import { registerTicketHistoryRoutes } from "./routers/ticket-history";
import { registerAlertSystemRoutes } from "./routers/alert-system";
import { registerCashMachineRoutes } from "./routers/cash-machine";
import { registerTipManagementRoutes } from "./routers/tip-management";
import { registerPackingChargeRoutes } from "./routers/packing-charges";
import { registerSupportRoutes } from "./routers/support";
import { registerOnboardingRoutes } from "./routers/onboarding";
import { registerResourceRoutes } from "./routers/resources";
import { registerParkingRoutes } from "./routers/parking";
import { registerAdsRoutes } from "./routers/ads";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedExt = /\.(jpg|jpeg|png|gif|webp)$/i;
    const allowedMime = /^image\/(jpeg|png|gif|webp)$/;
    if (allowedExt.test(path.extname(file.originalname)) && allowedMime.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files (JPG, PNG, GIF, WEBP) are allowed"));
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMime = /^video\/(mp4|webm)$/;
    if (allowedMime.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only video files (MP4, WEBM) are allowed"));
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);
  setupCsrf(app);
  setupIpAllowlistMiddleware(app);
  registerAdminRoutes(app);

  const express = (await import("express")).default;
  app.get("/uploads/:filename", (req: any, res: any, next: any) => {
    const filename = req.params.filename as string;
    if (filename.match(/\.html?$/i)) {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; img-src *; font-src *; script-src 'none'"
      );
    }
    next();
  });
  app.use("/uploads", express.static(uploadDir));

  app.post("/api/upload/image", requireAuth, (req: any, res: any, next: any) => {
    upload.single("image")(req, res, async (err: any) => {
      if (err) {
        const msg = err.code === "LIMIT_FILE_SIZE" ? "File too large (max 5MB)" : err.message || "Upload failed";
        return res.status(400).json({ message: msg });
      }
      if (!req.file) return res.status(400).json({ message: "No image file provided" });
      try {
        const url = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
        res.json({ url });
      } catch (uploadErr: any) {
        console.error("[upload] Image upload failed:", uploadErr);
        res.status(500).json({ message: "Upload failed" });
      }
    });
  });

  app.post("/api/upload/video", requireAuth, (req: any, res: any, next: any) => {
    videoUpload.single("video")(req, res, async (err: any) => {
      if (err) {
        const msg = err.code === "LIMIT_FILE_SIZE" ? "File too large (max 50MB)" : err.message || "Upload failed";
        return res.status(400).json({ message: msg });
      }
      if (!req.file) return res.status(400).json({ message: "No video file provided" });
      try {
        const url = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
        res.json({ url });
      } catch (uploadErr: any) {
        console.error("[upload] Video upload failed:", uploadErr);
        res.status(500).json({ message: "Upload failed" });
      }
    });
  });

  registerAuthRoutes(app);
  registerUsersRoutes(app);
  registerMenuRoutes(app);
  registerTablesRoutes(app);
  registerReservationsRoutes(app);
  registerOrdersRoutes(app);
  registerInventoryRoutes(app);
  registerCustomersRoutes(app);
  registerStaffRoutes(app);
  registerBillingRoutes(app);
  registerTenantRoutes(app);
  registerDeliveryRoutes(app);
  registerContactRoutes(app);
  registerAttendanceRoutes(app);
  registerCleaningRoutes(app);
  registerRecipesRoutes(app);
  registerKitchenRoutes(app);
  registerChannelsRoutes(app);
  registerFranchiseRoutes(app);
  registerProcurementRoutes(app);
  registerWorkforceRoutes(app);
  registerPermissionsRoutes(app);
  registerKioskRoutes(app);
  registerGuestRoutes(app);
  registerEventsRoutes(app);
  registerComplianceRoutes(app);
  registerRestaurantBillingRoutes(app);
  registerPrintJobRoutes(app);
  registerTableRequestRoutes(app);
  registerKitchenAssignmentRoutes(app);
  registerStockReportsRoutes(app);
  registerPrepNotificationRoutes(app);
  registerPushSubscriptionRoutes(app);
  registerServiceCoordinationRoutes(app);
  registerCoordinationRoutes(app);
  registerModificationsRoutes(app);
  registerWastageRoutes(app);
  registerPrinterRoutes(app);
  registerPricingRoutes(app);
  registerTimePerformanceRoutes(app);
  registerTicketHistoryRoutes(app);
  registerAlertSystemRoutes(app);
  registerCashMachineRoutes(app);
  registerTipManagementRoutes(app);
  registerPackingChargeRoutes(app);
  registerSupportRoutes(app);
  registerOnboardingRoutes(app);
  registerResourceRoutes(app);
  registerParkingRoutes(app);
  registerAdsRoutes(app);

  app.post("/api/errors/client", (req: any, res: any) => {
    const { message, stack, pathname, userAgent } = req.body || {};
    console.error("[CLIENT_ERROR]", JSON.stringify({ message, stack, pathname, userAgent }));
    res.status(204).end();
  });

  return httpServer;
}
