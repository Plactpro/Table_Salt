import crypto from "crypto";

export interface RazorpayPaymentLink {
  id: string;
  short_url: string;
  status: string;
  amount: number;
  currency: string;
  reference_id?: string;
  payments?: Array<{ payment_id: string; status: string; method?: string }>;
}

function getCredentials(tenantKeyId?: string | null, tenantKeySecret?: string | null): { keyId: string; keySecret: string } {
  const keyId = tenantKeyId || process.env.RAZORPAY_KEY_ID;
  const keySecret = tenantKeySecret || process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay credentials not configured. Set key_id and key_secret in Settings or as environment variables.");
  return { keyId, keySecret };
}

function authHeader(keyId: string, keySecret: string): string {
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

export async function createPaymentLink(params: {
  amountRupees: number;
  currency: string;
  description: string;
  billId: string;
  tenantKeyId?: string | null;
  tenantKeySecret?: string | null;
}): Promise<RazorpayPaymentLink> {
  const { keyId, keySecret } = getCredentials(params.tenantKeyId, params.tenantKeySecret);
  const amountPaise = Math.round(params.amountRupees * 100);

  const body = {
    amount: amountPaise,
    currency: params.currency || "INR",
    description: params.description,
    reference_id: params.billId,
    reminder_enable: false,
    notify: { sms: false, email: false },
    expire_by: Math.floor(Date.now() / 1000) + 900,
  };

  const response = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader(keyId, keySecret) },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as any;
    throw new Error(err?.error?.description || `Razorpay API error ${response.status}`);
  }
  return response.json() as Promise<RazorpayPaymentLink>;
}

export async function getPaymentLink(linkId: string, tenantKeyId?: string | null, tenantKeySecret?: string | null): Promise<RazorpayPaymentLink> {
  const { keyId, keySecret } = getCredentials(tenantKeyId, tenantKeySecret);
  const response = await fetch(`https://api.razorpay.com/v1/payment_links/${linkId}`, {
    headers: { Authorization: authHeader(keyId, keySecret) },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as any;
    throw new Error(err?.error?.description || `Razorpay API error ${response.status}`);
  }
  return response.json() as Promise<RazorpayPaymentLink>;
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}
