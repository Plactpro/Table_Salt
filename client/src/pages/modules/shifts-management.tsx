import { PageTitle } from "@/lib/accessibility";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Edit2, Trash2, Clock, Sun, Sunset, Moon } from "lucide-react";
import type { Shift } from "@shared/schema";

const SHIFT_PRESETS = [
  { name: "Morning", startTime: "06:00", endTime: "14:00", icon: Sun, color: "text-amber-500" },
  { name: "Evening", startTime: "14:00", endTime: "22:00", icon: Sunset, color: "text-orange-500" },
  { name: "Night", startTime: "22:00", endTime: "06:00", icon: Moon, color: "text-indigo-500" },
];

function shiftIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("morning") || lower.includes("day")) return <Sun className="h-5 w-5 text-amber-500" />;
  if (lower.includes("evening") || lower.includes("afternoon")) return <Sunset className="h-5 w-5 text-orange-500" />;
  if (lower.includes("night") || lower.includes("graveyard")) return <Moon className="h-5 w-5 text-indigo-500" />;
  return <Clock className="h-5 w-5 text-primary" />;
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const disp = hour % 12 || 12;
  return `${disp}:${m} ${ampm}`;
}

interface ShiftFormData {
  name: string;
  startTime: string;
  endTime: string;
  active: boolean;
}

const EMPTY_FORM: ShiftFormData = { name: "", startTime: "", endTime: "", active: true };

export default function ShiftsManagement() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ShiftFormData>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: shifts = [], isLoading } = useQuery<Shift[]>({
    queryKey: ["/api/shifts"],
    queryFn: () => apiRequest("GET", "/api/shifts").then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: ShiftFormData) => apiRequest("POST", "/api/shifts", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({ title: "Shift created" });
      closeForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ShiftFormData> }) =>
      apiRequest("PATCH", `/api/shifts/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({ title: "Shift updated" });
      closeForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/shifts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({ title: "Shift deleted" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleActive = (shift: Shift) => {
    updateMutation.mutate({ id: shift.id, data: { active: !shift.active } });
  };

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(shift: Shift) {
    setEditingId(shift.id);
    setForm({ name: shift.name, startTime: shift.startTime, endTime: shift.endTime, active: shift.active ?? true });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function applyPreset(preset: typeof SHIFT_PRESETS[0]) {
    setForm(f => ({ ...f, name: preset.name, startTime: preset.startTime, endTime: preset.endTime }));
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (!form.startTime || !form.endTime) { toast({ title: "Start and end times are required", variant: "destructive" }); return; }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const activeShifts = shifts.filter(s => s.active);
  const inactiveShifts = shifts.filter(s => !s.active);

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  function isCurrentShift(shift: Shift) {
    const { startTime, endTime } = shift;
    if (startTime < endTime) return currentTime >= startTime && currentTime < endTime;
    return currentTime >= startTime || currentTime < endTime;
  }

  return (
    <div className="space-y-6" data-testid="shifts-management">
      <PageTitle title="Shifts" />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Shift Management</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Define work shifts for auto-tagging KDS stock movements</p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-shift">
          <Plus className="h-4 w-4 mr-1.5" />Add Shift
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading shifts…</div>
      ) : shifts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No shifts configured</p>
            <p className="text-sm mt-1">Add shifts to automatically tag stock movements to the correct shift period.</p>
            <Button className="mt-4" onClick={openCreate} data-testid="button-add-first-shift">Add Your First Shift</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activeShifts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Active Shifts</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeShifts.map(shift => {
                  const current = isCurrentShift(shift);
                  return (
                    <Card key={shift.id} className={`relative ${current ? "ring-2 ring-primary" : ""}`} data-testid={`card-shift-${shift.id}`}>
                      {current && (
                        <div className="absolute top-3 right-3">
                          <Badge className="bg-primary text-primary-foreground text-xs animate-pulse">● Now</Badge>
                        </div>
                      )}
                      <CardContent className="pt-5 pb-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">{shiftIcon(shift.name)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate" data-testid={`text-shift-name-${shift.id}`}>{shift.name}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {formatTime(shift.startTime)} – {formatTime(shift.endTime)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-4 pt-3 border-t">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={shift.active ?? true}
                              onCheckedChange={() => toggleActive(shift)}
                              data-testid={`toggle-shift-active-${shift.id}`}
                            />
                            <span className="text-sm text-muted-foreground">Active</span>
                          </div>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(shift)} data-testid={`button-edit-shift-${shift.id}`} aria-label={`Edit shift ${shift.name}`}>
                              <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(shift.id)} data-testid={`button-delete-shift-${shift.id}`} aria-label={`Delete shift ${shift.name}`}>
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {inactiveShifts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Inactive Shifts</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                {inactiveShifts.map(shift => (
                  <Card key={shift.id} data-testid={`card-shift-${shift.id}`}>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{shiftIcon(shift.name)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{shift.name}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {formatTime(shift.startTime)} – {formatTime(shift.endTime)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-4 pt-3 border-t">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={false}
                            onCheckedChange={() => toggleActive(shift)}
                            data-testid={`toggle-shift-active-${shift.id}`}
                          />
                          <span className="text-sm text-muted-foreground">Inactive</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(shift)} aria-label={`Edit shift ${shift.name}`}>
                            <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(shift.id)} aria-label={`Delete shift ${shift.name}`}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={v => { if (!v) closeForm(); }}>
        <DialogContent className="max-w-md" data-testid="dialog-shift-form">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Shift" : "New Shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editingId && (
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Quick Presets</Label>
                <div className="flex gap-2 flex-wrap">
                  {SHIFT_PRESETS.map(p => (
                    <Button key={p.name} variant="outline" size="sm" onClick={() => applyPreset(p)} data-testid={`button-preset-${p.name.toLowerCase()}`}>
                      <p.icon className={`h-3.5 w-3.5 mr-1 ${p.color}`} />{p.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="shift-name">Shift Name</Label>
              <Input
                id="shift-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Morning, Lunch, Night"
                data-testid="input-shift-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="shift-start">Start Time</Label>
                <Input
                  id="shift-start"
                  type="time"
                  value={form.startTime}
                  onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  data-testid="input-shift-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift-end">End Time</Label>
                <Input
                  id="shift-end"
                  type="time"
                  value={form.endTime}
                  onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  data-testid="input-shift-end"
                />
              </div>
            </div>
            {form.startTime && form.endTime && (
              <p className="text-xs text-muted-foreground">
                {form.startTime > form.endTime ? "⚠ Spans midnight (e.g. 22:00 → 06:00)" : `Duration: ${
                  (() => {
                    const [sh, sm] = form.startTime.split(":").map(Number);
                    const [eh, em] = form.endTime.split(":").map(Number);
                    let mins = (eh * 60 + em) - (sh * 60 + sm);
                    if (mins < 0) mins += 1440;
                    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
                  })()
                }`}
              </p>
            )}
            {editingId && (
              <div className="flex items-center gap-3 pt-1">
                <Switch
                  checked={form.active}
                  onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
                  data-testid="input-shift-active"
                />
                <Label>Active</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm} data-testid="button-cancel-shift">Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-shift">
              {editingId ? "Save Changes" : "Create Shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shift</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the shift. Existing stock movements tagged to this shift will retain their shiftId reference but the shift name will no longer resolve.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-shift">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-shift"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
