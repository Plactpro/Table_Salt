import type Stripe from "stripe";
import { getUncachableStripeClient } from "./stripeClient";

export { getUncachableStripeClient };

export const TRIAL_DAYS = 30;

export const STRIPE_PRICE_IDS: Record<string, string | undefined> = {};

const PRICE_TO_PLAN: Record<string, string> = {};

export function setPriceId(plan: string, priceId: string) {
  STRIPE_PRICE_IDS[plan] = priceId;
  PRICE_TO_PLAN[priceId] = plan;
}

export function planFromPriceId(priceId: string): string {
  return PRICE_TO_PLAN[priceId] ?? "basic";
}

export async function isStripeConfigured(): Promise<boolean> {
  try {
    await getUncachableStripeClient();
    return true;
  } catch {
    return false;
  }
}

export function trialEndsAtDate(): Date {
  return new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

export function trialDaysLeft(trialEndsAt: Date | null | undefined): number {
  if (!trialEndsAt) return 0;
  const msLeft = trialEndsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
}

export async function discoverPriceIds(): Promise<void> {
  try {
    const stripe = await getUncachableStripeClient();
    const prices = await stripe.prices.list({ active: true, limit: 100, expand: ["data.product"] });
    for (const price of prices.data) {
      const product = price.product as Stripe.Product | null;
      if (!product || typeof product === "string" || product.deleted) continue;
      const planKey = product.metadata?.plan_key;
      if (planKey && ["basic", "standard", "premium"].includes(planKey)) {
        setPriceId(planKey, price.id);
      }
    }
    const discovered = Object.keys(STRIPE_PRICE_IDS);
    if (discovered.length > 0) {
      for (const plan of ["basic", "standard", "premium"]) {
        const priceId = STRIPE_PRICE_IDS[plan];
        console.log(`[Stripe] Price discovered: ${plan} → ${priceId ?? "NOT FOUND"}`);
      }
    } else {
      console.warn("[Stripe] No plan price IDs discovered. Run scripts/seed-stripe-plans.ts to create plans.");
    }
  } catch (err: any) {
    console.warn("[Stripe] Price discovery skipped:", err.message);
  }
}
