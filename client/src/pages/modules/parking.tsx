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
        <p className="text-xs mt-1">Add zones and slots in the Outlet Settings</p>
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
        <p className="text-2xl font-bold text-green-600">{stats?.revenueToday != null ? `${stats.revenueToday}` : "—"}</p>
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

  useRealtimeEvent("parking:retrieval_requested", useCallback((payload: any) => {
    refetchRetrievals();
    playAlert("high");
    toast({
      title: "🚗 Vehicle Retrieval Requested",
      description: `Ticket ${payload?.ticketNumber ?? ""} — ${payload?.source ?? ""}`,
    });
  }, [refetchRetrievals, playAlert, toast]));

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

      <Tabs defaultValue="operations" className="space-y-4">
        <TabsList data-testid="parking-tabs">
          <TabsTrigger value="operations" data-testid="tab-operations">Operations</TabsTrigger>
          <TabsTrigger value="slot-board" data-testid="tab-slot-board">Slot Board</TabsTrigger>
        </TabsList>

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
                  <Badge variant="destructive" data-testid="badge-retrieval-count">{retrievalRequests.length}</Badge>
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
