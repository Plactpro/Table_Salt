const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  kg: { g: 1000, lb: 2.20462, oz: 35.274 },
  g: { kg: 0.001, lb: 0.00220462, oz: 0.035274 },
  lb: { kg: 0.453592, g: 453.592, oz: 16 },
  oz: { kg: 0.0283495, g: 28.3495, lb: 0.0625 },
  ltr: { ml: 1000, gal: 0.264172, fl_oz: 33.814 },
  ml: { ltr: 0.001, gal: 0.000264172, fl_oz: 0.033814 },
  gal: { ltr: 3.78541, ml: 3785.41, fl_oz: 128 },
  fl_oz: { ltr: 0.0295735, ml: 29.5735, gal: 0.0078125 },
};

export function convertUnits(quantity: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return quantity;
  const from = fromUnit.toLowerCase().replace(/\s+/g, "_");
  const to = toUnit.toLowerCase().replace(/\s+/g, "_");
  if (from === to) return quantity;
  const conversions = UNIT_CONVERSIONS[from];
  if (conversions && conversions[to] !== undefined) {
    return quantity * conversions[to];
  }
  return quantity;
}

export function costPerBaseUnit(costPrice: number, unit: string, baseUnit: string, conversionRatio: number): number {
  if (!baseUnit || unit === baseUnit || conversionRatio <= 0) return costPrice;
  return costPrice / conversionRatio;
}

export function ingredientCostWithWaste(
  quantity: number,
  unitCost: number,
  wastePct: number,
  recipeUnit: string,
  inventoryUnit: string
): number {
  const convertedQty = convertUnits(quantity, recipeUnit, inventoryUnit);
  const effectiveQty = convertedQty / (1 - (wastePct || 0) / 100);
  return effectiveQty * unitCost;
}
