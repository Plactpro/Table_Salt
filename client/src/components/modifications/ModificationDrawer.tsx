import { useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

export interface FoodModification {
  spiceLevel: string | null;
  saltLevel: string | null;
  removedIngredients: string[];
  allergies: string[];
  allergyNote: string;
  allergyAcknowledged?: boolean;
  specialInstruction: string;
}

export const DEFAULT_MODIFICATION: FoodModification = {
  spiceLevel: null,
  saltLevel: null,
  removedIngredients: [],
  allergies: [],
  allergyNote: "",
  allergyAcknowledged: false,
  specialInstruction: "",
};

const SPICE_LEVELS = [
  { key: "none", label: "No Spice", color: "bg-gray-100 text-gray-700 border-gray-300 data-[selected=true]:bg-gray-700 data-[selected=true]:text-white data-[selected=true]:border-gray-700" },
  { key: "mild", label: "🌶️ Mild", color: "bg-green-50 text-green-700 border-green-300 data-[selected=true]:bg-green-600 data-[selected=true]:text-white data-[selected=true]:border-green-600" },
  { key: "medium", label: "🌶️🌶️ Medium", color: "bg-yellow-50 text-yellow-700 border-yellow-400 data-[selected=true]:bg-yellow-500 data-[selected=true]:text-white data-[selected=true]:border-yellow-500" },
  { key: "spicy", label: "🌶️🌶️🌶️ Spicy", color: "bg-orange-50 text-orange-700 border-orange-400 data-[selected=true]:bg-orange-500 data-[selected=true]:text-white data-[selected=true]:border-orange-500" },
  { key: "extra_spicy", label: "🔥 Extra", color: "bg-red-50 text-red-700 border-red-400 data-[selected=true]:bg-red-600 data-[selected=true]:text-white data-[selected=true]:border-red-600" },
];

const SALT_LEVELS = [
  { key: "less_salt", label: "🧂 Less Salt", color: "bg-sky-50 text-sky-700 border-sky-300 data-[selected=true]:bg-sky-500 data-[selected=true]:text-white data-[selected=true]:border-sky-500" },
  { key: "normal_salt", label: "Normal Salt", color: "bg-gray-50 text-gray-700 border-gray-300 data-[selected=true]:bg-gray-600 data-[selected=true]:text-white data-[selected=true]:border-gray-600" },
  { key: "extra_salt", label: "🧂 Extra Salt", color: "bg-indigo-50 text-indigo-700 border-indigo-300 data-[selected=true]:bg-indigo-500 data-[selected=true]:text-white data-[selected=true]:border-indigo-500" },
];

const COMMON_ALLERGIES = [
  "Dairy", "Gluten", "Nuts", "Peanuts", "Shellfish", "Eggs", "Soy", "Fish", "Sesame",
];

const MAX_SPECIAL_INSTRUCTION_LENGTH = 150;

interface ModificationDrawerProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  removableIngredients?: string[];
  initialModification?: FoodModification;
  onSave: (modification: FoodModification) => void;
}

function isModified(mod: FoodModification): boolean {
  return (
    mod.spiceLevel !== null ||
    mod.saltLevel !== null ||
    mod.removedIngredients.length > 0 ||
    mod.allergies.length > 0 ||
    !!mod.allergyNote.trim() ||
    !!mod.specialInstruction.trim()
  );
}

function buildSummaryChips(mod: FoodModification): string[] {
  const chips: string[] = [];
  if (mod.spiceLevel) {
    const sl = SPICE_LEVELS.find(l => l.key === mod.spiceLevel);
    if (sl) chips.push(sl.label);
  }
  if (mod.saltLevel) {
    const sl = SALT_LEVELS.find(l => l.key === mod.saltLevel);
    if (sl) chips.push(sl.label);
  }
  for (const ing of mod.removedIngredients) {
    chips.push(`➖ No ${ing}`);
  }
  for (const allergy of mod.allergies) {
    chips.push(`🚨 ${allergy}`);
  }
  return chips;
}

export function hasModification(mod: FoodModification | undefined | null): boolean {
  if (!mod) return false;
  return isModified(mod);
}

