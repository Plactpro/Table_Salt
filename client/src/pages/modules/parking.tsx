import { PageTitle } from "@/lib/accessibility";
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency as sharedFormatCurrency, type FormatCurrencyOptions } from "@shared/currency";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { useRequestSounds } from "@/hooks/use-request-sounds";
import { motion } from "framer-motion";
import {
  Car, Bike, Plus, RefreshCw, Clock, CheckCircle2, CheckCircle, AlertCircle,
  Loader2, User, Phone, X, ChevronRight, MapPin, CircleDot, Square,
  Hash, Clipboard, ParkingSquare, BarChart3, Timer, DollarSign, Layers,
  Settings, Users, Download, Trash2, Edit2, ToggleLeft, ToggleRight,
  TrendingUp, CalendarDays, Shield, BadgeCheck, Search, Zap, List, LayoutGrid, Bell,
  Moon, Star, Key, Banknote, LogIn, LogOut, UserCheck, ClipboardList, ArrowUpCircle,
  Hourglass, TriangleAlert, KeyRound, FileWarning, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";

const VEHICLE_TYPES = [
  { value: "TWO_WHEELER", label: "Two-Wheeler", icon: "🏍" },
  { value: "CAR", label: "Car", icon: "🚗" },
  { value: "SUV", label: "SUV", icon: "🚙" },
  { value: "VAN", label: "Van", icon: "🚐" },
];

function getVehicleIcon(type: string) {
  return VEHICLE_TYPES.find(v => v.value === type)?.icon ?? "🚗";
}

function formatDuration(ms: number): string {
      const h = ms / 3600000;
    if (h > 48) return `${Math.round(h / 24)} days`;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatCurrency(amount: number, currency?: string, opts?: FormatCurrencyOptions): string {
  return sharedFormatCurrency(amount, currency ?? "USD", opts);
}

function LiveTimer({ entryTime }: { entryTime: string }) {
  const [elapsed, setElapsed] = useState(Date.now() - new Date(entryTime).getTime());

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - new Date(entryTime).getTime());
    }, 30000);
    return () => clearInterval(interval);
  }, [entryTime]);

  return <span data-testid="text-live-timer">{formatDuration(elapsed)}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; className: string }> = {
    parked: { label: "Parked", className: "bg-green-100 text-green-700 border-green-200" },
    requested: { label: "Requested", className: "bg-amber-100 text-amber-700 border-amber-200" },
    retrieving: { label: "Retrieving", className: "bg-blue-100 text-blue-700 border-blue-200" },
    pending: { label: "Pending", className: "bg-amber-100 text-amber-700 border-amber-200" },
    assigned: { label: "Assigned", className: "bg-blue-100 text-blue-700 border-blue-200" },
    in_progress: { label: "In Progress", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
    ready: { label: "Ready", className: "bg-purple-100 text-purple-700 border-purple-200" },
    completed: { label: "Completed", className: "bg-gray-100 text-gray-600 border-gray-200" },
    cancelled: { label: "Cancelled", className: "bg-red-100 text-red-600 border-red-200" },
    incident: { label: "Incident", className: "bg-red-100 text-red-700 border-red-300 animate-pulse" },
  };
  const s = statusMap[status] ?? { label: status, className: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.className}`} data-testid={`badge-status-${status}`}>
      {s.label}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const sourceMap: Record<string, string> = {
    QR_TABLE: "🔳 QR",
    POS: "📟 POS",
    CASHIER: "💳 Cashier",
    VALET: "🅿️ Valet",
  };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted border" data-testid={`badge-source-${source}`}>
      {sourceMap[source] ?? source}
    </span>
  );
}

function NewTicketDialog({
  open,
  onClose,
  outletId,
}: {
  open: boolean;
  onClose: () => void;
  outletId: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fmt = (v: number) => sharedFormatCurrency(v, user?.tenant?.currency ?? "USD", { position: (user?.tenant?.currencyPosition ?? "before") as "before" | "after", decimals: user?.tenant?.currencyDecimals ?? 2 });
  const [step, setStep] = useState(1);
  const [createdTicket, setCreatedTicket] = useState<any>(null);
  const [linkedCrmCustomer, setLinkedCrmCustomer] = useState<any>(null);
  const [form, setForm] = useState({
    vehicleType: "CAR",
    vehicleNumber: "",
    vehicleMake: "",
    vehicleColor: "",
    customerName: "",
    customerPhone: "",
    tableAssignment: "",
    keyTagNumber: "",
    selectedSlotId: "",
    selectedSlotCode: "",
    customerId: "",
  });
  const [conditionReport, setConditionReport] = useState({
    body: "clean",
    interior: "clean",
    fuelLevel: "full",
    acWorking: "yes",
    spareTyre: "yes",
    notes: "",
  });

  // Debounced plate lookup key (triggers after 4+ chars)
  const [plateLookupKey, setPlateLookupKey] = useState("");
  const [phoneLookupKey, setPhoneLookupKey] = useState("");
  const plateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: crmByPlate, isFetching: plateLookupFetching } = useQuery<any>({
    queryKey: ["/api/parking/customer-lookup", "plate", plateLookupKey],
    queryFn: async () => {
      if (!plateLookupKey || plateLookupKey.length < 4) return null;
      const res = await fetch(`/api/parking/customer-lookup?plate=${encodeURIComponent(plateLookupKey)}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open && !!plateLookupKey && plateLookupKey.length >= 4 && !form.customerId,
    staleTime: 30000,
  });

  const { data: crmByPhone, isFetching: phoneLookupFetching } = useQuery<any>({
    queryKey: ["/api/parking/customer-lookup", "phone", phoneLookupKey],
    queryFn: async () => {
      if (!phoneLookupKey || phoneLookupKey.length < 6) return null;
      const res = await fetch(`/api/parking/customer-lookup?phone=${encodeURIComponent(phoneLookupKey)}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open && !!phoneLookupKey && phoneLookupKey.length >= 6 && !form.customerId,
    staleTime: 30000,
  });

  // Resolved CRM suggestion: plate lookup takes priority
  const crmSuggestion = linkedCrmCustomer ? null : (crmByPlate || crmByPhone || null);

  const { data: slots = [] } = useQuery<any[]>({
    queryKey: ["/api/parking/slots", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/slots/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && step === 2,
    staleTime: 10000,
  });

  const { data: allTables = [] } = useQuery<any[]>({
    queryKey: ["/api/tables"],
    queryFn: async () => {
      const res = await fetch(`/api/tables`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && step === 1,
    staleTime: 30000,
  });
  const activeTables = allTables.filter(
    (t: any) => (!t.outletId || t.outletId === outletId) && t.status === "free"
  );

  const availableSlots = slots.filter((s: any) => s.status === "available");

  const resolvedCustomerId = form.customerId || "";

  const [autoAssignResult, setAutoAssignResult] = useState<{ reason: string } | null>(null);
  const autoAssignMutation = useMutation({
    mutationFn: async () => {
      const custParam = resolvedCustomerId ? `&customerId=${encodeURIComponent(resolvedCustomerId)}` : "";
      const res = await fetch(`/api/parking/auto-assign?outletId=${outletId}&vehicleType=${form.vehicleType}${custParam}`, { credentials: "include" });
      if (!res.ok) throw new Error("Auto-assign failed");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.slot) {
        setForm(f => ({ ...f, selectedSlotId: data.slot.id, selectedSlotCode: data.slot.code }));
        setAutoAssignResult({ reason: data.reason });
      } else {
        setAutoAssignResult({ reason: data.reason });
      }
    },
    onError: () => toast({ title: "Auto-assign failed", variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async ({ skipCondition }: { skipCondition: boolean }) => {
      const conditionData = skipCondition ? null : {
        body: conditionReport.body,
        interior: conditionReport.interior,
        fuelLevel: conditionReport.fuelLevel,
        acWorking: conditionReport.acWorking,
        spareTyre: conditionReport.spareTyre,
        notes: conditionReport.notes || null,
        capturedAt: new Date().toISOString(),
      };
      const res = await apiRequest("POST", "/api/parking/tickets", {
        outletId,
        vehicleType: form.vehicleType,
        vehicleNumber: form.vehicleNumber,
        vehicleMake: form.vehicleMake || null,
        vehicleColor: form.vehicleColor || null,
        customerName: form.customerName || null,
        customerPhone: form.customerPhone || null,
        customerId: form.customerId || null,
        tableAssignment: form.tableAssignment || null,
        keyTagNumber: form.keyTagNumber || null,
        slotId: form.selectedSlotId || null,
        conditionReport: conditionData,
      });
      return res.json();
    },
    onSuccess: (ticket) => {
      setCreatedTicket(ticket);
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/slots", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/stats", outletId] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create ticket", description: err.message, variant: "destructive" });
    },
  });

  const handlePrint = () => {
    if (!createdTicket) return;
    const html = `
      <html><head><title>Parking Ticket</title>
      <style>
        body { font-family: monospace; font-size: 12px; margin: 0; }
        .copy { width: 50%; float: left; padding: 8px; box-sizing: border-box; border-right: 1px dashed #999; }
        .copy:last-child { border-right: none; }
        h2 { font-size: 14px; margin: 0 0 4px; }
        .sep { border-top: 1px dashed #999; margin: 6px 0; }
        table { width: 100%; }
        td { padding: 2px 0; }
        td:last-child { text-align: right; font-weight: bold; }
        .ticket-num { font-size: 18px; font-weight: bold; text-align: center; margin: 8px 0; }
        @media print { body * { visibility: visible; } }
      </style>
      </head><body>
      ${[1, 2].map(copy => `
        <div class="copy">
          <h2>Parking Ticket ${copy === 1 ? "(Customer Copy)" : "(Valet Copy)"}</h2>
          <div class="ticket-num">${createdTicket.ticketNumber}</div>
          <div class="sep"></div>
          <table>
            <tr><td>Vehicle</td><td>${createdTicket.vehicleNumber}</td></tr>
            <tr><td>Type</td><td>${createdTicket.vehicleType}</td></tr>
            ${createdTicket.vehicleColor ? `<tr><td>Color</td><td>${createdTicket.vehicleColor}</td></tr>` : ""}
            ${createdTicket.slotCode ? `<tr><td>Slot</td><td>${createdTicket.slotCode}</td></tr>` : ""}
            ${createdTicket.keyTagNumber ? `<tr><td>Key Tag</td><td>${createdTicket.keyTagNumber}</td></tr>` : ""}
            ${createdTicket.customerName ? `<tr><td>Customer</td><td>${createdTicket.customerName}</td></tr>` : ""}
            <tr><td>Entry</td><td>${new Date(createdTicket.entryTime).toLocaleString()}</td></tr>
          </table>
          ${createdTicket.conditionReport ? `
          <div class="sep"></div>
          <p style="font-size:10px;font-weight:bold;margin:4px 0 2px;">Entry Condition:</p>
          <table style="font-size:10px">
            <tr><td>Body</td><td>${createdTicket.conditionReport.body ?? "—"}</td></tr>
            <tr><td>Interior</td><td>${createdTicket.conditionReport.interior ?? "—"}</td></tr>
            <tr><td>Fuel</td><td>${createdTicket.conditionReport.fuelLevel ?? "—"}</td></tr>
            <tr><td>A/C</td><td>${createdTicket.conditionReport.acWorking ?? "—"}</td></tr>
            <tr><td>Spare</td><td>${createdTicket.conditionReport.spareTyre ?? "—"}</td></tr>
            ${createdTicket.conditionReport.notes ? `<tr><td colspan="2" style="font-style:italic">${createdTicket.conditionReport.notes}</td></tr>` : ""}
          </table>
          ` : ""}
          <div class="sep"></div>
          <p style="text-align:center;font-size:10px">Please keep this ticket for vehicle retrieval</p>
        </div>
      `).join("")}
      <div style="clear:both"></div>
      </body></html>
    `;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    }
  };

  const handleClose = () => {
    setStep(1);
    setCreatedTicket(null);
    setAutoAssignResult(null);
    setLinkedCrmCustomer(null);
    setPlateLookupKey("");
    setPhoneLookupKey("");
    setForm({
      vehicleType: "CAR", vehicleNumber: "", vehicleMake: "", vehicleColor: "",
      customerName: "", customerPhone: "", tableAssignment: "", keyTagNumber: "",
      selectedSlotId: "", selectedSlotCode: "", customerId: "",
    });
    setConditionReport({ body: "clean", interior: "clean", fuelLevel: "full", acWorking: "yes", spareTyre: "yes", notes: "" });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ParkingSquare className="h-5 w-5 text-blue-600" />
            New Valet Check-in
          </SheetTitle>
        </SheetHeader>

        {createdTicket ? (
          <div className="mt-6 space-y-4">
            <div className="text-center bg-green-50 rounded-xl p-6 border border-green-200">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <p className="text-sm text-green-700 mb-1">Ticket Created Successfully</p>
              <p className="text-3xl font-bold font-mono text-green-800" data-testid="text-ticket-number">{createdTicket.ticketNumber}</p>
              {createdTicket.slotCode && (
                <p className="text-sm text-green-700 mt-2">Slot: <strong>{createdTicket.slotCode}</strong></p>
              )}
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handlePrint} data-testid="button-print-ticket">
                Print Ticket
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleClose} data-testid="button-done-ticket">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 1 ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>1</span>
              <span className="text-xs">Vehicle</span>
              <ChevronRight className="h-3 w-3" />
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>2</span>
              <span className="text-xs">Slot</span>
              <ChevronRight className="h-3 w-3" />
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 3 ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>3</span>
              <span className="text-xs">Condition</span>
            </div>

            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Vehicle Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {VEHICLE_TYPES.map(vt => (
                      <button
                        key={vt.value}
                        data-testid={`select-vehicle-type-${vt.value}`}
                        onClick={() => setForm(f => ({ ...f, vehicleType: vt.value }))}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${form.vehicleType === vt.value ? "bg-primary/10 border-primary text-primary" : "border-muted hover:bg-muted/50"}`}
                      >
                        <span className="text-lg">{vt.icon}</span>
                        {vt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicle-number">Vehicle Number *</Label>
                  <Input
                    id="vehicle-number"
                    placeholder="e.g. MH 01 AB 1234"
                    value={form.vehicleNumber}
                    onChange={e => {
                      const val = e.target.value;
                      setForm(f => ({ ...f, vehicleNumber: val }));
                      if (plateDebounceRef.current) clearTimeout(plateDebounceRef.current);
                      if (!form.customerId) {
                        plateDebounceRef.current = setTimeout(() => {
                          setPlateLookupKey(val.trim().length >= 4 ? val.trim() : "");
                        }, 600);
                      }
                    }}
                    data-testid="input-vehicle-number"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="vehicle-make">Make/Model</Label>
                    <Input
                      id="vehicle-make"
                      placeholder="e.g. Honda City"
                      value={form.vehicleMake}
                      onChange={e => setForm(f => ({ ...f, vehicleMake: e.target.value }))}
                      data-testid="input-vehicle-make"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicle-color">Color</Label>
                    <Input
                      id="vehicle-color"
                      placeholder="e.g. White"
                      value={form.vehicleColor}
                      onChange={e => setForm(f => ({ ...f, vehicleColor: e.target.value }))}
                      data-testid="input-vehicle-color"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="customer-name">Customer Name</Label>
                    <Input
                      id="customer-name"
                      placeholder="Optional"
                      value={form.customerName}
                      onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                      data-testid="input-customer-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer-phone">Phone</Label>
                    <Input
                      id="customer-phone"
                      placeholder="Optional"
                      value={form.customerPhone}
                      onChange={e => {
                        const val = e.target.value;
                        setForm(f => ({ ...f, customerPhone: val }));
                        if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current);
                        if (!form.customerId) {
                          phoneDebounceRef.current = setTimeout(() => {
                            setPhoneLookupKey(val.trim().length >= 6 ? val.trim() : "");
                          }, 600);
                        }
                      }}
                      data-testid="input-customer-phone"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="table-assignment">Table No.</Label>
                    {activeTables.length > 0 ? (
                      <Select
                        value={form.tableAssignment || "_none"}
                        onValueChange={v => setForm(f => ({ ...f, tableAssignment: v === "_none" ? "" : v }))}
                      >
                        <SelectTrigger id="table-assignment" data-testid="select-table-assignment">
                          <SelectValue placeholder="Select table..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">None</SelectItem>
                          {(() => {
                            const byZone: Record<string, any[]> = {};
                            for (const t of activeTables) {
                              const z = t.zone || "Main";
                              if (!byZone[z]) byZone[z] = [];
                              byZone[z].push(t);
                            }
                            return Object.entries(byZone).map(([zoneName, zoneTables]) => (
                              <SelectGroup key={zoneName}>
                                <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  {zoneName}
                                </SelectLabel>
                                {(zoneTables as any[]).map((t: any) => {
                                  const label = `Table ${t.number ?? t.name ?? t.id}${t.capacity ? ` (${t.capacity} seats)` : ""}`;
                                  return (
                                    <SelectItem key={t.id} value={String(t.number ?? t.name ?? t.id)} data-testid={`option-table-${t.id}`}>
                                      {label}
                                    </SelectItem>
                                  );
                                })}
                              </SelectGroup>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="table-assignment"
                        placeholder="Optional"
                        value={form.tableAssignment}
                        onChange={e => setForm(f => ({ ...f, tableAssignment: e.target.value }))}
                        data-testid="input-table-assignment"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="key-tag">Key Tag</Label>
                    <Input
                      id="key-tag"
                      placeholder="Tag number"
                      value={form.keyTagNumber}
                      onChange={e => setForm(f => ({ ...f, keyTagNumber: e.target.value }))}
                      data-testid="input-key-tag"
                    />
                  </div>
                </div>

                {/* CRM Lookup Result Card */}
                {(plateLookupFetching || phoneLookupFetching) && !form.customerId && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-1" data-testid="crm-lookup-loading">
                    <Loader2 className="h-3 w-3 animate-spin" /> Looking up customer...
                  </div>
                )}

                {!form.customerId && crmSuggestion && (
                  <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2" data-testid="crm-found-customer-card">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-800">Returning Customer Found</span>
                      </div>
                      <Badge className={`text-[10px] px-1.5 py-0 ${["gold","platinum"].includes(crmSuggestion.loyaltyTier ?? "") ? "border-amber-400 text-amber-700 bg-amber-50" : "border-blue-300 text-blue-700 bg-blue-50"}`} data-testid="badge-crm-tier">
                        {crmSuggestion.loyaltyTier ?? "bronze"}
                      </Badge>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium" data-testid="text-crm-name">{crmSuggestion.name}</p>
                      {crmSuggestion.phone && <p className="text-xs text-muted-foreground">{crmSuggestion.phone}</p>}
                    </div>
                    <p className="text-xs text-blue-700" data-testid="text-crm-parking-stats">
                      {crmSuggestion.parkingVisitCount ?? 0} parking visits · {fmt(parseFloat(crmSuggestion.parkingTotalSpent ?? "0"))} total
                      {crmSuggestion.lastSessions?.[0]?.exitTime && (
                        <> · Last: {new Date(crmSuggestion.lastSessions[0].exitTime).toLocaleDateString()}</>
                      )}
                    </p>
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => {
                        setLinkedCrmCustomer(crmSuggestion);
                        setForm(f => ({
                          ...f,
                          customerId: crmSuggestion.id,
                          customerName: f.customerName || crmSuggestion.name,
                          customerPhone: f.customerPhone || crmSuggestion.phone || "",
                        }));
                      }}
                      data-testid="button-use-crm-customer"
                    >
                      Use this customer
                    </Button>
                  </div>
                )}

                {!form.customerId && !crmSuggestion && (form.customerPhone?.length >= 6 || form.vehicleNumber?.trim().length >= 4) && !plateLookupFetching && !phoneLookupFetching && (
                  <p className="text-xs text-muted-foreground" data-testid="text-new-customer-hint">
                    New customer — will be saved to CRM on checkout
                  </p>
                )}

                {form.customerId && linkedCrmCustomer && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2" data-testid="crm-linked-customer">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="text-xs text-green-800 font-medium">Linked to CRM: {linkedCrmCustomer.name}</span>
                    <button
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      onClick={() => { setLinkedCrmCustomer(null); setForm(f => ({ ...f, customerId: "" })); }}
                      data-testid="button-unlink-crm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={!form.vehicleNumber}
                  onClick={() => setStep(2)}
                  data-testid="button-next-slot-selection"
                >
                  Next: Select Slot
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">Select Available Slot (Optional)</p>
                      {linkedCrmCustomer && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${["gold","platinum"].includes(linkedCrmCustomer.loyaltyTier ?? "") ? "border-amber-400 text-amber-700 bg-amber-50" : "border-muted text-muted-foreground"}`}
                          data-testid="badge-customer-tier"
                        >
                          {linkedCrmCustomer.loyaltyTier ?? "bronze"}
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                      onClick={() => autoAssignMutation.mutate()}
                      disabled={autoAssignMutation.isPending || availableSlots.length === 0}
                      data-testid="button-auto-assign"
                    >
                      {autoAssignMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                      Auto-Assign{resolvedCustomerId ? " (VIP check)" : ""}
                    </Button>
                  </div>
                  {autoAssignResult && (
                    <div className={`text-xs rounded-lg px-3 py-2 mb-3 ${form.selectedSlotId ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`} data-testid="text-auto-assign-result">
                      <Zap className="h-3 w-3 inline mr-1" />
                      {autoAssignResult.reason}
                    </div>
                  )}
                  {availableSlots.length === 0 ? (
                    <div className="text-center py-4 space-y-1">
                      <p className="text-sm text-muted-foreground">No available slots configured</p>
                      <p className="text-xs text-muted-foreground">Add slots in Parking → Settings → Slot Management</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                      <button
                        data-testid="card-slot-none"
                        onClick={() => setForm(f => ({ ...f, selectedSlotId: "", selectedSlotCode: "" }))}
                        className={`p-2 rounded-lg border text-xs font-medium transition-colors ${!form.selectedSlotId ? "bg-primary/10 border-primary text-primary" : "border-muted hover:bg-muted/50"}`}
                      >
                        No Slot
                      </button>
                      {availableSlots.map((slot: any) => (
                        <button
                          key={slot.id}
                          data-testid={`card-slot-${slot.code}`}
                          onClick={() => setForm(f => ({ ...f, selectedSlotId: slot.id, selectedSlotCode: slot.code }))}
                          className={`p-2 rounded-lg border text-xs font-medium transition-colors ${form.selectedSlotId === slot.id ? "bg-green-100 border-green-400 text-green-700 dark:bg-green-900/40 dark:border-green-500 dark:text-green-300" : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40"}`}
                        >
                          {slot.code}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {form.selectedSlotCode && (
                  <div className="bg-green-50 rounded-lg p-3 text-sm text-green-700 font-medium text-center">
                    Selected: Slot {form.selectedSlotCode}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)} data-testid="button-back-vehicle-details">
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => setStep(3)}
                    data-testid="button-next-condition"
                  >
                    Next: Condition
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4" data-testid="condition-report-step">
                <p className="text-sm text-muted-foreground">Document vehicle condition at check-in (optional)</p>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Body Condition</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { value: "clean", label: "Clean ✓" },
                        { value: "minor_scratches", label: "Minor Scratches" },
                        { value: "dents", label: "Dents" },
                        { value: "major_damage", label: "Major Damage" },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          data-testid={`condition-body-${opt.value}`}
                          onClick={() => setConditionReport(c => ({ ...c, body: opt.value }))}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${conditionReport.body === opt.value ? "bg-primary/10 border-primary text-primary" : "border-muted hover:bg-muted/50"}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Interior</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { value: "clean", label: "Clean ✓" },
                        { value: "dirty", label: "Dirty" },
                        { value: "damage", label: "Damage" },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          data-testid={`condition-interior-${opt.value}`}
                          onClick={() => setConditionReport(c => ({ ...c, interior: opt.value }))}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${conditionReport.interior === opt.value ? "bg-primary/10 border-primary text-primary" : "border-muted hover:bg-muted/50"}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Fuel Level</Label>
                    <div className="flex gap-1.5">
                      {[
                        { value: "quarter", label: "¼" },
                        { value: "half", label: "½" },
                        { value: "three_quarter", label: "¾" },
                        { value: "full", label: "Full" },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          data-testid={`condition-fuel-${opt.value}`}
                          onClick={() => setConditionReport(c => ({ ...c, fuelLevel: opt.value }))}
                          className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${conditionReport.fuelLevel === opt.value ? "bg-amber-100 border-amber-400 text-amber-700" : "border-muted hover:bg-muted/50"}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <Label className="text-xs font-semibold mb-1.5 block">A/C Working</Label>
                      <div className="flex gap-1.5">
                        {[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }].map(opt => (
                          <button
                            key={opt.value}
                            data-testid={`condition-ac-${opt.value}`}
                            onClick={() => setConditionReport(c => ({ ...c, acWorking: opt.value }))}
                            className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${conditionReport.acWorking === opt.value ? "bg-primary/10 border-primary text-primary" : "border-muted hover:bg-muted/50"}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs font-semibold mb-1.5 block">Spare Tyre</Label>
                      <div className="flex gap-1.5">
                        {[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }].map(opt => (
                          <button
                            key={opt.value}
                            data-testid={`condition-spare-${opt.value}`}
                            onClick={() => setConditionReport(c => ({ ...c, spareTyre: opt.value }))}
                            className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${conditionReport.spareTyre === opt.value ? "bg-primary/10 border-primary text-primary" : "border-muted hover:bg-muted/50"}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Notes (optional)</Label>
                    <Textarea
                      placeholder="Any other condition notes..."
                      value={conditionReport.notes}
                      onChange={e => setConditionReport(c => ({ ...c, notes: e.target.value }))}
                      rows={2}
                      className="text-sm"
                      data-testid="input-condition-notes"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(2)} data-testid="button-back-slot-selection">
                    Back
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 text-muted-foreground"
                    disabled={createMutation.isPending}
                    onClick={() => createMutation.mutate({ skipCondition: true })}
                    data-testid="button-skip-condition"
                  >
                    Skip
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={createMutation.isPending}
                    onClick={() => createMutation.mutate({ skipCondition: false })}
                    data-testid="button-create-ticket"
                  >
                    {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating...</> : "Create Ticket"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ActiveTicketCard({ ticket, outletId }: { ticket: any; outletId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showExitCondition, setShowExitCondition] = useState(false);
  const [exitCondition, setExitCondition] = useState({ body: "clean", interior: "clean", fuelLevel: "full", acWorking: "yes", spareTyre: "yes", notes: "" });
  const [tipAmount, setTipAmount] = useState("");
  const [showVipNotesInput, setShowVipNotesInput] = useState(false);
  const [vipNotesDraft, setVipNotesDraft] = useState(ticket.vipNotes ?? "");  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ incidentType: "OTHER", severity: "LOW", description: "" });
  const [incidentConfirm, setIncidentConfirm] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/parking/tickets/${ticket.id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/stats", outletId] });
      toast({ title: "Ticket updated" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const completeWithConditionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/parking/tickets/${ticket.id}/condition`, {
        conditionReport: exitCondition,
        isExitCheck: true,
      });
      const tipVal = parseFloat(tipAmount);
      if (tipVal > 0) {
        await apiRequest("PATCH", `/api/parking/tickets/${ticket.id}/tip`, { tipAmount: tipVal });
      }
      const res = await apiRequest("PATCH", `/api/parking/tickets/${ticket.id}/status`, { status: "completed" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/stats", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/shifts", outletId] });
      const tipVal = parseFloat(tipAmount);
      if (tipVal > 0) {
        toast({ title: `Tip of ₹${tipVal} recorded`, description: ticket.parkedByName ? `For ${ticket.parkedByName}` : undefined });
      } else {
        toast({ title: "Ticket completed with exit condition recorded" });
      }
      setShowExitCondition(false);
      setTipAmount("");
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const vipMutation = useMutation({
    mutationFn: async (vipNotes?: string) => {
      const res = await apiRequest("PATCH", `/api/parking/tickets/${ticket.id}/vip`, { isVip: !ticket.isVip, vipNotes: vipNotes ?? null });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      toast({ title: ticket.isVip ? "VIP flag removed" : "Marked as VIP" });
      setShowVipNotesInput(false);
    },
  });

  const saveVipNotesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/parking/tickets/${ticket.id}/vip`, { isVip: true, vipNotes: vipNotesDraft });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      setShowVipNotesInput(false);
      toast({ title: "VIP notes saved" });
    },
  });

  const overnightMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/parking/tickets/${ticket.id}/overnight`, { isOvernight: !ticket.isOvernight });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/stats", outletId] });
      toast({ title: ticket.isOvernight ? "Overnight removed" : "Marked as overnight" });
    },
  });
  const reportIncidentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/parking/incidents", {
        outletId,
        ticketId: ticket.id,
        incidentType: incidentForm.incidentType,
        severity: incidentForm.severity,
        description: incidentForm.description,
        vehicleNumber: ticket.vehicleNumber,
        customerName: ticket.customerName,
        customerPhone: ticket.customerPhone,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/incidents", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/incidents/summary", outletId] });
      setIncidentConfirm(data.incidentNumber);
      setShowIncidentForm(false);
      setIncidentForm({ incidentType: "OTHER", severity: "LOW", description: "" });
    },
    onError: (err: Error) => toast({ title: "Failed to report incident", description: err.message, variant: "destructive" }),
  });

  const entryCondition = ticket.conditionReport;

  const cardBorder = ticket.isOvernight
    ? "border-indigo-400 bg-indigo-50/30"
    : ticket.isVip
      ? "border-yellow-400 bg-yellow-50/20"
      : "";

  return (
    <Card data-testid={`card-ticket-${ticket.ticketNumber}`} className={`hover:shadow-sm transition-shadow ${cardBorder}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getVehicleIcon(ticket.vehicleType)}</span>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-sm font-mono" data-testid={`text-ticket-num-${ticket.id}`}>{ticket.ticketNumber}</p>
                {ticket.isVip && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-400 text-yellow-900" data-testid={`badge-vip-${ticket.id}`}>
                    <Star className="h-2.5 w-2.5" /> VIP
                  </span>
                )}
                {ticket.isOvernight && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700" data-testid={`badge-overnight-${ticket.id}`}>
                    <Moon className="h-2.5 w-2.5" /> Overnight
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground" data-testid={`text-vehicle-num-${ticket.id}`}>{ticket.vehicleNumber}</p>
            </div>
          </div>
          <StatusBadge status={ticket.status} />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3">
          {ticket.customerName && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span data-testid={`text-customer-name-${ticket.id}`}>{ticket.customerName}</span>
            </div>
          )}
          {ticket.slotCode && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span data-testid={`text-slot-code-${ticket.id}`}>{ticket.slotCode}</span>
            </div>
          )}
          {ticket.tableAssignment && (
            <div className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              <span>Table {ticket.tableAssignment}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Timer className="h-3 w-3" />
            <LiveTimer entryTime={ticket.entryTime} />
          </div>
        </div>

        {/* VIP Notes */}
        {ticket.isVip && ticket.vipNotes && (
          <div className="mb-2 text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-md px-2 py-1 flex items-start gap-1.5" data-testid={`vip-notes-${ticket.id}`}>
            <Star className="h-3 w-3 mt-0.5 text-yellow-600 shrink-0" />
            <span>{ticket.vipNotes}</span>
          </div>
        )}

        {/* Entry condition summary (if recorded) */}
        {entryCondition && (
          <div className="mb-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-2 py-1" data-testid={`condition-summary-${ticket.id}`}>
            Entry: Body {entryCondition.body} · Interior {entryCondition.interior} · Fuel {entryCondition.fuelLevel}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {ticket.status === "parked" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateMutation.mutate("requested")} data-testid={`button-mark-requested-${ticket.id}`}>
              Mark Requested
            </Button>
          )}
          {ticket.status === "requested" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateMutation.mutate("retrieving")} data-testid={`button-mark-retrieving-${ticket.id}`}>
              Mark Retrieving
            </Button>
          )}
          {ticket.status === "retrieving" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateMutation.mutate("ready")} data-testid={`button-mark-ready-${ticket.id}`}>
              Mark Ready
            </Button>
          )}
          {(ticket.status === "ready" || ticket.status === "retrieving") && (
            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
              onClick={() => {
                // Prefill exit condition with entry condition so only actual changes are highlighted
                if (entryCondition) {
                  setExitCondition({
                    body: entryCondition.body ?? "clean",
                    interior: entryCondition.interior ?? "clean",
                    fuelLevel: entryCondition.fuelLevel ?? "full",
                    acWorking: entryCondition.acWorking ?? "yes",
                    spareTyre: entryCondition.spareTyre ?? "yes",
                    notes: "",
                  });
                }
                setShowExitCondition(true);
              }}
              data-testid={`button-complete-${ticket.id}`}
            >
              Complete
            </Button>
          )}
          {ticket.status !== "completed" && ticket.status !== "cancelled" && (
            <>
              <Button
                size="sm"
                variant={ticket.isVip ? "default" : "outline"}
                className={`h-7 text-xs ${ticket.isVip ? "bg-yellow-400 hover:bg-yellow-500 text-yellow-900 border-yellow-400" : "border-yellow-300 text-yellow-700 hover:bg-yellow-50"}`}
                onClick={() => {
                  if (!ticket.isVip) {
                    setShowVipNotesInput(true);
                  } else {
                    vipMutation.mutate();
                  }
                }}
                disabled={vipMutation.isPending}
                data-testid={`button-toggle-vip-${ticket.id}`}
              >
                <Star className="h-3 w-3 mr-0.5" /> {ticket.isVip ? "VIP" : "Set VIP"}
              </Button>
              <Button
                size="sm"
                variant={ticket.isOvernight ? "default" : "outline"}
                className={`h-7 text-xs ${ticket.isOvernight ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600" : "border-indigo-300 text-indigo-700 hover:bg-indigo-50"}`}
                onClick={() => overnightMutation.mutate()}
                disabled={overnightMutation.isPending}
                data-testid={`button-toggle-overnight-${ticket.id}`}
              >
                <Moon className="h-3 w-3 mr-0.5" /> {ticket.isOvernight ? "Overnight" : "Overnight"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => updateMutation.mutate("cancelled")} data-testid={`button-cancel-${ticket.id}`}>
                Cancel
              </Button>
            </>
          )}
          {ticket.status !== "completed" && ticket.status !== "cancelled" && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-orange-600 hover:text-orange-700" onClick={() => setShowIncidentForm(true)} data-testid={`button-report-incident-${ticket.id}`}>
              <TriangleAlert className="h-3 w-3 mr-1" /> Report Incident
            </Button>
          )}
          {ticket.keyLocation === "LOST" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full border border-red-200" data-testid={`badge-lost-key-${ticket.id}`}>
              <KeyRound className="h-3 w-3" /> Lost Key
            </span>
          )}
        </div>

        {/* VIP Notes inline form */}
        {showVipNotesInput && (
          <div className="mt-2 p-2 rounded-lg border border-yellow-200 bg-yellow-50/40 space-y-2" data-testid={`vip-notes-form-${ticket.id}`}>
            <Label className="text-xs font-semibold text-yellow-800">Add VIP Notes (optional)</Label>
            <Input
              value={vipNotesDraft}
              onChange={e => setVipNotesDraft(e.target.value)}
              placeholder="e.g. Regular guest, preferred parking spot A1"
              className="h-7 text-xs bg-white"
              data-testid={`input-vip-notes-${ticket.id}`}
            />
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setShowVipNotesInput(false)}>Cancel</Button>
              <Button
                size="sm"
                className="h-6 text-[10px] bg-yellow-400 hover:bg-yellow-500 text-yellow-900 border-yellow-400"
                onClick={() => vipMutation.mutate(vipNotesDraft || undefined)}
                disabled={vipMutation.isPending}
                data-testid={`button-confirm-vip-${ticket.id}`}
              >
                Confirm VIP
              </Button>
              {vipNotesDraft && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px]"
                  onClick={() => saveVipNotesMutation.mutate()}
                  disabled={saveVipNotesMutation.isPending}
                  data-testid={`button-save-vip-notes-${ticket.id}`}
                >
                  Save Notes Only
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Incident Confirmation */}
        {incidentConfirm && (
          <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700 flex items-center justify-between" data-testid={`incident-confirm-${ticket.id}`}>
            <span>Incident <strong>{incidentConfirm}</strong> filed</span>
            <button onClick={() => setIncidentConfirm(null)} className="ml-2 text-orange-400 hover:text-orange-600"><X className="h-3 w-3" /></button>
          </div>
        )}

        {/* Report Incident Form */}
        {showIncidentForm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="incident-report-dialog">
            <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-orange-500" /> Report Incident</h3>
                <button onClick={() => setShowIncidentForm(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
              </div>
              <p className="text-xs text-muted-foreground">Ticket {ticket.ticketNumber} · {ticket.vehicleNumber}</p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Incident Type</Label>
                  <Select value={incidentForm.incidentType} onValueChange={v => setIncidentForm(f => ({ ...f, incidentType: v }))}>
                    <SelectTrigger className="h-8 text-xs mt-1" data-testid="select-incident-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VEHICLE_DAMAGE">Vehicle Damage</SelectItem>
                      <SelectItem value="LOST_KEY">Lost Key</SelectItem>
                      <SelectItem value="ACCIDENT">Accident</SelectItem>
                      <SelectItem value="THEFT">Theft</SelectItem>
                      <SelectItem value="CUSTOMER_COMPLAINT">Customer Complaint</SelectItem>
                      <SelectItem value="WRONG_VEHICLE_MOVED">Wrong Vehicle Moved</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Severity</Label>
                  <Select value={incidentForm.severity} onValueChange={v => setIncidentForm(f => ({ ...f, severity: v }))}>
                    <SelectTrigger className="h-8 text-xs mt-1" data-testid="select-incident-severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    className="mt-1 text-xs"
                    rows={3}
                    placeholder="Describe what happened..."
                    value={incidentForm.description}
                    onChange={e => setIncidentForm(f => ({ ...f, description: e.target.value }))}
                    data-testid="input-incident-description"
                  />
                </div>
                {(incidentForm.severity === "HIGH" || incidentForm.severity === "CRITICAL") && (
                  <p className="text-xs text-red-600 bg-red-50 rounded p-2 border border-red-200">
                    ⚠ This ticket will be marked as <strong>Incident</strong> status
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button variant="ghost" size="sm" className="flex-1" onClick={() => setShowIncidentForm(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-orange-600 hover:bg-orange-700"
                    disabled={!incidentForm.description.trim() || reportIncidentMutation.isPending}
                    onClick={() => reportIncidentMutation.mutate()}
                    data-testid="button-submit-incident"
                  >
                    {reportIncidentMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Submit"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Exit Condition Dialog */}
        {showExitCondition && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="exit-condition-dialog">
            <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto">
              <h3 className="font-bold text-base">Exit Condition Check</h3>
              {/* Diff vs entry condition */}
              {entryCondition && (() => {
                const fuelLabel = (v: string) => ({ quarter: "¼", half: "½", three_quarter: "¾", full: "Full" }[v] || v);
                const diffFields = [
                  { key: "body", label: "Body", entry: entryCondition.body, exit: exitCondition.body, fmt: (v: string) => v?.replace(/_/g, " ") },
                  { key: "interior", label: "Interior", entry: entryCondition.interior, exit: exitCondition.interior, fmt: (v: string) => v },
                  { key: "fuelLevel", label: "Fuel", entry: entryCondition.fuelLevel, exit: exitCondition.fuelLevel, fmt: fuelLabel },
                  { key: "acWorking", label: "A/C", entry: entryCondition.acWorking, exit: exitCondition.acWorking, fmt: (v: string) => v === "yes" ? "Working" : "Faulty" },
                  { key: "spareTyre", label: "Spare", entry: entryCondition.spareTyre, exit: exitCondition.spareTyre, fmt: (v: string) => v === "yes" ? "Present" : "Missing" },
                ];
                return (
                  <div className="rounded-lg border p-3 text-xs space-y-1" data-testid="condition-diff-entry">
                    <p className="font-semibold text-muted-foreground mb-1">Entry → Exit comparison:</p>
                    <div className="space-y-1">
                      {diffFields.map(f => {
                        const changed = f.entry !== f.exit && f.exit !== undefined;
                        return (
                          <div key={f.key} className={`flex items-center gap-1 ${changed ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                            <span className="w-10 shrink-0">{f.label}:</span>
                            <span>{f.fmt(f.entry || "")}</span>
                            {changed && <><span>→</span><span className="text-red-600">{f.fmt(f.exit || "")}</span></>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                <div>
                  <label className="text-xs font-semibold block mb-1">Body Condition</label>
                  <div className="flex flex-wrap gap-1.5">
                    {["clean", "minor_scratches", "dents", "major_damage"].map(v => (
                      <button key={v}
                        data-testid={`exit-body-${v}`}
                        onClick={() => setExitCondition(c => ({ ...c, body: v }))}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${exitCondition.body === v ? "bg-primary/10 border-primary text-primary" : "border-muted"}`}
                      >{v.replace(/_/g, " ")}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">Interior</label>
                  <div className="flex gap-1.5">
                    {["clean", "dirty", "damage"].map(v => (
                      <button key={v}
                        data-testid={`exit-interior-${v}`}
                        onClick={() => setExitCondition(c => ({ ...c, interior: v }))}
                        className={`flex-1 py-1 rounded-lg border text-xs font-medium ${exitCondition.interior === v ? "bg-primary/10 border-primary text-primary" : "border-muted"}`}
                      >{v}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">Fuel Level</label>
                  <div className="flex gap-1.5">
                    {[
                      { value: "quarter", label: "¼" },
                      { value: "half", label: "½" },
                      { value: "three_quarter", label: "¾" },
                      { value: "full", label: "Full" },
                    ].map(opt => (
                      <button key={opt.value}
                        data-testid={`exit-fuel-${opt.value}`}
                        onClick={() => setExitCondition(c => ({ ...c, fuelLevel: opt.value }))}
                        className={`flex-1 py-1 rounded-lg border text-xs font-medium ${exitCondition.fuelLevel === opt.value ? "bg-amber-100 border-amber-400 text-amber-700" : "border-muted"}`}
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold block mb-1">A/C</label>
                    <div className="flex gap-1.5">
                      {["yes", "no"].map(v => (
                        <button key={v}
                          data-testid={`exit-ac-${v}`}
                          onClick={() => setExitCondition(c => ({ ...c, acWorking: v }))}
                          className={`flex-1 py-1 rounded-lg border text-xs font-medium ${exitCondition.acWorking === v ? "bg-primary/10 border-primary text-primary" : "border-muted"}`}
                        >{v === "yes" ? "Working" : "Faulty"}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">Spare Tyre</label>
                    <div className="flex gap-1.5">
                      {["yes", "no"].map(v => (
                        <button key={v}
                          data-testid={`exit-spare-${v}`}
                          onClick={() => setExitCondition(c => ({ ...c, spareTyre: v }))}
                          className={`flex-1 py-1 rounded-lg border text-xs font-medium ${exitCondition.spareTyre === v ? "bg-primary/10 border-primary text-primary" : "border-muted"}`}
                        >{v === "yes" ? "Present" : "Missing"}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">Notes</label>
                  <Textarea
                    rows={2}
                    placeholder="Any exit notes..."
                    value={exitCondition.notes}
                    onChange={e => setExitCondition(c => ({ ...c, notes: e.target.value }))}
                    className="text-xs"
                    data-testid="exit-condition-notes"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1 flex items-center gap-1">
                    <Banknote className="h-3 w-3 text-green-600" /> Tip Amount (optional)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={tipAmount}
                    onChange={e => setTipAmount(e.target.value)}
                    className="text-xs h-8"
                    data-testid="input-tip-amount"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowExitCondition(false)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => completeWithConditionMutation.mutate()}
                  disabled={completeWithConditionMutation.isPending}
                  data-testid="button-confirm-exit-condition"
                >
                  {completeWithConditionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RetrievalRequestCard({ request, outletId }: { request: any; outletId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [valetName, setValetName] = useState(request.assignedValetName || "");
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [showPriorityForm, setShowPriorityForm] = useState(false);
  const [editPriority, setEditPriority] = useState(request.priority || "NORMAL");
  const estimatedReadyAtVal = request.estimatedReadyAt ?? request.estimated_ready_at;
  const [editEstimatedReady, setEditEstimatedReady] = useState(estimatedReadyAtVal ? new Date(estimatedReadyAtVal).toISOString().slice(0,16) : "");
  const isManager = user?.role === "owner" || user?.role === "manager";

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/parking/retrieval-requests/${request.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/retrieval-requests", outletId] });
      toast({ title: "Request updated" });
      setShowAssignForm(false);
      setShowPriorityForm(false);
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const priorityClass = (request.priority === "VIP" || request.is_vip)
    ? "border-yellow-400 bg-yellow-50/50"
    : request.priority === "URGENT"
      ? "border-red-300 bg-red-50/30"
      : "border-amber-200 bg-amber-50/50";

  return (
    <Card data-testid={`card-retrieval-${request.id}`} className={priorityClass}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {(request.priority === "VIP" || request.is_vip) && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-400 text-yellow-900" data-testid={`badge-priority-vip-${request.id}`}>
                  <Star className="h-2.5 w-2.5" /> VIP
                </span>
              )}
              {request.priority === "URGENT" && request.priority !== "VIP" && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                  URGENT
                </span>
              )}
              <SourceBadge source={request.requestSource || request.source} />
              <p className="font-bold text-sm font-mono" data-testid={`text-retrieval-ticket-${request.id}`}>{request.ticketNumber || request.ticket_number}</p>
            </div>
            {(request.vehicleNumber || request.vehicle_number) && (
              <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-retrieval-vehicle-${request.id}`}>
                {(request.vehicleType || request.vehicle_type) && `${getVehicleIcon(request.vehicleType || request.vehicle_type)} `}{request.vehicleNumber || request.vehicle_number}
                {(request.vehicleColor || request.vehicle_color) && ` · ${request.vehicleColor || request.vehicle_color}`}
              </p>
            )}
            {(request.estimatedReadyAt ?? request.estimated_ready_at) && (
              <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                <Timer className="h-3 w-3" /> Ready at: {new Date(request.estimatedReadyAt ?? request.estimated_ready_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            {request.assignedValetName && (
              <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1" data-testid={`text-assigned-valet-${request.id}`}>
                <User className="h-3 w-3" /> {request.assignedValetName}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={request.status} />
            {request.queuePosition != null && (
              <span className="text-[10px] text-muted-foreground">#{request.queuePosition || request.queue_position}</span>
            )}
          </div>
        </div>

        {request.estimatedWaitMinutes && (
          <p className="text-xs text-muted-foreground mb-2">Est. wait: {request.estimatedWaitMinutes} min</p>
        )}

        {/* Manager-editable priority and estimated ready time */}
        {showPriorityForm && isManager && (
          <div className="mb-2 p-2 rounded-lg border bg-muted/20 space-y-2" data-testid={`priority-form-${request.id}`}>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Priority</Label>
                <Select value={editPriority} onValueChange={setEditPriority}>
                  <SelectTrigger className="h-7 text-xs" data-testid={`select-priority-${request.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIP">VIP</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Est. Ready At</Label>
                <Input
                  type="datetime-local"
                  value={editEstimatedReady}
                  onChange={e => setEditEstimatedReady(e.target.value)}
                  className="h-7 text-xs"
                  data-testid={`input-estimated-ready-${request.id}`}
                />
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setShowPriorityForm(false)}>Cancel</Button>
              <Button
                size="sm"
                className="h-6 text-[10px]"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ priority: editPriority, estimatedReadyAt: editEstimatedReady || null })}
                data-testid={`button-save-priority-${request.id}`}
              >
                Save
              </Button>
            </div>
          </div>
        )}

        {showAssignForm && (
          <div className="flex gap-2 mb-2">
            <Input
              value={valetName}
              onChange={e => setValetName(e.target.value)}
              placeholder="Valet name"
              className="h-7 text-xs flex-1"
              data-testid={`input-valet-name-${request.id}`}
            />
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!valetName.trim() || updateMutation.isPending}
              onClick={() => updateMutation.mutate({ status: "assigned", assignedValetName: valetName.trim() })}
              data-testid={`button-confirm-assign-${request.id}`}
            >
              Assign
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAssignForm(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mt-2">
          {isManager && request.status !== "completed" && request.status !== "cancelled" && (
            <Button size="sm" variant="outline" className="h-7 text-xs border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setShowPriorityForm(v => !v)} data-testid={`button-edit-priority-${request.id}`}>
              <Star className="h-3 w-3 mr-1" /> Priority
            </Button>
          )}
          {request.status === "pending" && !showAssignForm && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAssignForm(true)} data-testid={`button-assign-valet-${request.id}`}>
              <User className="h-3 w-3 mr-1" /> Assign Valet
            </Button>
          )}
          {request.status === "pending" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateMutation.mutate({ status: "assigned" })} data-testid={`button-skip-assign-${request.id}`}>
              Start (No Assign)
            </Button>
          )}
          {request.status === "assigned" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateMutation.mutate({ status: "in_progress" })} data-testid={`button-mark-in-progress-${request.id}`}>
              Mark In Progress
            </Button>
          )}
          {request.status === "in_progress" && (
            <Button size="sm" variant="outline" className="h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-50" onClick={() => updateMutation.mutate({ status: "ready" })} data-testid={`button-mark-ready-${request.id}`}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Ready
            </Button>
          )}
          {(request.status === "in_progress" || request.status === "assigned" || request.status === "ready") && (
            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => updateMutation.mutate({ status: "completed" })} data-testid={`button-complete-retrieval-${request.id}`}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
            </Button>
          )}
          {request.status !== "completed" && request.status !== "cancelled" && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => updateMutation.mutate({ status: "cancelled" })} data-testid={`button-cancel-retrieval-${request.id}`}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SlotDetailDialog({ slot, outletId, onClose }: { slot: any; outletId: string; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation("modules");

  const requestRetrievalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/parking/retrieval-requests", {
        outletId,
        ticketId: slot.ticketId,
        requestSource: "STAFF",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/retrieval-requests", outletId] });
      toast({ title: "Retrieval request created" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const releaseSlotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/parking/tickets/${slot.ticketId}/status`, { status: "completed" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/slots", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      toast({ title: "Slot released" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Slot {slot.code} — Occupied</DialogTitle>
          <DialogDescription>Vehicle details and quick actions</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Vehicle</span>
            <span className="font-medium" data-testid="slot-vehicle-number">{slot.vehicleNumber ?? "—"}</span>
          </div>
          {slot.vehicleType && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span>{getVehicleIcon(slot.vehicleType)} {slot.vehicleType}</span>
            </div>
          )}
          {slot.vehicleColor && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Color</span>
              <span>{slot.vehicleColor}</span>
            </div>
          )}
          {slot.customerName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span data-testid="slot-customer-name">{slot.customerName}</span>
            </div>
          )}
          {slot.entryTime && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("duration")}</span>
              <LiveTimer entryTime={slot.entryTime} />
            </div>
          )}
          {slot.zoneName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Zone</span>
              <span>{slot.zoneName}</span>
            </div>
          )}
        </div>
        <Separator />
        <div className="flex flex-col gap-2">
          {slot.ticketId && (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs"
              onClick={() => requestRetrievalMutation.mutate()}
              disabled={requestRetrievalMutation.isPending}
              data-testid="button-slot-request-retrieval"
            >
              <Car className="h-3.5 w-3.5 mr-1" />
              {requestRetrievalMutation.isPending ? "Requesting..." : "Request Vehicle Retrieval"}
            </Button>
          )}
          {slot.ticketId && (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs text-green-700 border-green-300 hover:bg-green-50"
              onClick={() => releaseSlotMutation.mutate()}
              disabled={releaseSlotMutation.isPending}
              data-testid="button-slot-release"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              {releaseSlotMutation.isPending ? "Releasing..." : "Release Slot (Check-out)"}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="w-full text-xs text-muted-foreground" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SLOT_W = 72;
const SLOT_H = 56;

function FloorPlanSlot({
  slot,
  onDragStart,
  onClick,
  isDragging,
}: {
  slot: any;
  onDragStart: (e: React.MouseEvent, slot: any) => void;
  onClick: (slot: any) => void;
  isDragging: boolean;
}) {
  const { t } = useTranslation("modules");
  const statusColors: Record<string, string> = {
    available: "#22c55e",
    occupied: "#ef4444",
    reserved: "#f59e0b",
    blocked: "#9ca3af",
    inactive: "#9ca3af",
    maintenance: "#f97316",
  };
  const color = statusColors[slot.status] ?? "#9ca3af";
  const isOccupied = slot.status === "occupied";
  const isHandicap = (slot.slotType ?? "").toUpperCase() === "HANDICAP";
  const isLarge = (slot.slotType ?? "").toUpperCase() === "LARGE";
  const w = isLarge ? SLOT_W * 1.4 : SLOT_W;
  const h = isLarge ? SLOT_H * 1.2 : SLOT_H;
  const title = isOccupied ? `${slot.ticketNumber ?? ""} · ${slot.vehicleNumber ?? ""} · ${slot.entryTime ? new Date(slot.entryTime).toLocaleTimeString() : ""}` : slot.status;

  return (
    <div
      id={`fp-slot-${slot.id}`}
      data-testid={`fp-slot-${slot.code}`}
      title={title}
      onMouseDown={e => onDragStart(e, slot)}
      onClick={() => isOccupied && onClick(slot)}
      style={{
        position: "absolute",
        left: slot.posX ?? 20,
        top: slot.posY ?? 20,
        width: w,
        height: h,
        backgroundColor: color + "22",
        border: `2px solid ${color}`,
        borderRadius: 8,
        cursor: isOccupied ? "pointer" : "grab",
        opacity: isDragging ? 0.5 : 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        zIndex: isDragging ? 50 : 1,
        transition: isDragging ? "none" : "box-shadow 0.15s",
      }}
      className="hover:shadow-md"
    >
      <div className="text-xs font-bold" style={{ color }}>{slot.code}</div>
      {isHandicap && <div className="text-xs">♿</div>}
      {isOccupied && slot.vehicleNumber && (
        <div className="text-[9px] text-center px-1 truncate" style={{ color, maxWidth: w - 8 }}>{slot.vehicleNumber}</div>
      )}
      {isOccupied && slot.entryTime && (
        <div className="text-[9px] opacity-70">
          <LiveTimer entryTime={slot.entryTime} />
        </div>
      )}
    </div>
  );
}

function SlotBoard({ outletId }: { outletId: string }) {
  const [popoverTicket, setPopoverTicket] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"list" | "floor">("list");
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: slotsData = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/parking/slots", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/slots/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  useEffect(() => {
    if (slotsData.length >= 10 && viewMode === "list") {
      setViewMode("floor");
    }
  }, [slotsData.length]);

  const positionMutation = useMutation({
    mutationFn: async ({ id, posX, posY }: { id: string; posX: number; posY: number }) => {
      const res = await apiRequest("PATCH", `/api/parking/slots/${outletId}/${id}`, { posX, posY });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/slots", outletId] });
    },
    onError: () => toast({ title: "Failed to save position", variant: "destructive" }),
  });

  const handleDragStart = useCallback((e: React.MouseEvent, slot: any) => {
    if (!canvasRef.current) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left - (slot.posX ?? 20),
      y: e.clientY - rect.top - (slot.posY ?? 20),
    };
    setDraggingSlotId(slot.id);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingSlotId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const newX = Math.max(0, e.clientX - rect.left - dragOffset.current.x);
    const newY = Math.max(0, e.clientY - rect.top - dragOffset.current.y);
    const el = document.getElementById(`fp-slot-${draggingSlotId}`);
    if (el) { el.style.left = `${newX}px`; el.style.top = `${newY}px`; }
  }, [draggingSlotId]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!draggingSlotId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const newX = Math.max(0, Math.round(e.clientX - rect.left - dragOffset.current.x));
    const newY = Math.max(0, Math.round(e.clientY - rect.top - dragOffset.current.y));
    positionMutation.mutate({ id: draggingSlotId, posX: newX, posY: newY });
    setDraggingSlotId(null);
  }, [draggingSlotId, positionMutation]);

  const zones: Record<string, any[]> = {};
  for (const slot of slotsData) {
    const zoneKey = slot.zoneName ?? "General";
    if (!zones[zoneKey]) zones[zoneKey] = [];
    zones[zoneKey].push(slot);
  }

  function getSlotClass(status: string) {
    switch (status) {
      case "available": return "bg-green-100 border-green-300 text-green-800 hover:bg-green-200";
      case "occupied": return "bg-red-100 border-red-300 text-red-800 hover:bg-red-200 cursor-pointer";
      case "blocked": return "bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed";
      case "maintenance": return "bg-orange-100 border-orange-300 text-orange-700";
      default: return "bg-muted border text-muted-foreground";
    }
  }

  function getSlotIcon(status: string) {
    switch (status) {
      case "available": return "✅";
      case "occupied": return "🔴";
      case "blocked": return "⬛";
      case "maintenance": return "🔧";
      default: return "—";
    }
  }

  if (slotsData.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="slot-board-empty">
        <ParkingSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No slots configured yet</p>
        <p className="text-xs mt-1">Add zones and slots in the Settings tab</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="slot-board">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <button
              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${viewMode === "list" ? "bg-primary text-white" : "hover:bg-muted/50"}`}
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${viewMode === "floor" ? "bg-primary text-white" : "hover:bg-muted/50"}`}
              onClick={() => setViewMode("floor")}
              data-testid="button-view-floor"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Floor Plan
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Available</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Reserved</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Occupied</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Inactive</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-slots">
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {viewMode === "list" && (
        <div className="space-y-6">
          {Object.entries(zones).map(([zoneName, zoneSlots]) => {
            const zoneColor = zoneSlots[0]?.zoneColor ?? "#6366f1";
            return (
              <div key={zoneName} data-testid={`zone-${zoneName}`}>
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-t-lg text-white text-sm font-semibold"
                  style={{ backgroundColor: zoneColor }}
                >
                  <Layers className="h-4 w-4" />
                  {zoneName}
                  <span className="ml-auto text-xs opacity-80">
                    {zoneSlots.filter(s => s.status === "available").length}/{zoneSlots.length} available
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 p-3 bg-muted/30 rounded-b-lg border border-t-0">
                  {zoneSlots.map((slot: any) => (
                    <button
                      key={slot.id}
                      data-testid={`card-slot-${slot.code}`}
                      className={`p-2 rounded-lg border text-center text-xs font-medium transition-all ${getSlotClass(slot.status)}`}
                      onClick={() => slot.status === "occupied" && setPopoverTicket(slot)}
                      title={slot.status === "occupied" ? `${slot.vehicleNumber ?? ""} (${slot.status})` : slot.status}
                    >
                      <div className="text-sm mb-0.5">{getSlotIcon(slot.status)}</div>
                      <div className="font-bold">{slot.code}</div>
                      {slot.status === "occupied" && slot.vehicleNumber && (
                        <div className="text-[9px] truncate opacity-80">{slot.vehicleNumber}</div>
                      )}
                      {slot.status === "occupied" && slot.entryTime && (
                        <div className="text-[9px] opacity-70 mt-0.5" data-testid={`text-slot-duration-${slot.code}`}>
                          <LiveTimer entryTime={slot.entryTime} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "floor" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <LayoutGrid className="h-3 w-3" /> Drag slots to rearrange. Click an occupied slot for details.
          </p>
          <div
            ref={canvasRef}
            data-testid="floor-plan-canvas"
            className="relative bg-muted/20 border-2 border-dashed border-muted rounded-xl overflow-auto"
            style={{ minHeight: 500, minWidth: "100%" }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { if (draggingSlotId) setDraggingSlotId(null); }}
          >
            {Object.entries(zones).map(([zoneName, zoneSlots]) => {
              const zoneColor = zoneSlots[0]?.zoneColor ?? "#6366f1";
              const withPos = zoneSlots.filter(s => s.posX != null && s.posY != null);
              if (withPos.length === 0) return null;
              const minX = Math.min(...withPos.map((s: any) => s.posX));
              const minY = Math.min(...withPos.map((s: any) => s.posY));
              const maxX = Math.max(...withPos.map((s: any) => s.posX + SLOT_W));
              const maxY = Math.max(...withPos.map((s: any) => s.posY + SLOT_H));
              const pad = 16;
              return (
                <div
                  key={zoneName}
                  style={{
                    position: "absolute",
                    left: minX - pad,
                    top: minY - pad,
                    width: maxX - minX + pad * 2,
                    height: maxY - minY + pad * 2,
                    backgroundColor: zoneColor + "15",
                    border: `1.5px dashed ${zoneColor}66`,
                    borderRadius: 12,
                    pointerEvents: "none",
                  }}
                >
                  <span style={{ position: "absolute", top: 4, left: 8, fontSize: 10, color: zoneColor, fontWeight: 600 }}>{zoneName}</span>
                </div>
              );
            })}
            {slotsData.map((slot: any) => (
              <FloorPlanSlot
                key={slot.id}
                slot={slot}
                onDragStart={handleDragStart}
                onClick={(s) => setPopoverTicket(s)}
                isDragging={draggingSlotId === slot.id}
              />
            ))}
            {slotsData.every((s: any) => s.posX == null) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
                <LayoutGrid className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">Drag slots to position them on the floor plan</p>
              </div>
            )}
          </div>
        </div>
      )}

      {popoverTicket && (
        <SlotDetailDialog slot={popoverTicket} onClose={() => setPopoverTicket(null)} outletId={outletId} />
      )}
    </div>
  );
}

function StatsHeader({ outletId }: { outletId: string }) {
  const { user } = useAuth();
  const fmt = (v: number) => formatCurrency(v, user?.tenant?.currency ?? "USD", { position: (user?.tenant?.currencyPosition ?? "before") as "before" | "after", decimals: user?.tenant?.currencyDecimals ?? 2 });
  const { data: stats } = useQuery<any>({
    queryKey: ["/api/parking/stats", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/stats/${outletId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
    enabled: !!outletId,
  });

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="parking-stats-header">
      <div className="bg-card rounded-xl border p-3 text-center" data-testid="stat-vehicles-in">
        <p className="text-2xl font-bold text-blue-600">{stats?.vehiclesIn ?? "—"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Vehicles In</p>
      </div>
      <div className="bg-card rounded-xl border p-3 text-center" data-testid="stat-revenue">
        <p className="text-2xl font-bold text-green-600">{stats?.revenueToday != null ? fmt(stats.revenueToday) : "—"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Revenue Today</p>
      </div>
      <div className="bg-card rounded-xl border p-3 text-center" data-testid="stat-avg-duration">
        <p className="text-2xl font-bold text-amber-600">{stats?.avgDurationMinutes != null ? `${stats.avgDurationMinutes}m` : "—"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Avg Duration</p>
      </div>
      <div className="bg-card rounded-xl border p-3 text-center" data-testid="stat-available-slots">
        <p className="text-2xl font-bold text-purple-600">{stats?.availableSlots ?? "—"}<span className="text-base text-muted-foreground">/{stats?.totalSlots ?? "—"}</span></p>
        <p className="text-xs text-muted-foreground mt-0.5">Available Slots</p>
      </div>
    </div>
  );
}

// ─── Dashboard Tab ───────────────────────────────────────────────────────────
function DashboardTab({
  outletId,
  tickets,
  retrievalRequests,
}: {
  outletId: string;
  tickets: any[];
  retrievalRequests: any[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useTranslation("modules");
  const isOwnerOrManager = user?.role === "owner" || user?.role === "manager";
  const fmt = (v: number) => formatCurrency(v, user?.tenant?.currency ?? "USD", { position: (user?.tenant?.currencyPosition ?? "before") as "before" | "after", decimals: user?.tenant?.currencyDecimals ?? 2 });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/parking/stats", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/stats/${outletId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
    enabled: !!outletId,
  });

  const { data: valetStaff = [] } = useQuery<any[]>({
    queryKey: ["/api/parking/valet-staff", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/valet-staff/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 60000,
  });

  const { data: activeShift } = useQuery<any>({
    queryKey: ["/api/parking/shifts", outletId, "active"],
    queryFn: async () => {
      const res = await fetch(`/api/parking/shifts/${outletId}/active`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: incidentSummary } = useQuery<any>({
    queryKey: ["/api/parking/incidents/summary", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/incidents/${outletId}/summary`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!outletId && isOwnerOrManager,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: overnightData } = useQuery<any>({
    queryKey: ["/api/parking/overnight", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/overnight/${outletId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const [overnightCheckoutId, setOvernightCheckoutId] = useState<string | null>(null);
  const overnightTickets: any[] = overnightData?.tickets ?? [];
  const overnightFee = overnightData?.overnightFee ?? 0;

  const overnightCheckoutMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      const res = await apiRequest("PATCH", `/api/parking/tickets/${ticketId}/overnight-checkout`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/overnight", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/stats", outletId] });
      setOvernightCheckoutId(null);
      toast({ title: "Overnight checkout processed" });
    },
    onError: (err: Error) => toast({ title: "Checkout failed", description: err.message, variant: "destructive" }),
  });
  const overnightCount = tickets.filter((t: any) => t.isOvernight || t.is_overnight).length;
  const vipCount = tickets.filter((t: any) => t.isVip || t.is_vip).length;

  const onDutyStaff = valetStaff.filter((s: any) => s.isOnDuty && s.isActive !== false);

  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignName, setAssignName] = useState("");

  const pendingRetrievals = retrievalRequests
    .filter(r => ["pending", "assigned", "in_progress"].includes(r.status) &&
      !(r.scheduledFor && new Date(r.scheduledFor) > new Date()))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const advanceMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/parking/retrieval-requests/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/retrieval-requests", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/stats", outletId] });
      setAssigningId(null);
      setAssignName("");
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  function getNextStatus(status: string) {
    switch (status) {
      case "pending": return "assigned";
      case "assigned": return "in_progress";
      case "in_progress": return "ready";
      default: return null;
    }
  }

  return (
    <div className="space-y-5" data-testid="dashboard-tab">
      <h2 className="text-base font-semibold">Overview</h2>

      {/* Active Shift Banner */}
      {isOwnerOrManager && (
        activeShift ? (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm" data-testid="banner-active-shift">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="font-semibold text-green-800">Active Shift: {activeShift.shift_type ?? activeShift.shiftType}</span>
            </div>
            {(activeShift.head_valet_name ?? activeShift.headValetName) && (
              <span className="text-green-700 flex items-center gap-1">
                <UserCheck className="h-3.5 w-3.5" /> {activeShift.head_valet_name ?? activeShift.headValetName}
              </span>
            )}
            <span className="text-green-700 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Since {new Date(activeShift.opened_at ?? activeShift.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-green-700 flex items-center gap-1">
              <Car className="h-3.5 w-3.5" /> {activeShift.vehicle_count ?? activeShift.vehicleCount} vehicles
            </span>
            {parseFloat(activeShift.total_tips ?? activeShift.totalTips ?? "0") > 0 && (
              <span className="text-green-700 flex items-center gap-1">
                <Banknote className="h-3.5 w-3.5" /> Tips: {fmt(parseFloat(activeShift.total_tips ?? activeShift.totalTips ?? "0"))}
              </span>
            )}
          </div>
        ) : (
          <div className="px-4 py-3 rounded-xl bg-muted/50 border border-muted text-sm text-muted-foreground" data-testid="banner-no-shift">
            No active shift — open one in the <strong>Shifts</strong> tab
          </div>
        )
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="dash-stat-vehicles-in">
          <CardContent className="p-4 text-center">
            <Car className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold text-blue-600">{stats?.vehiclesIn ?? tickets.length}</p>
            <p className="text-xs text-muted-foreground">Vehicles In</p>
          </CardContent>
        </Card>
        <Card data-testid="dash-stat-avg-duration">
          <CardContent className="p-4 text-center">
            <Timer className="h-5 w-5 mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold text-amber-600">{stats?.avgDurationMinutes != null ? `${stats.avgDurationMinutes}m` : "—"}</p>
            <p className="text-xs text-muted-foreground">Avg Duration</p>
          </CardContent>
        </Card>
        <Card data-testid="dash-stat-revenue">
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <p className="text-2xl font-bold text-green-600">{stats?.revenueToday != null ? fmt(stats.revenueToday) : "—"}</p>
            <p className="text-xs text-muted-foreground">Revenue Today</p>
          </CardContent>
        </Card>
        <Card data-testid="dash-stat-free-slots">
          <CardContent className="p-4 text-center">
            <ParkingSquare className="h-5 w-5 mx-auto mb-1 text-purple-500" />
            <p className="text-2xl font-bold text-purple-600">{stats?.availableSlots ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Free Slots</p>
          </CardContent>
        </Card>
      </div>

      {/* VIP + Overnight quick counts */}
      {(vipCount > 0 || overnightCount > 0) && (
        <div className="flex gap-3 flex-wrap">
          {vipCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200 text-xs font-medium text-yellow-800" data-testid="dash-vip-count">
              <Star className="h-3.5 w-3.5" /> {vipCount} VIP vehicle{vipCount !== 1 ? "s" : ""}
            </div>
          )}
          {overnightCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-medium text-indigo-800" data-testid="dash-overnight-count">
              <Moon className="h-3.5 w-3.5" /> {overnightCount} overnight vehicle{overnightCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      {pendingRetrievals.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-amber-700">
            <AlertCircle className="h-4 w-4" />
            Active Retrievals — by wait time
          </h3>
          <div className="space-y-2" data-testid="active-retrievals-table">
            {pendingRetrievals.map((r: any) => {
              const waitMs = Date.now() - new Date(r.createdAt).getTime();
              const waitMin = Math.floor(waitMs / 60000);
              const nextStatus = getNextStatus(r.status);
              const isAssigning = assigningId === r.id;
              return (
                <div
                  key={r.id}
                  data-testid={`row-retrieval-${r.id}`}
                  className={`flex flex-wrap items-center gap-2 p-3 rounded-lg border text-sm ${waitMin > 10 ? "bg-red-50 border-red-200" : waitMin > 5 ? "bg-amber-50 border-amber-200" : "bg-muted/30"}`}
                >
                  <span className="font-mono font-bold text-xs">{r.ticketNumber}</span>
                  <span className="text-xs text-muted-foreground">{r.vehicleNumber ?? "—"}</span>
                  <span className={`text-xs font-medium ${waitMin > 10 ? "text-red-600" : waitMin > 5 ? "text-amber-600" : "text-muted-foreground"}`} data-testid={`text-wait-${r.id}`}>
                    {waitMin}m wait
                  </span>
                  <StatusBadge status={r.status} />
                  {r.assignedValetName && (
                    <span className="text-xs text-blue-600 flex items-center gap-1">
                      <User className="h-3 w-3" />{r.assignedValetName}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2 flex-wrap">
                    {isAssigning ? (
                      <>
                        {onDutyStaff.length > 0 ? (
                          <Select value={assignName || "_none"} onValueChange={v => setAssignName(v === "_none" ? "" : v)}>
                            <SelectTrigger className="h-7 text-xs w-36" data-testid={`select-assign-staff-${r.id}`}>
                              <SelectValue placeholder="Pick valet..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">Manual entry</SelectItem>
                              {onDutyStaff.map((s: any) => (
                                <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            className="h-7 text-xs w-36"
                            placeholder="Valet name"
                            value={assignName}
                            onChange={e => setAssignName(e.target.value)}
                            data-testid={`input-assign-name-${r.id}`}
                          />
                        )}
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={advanceMutation.isPending}
                          onClick={() => advanceMutation.mutate({ id: r.id, body: { status: "assigned", assignedValetName: assignName.trim() || undefined } })}
                          data-testid={`button-confirm-assign-dash-${r.id}`}
                        >
                          Assign
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAssigningId(null); setAssignName(""); }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        {r.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => { setAssigningId(r.id); setAssignName(""); }}
                            data-testid={`button-assign-dash-${r.id}`}
                          >
                            <User className="h-3 w-3 mr-1" /> Assign Valet
                          </Button>
                        )}
                        {nextStatus && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={advanceMutation.isPending}
                            onClick={() => advanceMutation.mutate({ id: r.id, body: { status: nextStatus } })}
                            data-testid={`button-advance-dash-${r.id}`}
                          >
                            <ChevronRight className="h-3 w-3 mr-1" /> {nextStatus === "assigned" ? "Start" : nextStatus === "in_progress" ? "In Progress" : "Ready"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-green-600 hover:bg-green-700"
                          disabled={advanceMutation.isPending}
                          onClick={() => advanceMutation.mutate({ id: r.id, body: { status: "completed" } })}
                          data-testid={`button-complete-dash-${r.id}`}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tickets.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Car className="h-4 w-4 text-muted-foreground" />
            Currently Parked ({tickets.filter(t => t.status === "parked").length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {tickets.filter(t => t.status === "parked").slice(0, 6).map((ticket: any) => (
              <div key={ticket.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border text-sm" data-testid={`dash-ticket-${ticket.id}`}>
                <span className="text-xl">{getVehicleIcon(ticket.vehicleType)}</span>
                <div className="min-w-0">
                  <p className="font-mono font-bold text-xs truncate">{ticket.ticketNumber}</p>
                  <p className="text-xs text-muted-foreground truncate">{ticket.vehicleNumber}</p>
                  {ticket.slotCode && <p className="text-xs text-muted-foreground">Slot {ticket.slotCode}</p>}
                </div>
                <div className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                  <LiveTimer entryTime={ticket.entryTime} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Overnight Vehicles Section ─── */}
      {overnightTickets.length > 0 && (
        <div className="space-y-3" data-testid="overnight-section">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Moon className="h-4 w-4 text-indigo-500" />
            <Hourglass className="h-4 w-4 text-indigo-400" />
            Overnight Vehicles ({overnightTickets.length})
          </h3>
          <div className="space-y-2">
            {overnightTickets.map((t: any) => (
              <div key={t.id} className="p-3 rounded-lg border bg-indigo-50 border-indigo-200 flex flex-wrap items-center gap-2" data-testid={`row-overnight-${t.id}`}>
                <span className="text-lg">{getVehicleIcon(t.vehicleType)}</span>
                <div className="min-w-0">
                  <p className="font-mono font-bold text-xs">{t.ticketNumber}</p>
                  <p className="text-xs text-muted-foreground">{t.vehicleNumber}</p>
                </div>
                {t.customerName && <span className="text-xs text-muted-foreground">{t.customerName}</span>}
                {t.slotCode && <span className="text-xs bg-white border rounded px-1.5 py-0.5">{t.slotCode}</span>}
                <span className="text-xs text-indigo-600 font-medium">{t.hoursParked}h parked</span>
                <span className="text-xs text-indigo-700 font-semibold">{t.nights} night(s) · {fmt(t.estimatedOvernightFee)}</span>
                <Button
                  size="sm"
                  className="ml-auto h-7 text-xs bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => setOvernightCheckoutId(t.id)}
                  data-testid={`button-overnight-checkout-${t.id}`}
                >
                  Process Checkout
                </Button>
              </div>
            ))}
          </div>

          {/* Overnight Checkout Dialog */}
          {overnightCheckoutId && (() => {
            const t = overnightTickets.find(x => x.id === overnightCheckoutId);
            if (!t) return null;
            return (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="overnight-checkout-dialog">
                <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base flex items-center gap-2"><Moon className="h-4 w-4 text-indigo-500" /> Overnight Checkout</h3>
                    <button onClick={() => setOvernightCheckoutId(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Ticket</span><span className="font-mono font-bold">{t.ticketNumber}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Vehicle</span><span>{t.vehicleNumber}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Hours Parked</span><span>{t.hoursParked}h</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Nights</span><span>{t.nights}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Rate per Night</span><span>{fmt(overnightFee)}</span></div>
                    <Separator />
                    <div className="flex justify-between font-bold text-indigo-700"><span>Overnight Fee</span><span>{fmt(t.estimatedOvernightFee)}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="flex-1" onClick={() => setOvernightCheckoutId(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                      disabled={overnightCheckoutMutation.isPending}
                      onClick={() => overnightCheckoutMutation.mutate(t.id)}
                      data-testid="button-confirm-overnight-checkout"
                    >
                      {overnightCheckoutMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm Checkout"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ─── Incidents Summary Widget ─── */}
      {isOwnerOrManager && incidentSummary && incidentSummary.totalOpen > 0 && (
        <div className="space-y-2" data-testid="incidents-widget">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-orange-500" />
            Open Incidents
          </h3>
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-3 flex flex-wrap items-center gap-3">
              <div className="text-2xl font-bold text-orange-700" data-testid="text-incident-total">{incidentSummary.totalOpen}</div>
              <div className="text-xs text-orange-600">open incidents</div>
              <div className="flex gap-2 ml-auto flex-wrap">
                {incidentSummary.bySeverity.CRITICAL > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full" data-testid="badge-incident-critical">
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse inline-block" /> CRITICAL: {incidentSummary.bySeverity.CRITICAL}
                  </span>
                )}
                {incidentSummary.bySeverity.HIGH > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-100 border border-orange-200 px-2 py-0.5 rounded-full" data-testid="badge-incident-high">
                    <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> HIGH: {incidentSummary.bySeverity.HIGH}
                  </span>
                )}
                {incidentSummary.bySeverity.MEDIUM > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full" data-testid="badge-incident-medium">
                    <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> MED: {incidentSummary.bySeverity.MEDIUM}
                  </span>
                )}
                {incidentSummary.bySeverity.LOW > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full" data-testid="badge-incident-low">
                    <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> LOW: {incidentSummary.bySeverity.LOW}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ZoneHeatmap outletId={outletId} />
    </div>
  );
}

function ZoneHeatmap({ outletId }: { outletId: string }) {
  const { data: slots = [] } = useQuery<any[]>({
    queryKey: ["/api/parking/slots", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/slots/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const zoneMap: Record<string, { total: number; occupied: number; available: number; color: string }> = {};
  for (const slot of slots) {
    if (slot.isActive === false) continue;
    const zoneKey = slot.zoneName ?? "General";
    if (!zoneMap[zoneKey]) zoneMap[zoneKey] = { total: 0, occupied: 0, available: 0, color: slot.zoneColor ?? "#6366f1" };
    zoneMap[zoneKey].total++;
    if (slot.status === "occupied") zoneMap[zoneKey].occupied++;
    if (slot.status === "available") zoneMap[zoneKey].available++;
  }

  const entries = Object.entries(zoneMap);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-3" data-testid="zone-heatmap">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        Zone Utilization
      </h3>
      <div className="space-y-2">
        {entries.map(([zoneName, z]) => {
          const pct = z.total > 0 ? Math.round((z.occupied / z.total) * 100) : 0;
          const isFull = pct >= 100;
          const barColor = isFull || pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#22c55e";
          return (
            <div key={zoneName} data-testid={`zone-heatmap-${zoneName}`} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{zoneName}</span>
                <span className={`font-semibold ${isFull ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-green-600"}`}>
                  {z.occupied}/{z.total} ({pct}%){isFull ? " — FULL" : ` — ${z.available} available`}
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: barColor }}
                  data-testid={`zone-bar-${zoneName}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Revenue & History Tab ───────────────────────────────────────────────────
type DateFilter = "today" | "yesterday" | "week" | "month" | "custom";

function RevenueHistoryTab({ outletId }: { outletId: string }) {
  const { user } = useAuth();
  const { t } = useTranslation("modules");
  const fmt = (v: number) => formatCurrency(v, user?.tenant?.currency ?? "USD", { position: (user?.tenant?.currencyPosition ?? "before") as "before" | "after", decimals: user?.tenant?.currencyDecimals ?? 2 });
  const [filter, setFilter] = useState<DateFilter>("today");
  const [analyticsView, setAnalyticsView] = useState<"overview" | "history">("overview");
  const todayStr = new Date().toISOString().split("T")[0];
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo, setCustomTo] = useState(todayStr);

  function getDateRange(f: DateFilter): { from: string; to: string } {
    if (f === "custom") return { from: customFrom, to: customTo };
    const now = new Date();
    if (f === "today") {
      return { from: now.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
    }
    if (f === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const ys = y.toISOString().split("T")[0];
      return { from: ys, to: ys };
    }
    if (f === "week") {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: from.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
    }
    if (f === "month") {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: from.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
    }
    return { from: now.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
  }

  const { from, to } = getDateRange(filter);

  const { data: tickets = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/parking/tickets", outletId, "completed", from, to],
    queryFn: async () => {
      const res = await fetch(
        `/api/parking/tickets/${outletId}?status=completed&from=${from}&to=${to}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      const all: any[] = await res.json();
      return all.filter((t: any) => {
        if (!t.exitTime) return false;
        const exitDate = t.exitTime.split("T")[0];
        return exitDate >= from && exitDate <= to;
      });
    },
    enabled: !!outletId,
    staleTime: 30000,
  });

  const { data: analytics } = useQuery<any>({
    queryKey: ["/api/parking/analytics", outletId, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/parking/analytics/${outletId}?from=${from}&to=${to}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 30000,
  });

  const totalRevenue = tickets.reduce((sum: number, t: any) => sum + (parseFloat(t.chargeAmount ?? "0") || 0), 0);
  const totalDuration = tickets.reduce((sum: number, t: any) => sum + (t.durationMinutes ?? 0), 0);

  const peakHour = analytics?.peakHours?.length > 0
    ? analytics.peakHours.reduce((best: any, h: any) => h.count > best.count ? h : best, analytics.peakHours[0])
    : null;
  const maxPeakCount = analytics?.peakHours?.length > 0
    ? Math.max(...analytics.peakHours.map((h: any) => h.count))
    : 1;
  const maxZoneRev = analytics?.byZone?.length > 0
    ? Math.max(...analytics.byZone.map((z: any) => z.revenue))
    : 1;
  const maxVehicleRev = analytics?.byVehicleType?.length > 0
    ? Math.max(...analytics.byVehicleType.map((v: any) => v.revenue))
    : 1;
  const totalVehicleRev = analytics?.byVehicleType?.reduce((sum: number, v: any) => sum + v.revenue, 0) ?? 0;

  function exportCsv() {
    const headers = ["Ticket #", "Vehicle Type", "Vehicle Number", "Customer", "Entry Time", "Exit Time", "Duration (min)", "Zone", "Charge"];
    const rows = tickets.map((t: any) => [
      t.ticketNumber,
      t.vehicleType,
      t.vehicleNumber ?? "",
      t.customerName ?? "",
      t.entryTime ? new Date(t.entryTime).toLocaleString() : "",
      t.exitTime ? new Date(t.exitTime).toLocaleString() : "",
      t.durationMinutes ?? "",
      t.zoneName ?? "",
      t.chargeAmount ?? "0",
    ]);
    const csv = [headers, ...rows].map(r => r.map(String).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parking-history-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4" data-testid="revenue-history-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {(["today", "yesterday", "week", "month", "custom"] as DateFilter[]).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              data-testid={`filter-${f}`}
            >
              {f === "today" ? "Today" : f === "yesterday" ? "Yesterday" : f === "week" ? "This Week" : f === "month" ? "This Month" : "Custom Range"}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={tickets.length === 0} data-testid="button-export-csv">
          <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
        </Button>
      </div>

      {filter === "custom" && (
        <div className="flex flex-wrap gap-3 items-center p-3 bg-muted/30 rounded-lg border" data-testid="custom-date-range">
          <div className="flex items-center gap-2">
            <Label htmlFor="custom-from" className="text-xs whitespace-nowrap">From</Label>
            <Input
              id="custom-from"
              type="date"
              value={customFrom}
              max={customTo}
              onChange={e => setCustomFrom(e.target.value)}
              className="h-8 text-xs w-36"
              data-testid="input-custom-from"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="custom-to" className="text-xs whitespace-nowrap">To</Label>
            <Input
              id="custom-to"
              type="date"
              value={customTo}
              min={customFrom}
              max={todayStr}
              onChange={e => setCustomTo(e.target.value)}
              className="h-8 text-xs w-36"
              data-testid="input-custom-to"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold" data-testid="summary-total-tickets">{tickets.length}</p>
            <p className="text-xs text-muted-foreground">Total Tickets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold" data-testid="summary-total-duration">{formatMinutes(totalDuration)}</p>
            <p className="text-xs text-muted-foreground">Total Duration</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-green-600" data-testid="summary-total-revenue">{fmt(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </CardContent>
        </Card>
      </div>

      {peakHour != null && (
        <div className="flex flex-wrap gap-4 p-3 bg-muted/30 rounded-lg border text-xs" data-testid="summary-cards">
          <span>⏰ <strong>Peak hour:</strong> {peakHour.hour}:00–{peakHour.hour + 1}:00</span>
          {analytics?.byZone?.length > 0 && (
            <span>📍 <strong>Busiest zone:</strong> {[...analytics.byZone].sort((a: any, b: any) => b.count - a.count)[0]?.zoneName}</span>
          )}
          {tickets.length > 0 && (
            <span>⏱ <strong>Avg stay:</strong> {formatMinutes(Math.round(totalDuration / tickets.length))}</span>
          )}
        </div>
      )}

      <div className="flex border-b gap-1 mb-2">
        <button
          className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${analyticsView === "overview" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setAnalyticsView("overview")}
          data-testid="tab-analytics-overview"
        >
          Analytics
        </button>
        <button
          className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${analyticsView === "history" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setAnalyticsView("history")}
          data-testid="tab-analytics-history"
        >
          History ({tickets.length})
        </button>
      </div>

      {analyticsView === "overview" && (
        <div className="space-y-5" data-testid="analytics-overview">
          {analytics?.peakHours?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Peak Hour Chart</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-28" data-testid="peak-hour-chart">
                  {Array.from({ length: 24 }, (_, h) => {
                    const entry = analytics.peakHours.find((p: any) => p.hour === h);
                    const count = entry?.count ?? 0;
                    const heightPct = maxPeakCount > 0 ? Math.round((count / maxPeakCount) * 100) : 0;
                    const isPeak = peakHour?.hour === h;
                    return (
                      <div key={h} className="flex-1 flex flex-col items-center gap-0.5" title={`${h}:00 — ${count} entries`}>
                        <div
                          className={`w-full rounded-t transition-all ${isPeak ? "bg-blue-600" : "bg-blue-300"}`}
                          style={{ height: `${heightPct}%`, minHeight: count > 0 ? 2 : 0 }}
                        />
                        {h % 4 === 0 && <span className="text-[8px] text-muted-foreground">{h}</span>}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Hour of day (0–23) · Dark blue = peak hour</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analytics?.byVehicleType?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Revenue by Vehicle Type</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2" data-testid="chart-vehicle-type">
                  {analytics.byVehicleType.map((v: any) => {
                    const pct = totalVehicleRev > 0 ? Math.round((v.revenue / totalVehicleRev) * 100) : 0;
                    return (
                      <div key={v.vehicleType} className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span>{getVehicleIcon(v.vehicleType)} {v.vehicleType}</span>
                          <span className="font-medium">{fmt(v.revenue)} ({pct}%)</span>
                        </div>
                        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {analytics?.byZone?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Revenue by Zone</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2" data-testid="chart-zone-revenue">
                  {[...analytics.byZone].sort((a: any, b: any) => b.revenue - a.revenue).map((z: any) => {
                    const pct = maxZoneRev > 0 ? Math.round((z.revenue / maxZoneRev) * 100) : 0;
                    return (
                      <div key={z.zoneName} className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span>{z.zoneName}</span>
                          <span className="font-medium">{fmt(z.revenue)} ({z.count} tickets)</span>
                        </div>
                        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>

          {analytics?.durationTrend?.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Avg Duration Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-20" data-testid="duration-trend-chart">
                  {(() => {
                    const maxDur = Math.max(...analytics.durationTrend.map((d: any) => d.avgDuration));
                    return analytics.durationTrend.map((d: any, i: number) => {
                      const heightPct = maxDur > 0 ? Math.round((d.avgDuration / maxDur) * 100) : 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.day}: avg ${Math.round(d.avgDuration)}m`}>
                          <div className="w-full rounded-t bg-amber-400" style={{ height: `${heightPct}%`, minHeight: 2 }} />
                          <span className="text-[7px] text-muted-foreground truncate">{d.day?.slice(5)}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Average parking duration per day</p>
              </CardContent>
            </Card>
          )}

          {(!analytics || (analytics.peakHours?.length === 0 && analytics.byVehicleType?.length === 0)) && (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl" data-testid="empty-analytics">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No analytics data for this period</p>
            </div>
          )}
        </div>
      )}

      {analyticsView === "history" && (
        isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading history...
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl" data-testid="empty-history">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No completed tickets for this period</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-auto" data-testid="history-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket #</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>{t("duration")}</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Charge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t: any) => (
                  <TableRow key={t.id} data-testid={`row-history-${t.id}`}>
                    <TableCell className="font-mono text-xs font-bold">{t.ticketNumber}</TableCell>
                    <TableCell className="text-xs">
                      {getVehicleIcon(t.vehicleType)} {t.vehicleNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">{t.customerName ?? "—"}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {t.entryTime ? new Date(t.entryTime).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {t.exitTime ? new Date(t.exitTime).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{t.durationMinutes != null ? `${t.durationMinutes}m` : "—"}</TableCell>
                    <TableCell className="text-xs">{t.zoneName ?? "—"}</TableCell>
                    <TableCell className="text-xs font-medium text-green-700">{t.chargeAmount ? fmt(parseFloat(t.chargeAmount)) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}
    </div>
  );
}

// ─── Key Management Panel ────────────────────────────────────────────────────
function KeyManagementPanel({ outletId }: { outletId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [logForm, setLogForm] = useState({ ticketId: "", action: "KEY_RECEIVED", keyLocation: "", notes: "" });
  const [showLogForm, setShowLogForm] = useState(false);

  const { data: keyLocations = [] } = useQuery<any[]>({
    queryKey: ["/api/parking/key-locations", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/key-locations/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 30000,
  });

  const { data: keyLog = [] } = useQuery<any[]>({
    queryKey: ["/api/parking/key-log", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/key-log/${outletId}?limit=20`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const { data: activeTickets = [] } = useQuery<any[]>({
    queryKey: ["/api/parking/tickets", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/tickets/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId && showLogForm,
    staleTime: 30000,
  });

  const logMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/parking/key-log/${outletId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(logForm),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/key-log", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/key-locations", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      setLogForm({ ticketId: "", action: "KEY_RECEIVED", keyLocation: "", notes: "" });
      setShowLogForm(false);
      toast({ title: "Key action logged" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const actionColors: Record<string, string> = {
    KEY_RECEIVED: "bg-blue-100 text-blue-700",
    KEY_STORED: "bg-green-100 text-green-700",
    KEY_TAKEN: "bg-amber-100 text-amber-700",
    KEY_RETURNED_TO_CUSTOMER: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="space-y-4 mt-4" data-testid="key-management-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Key className="h-4 w-4 text-amber-600" /> Key Board
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowLogForm(v => !v)} data-testid="button-log-key-action">
          <Plus className="h-3.5 w-3.5 mr-1" /> Log Key Action
        </Button>
      </div>

      {/* Key storage location cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {keyLocations.map((loc: any) => (
          <div key={loc.id} className="rounded-lg border p-3 bg-muted/20" data-testid={`key-location-${loc.location_code}`}>
            <div className="flex items-center gap-2 mb-1">
              <Key className={`h-3.5 w-3.5 ${loc.is_secure ? "text-green-600" : "text-amber-600"}`} />
              <span className="font-semibold text-xs">{loc.location_code}</span>
              {loc.is_secure && <span className="text-[10px] text-green-600 bg-green-50 px-1 rounded">Secure</span>}
            </div>
            <p className="text-xs text-muted-foreground">{loc.location_name}</p>
            <p className="text-sm font-bold mt-1">{loc.current_count} / {loc.capacity} keys</p>
            <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
              <div
                className={`h-full rounded-full ${loc.current_count / loc.capacity > 0.8 ? "bg-red-400" : "bg-green-400"}`}
                style={{ width: `${Math.min(100, (loc.current_count / loc.capacity) * 100)}%` }}
              />
            </div>
          </div>
        ))}
        {keyLocations.length === 0 && (
          <div className="col-span-full text-center py-4 text-sm text-muted-foreground border rounded-lg">
            No key locations configured
          </div>
        )}
      </div>

      {/* Log key action form */}
      {showLogForm && (
        <div className="rounded-lg border p-4 bg-muted/10 space-y-3" data-testid="key-log-form">
          <h4 className="text-xs font-semibold">Log Key Action</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Action</Label>
              <Select value={logForm.action} onValueChange={v => setLogForm(f => ({ ...f, action: v }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-key-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KEY_RECEIVED">Key Received</SelectItem>
                  <SelectItem value="KEY_STORED">Key Stored</SelectItem>
                  <SelectItem value="KEY_TAKEN">Key Taken (retrieval)</SelectItem>
                  <SelectItem value="KEY_RETURNED_TO_CUSTOMER">Returned to Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Key Location</Label>
              <Select value={logForm.keyLocation} onValueChange={v => setLogForm(f => ({ ...f, keyLocation: v }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-key-location">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {keyLocations.map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.location_code}>{loc.location_code} — {loc.location_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Ticket (optional)</Label>
            <Select value={logForm.ticketId || "_none"} onValueChange={v => setLogForm(f => ({ ...f, ticketId: v === "_none" ? "" : v }))}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-key-ticket">
                <SelectValue placeholder="Select ticket" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— General action —</SelectItem>
                {activeTickets.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.ticketNumber} — {t.vehicleNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input
              value={logForm.notes}
              onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes"
              className="h-8 text-xs"
              data-testid="input-key-notes"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowLogForm(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => logMutation.mutate()}
              disabled={logMutation.isPending || !logForm.action}
              data-testid="button-submit-key-action"
            >
              {logMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Log Action"}
            </Button>
          </div>
        </div>
      )}

      {/* Key log */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground">Recent Key Actions</h4>
        {keyLog.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center">No key actions logged</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {keyLog.map((entry: any) => (
              <div key={entry.id} className="flex items-center gap-2 text-xs rounded-lg border px-3 py-2" data-testid={`key-log-${entry.id}`}>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${actionColors[entry.action] ?? "bg-muted text-muted-foreground"}`}>
                  {entry.action.replace(/_/g, " ")}
                </span>
                {entry.ticket_number && <span className="font-mono font-bold">{entry.ticket_number}</span>}
                {entry.key_location && <span className="text-muted-foreground">{entry.key_location}</span>}
                <span className="text-muted-foreground ml-auto">{entry.performed_by_name}</span>
                <span className="text-muted-foreground">{new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shifts Tab ───────────────────────────────────────────────────────────────
function ShiftsTab({ outletId }: { outletId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fmt = (v: number) => formatCurrency(v, user?.tenant?.currency ?? "USD", { position: (user?.tenant?.currencyPosition ?? "before") as "before" | "after", decimals: user?.tenant?.currencyDecimals ?? 2 });

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [showReconcile, setShowReconcile] = useState<any>(null);
  const [openForm, setOpenForm] = useState({ shiftType: "EVENING", headValetId: "", headValetName: "", openingNotes: "" });
  const [reconcileData, setReconcileData] = useState<any>(null);
  const [closingNotes, setClosingNotes] = useState("");

  const { data: shifts = [], refetch: refetchShifts } = useQuery<any[]>({
    queryKey: ["/api/parking/shifts", outletId, selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/parking/shifts/${outletId}?date=${selectedDate}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 15000,
  });

  const { data: activeShift } = useQuery<any>({
    queryKey: ["/api/parking/shifts", outletId, "active"],
    queryFn: async () => {
      const res = await fetch(`/api/parking/shifts/${outletId}/active`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 15000,
  });

  const { data: valetStaff = [] } = useQuery<any[]>({
    queryKey: ["/api/parking/valet-staff", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/valet-staff/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 60000,
  });

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      const headStaff = valetStaff.find((s: any) => s.id === openForm.headValetId);
      const res = await fetch(`/api/parking/shifts/${outletId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          shiftType: openForm.shiftType,
          headValetId: openForm.headValetId || null,
          headValetName: headStaff?.name || openForm.headValetName || null,
          openingNotes: openForm.openingNotes || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/shifts", outletId] });
      setShowOpenForm(false);
      setOpenForm({ shiftType: "EVENING", headValetId: "", headValetName: "", openingNotes: "" });
      toast({ title: "Shift opened" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const closeShiftMutation = useMutation({
    mutationFn: async ({ shiftId }: { shiftId: string }) => {
      const res = await fetch(`/api/parking/shifts/${outletId}/${shiftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "closed", closingNotes }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/shifts", outletId] });
      setShowReconcile(null);
      setReconcileData(null);
      setClosingNotes("");
      toast({ title: "Shift closed" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const fetchSummary = async (shift: any) => {
    const res = await fetch(`/api/parking/shifts/${outletId}/${shift.id}/summary`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setReconcileData(data);
    }
    setShowReconcile(shift);
  };

  const [assignForm, setAssignForm] = useState({ staffId: "", role: "VALET", zone: "" });
  const addAssignmentMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      const staff = valetStaff.find((s: any) => s.id === assignForm.staffId);
      const res = await fetch(`/api/parking/shift-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ shiftId, staffId: assignForm.staffId, staffName: staff?.name, role: assignForm.role, zone: assignForm.zone || null }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/shifts", outletId] });
      setAssignForm({ staffId: "", role: "VALET", zone: "" });
      toast({ title: "Staff assigned to shift" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const clockMutation = useMutation({
    mutationFn: async ({ assignmentId, action }: { assignmentId: string; action: "in" | "out" }) => {
      const body = action === "in" ? { clockIn: true } : { clockOut: true };
      const res = await fetch(`/api/parking/shift-assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/shifts", outletId] });
      toast({ title: vars.action === "in" ? "Clocked In" : "Clocked Out" });
    },
  });

  return (
    <div className="space-y-5" data-testid="shifts-tab">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> Shift Management
        </h2>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="h-8 text-xs w-36"
            data-testid="input-shift-date"
          />
          {!activeShift && (
            <Button size="sm" onClick={() => setShowOpenForm(v => !v)} data-testid="button-open-shift">
              <Plus className="h-3.5 w-3.5 mr-1" /> Open Shift
            </Button>
          )}
        </div>
      </div>

      {/* Open New Shift Form */}
      {showOpenForm && (
        <div className="rounded-xl border p-4 bg-muted/10 space-y-4" data-testid="open-shift-form">
          <h3 className="font-semibold text-sm">Open New Shift</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Shift Type</Label>
              <Select value={openForm.shiftType} onValueChange={v => setOpenForm(f => ({ ...f, shiftType: v }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-shift-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MORNING">Morning</SelectItem>
                  <SelectItem value="AFTERNOON">Afternoon</SelectItem>
                  <SelectItem value="EVENING">Evening</SelectItem>
                  <SelectItem value="NIGHT">Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Head Valet</Label>
              <Select value={openForm.headValetId || "_none"} onValueChange={v => setOpenForm(f => ({ ...f, headValetId: v === "_none" ? "" : v }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-head-valet">
                  <SelectValue placeholder="Select head valet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {valetStaff.filter((s: any) => s.isActive !== false).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} {s.badgeNumber ? `(${s.badgeNumber})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Opening Notes</Label>
            <Input
              value={openForm.openingNotes}
              onChange={e => setOpenForm(f => ({ ...f, openingNotes: e.target.value }))}
              placeholder="Optional notes"
              className="h-8 text-xs"
              data-testid="input-shift-opening-notes"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowOpenForm(false)}>Cancel</Button>
            <Button size="sm" onClick={() => openShiftMutation.mutate()} disabled={openShiftMutation.isPending} data-testid="button-confirm-open-shift">
              {openShiftMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Open Shift"}
            </Button>
          </div>
        </div>
      )}

      {/* Active Shift Card */}
      {activeShift && (
        <Card className="border-green-300 bg-green-50/30" data-testid="active-shift-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="font-bold text-sm text-green-800">{activeShift.shift_type} Shift</span>
                  <span className="text-xs text-muted-foreground">— Active</span>
                </div>
                {activeShift.head_valet_name && (
                  <p className="text-xs flex items-center gap-1">
                    <UserCheck className="h-3.5 w-3.5 text-green-700" /> Head: {activeShift.head_valet_name}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Started: {new Date(activeShift.opened_at).toLocaleString()}
                </p>
                <div className="flex gap-4 mt-2 text-xs">
                  <span className="flex items-center gap-1"><Car className="h-3 w-3" /> {activeShift.vehicle_count} vehicles</span>
                  <span className="flex items-center gap-1"><Banknote className="h-3 w-3" /> {fmt(parseFloat(activeShift.total_tips ?? "0"))} tips</span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => fetchSummary(activeShift)}
                data-testid="button-close-shift"
              >
                Close Shift
              </Button>
            </div>

            {/* Staff assignments */}
            {Array.isArray(activeShift.assignments) && activeShift.assignments.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground">Staff On This Shift</h4>
                <div className="space-y-1.5">
                  {activeShift.assignments.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs rounded-lg border bg-background px-3 py-2" data-testid={`shift-assignment-${a.id}`}>
                      <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{a.staff_name}</span>
                      <span className="text-muted-foreground">{a.role}</span>
                      {a.zone && <span className="text-muted-foreground">· {a.zone}</span>}
                      <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${a.clock_in && !a.clock_out ? "bg-green-100 text-green-700" : a.clock_out ? "bg-gray-100 text-gray-500" : "bg-muted text-muted-foreground"}`}>
                        {a.clock_in && !a.clock_out ? "On Duty" : a.clock_out ? "Clocked Out" : "Not clocked"}
                      </span>
                      {a.clock_in && !a.clock_out ? (
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-600"
                          onClick={() => clockMutation.mutate({ assignmentId: a.id, action: "out" })}
                          data-testid={`button-clock-out-${a.id}`}
                        >
                          <LogOut className="h-3 w-3 mr-0.5" /> Out
                        </Button>
                      ) : !a.clock_in && (
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-green-700"
                          onClick={() => clockMutation.mutate({ assignmentId: a.id, action: "in" })}
                          data-testid={`button-clock-in-${a.id}`}
                        >
                          <LogIn className="h-3 w-3 mr-0.5" /> In
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add staff to shift */}
            <div className="mt-3 pt-3 border-t">
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Add Staff to Shift</h4>
              <div className="flex flex-wrap gap-2">
                <Select value={assignForm.staffId || "_none"} onValueChange={v => setAssignForm(f => ({ ...f, staffId: v === "_none" ? "" : v }))}>
                  <SelectTrigger className="h-7 text-xs w-40" data-testid="select-assign-staff">
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Select staff —</SelectItem>
                    {valetStaff.filter((s: any) => s.isActive !== false).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={assignForm.role} onValueChange={v => setAssignForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger className="h-7 text-xs w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HEAD_VALET">Head Valet</SelectItem>
                    <SelectItem value="VALET">Valet</SelectItem>
                    <SelectItem value="RUNNER">Runner</SelectItem>
                    <SelectItem value="CASHIER">Cashier</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={assignForm.zone}
                  onChange={e => setAssignForm(f => ({ ...f, zone: e.target.value }))}
                  placeholder="Zone (optional)"
                  className="h-7 text-xs w-32"
                  data-testid="input-assign-zone"
                />
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!assignForm.staffId || addAssignmentMutation.isPending}
                  onClick={() => addAssignmentMutation.mutate(activeShift.id)}
                  data-testid="button-add-assignment"
                >
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's shifts list */}
      {shifts.filter((s: any) => s.id !== activeShift?.id).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Shifts on {selectedDate}</h3>
          {shifts.filter((s: any) => s.id !== activeShift?.id).map((shift: any) => (
            <div key={shift.id} className="rounded-lg border p-3 text-xs space-y-1 bg-muted/20" data-testid={`shift-${shift.id}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{shift.shift_type}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${shift.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{shift.status}</span>
                </div>
                {shift.head_valet_name && <span className="text-muted-foreground">Head: {shift.head_valet_name}</span>}
              </div>
              <div className="flex gap-4 text-muted-foreground">
                <span>{new Date(shift.opened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {shift.closed_at ? new Date(shift.closed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "ongoing"}</span>
                <span>{shift.vehicle_count} vehicles</span>
                <span>{fmt(parseFloat(shift.total_tips ?? "0"))} tips</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!activeShift && shifts.length === 0 && (
        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl" data-testid="empty-shifts">
          <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No shifts found for this date</p>
          <p className="text-xs mt-1">Open a new shift to start tracking</p>
        </div>
      )}

      {/* Reconciliation Dialog */}
      {showReconcile && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="reconcile-dialog">
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-base">End-of-Shift Reconciliation</h3>
            <div className="rounded-lg border p-4 bg-muted/10 space-y-2 text-sm">
              <p className="font-semibold text-green-800">{showReconcile.shift_type} Shift</p>
              {reconcileData ? (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Total Tickets:</span> <strong>{reconcileData.totalTickets}</strong></div>
                    <div><span className="text-muted-foreground">Open Tickets:</span> <strong className={reconcileData.openTickets > 0 ? "text-amber-600" : ""}>{reconcileData.openTickets}</strong></div>
                    <div><span className="text-muted-foreground">Total Tips:</span> <strong className="text-green-700">{fmt(reconcileData.totalTips)}</strong></div>
                    <div><span className="text-muted-foreground">Fees Collected:</span> <strong className="text-blue-700">{fmt(reconcileData.billedFees ?? reconcileData.totalFees ?? 0)}</strong></div>
                    <div><span className="text-muted-foreground">Vehicles:</span> <strong>{showReconcile.vehicle_count}</strong></div>
                    <div><span className="text-muted-foreground">Total Revenue:</span> <strong>{fmt((reconcileData.totalTips ?? 0) + (reconcileData.billedFees ?? reconcileData.totalFees ?? 0))}</strong></div>
                  </div>
                  {Array.isArray(reconcileData.shift?.assignments) && reconcileData.shift.assignments.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Tips per Staff:</p>
                      {reconcileData.shift.assignments.map((a: any) => (
                        <div key={a.id} className="flex justify-between text-xs py-0.5">
                          <span>{a.staff_name} ({a.role})</span>
                          <span className="font-medium text-green-700">{fmt(parseFloat(a.tips_collected ?? "0"))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {reconcileData.openTickets > 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" /> {reconcileData.openTickets} vehicle(s) still in lot
                    </p>
                  )}
                </>
              ) : (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              )}
            </div>
            <div>
              <Label className="text-xs">Closing Notes</Label>
              <Textarea
                rows={2}
                placeholder="Any notes for this shift..."
                value={closingNotes}
                onChange={e => setClosingNotes(e.target.value)}
                className="text-xs mt-1"
                data-testid="input-closing-notes"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowReconcile(null); setReconcileData(null); }}>Cancel</Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={() => closeShiftMutation.mutate({ shiftId: showReconcile.id })}
                disabled={closeShiftMutation.isPending}
                data-testid="button-confirm-close-shift"
              >
                {closeShiftMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Close Shift"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Valet Staff Tab ─────────────────────────────────────────────────────────
function ValetStaffTab({ outletId, tickets }: { outletId: string; tickets: any[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isOwnerOrManager = user?.role === "owner" || user?.role === "manager";

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", phone: "", badgeNumber: "" });

  const { data: staff = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/parking/valet-staff", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/valet-staff/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 30000,
  });

  const todayStr = new Date().toISOString().split("T")[0];

  const { data: perfData } = useQuery<any>({
    queryKey: ["/api/parking/valet-staff-performance", outletId, todayStr],
    queryFn: async () => {
      const res = await fetch(`/api/parking/valet-staff-performance/${outletId}?date=${todayStr}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const perfMap: Record<string, any> = {};
  if (perfData?.performance) {
    for (const p of perfData.performance) {
      perfMap[p.staffId] = p;
    }
  }

  const ticketsHandledToday: Record<string, number> = {};
  for (const t of tickets) {
    if (t.valetStaffId && t.entryTime?.startsWith(todayStr)) {
      ticketsHandledToday[t.valetStaffId] = (ticketsHandledToday[t.valetStaffId] ?? 0) + 1;
    }
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/parking/valet-staff/${outletId}`, addForm);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/valet-staff", outletId] });
      toast({ title: "Staff member added" });
      setAddForm({ name: "", phone: "", badgeNumber: "" });
      setShowAddForm(false);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const toggleDutyMutation = useMutation({
    mutationFn: async ({ staffId, isOnDuty }: { staffId: string; isOnDuty: boolean }) => {
      const res = await apiRequest("PATCH", `/api/parking/valet-staff/${outletId}/${staffId}`, { isOnDuty });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/valet-staff", outletId] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (staffId: string) => {
      const res = await apiRequest("PATCH", `/api/parking/valet-staff/${outletId}/${staffId}`, { isActive: false });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/valet-staff", outletId] });
      toast({ title: "Staff member removed" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const activeStaff = staff.filter((s: any) => s.isActive !== false);

  return (
    <div className="space-y-4" data-testid="valet-staff-tab">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Valet Attendants ({activeStaff.length})
        </h2>
        {isOwnerOrManager && (
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} data-testid="button-add-staff">
            <Plus className="h-4 w-4 mr-1" /> Add Attendant
          </Button>
        )}
      </div>

      {showAddForm && (
        <Card className="border-dashed" data-testid="add-staff-form">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">New Attendant</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="staff-name">Name *</Label>
                <Input
                  id="staff-name"
                  placeholder="Full name"
                  value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  data-testid="input-staff-name"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="staff-phone">Phone</Label>
                <Input
                  id="staff-phone"
                  placeholder="Phone number"
                  value={addForm.phone}
                  onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                  data-testid="input-staff-phone"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="staff-badge">Badge #</Label>
                <Input
                  id="staff-badge"
                  placeholder="Badge number"
                  value={addForm.badgeNumber}
                  onChange={e => setAddForm(f => ({ ...f, badgeNumber: e.target.value }))}
                  data-testid="input-staff-badge"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addMutation.mutate()} disabled={!addForm.name.trim() || addMutation.isPending} data-testid="button-confirm-add-staff">
                {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Attendant"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : activeStaff.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl" data-testid="empty-staff">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No valet attendants registered</p>
          <p className="text-xs mt-1">Add attendants to track who's on duty</p>
        </div>
      ) : (
        <>
          {/* Leaderboard */}
          {perfData?.performance?.length > 0 && (
            <Card data-testid="staff-leaderboard">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-500" /> Today's Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs py-2 pl-4">Attendant</TableHead>
                      <TableHead className="text-xs py-2 text-right">Today</TableHead>
                      <TableHead className="text-xs py-2 text-right">Shift</TableHead>
                      <TableHead className="text-xs py-2 text-right">Retrievals</TableHead>
                      <TableHead className="text-xs py-2 text-right pr-4">Avg Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perfData.performance.map((p: any, idx: number) => {
                      const avgMin = p.avgRetrievalMinutes;
                      const perfColor = avgMin === 0 ? "text-muted-foreground" :
                        avgMin < 5 ? "text-green-600" :
                        avgMin < 10 ? "text-amber-600" : "text-red-600";
                      return (
                        <TableRow key={p.staffId} data-testid={`leaderboard-row-${p.staffId}`}>
                          <TableCell className="py-2 pl-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-muted-foreground w-4">{idx + 1}</span>
                              <span className="text-xs font-medium" data-testid={`leaderboard-name-${p.staffId}`}>{p.name}</span>
                              {p.isOnDuty && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs py-2 text-right font-medium" data-testid={`leaderboard-checkins-${p.staffId}`}>{p.checkInsToday}</TableCell>
                          <TableCell className="text-xs py-2 text-right font-medium text-blue-600" data-testid={`leaderboard-shift-${p.staffId}`}>
                            {p.checkInsShift != null ? p.checkInsShift : "—"}
                          </TableCell>
                          <TableCell className="text-xs py-2 text-right font-medium" data-testid={`leaderboard-retrievals-${p.staffId}`}>{p.retrievalsCompleted}</TableCell>
                          <TableCell className={`text-xs py-2 text-right pr-4 font-semibold ${perfColor}`} data-testid={`leaderboard-avg-${p.staffId}`}>
                            {avgMin > 0 ? `${avgMin}m` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeStaff.map((s: any) => {
              const perf = perfMap[s.id];
              const avgMin = perf?.avgRetrievalMinutes ?? 0;
              const perfColor = avgMin === 0 ? "" : avgMin < 5 ? "text-green-600" : avgMin < 10 ? "text-amber-600" : "text-red-600";
              return (
                <Card key={s.id} data-testid={`card-staff-${s.id}`} className={s.isOnDuty ? "border-green-200 bg-green-50/30" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${s.isOnDuty ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm" data-testid={`text-staff-name-${s.id}`}>{s.name}</p>
                          {s.badgeNumber && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <BadgeCheck className="h-3 w-3" /> #{s.badgeNumber}
                            </p>
                          )}
                          {s.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {s.phone}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.isOnDuty ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`} data-testid={`badge-duty-${s.id}`}>
                          {s.isOnDuty ? "On Duty" : "Off Duty"}
                        </span>
                      </div>
                    </div>

                    {perf && (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs" data-testid={`perf-stats-${s.id}`}>
                        <span className="text-muted-foreground">{perf.checkInsToday} check-ins</span>
                        <span className="text-muted-foreground">{perf.retrievalsCompleted} retrievals</span>
                        {avgMin > 0 && (
                          <span className={`font-semibold ${perfColor}`}>{avgMin}m avg</span>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-1"
                        onClick={() => toggleDutyMutation.mutate({ staffId: s.id, isOnDuty: !s.isOnDuty })}
                        disabled={toggleDutyMutation.isPending}
                        data-testid={`button-toggle-duty-${s.id}`}
                      >
                        {s.isOnDuty ? <ToggleRight className="h-3.5 w-3.5 mr-1 text-green-600" /> : <ToggleLeft className="h-3.5 w-3.5 mr-1" />}
                        {s.isOnDuty ? "Mark Off Duty" : "Mark On Duty"}
                      </Button>
                      {user?.role === "owner" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-red-600 hover:text-red-700"
                          onClick={() => removeMutation.mutate(s.id)}
                          disabled={removeMutation.isPending}
                          data-testid={`button-remove-staff-${s.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Key Management Panel */}
      <Separator />
      <KeyManagementPanel outletId={outletId} />
    </div>
  );
}

// ─── Attendant Quick Check-In Dialog ────────────────────────────────────────
function AttendantQuickCheckinDialog({ open, onClose, outletId }: { open: boolean; onClose: () => void; outletId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [plate, setPlate] = useState("");
  const [vehicleType, setVehicleType] = useState("CAR");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/parking/tickets", {
        outletId,
        vehicleType,
        vehicleNumber: plate.toUpperCase().trim(),
        status: "parked",
      });
      return res.json();
    },
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      toast({ title: `Ticket ${t.ticketNumber} created` });
      setPlate(""); setVehicleType("CAR");
      onClose();
    },
    onError: () => toast({ title: "Check-in failed", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Quick Check-In</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-semibold">Plate Number *</Label>
            <Input
              placeholder="ABC 1234"
              value={plate}
              onChange={e => setPlate(e.target.value.toUpperCase())}
              className="font-mono mt-1"
              data-testid="input-quick-checkin-plate"
              onKeyDown={e => e.key === "Enter" && plate.trim() && mutation.mutate()}
            />
          </div>
          <div>
            <Label className="text-xs font-semibold">Vehicle Type</Label>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {VEHICLE_TYPES.map(vt => (
                <button
                  key={vt.value}
                  data-testid={`qc-vehicle-${vt.value}`}
                  onClick={() => setVehicleType(vt.value)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${vehicleType === vt.value ? "bg-primary/10 border-primary text-primary" : "border-muted hover:bg-muted/50"}`}
                >
                  {vt.icon} {vt.label}
                </button>
              ))}
            </div>
          </div>
          <Button
            className="w-full"
            disabled={!plate.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="button-quick-checkin-confirm"
          >
            {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Checking in...</> : "Check In Vehicle"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Attendant Tab ────────────────────────────────────────────────────────────
function AttendantTab({ outletId, outletName, onOpenNewTicket }: { outletId: string; outletName?: string; onOpenNewTicket: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [lookupPlate, setLookupPlate] = useState("");
  const [foundTicket, setFoundTicket] = useState<any>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [showQuickCheckin, setShowQuickCheckin] = useState(false);
  const [now, setNow] = useState(Date.now());
  // Exit condition for attendant complete action
  const [pendingComplete, setPendingComplete] = useState<{ requestId: string; ticketId?: string; entryCondition: any } | null>(null);
  const [attendantExitCondition, setAttendantExitCondition] = useState({ body: "clean", interior: "clean", fuelLevel: "full", acWorking: "yes", spareTyre: "yes", notes: "" });

  // Tick every 30s to refresh relative times
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const { data: retrievalRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/parking/retrieval-requests", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/retrieval-requests/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 0,
    refetchInterval: 30000,
  });

  const { data: activeTickets = [] } = useQuery<any[]>({
    queryKey: ["/api/parking/tickets", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/tickets/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const { data: staff = [] } = useQuery<any[]>({
    queryKey: ["/api/parking/valet-staff", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/valet-staff/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 30000,
  });

  const myStaff = staff.find((s: any) => s.userId === user?.id);

  const toggleDutyMutation = useMutation({
    mutationFn: async (isOnDuty: boolean) => {
      if (!myStaff) return;
      await apiRequest("PATCH", `/api/parking/valet-staff/${myStaff.id}/duty`, { isOnDuty });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/valet-staff", outletId] });
      toast({ title: myStaff?.isOnDuty ? "Marked Off Duty" : "Marked On Duty" });
    },
  });

  const updateRetrievalMutation = useMutation({
    mutationFn: async ({ requestId, ticketId, action }: { requestId: string; ticketId?: string; action: "accept" | "start" | "mark_ready" | "complete" }) => {
      const statusMap = { accept: "accepted", start: "in_progress", mark_ready: "in_progress", complete: "completed" };
      await apiRequest("PATCH", `/api/parking/retrieval-requests/${requestId}`, {
        status: statusMap[action],
        // Set assigned valet from the logged-in attendant profile when accepting
        ...(action === "accept" && myStaff ? {
          assignedValetId: myStaff.id,
          assignedValetName: myStaff.name,
        } : {}),
        ...(action === "complete" ? { completedAt: new Date().toISOString() } : {}),
      });
      // Also update the linked ticket status
      if (ticketId) {
        const ticketStatusMap: Record<string, string> = {
          accept: "requested",
          start: "retrieving",
          mark_ready: "ready",
          complete: "completed",
        };
        const newTicketStatus = ticketStatusMap[action];
        if (newTicketStatus) {
          await apiRequest("PATCH", `/api/parking/tickets/${ticketId}/status`, { status: newTicketStatus });
        }
      }
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/retrieval-requests", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      const labels = { accept: "Accepted", start: "Retrieving", mark_ready: "Vehicle ready", complete: "Vehicle delivered" };
      toast({ title: labels[action] });
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });

  const attendantCompleteWithConditionMutation = useMutation({
    mutationFn: async ({ skipCondition }: { skipCondition: boolean }) => {
      if (!pendingComplete) return;
      const { requestId, ticketId } = pendingComplete;
      if (ticketId && !skipCondition) {
        await apiRequest("PATCH", `/api/parking/tickets/${ticketId}/condition`, {
          conditionReport: {
            body: attendantExitCondition.body,
            interior: attendantExitCondition.interior,
            fuelLevel: attendantExitCondition.fuelLevel,
            acWorking: attendantExitCondition.acWorking,
            spareTyre: attendantExitCondition.spareTyre,
            notes: attendantExitCondition.notes || null,
            capturedAt: new Date().toISOString(),
          },
          isExitCheck: true,
        });
      }
      await apiRequest("PATCH", `/api/parking/retrieval-requests/${requestId}`, { status: "completed" });
      if (ticketId) {
        await apiRequest("PATCH", `/api/parking/tickets/${ticketId}/status`, { status: "completed" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/retrieval-requests", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
      toast({ title: "Vehicle delivered" });
      setPendingComplete(null);
    },
    onError: () => toast({ title: "Failed to complete delivery", variant: "destructive" }),
  });

  const handleLookup = async () => {
    if (!lookupPlate.trim()) return;
    setLookupLoading(true);
    try {
      const res = await fetch(`/api/parking/tickets/${outletId}`, { credentials: "include" });
      const all = await res.json();
      const q = lookupPlate.trim().toLowerCase();
      const found = all.find((t: any) =>
        (
          t.vehicleNumber?.toLowerCase().includes(q) ||
          t.ticketNumber?.toLowerCase().includes(q)
        ) &&
        (t.status === "parked" || t.status === "requested" || t.status === "retrieving" || t.status === "ready")
      );
      setFoundTicket(found || null);
      if (!found) toast({ title: "No active ticket found", variant: "destructive" });
    } catch {
      toast({ title: "Lookup failed", variant: "destructive" });
    } finally {
      setLookupLoading(false);
    }
  };

  // Split requests: active (scheduled_for is null or in past) vs upcoming (scheduled_for in future)
  const allPending = retrievalRequests.filter((r: any) => r.status === "pending" || r.status === "accepted" || r.status === "in_progress");
  const upcomingScheduled = retrievalRequests.filter((r: any) =>
    r.status === "pending" && r.scheduledFor && new Date(r.scheduledFor) > new Date()
  );
  const upcomingIds = new Set(upcomingScheduled.map((r: any) => r.id));
  const priorityOrder: Record<string, number> = { VIP: 0, URGENT: 1, NORMAL: 2, LOW: 3 };
  const activeQueue = allPending
    .filter((r: any) => !upcomingIds.has(r.id))
    .sort((a: any, b: any) => {
      const pa = priorityOrder[a.priority ?? "NORMAL"] ?? 2;
      const pb = priorityOrder[b.priority ?? "NORMAL"] ?? 2;
      if (pa !== pb) return pa - pb;
      const qa = a.queuePosition ?? a.queue_position ?? 9999;
      const qb = b.queuePosition ?? b.queue_position ?? 9999;
      if (qa !== qb) return qa - qb;
      return new Date(a.createdAt ?? a.created_at ?? 0).getTime() - new Date(b.createdAt ?? b.created_at ?? 0).getTime();
    });

  const parkedCount = activeTickets.filter((t: any) => t.status === "parked").length;

  const openCompleteDialog = (req: any, ticket: any) => {
    const entryCondition = ticket?.conditionReport ?? null;
    setPendingComplete({ requestId: req.id, ticketId: ticket?.id, entryCondition });
    setAttendantExitCondition({
      body: entryCondition?.body ?? "clean",
      interior: entryCondition?.interior ?? "clean",
      fuelLevel: entryCondition?.fuelLevel ?? "full",
      acWorking: entryCondition?.acWorking ?? "yes",
      spareTyre: entryCondition?.spareTyre ?? "yes",
      notes: "",
    });
  };

  function getActionButtons(req: any, ticket: any) {
    const ticketId = ticket?.id;
    const ticketStatus = ticket?.status;
    if (req.status === "pending") return (
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs"
          onClick={() => updateRetrievalMutation.mutate({ requestId: req.id, ticketId, action: "accept" })}
          disabled={updateRetrievalMutation.isPending}
          data-testid={`button-accept-retrieval-${req.id}`}
        >Accept &amp; Start</Button>
        <Button size="sm" className="flex-1 h-8 text-xs"
          onClick={() => updateRetrievalMutation.mutate({ requestId: req.id, ticketId, action: "start" })}
          disabled={updateRetrievalMutation.isPending}
          data-testid={`button-start-retrieval-${req.id}`}
        >Start</Button>
      </div>
    );
    if (req.status === "accepted" || (req.status === "in_progress" && ticketStatus !== "ready")) return (
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs"
          onClick={() => updateRetrievalMutation.mutate({ requestId: req.id, ticketId, action: "mark_ready" })}
          disabled={updateRetrievalMutation.isPending}
          data-testid={`button-ready-retrieval-${req.id}`}
        >Mark Ready</Button>
        <Button size="sm" className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700"
          onClick={() => openCompleteDialog(req, ticket)}
          disabled={updateRetrievalMutation.isPending}
          data-testid={`button-delivered-retrieval-${req.id}`}
        >Delivered</Button>
      </div>
    );
    if (req.status === "in_progress" && ticketStatus === "ready") return (
      <Button size="sm" className="w-full h-8 text-xs bg-green-600 hover:bg-green-700"
        onClick={() => openCompleteDialog(req, ticket)}
        disabled={updateRetrievalMutation.isPending}
        data-testid={`button-delivered-retrieval-${req.id}`}
      >✓ Mark Delivered</Button>
    );
    return null;
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header: Outlet + Attendant + Shift Info */}
      {outletName && (
        <div className="text-center pb-1">
          <p className="text-base font-bold" data-testid="attendant-outlet-name">{outletName}</p>
          <p className="text-xs text-muted-foreground">Valet Attendant View</p>
        </div>
      )}

      {/* Duty Status Banner */}
      {myStaff && (
        <div className={`rounded-xl p-3 flex items-center justify-between ${myStaff.isOnDuty ? "bg-green-50 border border-green-200" : "bg-muted border"}`} data-testid="attendant-duty-banner">
          <div>
            <p className="font-semibold text-sm" data-testid="attendant-name">{myStaff.name}</p>
            <p className={`text-xs ${myStaff.isOnDuty ? "text-green-600" : "text-muted-foreground"}`}>
              {myStaff.isOnDuty ? "● On Duty" : "○ Off Duty"}
              {myStaff.badgeNumber && ` · #${myStaff.badgeNumber}`}
            </p>
            {myStaff.isOnDuty && myStaff.dutyStartedAt && (
              <p className="text-xs text-green-500 mt-0.5" data-testid="attendant-shift-start">
                Shift started {new Date(myStaff.dutyStartedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant={myStaff.isOnDuty ? "outline" : "default"}
            onClick={() => toggleDutyMutation.mutate(!myStaff.isOnDuty)}
            disabled={toggleDutyMutation.isPending}
            data-testid="button-attendant-toggle-duty"
          >
            {myStaff.isOnDuty ? "Go Off Duty" : "Go On Duty"}
          </Button>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border bg-card p-3 text-center" data-testid="stat-parked">
          <p className="text-2xl font-bold" data-testid="stat-parked-count">{parkedCount}</p>
          <p className="text-xs text-muted-foreground">Parked</p>
        </div>
        <div className="rounded-xl border bg-card p-3 text-center" data-testid="stat-requests">
          <p className={`text-2xl font-bold ${activeQueue.length > 0 ? "text-red-600" : ""}`} data-testid="stat-requests-count">{activeQueue.length}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div className="rounded-xl border bg-card p-3 text-center" data-testid="stat-on-duty">
          <p className="text-2xl font-bold" data-testid="stat-on-duty-count">{staff.filter((s: any) => s.isOnDuty).length}</p>
          <p className="text-xs text-muted-foreground">On Duty</p>
        </div>
      </div>

      {/* Quick Check-In */}
      <Button className="w-full h-14 text-base font-semibold rounded-xl" onClick={() => setShowQuickCheckin(true)} data-testid="button-attendant-quick-checkin">
        <Car className="h-5 w-5 mr-2" /> Quick Check-In
      </Button>

      {/* Active Retrieval Queue — sorted by priority (VIP → URGENT → NORMAL) then queue position then age */}
      {activeQueue.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" data-testid="heading-pending-retrievals">
            <Bell className="h-4 w-4 text-red-500" />
            Active Requests
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5">{activeQueue.length}</span>
          </h3>
          <div className="space-y-2">
            {activeQueue.map((req: any) => {
              const ticket = activeTickets.find((t: any) => t.id === req.ticketId);
              const reqTimeMs = new Date(req.createdAt ?? req.created_at ?? req.requestedAt ?? 0).getTime();
              const minutesAgo = Math.floor((now - reqTimeMs) / 60000);
              const isCritical = minutesAgo >= 10;
              const isUrgent = minutesAgo >= 5 && !isCritical;
              const reqPriority: string = req.priority ?? "NORMAL";
              const isVip = reqPriority === "VIP";
              const isUrgentPriority = reqPriority === "URGENT";
              const waitClass = isCritical ? "text-red-600 font-bold" : isUrgent ? "text-amber-600 font-semibold" : "text-muted-foreground";
              const borderClass = isVip
                ? "border-yellow-400 bg-yellow-50/60"
                : isUrgentPriority
                  ? "border-red-400 bg-red-50/50"
                  : {
                      pending: isCritical ? "border-red-400 bg-red-50/60" : isUrgent ? "border-red-300 bg-red-50/40" : "border-amber-200 bg-amber-50/30",
                      accepted: "border-blue-200 bg-blue-50/30",
                      in_progress: ticket?.status === "ready" ? "border-green-300 bg-green-50/60" : "border-green-200 bg-green-50/30",
                    }[req.status] ?? "";
              const statusLabel: Record<string, string> = {
                pending: isCritical ? "CRITICAL" : isUrgent ? "WAIT" : "NEW",
                accepted: "ACCEPTED",
                in_progress: ticket?.status === "ready" ? "READY" : "RETRIEVING",
              };
              const statusBadgeColor: Record<string, string> = {
                pending: isCritical ? "bg-red-200 text-red-800" : isUrgent ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700",
                accepted: "bg-blue-100 text-blue-700",
                in_progress: ticket?.status === "ready" ? "bg-green-200 text-green-800" : "bg-green-100 text-green-700",
              };
              return (
                <Card key={req.id} data-testid={`card-retrieval-${req.id}`} className={borderClass}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xl">{getVehicleIcon(ticket?.vehicleType)}</span>
                          {isVip && <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-yellow-200 text-yellow-800" data-testid={`badge-priority-vip-${req.id}`}>VIP</span>}
                          {isUrgentPriority && <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-200 text-red-800" data-testid={`badge-priority-urgent-${req.id}`}>URGENT</span>}
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${statusBadgeColor[req.status]}`}>
                            {statusLabel[req.status] ?? req.status}
                          </span>
                        </div>
                        <p className="font-bold text-base mt-0.5" data-testid={`retrieval-plate-${req.id}`}>
                          {ticket?.vehicleNumber ?? req.vehicleNumber ?? "—"}
                        </p>
                        {ticket?.ticketNumber && (
                          <p className="text-xs font-mono text-muted-foreground" data-testid={`retrieval-ticket-num-${req.id}`}>#{ticket.ticketNumber}</p>
                        )}
                        <div className="flex items-center gap-2 text-xs mt-0.5">
                          {ticket?.slotCode && <span className="text-muted-foreground">Slot {ticket.slotCode}</span>}
                          {ticket?.vehicleColor && <span className="text-muted-foreground">{ticket.vehicleColor}</span>}
                          <span className={waitClass}>{minutesAgo}m wait{isCritical ? " ⚠️" : ""}</span>
                        </div>
                        {req.notes && <p className="text-xs text-muted-foreground italic">"{req.notes}"</p>}
                      </div>
                    </div>
                    {getActionButtons(req, ticket)}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {activeQueue.length === 0 && (
        <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-xl" data-testid="no-pending-retrievals">
          <CheckCircle className="h-7 w-7 mx-auto mb-1 opacity-30" />
          <p className="text-sm">No active retrieval requests</p>
        </div>
      )}

      {/* Upcoming Scheduled Retrievals */}
      {upcomingScheduled.length > 0 && (
        <div data-testid="upcoming-scheduled-section">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-blue-700">
            <Clock className="h-4 w-4" />
            Upcoming Scheduled ({upcomingScheduled.length})
          </h3>
          <div className="space-y-2">
            {upcomingScheduled.map((req: any) => {
              const ticket = activeTickets.find((t: any) => t.id === req.ticketId);
              const scheduledAt = new Date(req.scheduledFor);
              const minsUntil = Math.max(0, Math.ceil((scheduledAt.getTime() - now) / 60000));
              return (
                <Card key={req.id} data-testid={`card-upcoming-${req.id}`} className="border-blue-100 bg-blue-50/20">
                  <CardContent className="p-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm" data-testid={`upcoming-plate-${req.id}`}>
                        {ticket?.vehicleNumber ?? "—"}
                      </p>
                      <p className="text-xs text-blue-600" data-testid={`upcoming-countdown-${req.id}`}>
                        Ready in {minsUntil}m · {scheduledAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {ticket?.slotCode && <p className="text-xs text-muted-foreground">Slot {ticket.slotCode}</p>}
                    </div>
                    <div className="text-blue-500 text-2xl font-mono font-bold">{minsUntil}m</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* My Active Tickets (tickets I've recently checked in, parked status) */}
      {myStaff && activeTickets.filter((t: any) => t.valetStaffId === myStaff.id && t.status === "parked").length > 0 && (
        <div data-testid="my-active-tickets">
          <h3 className="text-sm font-semibold mb-2">My Parked Vehicles</h3>
          <div className="space-y-1.5">
            {activeTickets
              .filter((t: any) => t.valetStaffId === myStaff.id && t.status === "parked")
              .map((ticket: any) => (
                <div key={ticket.id} className="rounded-lg border bg-muted/30 p-2.5 flex items-center justify-between text-xs" data-testid={`my-ticket-${ticket.id}`}>
                  <div>
                    <span className="font-mono font-bold">{ticket.vehicleNumber}</span>
                    {ticket.slotCode && <span className="text-muted-foreground ml-2">Slot {ticket.slotCode}</span>}
                  </div>
                  <span className="text-muted-foreground">{ticket.vehicleColor} {ticket.vehicleMake}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Plate Lookup */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Quick Plate Lookup</h3>
        <div className="flex gap-2">
          <Input
            placeholder="Enter plate number..."
            value={lookupPlate}
            onChange={e => setLookupPlate(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleLookup()}
            className="font-mono"
            data-testid="input-attendant-plate-lookup"
          />
          <Button onClick={handleLookup} disabled={lookupLoading || !lookupPlate.trim()} data-testid="button-attendant-lookup">
            {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
          </Button>
        </div>

        {foundTicket && (
          <Card data-testid="card-lookup-result">
            <CardContent className="p-3 space-y-1">
              <div className="flex justify-between items-center">
                <p className="font-bold text-sm" data-testid="lookup-plate">{foundTicket.vehicleNumber}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  foundTicket.status === "parked" ? "bg-green-100 text-green-700" :
                  foundTicket.status === "ready" ? "bg-emerald-100 text-emerald-700" :
                  foundTicket.status === "requested" || foundTicket.status === "retrieving" ? "bg-amber-100 text-amber-700" :
                  "bg-gray-100 text-gray-600"
                }`} data-testid="lookup-status">{foundTicket.status?.replace(/_/g, " ")}</span>
              </div>
              {foundTicket.slotCode && <p className="text-xs text-muted-foreground">Slot: {foundTicket.slotCode}</p>}
              {foundTicket.vehicleColor && <p className="text-xs text-muted-foreground">{foundTicket.vehicleColor} {foundTicket.vehicleMake}</p>}
              {foundTicket.keyTagNumber && <p className="text-xs text-muted-foreground">Key tag: #{foundTicket.keyTagNumber}</p>}
              {foundTicket.conditionReport && (
                <p className="text-xs text-muted-foreground">Body: {foundTicket.conditionReport.body} · Fuel: {foundTicket.conditionReport.fuelLevel}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <AttendantQuickCheckinDialog open={showQuickCheckin} onClose={() => setShowQuickCheckin(false)} outletId={outletId} />

      {/* Exit Condition Dialog for attendant completion */}
      {pendingComplete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="attendant-exit-condition-dialog">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm overflow-y-auto max-h-[90vh] p-4 space-y-3">
            <h3 className="font-semibold text-base">Exit Condition Check</h3>
            <p className="text-xs text-muted-foreground">Record the vehicle condition at handover.</p>

            {/* Body */}
            <div>
              <label className="text-xs font-medium mb-1 block">Body Condition</label>
              <div className="flex flex-wrap gap-1.5">
                {["clean", "minor_scratches", "dents", "major_damage"].map(v => (
                  <button key={v} type="button"
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${attendantExitCondition.body === v ? "bg-primary/10 border-primary text-primary" : "border-muted"}`}
                    onClick={() => setAttendantExitCondition(s => ({ ...s, body: v }))}
                    data-testid={`attendant-exit-body-${v}`}
                  >{v.replace(/_/g, " ")}</button>
                ))}
              </div>
            </div>

            {/* Interior */}
            <div>
              <label className="text-xs font-medium mb-1 block">Interior</label>
              <div className="flex gap-1.5">
                {["clean", "dirty"].map(v => (
                  <button key={v} type="button"
                    className={`flex-1 py-1 rounded-lg border text-xs font-medium ${attendantExitCondition.interior === v ? "bg-primary/10 border-primary text-primary" : "border-muted"}`}
                    onClick={() => setAttendantExitCondition(s => ({ ...s, interior: v }))}
                  >{v}</button>
                ))}
              </div>
            </div>

            {/* Fuel */}
            <div>
              <label className="text-xs font-medium mb-1 block">Fuel Level</label>
              <div className="flex gap-1.5">
                {[{ label: "¼", value: "quarter" }, { label: "½", value: "half" }, { label: "¾", value: "three_quarter" }, { label: "Full", value: "full" }].map(opt => (
                  <button key={opt.value} type="button"
                    className={`flex-1 py-1 rounded-lg border text-xs font-medium ${attendantExitCondition.fuelLevel === opt.value ? "bg-amber-100 border-amber-400 text-amber-700" : "border-muted"}`}
                    onClick={() => setAttendantExitCondition(s => ({ ...s, fuelLevel: opt.value }))}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            {/* A/C + Spare */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium mb-1 block">A/C</label>
                <div className="flex gap-1.5">
                  {["yes", "no"].map(v => (
                    <button key={v} type="button"
                      className={`flex-1 py-1 rounded-lg border text-xs font-medium ${attendantExitCondition.acWorking === v ? "bg-primary/10 border-primary text-primary" : "border-muted"}`}
                      onClick={() => setAttendantExitCondition(s => ({ ...s, acWorking: v }))}
                    >{v === "yes" ? "Working" : "Faulty"}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium mb-1 block">Spare Tyre</label>
                <div className="flex gap-1.5">
                  {["yes", "no"].map(v => (
                    <button key={v} type="button"
                      className={`flex-1 py-1 rounded-lg border text-xs font-medium ${attendantExitCondition.spareTyre === v ? "bg-primary/10 border-primary text-primary" : "border-muted"}`}
                      onClick={() => setAttendantExitCondition(s => ({ ...s, spareTyre: v }))}
                    >{v === "yes" ? "Present" : "Missing"}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Entry vs Exit diff */}
            {pendingComplete?.entryCondition && (() => {
              const fuelLabel = (v: string) => ({ quarter: "¼", half: "½", three_quarter: "¾", full: "Full" }[v] || v);
              const diff = [
                { key: "body", label: "Body", entry: pendingComplete.entryCondition.body, exit: attendantExitCondition.body, fmt: (v: string) => v?.replace(/_/g, " ") },
                { key: "interior", label: "Interior", entry: pendingComplete.entryCondition.interior, exit: attendantExitCondition.interior, fmt: (v: string) => v },
                { key: "fuelLevel", label: "Fuel", entry: pendingComplete.entryCondition.fuelLevel, exit: attendantExitCondition.fuelLevel, fmt: fuelLabel },
                { key: "acWorking", label: "A/C", entry: pendingComplete.entryCondition.acWorking, exit: attendantExitCondition.acWorking, fmt: (v: string) => v === "yes" ? "Working" : "Faulty" },
                { key: "spareTyre", label: "Spare", entry: pendingComplete.entryCondition.spareTyre, exit: attendantExitCondition.spareTyre, fmt: (v: string) => v === "yes" ? "Present" : "Missing" },
              ].filter(d => d.entry && d.exit && d.entry !== d.exit);
              if (!diff.length) return null;
              return (
                <div className="rounded-md bg-red-50 border border-red-200 p-2 space-y-1" data-testid="attendant-exit-diff">
                  <p className="text-xs font-semibold text-red-700">Changed from entry:</p>
                  {diff.map(d => (
                    <div key={d.key} className="flex justify-between text-xs text-red-600">
                      <span>{d.label}</span>
                      <span>{d.fmt(d.entry)} → {d.fmt(d.exit)}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1 text-muted-foreground" size="sm"
                onClick={() => setPendingComplete(null)}
                data-testid="button-attendant-exit-cancel"
              >Cancel</Button>
              <Button variant="outline" className="flex-1" size="sm"
                onClick={() => attendantCompleteWithConditionMutation.mutate({ skipCondition: true })}
                disabled={attendantCompleteWithConditionMutation.isPending}
                data-testid="button-attendant-exit-skip"
              >Skip & Complete</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" size="sm"
                onClick={() => attendantCompleteWithConditionMutation.mutate({ skipCondition: false })}
                disabled={attendantCompleteWithConditionMutation.isPending}
                data-testid="button-attendant-exit-save"
              >{attendantCompleteWithConditionMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save & Complete"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Incidents Tab ────────────────────────────────────────────────────────────
function IncidentsTab({ outletId }: { outletId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useTranslation("modules");
  const fmt = (v: number) => formatCurrency(v, user?.tenant?.currency ?? "USD", { position: (user?.tenant?.currencyPosition ?? "before") as "before" | "after", decimals: user?.tenant?.currencyDecimals ?? 2 });

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const { data: incidents = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/parking/incidents", outletId, filterStatus, filterSeverity],
    queryFn: async () => {
      let url = `/api/parking/incidents/${outletId}?`;
      if (filterStatus !== "all") url += `status=${filterStatus}&`;
      if (filterSeverity !== "all") url += `severity=${filterSeverity}&`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 30000,
  });

  const updateIncidentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/parking/incidents/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/incidents", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/incidents/summary", outletId] });
      setEditingId(null);
      toast({ title: "Incident updated" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  function getSeverityClass(severity: string) {
    switch (severity) {
      case "CRITICAL": return "text-red-700 bg-red-100 border-red-300";
      case "HIGH": return "text-orange-700 bg-orange-100 border-orange-200";
      case "MEDIUM": return "text-yellow-700 bg-yellow-50 border-yellow-200";
      default: return "text-gray-600 bg-gray-100 border-gray-200";
    }
  }
  function getSeverityDot(severity: string) {
    switch (severity) {
      case "CRITICAL": return "bg-red-600 animate-pulse";
      case "HIGH": return "bg-orange-500";
      case "MEDIUM": return "bg-yellow-400";
      default: return "bg-gray-400";
    }
  }

  const INCIDENT_TYPES: Record<string, string> = {
    VEHICLE_DAMAGE: "Vehicle Damage",
    LOST_KEY: "Lost Key",
    ACCIDENT: "Accident",
    THEFT: "Theft",
    CUSTOMER_COMPLAINT: "Customer Complaint",
    WRONG_VEHICLE_MOVED: "Wrong Vehicle Moved",
    OTHER: "Other",
  };

  const STATUSES = ["open", "investigating", "resolved", "escalated"];

  return (
    <div className="space-y-4" data-testid="incidents-tab">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <TriangleAlert className="h-4 w-4 text-orange-500" />
          Incident Reports
        </h2>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={filterSeverity} onValueChange={setFilterSeverity}>
            <SelectTrigger className="h-8 text-xs w-32" data-testid="select-filter-severity">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 text-xs w-32" data-testid="select-filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => refetch()} data-testid="button-refresh-incidents">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl" data-testid="empty-incidents">
          <FileWarning className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No incidents found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((inc: any) => (
            <div key={inc.id} className="rounded-lg border" data-testid={`incident-card-${inc.id}`}>
              <div
                className="flex flex-wrap items-center gap-2 p-3 cursor-pointer hover:bg-muted/30"
                onClick={() => setExpandedId(expandedId === inc.id ? null : inc.id)}
              >
                {/* Severity dot */}
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getSeverityDot(inc.severity)}`} />
                <span className="font-mono text-xs font-bold text-muted-foreground" data-testid={`text-incident-num-${inc.id}`}>{inc.incidentNumber}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${getSeverityClass(inc.severity)}`} data-testid={`badge-severity-${inc.id}`}>
                  {inc.severity}
                </span>
                <Badge variant="outline" className="text-[10px]" data-testid={`badge-type-${inc.id}`}>
                  {INCIDENT_TYPES[inc.incidentType] ?? inc.incidentType}
                </Badge>
                <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">{inc.description}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${inc.status === "resolved" ? "bg-green-50 text-green-700 border-green-200" : inc.status === "escalated" ? "bg-red-50 text-red-700 border-red-200" : inc.status === "investigating" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200"}`} data-testid={`badge-inc-status-${inc.id}`}>
                  {inc.status}
                </span>
                <span className="text-xs text-muted-foreground">{new Date(inc.createdAt).toLocaleDateString()}</span>
                {expandedId === inc.id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
              </div>

              {expandedId === inc.id && (
                <div className="border-t p-4 space-y-3 bg-muted/10" data-testid={`incident-detail-${inc.id}`}>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    {inc.vehicleNumber && <div><span className="font-semibold">Vehicle:</span> {inc.vehicleNumber}</div>}
                    {inc.customerName && <div><span className="font-semibold">Customer:</span> {inc.customerName}</div>}
                    {inc.reportedByName && <div><span className="font-semibold">Reported by:</span> {inc.reportedByName}</div>}
                    {inc.resolvedByName && <div><span className="font-semibold">Resolved by:</span> {inc.resolvedByName}</div>}
                    {inc.policeReportNo && <div><span className="font-semibold">Police Report #:</span> {inc.policeReportNo}</div>}
                    {inc.insuranceClaimNo && <div><span className="font-semibold">Insurance Claim #:</span> {inc.insuranceClaimNo}</div>}
                    {inc.actualDamageCost && <div><span className="font-semibold">Actual Damage:</span> {fmt(parseFloat(inc.actualDamageCost))}</div>}
                  </div>
                  {inc.resolution && (
                    <div className="text-xs bg-green-50 border border-green-200 rounded p-2">
                      <span className="font-semibold text-green-700">Resolution: </span>{inc.resolution}
                    </div>
                  )}

                  {editingId === inc.id ? (
                    <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200" data-testid={`incident-edit-form-${inc.id}`}>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">{t("status")}</Label>
                          <Select value={editForm.status} onValueChange={v => setEditForm((f: any) => ({ ...f, status: v }))}>
                            <SelectTrigger className="h-8 text-xs mt-1" data-testid={`select-inc-status-${inc.id}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Actual Damage Cost</Label>
                          <Input
                            type="number"
                            className="h-8 text-xs mt-1"
                            placeholder="0.00"
                            value={editForm.actualDamageCost ?? ""}
                            onChange={e => setEditForm((f: any) => ({ ...f, actualDamageCost: e.target.value }))}
                            data-testid={`input-damage-cost-${inc.id}`}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Police Report #</Label>
                        <Input
                          className="h-8 text-xs mt-1"
                          value={editForm.policeReportNo ?? ""}
                          onChange={e => setEditForm((f: any) => ({ ...f, policeReportNo: e.target.value }))}
                          data-testid={`input-police-report-${inc.id}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Insurance Claim #</Label>
                        <Input
                          className="h-8 text-xs mt-1"
                          value={editForm.insuranceClaimNo ?? ""}
                          onChange={e => setEditForm((f: any) => ({ ...f, insuranceClaimNo: e.target.value }))}
                          data-testid={`input-insurance-claim-${inc.id}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Resolution Notes</Label>
                        <Textarea
                          className="text-xs mt-1"
                          rows={2}
                          value={editForm.resolution ?? ""}
                          onChange={e => setEditForm((f: any) => ({ ...f, resolution: e.target.value }))}
                          data-testid={`input-resolution-${inc.id}`}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                        <Button
                          size="sm"
                          disabled={updateIncidentMutation.isPending}
                          onClick={() => updateIncidentMutation.mutate({ id: inc.id, data: editForm })}
                          data-testid={`button-save-incident-${inc.id}`}
                        >
                          {updateIncidentMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        setEditingId(inc.id);
                        setEditForm({
                          status: inc.status,
                          resolution: inc.resolution ?? "",
                          policeReportNo: inc.policeReportNo ?? "",
                          insuranceClaimNo: inc.insuranceClaimNo ?? "",
                          actualDamageCost: inc.actualDamageCost ?? "",
                        });
                      }}
                      data-testid={`button-edit-incident-${inc.id}`}
                    >
                      <Edit2 className="h-3 w-3 mr-1" /> Update Incident
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ────────────────────────────────────────────────────────────
function SettingsTab({ outletId }: { outletId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fmt = (v: number) => formatCurrency(v, user?.tenant?.currency ?? "USD", { position: (user?.tenant?.currencyPosition ?? "before") as "before" | "after", decimals: user?.tenant?.currencyDecimals ?? 2 });

  const { data: config, isLoading: configLoading } = useQuery<any>({
    queryKey: ["/api/parking/config", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/config/${outletId}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 30000,
  });

  const { data: zones = [], isLoading: zonesLoading } = useQuery<any[]>({
    queryKey: ["/api/parking/zones", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/zones/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 30000,
  });

  const { data: rates = [], isLoading: ratesLoading } = useQuery<any[]>({
    queryKey: ["/api/parking/rates", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/rates/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 30000,
  });

  const { data: slots = [] } = useQuery<any[]>({
    queryKey: ["/api/parking/slots", outletId],
    queryFn: async () => {
      const res = await fetch(`/api/parking/slots/${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 30000,
  });

  const [configForm, setConfigForm] = useState<any>(null);

  useEffect(() => {
    if (config && configForm === null) {
      setConfigForm({
        totalCapacity: config.totalCapacity ?? 0,
        freeMinutes: config.freeMinutes ?? 0,
        valetEnabled: config.valetEnabled ?? true,
        displayMessage: config.displayMessage ?? "",
        overnightFee: config.overnightFee ?? 0,
        overnightCutoffHour: config.overnightCutoffHour ?? 23,
      });
    }
  }, [config]);

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/parking/config/${outletId}`, { ...configForm, outletId, tenantId: config?.tenantId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/config", outletId] });
      toast({ title: "Config saved" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const [zoneForm, setZoneForm] = useState({ name: "", level: "", totalSlots: 0 });
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editZoneForm, setEditZoneForm] = useState({ name: "", level: "" });

  const addZoneMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/parking/zones/${outletId}`, zoneForm);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/zones", outletId] });
      toast({ title: "Zone added" });
      setZoneForm({ name: "", level: "", totalSlots: 0 });
      setShowZoneForm(false);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const updateZoneMutation = useMutation({
    mutationFn: async (zoneId: string) => {
      const res = await apiRequest("PATCH", `/api/parking/zones/${outletId}/${zoneId}`, editZoneForm);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/zones", outletId] });
      toast({ title: "Zone updated" });
      setEditingZoneId(null);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (zoneId: string) => {
      await apiRequest("DELETE", `/api/parking/zones/${outletId}/${zoneId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/zones", outletId] });
      toast({ title: "Zone deleted" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const [rateForm, setRateForm] = useState({
    vehicleType: "CAR", rateType: "HOURLY", rateAmount: "", freeMinutes: "",
    slabs: [] as { fromMinutes: number; toMinutes?: number; charge: string }[],
  });
  const [showRateForm, setShowRateForm] = useState(false);
  const [newSlab, setNewSlab] = useState({ fromMinutes: "", toMinutes: "", charge: "" });
  const [expandedRateId, setExpandedRateId] = useState<string | null>(null);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [editRateForm, setEditRateForm] = useState({ vehicleType: "CAR", rateType: "HOURLY", rateAmount: "", slabs: [] as { fromMinutes: number; toMinutes?: number; charge: string }[] });
  const [editNewSlab, setEditNewSlab] = useState({ fromMinutes: "", toMinutes: "", charge: "" });

  const updateRateMutation = useMutation({
    mutationFn: async (rateId: string) => {
      const body: any = {
        vehicleType: editRateForm.vehicleType,
        rateType: editRateForm.rateType,
        rateAmount: parseFloat(editRateForm.rateAmount) || 0,
      };
      if (editRateForm.rateType === "SLAB") {
        body.slabs = editRateForm.slabs.map(s => ({
          fromMinutes: s.fromMinutes,
          toMinutes: s.toMinutes ?? null,
          charge: parseFloat(s.charge) || 0,
        }));
      }
      const res = await apiRequest("PATCH", `/api/parking/rates/${outletId}/${rateId}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/rates", outletId] });
      toast({ title: "Rate updated" });
      setEditingRateId(null);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const addRateMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        vehicleType: rateForm.vehicleType,
        rateType: rateForm.rateType,
        rateAmount: parseFloat(rateForm.rateAmount) || 0,
      };
      if (rateForm.freeMinutes) body.freeMinutes = parseInt(rateForm.freeMinutes) || 0;
      if (rateForm.rateType === "SLAB" && rateForm.slabs.length > 0) {
        body.slabs = rateForm.slabs.map(s => ({
          fromMinutes: s.fromMinutes,
          toMinutes: s.toMinutes ?? null,
          charge: parseFloat(s.charge) || 0,
        }));
      }
      const res = await apiRequest("POST", `/api/parking/rates/${outletId}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/rates", outletId] });
      toast({ title: "Rate added" });
      setRateForm({ vehicleType: "CAR", rateType: "HOURLY", rateAmount: "", freeMinutes: "", slabs: [] });
      setNewSlab({ fromMinutes: "", toMinutes: "", charge: "" });
      setShowRateForm(false);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteRateMutation = useMutation({
    mutationFn: async (rateId: string) => {
      await apiRequest("DELETE", `/api/parking/rates/${outletId}/${rateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/rates", outletId] });
      toast({ title: "Rate deleted" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const [slotForm, setSlotForm] = useState({ slotCode: "", zoneId: "", slotType: "STANDARD" });
  const [showSlotForm, setShowSlotForm] = useState(false);

  const addSlotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/parking/slots/${outletId}`, {
        ...slotForm,
        zoneId: slotForm.zoneId || undefined,
        status: "available",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/slots", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/stats", outletId] });
      toast({ title: "Slot added" });
      setSlotForm({ slotCode: "", zoneId: "", slotType: "STANDARD" });
      setShowSlotForm(false);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const toggleSlotMutation = useMutation({
    mutationFn: async ({ slotId, isActive }: { slotId: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/parking/slots/${outletId}/${slotId}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/slots", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parking/stats", outletId] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6" data-testid="settings-tab">
      {/* Parking Config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" /> Parking Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {configLoading || !configForm ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="total-capacity">Total Capacity</Label>
                  <Input
                    id="total-capacity"
                    type="number"
                    value={configForm.totalCapacity}
                    onChange={e => setConfigForm((f: any) => ({ ...f, totalCapacity: parseInt(e.target.value) || 0 }))}
                    data-testid="input-total-capacity"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="free-minutes">Free Minutes</Label>
                  <Input
                    id="free-minutes"
                    type="number"
                    value={configForm.freeMinutes}
                    onChange={e => setConfigForm((f: any) => ({ ...f, freeMinutes: parseInt(e.target.value) || 0 }))}
                    data-testid="input-free-minutes"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={configForm.valetEnabled}
                  onCheckedChange={v => setConfigForm((f: any) => ({ ...f, valetEnabled: v }))}
                  data-testid="switch-valet-enabled"
                />
                <Label>Valet Parking Enabled</Label>
              </div>
              <div className="space-y-1">
                <Label htmlFor="display-message">Display Message</Label>
                <Textarea
                  id="display-message"
                  placeholder="Message shown to guests (e.g., 'Parking available on Level 2')"
                  value={configForm.displayMessage}
                  onChange={e => setConfigForm((f: any) => ({ ...f, displayMessage: e.target.value }))}
                  rows={2}
                  data-testid="input-display-message"
                />
              </div>
              {/* Overnight Parking Config */}
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Moon className="h-4 w-4 text-indigo-500" />
                  Overnight Parking
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="overnight-fee">Overnight Fee (per night)</Label>
                    <Input
                      id="overnight-fee"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={configForm.overnightFee ?? ""}
                      onChange={e => setConfigForm((f: any) => ({ ...f, overnightFee: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-overnight-fee"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="overnight-cutoff">Cutoff Hour (24h, 0–23)</Label>
                    <Input
                      id="overnight-cutoff"
                      type="number"
                      min={0}
                      max={23}
                      placeholder="23"
                      value={configForm.overnightCutoffHour ?? ""}
                      onChange={e => setConfigForm((f: any) => ({ ...f, overnightCutoffHour: parseInt(e.target.value) || 23 }))}
                      data-testid="input-overnight-cutoff"
                    />
                    <p className="text-[10px] text-muted-foreground">Vehicles parked past this hour are flagged overnight</p>
                  </div>
                </div>
              </div>

              <Button size="sm" onClick={() => saveConfigMutation.mutate()} disabled={saveConfigMutation.isPending} data-testid="button-save-config">
                {saveConfigMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save Config
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Zones */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" /> Zones ({zones.length})
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowZoneForm(!showZoneForm)} data-testid="button-add-zone">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Zone
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showZoneForm && (
            <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border" data-testid="zone-form">
              <Input
                placeholder="Zone name *"
                value={zoneForm.name}
                onChange={e => setZoneForm(f => ({ ...f, name: e.target.value }))}
                className="flex-1 min-w-32"
                data-testid="input-zone-name"
              />
              <Input
                placeholder="Level/Floor"
                value={zoneForm.level}
                onChange={e => setZoneForm(f => ({ ...f, level: e.target.value }))}
                className="w-32"
                data-testid="input-zone-level"
              />
              <Input
                type="number"
                placeholder="Capacity"
                value={zoneForm.totalSlots || ""}
                onChange={e => setZoneForm(f => ({ ...f, totalSlots: parseInt(e.target.value) || 0 }))}
                className="w-24"
                data-testid="input-zone-capacity"
              />
              <Button size="sm" disabled={!zoneForm.name.trim() || addZoneMutation.isPending} onClick={() => addZoneMutation.mutate()} data-testid="button-confirm-add-zone">
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowZoneForm(false)}>Cancel</Button>
            </div>
          )}
          {zonesLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : zones.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="empty-zones">No zones configured</p>
          ) : (
            <div className="space-y-2">
              {zones.map((z: any) => (
                <div key={z.id} data-testid={`zone-item-${z.id}`}>
                  {editingZoneId === z.id ? (
                    <div className="flex flex-wrap gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200" data-testid={`zone-edit-form-${z.id}`}>
                      <Input
                        value={editZoneForm.name}
                        onChange={e => setEditZoneForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Zone name"
                        className="flex-1 min-w-28"
                        data-testid={`input-zone-edit-name-${z.id}`}
                      />
                      <Input
                        value={editZoneForm.level}
                        onChange={e => setEditZoneForm(f => ({ ...f, level: e.target.value }))}
                        placeholder="Level/Floor"
                        className="w-28"
                        data-testid={`input-zone-edit-level-${z.id}`}
                      />
                      <Button size="sm" disabled={!editZoneForm.name.trim() || updateZoneMutation.isPending} onClick={() => updateZoneMutation.mutate(z.id)} data-testid={`button-save-zone-${z.id}`}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingZoneId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: z.color ?? "#6366f1" }} />
                        <span className="text-sm font-medium">{z.name}</span>
                        {z.level && <span className="text-xs text-muted-foreground">· {z.level}</span>}
                        <span className="text-xs text-muted-foreground">· {z.availableSlots}/{z.totalSlots} slots</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600"
                          onClick={() => { setEditingZoneId(z.id); setEditZoneForm({ name: z.name, level: z.level ?? "" }); }}
                          data-testid={`button-edit-zone-${z.id}`}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                          onClick={() => deleteZoneMutation.mutate(z.id)}
                          disabled={deleteZoneMutation.isPending}
                          data-testid={`button-delete-zone-${z.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rates */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Rates ({rates.length})
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowRateForm(!showRateForm)} data-testid="button-add-rate">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Rate
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showRateForm && (
            <div className="space-y-3 p-3 bg-muted/30 rounded-lg border" data-testid="rate-form">
              <div className="flex flex-wrap gap-2">
                <Select value={rateForm.vehicleType} onValueChange={v => setRateForm(f => ({ ...f, vehicleType: v }))}>
                  <SelectTrigger className="w-36" data-testid="select-rate-vehicle-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map(vt => (
                      <SelectItem key={vt.value} value={vt.value}>{vt.icon} {vt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={rateForm.rateType} onValueChange={v => setRateForm(f => ({ ...f, rateType: v }))}>
                  <SelectTrigger className="w-28" data-testid="select-rate-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FLAT">Flat</SelectItem>
                    <SelectItem value="HOURLY">Hourly</SelectItem>
                    <SelectItem value="SLAB">Slab</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Base rate"
                  value={rateForm.rateAmount}
                  onChange={e => setRateForm(f => ({ ...f, rateAmount: e.target.value }))}
                  className="w-28"
                  data-testid="input-rate-amount"
                />
                <Input
                  type="number"
                  placeholder="Free mins"
                  value={rateForm.freeMinutes}
                  onChange={e => setRateForm(f => ({ ...f, freeMinutes: e.target.value }))}
                  className="w-24"
                  data-testid="input-rate-free-minutes"
                />
              </div>
              {rateForm.rateType === "SLAB" && (
                <div className="space-y-2" data-testid="slab-config">
                  <p className="text-xs font-medium text-muted-foreground">Slab Configuration</p>
                  {rateForm.slabs.map((slab, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs" data-testid={`slab-row-${idx}`}>
                      <span className="text-muted-foreground w-6">{idx + 1}.</span>
                      <span>{slab.fromMinutes}–{slab.toMinutes ?? "∞"} min</span>
                      <span className="font-medium">{fmt(parseFloat(slab.charge) || 0)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 ml-auto text-red-400"
                        onClick={() => setRateForm(f => ({ ...f, slabs: f.slabs.filter((_, i) => i !== idx) }))}
                        data-testid={`button-remove-slab-${idx}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="number"
                      placeholder="From (min)"
                      value={newSlab.fromMinutes}
                      onChange={e => setNewSlab(s => ({ ...s, fromMinutes: e.target.value }))}
                      className="w-24 h-7 text-xs"
                      data-testid="input-slab-from"
                    />
                    <Input
                      type="number"
                      placeholder="To (min, blank=∞)"
                      value={newSlab.toMinutes}
                      onChange={e => setNewSlab(s => ({ ...s, toMinutes: e.target.value }))}
                      className="w-32 h-7 text-xs"
                      data-testid="input-slab-to"
                    />
                    <Input
                      type="number"
                      placeholder="Charge"
                      value={newSlab.charge}
                      onChange={e => setNewSlab(s => ({ ...s, charge: e.target.value }))}
                      className="w-24 h-7 text-xs"
                      data-testid="input-slab-charge"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={!newSlab.fromMinutes || !newSlab.charge}
                      onClick={() => {
                        setRateForm(f => ({
                          ...f,
                          slabs: [...f.slabs, {
                            fromMinutes: parseInt(newSlab.fromMinutes) || 0,
                            toMinutes: newSlab.toMinutes ? parseInt(newSlab.toMinutes) : undefined,
                            charge: newSlab.charge,
                          }],
                        }));
                        setNewSlab({ fromMinutes: "", toMinutes: "", charge: "" });
                      }}
                      data-testid="button-add-slab"
                    >
                      + Add Slab
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={(!rateForm.rateAmount && rateForm.rateType !== "SLAB") || addRateMutation.isPending}
                  onClick={() => addRateMutation.mutate()}
                  data-testid="button-confirm-add-rate"
                >
                  Add Rate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowRateForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
          {ratesLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="empty-rates">No rates configured</p>
          ) : (
            <div className="space-y-2">
              {rates.map((r: any) => (
                <div key={r.id} className="rounded-lg border bg-muted/30" data-testid={`rate-item-${r.id}`}>
                  {editingRateId === r.id ? (
                    <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200" data-testid={`rate-edit-form-${r.id}`}>
                      <div className="flex flex-wrap gap-2">
                        <Select value={editRateForm.vehicleType} onValueChange={v => setEditRateForm(f => ({ ...f, vehicleType: v }))}>
                          <SelectTrigger className="w-36" data-testid={`select-edit-rate-vehicle-${r.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {VEHICLE_TYPES.map(vt => <SelectItem key={vt.value} value={vt.value}>{vt.icon} {vt.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={editRateForm.rateType} onValueChange={v => setEditRateForm(f => ({ ...f, rateType: v }))}>
                          <SelectTrigger className="w-28" data-testid={`select-edit-rate-type-${r.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="FLAT">Flat</SelectItem>
                            <SelectItem value="HOURLY">Hourly</SelectItem>
                            <SelectItem value="SLAB">Slab</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          placeholder="Rate"
                          value={editRateForm.rateAmount}
                          onChange={e => setEditRateForm(f => ({ ...f, rateAmount: e.target.value }))}
                          className="w-28"
                          data-testid={`input-edit-rate-amount-${r.id}`}
                        />
                      </div>
                      {editRateForm.rateType === "SLAB" && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Slabs</p>
                          {editRateForm.slabs.map((slab, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <span>{slab.fromMinutes}–{slab.toMinutes ?? "∞"} min</span>
                              <span className="font-medium">{fmt(parseFloat(slab.charge) || 0)}</span>
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 ml-auto text-red-400"
                                onClick={() => setEditRateForm(f => ({ ...f, slabs: f.slabs.filter((_, i) => i !== idx) }))}
                                data-testid={`button-remove-edit-slab-${idx}`}
                              ><X className="h-3 w-3" /></Button>
                            </div>
                          ))}
                          <div className="flex flex-wrap gap-2">
                            <Input type="number" placeholder="From (min)" value={editNewSlab.fromMinutes} onChange={e => setEditNewSlab(s => ({ ...s, fromMinutes: e.target.value }))} className="w-24 h-7 text-xs" data-testid={`input-edit-slab-from-${r.id}`} />
                            <Input type="number" placeholder="To (blank=∞)" value={editNewSlab.toMinutes} onChange={e => setEditNewSlab(s => ({ ...s, toMinutes: e.target.value }))} className="w-28 h-7 text-xs" data-testid={`input-edit-slab-to-${r.id}`} />
                            <Input type="number" placeholder="Charge" value={editNewSlab.charge} onChange={e => setEditNewSlab(s => ({ ...s, charge: e.target.value }))} className="w-24 h-7 text-xs" data-testid={`input-edit-slab-charge-${r.id}`} />
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              disabled={!editNewSlab.fromMinutes || !editNewSlab.charge}
                              onClick={() => {
                                setEditRateForm(f => ({ ...f, slabs: [...f.slabs, { fromMinutes: parseInt(editNewSlab.fromMinutes) || 0, toMinutes: editNewSlab.toMinutes ? parseInt(editNewSlab.toMinutes) : undefined, charge: editNewSlab.charge }] }));
                                setEditNewSlab({ fromMinutes: "", toMinutes: "", charge: "" });
                              }}
                              data-testid={`button-add-edit-slab-${r.id}`}
                            >+ Slab</Button>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" disabled={!editRateForm.rateAmount || updateRateMutation.isPending} onClick={() => updateRateMutation.mutate(r.id)} data-testid={`button-save-rate-${r.id}`}>
                          {updateRateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingRateId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3">
                      <div className="text-sm flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{getVehicleIcon(r.vehicleType)} {r.vehicleType}</span>
                        <Badge variant="outline" className="text-[10px]">{r.rateType}</Badge>
                        <span className="font-medium">{fmt(parseFloat(r.rateAmount ?? "0"))}</span>
                        <span className="text-muted-foreground text-xs">
                          {r.rateType === "HOURLY" ? "/hr" : r.rateType === "FLAT" ? "flat" : ""}
                        </span>
                        {r.slabs?.length > 0 && (
                          <button
                            className="text-xs text-blue-600 hover:underline"
                            onClick={() => setExpandedRateId(expandedRateId === r.id ? null : r.id)}
                            data-testid={`button-expand-slabs-${r.id}`}
                          >
                            {r.slabs.length} slabs {expandedRateId === r.id ? "▲" : "▼"}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600"
                          onClick={() => {
                            setEditingRateId(r.id);
                            setEditRateForm({
                              vehicleType: r.vehicleType ?? "CAR",
                              rateType: r.rateType ?? "HOURLY",
                              rateAmount: r.rateAmount ?? "",
                              slabs: (r.slabs ?? []).map((s: any) => ({ fromMinutes: s.fromMinutes, toMinutes: s.toMinutes, charge: String(s.charge) })),
                            });
                            setEditNewSlab({ fromMinutes: "", toMinutes: "", charge: "" });
                          }}
                          data-testid={`button-edit-rate-${r.id}`}
                        ><Edit2 className="h-3.5 w-3.5" /></Button>
                        <Button
                          size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                          onClick={() => deleteRateMutation.mutate(r.id)}
                          disabled={deleteRateMutation.isPending}
                          data-testid={`button-delete-rate-${r.id}`}
                        ><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  )}
                  {editingRateId !== r.id && expandedRateId === r.id && r.slabs?.length > 0 && (
                    <div className="px-3 pb-3 space-y-1" data-testid={`slabs-expanded-${r.id}`}>
                      <div className="text-xs text-muted-foreground font-medium mb-1">Slabs</div>
                      {r.slabs.map((slab: any, idx: number) => (
                        <div key={idx} className="flex gap-3 text-xs px-2 py-1 bg-background rounded border">
                          <span className="text-muted-foreground">{slab.fromMinutes}–{slab.toMinutes ?? "∞"} min</span>
                          <span className="font-medium ml-auto">{fmt(parseFloat(slab.charge ?? "0"))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slots */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ParkingSquare className="h-4 w-4" /> Slots ({slots.filter((s: any) => s.isActive !== false).length} active)
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowSlotForm(!showSlotForm)} data-testid="button-add-slot">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Slot
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showSlotForm && (
            <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border" data-testid="slot-form">
              <Input
                placeholder="Slot code (e.g. A1)"
                value={slotForm.slotCode}
                onChange={e => setSlotForm(f => ({ ...f, slotCode: e.target.value }))}
                className="w-32"
                data-testid="input-slot-code"
              />
              <Select value={slotForm.zoneId || "_none"} onValueChange={v => setSlotForm(f => ({ ...f, zoneId: v === "_none" ? "" : v }))}>
                <SelectTrigger className="w-40" data-testid="select-slot-zone">
                  <SelectValue placeholder="Zone (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No Zone</SelectItem>
                  {zones.map((z: any) => (
                    <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={slotForm.slotType} onValueChange={v => setSlotForm(f => ({ ...f, slotType: v }))}>
                <SelectTrigger className="w-32" data-testid="select-slot-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STANDARD">Standard</SelectItem>
                  <SelectItem value="COMPACT">Compact</SelectItem>
                  <SelectItem value="LARGE">Large</SelectItem>
                  <SelectItem value="HANDICAP">Handicap</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!slotForm.slotCode.trim() || addSlotMutation.isPending} onClick={() => addSlotMutation.mutate()} data-testid="button-confirm-add-slot">
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowSlotForm(false)}>Cancel</Button>
            </div>
          )}
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="empty-slots">No slots configured</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {slots.map((s: any) => (
                <div
                  key={s.id}
                  className={`p-2 rounded-lg border text-xs text-center ${s.isActive !== false ? "bg-muted/30" : "bg-gray-100 opacity-50"}`}
                  data-testid={`slot-setting-${s.slotCode ?? s.code}`}
                >
                  <p className="font-bold">{s.slotCode ?? s.code}</p>
                  <p className="text-muted-foreground text-[10px]">{s.status ?? "available"}</p>
                  <button
                    className="text-[10px] text-blue-600 hover:underline mt-0.5"
                    onClick={() => toggleSlotMutation.mutate({ slotId: s.id, isActive: !(s.isActive !== false) })}
                    data-testid={`button-toggle-slot-${s.id}`}
                  >
                    {s.isActive !== false ? "Deactivate" : "Activate"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function ParkingPage() {
  const { t } = useTranslation("modules");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { playAlert } = useRequestSounds();

  const { data: outlets = [] } = useQuery<any[]>({
    queryKey: ["/api/outlets"],
    staleTime: 60000,
  });

  const defaultOutletId = user?.outletId || outlets[0]?.id || "";
  const [selectedOutletId, setSelectedOutletId] = useState<string>(defaultOutletId);

  useEffect(() => {
    if (!selectedOutletId && defaultOutletId) {
      setSelectedOutletId(defaultOutletId);
    }
  }, [defaultOutletId]);

  const outletId = selectedOutletId;

  const { data: tickets = [], refetch: refetchTickets } = useQuery<any[]>({
    queryKey: ["/api/parking/tickets", outletId, "active"],
    queryFn: async () => {
      if (!outletId) return [];
      const res = await fetch(`/api/parking/tickets/${outletId}?status=parked,requested,retrieving`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const { data: retrievalRequests = [], refetch: refetchRetrievals } = useQuery<any[]>({
    queryKey: ["/api/parking/retrieval-requests", outletId],
    queryFn: async () => {
      if (!outletId) return [];
      const res = await fetch(`/api/parking/retrieval-requests/${outletId}?status=pending,assigned,in_progress,ready`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    staleTime: 10000,
    refetchInterval: 15000,
  });

  // Exclude future-scheduled requests from the urgency queue (they belong in Upcoming section)
  const activeRetrievalRequests = retrievalRequests.filter(
    (r: any) => !(r.scheduledFor && new Date(r.scheduledFor) > new Date())
  );
  const upcomingRetrievalRequests = retrievalRequests.filter(
    (r: any) => r.scheduledFor && new Date(r.scheduledFor) > new Date()
  );

  const [showNewTicket, setShowNewTicket] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [plateLookupTrigger, setPlateLookupTrigger] = useState("");

  const { data: plateLookupResults = [], isFetching: plateLookupFetching } = useQuery<any[]>({
    queryKey: ["/api/parking/plate-lookup", outletId, plateLookupTrigger],
    queryFn: async () => {
      if (!plateLookupTrigger || plateLookupTrigger.length < 3) return [];
      const res = await apiRequest("GET", `/api/parking/plate-lookup?outletId=${outletId}&plate=${encodeURIComponent(plateLookupTrigger)}`);
      return res.json();
    },
    enabled: !!plateLookupTrigger && plateLookupTrigger.length >= 3,
    staleTime: 30000,
  });

  const isOwnerOrManager = user?.role === "owner" || user?.role === "manager";
  const isValetStaff = user?.role === "valet_staff";
  const showAttendantTab = isOwnerOrManager || isValetStaff;

  useRealtimeEvent("parking:ticket_updated", useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
    queryClient.invalidateQueries({ queryKey: ["/api/parking/stats", outletId] });
  }, [outletId, queryClient]));

  useRealtimeEvent("parking:retrieval_requested", useCallback((payload: any) => {
    refetchRetrievals();
    queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
    queryClient.invalidateQueries({ queryKey: ["/api/parking/stats", outletId] });
    playAlert("high");
    toast({
      title: "🚗 Vehicle Retrieval Requested",
      description: `Ticket ${payload?.ticketNumber ?? ""} — ${payload?.source ?? ""}`,
    });
  }, [refetchRetrievals, playAlert, toast, outletId, queryClient]));

  useRealtimeEvent("parking:retrieval_updated", useCallback(() => {
    refetchRetrievals();
    queryClient.invalidateQueries({ queryKey: ["/api/parking/tickets", outletId] });
    queryClient.invalidateQueries({ queryKey: ["/api/parking/stats", outletId] });
  }, [refetchRetrievals, outletId, queryClient]));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5 p-4 md:p-6 max-w-6xl mx-auto"
      data-testid="parking-page"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <PageTitle title={t("parking")} />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ParkingSquare className="h-6 w-6 text-blue-600" />
            Valet Parking
          </h1>
          <p className="text-sm text-muted-foreground">Manage parking tickets, slots, and retrieval requests</p>
        </div>
        <div className="flex items-center gap-2">
          {outlets.length > 1 && (
            <Select value={outletId} onValueChange={setSelectedOutletId} data-testid="select-outlet">
              <SelectTrigger className="w-48" data-testid="select-outlet">
                <SelectValue placeholder="Select outlet" />
              </SelectTrigger>
              <SelectContent>
                {outlets.map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setShowNewTicket(true)} data-testid="button-new-checkin">
            <Plus className="h-4 w-4 mr-1" /> New Check-in
          </Button>
        </div>
      </div>

      {outletId && <StatsHeader outletId={outletId} />}

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1" data-testid="parking-tabs">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="operations" data-testid="tab-operations">Operations</TabsTrigger>
          <TabsTrigger value="slot-board" data-testid="tab-slot-board">Slot Board</TabsTrigger>
          <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue & History</TabsTrigger>
          <TabsTrigger value="staff" data-testid="tab-staff">Valet Staff</TabsTrigger>
          {isOwnerOrManager && (
            <TabsTrigger value="shifts" data-testid="tab-shifts">Shifts</TabsTrigger>
          )}
          {showAttendantTab && (
            <TabsTrigger value="attendant" data-testid="tab-attendant">Attendant</TabsTrigger>
          )}
          {isOwnerOrManager && (
            <TabsTrigger value="incidents" data-testid="tab-incidents">
              <TriangleAlert className="h-3 w-3 mr-1" />
              Incidents
            </TabsTrigger>
          )}
          {isOwnerOrManager && (
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="dashboard">
          {outletId && (
            <DashboardTab
              outletId={outletId}
              tickets={tickets}
              retrievalRequests={retrievalRequests}
            />
          )}
        </TabsContent>

        <TabsContent value="operations" className="space-y-4">
          <div className="relative" data-testid="operations-search-bar">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ticket #, plate, customer name, table..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-operations-search"
            />
            {searchQuery && (
              <button
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
                data-testid="button-clear-search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {(() => {
            const q = searchQuery.trim().toLowerCase();
            const filtered = q
              ? tickets.filter((t: any) =>
                  (t.ticketNumber ?? "").toLowerCase().includes(q) ||
                  (t.vehicleNumber ?? "").toLowerCase().includes(q) ||
                  (t.customerName ?? "").toLowerCase().includes(q) ||
                  (t.tableAssignment ?? "").toLowerCase().includes(q)
                )
              : tickets;
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Car className="h-4 w-4 text-muted-foreground" />
                    {q ? `Active Results (${filtered.length})` : `Active Tickets`}
                    {!q && tickets.length > 0 && (
                      <Badge variant="secondary" data-testid="badge-active-count">{tickets.length}</Badge>
                    )}
                  </h2>
                  <div className="flex items-center gap-2">
                    {q && q.length >= 3 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPlateLookupTrigger(searchQuery.trim())}
                        data-testid="button-find-by-plate"
                        className="text-xs gap-1"
                      >
                        <Search className="h-3 w-3" />
                        Find by Plate (7d history)
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => refetchTickets()} data-testid="button-refresh-tickets">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {filtered.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl" data-testid="empty-tickets">
                    <Car className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{q ? `No active tickets matching "${q}"` : "No active tickets"}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filtered.map((ticket: any) => (
                      <ActiveTicketCard key={ticket.id} ticket={ticket} outletId={outletId} />
                    ))}
                  </div>
                )}

                {plateLookupTrigger && (
                  <div className="mt-4 space-y-2" data-testid="plate-lookup-results">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Completed Tickets (Last 7 Days) — "{plateLookupTrigger}"
                        {plateLookupFetching && <span className="ml-1 animate-spin">⟳</span>}
                      </h3>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setPlateLookupTrigger("")}
                        data-testid="button-clear-plate-lookup"
                      >
                        Clear
                      </button>
                    </div>
                    {plateLookupResults.length === 0 && !plateLookupFetching ? (
                      <p className="text-xs text-muted-foreground py-2">No completed tickets found for this plate in the last 7 days.</p>
                    ) : (
                      <div className="space-y-2">
                        {plateLookupResults.map((t: any) => (
                          <div key={t.id} className="rounded-lg border p-3 text-xs space-y-1 bg-muted/30" data-testid={`plate-lookup-ticket-${t.id}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{t.ticket_number}</span>
                              <Badge variant="outline" className="text-[10px]">Completed</Badge>
                            </div>
                            <div className="text-muted-foreground">{t.vehicle_number} · {t.vehicle_type}</div>
                            {t.customer_name && <div>Customer: {t.customer_name}</div>}
                            {t.staff_name && <div>Staff: {t.staff_name}</div>}
                            {t.slot_code && <div>Slot: {t.slot_code} {t.zone_name ? `(${t.zone_name})` : ""}</div>}
                            <div className="text-muted-foreground">
                              Exit: {t.exit_time ? new Date(t.exit_time).toLocaleString() : "—"}
                              {t.duration_minutes ? ` · ${t.duration_minutes}m` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}


          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Vehicle Retrieval Requests
                {activeRetrievalRequests.length > 0 && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700" data-testid="badge-retrieval-count">
                    {activeRetrievalRequests.length}
                  </Badge>
                )}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => refetchRetrievals()} data-testid="button-refresh-retrievals">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {activeRetrievalRequests.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground" data-testid="empty-retrievals">
                <p className="text-sm">No pending retrieval requests</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeRetrievalRequests.map((req: any) => (
                  <RetrievalRequestCard key={req.id} request={req} outletId={outletId} />
                ))}
              </div>
            )}

            {/* Upcoming Scheduled Retrievals */}
            {upcomingRetrievalRequests.length > 0 && (
              <div className="mt-3 space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5" />
                  Upcoming Scheduled ({upcomingRetrievalRequests.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {upcomingRetrievalRequests.map((req: any) => (
                    <RetrievalRequestCard key={req.id} request={req} outletId={outletId} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="slot-board">
          {outletId && <SlotBoard outletId={outletId} />}
        </TabsContent>

        <TabsContent value="revenue">
          {outletId && <RevenueHistoryTab outletId={outletId} />}
        </TabsContent>

        <TabsContent value="staff">
          {outletId && <ValetStaffTab outletId={outletId} tickets={tickets} />}
        </TabsContent>

        {isOwnerOrManager && (
          <TabsContent value="shifts">
            {outletId && <ShiftsTab outletId={outletId} />}
          </TabsContent>
        )}

        {showAttendantTab && (
          <TabsContent value="attendant">
            {outletId && <AttendantTab outletId={outletId} outletName={outlets.find((o: any) => o.id === outletId)?.name ?? ""} onOpenNewTicket={() => setShowNewTicket(true)} />}
          </TabsContent>
        )}

        {isOwnerOrManager && (
          <TabsContent value="incidents">
            {outletId && <IncidentsTab outletId={outletId} />}
          </TabsContent>
        )}

        {isOwnerOrManager && (
          <TabsContent value="settings">
            {outletId && <SettingsTab outletId={outletId} />}
          </TabsContent>
        )}
      </Tabs>

      {outletId && (
        <NewTicketDialog
          open={showNewTicket}
          onClose={() => setShowNewTicket(false)}
          outletId={outletId}
        />
      )}
    </motion.div>
  );
}
