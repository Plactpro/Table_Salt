import { pool } from "../db";

interface SmsResult { sent: boolean; provider: string; messageId?: string; error?: string }

// MSG91 for India (+91 numbers)
async function sendViaMSG91(phone: string, message: string, tenantId: string): Promise<SmsResult> {
  const apiKey = process.env.MSG91_API_KEY;
  const senderId = process.env.MSG91_SENDER_ID || "TBSALT";
  if (!apiKey) return { sent: false, provider: "msg91", error: "MSG91_API_KEY not configured" };
  try {
    const res = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { authkey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ flow_id: process.env.MSG91_FLOW_ID, sender: senderId, mobiles: phone, message }),
    });
    const data = await res.json() as any;
    return { sent: data.type === "success", provider: "msg91", messageId: data.request_id };
  } catch (err: any) {
    return { sent: false, provider: "msg91", error: err.message };
  }
}

// Twilio for UAE/international
async function sendViaTwilio(phone: string, message: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return { sent: false, provider: "twilio", error: "Twilio credentials not configured" };
  try {
    const auth = Buffer.from(sid + ":" + token).toString("base64");
    const res = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json", {
      method: "POST",
      headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: phone, From: from, Body: message }).toString(),
    });
    const data = await res.json() as any;
    return { sent: !data.error_code, provider: "twilio", messageId: data.sid, error: data.error_message };
  } catch (err: any) {
    return { sent: false, provider: "twilio", error: err.message };
  }
}

export async function sendSms(phone: string, message: string, tenantId: string): Promise<SmsResult> {
  const cleaned = phone.replace(/[^+d]/g, "");
  const isIndia = cleaned.startsWith("+91") || cleaned.startsWith("91") || (cleaned.length === 10 && !cleaned.startsWith("+"));
  const result = isIndia ? await sendViaMSG91(cleaned, message, tenantId) : await sendViaTwilio(cleaned, message);
  // Log to DB
  try {
    await pool.query(
      "INSERT INTO sms_log (tenant_id, phone, message, provider, sent, message_id, error) VALUES (,,,,,,)",
      [tenantId, cleaned, message.substring(0, 500), result.provider, result.sent, result.messageId || null, result.error || null]
    );
  } catch (_) {}
  return result;
}