export default function ModificationDrawer({
  open,
  onClose,
  itemName,
  removableIngredients = [],
  initialModification,
  onSave,
}: ModificationDrawerProps) {
  const [mod, setMod] = useState<FoodModification>(
    initialModification || { ...DEFAULT_MODIFICATION }
  );
  const [spiceOpen, setSpiceOpen] = useState(true);
  const [saltOpen, setSaltOpen] = useState(true);
  const [removeOpen, setRemoveOpen] = useState(true);
  const [specialOpen, setSpecialOpen] = useState(true);

  const updateMod = useCallback((patch: Partial<FoodModification>) => {
    setMod(prev => ({ ...prev, ...patch }));
  }, []);

  const toggleIngredient = useCallback((ingredient: string) => {
    setMod(prev => {
      const exists = prev.removedIngredients.includes(ingredient);
      return {
        ...prev,
        removedIngredients: exists
          ? prev.removedIngredients.filter(i => i !== ingredient)
          : [...prev.removedIngredients, ingredient],
      };
    });
  }, []);

  const toggleAllergy = useCallback((allergy: string) => {
    setMod(prev => {
      const exists = prev.allergies.includes(allergy);
      return {
        ...prev,
        allergies: exists
          ? prev.allergies.filter(a => a !== allergy)
          : [...prev.allergies, allergy],
      };
    });
  }, []);

  const handleSave = () => {
    onSave({ ...mod });
    onClose();
  };

  const summaryChips = buildSummaryChips(mod);
  const hasAllergies = mod.allergies.length > 0 || !!mod.allergyNote.trim();

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto rounded-t-2xl pb-6"
        data-testid="modification-drawer"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2 text-lg">
            ✏️ Customize — {itemName}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Spice Level — collapsible */}
          <Collapsible open={spiceOpen} onOpenChange={setSpiceOpen}>
            <CollapsibleTrigger asChild>
              <button
                className="flex items-center justify-between w-full text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2"
                data-testid="collapsible-spice"
              >
                Spice Level {mod.spiceLevel && <Badge variant="secondary" className="ml-1 text-xs capitalize">{mod.spiceLevel.replace("_", " ")}</Badge>}
                {spiceOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {SPICE_LEVELS.map(level => (
                  <button
                    key={level.key}
                    data-testid={`spice-${level.key}`}
                    data-selected={mod.spiceLevel === level.key}
                    className={`px-2 py-2.5 rounded-xl text-xs font-medium border-2 transition-all ${level.color}`}
                    onClick={() => updateMod({ spiceLevel: mod.spiceLevel === level.key ? null : level.key })}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Salt Level — collapsible */}
          <Collapsible open={saltOpen} onOpenChange={setSaltOpen}>
            <CollapsibleTrigger asChild>
              <button
                className="flex items-center justify-between w-full text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2"
                data-testid="collapsible-salt"
              >
                Salt Level {mod.saltLevel && <Badge variant="secondary" className="ml-1 text-xs capitalize">{mod.saltLevel.replace("_", " ")}</Badge>}
                {saltOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {SALT_LEVELS.map(level => (
                  <button
                    key={level.key}
                    data-testid={`salt-${level.key}`}
                    data-selected={mod.saltLevel === level.key}
                    className={`px-2 py-2.5 rounded-xl text-xs font-medium border-2 transition-all ${level.color}`}
                    onClick={() => updateMod({ saltLevel: mod.saltLevel === level.key ? null : level.key })}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Remove Ingredients — collapsible */}
          {removableIngredients.length > 0 && (
            <Collapsible open={removeOpen} onOpenChange={setRemoveOpen}>
              <CollapsibleTrigger asChild>
                <button
                  className="flex items-center justify-between w-full text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2"
                  data-testid="collapsible-remove-ingredients"
                >
                  Remove Ingredients {mod.removedIngredients.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{mod.removedIngredients.length}</Badge>}
                  {removeOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {removableIngredients.map(ing => (
                    <div key={ing} className="flex items-center gap-2" data-testid={`remove-ingredient-${ing.toLowerCase().replace(/\s+/g, "-")}`}>
                      <Checkbox
                        id={`remove-${ing}`}
                        checked={mod.removedIngredients.includes(ing)}
                        onCheckedChange={() => toggleIngredient(ing)}
                        data-testid={`checkbox-remove-${ing.toLowerCase().replace(/\s+/g, "-")}`}
                      />
                      <Label htmlFor={`remove-${ing}`} className="text-sm cursor-pointer">
                        {ing}
                      </Label>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Allergy Section — NEVER collapsible, always visible, red border */}
          <div className="rounded-xl border-2 border-red-400 bg-red-50 dark:bg-red-950/30 p-4" data-testid="allergy-section">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-300 uppercase tracking-wider">
                Allergy Alert
              </span>
              <span className="text-xs text-red-500">(always check)</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {COMMON_ALLERGIES.map(allergy => (
                <button
                  key={allergy}
                  data-testid={`allergy-${allergy.toLowerCase()}`}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                    mod.allergies.includes(allergy)
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-background text-red-700 border-red-300 hover:border-red-500"
                  }`}
                  onClick={() => toggleAllergy(allergy)}
                >
                  {allergy}
                </button>
              ))}
            </div>
            <Textarea
              placeholder="Describe allergy or severity (e.g. severe nut allergy — EpiPen on hand)"
              value={mod.allergyNote}
              onChange={e => updateMod({ allergyNote: e.target.value })}
              rows={2}
              className="resize-none text-sm bg-white dark:bg-background border-red-300 focus:border-red-500"
              data-testid="input-allergy-note"
            />
          </div>

          {/* Special Instruction — collapsible */}
          <Collapsible open={specialOpen} onOpenChange={setSpecialOpen}>
            <CollapsibleTrigger asChild>
              <button
                className="flex items-center justify-between w-full text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2"
                data-testid="collapsible-special-instruction"
              >
                Special Instructions
                {specialOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1">
                <Textarea
                  placeholder="Any other requests for the chef..."
                  value={mod.specialInstruction}
                  onChange={e => {
                    if (e.target.value.length <= MAX_SPECIAL_INSTRUCTION_LENGTH) {
                      updateMod({ specialInstruction: e.target.value });
                    }
                  }}
                  rows={3}
                  className="resize-none text-sm"
                  data-testid="input-special-instruction"
                />
                <p className="text-xs text-muted-foreground mt-1 text-right" data-testid="text-char-count">
                  {mod.specialInstruction.length}/{MAX_SPECIAL_INSTRUCTION_LENGTH}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Summary chips */}
          {summaryChips.length > 0 && (
            <div className="rounded-lg bg-muted/60 px-3 py-2 space-y-1.5" data-testid="modification-summary">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</p>
              <div className="flex flex-wrap gap-1.5">
                {summaryChips.map((chip, i) => (
                  <Badge key={i} variant="outline" className="text-xs" data-testid={`chip-mod-${i}`}>
                    {chip}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Save button */}
          <div className="pt-2 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              data-testid="button-cancel-modification"
            >
              Cancel
            </Button>
            <Button
              className="flex-1 font-semibold"
              onClick={handleSave}
              data-testid="button-save-modification"
            >
              Save Customization
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
