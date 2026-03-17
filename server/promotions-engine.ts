import type { PromotionRule } from "@shared/schema";

export interface EvaluateItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  categoryId?: string;
}

export interface EvaluateInput {
  items: EvaluateItem[];
  subtotal: number;
  channel: string;
  orderType?: string;
  outletId?: string;
  tableArea?: string;
  customerId?: string;
  loyaltyTier?: string;
  customerSegment?: string;
  dayOfWeek?: number;
  hour?: number;
  taxRate?: number;
  serviceChargeRate?: number;
}

export interface LineItemAdjustment {
  menuItemId: string;
  itemName: string;
  originalPrice: number;
  adjustedPrice: number;
  discountAmount: number;
  ruleId: string;
  ruleName: string;
}

export interface AppliedDiscount {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  discountType: string;
  discountAmount: number;
  description: string;
  affectedItems?: string[];
  freeItems?: { menuItemId: string; name: string; quantity: number }[];
}

export interface EvaluateResult {
  appliedDiscounts: AppliedDiscount[];
  lineItemAdjustments: LineItemAdjustment[];
  totalDiscount: number;
  surchargeTotal: number;
  finalSubtotal: number;
  computedTax: number;
  computedServiceCharge: number;
  grandTotal: number;
}

function isRuleActive(rule: PromotionRule): boolean {
  if (!rule.active) return false;
  const now = new Date();
  if (rule.startDate && new Date(rule.startDate) > now) return false;
  if (rule.endDate && new Date(rule.endDate) < now) return false;
  if (rule.usageLimit && (rule.usageCount ?? 0) >= rule.usageLimit) return false;
  return true;
}

function isTimeConditionMet(rule: PromotionRule, input: EvaluateInput): boolean {
  const cond = rule.conditions as Record<string, unknown> | null;
  if (!cond) return true;

  if (cond.daysOfWeek && Array.isArray(cond.daysOfWeek)) {
    const dow = input.dayOfWeek ?? new Date().getDay();
    if (!(cond.daysOfWeek as number[]).includes(dow)) return false;
  }

  if (cond.startHour !== undefined && cond.endHour !== undefined) {
    const hour = input.hour ?? new Date().getHours();
    const start = Number(cond.startHour);
    const end = Number(cond.endHour);
    if (start <= end) {
      if (hour < start || hour >= end) return false;
    } else {
      if (hour < start && hour >= end) return false;
    }
  }

  return true;
}

function isChannelAllowed(rule: PromotionRule, channel: string): boolean {
  if (!rule.channels || rule.channels.length === 0) return true;
  return rule.channels.includes(channel);
}

function isOutletConditionMet(rule: PromotionRule, input: EvaluateInput): boolean {
  const cond = rule.conditions as Record<string, unknown> | null;
  if (!cond) return true;
  if (cond.outletIds && Array.isArray(cond.outletIds) && cond.outletIds.length > 0) {
    if (!input.outletId) return false;
    return (cond.outletIds as string[]).includes(input.outletId);
  }
  if (cond.tableAreas && Array.isArray(cond.tableAreas) && cond.tableAreas.length > 0) {
    if (!input.tableArea) return false;
    return (cond.tableAreas as string[]).includes(input.tableArea);
  }
  return true;
}

function isCustomerSegmentMet(rule: PromotionRule, input: EvaluateInput): boolean {
  const cond = rule.conditions as Record<string, unknown> | null;
  if (!cond || !cond.customerSegment) return true;
  if (!input.customerSegment) return false;
  return input.customerSegment.toLowerCase() === String(cond.customerSegment).toLowerCase();
}

function isScopeMatched(rule: PromotionRule, input: EvaluateInput): boolean {
  const scope = rule.scope || "all_items";
  if (scope === "all_items" || scope === "order_total") return true;

  if (scope === "category" && rule.scopeRef) {
    return input.items.some((item) => item.categoryId === rule.scopeRef);
  }

  if (scope === "specific_items" && rule.scopeRef) {
    const ids = rule.scopeRef.split(",").map((s) => s.trim());
    return input.items.some((item) => ids.includes(item.menuItemId));
  }

  return true;
}

function isLoyaltyConditionMet(rule: PromotionRule, input: EvaluateInput): boolean {
  const cond = rule.conditions as Record<string, unknown> | null;
  if (!cond || !cond.loyaltyTier) return true;
  if (!input.loyaltyTier) return false;

  const tiers = ["bronze", "silver", "gold", "platinum"];
  const requiredIdx = tiers.indexOf(String(cond.loyaltyTier).toLowerCase());
  const customerIdx = tiers.indexOf(input.loyaltyTier.toLowerCase());
  if (requiredIdx === -1 || customerIdx === -1) return input.loyaltyTier.toLowerCase() === String(cond.loyaltyTier).toLowerCase();
  return customerIdx >= requiredIdx;
}

