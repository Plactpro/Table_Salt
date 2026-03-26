import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, RotateCcw, Search, RefreshCw, AlertTriangle, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const ENTITY_LABELS: Record<string, string> = {
  menu_items: "Menu Items",
  users: "Users",
  customers: "Customers",
  suppliers: "Suppliers",
  inventory_items: "Inventory",
  valet_tickets: "Valet Tickets",
  purchase_orders: "Purchase Orders",
  recipes: "Recipes",
  promotion_rules: "Promotions",
  reservations: "Reservations",
};

const ENTITY_COLORS: Record<string, string> = {
  menu_items: "bg-orange-100 text-orange-800",
  users: "bg-blue-100 text-blue-800",
  customers: "bg-green-100 text-green-800",
  suppliers: "bg-purple-100 text-purple-800",
  inventory_items: "bg-yellow-100 text-yellow-800",
  valet_tickets: "bg-pink-100 text-pink-800",
  purchase_orders: "bg-indigo-100 text-indigo-800",
  recipes: "bg-red-100 text-red-800",
  promotion_rules: "bg-teal-100 text-teal-800",
  reservations: "bg-gray-100 text-gray-800",
};

interface DeletedItem {
  id: string;
  label: string;
  entityType: string;
  deletedAt: string;
  deletedBy: string | null;
  secondsUntilPurge: number;
  expiresWithin7Days: boolean;
}

interface RecycleBinResponse {
  grouped: Record<string, DeletedItem[]>;
  items: DeletedItem[];
}

function ItemRow({
  item,
  onRestore,
  onPurge,
  restoring,
  showType,
  canPurge,
}: {
  item: DeletedItem;
  onRestore: (item: DeletedItem) => void;
  onPurge: (item: DeletedItem) => void;
  restoring: boolean;
  showType?: boolean;
  canPurge?: boolean;
}) {
  const daysLeft = Math.floor(item.secondsUntilPurge / 86400);
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors ${item.expiresWithin7Days ? "bg-amber-50/50" : ""}`}
      data-testid={`row-deleted-${item.id}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {showType && (
          <Badge
            className={`shrink-0 text-xs font-medium ${ENTITY_COLORS[item.entityType] ?? "bg-gray-100 text-gray-700"}`}
            data-testid={`badge-entity-type-${item.id}`}
          >
            {ENTITY_LABELS[item.entityType] ?? item.entityType}
          </Badge>
        )}
        <div className="min-w-0 flex-1">
          <span className="font-medium block truncate" data-testid={`text-item-label-${item.id}`}>
            {item.label ?? "(unnamed)"}
          </span>
          {item.deletedBy && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5" data-testid={`text-deleted-by-${item.id}`}>
              <User className="h-3 w-3" />
              Deleted by {item.deletedBy}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-right">
        <div className="flex flex-col items-end">
          <span className="text-xs text-muted-foreground" data-testid={`text-deleted-at-${item.id}`}>
            {item.deletedAt
              ? formatDistanceToNow(new Date(item.deletedAt), { addSuffix: true })
              : "—"}
          </span>
          {item.expiresWithin7Days && (
            <span className="text-xs text-amber-600 font-medium" data-testid={`text-expires-soon-${item.id}`}>
              Purged in {daysLeft < 1 ? "<1" : daysLeft}d
            </span>
          )}
          {!item.expiresWithin7Days && item.secondsUntilPurge > 0 && (
            <span className="text-xs text-muted-foreground" data-testid={`text-purge-days-${item.id}`}>
              Purged in {daysLeft}d
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRestore(item)}
          disabled={restoring}
          data-testid={`button-restore-${item.id}`}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Restore
        </Button>
        {canPurge && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onPurge(item)}
            data-testid={`button-purge-${item.id}`}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete Forever
          </Button>
        )}
      </div>
    </div>
  );
}

export default function RecycleBinPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<DeletedItem | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  const isOwner = user?.role === "owner" || user?.role === "franchise_owner" || user?.role === "hq_admin";

  const { data, isLoading, refetch } = useQuery<RecycleBinResponse>({
    queryKey: ["/api/recycle-bin"],
    queryFn: () => apiRequest("GET", "/api/recycle-bin").then(r => r.json()),
  });

  const items = data?.items ?? [];
  const grouped = data?.grouped ?? {};

  const restoreMutation = useMutation({
    mutationFn: (item: DeletedItem) =>
      apiRequest("POST", "/api/recycle-bin/restore", { entityType: item.entityType, id: item.id }),
    onSuccess: () => {
      toast({ title: "Restored", description: "Item has been restored successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/recycle-bin"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: (item: DeletedItem) =>
      apiRequest("DELETE", "/api/recycle-bin/permanent", { entityType: item.entityType, id: item.id }),
    onSuccess: () => {
      toast({ title: "Permanently Deleted", description: "Item has been permanently removed." });
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ["/api/recycle-bin"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setConfirmDelete(null);
    },
  });

  const filterItems = (list: DeletedItem[]) =>
    !search ? list : list.filter(i => i.label?.toLowerCase().includes(search.toLowerCase()));

  const expiringCount = items.filter(i => i.expiresWithin7Days).length;

  // Tabs with items: "all" + any entity type that has >=1 deleted item
  const activeEntityTypes = Object.keys(ENTITY_LABELS).filter(k => (grouped[k]?.length ?? 0) > 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Trash2 className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Recycle Bin</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Soft-deleted records. Restore to recover, or permanently delete to free storage.
          Records are automatically purged 30 days after deletion.
        </p>
      </div>

      {expiringCount > 0 && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800" data-testid="banner-expiring-soon">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">
            {expiringCount} item{expiringCount > 1 ? "s" : ""} will be permanently deleted within 7 days.
          </span>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search deleted items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} data-testid="button-refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground" data-testid="status-loading">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground" data-testid="status-empty">
          <Trash2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Recycle bin is empty</p>
          <p className="text-sm mt-1">No deleted items found.</p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-recycle-bin">
          <TabsList className="mb-3 flex-wrap h-auto gap-1">
            <TabsTrigger value="all" data-testid="tab-all">
              All
              {items.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{items.length}</Badge>}
            </TabsTrigger>
            {activeEntityTypes.map(type => (
              <TabsTrigger key={type} value={type} data-testid={`tab-${type}`}>
                {ENTITY_LABELS[type]}
                <Badge variant="secondary" className="ml-1 text-xs">{grouped[type]?.length ?? 0}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all">
            {filterItems(items).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No items match your search.</div>
            ) : (
              <div className="border rounded-lg divide-y" data-testid="list-recycle-bin-all">
                {filterItems(items).map(item => (
                  <ItemRow
                    key={`${item.entityType}-${item.id}`}
                    item={item}
                    onRestore={i => restoreMutation.mutate(i)}
                    onPurge={setConfirmDelete}
                    restoring={restoreMutation.isPending}
                    showType
                    canPurge={isOwner}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {activeEntityTypes.map(type => (
            <TabsContent key={type} value={type}>
              {filterItems(grouped[type] ?? []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No items match your search.</div>
              ) : (
                <div className="border rounded-lg divide-y" data-testid={`list-recycle-bin-${type}`}>
                  {filterItems(grouped[type] ?? []).map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onRestore={i => restoreMutation.mutate(i)}
                      onPurge={setConfirmDelete}
                      restoring={restoreMutation.isPending}
                      canPurge={isOwner}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={open => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmDelete?.label}</strong> will be permanently removed and cannot be recovered.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-purge">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && purgeMutation.mutate(confirmDelete)}
              disabled={purgeMutation.isPending}
              data-testid="button-confirm-purge"
            >
              Permanently Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
