import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit2,
  Trash2,
  Users,
  MapPin,
  Clock,
  CalendarDays,
  Filter,
  ChevronDown,
  CircleCheck,
  CircleX,
  Timer,
  Sparkles,
  ShieldBan,
  Armchair,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type TableStatus = "free" | "occupied" | "reserved" | "cleaning" | "blocked";

interface TableData {
  id: string;
  tenantId: string;
  outletId: string | null;
  number: number;
  capacity: number | null;
  zone: string | null;
  status: TableStatus | null;
}

interface ReservationData {
  id: string;
  tenantId: string;
  tableId: string | null;
  customerName: string;
  customerPhone: string | null;
  guests: number | null;
  dateTime: string;
  notes: string | null;
  status: string | null;
}

const statusConfig: Record<TableStatus, { color: string; bg: string; label: string }> = {
  free: { color: "text-green-700 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700", label: "Free" },
  occupied: { color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700", label: "Occupied" },
  reserved: { color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-100 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700", label: "Reserved" },
  cleaning: { color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700", label: "Cleaning" },
  blocked: { color: "text-gray-700 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-900/40 border-gray-300 dark:border-gray-700", label: "Blocked" },
};

const statusDotColor: Record<TableStatus, string> = {
  free: "bg-green-500",
  occupied: "bg-red-500",
  reserved: "bg-yellow-500",
  cleaning: "bg-blue-500",
  blocked: "bg-gray-500",
};

const statusIcon: Record<TableStatus, React.ElementType> = {
  free: CircleCheck,
  occupied: CircleX,
  reserved: Timer,
  cleaning: Sparkles,
  blocked: ShieldBan,
};

export default function TablesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [filterZone, setFilterZone] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [reservationDateFilter, setReservationDateFilter] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [activeTab, setActiveTab] = useState<"floor" | "reservations">("floor");

  const [formData, setFormData] = useState({
    number: "",
    capacity: "4",
    zone: "Main",
    status: "free" as TableStatus,
  });

  const { data: tables = [], isLoading: tablesLoading } = useQuery<TableData[]>({
    queryKey: ["/api/tables"],
  });

  const { data: reservations = [], isLoading: reservationsLoading } = useQuery<ReservationData[]>({
    queryKey: ["/api/reservations"],
  });

  const createTableMutation = useMutation({
    mutationFn: async (data: { number: number; capacity: number; zone: string; status: string }) => {
      const res = await apiRequest("POST", "/api/tables", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      setShowAddDialog(false);
      resetForm();
      toast({ title: "Table added successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add table", description: err.message, variant: "destructive" });
    },
  });

  const updateTableMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; number?: number; capacity?: number; zone?: string; status?: string }) => {
      const res = await apiRequest("PATCH", `/api/tables/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      setShowEditDialog(false);
      setShowDetailDialog(false);
      setSelectedTable(null);
      resetForm();
      toast({ title: "Table updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update table", description: err.message, variant: "destructive" });
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/tables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      setShowEditDialog(false);
      setSelectedTable(null);
      toast({ title: "Table deleted successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete table", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ number: "", capacity: "4", zone: "Main", status: "free" });
  };

  const zones = Array.from(new Set(tables.map((t) => t.zone || "Main")));

  const filteredTables = tables.filter((t) => {
    if (filterZone !== "all" && (t.zone || "Main") !== filterZone) return false;
    if (filterStatus !== "all" && (t.status || "free") !== filterStatus) return false;
    return true;
  });

  const groupedByZone = filteredTables.reduce<Record<string, TableData[]>>((acc, table) => {
    const zone = table.zone || "Main";
    if (!acc[zone]) acc[zone] = [];
    acc[zone].push(table);
    return acc;
  }, {});

  const filteredReservations = reservations.filter((r) => {
    if (!reservationDateFilter) return true;
    const rDate = new Date(r.dateTime).toISOString().split("T")[0];
    return rDate === reservationDateFilter;
  });

  const handleTableClick = (table: TableData) => {
    setSelectedTable(table);
    setShowDetailDialog(true);
  };

  const handleEditTable = (table: TableData) => {
    setSelectedTable(table);
    setFormData({
      number: String(table.number),
      capacity: String(table.capacity ?? 4),
      zone: table.zone || "Main",
      status: (table.status as TableStatus) || "free",
    });
    setShowEditDialog(true);
  };

  const handleStatusChange = (table: TableData, newStatus: TableStatus) => {
    updateTableMutation.mutate({ id: table.id, status: newStatus });
  };

  const handleAddSubmit = () => {
    createTableMutation.mutate({
      number: parseInt(formData.number),
      capacity: parseInt(formData.capacity),
      zone: formData.zone,
      status: formData.status,
    });
  };

  const handleEditSubmit = () => {
    if (!selectedTable) return;
    updateTableMutation.mutate({
      id: selectedTable.id,
      number: parseInt(formData.number),
      capacity: parseInt(formData.capacity),
      zone: formData.zone,
      status: formData.status,
    });
  };

  const statusCounts = tables.reduce<Record<string, number>>((acc, t) => {
    const s = t.status || "free";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Armchair className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Tables & Floor Plan</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your restaurant tables and reservations</p>
          </div>
        </div>
        <Button data-testid="button-add-table" onClick={() => { resetForm(); setShowAddDialog(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Add Table
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          data-testid="button-tab-floor"
          variant={activeTab === "floor" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("floor")}
        >
          <MapPin className="w-4 h-4 mr-1" />
          Floor Plan
        </Button>
        <Button
          data-testid="button-tab-reservations"
          variant={activeTab === "reservations" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("reservations")}
        >
          <CalendarDays className="w-4 h-4 mr-1" />
          Reservations
        </Button>
      </div>

      {activeTab === "floor" && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            {Object.entries(statusConfig).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                <span className={`w-3 h-3 rounded-full ${statusDotColor[key as TableStatus]}`} />
                <span className="text-muted-foreground">
                  {cfg.label} ({statusCounts[key] || 0})
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-3 items-center" data-testid="filters-bar">
            <Select value={filterZone} onValueChange={setFilterZone}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-zone">
                <Filter className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Zones</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z} value={z}>{z}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
                <ChevronDown className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(statusConfig).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tablesLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : Object.keys(groupedByZone).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground" data-testid="text-no-tables">No tables found. Add your first table to get started.</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedByZone).map(([zone, zoneTables]) => (
              <motion.div
                key={zone}
                className="space-y-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2" data-testid={`text-zone-${zone}`}>
                  <MapPin className="h-4 w-4" />
                  {zone} ({zoneTables.length} tables)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <AnimatePresence>
                    {zoneTables
                      .sort((a, b) => a.number - b.number)
                      .map((table) => {
                        const st = (table.status as TableStatus) || "free";
                        const cfg = statusConfig[st];
                        return (
                          <motion.div
                            key={table.id}
                            layout
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Card
                              data-testid={`card-table-${table.id}`}
                              className={`cursor-pointer border-2 transition-all duration-200 hover:shadow-lg hover:scale-[1.03] ${cfg.bg}`}
                              onClick={() => handleTableClick(table)}
                            >
                              <CardContent className="p-4 text-center space-y-2">
                                {(() => {
                                  const StIcon = statusIcon[st];
                                  return (
                                    <motion.div
                                      key={st}
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      transition={{ type: "spring", stiffness: 300 }}
                                      className="flex justify-center"
                                    >
                                      <StIcon className={`h-6 w-6 ${cfg.color}`} />
                                    </motion.div>
                                  );
                                })()}
                                <div className="text-2xl font-bold" data-testid={`text-table-number-${table.id}`}>
                                  T{table.number}
                                </div>
                                <Badge
                                  variant="outline"
                                  className={`${cfg.color} text-xs`}
                                  data-testid={`badge-table-status-${table.id}`}
                                >
                                  {cfg.label}
                                </Badge>
                                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                                  <Users className="w-3 h-3" />
                                  <span data-testid={`text-table-capacity-${table.id}`}>{table.capacity ?? 4}</span>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        );
                      })}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))
          )}
        </>
      )}

      {activeTab === "reservations" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Label>Date</Label>
            <Input
              type="date"
              value={reservationDateFilter}
              onChange={(e) => setReservationDateFilter(e.target.value)}
              className="w-[180px]"
              data-testid="input-reservation-date"
            />
          </div>

          {reservationsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : filteredReservations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CalendarDays className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground" data-testid="text-no-reservations">No reservations for this date.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredReservations.map((res) => {
                const table = tables.find((t) => t.id === res.tableId);
                const dt = new Date(res.dateTime);
                return (
                  <motion.div
                    key={res.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card data-testid={`card-reservation-${res.id}`}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <CalendarDays className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium" data-testid={`text-reservation-name-${res.id}`}>
                              {res.customerName}
                            </p>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {res.guests ?? 2} guests
                              </span>
                              {table && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  Table {table.number}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          data-testid={`badge-reservation-status-${res.id}`}
                        >
                          {res.status || "requested"}
                        </Badge>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Table {selectedTable?.number} Details</DialogTitle>
          </DialogHeader>
          {selectedTable && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Status</Label>
                  <div className="mt-1">
                    <Badge
                      variant="outline"
                      className={statusConfig[(selectedTable.status as TableStatus) || "free"].color}
                      data-testid="badge-detail-status"
                    >
                      {statusConfig[(selectedTable.status as TableStatus) || "free"].label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Capacity</Label>
                  <p className="mt-1 font-medium" data-testid="text-detail-capacity">{selectedTable.capacity ?? 4} seats</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Zone</Label>
                  <p className="mt-1 font-medium" data-testid="text-detail-zone">{selectedTable.zone || "Main"}</p>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Change Status</Label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(statusConfig) as TableStatus[]).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={selectedTable.status === s ? "default" : "outline"}
                      onClick={() => handleStatusChange(selectedTable, s)}
                      disabled={updateTableMutation.isPending}
                      data-testid={`button-status-${s}`}
                    >
                      <span className={`w-2 h-2 rounded-full mr-1.5 ${statusDotColor[s]}`} />
                      {statusConfig[s].label}
                    </Button>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDetailDialog(false);
                    handleEditTable(selectedTable);
                  }}
                  data-testid="button-edit-from-detail"
                >
                  <Edit2 className="w-4 h-4 mr-1" />
                  Edit Table
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Table</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="add-number">Table Number</Label>
              <Input
                id="add-number"
                type="number"
                value={formData.number}
                onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                placeholder="e.g. 1"
                data-testid="input-add-number"
              />
            </div>
            <div>
              <Label htmlFor="add-capacity">Capacity</Label>
              <Input
                id="add-capacity"
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                placeholder="e.g. 4"
                data-testid="input-add-capacity"
              />
            </div>
            <div>
              <Label htmlFor="add-zone">Zone</Label>
              <Input
                id="add-zone"
                value={formData.zone}
                onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                placeholder="e.g. Main, Patio, VIP"
                data-testid="input-add-zone"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as TableStatus })}>
                <SelectTrigger data-testid="select-add-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="button-cancel-add">
              Cancel
            </Button>
            <Button
              onClick={handleAddSubmit}
              disabled={!formData.number || createTableMutation.isPending}
              data-testid="button-submit-add"
            >
              {createTableMutation.isPending ? "Adding..." : "Add Table"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Table {selectedTable?.number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-number">Table Number</Label>
              <Input
                id="edit-number"
                type="number"
                value={formData.number}
                onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                data-testid="input-edit-number"
              />
            </div>
            <div>
              <Label htmlFor="edit-capacity">Capacity</Label>
              <Input
                id="edit-capacity"
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                data-testid="input-edit-capacity"
              />
            </div>
            <div>
              <Label htmlFor="edit-zone">Zone</Label>
              <Input
                id="edit-zone"
                value={formData.zone}
                onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                data-testid="input-edit-zone"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as TableStatus })}>
                <SelectTrigger data-testid="select-edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            <Button
              variant="destructive"
              onClick={() => selectedTable && deleteTableMutation.mutate(selectedTable.id)}
              disabled={deleteTableMutation.isPending}
              data-testid="button-delete-table"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button
                onClick={handleEditSubmit}
                disabled={!formData.number || updateTableMutation.isPending}
                data-testid="button-submit-edit"
              >
                {updateTableMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
