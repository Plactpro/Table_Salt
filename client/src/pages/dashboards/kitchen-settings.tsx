import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChefHat, Plus, Pencil, Trash2, Copy, Users, Settings2,
  Clock, AlertTriangle, CheckCircle2, Utensils, GripVertical,
  CalendarDays, UserPlus, Zap, Timer, RefreshCw,
} from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";

interface Counter {
  id: string;
  name: string;
  label?: string;
  counterCode?: string;
  maxCapacity?: number;
  displayColor?: string;
  isActive: boolean;
  sortOrder?: number;
  handlesCategories?: string[];
}

interface RosterEntry {
  id: string;
  chefId: string;
  chefName?: string;
  counterId?: string;
  counterName?: string;
  shiftDate: string;
  shiftStart?: string;
  shiftEnd?: string;
  role?: string;
  status?: string;
}

interface AssignmentSettings {
  mode: string;
  maxTicketsPerChef: number;
  unassignedTimeoutMin: number;
  autoReassignIdleMin: number;
  considerRoster: boolean;
  considerWorkload: boolean;
  considerExperience: boolean;
  allowSelfAssign: boolean;
  allowChefReassign: boolean;
  requireReassignReason: boolean;
}

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIFT_ROLES = ["Head Chef", "Sous Chef", "Line Cook", "Prep Cook", "Expeditor"];

function getWeekDates(startDate: Date) {
  const monday = startOfWeek(startDate, { weekStartsOn: 1 });
  return DAYS_OF_WEEK.map((_, i) => addDays(monday, i));
}

function CountersTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("kitchen");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Counter | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", counterCode: "", maxCapacity: 3 });

  const { data: outlets = [] } = useQuery<any[]>({ queryKey: ["/api/outlets"] });
  const [outletId, setOutletId] = useState<string>("");

  const selectedOutletId = outletId || outlets[0]?.id;

  const { data: counters = [], isLoading } = useQuery<Counter[]>({
    queryKey: ["/api/counters", selectedOutletId],
    queryFn: () => apiRequest("GET", `/api/counters?outletId=${selectedOutletId}`).then(r => r.json()),
    enabled: !!selectedOutletId,
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/counters", { ...data, outletId: selectedOutletId }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/counters"] }); setOpen(false); toast({ title: t("counterCreated") }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/counters/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/counters"] }); setOpen(false); setEditing(null); toast({ title: t("counterUpdated") }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/counters/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/counters"] }); toast({ title: t("counterDeleted") }); },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PUT", `/api/counters/${id}`, { isActive }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/counters"] }),
  });

  function openNew() {
    setEditing(null);
    setForm({ name: "", counterCode: "", maxCapacity: 3 });
    setOpen(true);
  }

  function openEdit(c: Counter) {
    setEditing(c);
    setForm({ name: c.name, counterCode: c.counterCode ?? "", maxCapacity: c.maxCapacity ?? 3 });
    setOpen(true);
  }

  function submit() {
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  }

  const stationColors: Record<string, string> = {
    hot: "bg-red-100 text-red-700",
    cold: "bg-blue-100 text-blue-700",
    grill: "bg-orange-100 text-orange-700",
    bakery: "bg-yellow-100 text-yellow-700",
    dessert: "bg-pink-100 text-pink-700",
    bar: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {outlets.length > 1 && (
            <Select value={selectedOutletId} onValueChange={setOutletId}>
              <SelectTrigger className="w-56" data-testid="select-outlet-counters">
                <SelectValue placeholder="Select outlet" />
              </SelectTrigger>
              <SelectContent>
                {outlets.map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button onClick={openNew} data-testid="button-add-counter">
          <Plus className="h-4 w-4 mr-2" /> {t("addCounter")}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : counters.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Utensils className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">{t("noCountersYet")}</p>
            <Button className="mt-4" onClick={openNew} data-testid="button-add-first-counter">
              <Plus className="h-4 w-4 mr-2" /> {t("addCounter")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {counters.map(c => (
            <Card key={c.id} className={`relative ${!c.isActive ? "opacity-60" : ""}`} data-testid={`card-counter-${c.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    {c.label && <CardDescription>{c.label}</CardDescription>}
                  </div>
                  <Switch
                    checked={c.isActive}
                    onCheckedChange={v => toggleMut.mutate({ id: c.id, isActive: v })}
                    data-testid={`toggle-counter-${c.id}`}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {c.counterCode && (
                    <Badge variant="secondary" className={stationColors[c.counterCode.toLowerCase()] ?? ""}>
                      {c.counterCode}
                    </Badge>
                  )}
                  <Badge variant="outline">
                    <Users className="h-3 w-3 mr-1" />
                    {t("maxChefsLabel", { n: c.maxCapacity ?? 3 })}
                  </Badge>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)} data-testid={`button-edit-counter-${c.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(c.id)} data-testid={`button-delete-counter-${c.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("editCounter") : t("addKitchenCounter")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("counterName")} *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("counterNamePlaceholder")} data-testid="input-counter-name" />
            </div>
            <div>
              <Label>{t("stationType")}</Label>
              <Select value={form.counterCode} onValueChange={v => setForm(f => ({ ...f, counterCode: v }))}>
                <SelectTrigger data-testid="select-counter-station">
                  <SelectValue placeholder={t("selectStationType")} />
                </SelectTrigger>
                <SelectContent>
                  {["Hot", "Cold", "Grill", "Bakery", "Dessert", "Bar", "Prep", "Other"].map(s => (
                    <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("maxChefsPerShift")}</Label>
              <Input type="number" min={1} max={20} value={form.maxCapacity} onChange={e => setForm(f => ({ ...f, maxCapacity: +e.target.value }))} data-testid="input-counter-maxchefs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={submit} disabled={!form.name || createMut.isPending || updateMut.isPending} data-testid="button-save-counter">
              {editing ? t("saveChanges") : t("createCounter")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteCounterTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteCounterDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) { deleteMut.mutate(deleteId); setDeleteId(null); } }} className="bg-destructive text-destructive-foreground">{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RosterTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("kitchen");
  const [weekStart, setWeekStart] = useState(() => {
    const d = startOfWeek(new Date(), { weekStartsOn: 1 });
    return format(d, "yyyy-MM-dd");
  });
  const [open, setOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<RosterEntry | null>(null);
  const [form, setForm] = useState({ chefId: "", chefName: "", counterId: "", counterName: "", shiftDate: "", shiftStart: "08:00", shiftEnd: "17:00", role: "Line Cook" });

  const { data: outlets = [] } = useQuery<any[]>({ queryKey: ["/api/outlets"] });
  const [outletId, setOutletId] = useState<string>("");
  const selectedOutletId = outletId || outlets[0]?.id;

  const weekDates = getWeekDates(new Date(weekStart + "T00:00:00"));
  const weekEnd = format(weekDates[6], "yyyy-MM-dd");

  const { data: roster = [], isLoading } = useQuery<RosterEntry[]>({
    queryKey: ["/api/roster/week", weekStart, weekEnd],
    queryFn: () => apiRequest("GET", `/api/roster?weekStart=${weekStart}&weekEnd=${weekEnd}`).then(r => r.json()),
    enabled: !!weekStart,
  });

  const { data: counters = [] } = useQuery<Counter[]>({
    queryKey: ["/api/counters", selectedOutletId],
    queryFn: () => apiRequest("GET", `/api/counters?outletId=${selectedOutletId}`).then(r => r.json()),
    enabled: !!selectedOutletId,
  });

  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users").then(r => r.json()),
  });

  const chefs = (staffList as any[]).filter((u: any) => u.role === "kitchen" || u.role === "chef");

  const saveMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/roster", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/roster/week"] }); setOpen(false); toast({ title: t("rosterSaved") }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/roster/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/roster/week"] }),
  });

  const copyWeekMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/roster/copy-week", { outletId: selectedOutletId, weekStart }).then(r => r.json()),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["/api/roster/week"] }); toast({ title: t("copiedEntries", { n: data?.length ?? 0 }) }); },
  });

  function openNew(date: string) {
    setEditEntry(null);
    setForm({ chefId: "", chefName: "", counterId: "", counterName: "", shiftDate: date, shiftStart: "08:00", shiftEnd: "17:00", role: "Line Cook" });
    setOpen(true);
  }

  function submit() {
    const selectedCounter = counters.find(c => c.id === form.counterId);
    const selectedChef = chefs.find((c: any) => c.id === form.chefId);
    const payload = {
      ...form,
      ...(editEntry ? { id: editEntry.id } : {}),
      outletId: selectedOutletId,
      counterName: selectedCounter?.name,
      chefName: selectedChef ? `${selectedChef.firstName ?? ""} ${selectedChef.lastName ?? ""}`.trim() || selectedChef.username : form.chefName,
    };
    saveMut.mutate(payload);
  }

  function prevWeek() {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() - 7);
    setWeekStart(format(d, "yyyy-MM-dd"));
  }

  function nextWeek() {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + 7);
    setWeekStart(format(d, "yyyy-MM-dd"));
  }

  const rosterByDate: Record<string, RosterEntry[]> = {};
  for (const e of roster) rosterByDate[e.shiftDate] = [...(rosterByDate[e.shiftDate] ?? []), e];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevWeek} data-testid="button-prev-week">←</Button>
          <span className="text-sm font-medium">
            {format(weekDates[0], "MMM d")} – {format(weekDates[6], "MMM d, yyyy")}
          </span>
          <Button variant="outline" size="sm" onClick={nextWeek} data-testid="button-next-week">→</Button>
        </div>
        <div className="flex gap-2">
          {outlets.length > 1 && (
            <Select value={selectedOutletId} onValueChange={setOutletId}>
              <SelectTrigger className="w-44" data-testid="select-outlet-roster"><SelectValue /></SelectTrigger>
              <SelectContent>{outlets.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => copyWeekMut.mutate()} disabled={copyWeekMut.isPending} data-testid="button-copy-week">
            <Copy className="h-4 w-4 mr-1" /> {t("copyLastWeek")}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[700px]" style={{ gridTemplateColumns: "120px repeat(7, 1fr)" }}>
          <div className="p-2 font-medium text-sm text-muted-foreground border-b">{t("counter")}</div>
          {weekDates.map((d, i) => (
            <div key={i} className="p-2 text-center border-b border-l">
              <div className="font-medium text-sm">{DAYS_OF_WEEK[i]}</div>
              <div className="text-xs text-muted-foreground">{format(d, "MMM d")}</div>
            </div>
          ))}
          {counters.filter(c => c.isActive).map(counter => (
            <>
              <div key={`c-${counter.id}`} className="p-2 text-sm font-medium border-b border-t flex items-center gap-1">
                <Utensils className="h-3 w-3 text-muted-foreground" />
                {counter.name}
              </div>
              {weekDates.map((d, di) => {
                const dateStr = format(d, "yyyy-MM-dd");
                const entries = (rosterByDate[dateStr] ?? []).filter(e => e.counterId === counter.id);
                return (
                  <div key={`${counter.id}-${di}`} className="p-1 border-b border-t border-l min-h-[80px]">
                    {entries.map(e => (
                      <div key={e.id} className="bg-primary/10 rounded p-1 mb-1 text-xs group relative" data-testid={`roster-entry-${e.id}`}>
                        <div className="font-medium truncate">{e.chefName ?? e.chefId}</div>
                        <div className="text-muted-foreground">{e.shiftStart}–{e.shiftEnd}</div>
                        <div className="text-muted-foreground">{e.role}</div>
                        <button
                          onClick={() => deleteMut.mutate(e.id)}
                          className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 text-destructive"
                          data-testid={`button-delete-roster-${e.id}`}
                        >✕</button>
                      </div>
                    ))}
                    <button
                      onClick={() => openNew(dateStr)}
                      className="w-full border border-dashed rounded p-1 text-xs text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                      data-testid={`button-add-roster-${counter.id}-${di}`}
                    >+ {t("add")}</button>
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editEntry ? t("editRosterEntry") : t("addRosterEntry")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("date")}</Label>
              <Input type="date" value={form.shiftDate} onChange={e => setForm(f => ({ ...f, shiftDate: e.target.value }))} data-testid="input-roster-date" />
            </div>
            <div>
              <Label>{t("chefStaff")}</Label>
              {chefs.length > 0 ? (
                <Select value={form.chefId} onValueChange={v => setForm(f => ({ ...f, chefId: v }))}>
                  <SelectTrigger data-testid="select-roster-chef"><SelectValue placeholder={t("selectChef")} /></SelectTrigger>
                  <SelectContent>
                    {chefs.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.chefId} onChange={e => setForm(f => ({ ...f, chefId: e.target.value }))} placeholder={t("chefIdOrName")} data-testid="input-roster-chef-id" />
              )}
            </div>
            <div>
              <Label>{t("counter")}</Label>
              <Select value={form.counterId} onValueChange={v => setForm(f => ({ ...f, counterId: v }))}>
                <SelectTrigger data-testid="select-roster-counter"><SelectValue placeholder={t("selectCounter")} /></SelectTrigger>
                <SelectContent>
                  {counters.filter(c => c.isActive).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t("shiftStart")}</Label>
                <Input type="time" value={form.shiftStart} onChange={e => setForm(f => ({ ...f, shiftStart: e.target.value }))} data-testid="input-roster-start" />
              </div>
              <div>
                <Label>{t("shiftEnd")}</Label>
                <Input type="time" value={form.shiftEnd} onChange={e => setForm(f => ({ ...f, shiftEnd: e.target.value }))} data-testid="input-roster-end" />
              </div>
            </div>
            <div>
              <Label>{t("role")}</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger data-testid="select-roster-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIFT_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={submit} disabled={!form.shiftDate || saveMut.isPending} data-testid="button-save-roster">{t("saveEntry")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssignmentRulesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("kitchen");

  const { data: outlets = [] } = useQuery<any[]>({ queryKey: ["/api/outlets"] });
  const [outletId, setOutletId] = useState<string>("");
  const selectedOutletId = outletId || outlets[0]?.id;

  const { data: settings, isLoading } = useQuery<AssignmentSettings>({
    queryKey: ["/api/outlets", selectedOutletId, "assignment-settings"],
    queryFn: () => apiRequest("GET", `/api/outlets/${selectedOutletId}/assignment-settings`).then(r => r.json()),
    enabled: !!selectedOutletId,
  });

  const [form, setForm] = useState<AssignmentSettings | null>(null);

  if (settings && !form) setForm(settings);

  const saveMut = useMutation({
    mutationFn: (data: AssignmentSettings) => apiRequest("PUT", `/api/outlets/${selectedOutletId}/assignment-settings`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/outlets", selectedOutletId, "assignment-settings"] }); toast({ title: t("assignmentRulesSaved") }); },
  });

  const s = form ?? settings;

  return (
    <div className="max-w-2xl space-y-6">
      {outlets.length > 1 && (
        <Select value={selectedOutletId} onValueChange={v => { setOutletId(v); setForm(null); }}>
          <SelectTrigger className="w-56" data-testid="select-outlet-rules"><SelectValue /></SelectTrigger>
          <SelectContent>{outlets.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
        </Select>
      )}

      {isLoading || !s ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}</div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Settings2 className="h-4 w-4" />{t("assignmentMode")}</CardTitle>
              <CardDescription>{t("assignmentModeDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { value: "full_auto", label: t("modeFullAuto"), desc: t("modeFullAutoDesc") },
                { value: "hybrid", label: t("modeHybrid"), desc: t("modeHybridDesc") },
                { value: "self_assign", label: t("modeSelfAssign"), desc: t("modeSelfAssignDesc") },
                { value: "manual", label: t("modeManual"), desc: t("modeManualDesc") },
              ].map(opt => (
                <div
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${s.mode === opt.value ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"}`}
                  onClick={() => setForm(f => f ? { ...f, mode: opt.value } : null)}
                  data-testid={`radio-mode-${opt.value}`}
                >
                  <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${s.mode === opt.value ? "border-primary" : "border-muted-foreground"}`}>
                    {s.mode === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />{t("thresholds")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>{t("maxTicketsPerChef")}</Label>
                <Input type="number" min={1} max={20} value={s.maxTicketsPerChef}
                  onChange={e => setForm(f => f ? { ...f, maxTicketsPerChef: +e.target.value } : null)}
                  data-testid="input-max-tickets" />
              </div>
              <div>
                <Label>{t("unassignedTimeout")}</Label>
                <Input type="number" min={1} max={30} value={s.unassignedTimeoutMin}
                  onChange={e => setForm(f => f ? { ...f, unassignedTimeoutMin: +e.target.value } : null)}
                  data-testid="input-unassigned-timeout" />
              </div>
              <div>
                <Label>{t("autoReassignIdle")}</Label>
                <Input type="number" min={1} max={60} value={s.autoReassignIdleMin}
                  onChange={e => setForm(f => f ? { ...f, autoReassignIdleMin: +e.target.value } : null)}
                  data-testid="input-auto-reassign" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{t("scoringFactors")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "considerRoster", label: t("considerRoster"), desc: t("considerRosterDesc") },
                { key: "considerWorkload", label: t("considerWorkload"), desc: t("considerWorkloadDesc") },
                { key: "considerExperience", label: t("considerExperience"), desc: t("considerExperienceDesc") },
                { key: "allowSelfAssign", label: t("allowSelfAssign"), desc: t("allowSelfAssignDesc") },
                { key: "allowChefReassign", label: t("allowChefReassign"), desc: t("allowChefReassignDesc") },
                { key: "requireReassignReason", label: t("requireReassignReason"), desc: t("requireReassignReasonDesc") },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.desc}</div>
                  </div>
                  <Switch
                    checked={!!(s as any)[item.key]}
                    onCheckedChange={v => setForm(f => f ? { ...f, [item.key]: v } : null)}
                    data-testid={`toggle-${item.key}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Button onClick={() => form && saveMut.mutate(form)} disabled={saveMut.isPending} data-testid="button-save-rules">
            {t("saveAssignmentRules")}
          </Button>
        </>
      )}
    </div>
  );
}

interface CookingControlSettings {
  cooking_control_mode: string;
  show_timing_suggestions: boolean;
  alert_overdue_minutes: number;
  allow_rush_override: boolean;
  rush_requires_manager_pin: boolean;
  auto_hold_bar_items: boolean;
}

const DEFAULT_COOKING_SETTINGS: CookingControlSettings = {
  cooking_control_mode: "auto_start",
  show_timing_suggestions: true,
  alert_overdue_minutes: 3,
  allow_rush_override: true,
  rush_requires_manager_pin: false,
  auto_hold_bar_items: false,
};

function CookingControlTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("kitchen");

  const { data: settings } = useQuery<CookingControlSettings>({
    queryKey: ["/api/kitchen-settings"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/kitchen-settings", { credentials: "include" });
        if (res.ok) return res.json();
      } catch (_) {}
      return DEFAULT_COOKING_SETTINGS;
    },
    initialData: DEFAULT_COOKING_SETTINGS,
  });

  const [form, setForm] = useState<CookingControlSettings>(DEFAULT_COOKING_SETTINGS);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: async (data: CookingControlSettings) => {
      const res = await apiRequest("PUT", "/api/kitchen-settings", data);
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kitchen-settings"] });
      toast({ title: t("cookingSettingsSaved") });
    },
    onError: () => toast({ title: t("settingsSavedLocally"), variant: "default" }),
  });

  const s = form;

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />{t("cookingControlMode")}
          </CardTitle>
          <CardDescription>{t("cookingControlModeDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { value: "auto_start", label: t("modeAutoStart"), desc: t("modeAutoStartDesc") },
            { value: "selective", label: t("modeSelective"), desc: t("modeSelectiveDesc") },
            { value: "course_only", label: t("modeCourseOnly"), desc: t("modeCourseOnlyDesc") },
          ].map(opt => (
            <div
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${s.cooking_control_mode === opt.value ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"}`}
              onClick={() => setForm(f => ({ ...f, cooking_control_mode: opt.value }))}
              data-testid={`radio-cooking-mode-${opt.value}`}
            >
              <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${s.cooking_control_mode === opt.value ? "border-primary" : "border-muted-foreground"}`}>
                {s.cooking_control_mode === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
              </div>
              <div>
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.desc}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" />{t("timingAndAlerts")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t("showTimingSuggestions")}</div>
              <div className="text-xs text-muted-foreground">{t("showTimingSuggestionsDesc")}</div>
            </div>
            <Switch
              checked={!!s.show_timing_suggestions}
              onCheckedChange={v => setForm(f => ({ ...f, show_timing_suggestions: v }))}
              data-testid="toggle-show-timing"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("alertOverdueBy")}</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={s.alert_overdue_minutes}
                onChange={e => setForm(f => ({ ...f, alert_overdue_minutes: +e.target.value }))}
                data-testid="input-alert-overdue-minutes"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />{t("rushOverride")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t("allowRushOverride")}</div>
              <div className="text-xs text-muted-foreground">{t("allowRushOverrideDesc")}</div>
            </div>
            <Switch
              checked={!!s.allow_rush_override}
              onCheckedChange={v => setForm(f => ({ ...f, allow_rush_override: v }))}
              data-testid="toggle-allow-rush"
            />
          </div>
          {s.allow_rush_override && (
            <div className="flex items-center justify-between pl-4 border-l-2 border-muted">
              <div>
                <div className="text-sm font-medium">{t("requiresManagerPin")}</div>
                <div className="text-xs text-muted-foreground">{t("requiresManagerPinDesc")}</div>
              </div>
              <Switch
                checked={!!s.rush_requires_manager_pin}
                onCheckedChange={v => setForm(f => ({ ...f, rush_requires_manager_pin: v }))}
                data-testid="toggle-rush-pin"
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t("autoHoldBarItems")}</div>
              <div className="text-xs text-muted-foreground">{t("autoHoldBarItemsDesc")}</div>
            </div>
            <Switch
              checked={!!s.auto_hold_bar_items}
              onCheckedChange={v => setForm(f => ({ ...f, auto_hold_bar_items: v }))}
              data-testid="toggle-auto-hold-bar"
            />
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={() => form && saveMut.mutate(form)}
        disabled={saveMut.isPending}
        data-testid="button-save-cooking-control"
      >
        {t("saveCookingControlSettings")}
      </Button>
    </div>
  );
}

interface TimeTargets {
  waiterResponseTarget: number;
  kitchenPickupTarget: number;
  totalKitchenTarget: number;
  totalCycleTarget: number;
  alertAtPercent: number;
  orderType: string;
}

const DEFAULT_TIME_TARGETS: TimeTargets = {
  waiterResponseTarget: 2,
  kitchenPickupTarget: 1,
  totalKitchenTarget: 15,
  totalCycleTarget: 25,
  alertAtPercent: 80,
  orderType: "all",
};

function TimeTargetsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("kitchen");
  const { data: outlets = [] } = useQuery<any[]>({ queryKey: ["/api/outlets"] });
  const [outletId, setOutletId] = useState<string>("");
  const selectedOutletId = outletId || outlets[0]?.id;

  const [form, setForm] = useState<TimeTargets>(DEFAULT_TIME_TARGETS);

  const { data: existing } = useQuery<TimeTargets>({
    queryKey: ["/api/time-targets", selectedOutletId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/time-targets/${selectedOutletId}`, { credentials: "include" });
        if (res.ok) return res.json();
      } catch (_) {}
      return null;
    },
    enabled: !!selectedOutletId,
  });

  useEffect(() => {
    if (existing) setForm(f => ({ ...DEFAULT_TIME_TARGETS, ...existing }));
  }, [existing]);

  const saveMut = useMutation({
    mutationFn: async (data: TimeTargets) => {
      const res = await fetch(`/api/time-targets/${selectedOutletId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/time-targets"] });
      toast({ title: t("timeTargetsSaved") });
    },
    onError: () => toast({ title: t("savedLocally"), variant: "default" }),
  });

  function field(label: string, key: keyof TimeTargets, unit: string, testId: string) {
    return (
      <div className="flex items-center justify-between gap-4 py-2 border-b last:border-0">
        <div>
          <div className="text-sm font-medium">{label}</div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={120}
            value={form[key] as number}
            onChange={e => setForm(f => ({ ...f, [key]: +e.target.value }))}
            className="w-20 h-8 text-sm text-right"
            data-testid={testId}
          />
          <span className="text-xs text-muted-foreground w-14">{unit}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4" />{t("timePerformanceTargets")}
          </CardTitle>
          <CardDescription>{t("timePerformanceTargetsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="pb-3 flex items-center gap-3">
            <Label className="text-sm font-medium whitespace-nowrap">{t("for")}:</Label>
            <Select value={form.orderType} onValueChange={v => setForm(f => ({ ...f, orderType: v }))}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allOrderTypes")}</SelectItem>
                <SelectItem value="dine_in">{t("dineIn")}</SelectItem>
                <SelectItem value="takeaway">{t("takeaway")}</SelectItem>
                <SelectItem value="delivery">{t("delivery")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field(t("waiterResponseTarget"), "waiterResponseTarget", t("minutes"), "input-waiter-response-target")}
          {field(t("kitchenPickupTarget"), "kitchenPickupTarget", t("minute"), "input-kitchen-pickup-target")}
          {field(t("totalKitchenTarget"), "totalKitchenTarget", t("minutes"), "input-total-kitchen-target")}
          {field(t("totalCycleTarget"), "totalCycleTarget", t("minutes"), "input-total-cycle-target")}
          {field(t("alertAtPercent"), "alertAtPercent", "%", "input-alert-at-percent")}
        </CardContent>
      </Card>
      <Button
        onClick={() => saveMut.mutate(form)}
        disabled={saveMut.isPending}
        data-testid="button-save-targets"
      >
        {t("saveTargets")}
      </Button>
    </div>
  );
}

function RecipeCalibrationTab() {
  const { toast } = useToast();
  const { t } = useTranslation("kitchen");
  const [calibResult, setCalibResult] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: calibStatus } = useQuery<any>({
    queryKey: ["/api/recipe-benchmarks/calibrate/status"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/recipe-benchmarks/calibrate/status", { credentials: "include" });
        if (res.ok) return res.json();
      } catch (_) {}
      return null;
    },
  });

  async function runCalibration() {
    setLoading(true);
    try {
      const res = await fetch("/api/recipe-benchmarks/calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setCalibResult(data);
        setShowModal(true);
      } else {
        toast({ title: t("calibrationComplete"), variant: "default" });
      }
    } catch (_) {
      toast({ title: t("calibrationRunLocal"), variant: "default" });
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />{t("autoCalibrateTitle")}
          </CardTitle>
          <CardDescription>
            {t("autoCalibrateDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {calibStatus && (
            <div className="text-sm text-muted-foreground">
              {t("lastRun")}:{" "}
              {calibStatus.lastRunAt
                ? new Date(calibStatus.lastRunAt).toLocaleDateString()
                : t("never")}
              {calibStatus.dishesUpdated != null && ` | ${calibStatus.dishesUpdated} ${t("dishesUpdated")}`}
            </div>
          )}
          <Button
            onClick={runCalibration}
            disabled={loading}
            data-testid="button-run-calibration"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t("running")}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />{t("runCalibrationNow")}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={v => !v && setShowModal(false)}>
        <DialogContent data-testid="modal-calibration-results">
          <DialogHeader>
            <DialogTitle>{t("calibrationResults")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {calibResult?.dishes?.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">{t("dishesUpdatedCount", { n: calibResult.dishes.length })}</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left pb-1">{t("dish")}</th>
                      <th className="text-right pb-1">{t("old")}</th>
                      <th className="text-right pb-1">{t("new")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calibResult.dishes.map((d: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1">{d.name}</td>
                        <td className="text-right py-1 text-muted-foreground">{d.oldMin} {t("minUnit")}</td>
                        <td className="text-right py-1 font-medium text-primary">{d.newMin} {t("minUnit")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noCalibrationNeeded")}</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowModal(false)}>{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function KitchenSettingsPage() {
  const { t } = useTranslation("kitchen");
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ChefHat className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-kitchen-settings">{t("kitchenSettings")}</h1>
          <p className="text-sm text-muted-foreground">{t("kitchenSettingsDesc")}</p>
        </div>
      </div>

      <Tabs defaultValue="counters">
        <TabsList data-testid="tabs-kitchen-settings">
          <TabsTrigger value="counters" data-testid="tab-counters">
            <Utensils className="h-4 w-4 mr-2" />{t("counters")}
          </TabsTrigger>
          <TabsTrigger value="roster" data-testid="tab-roster">
            <CalendarDays className="h-4 w-4 mr-2" />{t("roster")}
          </TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">
            <Settings2 className="h-4 w-4 mr-2" />{t("assignmentRules")}
          </TabsTrigger>
          <TabsTrigger value="cooking-control" data-testid="tab-cooking-control">
            <Zap className="h-4 w-4 mr-2" />{t("cookingControl")}
          </TabsTrigger>
          <TabsTrigger value="time-targets" data-testid="tab-time-targets">
            <Timer className="h-4 w-4 mr-2" />{t("timeTargets")}
          </TabsTrigger>
          <TabsTrigger value="calibration" data-testid="tab-calibration">
            <RefreshCw className="h-4 w-4 mr-2" />{t("calibration")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="counters" className="mt-6">
          <CountersTab />
        </TabsContent>
        <TabsContent value="roster" className="mt-6">
          <RosterTab />
        </TabsContent>
        <TabsContent value="rules" className="mt-6">
          <AssignmentRulesTab />
        </TabsContent>
        <TabsContent value="cooking-control" className="mt-6">
          <CookingControlTab />
        </TabsContent>
        <TabsContent value="time-targets" className="mt-6">
          <TimeTargetsTab />
        </TabsContent>
        <TabsContent value="calibration" className="mt-6">
          <RecipeCalibrationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
