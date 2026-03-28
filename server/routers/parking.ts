import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { emitToTenant } from "../realtime";
import { pool } from "../db";
import { calculateParkingCharge, applyParkingChargeToBill } from "../services/parking-charge-service";

export function registerParkingRoutes(app: Express): void {

  // ─── Config ────────────────────────────────────────────────────────────────
  app.get("/api/parking/config/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const config = await storage.getParkingConfig(req.params.outletId, user.tenantId);
      res.json(config ?? {});
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/parking/config/:outletId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const config = await storage.upsertParkingConfig(req.params.outletId, user.tenantId, req.body);
      res.json(config);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Zones ─────────────────────────────────────────────────────────────────
  app.get("/api/parking/zones/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const zones = await storage.getParkingZones(req.params.outletId, user.tenantId);
      res.json(zones);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/parking/zones/:outletId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const zone = await storage.createParkingZone({
        ...req.body,
        tenantId: user.tenantId,
        outletId: req.params.outletId,
      });
      res.status(201).json(zone);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/parking/zones/:outletId/:zoneId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const zone = await storage.updateParkingZone(req.params.zoneId, user.tenantId, req.body);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      res.json(zone);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/parking/zones/:outletId/:zoneId", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteParkingZone(req.params.zoneId, user.tenantId);
      res.status(204).end();
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Slots ──────────────────────────────────────────────────────────────────
  app.get("/api/parking/slots/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const slots = await storage.getParkingSlots(req.params.outletId, user.tenantId);
      // Enrich occupied slots with active ticket data (vehicle number, entry time)
      const activeTickets = await pool.query(
        `SELECT id, slot_id, vehicle_number, vehicle_type, entry_time, ticket_number
         FROM valet_tickets WHERE outlet_id=$1 AND tenant_id=$2 AND slot_id IS NOT NULL
         AND status IN ('parked','requested','retrieving','ready')`,
        [req.params.outletId, user.tenantId]
      );
      const ticketBySlot: Record<string, any> = {};
      for (const t of activeTickets.rows) {
        if (t.slot_id) ticketBySlot[t.slot_id] = t;
      }
      const enriched = slots.map(s => {
        const t = ticketBySlot[s.id];
        return t ? {
          ...s,
          vehicleNumber: t.vehicle_number,
          vehicleType: t.vehicle_type,
          entryTime: t.entry_time,
          ticketNumber: t.ticket_number,
        } as typeof s & { vehicleNumber?: string; vehicleType?: string; entryTime?: Date; ticketNumber?: string } : s;
      });
      res.json(enriched);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/parking/slots/:outletId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const slot = await storage.createParkingSlot({
        ...req.body,
        tenantId: user.tenantId,
        outletId: req.params.outletId,
      });
      await _recalcAvailability(req.params.outletId, user.tenantId);
      res.status(201).json(slot);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/parking/slots/:outletId/:slotId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const slot = await storage.updateParkingSlot(req.params.slotId, user.tenantId, req.body);
      if (!slot) return res.status(404).json({ message: "Slot not found" });
      await _recalcAvailability(req.params.outletId, user.tenantId);
      res.json(slot);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Rates ──────────────────────────────────────────────────────────────────
  app.get("/api/parking/rates/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const rates = await storage.getParkingRates(req.params.outletId, user.tenantId);
      const withSlabs = await Promise.all(rates.map(async rate => ({
        ...rate,
        slabs: await storage.getParkingRateSlabs(rate.id),
      })));
      res.json(withSlabs);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/parking/rates/:outletId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { slabs, ...rateData } = req.body;
      const rate = await storage.createParkingRate({
        ...rateData,
        tenantId: user.tenantId,
        outletId: req.params.outletId,
      });
      const createdSlabs = [];
      if (Array.isArray(slabs)) {
        for (const slab of slabs) {
          const s = await storage.createParkingRateSlab({ ...slab, rateId: rate.id });
          createdSlabs.push(s);
        }
      }
      res.status(201).json({ ...rate, slabs: createdSlabs });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/parking/rates/:outletId/:rateId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { slabs, ...rateData } = req.body;
      const rate = await storage.updateParkingRate(req.params.rateId, user.tenantId, rateData);
      if (!rate) return res.status(404).json({ message: "Rate not found" });
      if (Array.isArray(slabs)) {
        await storage.deleteRateSlabsByRate(rate.id);
        const createdSlabs = [];
        for (const slab of slabs) {
          const s = await storage.createParkingRateSlab({ ...slab, rateId: rate.id });
          createdSlabs.push(s);
        }
        return res.json({ ...rate, slabs: createdSlabs });
      }
      const existingSlabs = await storage.getParkingRateSlabs(rate.id);
      res.json({ ...rate, slabs: existingSlabs });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/parking/rates/:outletId/:rateId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteParkingRate(req.params.rateId, user.tenantId);
      res.status(204).end();
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Valet Staff ────────────────────────────────────────────────────────────
  app.get("/api/parking/valet-staff/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const staff = await storage.getValetStaff(req.params.outletId, user.tenantId);
      res.json(staff);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/parking/valet-staff/:outletId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const staff = await storage.createValetStaff({
        ...req.body,
        tenantId: user.tenantId,
        outletId: req.params.outletId,
      });
      res.status(201).json(staff);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/parking/valet-staff/:outletId/:staffId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const staff = await storage.updateValetStaff(req.params.staffId, user.tenantId, req.body);
      if (!staff) return res.status(404).json({ message: "Valet staff not found" });
      res.json(staff);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Valet Tickets ──────────────────────────────────────────────────────────
  // IMPORTANT: specific named routes BEFORE wildcard /:id

  app.get("/api/parking/tickets/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const statusParam = req.query.status as string | undefined;
      const all = req.query.all === "1" || req.query.all === "true";
      const defaultActiveStatuses = ["parked", "requested", "retrieving"];
      let statusFilter: { status: string | string[] } | undefined;
      if (statusParam) {
        const parts = statusParam.split(",").map(s => s.trim()).filter(Boolean);
        statusFilter = { status: parts.length === 1 ? parts[0] : parts };
      } else if (!all) {
        statusFilter = { status: defaultActiveStatuses };
      }
      const tickets = await storage.getValetTickets(req.params.outletId, user.tenantId, statusFilter);
      const now = Date.now();
      const enriched = tickets.map(t => ({
        ...t,
        liveDurationMinutes: t.status !== "completed" && t.entryTime
          ? Math.floor((now - new Date(t.entryTime).getTime()) / 60000)
          : t.durationMinutes,
      }));
      res.json(enriched);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Lookup active valet ticket for a specific order (used by BillPreviewModal)
  // Strategy: 1) bill-linked, 2) same-table active ticket, 3) outlet-level most recent active ticket
  app.get("/api/parking/ticket-by-order/:orderId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const orderId = req.params.orderId;

      // Strategy 1: ticket linked via bill (works after payment/charge applied)
      const { rows: byBill } = await pool.query(
        `SELECT vt.* FROM valet_tickets vt
         JOIN bills b ON b.id = vt.bill_id
         WHERE b.order_id=$1 AND vt.tenant_id=$2
           AND vt.status IN ('parked','requested','retrieving','ready','completed')
         ORDER BY vt.created_at DESC LIMIT 1`,
        [orderId, user.tenantId]
      );
      if (byBill[0]) return res.json(byBill[0]);

      // Resolve order → table_id + outlet_id for table-scoped lookup
      const { rows: orderRows } = await pool.query(
        `SELECT o.table_id, o.outlet_id FROM orders o WHERE o.id=$1 AND o.tenant_id=$2 LIMIT 1`,
        [orderId, user.tenantId]
      );
      const outletId = orderRows[0]?.outlet_id;
      const tableId = orderRows[0]?.table_id;

      // Strategy 2: active ticket linked to same table (via another bill on the same table)
      if (tableId) {
        const { rows: byTable } = await pool.query(
          `SELECT vt.* FROM valet_tickets vt
           LEFT JOIN bills b2 ON b2.id = vt.bill_id
           LEFT JOIN orders o2 ON o2.id = b2.order_id
           WHERE vt.tenant_id=$1 AND vt.outlet_id=$2
             AND o2.table_id=$3
             AND vt.status IN ('parked','requested','retrieving','ready')
           ORDER BY vt.created_at DESC LIMIT 1`,
          [user.tenantId, outletId, tableId]
        );
        if (byTable[0]) return res.json(byTable[0]);
      }

      // Strategy 3: most recent active ticket for this outlet (fallback for preview)
      if (outletId) {
        const { rows: byOutlet } = await pool.query(
          `SELECT vt.* FROM valet_tickets vt
           WHERE vt.tenant_id=$1 AND vt.outlet_id=$2
             AND vt.status IN ('parked','requested','retrieving','ready')
             AND vt.bill_id IS NULL
           ORDER BY vt.created_at DESC LIMIT 1`,
          [user.tenantId, outletId]
        );
        if (byOutlet[0]) return res.json(byOutlet[0]);
      }

      return res.status(404).json({ message: "No active ticket for this order" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/parking/tickets", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.body.outletId || user.outletId;
      if (!outletId) return res.status(400).json({ message: "outletId is required" });

      if (req.body.billId) {
        const { rows: billCheck } = await pool.query(
          `SELECT id FROM bills WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
          [req.body.billId, user.tenantId]
        );
        if (!billCheck[0]) return res.status(400).json({ message: "Bill not found or does not belong to this tenant" });
      }

      const ticketNumber = await storage.generateValetTicketNumber(outletId, user.tenantId);

      const ticket = await storage.createValetTicket({
        ...req.body,
        tenantId: user.tenantId,
        outletId,
        ticketNumber,
        status: "parked",
        customerId: req.body.customerId || null,
      });

      if (ticket.slotId) {
        await storage.updateParkingSlot(ticket.slotId, user.tenantId, { status: "occupied" });
        await _recalcAvailability(outletId, user.tenantId);
      }

      await storage.appendValetTicketEvent(ticket.id, user.tenantId, {
        eventType: "VEHICLE_ARRIVED",
        performedBy: user.id,
        performedByName: user.name || user.username,
      });

      res.status(201).json(ticket);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/parking/tickets/:id/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const ticket = await storage.getValetTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });

      const { status, notes } = req.body;
      const updateData: Record<string, any> = { status };
      if (notes) updateData.notes = notes;

      if (status === "completed") {
        const exitTime = new Date();
        const entryTime = ticket.entryTime ? new Date(ticket.entryTime) : exitTime;
        const durationMinutes = Math.floor((exitTime.getTime() - entryTime.getTime()) / 60000);
        updateData.exitTime = exitTime;
        updateData.durationMinutes = durationMinutes;

        if (ticket.slotId) {
          await storage.updateParkingSlot(ticket.slotId, user.tenantId, { status: "available" });
          await _recalcAvailability(ticket.outletId, user.tenantId);
        }

        // Always compute and store the charge on the ticket itself (source of truth for revenue)
        let chargeResult: Awaited<ReturnType<typeof calculateParkingCharge>> | null = null;
        try {
          chargeResult = await calculateParkingCharge(ticket.id, ticket.outletId, user.tenantId);
          await pool.query(
            `UPDATE valet_tickets SET final_charge = $1 WHERE id = $2 AND tenant_id = $3`,
            [chargeResult.finalCharge, ticket.id, user.tenantId]
          );
        } catch (e) {
          console.error("[parking] Charge calculation failed at checkout:", e);
        }

        if (ticket.billId && !ticket.chargeAddedToBill) {
          applyParkingChargeToBill(ticket.billId, ticket.id, user.tenantId).catch(e =>
            console.error("[parking] Auto apply charge failed:", e)
          );
        }

        // Task #164: CRM sync — update customer stats when ticket is completed
        const customerId = ticket.customerId;
        if (customerId) {
          _syncCrmOnCheckout(customerId, ticket, user.tenantId).catch((e: any) =>
            console.error("[parking] CRM sync failed (non-blocking):", e?.message ?? e)
          );
        } else if (ticket.customerPhone) {
          // If no customerId but phone present, try to create/find customer and sync
          _ensureCustomerAndSync(ticket, user.tenantId).catch((e: any) =>
            console.error("[parking] CRM auto-create failed (non-blocking):", e?.message ?? e)
          );
        }
      }

      const updated = await storage.updateValetTicket(ticket.id, user.tenantId, updateData);
      await storage.appendValetTicketEvent(ticket.id, user.tenantId, {
        eventType: `STATUS_${status.toUpperCase()}`,
        performedBy: user.id,
        performedByName: user.name || user.username,
        notes,
      });

      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Retrieval Requests ─────────────────────────────────────────────────────
  app.get("/api/parking/retrieval-requests/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const statusParam = req.query.status as string | undefined;
      let statusFilter: string | string[] | undefined;
      if (statusParam) {
        const parts = statusParam.split(",").map(s => s.trim()).filter(Boolean);
        statusFilter = parts.length === 1 ? parts[0] : parts;
      }
      const requests = await storage.getRetrievalRequests(req.params.outletId, user.tenantId, statusFilter ? { status: statusFilter } : undefined);

      // Promote matured scheduled requests (scheduled_for <= NOW()) by fetching from DB
      const { rows: maturedRows } = await pool.query(
        `UPDATE valet_retrieval_requests
         SET scheduled_for = NULL
         WHERE outlet_id=$1 AND tenant_id=$2
           AND scheduled_for IS NOT NULL AND scheduled_for <= NOW()
           AND status='pending'
         RETURNING id, ticket_id`,
        [req.params.outletId, user.tenantId]
      );
      for (const r of maturedRows) {
        // Emit real-time so valet dashboards pick it up
        emitToTenant(user.tenantId, "parking:retrieval_requested", { ticketId: r.ticket_id, source: "QR_TABLE_SCHEDULED" });
        // Mark ticket as requested
        await pool.query(
          `UPDATE valet_tickets SET status='requested' WHERE id=$1 AND tenant_id=$2 AND status='parked'`,
          [r.ticket_id, user.tenantId]
        );
      }

      // Enrich requests with scheduled_for from DB (not stored in storage layer)
      const { rows: scheduledRows } = await pool.query(
        `SELECT id, scheduled_for FROM valet_retrieval_requests
         WHERE outlet_id=$1 AND tenant_id=$2 AND scheduled_for IS NOT NULL AND status='pending'`,
        [req.params.outletId, user.tenantId]
      );
      const scheduledMap: Record<string, string> = {};
      for (const r of scheduledRows) {
        scheduledMap[r.id] = r.scheduled_for;
      }

      const enriched = requests.map((r: any) => ({
        ...r,
        scheduledFor: scheduledMap[r.id] ?? null,
      }));

      res.json(enriched);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/parking/retrieval-requests", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.body.outletId || user.outletId;
      if (!outletId) return res.status(400).json({ message: "outletId is required" });

      if (req.body.ticketId) {
        const ticketCheck = await storage.getValetTicket(req.body.ticketId);
        if (!ticketCheck || ticketCheck.tenantId !== user.tenantId) {
          return res.status(400).json({ message: "Ticket not found or does not belong to this tenant" });
        }
        if (ticketCheck.outletId !== outletId) {
          return res.status(400).json({ message: "Ticket does not belong to this outlet" });
        }
      }

      // Determine priority and auto-assign queue_position
      const requestedPriority = req.body.priority || "NORMAL";
      const ticketForPriority = req.body.ticketId ? await storage.getValetTicket(req.body.ticketId) : null;
      const isVipRequest = requestedPriority === "VIP" || ticketForPriority?.isVip === true;
      const finalPriority = isVipRequest ? "VIP" : requestedPriority;
      // VIP requests always queue at position 1 (front of the line).
      // URGENT and NORMAL requests append to the end of their respective priority groups.
      let nextQueuePos: number;
      if (finalPriority === "VIP") {
        nextQueuePos = 1;
      } else {
        const { rows: queueRows } = await pool.query(
          `SELECT COALESCE(MAX(queue_position), 0) AS max_pos FROM valet_retrieval_requests WHERE outlet_id=$1 AND tenant_id=$2 AND status NOT IN ('completed','cancelled') AND COALESCE(priority,'NORMAL')=$3`,
          [outletId, user.tenantId, finalPriority]
        );
        nextQueuePos = parseInt(queueRows[0]?.max_pos ?? "0") + 1;
      }

      const request = await storage.createRetrievalRequest({
        ...req.body,
        tenantId: user.tenantId,
        outletId,
        requestedBy: user.id,
        requestedByName: user.name || user.username,
        status: "pending",
        priority: finalPriority,
        queuePosition: nextQueuePos,
      });

      emitToTenant(user.tenantId, "parking:retrieval_requested", { request });

      const ticket = await storage.getValetTicket(request.ticketId);
      if (ticket) {
        await storage.updateValetTicket(ticket.id, user.tenantId, { status: "requested" });
        await storage.appendValetTicketEvent(ticket.id, user.tenantId, {
          eventType: "RETRIEVAL_REQUESTED",
          performedBy: user.id,
          performedByName: user.name || user.username,
          notes: req.body.notes,
        });
      }

      res.status(201).json(request);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/parking/retrieval-requests/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const updated = await storage.updateRetrievalRequest(req.params.id, user.tenantId, req.body);
      if (!updated) return res.status(404).json({ message: "Request not found" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Valet Staff Performance (per-day aggregates) ───────────────────────────
  app.get("/api/parking/valet-staff-performance/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const tenantId = user.tenantId;

      // Get all staff for this outlet
      const { rows: staffRows } = await pool.query(
        `SELECT id, name, badge_number, is_on_duty, duty_started_at FROM valet_staff
         WHERE outlet_id=$1 AND tenant_id=$2 AND is_active=true`,
        [outletId, tenantId]
      );

      // Per staff: tickets checked in on given date
      const { rows: checkInRows } = await pool.query(
        `SELECT valet_staff_id, COUNT(*) as check_ins
         FROM valet_tickets
         WHERE outlet_id=$1 AND tenant_id=$2
           AND DATE(entry_time)=$3
           AND valet_staff_id IS NOT NULL
         GROUP BY valet_staff_id`,
        [outletId, tenantId, dateStr]
      );
      const checkInMap: Record<string, number> = {};
      for (const r of checkInRows) {
        checkInMap[r.valet_staff_id] = parseInt(r.check_ins);
      }

      // Per staff: retrieval completions and avg timing using ticket events.
      // Timing = time between STATUS_REQUESTED event and STATUS_COMPLETED event for each ticket.
      // Group by the staff member who performed the STATUS_COMPLETED event (performed_by).
      const { rows: retrievalRows } = await pool.query(
        `WITH requested AS (
           SELECT ticket_id, MIN(created_at) AS requested_at
           FROM valet_ticket_events
           WHERE tenant_id=$2 AND event_type='STATUS_REQUESTED'
             AND DATE(created_at)=$3
           GROUP BY ticket_id
         ),
         completed AS (
           SELECT ticket_id, performed_by, MIN(created_at) AS completed_at
           FROM valet_ticket_events
           WHERE tenant_id=$2 AND event_type='STATUS_COMPLETED'
             AND DATE(created_at)=$3
           GROUP BY ticket_id, performed_by
         )
         SELECT c.performed_by AS staff_id,
                COUNT(*) AS retrievals_completed,
                AVG(EXTRACT(EPOCH FROM (c.completed_at - r.requested_at))/60) AS avg_retrieval_min
         FROM completed c
         JOIN requested r ON r.ticket_id = c.ticket_id
         JOIN valet_tickets vt ON vt.id = c.ticket_id AND vt.outlet_id=$1
         WHERE c.completed_at > r.requested_at
         GROUP BY c.performed_by`,
        [outletId, tenantId, dateStr]
      );
      const retrievalByStaffId: Record<string, { retrievals: number; avgMin: number }> = {};
      for (const r of retrievalRows) {
        retrievalByStaffId[r.staff_id] = {
          retrievals: parseInt(r.retrievals_completed ?? "0"),
          avgMin: parseFloat(r.avg_retrieval_min ?? "0"),
        };
      }

      // Shift totals: check-ins since duty started (for currently on-duty staff)
      const shiftCheckInMap: Record<string, number> = {};
      for (const s of staffRows as any[]) {
        if (s.is_on_duty && s.duty_started_at) {
          const { rows: shiftRows } = await pool.query(
            `SELECT COUNT(*) as cnt FROM valet_tickets
             WHERE outlet_id=$1 AND tenant_id=$2 AND valet_staff_id=$3
               AND entry_time >= $4`,
            [outletId, tenantId, s.id, s.duty_started_at]
          );
          shiftCheckInMap[s.id] = parseInt(shiftRows[0]?.cnt ?? "0");
        }
      }

      const performance = (staffRows as any[]).map((s: any) => {
        const rByStaff = retrievalByStaffId[s.id] ?? { retrievals: 0, avgMin: 0 };
        return {
          staffId: s.id,
          name: s.name,
          badgeNumber: s.badge_number,
          isOnDuty: s.is_on_duty,
          dutyStartedAt: s.duty_started_at,
          checkInsToday: checkInMap[s.id] ?? 0,
          checkInsShift: shiftCheckInMap[s.id] ?? null,
          retrievalsCompleted: rByStaff.retrievals,
          avgRetrievalMinutes: Math.round(rByStaff.avgMin * 10) / 10,
        };
      });

      // Sort by retrievals descending, then check-ins
      performance.sort((a, b) => b.retrievalsCompleted - a.retrievalsCompleted || b.checkInsToday - a.checkInsToday);

      res.json({ date: dateStr, performance });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Guest Ticket Check (via QR table token — no session auth) ──────────────
  // Used by the QR page to check if this table has an active linked valet ticket
  // before showing the "Retrieve My Vehicle" CTA
  app.get("/api/parking/guest-ticket-check", async (req, res) => {
    try {
      const { token, outletId } = req.query as { token?: string; outletId?: string };
      if (!token || !outletId) return res.json({ hasActiveTicket: false });

      const { rows: tokenRows } = await pool.query(
        `SELECT qr.table_id, qr.tenant_id FROM table_qr_tokens qr
         WHERE qr.token = $1 AND qr.active = true LIMIT 1`,
        [token]
      );
      if (!tokenRows[0]) return res.json({ hasActiveTicket: false });

      const { tenant_id: tenantId, table_id: tableId } = tokenRows[0];

      const { rows: outletRows } = await pool.query(
        `SELECT id FROM outlets WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
        [outletId, tenantId]
      );
      if (!outletRows[0]) return res.json({ hasActiveTicket: false });

      const { rows: ticketRows } = await pool.query(
        `SELECT vt.id, vt.status, vt.vehicle_type, vt.vehicle_number, vt.ticket_number, vt.entry_time
         FROM valet_tickets vt
         LEFT JOIN bills b ON b.id = vt.bill_id
         LEFT JOIN orders o ON o.id = b.order_id
         WHERE vt.outlet_id=$1 AND vt.tenant_id=$2
           AND o.table_id=$3
           AND vt.status IN ('parked','requested','retrieving','ready')
         LIMIT 1`,
        [outletId, tenantId, tableId]
      );

      if (!ticketRows[0]) return res.json({ hasActiveTicket: false });

      const ticket = ticketRows[0];
      const maskedPlate = ticket.vehicle_number
        ? ticket.vehicle_number.slice(0, -3) + "***"
        : null;

      res.json({
        hasActiveTicket: true,
        status: ticket.status,
        vehicleType: ticket.vehicle_type,
        maskedPlate,
        ticketNumber: ticket.ticket_number,
        entryTime: ticket.entry_time,
      });
    } catch (err: any) {
      res.json({ hasActiveTicket: false });
    }
  });

  // ─── Condition Report PATCH (add/update condition on existing ticket) ─────────
  app.patch("/api/parking/tickets/:id/condition", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const ticket = await storage.getValetTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const { conditionReport, isExitCheck } = req.body;
      // For exit checks, merge exit condition into the existing report under "exit" key
      let mergedReport: any;
      if (isExitCheck && ticket.conditionReport) {
        mergedReport = { ...ticket.conditionReport, exit: conditionReport, exitCheckedAt: new Date().toISOString() };
      } else {
        mergedReport = conditionReport;
      }
      const updated = await storage.updateValetTicket(ticket.id, user.tenantId, { conditionReport: mergedReport });
      await storage.appendValetTicketEvent(ticket.id, user.tenantId, {
        eventType: isExitCheck ? "EXIT_CONDITION_CHECK" : "ENTRY_CONDITION_CHECK",
        performedBy: user.id,
        performedByName: user.name || user.username,
        notes: JSON.stringify(conditionReport),
      });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Guest Retrieval Request (via QR table token) ────────────────────────────
  // No session auth required — verified via the QR table token
  app.post("/api/parking/guest-retrieval", async (req, res) => {
    try {
      const { token, outletId, notes, scheduledDelayMinutes } = req.body;
      if (!token || !outletId) return res.status(400).json({ message: "token and outletId are required" });

      // Validate token maps to an active QR table and resolve tenant
      const { rows: tokenRows } = await pool.query(
        `SELECT qr.table_id, qr.tenant_id FROM table_qr_tokens qr
         WHERE qr.token = $1 AND qr.active = true LIMIT 1`,
        [token]
      );
      if (!tokenRows[0]) return res.status(401).json({ message: "Invalid or expired QR token" });

      const { tenant_id: tenantId, table_id: tableId } = tokenRows[0];

      // Verify outletId belongs to this tenant (prevent cross-tenant calls)
      const { rows: outletRows } = await pool.query(
        `SELECT id FROM outlets WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
        [outletId, tenantId]
      );
      if (!outletRows[0]) return res.status(403).json({ message: "Invalid outlet for this token" });

      // Find the ticket strictly scoped to this table via the table's active bill/order.
      // valet_tickets.bill_id → bills.order_id → orders.table_id
      const { rows: tableTickets } = await pool.query(
        `SELECT vt.id, vt.ticket_number
         FROM valet_tickets vt
         LEFT JOIN bills b ON b.id = vt.bill_id
         LEFT JOIN orders o ON o.id = b.order_id
         WHERE vt.outlet_id=$1 AND vt.tenant_id=$2
           AND o.table_id=$3
           AND vt.status IN ('parked','requested','retrieving','ready')
         ORDER BY vt.created_at DESC LIMIT 1`,
        [outletId, tenantId, tableId]
      );
      if (!tableTickets[0]) {
        return res.status(404).json({ message: "No active parking ticket linked to your table" });
      }
      const ticket = tableTickets[0];

      // Prevent duplicate requests: check if a pending retrieval already exists for this ticket within 10 min
      const { rows: existingRequests } = await pool.query(
        `SELECT id FROM valet_retrieval_requests
         WHERE ticket_id=$1 AND tenant_id=$2 AND status IN ('pending','assigned','in_progress')
         AND created_at > NOW() - INTERVAL '10 minutes' LIMIT 1`,
        [ticket.id, tenantId]
      );
      if (existingRequests[0]) {
        return res.status(409).json({ message: "A retrieval request is already in progress for this vehicle", requestId: existingRequests[0].id });
      }

      const scheduledFor = scheduledDelayMinutes && scheduledDelayMinutes > 0
        ? new Date(Date.now() + scheduledDelayMinutes * 60 * 1000)
        : null;

      const request = await storage.createRetrievalRequest({
        tenantId,
        outletId,
        ticketId: ticket.id,
        source: "QR_TABLE",
        requestedBy: undefined,
        requestedByName: `Table guest`,
        status: "pending",
        notes: notes ?? null,
      });

      // If scheduled, update row with scheduled_for
      if (scheduledFor) {
        await pool.query(
          `UPDATE valet_retrieval_requests SET scheduled_for=$1 WHERE id=$2`,
          [scheduledFor, request.id]
        );
      }

      // Only emit and update ticket to 'requested' immediately if not scheduled
      if (!scheduledFor) {
        emitToTenant(tenantId, "parking:retrieval_requested", {
          request,
          ticketNumber: ticket.ticket_number,
          source: "QR_TABLE",
          tableId,
        });

        await pool.query(
          `UPDATE valet_tickets SET status='requested' WHERE id=$1 AND tenant_id=$2`,
          [ticket.id, tenantId]
        );
      }

      res.status(201).json({ success: true, requestId: request.id, scheduledFor: scheduledFor?.toISOString() ?? null });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── CRM Customer Lookup (by plate, phone, or customerId) ───────────────────
  app.get("/api/parking/customer-lookup", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { phone, plate, customerId } = req.query as { phone?: string; plate?: string; customerId?: string };
      if (!phone && !plate && !customerId) return res.status(400).json({ message: "phone, plate, or customerId required" });

      // Normalise phone for comparison (strip spaces/dashes/parens)
      const normalisePhone = (p: string) => String(p ?? "").replace(/[\s\-\(\)]/g, "");

      let foundCustomer: any = null;

      if (customerId) {
        // ID lookup — no PII involved, can query directly
        const { rows } = await pool.query(
          `SELECT id, tenant_id, name, loyalty_tier, parking_visit_count, parking_total_spent, vehicle_plates FROM customers WHERE tenant_id=$1 AND id=$2 LIMIT 1`,
          [user.tenantId, customerId]
        );
        if (rows[0]) foundCustomer = { id: rows[0].id, name: rows[0].name, loyaltyTier: rows[0].loyalty_tier, parkingVisitCount: rows[0].parking_visit_count ?? 0, parkingTotalSpent: rows[0].parking_total_spent ?? "0", phone: null };
      }

      if (!foundCustomer && plate && plate.trim().length >= 4) {
        // Plate is stored UPPERCASE so compare directly
        const plateUpper = plate.trim().toUpperCase();
        const { rows } = await pool.query(
          `SELECT id, name, loyalty_tier, parking_visit_count, parking_total_spent, vehicle_plates FROM customers
           WHERE tenant_id=$1
             AND ARRAY(SELECT UPPER(p) FROM unnest(COALESCE(vehicle_plates, ARRAY[]::TEXT[])) p) @> ARRAY[$2]::TEXT[]
           LIMIT 1`,
          [user.tenantId, plateUpper]
        );
        if (rows[0]) {
          // Fetch full decrypted record for the phone
          const all = await storage.getCustomersByTenant(user.tenantId, { limit: 500, offset: 0 });
          const match = all.find(c => c.id === rows[0].id);
          if (match) foundCustomer = { id: match.id, name: match.name, phone: match.phone, loyaltyTier: match.loyaltyTier, parkingVisitCount: rows[0].parking_visit_count ?? 0, parkingTotalSpent: rows[0].parking_total_spent ?? "0" };
        }
      }

      if (!foundCustomer && phone && phone.trim().length >= 6) {
        // Phone is encrypted — fetch all and compare in memory after decryption
        const all = await storage.getCustomersByTenant(user.tenantId, { limit: 500, offset: 0 });
        const match = all.find(c => normalisePhone(c.phone ?? "") === normalisePhone(phone.trim()));
        if (match) {
          // Get parking stats from raw row (not encrypted)
          const { rows } = await pool.query(
            `SELECT parking_visit_count, parking_total_spent FROM customers WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
            [match.id, user.tenantId]
          );
          foundCustomer = { id: match.id, name: match.name, phone: match.phone, loyaltyTier: match.loyaltyTier, parkingVisitCount: rows[0]?.parking_visit_count ?? 0, parkingTotalSpent: rows[0]?.parking_total_spent ?? "0" };
        }
      }

      if (!foundCustomer) return res.json(null);

      const { rows: lastSessions } = await pool.query(
        `SELECT vt.exit_time, vt.vehicle_number, vt.duration_minutes,
                vt.final_charge, pz.name AS zone_name
         FROM valet_tickets vt
         LEFT JOIN parking_slots ps ON ps.id = vt.slot_id
         LEFT JOIN parking_zones pz ON pz.id = ps.zone_id
         WHERE vt.customer_id=$1 AND vt.tenant_id=$2 AND vt.status='completed'
         ORDER BY vt.exit_time DESC LIMIT 5`,
        [foundCustomer.id, user.tenantId]
      );

      res.json({
        id: foundCustomer.id,
        name: foundCustomer.name,
        phone: foundCustomer.phone ?? null,
        loyaltyTier: foundCustomer.loyaltyTier,
        parkingVisitCount: foundCustomer.parkingVisitCount,
        parkingTotalSpent: foundCustomer.parkingTotalSpent,
        lastSessions: lastSessions.map((r: any) => ({
          exitTime: r.exit_time,
          vehicleNumber: r.vehicle_number,
          durationMinutes: r.duration_minutes,
          chargeAmount: r.final_charge,
          zoneName: r.zone_name,
        })),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Plate Lookup (completed tickets last 7 days) ────────────────────────────
  app.get("/api/parking/plate-lookup", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, plate } = req.query as { outletId?: string; plate?: string };
      if (!outletId || !plate) return res.status(400).json({ message: "outletId and plate are required" });
      const { rows } = await pool.query(
        `SELECT vt.*, ps.slot_code, pz.name AS zone_name,
                vs.name AS staff_name
         FROM valet_tickets vt
         LEFT JOIN parking_slots ps ON ps.id = vt.slot_id
         LEFT JOIN parking_zones pz ON pz.id = vt.zone_id
         LEFT JOIN valet_staff vs ON vs.id = vt.valet_staff_id
         WHERE vt.outlet_id=$1 AND vt.tenant_id=$2
           AND vt.status='completed'
           AND LOWER(vt.vehicle_number) LIKE LOWER($3)
           AND vt.exit_time >= NOW() - INTERVAL '7 days'
         ORDER BY vt.exit_time DESC
         LIMIT 20`,
        [outletId, user.tenantId, `%${plate}%`]
      );
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Smart Auto-Assign ──────────────────────────────────────────────────────
  app.get("/api/parking/auto-assign", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, vehicleType, customerId } = req.query as { outletId?: string; vehicleType?: string; customerId?: string };
      if (!outletId) return res.status(400).json({ message: "outletId is required" });

      // Resolve customer loyalty tier (gold/platinum = VIP eligible)
      let isVip = false;
      if (customerId) {
        const { rows: custRows } = await pool.query(
          `SELECT loyalty_tier FROM customers WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
          [customerId, user.tenantId]
        );
        const tier = (custRows[0]?.loyalty_tier ?? "bronze").toLowerCase();
        isVip = tier === "gold" || tier === "platinum";
      }

      const { rows: slots } = await pool.query(
        `SELECT ps.*, pz.name AS zone_name, pz.color AS zone_color,
                LOWER(pz.name) AS zone_name_lower
         FROM parking_slots ps
         LEFT JOIN parking_zones pz ON pz.id = ps.zone_id
         WHERE ps.outlet_id=$1 AND ps.tenant_id=$2 AND ps.status='available' AND ps.is_active=true
         ORDER BY (COALESCE(ps.pos_x,9999) + COALESCE(ps.pos_y,9999)) ASC`,
        [outletId, user.tenantId]
      );

      if (slots.length === 0) {
        return res.json({ slot: null, reason: "No suitable available slots — proceed without slot assignment" });
      }

      const vType = (vehicleType ?? "CAR").toUpperCase();
      function slotSuitable(slotType: string, vt: string): boolean {
        const t = (slotType ?? "STANDARD").toUpperCase();
        if (vt === "TWO_WHEELER") return t === "COMPACT" || t === "STANDARD";
        if (vt === "SUV" || vt === "VAN") return t === "LARGE" || t === "STANDARD";
        if (vt === "CAR") return t === "STANDARD";
        return t === "STANDARD";
      }
      function isVipZone(zoneName: string | null): boolean {
        if (!zoneName) return false;
        const n = zoneName.toLowerCase();
        return n.includes("vip") || n.includes("premium") || n.includes("reserved");
      }

      const suitable = slots.filter(s => slotSuitable(s.slot_type, vType));
      if (suitable.length === 0) {
        return res.json({ slot: null, reason: "No suitable available slots — proceed without slot assignment" });
      }

      // VIP zone priority: gold/platinum customers get VIP zone slots first;
      // non-VIP customers are routed away from VIP zones when non-VIP slots are available.
      let candidates = suitable;
      if (isVip) {
        const vipSlots = suitable.filter(s => isVipZone(s.zone_name));
        if (vipSlots.length > 0) candidates = vipSlots;
      } else {
        const nonVipSlots = suitable.filter(s => !isVipZone(s.zone_name));
        if (nonVipSlots.length > 0) candidates = nonVipSlots;
      }

      const hasPositions = candidates.some(s => s.pos_x != null && s.pos_y != null);
      let best = candidates[0];
      if (hasPositions) {
        const withPos = candidates.filter(s => s.pos_x != null && s.pos_y != null);
        if (withPos.length > 0) best = withPos[0];
      }

      const slotCode = best.slot_code ?? best.code ?? best.id;
      const zonePart = best.zone_name ? ` in ${best.zone_name}` : "";
      const posPart = (best.pos_x != null && best.pos_y != null) ? " (near entrance)" : "";
      const vipPart = isVip && isVipZone(best.zone_name) ? " · VIP zone" : "";
      const reason = `Best match: ${slotCode} — ${best.slot_type ?? "Standard"} slot${zonePart}${posPart}${vipPart}`;

      res.json({
        slot: {
          id: best.id,
          code: slotCode,
          slotType: best.slot_type,
          zoneName: best.zone_name,
          posX: best.pos_x,
          posY: best.pos_y,
        },
        reason,
        isVip,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Enhanced Revenue Analytics ─────────────────────────────────────────────
  app.get("/api/parking/analytics/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const { from, to } = req.query as { from?: string; to?: string };
      const tenantId = user.tenantId;

      const fromStr = from ?? new Date().toISOString().split("T")[0];
      const toStr = to ?? new Date().toISOString().split("T")[0];

      // Revenue by vehicle type
      const { rows: byVehicle } = await pool.query(
        `SELECT vehicle_type, COALESCE(SUM(final_charge),0) AS revenue, COUNT(id) AS count
         FROM valet_tickets
         WHERE outlet_id=$1 AND tenant_id=$2 AND status='completed'
           AND DATE(exit_time) >= $3 AND DATE(exit_time) <= $4
         GROUP BY vehicle_type`,
        [outletId, tenantId, fromStr, toStr]
      );

      // Revenue by zone
      const { rows: byZone } = await pool.query(
        `SELECT pz.name AS zone_name, COALESCE(SUM(vt.final_charge),0) AS revenue, COUNT(vt.id) AS count
         FROM valet_tickets vt
         LEFT JOIN parking_slots ps ON ps.id = vt.slot_id
         LEFT JOIN parking_zones pz ON pz.id = ps.zone_id
         WHERE vt.outlet_id=$1 AND vt.tenant_id=$2 AND vt.status='completed'
           AND DATE(vt.exit_time) >= $3 AND DATE(vt.exit_time) <= $4
         GROUP BY pz.name`,
        [outletId, tenantId, fromStr, toStr]
      );

      // Peak hour (entry time, hour of day) — completed tickets only for accuracy
      const { rows: peakHours } = await pool.query(
        `SELECT EXTRACT(HOUR FROM vt.entry_time) AS hour, COUNT(*) AS count
         FROM valet_tickets vt
         WHERE vt.outlet_id=$1 AND vt.tenant_id=$2 AND vt.status='completed'
           AND DATE(vt.entry_time) >= $3 AND DATE(vt.entry_time) <= $4
         GROUP BY EXTRACT(HOUR FROM vt.entry_time)
         ORDER BY hour ASC`,
        [outletId, tenantId, fromStr, toStr]
      );

      // Avg duration per day over the range
      const { rows: durationTrend } = await pool.query(
        `SELECT DATE(vt.exit_time) AS day, AVG(vt.duration_minutes) AS avg_duration
         FROM valet_tickets vt
         WHERE vt.outlet_id=$1 AND vt.tenant_id=$2 AND vt.status='completed'
           AND DATE(vt.exit_time) >= $3 AND DATE(vt.exit_time) <= $4
         GROUP BY DATE(vt.exit_time)
         ORDER BY day ASC`,
        [outletId, tenantId, fromStr, toStr]
      );

      res.json({
        byVehicleType: byVehicle.map(r => ({ vehicleType: r.vehicle_type, revenue: parseFloat(r.revenue), count: parseInt(r.count) })),
        byZone: byZone.map(r => ({ zoneName: r.zone_name ?? "No Zone", revenue: parseFloat(r.revenue), count: parseInt(r.count) })),
        peakHours: peakHours.map(r => ({ hour: parseInt(r.hour), count: parseInt(r.count) })),
        durationTrend: durationTrend.map(r => ({ day: r.day, avgDuration: parseFloat(r.avg_duration ?? "0") })),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Stats ──────────────────────────────────────────────────────────────────
  app.get("/api/parking/stats/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.params.outletId;
      const tenantId = user.tenantId;

      // Active vehicles in
      const { rows: activeRows } = await pool.query(
        `SELECT COUNT(*) AS count FROM valet_tickets
         WHERE outlet_id=$1 AND tenant_id=$2 AND status IN ('parked','requested','retrieving','ready')`,
        [outletId, tenantId]
      );
      const vehiclesIn = parseInt(activeRows[0]?.count ?? "0", 10);

      // Revenue today (sum of final_charge directly from completed tickets today)
      const { rows: revenueRows } = await pool.query(
        `SELECT COALESCE(SUM(final_charge),0) AS revenue
         FROM valet_tickets
         WHERE outlet_id=$1 AND tenant_id=$2
           AND status = 'completed'
           AND exit_time >= CURRENT_DATE`,
        [outletId, tenantId]
      );
      const revenueToday = parseFloat(revenueRows[0]?.revenue ?? "0");

      // Avg duration today (completed tickets)
      const { rows: durationRows } = await pool.query(
        `SELECT COALESCE(AVG(duration_minutes),0) AS avg_dur
         FROM valet_tickets
         WHERE outlet_id=$1 AND tenant_id=$2
           AND status = 'completed'
           AND exit_time >= CURRENT_DATE`,
        [outletId, tenantId]
      );
      const avgDurationMinutes = Math.round(parseFloat(durationRows[0]?.avg_dur ?? "0"));

      // Slot availability from config
      const { rows: configRows } = await pool.query(
        `SELECT total_capacity, available_slots FROM parking_layout_config
         WHERE outlet_id=$1 AND tenant_id=$2 LIMIT 1`,
        [outletId, tenantId]
      );
      const totalSlots = configRows[0]?.total_capacity ?? 0;
      const availableSlots = configRows[0]?.available_slots ?? 0;

      res.json({ vehiclesIn, revenueToday, avgDurationMinutes, totalSlots, availableSlots });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Availability ───────────────────────────────────────────────────────────
  // Scoped: resolve outlet → tenant to prevent cross-tenant enumeration
  app.get("/api/parking/availability/:outletId", async (req, res) => {
    try {
      const { rows: outletRows } = await pool.query(
        `SELECT tenant_id FROM outlets WHERE id = $1 LIMIT 1`,
        [req.params.outletId]
      );
      if (!outletRows[0]) return res.json({ total: 0, available: 0, full: true, displayMessage: "No parking info" });
      const tenantId = outletRows[0].tenant_id;

      const { rows } = await pool.query(
        `SELECT total_capacity, available_slots, display_message, valet_enabled FROM parking_layout_config WHERE outlet_id = $1 AND tenant_id = $2 LIMIT 1`,
        [req.params.outletId, tenantId]
      );
      if (!rows[0]) return res.json({ total: 0, available: 0, full: true, parkingEnabled: false, displayMessage: "No parking info" });
      const r = rows[0];
      res.json({
        total: r.total_capacity,
        available: r.available_slots,
        full: r.available_slots <= 0,
        parkingEnabled: r.valet_enabled ?? false,
        displayMessage: r.display_message ?? (r.available_slots > 0 ? `${r.available_slots} spots available` : "Parking full"),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Parking Charge Preview (computes from ticket without persisting) ────────
  app.get("/api/parking/charge-preview/:ticketId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const ticket = await storage.getValetTicket(req.params.ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const result = await calculateParkingCharge(ticket.id, ticket.outletId, user.tenantId);
      const totalMinutes = result.durationMinutes;
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      res.json({
        durationMinutes: totalMinutes,
        durationLabel: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
        freeMinutes: result.freeMinutesApplied,
        grossCharge: result.grossCharge,
        validationDiscount: result.validationDiscount,
        finalCharge: result.finalCharge,
        taxAmount: result.taxAmount,
        totalCharge: result.totalCharge,
        vehicleType: result.vehicleType,
        rateType: result.rateType,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Bill Charge ────────────────────────────────────────────────────────────
  app.get("/api/parking/bill-charge/:billId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const charge = await storage.getBillParkingCharge(req.params.billId, user.tenantId);
      if (!charge) return res.status(404).json({ message: "No parking charge for this bill" });
      res.json(charge);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/parking/apply-charge/:ticketId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const ticket = await storage.getValetTicket(req.params.ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      if (!ticket.billId) return res.status(400).json({ message: "Ticket is not linked to a bill" });
      if (ticket.chargeAddedToBill) return res.status(409).json({ message: "Parking charge already applied to bill" });

      const existing = await storage.getBillParkingCharge(ticket.billId, user.tenantId);
      if (existing) return res.status(409).json({ message: "Parking charge already applied to bill" });

      const result = await applyParkingChargeToBill(ticket.billId, ticket.id, user.tenantId);
      if (!result) return res.status(409).json({ message: "Parking charge already applied or could not be applied" });
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Task #179: Valet Shifts ─────────────────────────────────────────────────
  app.get("/api/parking/shifts/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { date } = req.query as { date?: string };
      const dateFilter = date ?? new Date().toISOString().split("T")[0];
      const { rows } = await pool.query(
        `SELECT vs.*, 
          (SELECT json_agg(row_to_json(a)) FROM valet_staff_assignments a WHERE a.shift_id = vs.id) AS assignments
         FROM valet_shifts vs
         WHERE vs.outlet_id=$1 AND vs.tenant_id=$2 AND vs.shift_date=$3
         ORDER BY vs.opened_at DESC`,
        [req.params.outletId, user.tenantId, dateFilter]
      );
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/parking/shifts/:outletId/active", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT vs.*, 
          (SELECT json_agg(row_to_json(a)) FROM valet_staff_assignments a WHERE a.shift_id = vs.id) AS assignments
         FROM valet_shifts vs
         WHERE vs.outlet_id=$1 AND vs.tenant_id=$2 AND vs.status='active'
         ORDER BY vs.opened_at DESC LIMIT 1`,
        [req.params.outletId, user.tenantId]
      );
      res.json(rows[0] ?? null);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/parking/shifts/:outletId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { shiftType, headValetId, headValetName, openingNotes, shiftDate } = req.body;
      // Guard: only one active shift per outlet at a time
      const { rows: activeRows } = await pool.query(
        `SELECT id FROM valet_shifts WHERE outlet_id=$1 AND tenant_id=$2 AND status='active' LIMIT 1`,
        [req.params.outletId, user.tenantId]
      );
      if (activeRows.length > 0) {
        return res.status(409).json({ message: "An active shift is already open for this outlet. Close it before opening a new one." });
      }
      const { rows } = await pool.query(
        `INSERT INTO valet_shifts (id, tenant_id, outlet_id, shift_date, shift_type, head_valet_id, head_valet_name, status, vehicle_count, total_tips, opening_notes, opened_at, created_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'active', 0, 0, $7, now(), $8)
         RETURNING *`,
        [user.tenantId, req.params.outletId, shiftDate ?? new Date().toISOString().split("T")[0], shiftType ?? "EVENING", headValetId ?? null, headValetName ?? null, openingNotes ?? null, user.id]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/parking/shifts/:outletId/:shiftId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { status, closingNotes, vehicleCount, totalTips, totalFees, incidents } = req.body;
      const updates: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (status !== undefined) { updates.push(`status=$${idx++}`); vals.push(status); }
      if (closingNotes !== undefined) { updates.push(`closing_notes=$${idx++}`); vals.push(closingNotes); }
      if (vehicleCount !== undefined) { updates.push(`vehicle_count=$${idx++}`); vals.push(vehicleCount); }
      if (totalTips !== undefined) { updates.push(`total_tips=$${idx++}`); vals.push(totalTips); }
      if (totalFees !== undefined) { updates.push(`total_fees=$${idx++}`); vals.push(totalFees); }
      if (incidents !== undefined) { updates.push(`incidents=$${idx++}`); vals.push(incidents); }
      if (status === "closed") { updates.push(`closed_at=$${idx++}`); vals.push(new Date()); }
      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });
      vals.push(req.params.shiftId, user.tenantId);
      const { rows } = await pool.query(
        `UPDATE valet_shifts SET ${updates.join(",")} WHERE id=$${idx++} AND tenant_id=$${idx} RETURNING *`,
        vals
      );
      if (!rows[0]) return res.status(404).json({ message: "Shift not found" });
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Task #179: Shift Staff Assignments ──────────────────────────────────────
  app.get("/api/parking/shift-assignments/:shiftId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT a.*, vs.badge_number FROM valet_staff_assignments a
         LEFT JOIN valet_staff vs ON vs.id = a.staff_id
         WHERE a.shift_id=$1 AND a.tenant_id=$2`,
        [req.params.shiftId, user.tenantId]
      );
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/parking/shift-assignments", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { shiftId, staffId, staffName, role, zone } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO valet_staff_assignments (id, tenant_id, shift_id, staff_id, staff_name, role, zone)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING *`,
        [user.tenantId, shiftId, staffId, staffName, role ?? "VALET", zone ?? null]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/parking/shift-assignments/:assignmentId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const isManager = user.role === "owner" || user.role === "manager";
      const { clockIn, clockOut, vehiclesHandled, tipsCollected, role, zone } = req.body;

      if (!isManager) {
        // Non-managers may only clock themselves in/out.
        // Verify the authenticated user owns this assignment via valet_staff.user_id -> assignment.staff_id
        const { rows: checkRows } = await pool.query(
          `SELECT a.id FROM valet_staff_assignments a
           JOIN valet_staff s ON s.id = a.staff_id AND s.tenant_id = a.tenant_id
           WHERE a.id=$1 AND a.tenant_id=$2 AND s.user_id=$3`,
          [req.params.assignmentId, user.tenantId, user.id]
        );
        if (!checkRows[0]) return res.status(403).json({ message: "Forbidden: can only update your own clock" });
        if (vehiclesHandled !== undefined || tipsCollected !== undefined || role !== undefined || zone !== undefined) {
          return res.status(403).json({ message: "Forbidden: insufficient permissions" });
        }
      }

      const updates: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;
      if (clockIn !== undefined) { updates.push(`clock_in=$${idx++}`); vals.push(clockIn === true ? new Date() : clockIn); }
      if (clockOut !== undefined) { updates.push(`clock_out=$${idx++}`); vals.push(clockOut === true ? new Date() : clockOut); }
      if (isManager && vehiclesHandled !== undefined) { updates.push(`vehicles_handled=$${idx++}`); vals.push(vehiclesHandled); }
      if (isManager && tipsCollected !== undefined) { updates.push(`tips_collected=$${idx++}`); vals.push(tipsCollected); }
      if (isManager && role !== undefined) { updates.push(`role=$${idx++}`); vals.push(role); }
      if (isManager && zone !== undefined) { updates.push(`zone=$${idx++}`); vals.push(zone); }
      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });
      vals.push(req.params.assignmentId, user.tenantId);
      const { rows } = await pool.query(
        `UPDATE valet_staff_assignments SET ${updates.join(",")} WHERE id=$${idx++} AND tenant_id=$${idx} RETURNING *`,
        vals
      );
      if (!rows[0]) return res.status(404).json({ message: "Assignment not found" });
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Task #179: Key Storage Locations ────────────────────────────────────────
  app.get("/api/parking/key-locations/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT * FROM key_storage_locations WHERE outlet_id=$1 AND tenant_id=$2 ORDER BY location_code`,
        [req.params.outletId, user.tenantId]
      );
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/parking/key-locations/:outletId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { locationCode, locationName, capacity, isSecure } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO key_storage_locations (id, tenant_id, outlet_id, location_code, location_name, capacity, current_count, is_secure)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 0, $6) RETURNING *`,
        [user.tenantId, req.params.outletId, locationCode, locationName, capacity ?? 50, isSecure ?? true]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/parking/key-locations/:outletId/:locationId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { locationName, capacity, isSecure, currentCount } = req.body;
      const updates: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (locationName !== undefined) { updates.push(`location_name=$${idx++}`); vals.push(locationName); }
      if (capacity !== undefined) { updates.push(`capacity=$${idx++}`); vals.push(capacity); }
      if (isSecure !== undefined) { updates.push(`is_secure=$${idx++}`); vals.push(isSecure); }
      if (currentCount !== undefined) { updates.push(`current_count=$${idx++}`); vals.push(currentCount); }
      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });
      vals.push(req.params.locationId, user.tenantId);
      const { rows } = await pool.query(
        `UPDATE key_storage_locations SET ${updates.join(",")} WHERE id=$${idx++} AND tenant_id=$${idx} RETURNING *`,
        vals
      );
      if (!rows[0]) return res.status(404).json({ message: "Location not found" });
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Task #179: Key Management Log ───────────────────────────────────────────
  app.get("/api/parking/key-log/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { ticketId, limit: limitQ } = req.query as { ticketId?: string; limit?: string };
      const limitN = Math.min(parseInt(limitQ ?? "50"), 200);
      let query = `SELECT kl.*, vt.ticket_number FROM key_management_log kl
                   LEFT JOIN valet_tickets vt ON vt.id = kl.ticket_id
                   WHERE kl.outlet_id=$1 AND kl.tenant_id=$2`;
      const vals: any[] = [req.params.outletId, user.tenantId];
      if (ticketId) { query += ` AND kl.ticket_id=$3`; vals.push(ticketId); }
      query += ` ORDER BY kl.created_at DESC LIMIT ${limitN}`;
      const { rows } = await pool.query(query, vals);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/parking/key-log/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { ticketId, action, keyLocation, notes } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO key_management_log (id, tenant_id, outlet_id, ticket_id, action, performed_by, performed_by_name, key_location, notes)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [user.tenantId, req.params.outletId, ticketId ?? null, action, user.id, user.name || user.username, keyLocation ?? null, notes ?? null]
      );
      // Update key_location on valet_ticket
      if (ticketId && keyLocation) {
        await pool.query(
          `UPDATE valet_tickets SET key_location=$1 WHERE id=$2 AND tenant_id=$3`,
          [keyLocation, ticketId, user.tenantId]
        );
      }
      // Update current_count on key_storage_locations
      if (keyLocation) {
        if (action === "KEY_STORED") {
          await pool.query(
            `UPDATE key_storage_locations SET current_count = current_count + 1 WHERE tenant_id=$1 AND outlet_id=$2 AND location_code=$3`,
            [user.tenantId, req.params.outletId, keyLocation]
          );
        } else if (action === "KEY_TAKEN" || action === "KEY_RETURNED_TO_CUSTOMER") {
          await pool.query(
            `UPDATE key_storage_locations SET current_count = GREATEST(0, current_count - 1) WHERE tenant_id=$1 AND outlet_id=$2 AND location_code=$3`,
            [user.tenantId, req.params.outletId, keyLocation]
          );
        }
      }
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Task #179: Dedicated ticket key-location PATCH ──────────────────────────
  app.patch("/api/parking/tickets/:id/key-location", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const ticket = await storage.getValetTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const { keyLocation, keyType } = req.body;
      const updated = await storage.updateValetTicket(req.params.id, user.tenantId, { keyLocation, keyType });
      if (keyLocation) {
        await pool.query(
          `UPDATE key_storage_locations SET current_count = (SELECT COUNT(*) FROM valet_tickets WHERE tenant_id=$1 AND outlet_id=$2 AND key_location=$3 AND status NOT IN ('checked_out','cancelled')) WHERE tenant_id=$1 AND outlet_id=$2 AND location_code=$3`,
          [user.tenantId, ticket.outletId, keyLocation]
        );
      }
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Task #180: Incidents API ────────────────────────────────────────────────

  // Generate incident number: INC-YYYYMMDD-NNNN
  async function _generateIncidentNumber(tenantId: string): Promise<string> {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM valet_incidents WHERE tenant_id=$1 AND incident_number LIKE $2`,
      [tenantId, `INC-${dateStr}-%`]
    );
    const seq = parseInt(rows[0].cnt, 10) + 1;
    return `INC-${dateStr}-${String(seq).padStart(4, "0")}`;
  }

  // POST /api/parking/incidents — create incident
  app.post("/api/parking/incidents", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, ticketId, incidentType, severity, description, vehicleNumber, customerName, customerPhone } = req.body;
      if (!outletId) return res.status(400).json({ message: "outletId is required" });
      if (!description) return res.status(400).json({ message: "description is required" });

      const incidentNumber = await _generateIncidentNumber(user.tenantId);

      const { rows } = await pool.query(`
        INSERT INTO valet_incidents (tenant_id, outlet_id, ticket_id, incident_number, incident_type, severity, description, vehicle_number, customer_name, customer_phone, reported_by_id, reported_by_name, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open') RETURNING *
      `, [
        user.tenantId, outletId, ticketId ?? null, incidentNumber,
        incidentType ?? "OTHER", severity ?? "LOW", description,
        vehicleNumber ?? null, customerName ?? null, customerPhone ?? null,
        user.id, user.name || user.username,
      ]);

      const incident = rows[0];

      // CRITICAL/HIGH: set ticket status to 'incident'
      if (ticketId && (severity === "HIGH" || severity === "CRITICAL")) {
        await pool.query(
          `UPDATE valet_tickets SET status='incident' WHERE id=$1 AND tenant_id=$2`,
          [ticketId, user.tenantId]
        );
        await storage.appendValetTicketEvent(ticketId, user.tenantId, {
          eventType: "INCIDENT_REPORTED",
          performedBy: user.id,
          performedByName: user.name || user.username,
          notes: `${incidentType} — ${severity} — ${incidentNumber}`,
        });
      }

      // LOST_KEY: auto-log key_management_log entry + set key_location = LOST
      if (incidentType === "LOST_KEY" && ticketId) {
        await pool.query(
          `INSERT INTO key_management_log (tenant_id, outlet_id, ticket_id, incident_id, action, notes, performed_by_id, performed_by_name)
           VALUES ($1,$2,$3,$4,'LOST_REPORTED',$5,$6,$7)`,
          [user.tenantId, outletId, ticketId, incident.id, description, user.id, user.name || user.username]
        );
        await pool.query(
          `UPDATE valet_tickets SET key_location='LOST' WHERE id=$1 AND tenant_id=$2`,
          [ticketId, user.tenantId]
        );
      }

      res.status(201).json(_mapIncident(incident));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // GET /api/parking/incidents/:outletId/summary — dashboard widget
  app.get("/api/parking/incidents/:outletId/summary", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const { rows } = await pool.query(`
        SELECT severity, status, COUNT(*) AS cnt
        FROM valet_incidents
        WHERE outlet_id=$1 AND tenant_id=$2
        GROUP BY severity, status
      `, [outletId, user.tenantId]);

      let totalOpen = 0;
      const bySeverity: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      for (const r of rows) {
        const cnt = parseInt(r.cnt, 10);
        if (r.status !== "resolved") {
          totalOpen += cnt;
          if (bySeverity[r.severity] !== undefined) bySeverity[r.severity] += cnt;
        }
      }
      res.json({ totalOpen, bySeverity });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // GET /api/parking/incidents/:outletId — list incidents with filters
  app.get("/api/parking/incidents/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const { status, severity, from, to } = req.query as Record<string, string>;

      let q = `SELECT * FROM valet_incidents WHERE outlet_id=$1 AND tenant_id=$2`;
      const vals: any[] = [outletId, user.tenantId];
      if (status) { vals.push(status); q += ` AND status=$${vals.length}`; }
      if (severity) { vals.push(severity); q += ` AND severity=$${vals.length}`; }
      if (from) { vals.push(from); q += ` AND created_at >= $${vals.length}`; }
      if (to) { vals.push(to + "T23:59:59Z"); q += ` AND created_at <= $${vals.length}`; }
      q += ` ORDER BY created_at DESC LIMIT 200`;

      const { rows } = await pool.query(q, vals);
      res.json(rows.map(_mapIncident));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // PATCH /api/parking/incidents/:id — update status, resolution, etc.
  app.patch("/api/parking/incidents/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { id } = req.params;
      const { status, resolution, policeReportNo, insuranceClaimNo, actualDamageCost, managerNotified } = req.body;

      const fields: string[] = [];
      const vals: any[] = [id, user.tenantId];

      if (status !== undefined) { vals.push(status); fields.push(`status=$${vals.length}`); }
      if (resolution !== undefined) { vals.push(resolution); fields.push(`resolution=$${vals.length}`); }
      if (policeReportNo !== undefined) { vals.push(policeReportNo); fields.push(`police_report_no=$${vals.length}`); }
      if (insuranceClaimNo !== undefined) { vals.push(insuranceClaimNo); fields.push(`insurance_claim_no=$${vals.length}`); }
      if (actualDamageCost !== undefined) { vals.push(actualDamageCost); fields.push(`actual_damage_cost=$${vals.length}`); }
      if (managerNotified !== undefined) { vals.push(managerNotified); fields.push(`manager_notified=$${vals.length}`); }
      if (status === "resolved") {
        vals.push(user.id); fields.push(`resolved_by_id=$${vals.length}`);
        fields.push(`resolved_at=now()`);
      }

      if (!fields.length) return res.status(400).json({ message: "No fields to update" });

      const { rows } = await pool.query(
        `UPDATE valet_incidents SET ${fields.join(",")} WHERE id=$1 AND tenant_id=$2 RETURNING *`,
        vals
      );
      if (!rows[0]) return res.status(404).json({ message: "Incident not found" });
      res.json(_mapIncident(rows[0]));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Task #180: Overnight Checkout ──────────────────────────────────────────

  // PATCH /api/parking/tickets/:id/overnight-checkout
  app.patch("/api/parking/tickets/:id/overnight-checkout", requireAuth, async (req, res) => {    try {
      const user = req.user as any;
      const ticket = await storage.getValetTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const { keyLocation, keyType } = req.body;
      const updated = await storage.updateValetTicket(req.params.id, user.tenantId, { keyLocation, keyType });
      if (keyLocation) {
        await pool.query(
          `UPDATE key_storage_locations SET current_count = (SELECT COUNT(*) FROM valet_tickets WHERE tenant_id=$1 AND outlet_id=$2 AND key_location=$3 AND status NOT IN ('checked_out','cancelled')) WHERE tenant_id=$1 AND outlet_id=$2 AND location_code=$3`,
          [user.tenantId, ticket.outletId, keyLocation]
        );
      }
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Task #179: VIP flag, overnight flag, tip recording ──────────────────────
  app.patch("/api/parking/tickets/:id/vip", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const ticket = await storage.getValetTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const { isVip, vipNotes } = req.body;
      const updated = await storage.updateValetTicket(req.params.id, user.tenantId, { isVip: isVip ?? true, vipNotes: vipNotes ?? null });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/parking/tickets/:id/overnight", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const ticket = await storage.getValetTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const { isOvernight } = req.body;
      const updated = await storage.updateValetTicket(req.params.id, user.tenantId, { isOvernight: isOvernight ?? true });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/parking/tickets/:id/tip", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const ticket = await storage.getValetTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const { tipAmount, staffAssignmentId } = req.body;
      if (tipAmount === undefined || tipAmount === null || isNaN(parseFloat(tipAmount))) return res.status(400).json({ message: "Valid tipAmount required" });
      const newTip = parseFloat(tipAmount);
      const prevTip = ticket.tipAmount ? parseFloat(String(ticket.tipAmount)) : 0;
      const delta = newTip - prevTip;
      // Update ticket tip (idempotent: set absolute value)
      await pool.query(
        `UPDATE valet_tickets SET tip_amount=$1 WHERE id=$2 AND tenant_id=$3`,
        [newTip, req.params.id, user.tenantId]
      );
      // Roll up the delta to shift and staff assignment totals
      if (delta !== 0 && ticket.shiftId) {
        await pool.query(
          `UPDATE valet_shifts SET total_tips = total_tips + $1 WHERE id=$2 AND tenant_id=$3`,
          [delta, ticket.shiftId, user.tenantId]
        );
      }
      if (delta !== 0) {
        if (staffAssignmentId) {
          await pool.query(
            `UPDATE valet_staff_assignments SET tips_collected = tips_collected + $1 WHERE id=$2 AND tenant_id=$3`,
            [delta, staffAssignmentId, user.tenantId]
          );
        } else if (ticket.shiftId && ticket.valetStaffId) {
          await pool.query(
            `UPDATE valet_staff_assignments SET tips_collected = tips_collected + $1
             WHERE shift_id=$2 AND staff_id=$3 AND tenant_id=$4`,
            [delta, ticket.shiftId, ticket.valetStaffId, user.tenantId]
          );
        }
      }
      const updated = await storage.getValetTicket(req.params.id);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Task #179: Priority retrieval queue (sorted) ─────────────────────────────
  // Override the GET retrieval-requests to support priority sorting
  app.get("/api/parking/priority-queue/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT rr.*, vt.ticket_number, vt.vehicle_number, vt.vehicle_type, vt.vehicle_make, vt.vehicle_color, vt.is_vip
         FROM valet_retrieval_requests rr
         LEFT JOIN valet_tickets vt ON vt.id = rr.ticket_id
         WHERE rr.outlet_id=$1 AND rr.tenant_id=$2 AND rr.status IN ('pending','assigned','in_progress')
         ORDER BY
           CASE WHEN COALESCE(rr.priority,'NORMAL') = 'VIP' THEN 1
                WHEN COALESCE(rr.priority,'NORMAL') = 'URGENT' THEN 2
                WHEN COALESCE(rr.priority,'NORMAL') = 'NORMAL' THEN 3
                ELSE 4 END ASC,
           rr.created_at ASC`,
        [req.params.outletId, user.tenantId]
      );
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Task #179: Shift reconciliation summary ─────────────────────────────────
  app.get("/api/parking/shifts/:outletId/:shiftId/summary", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { rows: shiftRows } = await pool.query(
        `SELECT vs.*, 
          (SELECT json_agg(row_to_json(a)) FROM valet_staff_assignments a WHERE a.shift_id = vs.id) AS assignments
         FROM valet_shifts vs WHERE vs.id=$1 AND vs.tenant_id=$2`,
        [req.params.shiftId, user.tenantId]
      );
      if (!shiftRows[0]) return res.status(404).json({ message: "Shift not found" });
      const shift = shiftRows[0];
      // Count tickets for this shift — include tips and fees collected
      const { rows: ticketStats } = await pool.query(
        `SELECT COUNT(*) AS total_tickets,
                COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled')) AS open_tickets,
                COALESCE(SUM(tip_amount),0) AS total_tips,
                COALESCE(SUM(charge_amount),0) AS total_fees
         FROM valet_tickets WHERE shift_id=$1 AND tenant_id=$2`,
        [req.params.shiftId, user.tenantId]
      );
      // Sum final_charge directly from valet_tickets for tickets in this shift
      const { rows: chargeStats } = await pool.query(
        `SELECT COALESCE(SUM(final_charge),0) AS billed_fees
         FROM valet_tickets
         WHERE shift_id=$1 AND tenant_id=$2`,
        [req.params.shiftId, user.tenantId]
      );
      res.json({
        shift,
        totalTickets: parseInt(ticketStats[0]?.total_tickets ?? "0"),
        openTickets: parseInt(ticketStats[0]?.open_tickets ?? "0"),
        totalTips: parseFloat(ticketStats[0]?.total_tips ?? "0"),
        totalFees: parseFloat(ticketStats[0]?.total_fees ?? "0"),
        billedFees: parseFloat(chargeStats[0]?.billed_fees ?? "0"),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Task #180: Overnight Checkout ──────────────────────────────────────────

  // PATCH /api/parking/tickets/:id/overnight-checkout
  app.patch("/api/parking/tickets/:id/overnight-checkout", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const ticket = await storage.getValetTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      if (ticket.status === "completed") return res.status(400).json({ message: "Ticket already completed" });

      const exitTime = new Date();
      const entryTime = ticket.entryTime ? new Date(ticket.entryTime) : exitTime;
      const durationMinutes = Math.floor((exitTime.getTime() - entryTime.getTime()) / 60000);

      // Fetch overnight fee from config
      const config = await storage.getParkingConfig(ticket.outletId, user.tenantId);
      const overnightFee = parseFloat(String((config as any)?.overnightFee ?? 0)) || 0;
      const overnightCutoffHour = (config as any)?.overnightCutoffHour ?? 23;

      // Calculate nights: hours past cutoff
      const entryHour = entryTime.getHours();
      const hoursParked = durationMinutes / 60;
      const nights = Math.max(1, Math.ceil((exitTime.getTime() - entryTime.getTime()) / (24 * 3600 * 1000)));
      const overnightCharge = overnightFee * nights;

      // Release slot
      if (ticket.slotId) {
        await storage.updateParkingSlot(ticket.slotId, user.tenantId, { status: "available" });
        await _recalcAvailability(ticket.outletId, user.tenantId);
      }

      const updated = await storage.updateValetTicket(ticket.id, user.tenantId, {
        status: "completed",
        exitTime,
        durationMinutes,
        finalCharge: overnightCharge,
      } as any);

      await storage.appendValetTicketEvent(ticket.id, user.tenantId, {
        eventType: "OVERNIGHT_CHECKOUT",
        performedBy: user.id,
        performedByName: user.name || user.username,
        notes: `Overnight: ${nights} night(s) × ${overnightFee} = ${overnightCharge}. Duration: ${durationMinutes}m`,
      });

      res.json({ ...updated, overnightCharge, nights, overnightFee });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // GET /api/parking/overnight/:outletId — list overnight tickets
  app.get("/api/parking/overnight/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;

      const config = await storage.getParkingConfig(outletId, user.tenantId);
      const overnightFee = parseFloat(String((config as any)?.overnightFee ?? 0)) || 0;
      const overnightCutoffHour = (config as any)?.overnightCutoffHour ?? 23;

      // Overnight: parked tickets where entry_time was before yesterday's cutoff
      const { rows } = await pool.query(`
        SELECT vt.*, ps.slot_code
        FROM valet_tickets vt
        LEFT JOIN parking_slots ps ON ps.id = vt.slot_id
        WHERE vt.outlet_id=$1 AND vt.tenant_id=$2
          AND vt.status IN ('parked','requested','retrieving','ready','incident')
          AND vt.is_overnight = true
        ORDER BY vt.entry_time ASC
      `, [outletId, user.tenantId]);

      // Also include any ticket where the vehicle has been parked past cutoff (auto-detect)
      const now = new Date();
      const { rows: autoDetect } = await pool.query(`
        SELECT vt.*, ps.slot_code
        FROM valet_tickets vt
        LEFT JOIN parking_slots ps ON ps.id = vt.slot_id
        WHERE vt.outlet_id=$1 AND vt.tenant_id=$2
          AND vt.status IN ('parked','requested','retrieving','ready','incident')
          AND vt.is_overnight = false
          AND EXTRACT(EPOCH FROM (NOW() - vt.entry_time))/3600 > 12
        ORDER BY vt.entry_time ASC
      `, [outletId, user.tenantId]);

      // Merge, deduplicate
      const allRows = [...rows];
      const seenIds = new Set(rows.map((r: any) => r.id));
      for (const r of autoDetect) {
        if (!seenIds.has(r.id)) allRows.push(r);
      }

      const enriched = allRows.map((r: any) => {
        const entryTime = new Date(r.entry_time);
        const hoursParked = (now.getTime() - entryTime.getTime()) / (3600 * 1000);
        const nights = Math.max(1, Math.ceil((now.getTime() - entryTime.getTime()) / (24 * 3600 * 1000)));
        return {
          id: r.id,
          ticketNumber: r.ticket_number,
          vehicleNumber: r.vehicle_number,
          vehicleType: r.vehicle_type,
          customerName: r.customer_name,
          customerPhone: r.customer_phone,
          slotCode: r.slot_code,
          entryTime: r.entry_time,
          hoursParked: Math.round(hoursParked * 10) / 10,
          nights,
          estimatedOvernightFee: overnightFee * nights,
          status: r.status,
          isOvernight: r.is_overnight,
          keyLocation: r.key_location,
        };
      });

      res.json({ tickets: enriched, overnightFee, overnightCutoffHour });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}

function _mapIncident(r: any) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    outletId: r.outlet_id,
    ticketId: r.ticket_id,
    incidentNumber: r.incident_number,
    incidentType: r.incident_type,
    severity: r.severity,
    description: r.description,
    vehicleNumber: r.vehicle_number,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    reportedById: r.reported_by_id,
    reportedByName: r.reported_by_name,
    status: r.status,
    resolution: r.resolution,
    managerNotified: r.manager_notified,
    policeReportNo: r.police_report_no,
    insuranceClaimNo: r.insurance_claim_no,
    estimatedDamageCost: r.estimated_damage_cost,
    actualDamageCost: r.actual_damage_cost,
    resolvedById: r.resolved_by_id,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
  };
}

// Task #164: CRM sync helpers (non-blocking, called fire-and-forget)
async function _getTicketCharge(ticketId: string, tenantId: string): Promise<number> {
  // Fetch actual charge from bill_parking_charges; fall back to 0 if not found
  const { rows } = await pool.query(
    `SELECT total_charge FROM bill_parking_charges WHERE ticket_id=$1 AND tenant_id=$2 LIMIT 1`,
    [ticketId, tenantId]
  );
  return parseFloat(rows[0]?.total_charge ?? "0") || 0;
}

async function _syncCrmOnCheckout(customerId: string, ticket: any, tenantId: string): Promise<void> {
  const plate = (ticket.vehicleNumber ?? "").trim().toUpperCase();
  const charge = await _getTicketCharge(ticket.id, tenantId);

  if (plate) {
    // Add plate to vehicle_plates UPPERCASE (deduplicate, cap at 5)
    await pool.query(
      `UPDATE customers
       SET vehicle_plates = (
         SELECT ARRAY(
           SELECT DISTINCT unnest
           FROM unnest(
             ARRAY(SELECT DISTINCT UPPER(e) FROM unnest(COALESCE(vehicle_plates, ARRAY[]::TEXT[]) || ARRAY[$1]) e) || ARRAY[]::TEXT[]
           ) LIMIT 5
         )
       ),
       parking_visit_count = COALESCE(parking_visit_count, 0) + 1,
       parking_total_spent = COALESCE(parking_total_spent, 0) + $2,
       visit_count = COALESCE(visit_count, 0) + 1,
       last_visit_at = NOW()
       WHERE id=$3 AND tenant_id=$4`,
      [plate, charge, customerId, tenantId]
    );
  } else {
    await pool.query(
      `UPDATE customers
       SET parking_visit_count = COALESCE(parking_visit_count, 0) + 1,
           parking_total_spent = COALESCE(parking_total_spent, 0) + $1,
           visit_count = COALESCE(visit_count, 0) + 1,
           last_visit_at = NOW()
       WHERE id=$2 AND tenant_id=$3`,
      [charge, customerId, tenantId]
    );
  }
}

async function _ensureCustomerAndSync(ticket: any, tenantId: string): Promise<void> {
  // Only auto-create CRM record when phone is provided — never match existing customers to avoid incorrect linkage
  if (!ticket.customerPhone) return;
  const phone = (ticket.customerPhone as string).trim();
  // Use customer name if provided; otherwise derive a placeholder from the phone for the CRM record
  const name = ((ticket.customerName as string | null | undefined) ?? "").trim() || `Guest (${phone.slice(-4)})`;

  // Create new customer via storage (ensures PII encryption is applied consistently)
  let newCustomer: any;
  try {
    newCustomer = await storage.createCustomer({ tenantId, name, phone, loyaltyTier: "bronze" });
  } catch (_e) {
    return; // If insert fails (e.g., duplicate phone), skip silently
  }
  const newCustomerId = newCustomer?.id;
  if (!newCustomerId) return;

  // Link new customer back to ticket
  await pool.query(`UPDATE valet_tickets SET customer_id=$1 WHERE id=$2 AND tenant_id=$3`, [newCustomerId, ticket.id, tenantId]);

  await _syncCrmOnCheckout(newCustomerId, ticket, tenantId);
}

async function _recalcAvailability(outletId: string, tenantId: string): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS available FROM parking_slots WHERE outlet_id=$1 AND tenant_id=$2 AND status='available' AND is_active=true`,
      [outletId, tenantId]
    );
    const available = parseInt(rows[0].available, 10);
    await pool.query(
      `UPDATE parking_layout_config SET available_slots=$1, updated_at=now() WHERE outlet_id=$2 AND tenant_id=$3`,
      [available, outletId, tenantId]
    );
    await pool.query(
      `UPDATE parking_zones pz SET available_slots = (
        SELECT COUNT(*) FROM parking_slots ps WHERE ps.zone_id=pz.id AND ps.status='available' AND ps.is_active=true
      ) WHERE pz.outlet_id=$1 AND pz.tenant_id=$2`,
      [outletId, tenantId]
    );
  } catch (e) {
    console.error("[parking] _recalcAvailability failed:", e);
  }
}
