import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmLeaveDialogProps {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}

export function ConfirmLeaveDialog({ open, onStay, onLeave }: ConfirmLeaveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onStay(); }}>
      <DialogContent data-testid="dialog-confirm-leave">
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            You have unsaved changes. If you leave now, your changes will be lost.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onStay} data-testid="button-stay">
            Stay
          </Button>
          <Button
            variant="destructive"
            onClick={onLeave}
            data-testid="button-leave"
          >
            Leave anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
