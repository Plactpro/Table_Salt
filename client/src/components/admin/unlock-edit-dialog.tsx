import { useState } from "react";
import { useImpersonation } from "@/lib/impersonation-context";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Unlock } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UnlockEditDialog({ open, onOpenChange }: Props) {
  const { tenantName, unlockEditMode } = useImpersonation();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUnlock = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await unlockEditMode(reason.trim());
      toast({ title: "Edit mode unlocked", description: "You can now make changes. Every action is logged." });
      onOpenChange(false);
      setReason("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to unlock edit mode";
      toast({ title: "Failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-unlock-edit">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5 text-orange-500" />
            Unlock Edit Mode
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
            <p className="text-sm text-orange-800">
              You will be able to make changes to{" "}
              <strong>{tenantName ?? "this tenant"}'s</strong> account. Every change will be
              permanently logged and visible to the tenant.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unlock-reason">Reason for needing edit access:</Label>
            <Input
              id="unlock-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tenant requested help fixing menu price..."
              data-testid="input-unlock-reason"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-unlock"
          >
            Cancel — Stay Read Only
          </Button>
          <Button
            onClick={handleUnlock}
            disabled={!reason.trim() || loading}
            className="bg-orange-600 hover:bg-orange-700 text-white"
            data-testid="button-confirm-unlock"
          >
            {loading ? "Unlocking..." : "Unlock Edit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
