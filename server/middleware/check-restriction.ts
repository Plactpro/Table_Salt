import type { Request, Response, NextFunction } from "express";
import { pool } from "../db";

const ALLOWED_PATHS = [
  "/api/auth/me",
  "/api/auth/logout",
  "/api/gdpr/",
  "/api/profile",
  "/api/health",
];

const cache = new Map<string, { restricted: boolean; checkedAt: number }>();
const CACHE_TTL_MS = 30_000;

export function blockIfRestricted(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user?.id) return next();

  const isGet = req.method === "GET";
  const isAllowed = isGet || ALLOWED_PATHS.some(p => req.path.startsWith(p));

  if (isAllowed) return next();

  const now = Date.now();
  const cached = cache.get(user.id);
  if (cached && now - cached.checkedAt < CACHE_TTL_MS) {
    if (cached.restricted) {
      return res.status(403).json({
        code: "PROCESSING_RESTRICTED",
        message:
          "Your account has a data processing restriction in place. " +
          "Write operations are paused. Contact your administrator.",
      });
    }
    return next();
  }

  pool.query(
    `SELECT processing_restricted FROM users WHERE id = $1`,
    [user.id]
  ).then(({ rows: [row] }) => {
    const restricted = row?.processing_restricted === true;
    cache.set(user.id, { restricted, checkedAt: now });

    if (restricted) {
      return res.status(403).json({
        code: "PROCESSING_RESTRICTED",
        message:
          "Your account has a data processing restriction in place. " +
          "Write operations are paused. Contact your administrator.",
      });
    }
    next();
  }).catch(() => {
    next();
  });
}
