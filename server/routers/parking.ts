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

        if (ticket.billId && !ticket.chargeAddedToBill) {
          applyParkingChargeToBill(ticket.billId, ticket.id, user.tenantId).catch(e =>
            console.error("[parking] Auto apply charge failed:", e)
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
      res.json(requests);
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

      const request = await storage.createRetrievalRequest({
        ...req.body,
        tenantId: user.tenantId,
        outletId,
        requestedBy: user.id,
        requestedByName: user.name || user.username,
        status: "pending",
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
        `SELECT vt.id FROM valet_tickets vt
         LEFT JOIN bills b ON b.id = vt.bill_id
         LEFT JOIN orders o ON o.id = b.order_id
         WHERE vt.outlet_id=$1 AND vt.tenant_id=$2
           AND o.table_id=$3
           AND vt.status IN ('parked','requested','retrieving','ready')
         LIMIT 1`,
        [outletId, tenantId, tableId]
      );

      res.json({ hasActiveTicket: !!ticketRows[0] });
    } catch (err: any) {
      res.json({ hasActiveTicket: false });
    }
  });

  // ─── Guest Retrieval Request (via QR table token) ────────────────────────────
  // No session auth required — verified via the QR table token
  app.post("/api/parking/guest-retrieval", async (req, res) => {
    try {
      const { token, outletId, notes } = req.body;
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

      emitToTenant(tenantId, "parking:retrieval_requested", {
        request,
        ticketNumber: ticket.ticket_number,
        source: "QR_TABLE",
        tableId,
      });

      // Update ticket status to requested
      await pool.query(
        `UPDATE valet_tickets SET status='requested' WHERE id=$1 AND tenant_id=$2`,
        [ticket.id, tenantId]
      );

      res.status(201).json({ success: true, requestId: request.id });
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
        `SELECT vt.vehicle_type, COALESCE(SUM(bpc.final_charge),0) AS revenue, COUNT(vt.id) AS count
         FROM valet_tickets vt
         LEFT JOIN bill_parking_charges bpc ON bpc.ticket_id = vt.id
         WHERE vt.outlet_id=$1 AND vt.tenant_id=$2 AND vt.status='completed'
           AND DATE(vt.exit_time) >= $3 AND DATE(vt.exit_time) <= $4
         GROUP BY vt.vehicle_type`,
        [outletId, tenantId, fromStr, toStr]
      );

      // Revenue by zone
      const { rows: byZone } = await pool.query(
        `SELECT pz.name AS zone_name, COALESCE(SUM(bpc.final_charge),0) AS revenue, COUNT(vt.id) AS count
         FROM valet_tickets vt
         LEFT JOIN parking_slots ps ON ps.id = vt.slot_id
         LEFT JOIN parking_zones pz ON pz.id = ps.zone_id
         LEFT JOIN bill_parking_charges bpc ON bpc.ticket_id = vt.id
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

      // Revenue today (sum of charge from completed tickets today)
      const { rows: revenueRows } = await pool.query(
        `SELECT COALESCE(SUM(bpc.final_charge),0) AS revenue
         FROM valet_tickets vt
         JOIN bill_parking_charges bpc ON bpc.ticket_id = vt.id
         WHERE vt.outlet_id=$1 AND vt.tenant_id=$2
           AND vt.status = 'completed'
           AND vt.exit_time >= CURRENT_DATE`,
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
