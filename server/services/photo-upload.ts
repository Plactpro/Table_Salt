import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "audit-photos");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, UPLOAD_DIR),
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname);
    cb(null, crypto.randomBytes(16).toString("hex") + ext);
  },
});

export const auditPhotoUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter: (_req: any, file: any, cb: any) => {
    cb(null, ["image/jpeg", "image/png", "image/webp", "image/heic"].includes(file.mimetype));
  },
});

export function getPhotoUrl(filename: string) {
  return "/uploads/audit-photos/" + filename;
}