import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";

export function registerReservationsRoutes(app: Express): void {
  app.get("/api/reservations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const reservationsList = await storage.getReservationsByTenant(user.tenantId);
    res.json(reservationsList);
  });

  app.post("/api/reservations", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { tenantId: _t, id: _i, ...rawBody } = req.body;
      const body = { ...rawBody };
      // Normalize: accept snake_case resource_requirements from clients
      if (body.resource_requirements !== undefined && body.resourceRequirements === undefined) {
        body.resourceRequirements = body.resource_requirements;
        delete body.resource_requirements;
      }
      if (!body.customerName || !body.customerName.trim()) {
        return res.status(400).json({ message: "Customer name is required" });
      }
      if (!body.dateTime) {
        return res.status(400).json({ message: "Date and time are required" });
      }
      if (typeof body.dateTime === "string") {
        const parsed = new Date(body.dateTime);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ message: "Invalid date/time format" });
        }
        body.dateTime = parsed;
      }
      if (body.guests !== undefined) {
        body.guests = parseInt(body.guests);
        if (isNaN(body.guests) || body.guests < 1) {
          return res.status(400).json({ message: "Guests must be a positive number" });
        }
      }
      const reservation = await storage.createReservation({ ...body, tenantId: user.tenantId });
      res.json(reservation);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create reservation" });
    }
  });

  app.patch("/api/reservations/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    // Normalize: accept snake_case resource_requirements from clients
    const body = { ...req.body };
    if (body.resource_requirements !== undefined && body.resourceRequirements === undefined) {
      body.resourceRequirements = body.resource_requirements;
      delete body.resource_requirements;
    }
    const reservation = await storage.updateReservationByTenant(req.params.id, user.tenantId, body);
    if (!reservation) return res.status(404).json({ message: "Reservation not found" });
    res.json(reservation);
  });

  app.delete("/api/reservations/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteReservationByTenant(req.params.id, user.tenantId, user.id);
    res.json({ message: "Deleted" });
  });
}
