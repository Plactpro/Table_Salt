import { db } from "../server/db";
import { users, customers, reservations, deliveryOrders, waitlistEntries } from "../shared/schema";
import { encryptField, isEncrypted } from "../server/encryption";
import { eq, sql, isNotNull } from "drizzle-orm";

async function encryptExistingPii() {
  console.log("[encrypt-pii] Starting one-time PII encryption migration...");

  let userCount = 0;
  const allUsers = await db.select({ id: users.id, email: users.email, phone: users.phone }).from(users);
  for (const u of allUsers) {
    const updates: Record<string, string> = {};
    if (u.email && !isEncrypted(u.email)) updates.email = encryptField(u.email);
    if (u.phone && !isEncrypted(u.phone)) updates.phone = encryptField(u.phone);
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, u.id));
      userCount++;
    }
  }
  console.log(`[encrypt-pii] Encrypted PII for ${userCount} users`);

  let customerCount = 0;
  const allCustomers = await db.select({ id: customers.id, email: customers.email, phone: customers.phone }).from(customers);
  for (const c of allCustomers) {
    const updates: Record<string, string> = {};
    if (c.email && !isEncrypted(c.email)) updates.email = encryptField(c.email);
    if (c.phone && !isEncrypted(c.phone)) updates.phone = encryptField(c.phone);
    if (Object.keys(updates).length > 0) {
      await db.update(customers).set(updates).where(eq(customers.id, c.id));
      customerCount++;
    }
  }
  console.log(`[encrypt-pii] Encrypted PII for ${customerCount} customers`);

  let reservationCount = 0;
  const allReservations = await db.select({ id: reservations.id, customerPhone: reservations.customerPhone }).from(reservations);
  for (const r of allReservations) {
    if (r.customerPhone && !isEncrypted(r.customerPhone)) {
      await db.update(reservations).set({ customerPhone: encryptField(r.customerPhone) }).where(eq(reservations.id, r.id));
      reservationCount++;
    }
  }
  console.log(`[encrypt-pii] Encrypted PII for ${reservationCount} reservations`);

  let deliveryCount = 0;
  const allDeliveries = await db.select({ id: deliveryOrders.id, customerPhone: deliveryOrders.customerPhone, customerAddress: deliveryOrders.customerAddress }).from(deliveryOrders);
  for (const d of allDeliveries) {
    const updates: Record<string, string> = {};
    if (d.customerPhone && !isEncrypted(d.customerPhone)) updates.customerPhone = encryptField(d.customerPhone);
    if (d.customerAddress && !isEncrypted(d.customerAddress)) updates.customerAddress = encryptField(d.customerAddress);
    if (Object.keys(updates).length > 0) {
      await db.update(deliveryOrders).set(updates).where(eq(deliveryOrders.id, d.id));
      deliveryCount++;
    }
  }
  console.log(`[encrypt-pii] Encrypted PII for ${deliveryCount} delivery orders`);

  let waitlistCount = 0;
  const allWaitlist = await db.select({ id: waitlistEntries.id, customerPhone: waitlistEntries.customerPhone }).from(waitlistEntries);
  for (const w of allWaitlist) {
    if (w.customerPhone && !isEncrypted(w.customerPhone)) {
      await db.update(waitlistEntries).set({ customerPhone: encryptField(w.customerPhone) }).where(eq(waitlistEntries.id, w.id));
      waitlistCount++;
    }
  }
  console.log(`[encrypt-pii] Encrypted PII for ${waitlistCount} waitlist entries`);

  console.log("[encrypt-pii] Migration complete!");
  process.exit(0);
}

encryptExistingPii().catch(err => {
  console.error("[encrypt-pii] Migration failed:", err);
  process.exit(1);
});
