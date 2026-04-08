import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import type { FoodModification } from "./ModificationDrawer";

interface KdsModificationDisplayProps {
  modification: FoodModification;
  onAllergyAcknowledge?: () => void;
  acknowledged?: boolean;
}

function SpiceChip({ level }: { level: string }) {
  const labels: Record<string, string> = {
    NO_SPICE: "No Spice",
    MILD: "🌶️ Mild",
    MEDIUM: "🌶️🌶️ Medium",
    SPICY: "🌶️🌶️🌶️ Spicy",
    EXTRA_HOT: "🔥 Extra Spicy",
  };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-800 border border-orange-300" data-testid={`kds-spice-${level}`}>
      {labels[level] ?? level}
    </span>
  );
}

function SaltChip({ level }: { level: string }) {
  const labels: Record<string, string> = {
    LESS: "🧂 Less Salt",
    NORMAL: "Normal Salt",
    EXTRA: "🧂+ Extra Salt",
  };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-800 border border-sky-300" data-testid={`kds-salt-${level}`}>
      {labels[level] ?? level}
    </span>
  );
}

function RemovalChip({ ingredient }: { ingredient: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-300 line-through" data-testid={`kds-remove-${ingredient.toLowerCase().replace(/\s+/g, "-")}`}>
      ➖ {ingredient}
    </span>
  );
}

function NoteChip({ note }: { note: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-yellow-100 text-yellow-800 border border-yellow-300" data-testid="kds-special-note">
      📝 {note}
    </span>
  );
}

function AllergyAlertBox({
  allergyFlags,
  allergyDetails,
  acknowledged,
  onAcknowledge,
}: {
  allergyFlags: string[];
  allergyDetails: string;
  acknowledged: boolean;
  onAcknowledge?: () => void;
}) {
  return (
    <motion.div
      animate={!acknowledged ? {
        boxShadow: [
          "0 0 0 0 rgba(239,68,68,0.4)",
          "0 0 0 6px rgba(239,68,68,0)",
          "0 0 0 0 rgba(239,68,68,0)",
        ],
      } : {}}
      transition={{ duration: 1.5, repeat: Infinity }}
      className={`rounded-lg border-2 p-2.5 mt-1.5 ${
        acknowledged
          ? "border-green-500 bg-green-50 dark:bg-green-950/30"
          : "border-red-500 bg-red-50 dark:bg-red-950/30"
      }`}
      data-testid="kds-allergy-box"
    >
      <div className="flex items-start gap-2 mb-1.5">
        <AlertTriangle className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${acknowledged ? "text-green-600" : "text-red-600"}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-bold uppercase tracking-wider ${acknowledged ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
            {acknowledged ? "Allergy Acknowledged ✓" : "⚠ ALLERGY ALERT"}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {allergyFlags.map(a => (
              <Badge key={a} className="text-[10px] bg-red-600 text-white px-1.5 py-0 border-0" data-testid={`kds-allergy-${a.toLowerCase()}`}>
                {a}
              </Badge>
            ))}
          </div>
          {allergyDetails && (
            <p className="text-[10px] text-red-700 dark:text-red-300 mt-1 italic">{allergyDetails}</p>
          )}
        </div>
      </div>
      {!acknowledged && onAcknowledge && (
        <Button
          size="sm"
          className="w-full h-7 text-[11px] font-bold bg-red-600 hover:bg-red-700 text-white mt-1"
          onClick={onAcknowledge}
          data-testid="button-allergy-acknowledge"
        >
          I UNDERSTAND ✓
        </Button>
      )}
      {acknowledged && (
        <div className="flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 font-semibold mt-0.5" data-testid="text-allergy-acknowledged">
          <CheckCircle2 className="h-3 w-3" />
          Chef acknowledged
        </div>
      )}
    </motion.div>
  );
}

export default function KdsModificationDisplay({
  modification,
  onAllergyAcknowledge,
  acknowledged = false,
}: KdsModificationDisplayProps) {
  const hasAnything =
    modification.spiceLevel ||
    modification.saltLevel ||
    modification.removedIngredients.length > 0 ||
    modification.specialNotes?.trim() ||
    modification.allergyFlags.length > 0 ||
    modification.allergyDetails?.trim();

  if (!hasAnything) return null;

  const hasAllergy = modification.allergyFlags.length > 0 || !!modification.allergyDetails?.trim();

  return (
    <div className="mt-1 space-y-1" data-testid="kds-modification-display">
      <div className="flex items-center gap-1 mb-1">
        <Badge className="text-[10px] bg-violet-600 text-white border-0 px-1.5 py-0 h-4" data-testid="kds-mod-badge">
          MOD
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1">
        {modification.spiceLevel && <SpiceChip level={modification.spiceLevel} />}
        {modification.saltLevel && <SaltChip level={modification.saltLevel} />}
        {modification.removedIngredients.map(ing => (
          <RemovalChip key={ing} ingredient={ing} />
        ))}
      </div>

      {modification.specialNotes?.trim() && (
        <NoteChip note={modification.specialNotes.trim()} />
      )}

      {hasAllergy && (
        <AllergyAlertBox
          allergyFlags={modification.allergyFlags}
          allergyDetails={modification.allergyDetails || ""}
          acknowledged={acknowledged}
          onAcknowledge={onAllergyAcknowledge}
        />
      )}
    </div>
  );
}

export { AllergyAlertBox };
