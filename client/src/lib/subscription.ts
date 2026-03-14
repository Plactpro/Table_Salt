export type SubscriptionTier = "basic" | "standard" | "premium" | "enterprise";
export type BusinessType = "enterprise" | "qsr" | "food_truck" | "cafe" | "fine_dining" | "casual_dining" | "cloud_kitchen";

export type FeatureKey =
  | "orders"
  | "menu"
  | "tables"
  | "pos"
  | "inventory"
  | "staff"
  | "reports"
  | "settings"
  | "outlets"
  | "billing"
  | "integrations"
  | "advanced_analytics"
  | "multi_location"
  | "api_access"
  | "custom_branding"
  | "reservations"
  | "delivery_management"
  | "loyalty_program"
  | "crm"
  | "offers"
  | "cleaning";

export const subscriptionMatrix: Record<SubscriptionTier, FeatureKey[]> = {
  basic: ["orders", "menu", "settings"],
  standard: ["orders", "menu", "tables", "pos", "inventory", "staff", "outlets", "settings", "reservations", "cleaning"],
  premium: [
    "orders", "menu", "tables", "pos", "inventory", "staff", "outlets", "settings",
    "reports", "billing", "advanced_analytics", "reservations",
    "delivery_management", "loyalty_program", "crm", "offers", "cleaning",
  ],
  enterprise: [
    "orders", "menu", "tables", "pos", "inventory", "staff", "outlets", "settings",
    "reports", "billing", "integrations", "advanced_analytics", "multi_location",
    "api_access", "custom_branding", "reservations", "delivery_management",
    "loyalty_program", "crm", "offers", "cleaning",
  ],
};

export interface BusinessConfig {
  label: string;
  description: string;
  relevantFeatures: FeatureKey[];
  badges: string[];
  icon: string;
}

export const businessConfig: Record<BusinessType, BusinessConfig> = {
  enterprise: {
    label: "Enterprise",
    description: "Multi-location restaurant group management",
    relevantFeatures: ["multi_location", "advanced_analytics", "api_access", "custom_branding", "crm"],
    badges: ["Multi-Location", "Enterprise Grade", "API Access"],
    icon: "Building2",
  },
  qsr: {
    label: "Quick Service",
    description: "Fast food and quick service restaurants",
    relevantFeatures: ["pos", "orders", "delivery_management", "inventory"],
    badges: ["Quick Service", "Fast POS", "Drive-Thru"],
    icon: "Zap",
  },
  food_truck: {
    label: "Food Truck",
    description: "Mobile food service operations",
    relevantFeatures: ["pos", "orders", "inventory", "menu"],
    badges: ["Mobile", "GPS Tracking", "On-The-Go"],
    icon: "Truck",
  },
  cafe: {
    label: "Café",
    description: "Coffee shops and casual cafés",
    relevantFeatures: ["pos", "orders", "menu", "loyalty_program", "inventory"],
    badges: ["Café", "Loyalty", "Quick Serve"],
    icon: "Coffee",
  },
  fine_dining: {
    label: "Fine Dining",
    description: "Upscale dining experiences",
    relevantFeatures: ["reservations", "tables", "crm", "advanced_analytics", "staff"],
    badges: ["Fine Dining", "Reservations", "Premium Service"],
    icon: "Wine",
  },
  casual_dining: {
    label: "Casual Dining",
    description: "Full-service casual restaurants",
    relevantFeatures: ["orders", "tables", "menu", "pos", "staff", "reservations"],
    badges: ["Casual Dining", "Full Service"],
    icon: "UtensilsCrossed",
  },
  cloud_kitchen: {
    label: "Cloud Kitchen",
    description: "Delivery-only kitchen operations",
    relevantFeatures: ["orders", "delivery_management", "menu", "inventory", "integrations"],
    badges: ["Cloud Kitchen", "Delivery Only", "Multi-Brand"],
    icon: "Cloud",
  },
};

export function hasFeatureAccess(tier: SubscriptionTier, feature: FeatureKey): boolean {
  return subscriptionMatrix[tier]?.includes(feature) ?? false;
}

export function getBusinessBadges(businessType: BusinessType, tier: SubscriptionTier): string[] {
  const config = businessConfig[businessType];
  if (!config) return [];
  const baseBadges = config.badges;
  const tierBadge = tierPricing[tier]?.label ?? tier;
  return [tierBadge, ...baseBadges];
}

export function getMinimumTierForFeature(feature: FeatureKey): SubscriptionTier | null {
  const tiers: SubscriptionTier[] = ["basic", "standard", "premium", "enterprise"];
  for (const tier of tiers) {
    if (subscriptionMatrix[tier].includes(feature)) {
      return tier;
    }
  }
  return null;
}

export const tierPricing: Record<SubscriptionTier, { label: string; price: number; description: string }> = {
  basic: { label: "Basic", price: 0, description: "Core features for a single outlet" },
  standard: { label: "Standard", price: 29, description: "1-3 outlets with staff & POS" },
  premium: { label: "Premium", price: 79, description: "Full analytics, billing & multi-location" },
  enterprise: { label: "Enterprise", price: 199, description: "Custom solutions for restaurant chains" },
};
