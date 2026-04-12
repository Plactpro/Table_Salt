import { pool } from "../db";
import { requireAuth } from "../auth";

function requireRole(...roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}

export function registerLeaveRoutes(app: any) {

  app.get("/api/leave-requests", requireAuth, async (req: any, res: any) => {
    try {
      const tenantId = req.user?.tenantId;
      const { status, userId } = req.query;
      const role = req.user?.role;
      let query = `SELECT lr.*, u.name as user_name, u.role as user_role, r.name as reviewer_name FROM leave_requests lr JOIN users u ON u.id = lr.user_id LEFT JOIN users r ON r.id = lr.reviewed_by WHERE lr.tenant_id = $1`;
      const params: any[] = [tenantId];
      let p = 2;
      if (!["owner","manager","hq_admin"].includes(role)) { query += ` AND lr.user_id = $${p}`; params.push(req.user?.id); p++; }
      else if (userId) { query += ` AND lr.user_id = $${p}`; params.push(userId); p++; }
      if (status) { query += ` AND lr.status = $${p}`; params.push(status); }
      query += " ORDER BY lr.created_at DESC";
      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/leave-requests", requireAuth, async (req: any, res: any) => {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.id;
      const { leaveType, startDate, endDate, reason } = req.body;
      if (!leaveType || !startDate || !endDate) return res.status(400).json({ message: "leaveType, startDate, endDate are required" });
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end < start) return res.status(400).json({ message: "End date must be after start date" });
      const daysRequested = Math.ceil((end.getTime() - start.getTime()) / (1000*60*60*24)) + 1;
      const { rows: overlap } = await pool.query(
        `SELECT id FROM leave_requests WHERE user_id=$1 AND tenant_id=$2 AND status NOT IN ('rejected','cancelled') AND start_date<=$3 AND end_date>=$4`,
        [userId, tenantId, endDate, startDate]
      );
      if (overlap.length > 0) return res.status(400).json({ message: "You already have a leave request for these dates" });
      const { rows: [request] } = await pool.query(
        `INSERT INTO leave_requests (tenant_id, user_id, leave_type, start_date, end_date, days_requested, reason, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
        [tenantId, userId, leaveType, startDate, endDate, daysRequested, reason ?? null]
      );
      res.status(201).json(request);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/leave-requests/:id/approve", requireAuth, requireRole("owner","manager"), async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { reviewNotes } = req.body;
      const { rows: [request] } = await pool.query(
        `UPDATE leave_requests SET status='approved', reviewed_by=$1, reviewed_at=NOW(), review_notes=$2, updated_at=NOW() WHERE id=$3 AND tenant_id=$4 AND status='pending' RETURNING *`,
        [req.user?.id, reviewNotes ?? null, id, req.user?.tenantId]
      );
      if (!request) return res.status(404).json({ message: "Request not found or already reviewed" });
      const year = new Date(request.start_date).getFullYear();
      const field = request.leave_type === "sick" ? "sick_used" : "annual_used";
      await pool.query(
        `INSERT INTO leave_balances (tenant_id, user_id, year) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, user_id, year) DO UPDATE SET ${field} = leave_balances.${field} + $4, updated_at=NOW()`,
        [req.user?.tenantId, request.user_id, year, request.days_requested]
      );
      res.json(request);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/leave-requests/:id/reject", requireAuth, requireRole("owner","manager"), async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { reviewNotes } = req.body;
      const { rows: [request] } = await pool.query(
        `UPDATE leave_requests SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_notes=$2, updated_at=NOW() WHERE id=$3 AND tenant_id=$4 AND status='pending' RETURNING *`,
        [req.user?.id, reviewNotes ?? null, id, req.user?.tenantId]
      );
      if (!request) return res.status(404).json({ message: "Request not found or already reviewed" });
      res.json(request);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/leave-requests/:id/cancel", requireAuth, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { rows: [request] } = await pool.query(
        `UPDATE leave_requests SET status='cancelled', updated_at=NOW() WHERE id=$1 AND tenant_id=$2 AND user_id=$3 AND status='pending' RETURNING *`,
        [id, req.user?.tenantId, req.user?.id]
      );
      if (!request) return res.status(404).json({ message: "Request not found or cannot be cancelled" });
      res.json(request);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/leave-balances/:userId", requireAuth, async (req: any, res: any) => {
    try {
      const { userId } = req.params;
      const year = req.query.year ?? new Date().getFullYear();
      const { rows: [balance] } = await pool.query(
        `SELECT * FROM leave_balances WHERE user_id=$1 AND tenant_id=$2 AND year=$3`,
        [userId, req.user?.tenantId, year]
      );
      res.json(balance ?? { userId, year, annualTotal:21, annualUsed:0, sickTotal:10, sickUsed:0 });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
