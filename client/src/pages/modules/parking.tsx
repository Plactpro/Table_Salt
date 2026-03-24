import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { useRequestSounds } from "@/hooks/use-request-sounds";
import { motion } from "framer-motion";
import {
  Car, Bike, Plus, RefreshCw, Clock, CheckCircle2, AlertCircle,
  Loader2, User, Phone, X, ChevronRight, MapPin, CircleDot, Square,
  Hash, Clipboard, ParkingSquare, BarChart3, Timer, DollarSign, Layers,
  Settings, Users, Download, Trash2, Edit2, ToggleLeft, ToggleRight,
  TrendingUp, CalendarDays, Shield, BadgeCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

function formatCurrency(amount: number): string {
  return `₹${amount.toFixed(2)}`;
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
  const [step, setStep] = useState(1);
  const [createdTicket, setCreatedTicket] = useState<any>(null);
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
  });

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
  const activeTables = allTables.filter((t: any) => !t.outletId || t.outletId === outletId);

  const availableSlots = slots.filter((s: any) => s.status === "available");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/parking/tickets", {
        outletId,
        vehicleType: form.vehicleType,
        vehicleNumber: form.vehicleNumber,
        vehicleMake: form.vehicleMake || null,
        vehicleColor: form.vehicleColor || null,
        customerName: form.customerName || null,
        customerPhone: form.customerPhone || null,
        tableAssignment: form.tableAssignment || null,
        keyTagNumber: form.keyTagNumber || null,
        slotId: form.selectedSlotId || null,
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
    setForm({
      vehicleType: "CAR", vehicleNumber: "", vehicleMake: "", vehicleColor: "",
      customerName: "", customerPhone: "", tableAssignment: "", keyTagNumber: "",
      selectedSlotId: "", selectedSlotCode: "",
    });
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 1 ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>1</span>
              Vehicle Details
              <ChevronRight className="h-4 w-4" />
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>2</span>
              Slot Selection
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
                    onChange={e => setForm(f => ({ ...f, vehicleNumber: e.target.value }))}
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
                      onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
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
                          {activeTables.map((t: any) => (
                            <SelectItem key={t.id} value={String(t.number ?? t.name ?? t.id)} data-testid={`option-table-${t.id}`}>
                              {t.number != null ? `Table ${t.number}` : t.name || `Table ${t.id}`}
                            </SelectItem>
                          ))}
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
                  <p className="text-sm font-medium mb-3">Select Available Slot (Optional)</p>
                  {availableSlots.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No available slots configured</p>
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
                          className={`p-2 rounded-lg border text-xs font-medium transition-colors ${form.selectedSlotId === slot.id ? "bg-green-100 border-green-400 text-green-700" : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"}`}
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
                    disabled={createMutation.isPending}
                    onClick={() => createMutation.mutate()}
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

  return (
    <Card data-testid={`card-ticket-${ticket.ticketNumber}`} className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getVehicleIcon(ticket.vehicleType)}</span>
            <div>
              <p className="font-bold text-sm font-mono" data-testid={`text-ticket-num-${ticket.id}`}>{ticket.ticketNumber}</p>
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
            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => updateMutation.mutate("completed")} data-testid={`button-complete-${ticket.id}`}>
              Complete
            </Button>
          )}
          {ticket.status !== "completed" && ticket.status !== "cancelled" && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => updateMutation.mutate("cancelled")} data-testid={`button-cancel-${ticket.id}`}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RetrievalRequestCard({ request, outletId }: { request: any; outletId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [valetName, setValetName] = useState(request.assignedValetName || "");
  const [showAssignForm, setShowAssignForm] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/parking/retrieval-requests/${request.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parking/retrieval-requests", outletId] });
      toast({ title: "Request updated" });
      setShowAssignForm(false);
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Card data-testid={`card-retrieval-${request.id}`} className="border-amber-200 bg-amber-50/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="flex items-center gap-2">
              <SourceBadge source={request.requestSource} />
              <p className="font-bold text-sm font-mono" data-testid={`text-retrieval-ticket-${request.id}`}>{request.ticketNumber}</p>
            </div>
            {request.vehicleNumber && (
              <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-retrieval-vehicle-${request.id}`}>
                {request.vehicleType && `${getVehicleIcon(request.vehicleType)} `}{request.vehicleNumber}
                {request.vehicleColor && ` · ${request.vehicleColor}`}
              </p>
            )}
            {request.assignedValetName && (
              <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1" data-testid={`text-assigned-valet-${request.id}`}>
                <User className="h-3 w-3" /> {request.assignedValetName}
              </p>
            )}
          </div>
          <StatusBadge status={request.status} />
        </div>

        {request.estimatedWaitMinutes && (
          <p className="text-xs text-muted-foreground mb-2">Est. wait: {request.estimatedWaitMinutes} min</p>
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
              <span className="text-muted-foreground">Duration</span>
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

function SlotBoard({ outletId }: { outletId: string }) {
  const [popoverTicket, setPopoverTicket] = useState<any>(null);

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
    <div className="space-y-6" data-testid="slot-board">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-slots">
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

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

      {popoverTicket && (
        <SlotDetailDialog slot={popoverTicket} onClose={() => setPopoverTicket(null)} outletId={outletId} />
      )}
    </div>
  );
}

function StatsHeader({ outletId }: { outletId: string }) {
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
      <div className="bg-white rounded-xl border p-3 text-center" data-testid="stat-vehicles-in">
        <p className="text-2xl font-bold text-blue-600">{stats?.vehiclesIn ?? "—"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Vehicles In</p>
      </div>
      <div className="bg-white rounded-xl border p-3 text-center" data-testid="stat-revenue">
        <p className="text-2xl font-bold text-green-600">{stats?.revenueToday != null ? formatCurrency(stats.revenueToday) : "—"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Revenue Today</p>
      </div>
      <div className="bg-white rounded-xl border p-3 text-center" data-testid="stat-avg-duration">
        <p className="text-2xl font-bold text-amber-600">{stats?.avgDurationMinutes != null ? `${stats.avgDurationMinutes}m` : "—"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Avg Duration</p>
      </div>
      <div className="bg-white rounded-xl border p-3 text-center" data-testid="stat-available-slots">
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
  onNewCheckin,
}: {
  outletId: string;
  tickets: any[];
  retrievalRequests: any[];
  onNewCheckin: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const onDutyStaff = valetStaff.filter((s: any) => s.isOnDuty && s.isActive !== false);

  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignName, setAssignName] = useState("");

  const pendingRetrievals = retrievalRequests
    .filter(r => ["pending", "assigned", "in_progress"].includes(r.status))
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
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Overview</h2>
        <Button onClick={onNewCheckin} size="sm" data-testid="button-dashboard-new-checkin">
          <Plus className="h-4 w-4 mr-1" /> New Check-in
        </Button>
      </div>

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
            <p className="text-2xl font-bold text-green-600">{stats?.revenueToday != null ? formatCurrency(stats.revenueToday) : "—"}</p>
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
    </div>
  );
}

// ─── Revenue & History Tab ───────────────────────────────────────────────────
type DateFilter = "today" | "yesterday" | "week" | "month" | "custom";

function RevenueHistoryTab({ outletId }: { outletId: string }) {
  const [filter, setFilter] = useState<DateFilter>("today");
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

  const totalRevenue = tickets.reduce((sum: number, t: any) => sum + (parseFloat(t.chargeAmount ?? "0") || 0), 0);
  const totalDuration = tickets.reduce((sum: number, t: any) => sum + (t.durationMinutes ?? 0), 0);

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
            <p className="text-xl font-bold text-green-600" data-testid="summary-total-revenue">{formatCurrency(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
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
                <TableHead>Duration</TableHead>
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
                  <TableCell className="text-xs font-medium text-green-700">{t.chargeAmount ? formatCurrency(parseFloat(t.chargeAmount)) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

  const ticketsHandledToday: Record<string, number> = {};
  const todayStr = new Date().toISOString().split("T")[0];
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {activeStaff.map((s: any) => (
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
                  <div className="flex flex-col items-end gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.isOnDuty ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`} data-testid={`badge-duty-${s.id}`}>
                      {s.isOnDuty ? "On Duty" : "Off Duty"}
                    </span>
                    {ticketsHandledToday[s.id] != null && (
                      <span className="text-xs text-muted-foreground">{ticketsHandledToday[s.id]} tickets today</span>
                    )}
                  </div>
                </div>
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
                  placeholder="Base rate (₹)"
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
                      <span className="font-medium">{formatCurrency(parseFloat(slab.charge) || 0)}</span>
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
                      placeholder="Charge (₹)"
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
                          placeholder="Rate (₹)"
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
                              <span className="font-medium">{formatCurrency(parseFloat(slab.charge) || 0)}</span>
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 ml-auto text-red-400"
                                onClick={() => setEditRateForm(f => ({ ...f, slabs: f.slabs.filter((_, i) => i !== idx) }))}
                                data-testid={`button-remove-edit-slab-${idx}`}
                              ><X className="h-3 w-3" /></Button>
                            </div>
                          ))}
                          <div className="flex flex-wrap gap-2">
                            <Input type="number" placeholder="From (min)" value={editNewSlab.fromMinutes} onChange={e => setEditNewSlab(s => ({ ...s, fromMinutes: e.target.value }))} className="w-24 h-7 text-xs" data-testid={`input-edit-slab-from-${r.id}`} />
                            <Input type="number" placeholder="To (blank=∞)" value={editNewSlab.toMinutes} onChange={e => setEditNewSlab(s => ({ ...s, toMinutes: e.target.value }))} className="w-28 h-7 text-xs" data-testid={`input-edit-slab-to-${r.id}`} />
                            <Input type="number" placeholder="Charge (₹)" value={editNewSlab.charge} onChange={e => setEditNewSlab(s => ({ ...s, charge: e.target.value }))} className="w-24 h-7 text-xs" data-testid={`input-edit-slab-charge-${r.id}`} />
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
                        <span className="font-medium">{formatCurrency(parseFloat(r.rateAmount ?? "0"))}</span>
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
                        <div key={idx} className="flex gap-3 text-xs px-2 py-1 bg-white rounded border">
                          <span className="text-muted-foreground">{slab.fromMinutes}–{slab.toMinutes ?? "∞"} min</span>
                          <span className="font-medium ml-auto">{formatCurrency(parseFloat(slab.charge ?? "0"))}</span>
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

  const [showNewTicket, setShowNewTicket] = useState(false);

  const isOwnerOrManager = user?.role === "owner" || user?.role === "manager";

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
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="dashboard">
          {outletId && (
            <DashboardTab
              outletId={outletId}
              tickets={tickets}
              retrievalRequests={retrievalRequests}
              onNewCheckin={() => setShowNewTicket(true)}
            />
          )}
        </TabsContent>

        <TabsContent value="operations" className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Car className="h-4 w-4 text-muted-foreground" />
                Active Tickets
                {tickets.length > 0 && (
                  <Badge variant="secondary" data-testid="badge-active-count">{tickets.length}</Badge>
                )}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => refetchTickets()} data-testid="button-refresh-tickets">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {tickets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl" data-testid="empty-tickets">
                <Car className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No active tickets</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tickets.map((ticket: any) => (
                  <ActiveTicketCard key={ticket.id} ticket={ticket} outletId={outletId} />
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Vehicle Retrieval Requests
                {retrievalRequests.length > 0 && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700" data-testid="badge-retrieval-count">
                    {retrievalRequests.length}
                  </Badge>
                )}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => refetchRetrievals()} data-testid="button-refresh-retrievals">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {retrievalRequests.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground" data-testid="empty-retrievals">
                <p className="text-sm">No pending retrieval requests</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {retrievalRequests.map((req: any) => (
                  <RetrievalRequestCard key={req.id} request={req} outletId={outletId} />
                ))}
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
