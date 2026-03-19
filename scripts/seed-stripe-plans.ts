import { getUncachableStripeClient } from "../server/stripeClient";

const PLANS = [
  {
    key: "basic",
    name: "Table Salt Basic",
    description: "Core features for a single outlet — orders, menu, POS, up to 3 outlets, staff & inventory.",
    price: 4900,
  },
  {
    key: "standard",
    name: "Table Salt Standard",
    description: "Full operations for growing restaurants — advanced reports, CRM, delivery, reservations & promotions.",
    price: 9900,
  },
  {
    key: "premium",
    name: "Table Salt Premium",
    description: "Enterprise-grade for restaurant groups — analytics, multi-location, custom branding & priority support.",
    price: 19900,
  },
];

async function seedStripePlans() {
  console.log("Connecting to Stripe...");
  const stripe = await getUncachableStripeClient();

  for (const plan of PLANS) {
    const existing = await stripe.products.search({
      query: `metadata['plan_key']:'${plan.key}'`,
    });

    if (existing.data.length > 0) {
      const product = existing.data[0];
      const prices = await stripe.prices.list({ product: product.id, active: true });
      console.log(`[SKIP] ${plan.name} already exists (${product.id}), price: ${prices.data[0]?.id ?? "none"}`);
      continue;
    }

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: { plan_key: plan.key },
    });
    console.log(`[CREATE] Product: ${product.name} (${product.id})`);

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.price,
      currency: "usd",
      recurring: { interval: "month" },
    });
    console.log(`[CREATE] Price: $${plan.price / 100}/mo (${price.id})`);
  }

  console.log("\nDone! Stripe plans are ready.");
  console.log("The server will auto-discover these price IDs on startup via discoverPriceIds().");
}

seedStripePlans().catch((err) => {
  console.error("Error seeding Stripe plans:", err.message);
  process.exit(1);
});
