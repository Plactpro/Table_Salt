import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { emitToTenant } from "../realtime";
import { pool } from "../db";
import { calculateParkingCharge, applyParkingChargeToBill } from "../services/parking-charge-service";

export function registerParkingRoutes(app: Express): void {

  // ─── Config ────────────────────────────────────────────────────────────────
  app.get("/api/parking/config/:outletId", requireRole("owner", "manager"), async (req, res) => {
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
      res.json(slots);
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
      const activeStatuses = ["parked", "requested", "retrieving"];
      const statusFilter = statusParam
        ? { status: statusParam }
        : all
        ? undefined
        : { status: activeStatuses };
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
      const status = req.query.status as string | undefined;
      const requests = await storage.getRetrievalRequests(req.params.outletId, user.tenantId, status ? { status } : undefined);
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
        `SELECT total_capacity, available_slots, display_message FROM parking_layout_config WHERE outlet_id = $1 AND tenant_id = $2 LIMIT 1`,
        [req.params.outletId, tenantId]
      );
      if (!rows[0]) return res.json({ total: 0, available: 0, full: true, displayMessage: "No parking info" });
      const r = rows[0];
      res.json({
        total: r.total_capacity,
        available: r.available_slots,
        full: r.available_slots <= 0,
        displayMessage: r.display_message ?? (r.available_slots > 0 ? `${r.available_slots} spots available` : "Parking full"),
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
