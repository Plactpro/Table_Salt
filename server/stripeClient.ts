import Stripe from "stripe";

/**
 * Railway-compatible Stripe client.
 * Uses STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY env vars directly
 * instead of the Replit connector API.
 */

const secretKey = process.env.STRIPE_SECRET_KEY || "";
const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";

export async function getUncachableStripeClient(): Promise<Stripe> {
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
  });
}

export async function getStripePublishableKey(): Promise<string> {
  return publishableKey;
}

export async function getStripeSecretKey(): Promise<string> {
  return secretKey;
}

let stripeSync: any = null;
export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import("stripe-replit-sync");
    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
