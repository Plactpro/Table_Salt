import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Eye, Lock, Pencil, Info } from "lucide-react";

const PRESET_REASONS = [
  "Customer reported a bug",
  "Billing dispute investigation",
  "Technical support request",
  "Subscription verification",
  "Fraud investigation",
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  tenantName: string;
  onSuccess?: () => void;
}

export default function ImpersonationStartDialog({ open, onOpenChange, userId, tenantName, onSuccess }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [reasonType, setReasonType] = useState<string>("Customer reported a bug");
  const [customReason, setCustomReason] = useState("");
  const [supportTicketId, setSupportTicketId] = useState("");
  const [accessMode, setAccessMode] = useState<"READ_ONLY" | "EDIT">("READ_ONLY");
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState("30");

  const isOther = reasonType === "Other";
  const effectiveReason = isOther ? customReason.trim() : reasonType;
  const canSubmit = effectiveReason.length > 0;

  const startMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/impersonate/${userId}`, {
        reason: effectiveReason,
        accessMode,
        supportTicketId: supportTicketId.trim() || undefined,
        sessionTimeoutMinutes: parseInt(sessionTimeoutMinutes, 10),
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation/status"] });
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      } else {
        navigate("/");
      }
    },
    onError: (e: Error) => {
      toast({ title: "Failed to start session", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!canSubmit) return;
    startMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-impersonation-start">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-amber-600" />
            Start Support Session
          </DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Tenant: <span className="font-medium text-slate-800">{tenantName}</span>
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Access Reason */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Access Reason <span className="text-red-500">*</span>
            </Label>
            <RadioGroup
              value={reasonType}
              onValueChange={setReasonType}
              data-testid="radio-group-reason"
            >
              {PRESET_REASONS.map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <RadioGroupItem value={r} id={`reason-${r}`} data-testid={`radio-reason-${r.replace(/\s+/g, "-").toLowerCase()}`} />
                  <Label htmlFor={`reason-${r}`} className="text-sm font-normal cursor-pointer">{r}</Label>
                </div>
              ))}
              <div className="flex items-start gap-2">
                <RadioGroupItem value="Other" id="reason-other" className="mt-0.5" data-testid="radio-reason-other" />
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="reason-other" className="text-sm font-normal cursor-pointer">Other:</Label>
                  {isOther && (
                    <Input
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="Describe the reason..."
                      autoFocus
                      data-testid="input-custom-reason"
                    />
                  )}
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Support Ticket ID */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Support Ticket ID <span className="text-slate-400">(optional)</span>
            </Label>
            <Input
              value={supportTicketId}
              onChange={(e) => setSupportTicketId(e.target.value)}
              placeholder="ST-2026-0451"
              data-testid="input-support-ticket-id"
            />
          </div>

          {/* Access Mode */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Access Mode
            </Label>
            <RadioGroup
              value={accessMode}
              onValueChange={(v) => setAccessMode(v as "READ_ONLY" | "EDIT")}
              data-testid="radio-group-access-mode"
            >
              <div
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  accessMode === "READ_ONLY" ? "border-emerald-400 bg-emerald-50" : "border-slate-200"
                }`}
                onClick={() => setAccessMode("READ_ONLY")}
              >
                <RadioGroupItem value="READ_ONLY" id="mode-readonly" className="mt-0.5" data-testid="radio-mode-readonly" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-sm font-medium">Read Only</span>
                    <span className="text-xs text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">recommended</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">View everything · No changes allowed</p>
                </div>
              </div>
              <div
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  accessMode === "EDIT" ? "border-orange-400 bg-orange-50" : "border-slate-200"
                }`}
                onClick={() => setAccessMode("EDIT")}
              >
                <RadioGroupItem value="EDIT" id="mode-edit" className="mt-0.5" data-testid="radio-mode-edit" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Pencil className="h-3.5 w-3.5 text-orange-600" />
                    <span className="text-sm font-medium">Read + Edit</span>
                    <AlertTriangle className="h-3 w-3 text-orange-500" />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Full access · Every change logged individually</p>
                  <p className="text-xs text-orange-600 mt-0.5">⚠ Only when tenant requested direct help</p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Session Timeout */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Session Timeout
            </Label>
            <Select value={sessionTimeoutMinutes} onValueChange={setSessionTimeoutMinutes}>
              <SelectTrigger className="w-48" data-testid="select-session-timeout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
                <SelectItem value="120">120 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Info notice */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              This session will be logged and visible to the tenant in their account access log.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-impersonation"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || startMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            data-testid="button-start-impersonation-session"
          >
            {startMutation.isPending ? "Starting..." : "Start Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
