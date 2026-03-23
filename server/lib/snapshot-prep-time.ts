import { storage } from "../storage";

/**
 * Resolve prep time minutes for a menu item to snapshot onto an order item.
 * Priority: menuItems.prepTimeMinutes → recipe.prepTimeMinutes → null
 * This ensures the timing engine always has the best available cook time even when recipes are absent.
 */
export async function snapshotPrepTime(menuItemId: string | null | undefined, menuItemPrepTime?: number | null): Promise<number | null> {
  if (menuItemPrepTime != null) return menuItemPrepTime;
  if (!menuItemId) return null;
  try {
    const recipe = await storage.getRecipeByMenuItem(menuItemId);
    return recipe?.prepTimeMinutes ?? null;
  } catch {
    return null;
  }
}
