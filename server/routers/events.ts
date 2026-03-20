import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../middleware";
import { auditLogFromReq } from "../audit";
import { insertEventSchema, insertComboOfferSchema } from "@shared/schema";

const eventWriteRoles = ["owner", "franchise_owner", "manager", "outlet_manager", "hq_admin"];

export function registerEventsRoutes(app: Express): void {
  app.get("/api/events", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getEventsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/events", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!eventWriteRoles.includes(user.role)) return res.status(403).json({ message: "Insufficient permissions" });
      const body = { ...req.body, tenantId: user.tenantId, createdBy: user.id };
      if (body.startDate) body.startDate = new Date(body.startDate);
      if (body.endDate) body.endDate = new Date(body.endDate);
      const parsed = insertEventSchema.parse(body);
      const event = await storage.createEvent(parsed);
      await auditLogFromReq(req, { action: "event_created", entityType: "event", entityId: event.id, entityName: event.title, after: { title: event.title, type: event.type, impact: event.impact } });
      res.status(201).json(event);
    } catch (err: any) { res.status(err.name === "ZodError" ? 400 : 500).json({ message: err.message }); }
  });

  app.patch("/api/events/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!eventWriteRoles.includes(user.role)) return res.status(403).json({ message: "Insufficient permissions" });
      const existing = await storage.getEvent(req.params.id, user.tenantId);
      if (!existing) return res.status(404).json({ message: "Event not found" });
      const updateEventSchema = insertEventSchema.partial();
      const allowedFields = ["title", "description", "type", "startDate", "endDate", "allDay", "impact", "color", "outlets", "tags", "notes", "linkedOfferId"] as const;
      const raw: Record<string, unknown> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) raw[key] = req.body[key];
      }
      if (raw.startDate) raw.startDate = new Date(raw.startDate as string);
      if (raw.endDate) raw.endDate = new Date(raw.endDate as string);
      const sanitized = updateEventSchema.parse(raw);
      const updated = await storage.updateEvent(req.params.id, user.tenantId, sanitized);
      await auditLogFromReq(req, { action: "event_updated", entityType: "event", entityId: req.params.id, entityName: existing.title, before: { title: existing.title, type: existing.type, impact: existing.impact }, after: { title: updated.title, type: updated.type, impact: updated.impact } });
      res.json(updated);
    } catch (err: any) { res.status(err.name === "ZodError" ? 400 : 500).json({ message: err.message }); }
  });

  app.delete("/api/events/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!eventWriteRoles.includes(user.role)) return res.status(403).json({ message: "Insufficient permissions" });
      const existing = await storage.getEvent(req.params.id, user.tenantId);
      if (!existing) return res.status(404).json({ message: "Event not found" });
      await storage.deleteEvent(req.params.id, user.tenantId);
      await auditLogFromReq(req, { action: "event_deleted", entityType: "event", entityId: req.params.id, entityName: existing.title });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/combo-offers", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const combos = await storage.getComboOffersByTenant(user.tenantId);
      const now = new Date();
      const result = combos.map((c) => {
        if (c.isActive && c.validityEnd && new Date(c.validityEnd) < now) {
          storage.updateComboOffer(c.id, user.tenantId, { isActive: false });
          return { ...c, isActive: false };
        }
        return c;
      });
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/combo-offers/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const combo = await storage.getComboOffer(req.params.id, user.tenantId);
      if (!combo) return res.status(404).json({ message: "Combo not found" });
      res.json(combo);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/combo-offers", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const body = { ...req.body, tenantId: user.tenantId, createdBy: user.id };
      if (body.validityStart) body.validityStart = new Date(body.validityStart);
      if (body.validityEnd) body.validityEnd = new Date(body.validityEnd);

      const comboPrice = parseFloat(body.comboPrice);
      if (isNaN(comboPrice)) return res.status(400).json({ message: "Invalid combo price" });
      if (!body.mainItems || !Array.isArray(body.mainItems) || body.mainItems.length !== 1) return res.status(400).json({ message: "Exactly one main item is required" });
      if (body.sideItems && Array.isArray(body.sideItems) && body.sideItems.length > 3) return res.status(400).json({ message: "Maximum 3 side items allowed" });
      if (body.addonItems && Array.isArray(body.addonItems) && body.addonItems.length > 2) return res.status(400).json({ message: "Maximum 2 add-on items allowed" });

      const menuItemsForValidation = await storage.getMenuItemsByTenant(user.tenantId);
      const menuMap = new Map(menuItemsForValidation.map((m) => [m.id, m]));
      const allComponentItems = [...body.mainItems, ...(body.sideItems || []), ...(body.addonItems || [])];
      let computedIndividualTotal = 0;
      for (const comp of allComponentItems) {
        if (!comp.menuItemId || !menuMap.has(comp.menuItemId)) return res.status(400).json({ message: `Menu item not found: ${comp.menuItemId || "missing ID"}` });
        computedIndividualTotal += Number(menuMap.get(comp.menuItemId)!.price);
      }
      body.individualTotal = computedIndividualTotal.toFixed(2);

      if (comboPrice >= computedIndividualTotal) return res.status(400).json({ message: "Combo price must be less than individual total" });
      const savingsPct = ((computedIndividualTotal - comboPrice) / computedIndividualTotal) * 100;
      if (savingsPct < 5) return res.status(400).json({ message: "Savings must be at least 5%" });
      if (savingsPct > 50) return res.status(400).json({ message: "Savings cannot exceed 50%" });
      body.savingsPercentage = savingsPct.toFixed(2);

      const existingCombos = await storage.getComboOffersByTenant(user.tenantId);
      if (existingCombos.some((c) => c.name.toLowerCase() === body.name.toLowerCase())) return res.status(400).json({ message: "A combo with this name already exists" });

      const combo = await storage.createComboOffer(body);
      auditLogFromReq(req, { action: "combo_offer_created", entityType: "combo_offer", entityId: combo.id, entityName: combo.name, after: { name: combo.name, comboPrice: combo.comboPrice } });
      res.status(201).json(combo);
    } catch (err: any) { res.status(err.name === "ZodError" ? 400 : 500).json({ message: err.message }); }
  });

  app.patch("/api/combo-offers/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getComboOffer(req.params.id, user.tenantId);
      if (!existing) return res.status(404).json({ message: "Combo not found" });

      const body = { ...req.body };
      if (body.validityStart) body.validityStart = new Date(body.validityStart);
      if (body.validityEnd) body.validityEnd = new Date(body.validityEnd);

      if (body.mainItems && (!Array.isArray(body.mainItems) || body.mainItems.length !== 1)) return res.status(400).json({ message: "Exactly one main item is required" });
      if (body.sideItems && Array.isArray(body.sideItems) && body.sideItems.length > 3) return res.status(400).json({ message: "Maximum 3 side items allowed" });
      if (body.addonItems && Array.isArray(body.addonItems) && body.addonItems.length > 2) return res.status(400).json({ message: "Maximum 2 add-on items allowed" });

      const finalMainItems = body.mainItems || existing.mainItems || [];
      const finalSideItems = body.sideItems || existing.sideItems || [];
      const finalAddonItems = body.addonItems || existing.addonItems || [];
      const allFinalComponents = [...finalMainItems, ...finalSideItems, ...finalAddonItems];

      const menuItemsForValidation = await storage.getMenuItemsByTenant(user.tenantId);
      const menuMap = new Map(menuItemsForValidation.map((m) => [m.id, m]));
      let computedIndividualTotal = 0;
      for (const comp of allFinalComponents) {
        if (!comp.menuItemId || !menuMap.has(comp.menuItemId)) return res.status(400).json({ message: `Menu item not found: ${comp.menuItemId || "missing ID"}` });
        computedIndividualTotal += Number(menuMap.get(comp.menuItemId)!.price);
      }
      body.individualTotal = computedIndividualTotal.toFixed(2);

      const comboPrice = parseFloat(body.comboPrice ?? existing.comboPrice);
      if (comboPrice >= computedIndividualTotal) return res.status(400).json({ message: "Combo price must be less than individual total" });
      const savingsPct = ((computedIndividualTotal - comboPrice) / computedIndividualTotal) * 100;
      if (savingsPct < 5) return res.status(400).json({ message: "Savings must be at least 5%" });
      if (savingsPct > 50) return res.status(400).json({ message: "Savings cannot exceed 50%" });
      body.savingsPercentage = savingsPct.toFixed(2);

      if (body.name && body.name.toLowerCase() !== existing.name.toLowerCase()) {
        const allCombos = await storage.getComboOffersByTenant(user.tenantId);
        if (allCombos.some((c) => c.id !== req.params.id && c.name.toLowerCase() === body.name.toLowerCase())) return res.status(400).json({ message: "A combo with this name already exists" });
      }

      const updated = await storage.updateComboOffer(req.params.id, user.tenantId, body);
      auditLogFromReq(req, { action: "combo_offer_updated", entityType: "combo_offer", entityId: req.params.id, entityName: existing.name, before: { name: existing.name, comboPrice: existing.comboPrice }, after: { name: updated?.name, comboPrice: updated?.comboPrice } });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/combo-offers/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getComboOffer(req.params.id, user.tenantId);
      if (!existing) return res.status(404).json({ message: "Combo not found" });
      await storage.deleteComboOffer(req.params.id, user.tenantId);
      auditLogFromReq(req, { action: "combo_offer_deleted", entityType: "combo_offer", entityId: req.params.id, entityName: existing.name });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/combo-offers/:id/duplicate", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getComboOffer(req.params.id, user.tenantId);
      if (!existing) return res.status(404).json({ message: "Combo not found" });

      const allCombos = await storage.getComboOffersByTenant(user.tenantId);
      let newName = `${existing.name} (Copy)`;
      let suffix = 2;
      while (allCombos.some((c) => c.name.toLowerCase() === newName.toLowerCase())) {
        newName = `${existing.name} (Copy ${suffix})`;
        suffix++;
      }

      const duplicate = await storage.createComboOffer({
        tenantId: user.tenantId, name: newName, description: existing.description,
        comboPrice: existing.comboPrice, individualTotal: existing.individualTotal,
        savingsPercentage: existing.savingsPercentage, mainItems: existing.mainItems,
        sideItems: existing.sideItems, addonItems: existing.addonItems,
        validityStart: existing.validityStart, validityEnd: existing.validityEnd,
        timeSlots: existing.timeSlots, outlets: existing.outlets,
        isActive: false, orderCount: 0, createdBy: user.id,
      });
      res.status(201).json(duplicate);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
