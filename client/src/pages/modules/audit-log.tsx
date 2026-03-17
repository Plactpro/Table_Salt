import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, Download, ChevronLeft, ChevronRight, Search, Clock, User, Activity, FileText, Eye } from "lucide-react";

interface AuditEvent {
  id: string;
  tenantId: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  outletId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  supervisorId: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login: { label: "Login", color: "bg-green-100 text-green-800" },
  logout: { label: "Logout", color: "bg-gray-100 text-gray-800" },
  login_failed: { label: "Login Failed", color: "bg-red-100 text-red-800" },
  order_created: { label: "Order Created", color: "bg-blue-100 text-blue-800" },
  order_updated: { label: "Order Updated", color: "bg-blue-100 text-blue-800" },
  order_voided: { label: "Order Voided", color: "bg-red-100 text-red-800" },
  menu_item_created: { label: "Menu Item Created", color: "bg-emerald-100 text-emerald-800" },
  menu_item_updated: { label: "Menu Item Updated", color: "bg-emerald-100 text-emerald-800" },
  menu_item_deleted: { label: "Menu Item Deleted", color: "bg-red-100 text-red-800" },
  inventory_adjusted: { label: "Stock Adjusted", color: "bg-amber-100 text-amber-800" },
  offer_created: { label: "Offer Created", color: "bg-purple-100 text-purple-800" },
  offer_updated: { label: "Offer Updated", color: "bg-purple-100 text-purple-800" },
  offer_deleted: { label: "Offer Deleted", color: "bg-red-100 text-red-800" },
  tenant_settings_updated: { label: "Settings Changed", color: "bg-yellow-100 text-yellow-800" },
  security_settings_updated: { label: "Security Changed", color: "bg-orange-100 text-orange-800" },
  supervisor_override: { label: "Supervisor Override", color: "bg-orange-100 text-orange-800" },
  supervisor_verify_failed: { label: "Override Failed", color: "bg-red-100 text-red-800" },
  user_created: { label: "User Created", color: "bg-blue-100 text-blue-800" },
  user_updated: { label: "User Updated", color: "bg-blue-100 text-blue-800" },
  recipe_created: { label: "Recipe Created", color: "bg-emerald-100 text-emerald-800" },
  recipe_updated: { label: "Recipe Updated", color: "bg-emerald-100 text-emerald-800" },
  recipe_deleted: { label: "Recipe Deleted", color: "bg-red-100 text-red-800" },
};

const ENTITY_TYPES = [
  { value: "none", label: "All Entity Types" },
  { value: "user", label: "Users" },
  { value: "order", label: "Orders" },
  { value: "menu_item", label: "Menu Items" },
  { value: "inventory_item", label: "Inventory" },
  { value: "offer", label: "Offers" },
  { value: "tenant", label: "Settings" },
  { value: "recipe", label: "Recipes" },
];

const PAGE_SIZE = 25;

