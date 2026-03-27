import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { motion } from "framer-motion";
import {
  Printer, Plus, Pencil, Trash2, CheckCircle2, XCircle, AlertCircle,
  HelpCircle, Wifi, RotateCcw, X, ChevronDown, Clock, RefreshCw, Ban, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table as UITable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

interface PrinterDevice {
  id: string;
  name: string;
  type: "kitchen" | "cashier" | "label" | "bar";
  connectionType: "network" | "usb" | "browser";
  ipAddress?: string | null;
  port?: number | null;
  paperWidth: "58mm" | "80mm";
  isDefault: boolean;
  status: "online" | "low_paper" | "offline" | "unknown";
  stationId?: string | null;
  autoKotPrint?: boolean;
  autoReceiptPrint?: boolean;
}

interface PrintJob {
  id: string;
  type: string;
  referenceId: string;
  station: string | null;
  status: string;
  attempts?: number;
  createdAt: string;
}

interface KitchenStation {
  id: string;
  name: string;
  displayName: string;
}

const PRINTER_TYPES = [
  { value: "kitchen", label: "Kitchen (KOT)" },
  { value: "cashier", label: "Cashier (Bill/Receipt)" },
  { value: "label", label: "Label Printer" },
  { value: "bar", label: "Bar Printer" },
];

const CONNECTION_TYPES = [
  { value: "network", label: "Network (IP)" },
  { value: "usb", label: "USB" },
  { value: "browser", label: "Browser Print" },
];

const PAPER_WIDTHS = [
  { value: "58mm", label: "58mm" },
  { value: "80mm", label: "80mm" },
];

function statusBadge(status: string) {
  switch (status) {
    case "online":
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 gap-1"><CheckCircle2 className="h-3 w-3" /> Online</Badge>;
    case "low_paper":
      return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 gap-1"><AlertCircle className="h-3 w-3" /> Low Paper</Badge>;
    case "offline":
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 gap-1"><XCircle className="h-3 w-3" /> Offline</Badge>;
    default:
      return <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 gap-1"><HelpCircle className="h-3 w-3" /> Unknown</Badge>;
  }
}

function jobStatusBadge(status: string) {
  switch (status) {
    case "printed":
      return <Badge className="bg-green-100 text-green-700 text-xs gap-1"><CheckCircle2 className="h-3 w-3" /> Printed</Badge>;
    case "failed":
      return <Badge className="bg-red-100 text-red-700 text-xs gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
    case "queued":
      return <Badge className="bg-blue-100 text-blue-700 text-xs gap-1"><Clock className="h-3 w-3" /> Queued</Badge>;
    case "cancelled":
      return <Badge className="bg-gray-100 text-gray-600 text-xs gap-1"><Ban className="h-3 w-3" /> Cancelled</Badge>;
    default:
      return <Badge className="text-xs">{status}</Badge>;
  }
}

const DEFAULT_PRINTER: Partial<PrinterDevice> = {
  name: "",
  type: "kitchen",
  connectionType: "browser",
  ipAddress: "",
  port: 9100,
  paperWidth: "80mm",
  isDefault: false,
  autoKotPrint: false,
  autoReceiptPrint: false,
};

export default function PrinterSettingsPage() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<PrinterDevice | null>(null);
  const [deletingPrinterId, setDeletingPrinterId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<PrinterDevice>>(DEFAULT_PRINTER);
  const [testResult, setTestResult] = useState<{ status: "success" | "error"; message: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testConnectionLoading, setTestConnectionLoading] = useState(false);
  const [kotTemplateForm, setKotTemplateForm] = useState({
    headerText: "", footerText: "", showModifications: true, showAllergy: true,
  });
  const [billTemplateForm, setBillTemplateForm] = useState({
    showLogo: true, showTaxBreakdown: true, showQrCode: false, qrCodeContent: "receipt_url",
  });
  const [templateSaving, setTemplateSaving] = useState(false);

  const { data: printers = [], isLoading: printersLoading } = useQuery<PrinterDevice[]>({
    queryKey: ["/api/printers"],
    queryFn: async () => {
      const res = await fetch("/api/printers", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 120000,
  });

  const { data: stations = [] } = useQuery<KitchenStation[]>({
    queryKey: ["/api/kitchen-stations"],
    queryFn: async () => {
      const res = await fetch("/api/kitchen-stations", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: printJobs = [] } = useQuery<PrintJob[]>({
    queryKey: ["/api/print-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/print-jobs?limit=50", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: printTemplates } = useQuery<any>({
    queryKey: ["/api/print/templates"],
    queryFn: async () => {
      const res = await fetch("/api/print/templates", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  useEffect(() => {
    if (printTemplates) {
      if (printTemplates.kot) {
        setKotTemplateForm({
          headerText: printTemplates.kot.headerText || "",
          footerText: printTemplates.kot.footerText || "",
          showModifications: printTemplates.kot.showModifications ?? true,
          showAllergy: printTemplates.kot.showAllergy ?? true,
        });
      }
      if (printTemplates.bill) {
        setBillTemplateForm({
          showLogo: printTemplates.bill.showLogo ?? true,
          showTaxBreakdown: printTemplates.bill.showTaxBreakdown ?? true,
          showQrCode: printTemplates.bill.showQrCode ?? false,
          qrCodeContent: printTemplates.bill.qrCodeContent || "receipt_url",
        });
      }
    }
  }, [printTemplates]);

  useRealtimeEvent("printer:status_changed", useCallback((payload: unknown) => {
    queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
  }, [queryClient]));

  const createPrinterMutation = useMutation({
    mutationFn: async (data: Partial<PrinterDevice>) => {
      const res = await apiRequest("POST", "/api/printers", data);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to create printer");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      toast({ title: "Printer added" });
      setShowAddDialog(false);
      setEditingPrinter(null);
      setForm(DEFAULT_PRINTER);
      setTestResult(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updatePrinterMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PrinterDevice> }) => {
      const res = await apiRequest("PATCH", `/api/printers/${id}`, data);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to update printer");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      toast({ title: "Printer updated" });
      setEditingPrinter(null);
      setShowAddDialog(false);
      setForm(DEFAULT_PRINTER);
      setTestResult(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePrinterMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/printers/${id}`);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to delete printer");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      toast({ title: "Printer deleted" });
      setDeletingPrinterId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleTestPrint = async (printerId: string) => {
    setTestingId(printerId);
    try {
      const res = await apiRequest("POST", `/api/printers/${printerId}/test`);
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: "Test print sent", description: "Printer responded successfully" });
        queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      } else {
        toast({ title: "Test failed", description: data.message || "Printer did not respond", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  const handleTestConnection = async () => {
    if (!editingPrinter) return;
    setTestConnectionLoading(true);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", `/api/printers/${editingPrinter.id}/test`);
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ status: "success", message: "Connection successful — printer is online" });
        queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      } else {
        setTestResult({ status: "error", message: data.message || "Printer did not respond" });
      }
    } catch (e: any) {
      setTestResult({ status: "error", message: e.message });
    } finally {
      setTestConnectionLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingPrinter(null);
    setForm(DEFAULT_PRINTER);
    setTestResult(null);
    setShowAddDialog(true);
  };

  const handleOpenEdit = (printer: PrinterDevice) => {
    setEditingPrinter(printer);
    setForm({
      name: printer.name,
      type: printer.type,
      connectionType: printer.connectionType,
      ipAddress: printer.ipAddress || "",
      port: printer.port || 9100,
      paperWidth: printer.paperWidth,
      isDefault: printer.isDefault,
      stationId: printer.stationId || "",
      autoKotPrint: printer.autoKotPrint || false,
      autoReceiptPrint: printer.autoReceiptPrint || false,
    });
    setTestResult(null);
    setShowAddDialog(true);
  };

  const handleSavePrinter = () => {
    if (!form.name?.trim()) {
      toast({ title: "Printer name is required", variant: "destructive" });
      return;
    }
    if (editingPrinter) {
      updatePrinterMutation.mutate({ id: editingPrinter.id, data: form });
    } else {
      createPrinterMutation.mutate(form);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      await apiRequest("POST", `/api/print-jobs/${jobId}/retry`);
      queryClient.invalidateQueries({ queryKey: ["/api/print-jobs"] });
      toast({ title: "Retry queued" });
    } catch (e: any) {
      toast({ title: "Retry failed", description: e.message, variant: "destructive" });
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await apiRequest("PATCH", `/api/print-jobs/${jobId}/status`, { status: "cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/print-jobs"] });
      toast({ title: "Job cancelled" });
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e.message, variant: "destructive" });
    }
  };

  const handleSaveTemplates = async (templateType: "kot" | "bill") => {
    setTemplateSaving(true);
    try {
      const body = templateType === "kot" ? kotTemplateForm : billTemplateForm;
      await apiRequest("POST", `/api/print/templates/${templateType}`, body);
      queryClient.invalidateQueries({ queryKey: ["/api/print/templates"] });
      toast({ title: "Template saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setTemplateSaving(false);
    }
  };

  const isManagerOrOwner = user?.role === "owner" || user?.role === "manager" || user?.role === "outlet_manager";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2" data-testid="text-printer-settings-title">
            <Printer className="h-6 w-6 text-primary" /> Printer Setup
          </h1>
          <p className="text-muted-foreground text-sm">Manage printers, print job history, and templates</p>
        </div>
        {isManagerOrOwner && (
          <Button onClick={handleOpenAdd} className="gap-2" data-testid="button-add-printer">
            <Plus className="h-4 w-4" /> Add Printer
          </Button>
        )}
      </div>

      <Tabs defaultValue="printers">
        <TabsList data-testid="tabs-printer-settings">
          <TabsTrigger value="printers" data-testid="tab-printers">Printers</TabsTrigger>
          <TabsTrigger value="jobs" data-testid="tab-print-jobs">Print Jobs</TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="printers" className="space-y-4 mt-4">
          <div className="grid gap-4">
            {printersLoading ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-printers-loading">
                Loading printers...
              </div>
            ) : printers.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-no-printers">
                  <Printer className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No printers configured</p>
                  <p className="text-sm mt-1">Add a printer to get started with thermal printing</p>
                  {isManagerOrOwner && (
                    <Button className="mt-4 gap-2" onClick={handleOpenAdd} data-testid="button-add-first-printer">
                      <Plus className="h-4 w-4" /> Add Printer
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              printers.map((printer, i) => (
                <motion.div
                  key={printer.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card data-testid={`card-printer-${printer.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Printer className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold" data-testid={`text-printer-name-${printer.id}`}>{printer.name}</span>
                              {printer.isDefault && (
                                <Badge variant="secondary" className="text-xs" data-testid={`badge-default-${printer.id}`}>Default</Badge>
                              )}
                              {statusBadge(printer.status)}
                            </div>
                            <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                              <span data-testid={`text-printer-type-${printer.id}`}>{PRINTER_TYPES.find(t => t.value === printer.type)?.label}</span>
                              <span>·</span>
                              <span>{CONNECTION_TYPES.find(c => c.value === printer.connectionType)?.label}</span>
                              {printer.connectionType === "network" && printer.ipAddress && (
                                <>
                                  <span>·</span>
                                  <span className="font-mono text-xs" data-testid={`text-printer-ip-${printer.id}`}>{printer.ipAddress}:{printer.port}</span>
                                </>
                              )}
                              <span>·</span>
                              <span>{printer.paperWidth}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestPrint(printer.id)}
                            disabled={testingId === printer.id}
                            className="gap-1 text-xs"
                            data-testid={`button-test-print-${printer.id}`}
                          >
                            {testingId === printer.id ? (
                              <><RefreshCw className="h-3 w-3 animate-spin" /> Testing...</>
                            ) : (
                              <><Printer className="h-3 w-3" /> Test Print</>
                            )}
                          </Button>
                          {isManagerOrOwner && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(printer)} data-testid={`button-edit-printer-${printer.id}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeletingPrinterId(printer.id)} data-testid={`button-delete-printer-${printer.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </div>

          {printers.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Auto-Print Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Auto-print KOT on order sent</p>
                    <p className="text-xs text-muted-foreground">Automatically print kitchen tickets when orders are placed</p>
                  </div>
                  <Switch
                    data-testid="switch-auto-kot"
                    checked={printers.some(p => p.autoKotPrint)}
                    onCheckedChange={async (checked) => {
                      const kitchenPrinter = printers.find(p => p.type === "kitchen");
                      if (kitchenPrinter) {
                        await apiRequest("PATCH", `/api/printers/${kitchenPrinter.id}`, { autoKotPrint: checked });
                        queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
                      }
                    }}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Auto-print receipt on payment</p>
                    <p className="text-xs text-muted-foreground">Automatically print receipts after successful payment</p>
                  </div>
                  <Switch
                    data-testid="switch-auto-receipt"
                    checked={printers.some(p => p.autoReceiptPrint)}
                    onCheckedChange={async (checked) => {
                      const cashierPrinter = printers.find(p => p.type === "cashier");
                      if (cashierPrinter) {
                        await apiRequest("PATCH", `/api/printers/${cashierPrinter.id}`, { autoReceiptPrint: checked });
                        queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Recent Print Jobs</CardTitle>
              <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/print-jobs"] })} data-testid="button-refresh-jobs">
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {printJobs.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm" data-testid="text-no-jobs">
                  No print jobs recorded yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <UITable>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Job Type</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Station</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {printJobs.map((job, i) => (
                        <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                          <TableCell className="text-xs text-muted-foreground">
                            {job.createdAt ? new Date(job.createdAt).toLocaleString(i18n.language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">{job.type}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs" data-testid={`text-job-ref-${job.id}`}>
                            #{job.referenceId.slice(-6).toUpperCase()}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{job.station || "—"}</TableCell>
                          <TableCell>{jobStatusBadge(job.status)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {job.status === "failed" && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleRetryJob(job.id)} data-testid={`button-retry-job-${job.id}`}>
                                  <RotateCcw className="h-3 w-3" /> Retry
                                </Button>
                              )}
                              {job.status === "queued" && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => handleCancelJob(job.id)} data-testid={`button-cancel-job-${job.id}`}>
                                  <X className="h-3 w-3" /> Cancel
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </UITable>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> KOT Template
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="kot-header">Header Text</Label>
                  <Input
                    id="kot-header"
                    value={kotTemplateForm.headerText}
                    onChange={e => setKotTemplateForm(f => ({ ...f, headerText: e.target.value }))}
                    placeholder="e.g. KITCHEN ORDER TICKET"
                    data-testid="input-kot-header"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kot-footer">Footer Text</Label>
                  <Input
                    id="kot-footer"
                    value={kotTemplateForm.footerText}
                    onChange={e => setKotTemplateForm(f => ({ ...f, footerText: e.target.value }))}
                    placeholder="e.g. Cook with care!"
                    data-testid="input-kot-footer"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Show Modifications</Label>
                  <Switch
                    checked={kotTemplateForm.showModifications}
                    onCheckedChange={v => setKotTemplateForm(f => ({ ...f, showModifications: v }))}
                    data-testid="switch-kot-modifications"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Show Allergy Notes</Label>
                  <Switch
                    checked={kotTemplateForm.showAllergy}
                    onCheckedChange={v => setKotTemplateForm(f => ({ ...f, showAllergy: v }))}
                    data-testid="switch-kot-allergy"
                  />
                </div>
              </div>
              <Button
                onClick={() => handleSaveTemplates("kot")}
                disabled={templateSaving}
                className="gap-2"
                data-testid="button-save-kot-template"
              >
                {templateSaving ? <><RefreshCw className="h-4 w-4 animate-spin" /> Saving...</> : "Save KOT Template"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Bill / Receipt Template
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Show Restaurant Logo</Label>
                  <Switch
                    checked={billTemplateForm.showLogo}
                    onCheckedChange={v => setBillTemplateForm(f => ({ ...f, showLogo: v }))}
                    data-testid="switch-bill-logo"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Show Tax Breakdown</Label>
                  <Switch
                    checked={billTemplateForm.showTaxBreakdown}
                    onCheckedChange={v => setBillTemplateForm(f => ({ ...f, showTaxBreakdown: v }))}
                    data-testid="switch-bill-tax"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Show QR Code</Label>
                  <Switch
                    checked={billTemplateForm.showQrCode}
                    onCheckedChange={v => setBillTemplateForm(f => ({ ...f, showQrCode: v }))}
                    data-testid="switch-bill-qr"
                  />
                </div>
                {billTemplateForm.showQrCode && (
                  <div className="space-y-1.5">
                    <Label>QR Code Content</Label>
                    <Select value={billTemplateForm.qrCodeContent} onValueChange={v => setBillTemplateForm(f => ({ ...f, qrCodeContent: v }))}>
                      <SelectTrigger data-testid="select-qr-content">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="receipt_url">Digital Receipt URL</SelectItem>
                        <SelectItem value="payment_link">Payment Link</SelectItem>
                        <SelectItem value="menu_url">Menu URL</SelectItem>
                        <SelectItem value="feedback_url">Feedback URL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <Button
                onClick={() => handleSaveTemplates("bill")}
                disabled={templateSaving}
                className="gap-2"
                data-testid="button-save-bill-template"
              >
                {templateSaving ? <><RefreshCw className="h-4 w-4 animate-spin" /> Saving...</> : "Save Bill Template"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showAddDialog} onOpenChange={(o) => { if (!o) { setShowAddDialog(false); setEditingPrinter(null); setTestResult(null); } }}>
        <DialogContent className="max-w-lg" data-testid="dialog-printer-form">
          <DialogHeader>
            <DialogTitle>{editingPrinter ? "Edit Printer" : "Add Printer"}</DialogTitle>
            <DialogDescription>Configure your thermal printer connection settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="printer-name">Printer Name *</Label>
              <Input
                id="printer-name"
                value={form.name || ""}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Kitchen Printer 1"
                data-testid="input-printer-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Printer Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as PrinterDevice["type"] }))}>
                  <SelectTrigger data-testid="select-printer-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRINTER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Connection Type</Label>
                <Select value={form.connectionType} onValueChange={v => setForm(f => ({ ...f, connectionType: v as PrinterDevice["connectionType"] }))}>
                  <SelectTrigger data-testid="select-connection-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONNECTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.connectionType === "network" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="printer-ip">IP Address</Label>
                  <Input
                    id="printer-ip"
                    value={form.ipAddress || ""}
                    onChange={e => setForm(f => ({ ...f, ipAddress: e.target.value }))}
                    placeholder="192.168.1.100"
                    data-testid="input-printer-ip"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="printer-port">Port</Label>
                  <Input
                    id="printer-port"
                    type="number"
                    value={form.port || 9100}
                    onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) }))}
                    data-testid="input-printer-port"
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Paper Width</Label>
                <Select value={form.paperWidth} onValueChange={v => setForm(f => ({ ...f, paperWidth: v as PrinterDevice["paperWidth"] }))}>
                  <SelectTrigger data-testid="select-paper-width"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAPER_WIDTHS.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Counter Assignment</Label>
                <Select value={form.stationId || "none"} onValueChange={v => setForm(f => ({ ...f, stationId: v === "none" ? null : v }))}>
                  <SelectTrigger data-testid="select-station"><SelectValue placeholder="No station" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No station</SelectItem>
                    {stations.map(s => <SelectItem key={s.id} value={s.id}>{s.displayName || s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Set as Default</Label>
              <Switch
                checked={form.isDefault || false}
                onCheckedChange={v => setForm(f => ({ ...f, isDefault: v }))}
                data-testid="switch-default-printer"
              />
            </div>

            {editingPrinter && (
              <div>
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testConnectionLoading}
                  className="gap-2 w-full"
                  data-testid="button-test-connection"
                >
                  {testConnectionLoading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Testing...</> : <><Wifi className="h-4 w-4" /> TEST CONNECTION</>}
                </Button>
                {testResult && (
                  <div className={`mt-2 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${testResult.status === "success" ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`} data-testid="text-test-result">
                    {testResult.status === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                    {testResult.message}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setEditingPrinter(null); setTestResult(null); }} data-testid="button-cancel-printer-form">Cancel</Button>
            <Button onClick={handleSavePrinter} disabled={createPrinterMutation.isPending || updatePrinterMutation.isPending} data-testid="button-save-printer">
              {editingPrinter ? "Save Changes" : "Add Printer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingPrinterId} onOpenChange={(o) => !o && setDeletingPrinterId(null)}>
        <AlertDialogContent data-testid="dialog-confirm-delete-printer">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Printer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this printer? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-printer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deletingPrinterId && deletePrinterMutation.mutate(deletingPrinterId)}
              data-testid="button-confirm-delete-printer"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
