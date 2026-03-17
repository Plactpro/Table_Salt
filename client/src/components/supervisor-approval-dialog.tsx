import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SupervisorApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: string;
  actionLabel: string;
  onApproved: (supervisorId: string, credentials: { username: string; password: string }) => void;
}

export default function SupervisorApprovalDialog({
  open,
  onOpenChange,
  action,
  actionLabel,
  onApproved,
}: SupervisorApprovalDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/supervisor/verify", { username, password, action });
      const data = await res.json();
      if (data.verified) {
        onApproved(data.supervisor.id, { username, password });
        setUsername("");
        setPassword("");
        onOpenChange(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="supervisor-approval-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
            Supervisor Approval Required
          </DialogTitle>
          <DialogDescription>
            The action "{actionLabel}" requires supervisor authorization. Please enter supervisor credentials to proceed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="supervisor-username">Supervisor Username</Label>
            <Input
              id="supervisor-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter supervisor username"
              autoComplete="off"
              data-testid="input-supervisor-username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supervisor-password">Password</Label>
            <Input
              id="supervisor-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="off"
              data-testid="input-supervisor-password"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600" data-testid="text-supervisor-error">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-approval">
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !username || !password} data-testid="button-verify-supervisor">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Verify & Approve
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
