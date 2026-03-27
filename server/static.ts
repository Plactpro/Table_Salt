import express, { type Express } from "express";
import fs from "fs";
import path from "path";

// PR-012: QR route pattern — matches /table, /table/, /table/anything, /guest, /guest/, /guest/anything
// Avoids false positives like /tables (which is an admin route)
function isQrRoute(reqPath: string): boolean {
  return /^\/(table|guest)(\/|$)/.test(reqPath);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  const qrHtmlPath = path.resolve(distPath, "qr.html");
  const hasQrBundle = fs.existsSync(qrHtmlPath);

  // Serve lightweight qr.html for customer-facing QR routes if the bundle exists
  app.use("/{*path}", (req, res) => {
    if (hasQrBundle && isQrRoute(req.path)) {
      return res.sendFile(qrHtmlPath);
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
