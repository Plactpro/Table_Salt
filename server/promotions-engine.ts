import type { PromotionRule } from "@shared/schema";

export interface EvaluateInput {
  items: {
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    categoryId?: string;
  }[];
  subtotal: number;
  channel: string;
  orderType?: string;
  customerId?: string;
  loyaltyTier?: string;
  dayOfWeek?: number;
  hour?: number;
}

export interface AppliedDiscount {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  discountType: string;
  discountAmount: number;
  description: string;
}

export interface EvaluateResult {
  appliedDiscounts: AppliedDiscount[];
  totalDiscount: number;
  finalSubtotal: number;
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

function calculateDiscount(rule: PromotionRule, input: EvaluateInput): number {
  let disc = 0;
  const value = Number(rule.discountValue);

  if (rule.discountType === "percentage") {
    if (rule.scope === "category" && rule.scopeRef) {
      const catItems = input.items.filter((i) => i.categoryId === rule.scopeRef);
      const catTotal = catItems.reduce((s, i) => s + i.price * i.quantity, 0);
      disc = catTotal * (value / 100);
    } else if (rule.scope === "specific_items" && rule.scopeRef) {
      const ids = rule.scopeRef.split(",").map((s) => s.trim());
      const matched = input.items.filter((i) => ids.includes(i.menuItemId));
      const matchedTotal = matched.reduce((s, i) => s + i.price * i.quantity, 0);
      disc = matchedTotal * (value / 100);
    } else {
      disc = input.subtotal * (value / 100);
    }
  } else if (rule.discountType === "fixed_amount") {
    disc = value;
  } else if (rule.discountType === "surcharge") {
    disc = -value;
  }

  if (rule.maxDiscount && disc > Number(rule.maxDiscount)) {
    disc = Number(rule.maxDiscount);
  }

  return Math.round(disc * 100) / 100;
}

export function evaluateRules(rules: PromotionRule[], input: EvaluateInput): EvaluateResult {
  const activeRules = rules
    .filter((r) => isRuleActive(r))
    .filter((r) => isChannelAllowed(r, input.channel))
    .filter((r) => isScopeMatched(r, input))
    .filter((r) => isTimeConditionMet(r, input))
    .filter((r) => isLoyaltyConditionMet(r, input))
    .filter((r) => {
      if (r.minOrderAmount && input.subtotal < Number(r.minOrderAmount)) return false;
      return true;
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const appliedDiscounts: AppliedDiscount[] = [];
  let totalDiscount = 0;
  let hasNonStackable = false;

  for (const rule of activeRules) {
    if (hasNonStackable) break;

    if (!rule.stackable && appliedDiscounts.length > 0) continue;

    const discAmount = calculateDiscount(rule, input);
    if (discAmount === 0) continue;

    appliedDiscounts.push({
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.ruleType,
      discountType: rule.discountType,
      discountAmount: discAmount,
      description: rule.description || rule.name,
    });

    totalDiscount += discAmount;

    if (!rule.stackable) {
      hasNonStackable = true;
    }
  }

  totalDiscount = Math.round(totalDiscount * 100) / 100;
  const finalSubtotal = Math.max(0, Math.round((input.subtotal - totalDiscount) * 100) / 100);

  return { appliedDiscounts, totalDiscount, finalSubtotal };
}