export default function AuditLogPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("none");
  const [entityTypeFilter, setEntityTypeFilter] = useState("none");
  const [userFilter, setUserFilter] = useState("none");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const queryParams = new URLSearchParams();
  queryParams.set("limit", String(PAGE_SIZE));
  queryParams.set("offset", String(page * PAGE_SIZE));
  if (actionFilter !== "none") queryParams.set("action", actionFilter);
  if (entityTypeFilter !== "none") queryParams.set("entityType", entityTypeFilter);
  if (userFilter !== "none") queryParams.set("userId", userFilter);
  if (dateFrom) queryParams.set("from", new Date(dateFrom).toISOString());
  if (dateTo) queryParams.set("to", new Date(dateTo + "T23:59:59").toISOString());

  const { data, isLoading } = useQuery<{ events: AuditEvent[]; total: number }>({
    queryKey: ["/api/audit-log", page, actionFilter, entityTypeFilter, userFilter, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/audit-log?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
  });

  const { data: actions } = useQuery<string[]>({
    queryKey: ["/api/audit-log/actions"],
    queryFn: async () => {
      const res = await fetch("/api/audit-log/actions", { credentials: "include" });
      return res.json();
    },
  });

  const { data: users } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      return res.json();
    },
  });

  const events = data?.events || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleExport = () => {
    const exportParams = new URLSearchParams();
    if (actionFilter !== "none") exportParams.set("action", actionFilter);
    if (entityTypeFilter !== "none") exportParams.set("entityType", entityTypeFilter);
    if (userFilter !== "none") exportParams.set("userId", userFilter);
    if (dateFrom) exportParams.set("from", new Date(dateFrom).toISOString());
    if (dateTo) exportParams.set("to", new Date(dateTo + "T23:59:59").toISOString());
    window.open(`/api/audit-log/export?${exportParams.toString()}`, "_blank");
  };

  const clearFilters = () => {
    setActionFilter("none");
    setEntityTypeFilter("none");
    setUserFilter("none");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const getActionBadge = (action: string) => {
    const config = ACTION_LABELS[action] || { label: action, color: "bg-gray-100 text-gray-800" };
    return <Badge variant="outline" className={`${config.color} border-0 text-xs`} data-testid={`badge-action-${action}`}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6" data-testid="audit-log-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-audit-log-title">
            <Shield className="h-6 w-6 text-primary" />
            Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track all system activity and changes across your organization</p>
        </div>
        <Button variant="outline" onClick={handleExport} data-testid="button-export-csv">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date From</label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} data-testid="input-date-from" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date To</label>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} data-testid="input-date-to" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Action</label>
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
                <SelectTrigger data-testid="select-action-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All Actions</SelectItem>
                  {(actions || []).map(a => (
                    <SelectItem key={a} value={a}>{ACTION_LABELS[a]?.label || a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Entity Type</label>
              <Select value={entityTypeFilter} onValueChange={(v) => { setEntityTypeFilter(v); setPage(0); }}>
                <SelectTrigger data-testid="select-entity-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(et => (
                    <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">User</label>
              <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(0); }}>
                <SelectTrigger data-testid="select-user-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All Users</SelectItem>
                  {(users || []).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(actionFilter !== "none" || entityTypeFilter !== "none" || userFilter !== "none" || dateFrom || dateTo) && (
            <div className="mt-3">
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                Clear all filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Events
            </span>
            <span className="text-sm font-normal text-muted-foreground" data-testid="text-total-events">{total} total events</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-events">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No audit events found</p>
              <p className="text-xs mt-1">Events will appear here as users perform actions in the system</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Date & Time</TableHead>
                      <TableHead className="w-[140px]">User</TableHead>
                      <TableHead className="w-[160px]">Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead className="w-[120px]">IP Address</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id} data-testid={`row-audit-event-${event.id}`}>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            {formatDate(event.createdAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">{event.userName || "System"}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getActionBadge(event.action)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                              {event.entityName && <span className="text-sm font-medium">{event.entityName}</span>}
                              {event.entityType && <span className="text-xs text-muted-foreground ml-1">({event.entityType})</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{event.ipAddress || "—"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(event)} data-testid={`button-view-event-${event.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">Page {page + 1} of {totalPages || 1}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Event Details
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4" data-testid="event-details">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs">Date & Time</span>
                  <span>{formatDate(selectedEvent.createdAt)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">User</span>
                  <span>{selectedEvent.userName || "System"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Action</span>
                  {getActionBadge(selectedEvent.action)}
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">IP Address</span>
                  <span>{selectedEvent.ipAddress || "N/A"}</span>
                </div>
                {selectedEvent.entityType && (
                  <div>
                    <span className="text-muted-foreground block text-xs">Entity Type</span>
                    <span>{selectedEvent.entityType}</span>
                  </div>
                )}
                {selectedEvent.entityName && (
                  <div>
                    <span className="text-muted-foreground block text-xs">Entity Name</span>
                    <span>{selectedEvent.entityName}</span>
                  </div>
                )}
                {selectedEvent.entityId && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-xs">Entity ID</span>
                    <span className="text-xs font-mono break-all">{selectedEvent.entityId}</span>
                  </div>
                )}
                {selectedEvent.supervisorId && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-xs">Supervisor Override</span>
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Approved by supervisor</Badge>
                  </div>
                )}
              </div>

              {selectedEvent.before && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground block mb-1">Before</span>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-32" data-testid="text-before-snapshot">
                    {JSON.stringify(selectedEvent.before, null, 2)}
                  </pre>
                </div>
              )}

              {selectedEvent.after && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground block mb-1">After</span>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-32" data-testid="text-after-snapshot">
                    {JSON.stringify(selectedEvent.after, null, 2)}
                  </pre>
                </div>
              )}

              {selectedEvent.metadata && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground block mb-1">Additional Details</span>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-32" data-testid="text-metadata">
                    {JSON.stringify(selectedEvent.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
