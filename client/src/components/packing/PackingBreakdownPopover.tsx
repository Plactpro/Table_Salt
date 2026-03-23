import { useState } from "react";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@shared/currency";
import { useAuth } from "@/lib/auth";

export interface PackingBreakdownItem {
  name: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface PackingChargeResult {
  applicable: boolean;
  amount: number;
  taxAmount: number;
  total: number;
  label: string;
  breakdown: PackingBreakdownItem[];
  exemptedItems?: { name: string; quantity: number }[];
}

interface PackingBreakdownPopoverProps {
  result: PackingChargeResult;
  className?: string;
}

export function PackingBreakdownPopover({ result, className }: PackingBreakdownPopoverProps) {
  const { user } = useAuth();
  const currency = user?.tenant?.currency || "USD";
  const currencyOpts = {
    position: (user?.tenant?.currencyPosition || "before") as "before" | "after",
    decimals: user?.tenant?.currencyDecimals ?? 2,
  };
  const fmt = (val: number) => formatCurrency(val, currency, currencyOpts);

  if (!result.applicable || result.breakdown.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="link"
          size="sm"
          className={`h-auto p-0 text-xs text-blue-600 underline ${className || ""}`}
          data-testid="button-packing-breakdown"
        >
          View breakdown
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" data-testid="popover-packing-breakdown">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-sm">
            <Package className="h-4 w-4 text-amber-600" />
            <span>{result.label} Breakdown ({fmt(result.total)})</span>
          </div>
          <Separator />
          <div className="space-y-1">
            {result.breakdown.map((item, i) => (
              <div key={i} className="flex justify-between text-xs" data-testid={`row-breakdown-${i}`}>
                <span className="text-muted-foreground">{item.name} × {item.quantity} @ {fmt(item.rate)}</span>
                <span className="font-medium">{fmt(item.amount)}</span>
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex justify-between text-sm font-bold" data-testid="text-breakdown-total">
            <span>Total</span>
            <span>{fmt(result.total)}</span>
          </div>
          {result.exemptedItems && result.exemptedItems.length > 0 && (
            <div className="text-xs text-muted-foreground pt-1">
              {result.exemptedItems.map((e, i) => (
                <div key={i}>{e.name} × {e.quantity} — exempt</div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
