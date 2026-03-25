import { useState } from "react";
import { PageTitle } from "@/lib/accessibility";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Edit, RefreshCw, Clock, CheckSquare } from "lucide-react";
import { format } from "date-fns";

interface PlaybookStep {
  id: string;
  step_number: number;
  step_title: string;
  step_description: string;
  responsible_role: string | null;
  time_target: string | null;
  checklist: string[];
  notes: string | null;
  last_tested_at: string | null;
  created_at: string;
}

function EditStepDialog({ step, onClose }: { step: PlaybookStep; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(step.step_title);
  const [description, setDescription] = useState(step.step_description);
  const [role, setRole] = useState(step.responsible_role || "");
  const [timeTarget, setTimeTarget] = useState(step.time_target || "");
  const [checklistText, setChecklistText] = useState((step.checklist || []).join("\n"));
  const [notes, setNotes] = useState(step.notes || "");

  const mutation = useMutation({
    mutationFn: async () => {
      const checklist = checklistText.split("\n").map(s => s.trim()).filter(Boolean);
      const r = await apiRequest("PATCH", `/api/admin/incident-playbook/steps/${step.id}`, {
        stepTitle: title,
        stepDescription: description,
        responsibleRole: role || null,
        timeTarget: timeTarget || null,
        checklist,
        notes: notes || null,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/incident-playbook"] });
      toast({ title: "Step updated" });
      onClose();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Step {step.step_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Step Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} data-testid="input-step-title" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} data-testid="input-step-description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsible Role</Label>
              <Input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. CTO / Legal" data-testid="input-step-role" />
            </div>
            <div className="space-y-1.5">
              <Label>Time Target</Label>
              <Input value={timeTarget} onChange={e => setTimeTarget(e.target.value)} placeholder="e.g. Within 6 hours" data-testid="input-step-time" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Checklist Items (one per line)</Label>
            <Textarea
              value={checklistText}
              onChange={e => setChecklistText(e.target.value)}
              rows={6}
              placeholder="Each line is a checklist item"
              data-testid="input-step-checklist"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} data-testid="input-step-notes" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !title} data-testid="button-save-step">
              {mutation.isPending ? "Saving..." : "Save Step"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CERT_IN_STEP = 3;
const GDPR_STEP = 4;

export default function IncidentPlaybookPage() {
  const [editStep, setEditStep] = useState<PlaybookStep | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: steps = [], isLoading, refetch } = useQuery<PlaybookStep[]>({
    queryKey: ["/api/admin/incident-playbook"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/incident-playbook");
      return r.json();
    },
  });

  const markTestedMutation = useMutation({
    mutationFn: async (id: string) => {
      const today = new Date().toISOString().split("T")[0];
      const r = await apiRequest("PATCH", `/api/admin/incident-playbook/steps/${id}`, { lastTestedAt: today });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/incident-playbook"] });
      toast({ title: "Marked as tested today" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const isUrgent = (stepNumber: number) => stepNumber === CERT_IN_STEP || stepNumber === GDPR_STEP;

  return (
    <div className="p-6 space-y-6" data-testid="incident-playbook-page">
      <PageTitle title="Admin — Incident Playbook" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-playbook-title">Incident Response Playbook</h1>
            <p className="text-sm text-muted-foreground">
              Step-by-step procedure for the first 72 hours of a security incident. Keep this up to date.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-playbook">
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading playbook...</div>
      ) : steps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No playbook steps found.</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {steps.map(step => {
            const urgent = isUrgent(step.step_number);
            return (
              <Card
                key={step.id}
                className={urgent ? "border-amber-300 bg-amber-50/20" : ""}
                data-testid={`card-step-${step.step_number}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      {urgent && <Clock className="h-4 w-4 text-amber-600 shrink-0" />}
                      STEP {step.step_number} — {step.step_title}
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditStep(step)}
                      data-testid={`button-edit-step-${step.step_number}`}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    {step.responsible_role && (
                      <span>Role: <span className="font-medium text-foreground">{step.responsible_role}</span></span>
                    )}
                    {step.time_target && (
                      <span className={`font-medium ${urgent ? "text-amber-700" : "text-foreground"}`}>
                        {urgent && "⚠️ "}{step.time_target}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">{step.step_description}</p>
                  {Array.isArray(step.checklist) && step.checklist.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {step.checklist.map((item, idx) => (
                        <label key={idx} className="flex items-start gap-2 text-sm cursor-pointer">
                          <Checkbox className="mt-0.5 shrink-0" data-testid={`checkbox-step-${step.step_number}-item-${idx}`} />
                          <span>{item}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Last tested:{" "}
                      <span className="font-medium text-foreground" data-testid={`text-last-tested-${step.step_number}`}>
                        {step.last_tested_at ? format(new Date(step.last_tested_at), "d MMM yyyy") : "—"}
                      </span>
                    </span>
                    {step.step_number === 6 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markTestedMutation.mutate(step.id)}
                        disabled={markTestedMutation.isPending}
                        data-testid="button-mark-tested"
                      >
                        <CheckSquare className="h-3.5 w-3.5 mr-1" />
                        Mark as Tested Today
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editStep && (
        <EditStepDialog step={editStep} onClose={() => setEditStep(null)} />
      )}
    </div>
  );
}
