export const ALLERGENS = [
  { key: "gluten", label: "Gluten", description: "Wheat, rye, barley, oats", icon: "🌾" },
  { key: "crustaceans", label: "Crustaceans", description: "Shrimp, crab, lobster", icon: "🦐" },
  { key: "eggs", label: "Eggs", description: "All egg products", icon: "🥚" },
  { key: "fish", label: "Fish", description: "All fish species", icon: "🐟" },
  { key: "peanuts", label: "Peanuts", description: "Groundnuts", icon: "🥜" },
  { key: "soybeans", label: "Soybeans", description: "Soy, tofu, edamame", icon: "🫘" },
  { key: "milk", label: "Milk", description: "Dairy, lactose", icon: "🥛" },
  { key: "nuts", label: "Tree Nuts", description: "Almonds, cashews, walnuts", icon: "🌰" },
  { key: "celery", label: "Celery", description: "Celery, celeriac", icon: "🥬" },
  { key: "mustard", label: "Mustard", description: "Mustard seeds, mustard oil", icon: "🌿" },
  { key: "sesame", label: "Sesame", description: "Sesame seeds, tahini", icon: "🫙" },
  { key: "sulphites", label: "Sulphites", description: "Preservatives SO2 > 10mg/kg", icon: "⚗️" },
  { key: "lupin", label: "Lupin", description: "Lupin flour and seeds", icon: "🌸" },
  { key: "molluscs", label: "Molluscs", description: "Squid, oysters, mussels", icon: "🦑" },
] as const;

export type AllergenKey = typeof ALLERGENS[number]["key"];

export type AllergenFlags = Partial<Record<AllergenKey, boolean>>;

export function getActiveAllergens(flags: AllergenFlags | null | undefined) {
  if (!flags) return [];
  return ALLERGENS.filter(a => flags[a.key]);
}

export function hasAllergens(flags: AllergenFlags | null | undefined): boolean {
  if (!flags) return false;
  return Object.values(flags).some(v => v);
}