function getAffectedItems(rule: PromotionRule, input: EvaluateInput): EvaluateItem[] {
  const scope = rule.scope || "all_items";
  if (scope === "category" && rule.scopeRef) {
    return input.items.filter((i) => i.categoryId === rule.scopeRef);
  }
  if (scope === "specific_items" && rule.scopeRef) {
    const ids = rule.scopeRef.split(",").map((s) => s.trim());
    return input.items.filter((i) => ids.includes(i.menuItemId));
  }
  return input.items;
}

interface DiscountCalcResult {
  amount: number;
  lineAdjustments: LineItemAdjustment[];
  freeItems?: { menuItemId: string; name: string; quantity: number }[];
}

function calculateDiscount(rule: PromotionRule, input: EvaluateInput): DiscountCalcResult {
  let disc = 0;
  const value = Number(rule.discountValue);
  const lineAdjustments: LineItemAdjustment[] = [];
  const affectedItems = getAffectedItems(rule, input);
  const cond = rule.conditions as Record<string, unknown> | null;

  if (rule.ruleType === "bogo") {
    const buyQty = cond?.buyQuantity ? Number(cond.buyQuantity) : 1;
    const getQty = cond?.getQuantity ? Number(cond.getQuantity) : 1;
    const getDiscountPct = cond?.getDiscountPercent ? Number(cond.getDiscountPercent) : 100;

    for (const item of affectedItems) {
      const sets = Math.floor(item.quantity / (buyQty + getQty));
      if (sets > 0) {
        const freeUnits = sets * getQty;
        const itemDisc = Math.round(freeUnits * item.price * (getDiscountPct / 100) * 100) / 100;
        disc += itemDisc;
        lineAdjustments.push({
          menuItemId: item.menuItemId,
          itemName: item.name,
          originalPrice: item.price,
          adjustedPrice: item.price,
          discountAmount: itemDisc,
          ruleId: rule.id,
          ruleName: rule.name,
        });
      }
    }
    if (rule.maxDiscount && disc > Number(rule.maxDiscount)) disc = Number(rule.maxDiscount);
    return { amount: Math.round(disc * 100) / 100, lineAdjustments };
  }

  if (rule.ruleType === "combo_deal") {
    const comboItemIds = cond?.comboItems && Array.isArray(cond.comboItems) ? (cond.comboItems as string[]) : [];
    const requiredCategories = cond?.requiredCategories && Array.isArray(cond.requiredCategories) ? (cond.requiredCategories as string[]) : [];

    if (comboItemIds.length > 0) {
      const cartIds = new Set(input.items.map((i) => i.menuItemId));
      const allPresent = comboItemIds.every((id) => cartIds.has(id));
      if (!allPresent) return { amount: 0, lineAdjustments: [] };
      const comboItems = input.items.filter((i) => comboItemIds.includes(i.menuItemId));
      const comboTotal = comboItems.reduce((s, i) => s + i.price * i.quantity, 0);
      if (rule.discountType === "percentage") {
        disc = Math.round(comboTotal * (value / 100) * 100) / 100;
      } else if (rule.discountType === "fixed_amount") {
        disc = value;
      }
    } else if (requiredCategories.length > 0) {
      const cartCats = new Set(input.items.map((i) => i.categoryId).filter(Boolean));
      const allCatsPresent = requiredCategories.every((catId) => cartCats.has(catId));
      if (!allCatsPresent) return { amount: 0, lineAdjustments: [] };
      if (rule.discountType === "percentage") {
        const total = affectedItems.reduce((s, i) => s + i.price * i.quantity, 0);
        disc = Math.round(total * (value / 100) * 100) / 100;
      } else {
        disc = value;
      }
    } else {
      if (rule.discountType === "percentage") {
        const total = affectedItems.reduce((s, i) => s + i.price * i.quantity, 0);
        disc = Math.round(total * (value / 100) * 100) / 100;
      } else {
        disc = value;
      }
    }
    if (rule.maxDiscount && disc > Number(rule.maxDiscount)) disc = Number(rule.maxDiscount);
    return { amount: Math.round(disc * 100) / 100, lineAdjustments };
  }

  if (rule.ruleType === "free_item") {
    const freeItemId = cond?.freeItemId ? String(cond.freeItemId) : null;
    const freeItemName = cond?.freeItemName ? String(cond.freeItemName) : "Free Item";
    const freeQty = cond?.freeQuantity ? Number(cond.freeQuantity) : 1;
    const freeItems = freeItemId ? [{ menuItemId: freeItemId, name: freeItemName, quantity: freeQty }] : [];
    return { amount: 0, lineAdjustments: [], freeItems };
  }

  if (rule.discountType === "percentage") {
    for (const item of affectedItems) {
      const itemTotal = item.price * item.quantity;
      const itemDisc = Math.round(itemTotal * (value / 100) * 100) / 100;
      disc += itemDisc;
      lineAdjustments.push({
        menuItemId: item.menuItemId,
        itemName: item.name,
        originalPrice: item.price,
        adjustedPrice: Math.round((item.price - item.price * (value / 100)) * 100) / 100,
        discountAmount: itemDisc,
        ruleId: rule.id,
        ruleName: rule.name,
      });
    }
  } else if (rule.discountType === "fixed_amount") {
    disc = value;
  } else if (rule.discountType === "surcharge") {
    disc = -value;
  }

  if (rule.maxDiscount && disc > Number(rule.maxDiscount)) {
    disc = Number(rule.maxDiscount);
  }

  return { amount: Math.round(disc * 100) / 100, lineAdjustments };
}

