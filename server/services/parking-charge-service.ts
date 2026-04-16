import { pool } from "../db";
import { storage } from "../storage";

export interface ParkingChargeResult {
  durationMinutes: number;
  freeMinutesApplied: number;
  grossCharge: number;
  validationDiscount: number;
  finalCharge: number;
  taxAmount: number;
  totalCharge: number;
  vehicleType: string;
  rateType: string;
}

export async function calculateParkingCharge(
  ticketId: string,
  outletId: string,
  tenantId: string
): Promise<ParkingChargeResult> {
  const ticket = await storage.getValetTicket(ticketId, tenantId);
  if (!ticket) throw new Error("Valet ticket not found");

  const exitTime = ticket.exitTime ?? new Date();
  const entryTime = ticket.entryTime ? new Date(ticket.entryTime) : new Date();
  const totalMinutes = Math.max(0, Math.floor((exitTime.getTime() - entryTime.getTime()) / 60000));

  const config = await storage.getParkingConfig(outletId, tenantId);
  const freeMinutes = config?.freeMinutes ?? 0;
  const validationEnabled = config?.validationEnabled ?? false;
  const validationMinSpend = Number(config?.validationMinSpend ?? 0);

  const chargeableMinutes = Math.max(0, totalMinutes - freeMinutes);
  const freeMinutesApplied = Math.min(freeMinutes, totalMinutes);

  const rates = await storage.getParkingRates(outletId, tenantId);
  const rate = rates.find(r => r.vehicleType === ticket.vehicleType) ?? rates[0];

  if (!rate) {
    return {
      durationMinutes: totalMinutes,
      freeMinutesApplied,
      grossCharge: 0,
      validationDiscount: 0,
      finalCharge: 0,
      taxAmount: 0,
      totalCharge: 0,
      vehicleType: ticket.vehicleType,
      rateType: "NONE",
    };
  }

  let grossCharge = 0;
  const rateType = rate.rateType;
  const rateAmount = Number(rate.rateAmount);
  const dailyMaxCharge = rate.dailyMaxCharge != null ? Number(rate.dailyMaxCharge) : null;

  if (rateType === "FLAT") {
    grossCharge = rateAmount;
  } else if (rateType === "HOURLY") {
    const hoursCharged = chargeableMinutes / 60;
    grossCharge = Math.ceil(hoursCharged) * rateAmount;
  } else if (rateType === "SLAB") {
    const slabs = await storage.getParkingRateSlabs(rate.id, tenantId);
    slabs.sort((a, b) => a.fromMinutes - b.fromMinutes);
    for (const slab of slabs) {
      if (chargeableMinutes >= slab.fromMinutes) {
        if (slab.toMinutes == null || chargeableMinutes <= slab.toMinutes) {
          grossCharge = Number(slab.charge);
          break;
        }
      }
    }
  }

  if (dailyMaxCharge !== null && grossCharge > dailyMaxCharge) {
    grossCharge = dailyMaxCharge;
  }

  let validationDiscount = 0;
  if (validationEnabled && ticket.billId) {
    const { rows: billRows } = await pool.query(
      `SELECT total_amount FROM bills WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
      [ticket.billId, tenantId]
    );
    const billTotal = billRows[0] ? Number(billRows[0].total_amount) : 0;
    if (billTotal >= validationMinSpend) {
      validationDiscount = grossCharge;
    }
  }

  const finalCharge = Math.max(0, grossCharge - validationDiscount);
  const taxRate = Number(rate.taxRate ?? 0);
  const taxAmount = (finalCharge * taxRate) / 100;
  const totalCharge = finalCharge + taxAmount;

  return {
    durationMinutes: totalMinutes,
    freeMinutesApplied,
    grossCharge: Math.round(grossCharge * 100) / 100,
    validationDiscount: Math.round(validationDiscount * 100) / 100,
    finalCharge: Math.round(finalCharge * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    totalCharge: Math.round(totalCharge * 100) / 100,
    vehicleType: ticket.vehicleType,
    rateType,
  };
}

export async function applyParkingChargeToBill(
  billId: string,
  ticketId: string,
  tenantId: string
): Promise<ParkingChargeResult | null> {
  const ticket = await storage.getValetTicket(ticketId, tenantId);
  if (!ticket) return null;
  if (ticket.tenantId !== tenantId) return null;
  if (ticket.chargeAddedToBill) return null;

  const existing = await storage.getBillParkingCharge(billId, tenantId);
  if (existing) return null;

  const bill = await storage.getBill(billId, tenantId);
  if (!bill) return null;

  const outletId = bill.outletId ?? ticket.outletId;
  const result = await calculateParkingCharge(ticketId, outletId, tenantId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insertResult = await client.query(
      `INSERT INTO bill_parking_charges (tenant_id, outlet_id, bill_id, ticket_id, duration_minutes, free_minutes_applied, gross_charge, validation_discount, final_charge, tax_amount, total_charge, vehicle_type, rate_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (bill_id) DO NOTHING`,
      [tenantId, outletId, billId, ticketId, result.durationMinutes, result.freeMinutesApplied, result.grossCharge, result.validationDiscount, result.finalCharge, result.taxAmount, result.totalCharge, result.vehicleType, result.rateType]
    );

    if (insertResult.rowCount === 1) {
      await client.query(
        `UPDATE bills SET total_amount = total_amount + $1 WHERE id = $2 AND tenant_id = $3`,
        [result.totalCharge, billId, tenantId]
      );

      await client.query(
        `UPDATE valet_tickets SET charge_added_to_bill = true, duration_minutes = $1, final_charge = $4 WHERE id = $2 AND tenant_id = $3`,
        [result.durationMinutes, ticketId, tenantId, result.finalCharge]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return result;
}
