import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface ModifierOption {
  id: string;
  name: string;
  priceAdjustment: number;
  isDefault: boolean;
}

interface ModifierGroup {
  id: string;
  name: string;
  selectionType: "single" | "multi";
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjustment: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItem: { id: string; name: string; price: number | string } | null;
  onConfirm: (modifiers: SelectedModifier[], totalAdjustment: number) => void;
  currency?: string;
}

export default function ModifierSelectionDialog({
  open, onOpenChange, menuItem, onConfirm, currency = "AED",
}: Props) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!menuItem?.id || !open) return;
    setIsLoading(true);
    setFetched(false);
    fetch(`/api/menu-items/${menuItem.id}/modifier-groups`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((groups: ModifierGroup[]) => {
        setModifierGroups(groups);
        const defaults: Record<string, string[]> = {};
        groups.forEach(g => {
          const def = g.options.find(o => o.isDefault);
          if (def) defaults[g.id] = [def.id];
        });
        setSelections(defaults);
        setFetched(true);
        if (groups.length === 0) {
          onConfirm([], 0);
          onOpenChange(false);
        }
      })
      .catch(() => { setModifierGroups([]); setFetched(true); onConfirm([], 0); onOpenChange(false); })
      .finally(() => setIsLoading(false));
  }, [menuItem?.id, open]);

  useEffect(() => {
    if (!open) { setSelections({}); setModifierGroups([]); setFetched(false); }
  }, [open]);

  const totalAdjustment = modifierGroups.reduce((total, group) => {
    const selectedIds = selections[group.id] ?? [];
    return total + group.options.filter(o => selectedIds.includes(o.id)).reduce((s, o) => s + o.priceAdjustment, 0);
  }, 0);

  const allRequiredSelected = modifierGroups.filter(g => g.isRequired).every(g => (selections[g.id] ?? []).length > 0);

  const handleSingleSelect = (groupId: string, optionId: string) => {
    setSelections(prev => ({ ...prev, [groupId]: [optionId] }));
  };

  const handleMultiSelect = (groupId: string, optionId: string, checked: boolean, max: number) => {
    setSelections(prev => {
      const current = prev[groupId] ?? [];
      if (checked) {
        if (current.length >= max) return prev;
        return { ...prev, [groupId]: [...current, optionId] };
      }
      return { ...prev, [groupId]: current.filter(id => id !== optionId) };
    });
  };

  const handleConfirm = () => {
    const mods: SelectedModifier[] = [];
    modifierGroups.forEach(group => {
      (selections[group.id] ?? []).forEach(optionId => {
        const option = group.options.find(o => o.id === optionId);
        if (option) mods.push({ groupId: group.id, groupName: group.name, optionId: option.id, optionName: option.name, priceAdjustment: option.priceAdjustment });
      });
    });
    onConfirm(mods, totalAdjustment);
    onOpenChange(false);
  };

  const basePrice = parseFloat(String(menuItem?.price ?? 0));
  const finalPrice = basePrice + totalAdjustment;

  if (!open || (!isLoading && fetched && modifierGroups.length === 0)) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{menuItem?.name}</span>
            <div className="text-right">
              <div className="text-sm text-muted-foreground font-normal">Base: {currency} {basePrice.toFixed(2)}</div>
              {totalAdjustment !== 0 && <div className="text-sm font-normal text-green-600">+{currency} {totalAdjustment.toFixed(2)}</div>}
              <div className="text-lg font-bold">{currency} {finalPrice.toFixed(2)}</div>
            </div>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-5 py-2">
            {modifierGroups.map(group => (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-sm">{group.name}</span>
                  {group.isRequired && <Badge variant="destructive" className="text-xs">Required</Badge>}
                  {group.selectionType === "multi" && <Badge variant="outline" className="text-xs">Up to {group.maxSelections}</Badge>}
                </div>
                {group.selectionType === "single" ? (
                  <RadioGroup value={selections[group.id]?.[0] ?? ""} onValueChange={val => handleSingleSelect(group.id, val)} className="space-y-1">
                    {group.options.map(option => (
                      <div key={option.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent cursor-pointer" onClick={() => handleSingleSelect(group.id, option.id)}>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value={option.id} id={`${group.id}-${option.id}`} />
                          <Label htmlFor={`${group.id}-${option.id}`} className="cursor-pointer">{option.name}</Label>
                        </div>
                        {option.priceAdjustment !== 0 && <span className="text-sm text-muted-foreground">+{currency} {option.priceAdjustment.toFixed(2)}</span>}
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  <div className="space-y-1">
                    {group.options.map(option => {
                      const isChecked = (selections[group.id] ?? []).includes(option.id);
                      return (
                        <div key={option.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent cursor-pointer" onClick={() => handleMultiSelect(group.id, option.id, !isChecked, group.maxSelections)}>
                          <div className="flex items-center gap-2">
                            <Checkbox id={`${group.id}-${option.id}`} checked={isChecked} onCheckedChange={checked => handleMultiSelect(group.id, option.id, !!checked, group.maxSelections)} onClick={e => e.stopPropagation()} />
                            <Label htmlFor={`${group.id}-${option.id}`} className="cursor-pointer">{option.name}</Label>
                          </div>
                          {option.priceAdjustment !== 0 && <span className="text-sm text-muted-foreground">+{currency} {option.priceAdjustment.toFixed(2)}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!allRequiredSelected || isLoading}>
            Add to Order{totalAdjustment > 0 && <span className="ml-1 opacity-80">({currency} {finalPrice.toFixed(2)})</span>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