export function evaluateRules(rules: PromotionRule[], input: EvaluateInput): EvaluateResult {
  const activeRules = rules
    .filter((r) => isRuleActive(r))
    .filter((r) => isChannelAllowed(r, input.channel))
    .filter((r) => isScopeMatched(r, input))
    .filter((r) => isTimeConditionMet(r, input))
    .filter((r) => isLoyaltyConditionMet(r, input))
    .filter((r) => isOutletConditionMet(r, input))
    .filter((r) => isCustomerSegmentMet(r, input))
    .filter((r) => {
      if (r.minOrderAmount && input.subtotal < Number(r.minOrderAmount)) return false;
      return true;
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const appliedDiscounts: AppliedDiscount[] = [];
  const allLineAdjustments: LineItemAdjustment[] = [];
  let totalDiscount = 0;
  let surchargeTotal = 0;
  let hasNonStackable = false;
  const usedExclusionGroups = new Set<string>();

  for (const rule of activeRules) {
    if (hasNonStackable) break;

    if (!rule.stackable && appliedDiscounts.length > 0) continue;

    const ruleCond = rule.conditions as Record<string, unknown> | null;
    const exclusionGroup = ruleCond?.mutualExclusionGroup ? String(ruleCond.mutualExclusionGroup) : null;
    if (exclusionGroup && usedExclusionGroups.has(exclusionGroup)) continue;

    const { amount: discAmount, lineAdjustments, freeItems } = calculateDiscount(rule, input);
    if (discAmount === 0 && (!freeItems || freeItems.length === 0)) continue;

    const affectedItemNames = getAffectedItems(rule, input).map((i) => i.name);

    appliedDiscounts.push({
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.ruleType,
      discountType: rule.discountType,
      discountAmount: discAmount,
      description: rule.description || rule.name,
      affectedItems: affectedItemNames.length > 0 && affectedItemNames.length < input.items.length ? affectedItemNames : undefined,
      freeItems: freeItems && freeItems.length > 0 ? freeItems : undefined,
    });

    if (discAmount > 0) {
      totalDiscount += discAmount;
    } else if (discAmount < 0) {
      surchargeTotal += Math.abs(discAmount);
    }

    allLineAdjustments.push(...lineAdjustments);

    if (exclusionGroup) {
      usedExclusionGroups.add(exclusionGroup);
    }

    if (!rule.stackable) {
      hasNonStackable = true;
    }
  }

  totalDiscount = Math.round(totalDiscount * 100) / 100;
  surchargeTotal = Math.round(surchargeTotal * 100) / 100;
  const netAdjustment = totalDiscount - surchargeTotal;
  const finalSubtotal = Math.max(0, Math.round((input.subtotal - netAdjustment) * 100) / 100);

  const taxRate = input.taxRate ?? 0;
  const serviceChargeRate = input.serviceChargeRate ?? 0;
  const computedServiceCharge = Math.round(finalSubtotal * serviceChargeRate * 100) / 100;
  const computedTax = Math.round(finalSubtotal * taxRate * 100) / 100;
  const grandTotal = Math.round((finalSubtotal + computedServiceCharge + computedTax) * 100) / 100;

  return {
    appliedDiscounts,
    lineItemAdjustments: allLineAdjustments,
    totalDiscount,
    surchargeTotal,
    finalSubtotal,
    computedTax,
    computedServiceCharge,
    grandTotal,
  };
}
