import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

export const stripe: Stripe | null = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

export const TRIAL_DAYS = 30;

export const STRIPE_PRICE_IDS: Record<string, string | undefined> = {
  basic: process.env.STRIPE_PRICE_BASIC,
  standard: process.env.STRIPE_PRICE_STANDARD,
  premium: process.env.STRIPE_PRICE_PREMIUM,
};

const PRICE_TO_PLAN: Record<string, string> = {};
if (process.env.STRIPE_PRICE_BASIC) PRICE_TO_PLAN[process.env.STRIPE_PRICE_BASIC] = "basic";
if (process.env.STRIPE_PRICE_STANDARD) PRICE_TO_PLAN[process.env.STRIPE_PRICE_STANDARD] = "standard";
if (process.env.STRIPE_PRICE_PREMIUM) PRICE_TO_PLAN[process.env.STRIPE_PRICE_PREMIUM] = "premium";

export function planFromPriceId(priceId: string): string {
  return PRICE_TO_PLAN[priceId] ?? "basic";
}

export function isStripeConfigured(): boolean {
  return !!stripe;
}

export function trialEndsAtDate(): Date {
  return new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

export function trialDaysLeft(trialEndsAt: Date | null | undefined): number {
  if (!trialEndsAt) return 0;
  const msLeft = trialEndsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
}
