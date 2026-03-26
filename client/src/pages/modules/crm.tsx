import { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDirtyFormGuard, scrollToFirstError } from "@/lib/form-utils";
import { ListCardSkeleton } from "@/components/ui/skeletons";
import { PageTitle } from "@/lib/accessibility";
import { useOutletTimezone, formatLocal, formatLocalDate } from "@/hooks/use-outlet-timezone";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency, type FormatCurrencyOptions } from "@shared/currency";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Search, Plus, Edit, Trash2, Phone, Mail, Star,
  Tag, Award, DollarSign, ShoppingBag, ChevronLeft, ChevronRight, X,
  UserPlus, Filter, Megaphone, MessageSquare, Car, Clock, ParkingSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CharCountTextarea } from "@/components/ui/character-count-input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface CustomerData {
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  loyaltyPoints: number | null;
  totalSpent: string | null;
  loyaltyTier: string | null;
  tags: string[] | null;
  averageSpend: string | null;
  gstin: string | null;
  birthday: string | null;
  anniversary: string | null;
  vehiclePlates: string[] | null;
  parkingVisitCount: number | null;
  parkingTotalSpent: string | null;
}

interface OrderData {
  id: string;
  customerId: string | null;
  orderType: string | null;
  status: string | null;
  total: string | null;
  createdAt: string | null;
}

interface FeedbackData {
  id: string;
  orderId: string | null;
  customerId: string | null;
  rating: number | null;
  comment: string | null;
  createdAt: string | null;
}

interface OrderItemData {
  id: string;
  orderId: string;
  name: string;
  quantity: number | null;
}

interface OfferData {
  id: string;
  name: string;
  type: string | null;
  value: string | null;
  scope: string | null;
  active: boolean | null;
  description: string | null;
}

const tierColors: Record<string, string> = {
  bronze: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  silver: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  gold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  platinum: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
};

function CustomerCard({ customer, fmt, tierColors, onClick }: { customer: CustomerData; fmt: (v: string | number) => string; tierColors: Record<string, string>; onClick: () => void }) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick} data-testid={`card-customer-${customer.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold" data-testid={`text-customer-name-${customer.id}`}>{customer.name}</p>
              {customer.phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {customer.phone}
                </p>
              )}
            </div>
          </div>
          <Badge className={tierColors[customer.loyaltyTier || "bronze"]} data-testid={`badge-tier-${customer.id}`}>
            {customer.loyaltyTier || "bronze"}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Star className="w-3 h-3" />
            <span data-testid={`text-points-${customer.id}`}>{customer.loyaltyPoints || 0} pts</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <DollarSign className="w-3 h-3" />
            <span data-testid={`text-spent-${customer.id}`}>{fmt(Number(customer.totalSpent || 0))}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
        {customer.tags && customer.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {customer.tags.map((tag, i) => (
              <Badge key={i} variant="outline" className="text-xs" data-testid={`tag-${customer.id}-${i}`}>
                <Tag className="w-2.5 h-2.5 mr-1" /> {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CrmPage() {
  const { user } = useAuth();
  const outletTimezone = useOutletTimezone();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currency = user?.tenant?.currency || "USD";
  const currencyOpts: FormatCurrencyOptions = { position: (user?.tenant?.currencyPosition || "before") as "before" | "after", decimals: user?.tenant?.currencyDecimals ?? 2 };
  const fmt = (val: string | number) => formatCurrency(val, currency, currencyOpts);

  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [customersPage, setCustomersPage] = useState(0);
  const CUSTOMERS_LIMIT = 50;

  const [crmFormDirty, setCrmFormDirty] = useState(false);
  useDirtyFormGuard(crmFormDirty && (showAddDialog || showEditDialog));

  const [formData, setFormData] = useState({
    name: "", phone: "", email: "", notes: "", loyaltyTier: "bronze", tags: "",
    gstin: "", birthday: "", anniversary: "",
  });
  const [crmFormErrors, setCrmFormErrors] = useState<{ name?: string }>({});

  const [feedbackForm, setFeedbackForm] = useState({
    customerId: "", orderId: "", rating: "5", comment: "",
  });

  const { data: customersRes, isLoading } = useQuery<{ data: CustomerData[]; total: number }>({
    queryKey: ["/api/customers", customersPage],
    queryFn: async () => {
      const res = await fetch(`/api/customers?limit=${CUSTOMERS_LIMIT}&offset=${customersPage * CUSTOMERS_LIMIT}`, { credentials: "include" });
      return res.json();
    },
  });
  const customers = customersRes?.data ?? [];
  const customersTotal = customersRes?.total ?? 0;

  const { data: ordersRes } = useQuery<{ data: OrderData[]; total: number }>({
    queryKey: ["/api/orders"],
  });
  const orders = ordersRes?.data ?? [];

  const { data: parkingHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/parking/customer-history", selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const res = await fetch(`/api/parking/customer-lookup?customerId=${encodeURIComponent(selectedCustomer.id)}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data?.lastSessions ?? [];
    },
    enabled: showProfileDialog && !!selectedCustomer?.id,
    staleTime: 30000,
  });

  const { data: feedback = [] } = useQuery<FeedbackData[]>({
    queryKey: ["/api/feedback"],
  });

  const { data: offers = [] } = useQuery<OfferData[]>({
    queryKey: ["/api/offers"],
  });

  const { data: orderItemsList = [] } = useQuery<OrderItemData[]>({
    queryKey: ["/api/order-items"],
  });

  const favoriteDishes = useMemo(() => {
    const orderCustomerMap = new Map<string, string>();
    orders.forEach((o) => {
      if (o.customerId && o.status === "paid") {
        orderCustomerMap.set(o.id, o.customerId);
      }
    });

    const dishCounts = new Map<string, Map<string, number>>();
    orderItemsList.forEach((item) => {
      const custId = orderCustomerMap.get(item.orderId);
      if (!custId) return;
      if (!dishCounts.has(custId)) dishCounts.set(custId, new Map());
      const custDishes = dishCounts.get(custId)!;
      custDishes.set(item.name, (custDishes.get(item.name) || 0) + (item.quantity || 1));
    });

    const result = new Map<string, { name: string; count: number }[]>();
    dishCounts.forEach((dishes, custId) => {
      const sorted = Array.from(dishes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }));
      result.set(custId, sorted);
    });
    return result;
  }, [orders, orderItemsList]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/customers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowAddDialog(false);
      toast({ title: "Customer added" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/customers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowEditDialog(false);
      toast({ title: "Customer updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/feedback", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      setShowFeedbackDialog(false);
      setFeedbackForm({ customerId: "", orderId: "", rating: "5", comment: "" });
      toast({ title: "Feedback recorded" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowProfileDialog(false);
      setSelectedCustomer(null);
      toast({ title: "Customer deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search)) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()));
    const matchesTier = filterTier === "all" || c.loyaltyTier === filterTier;
    return matchesSearch && matchesTier;
  });

  const CRM_GRID_COLS = 3;
  const customerGridRows = useMemo(() => {
    const rows: (typeof filteredCustomers)[] = [];
    for (let i = 0; i < filteredCustomers.length; i += CRM_GRID_COLS) {
      rows.push(filteredCustomers.slice(i, i + CRM_GRID_COLS));
    }
    return rows;
  }, [filteredCustomers]);
  const useVirtualCustomers = filteredCustomers.length > 100;
  const crmScrollRef = useRef<HTMLDivElement>(null);
  const customerVirtualizer = useVirtualizer({
    count: customerGridRows.length,
    getScrollElement: () => crmScrollRef.current,
    estimateSize: () => 188,
    overscan: 3,
    enabled: useVirtualCustomers,
  });

  const getCustomerOrders = (customerId: string) =>
    orders.filter((o) => o.customerId === customerId);

  const openProfile = (customer: CustomerData) => {
    setSelectedCustomer(customer);
    setShowProfileDialog(true);
  };

  const openEdit = (customer: CustomerData) => {
    setFormData({
      name: customer.name,
      phone: customer.phone || "",
      email: customer.email || "",
      notes: customer.notes || "",
      loyaltyTier: customer.loyaltyTier || "bronze",
      tags: (customer.tags || []).join(", "),
      gstin: customer.gstin || "",
      birthday: customer.birthday || "",
      anniversary: customer.anniversary || "",
    });
    setSelectedCustomer(customer);
    setShowEditDialog(true);
  };

  const openAdd = () => {
    setFormData({ name: "", phone: "", email: "", notes: "", loyaltyTier: "bronze", tags: "", gstin: "", birthday: "", anniversary: "" });
    setShowAddDialog(true);
  };

  const handleSubmitAdd = () => {
    if (!formData.name.trim()) {
      setCrmFormErrors({ name: "Name is required" });
      setTimeout(() => scrollToFirstError(), 50);
      return;
    }
    setCrmFormErrors({});
    const tags = formData.tags ? formData.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    createMutation.mutate({
      name: formData.name,
      phone: formData.phone || null,
      email: formData.email || null,
      notes: formData.notes || null,
      loyaltyTier: formData.loyaltyTier,
      tags: tags.length > 0 ? tags : null,
      gstin: formData.gstin || null,
      birthday: formData.birthday || null,
      anniversary: formData.anniversary || null,
    });
  };

  const handleSubmitEdit = () => {
    if (!selectedCustomer) return;
    if (!formData.name.trim()) {
      setCrmFormErrors({ name: "Name is required" });
      setTimeout(() => scrollToFirstError(), 50);
      return;
    }
    setCrmFormErrors({});
    const tags = formData.tags ? formData.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    updateMutation.mutate({
      id: selectedCustomer.id,
      data: {
        name: formData.name,
        phone: formData.phone || null,
        email: formData.email || null,
        notes: formData.notes || null,
        loyaltyTier: formData.loyaltyTier,
        tags: tags.length > 0 ? tags : null,
        gstin: formData.gstin || null,
        birthday: formData.birthday || null,
        anniversary: formData.anniversary || null,
      },
    });
  };

  const totalCustomers = customersTotal || customers.length;
  const totalRevenue = customers.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0);
  const avgSpend = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageTitle title="CRM" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-crm-title">
              Customer Relations
            </h1>
            <p className="text-muted-foreground text-sm">Manage customers, loyalty, and engagement</p>
          </div>
        </div>
        <Button data-testid="button-add-customer" onClick={openAdd}>
          <UserPlus className="w-4 h-4 mr-2" /> Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/40">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Customers</p>
              <p className="text-2xl font-bold" data-testid="text-total-customers">{totalCustomers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/40">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold" data-testid="text-total-revenue">
                {fmt(totalRevenue)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/40">
              <ShoppingBag className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Spend</p>
              <p className="text-2xl font-bold" data-testid="text-avg-spend">
                {fmt(avgSpend)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-customers"
          />
        </div>
        <Select value={filterTier} onValueChange={setFilterTier}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-tier">
            <Filter className="w-3 h-3 mr-1" />
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="bronze">Bronze</SelectItem>
            <SelectItem value="silver">Silver</SelectItem>
            <SelectItem value="gold">Gold</SelectItem>
            <SelectItem value="platinum">Platinum</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <ListCardSkeleton count={6} />
      ) : filteredCustomers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex flex-col items-center gap-4">
              <Users className="w-12 h-12 text-muted-foreground" />
              <p className="text-muted-foreground" data-testid="text-no-customers">
                {search || filterTier !== "all" ? "No customers match your filters." : "No customers yet. Add your first customer to get started."}
              </p>
              {!search && filterTier === "all" && (
                <Button onClick={openAdd} data-testid="button-add-first-customer">
                  <UserPlus className="w-4 h-4 mr-2" />Add Customer
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : useVirtualCustomers ? (
        <div ref={crmScrollRef} className="overflow-auto" style={{ maxHeight: "70vh" }}>
          <div style={{ height: `${customerVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {customerVirtualizer.getVirtualItems().map((vRow) => (
              <div key={vRow.index} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vRow.start}px)`, display: "grid", gridTemplateColumns: `repeat(${CRM_GRID_COLS}, minmax(0, 1fr))`, gap: "1rem", paddingBottom: "1rem" }}>
                {customerGridRows[vRow.index]?.map((customer) => (
                  <CustomerCard key={customer.id} customer={customer} fmt={fmt} tierColors={tierColors} onClick={() => openProfile(customer)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredCustomers.map((customer, idx) => (
              <motion.div
                key={customer.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.03, 0.5) }}
              >
                <CustomerCard customer={customer} fmt={fmt} tierColors={tierColors} onClick={() => openProfile(customer)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {customersTotal > CUSTOMERS_LIMIT && (
        <div className="flex items-center justify-between py-2" data-testid="pagination-controls-customers">
          <p className="text-sm text-muted-foreground">
            Showing {customersPage * CUSTOMERS_LIMIT + 1}–{Math.min((customersPage + 1) * CUSTOMERS_LIMIT, customersTotal)} of {customersTotal} customers
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCustomersPage((p) => Math.max(0, p - 1))} disabled={customersPage === 0} data-testid="button-prev-page-customers">
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <span className="text-sm font-medium px-2" data-testid="text-page-customers">Page {customersPage + 1}</span>
            <Button variant="outline" size="sm" onClick={() => setCustomersPage((p) => p + 1)} disabled={(customersPage + 1) * CUSTOMERS_LIMIT >= customersTotal} data-testid="button-next-page-customers">
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-targeted-promotions">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              Targeted Promotions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {["platinum", "gold", "silver", "bronze"].map((tier) => {
              const tierCustomers = customers.filter((c) => c.loyaltyTier === tier);
              if (tierCustomers.length === 0) return null;
              const activeOffers = offers.filter((o) => o.active);
              return (
                <div key={tier} className="p-3 rounded-lg bg-muted/50" data-testid={`promo-tier-${tier}`}>
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={tierColors[tier]}>{tier} ({tierCustomers.length})</Badge>
                    <span className="text-xs text-muted-foreground">
                      Avg spend: {fmt(
                        tierCustomers.reduce((s, c) => s + Number(c.totalSpent || 0), 0) / tierCustomers.length
                      )}
                    </span>
                  </div>
                  {activeOffers.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {activeOffers.slice(0, 3).map((offer) => (
                        <Badge key={offer.id} variant="outline" className="text-xs">
                          {offer.name}
                          {offer.type === "percentage" && offer.value ? ` (${offer.value}%)` : ""}
                        </Badge>
                      ))}
                      {activeOffers.length > 3 && (
                        <Badge variant="outline" className="text-xs">+{activeOffers.length - 3} more</Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No active offers to target</p>
                  )}
                </div>
              );
            })}
            {customers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No customers to target</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-customer-feedback">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Customer Feedback
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowFeedbackDialog(true)} data-testid="button-add-feedback">
                <Plus className="w-3 h-3 mr-1" /> Record
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {feedback.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No feedback received yet</p>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {feedback.slice(0, 10).map((fb) => (
                  <div key={fb.id} className="p-3 rounded-lg bg-muted/50" data-testid={`feedback-${fb.id}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{(fb.customerId && customers.find(c => c.id === fb.customerId)?.name) || "Anonymous"}</span>
                      {fb.rating && (
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`w-3 h-3 ${i < fb.rating! ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`} />
                          ))}
                        </div>
                      )}
                    </div>
                    {fb.comment && <p className="text-xs text-muted-foreground">{fb.comment}</p>}
                    {fb.createdAt && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatLocalDate(fb.createdAt, outletTimezone)}
                        {fb.orderId && ` · Order #${fb.orderId.slice(-6).toUpperCase()}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Customer Profile</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-bold" data-testid="text-profile-name">{selectedCustomer.name}</h3>
                  <div className="flex items-center gap-2">
                    <Badge className={tierColors[selectedCustomer.loyaltyTier || "bronze"]}>
                      <Award className="w-3 h-3 mr-1" /> {selectedCustomer.loyaltyTier || "bronze"}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {selectedCustomer.loyaltyPoints || 0} points
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Total Spent</p>
                  <p className="font-bold" data-testid="text-profile-spent">
                    {fmt(Number(selectedCustomer.totalSpent || 0))}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Avg Spend</p>
                  <p className="font-bold" data-testid="text-profile-avg">
                    {fmt(Number(selectedCustomer.averageSpend || 0))}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {selectedCustomer.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" /> {selectedCustomer.phone}
                  </div>
                )}
                {selectedCustomer.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" /> {selectedCustomer.email}
                  </div>
                )}
              </div>

              {selectedCustomer.notes && (
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p>{selectedCustomer.notes}</p>
                </div>
              )}

              <div data-testid="section-favorite-dishes">
                <h4 className="text-sm font-semibold mb-2">Favorite Dishes</h4>
                {(() => {
                  const dishes = favoriteDishes.get(selectedCustomer.id);
                  if (!dishes || dishes.length === 0) {
                    return <p className="text-sm text-muted-foreground">No order history to compute favorites</p>;
                  }
                  return (
                    <div className="flex flex-wrap gap-2">
                      {dishes.map((d, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs" data-testid={`badge-fav-dish-${idx}`}>
                          {d.name} <span className="ml-1 text-muted-foreground">×{d.count}</span>
                        </Badge>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Recent Orders</h4>
                {(() => {
                  const custOrders = getCustomerOrders(selectedCustomer.id);
                  if (custOrders.length === 0) {
                    return <p className="text-sm text-muted-foreground">No orders found</p>;
                  }
                  return (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {custOrders.slice(0, 5).map((order) => (
                        <div key={order.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
                          <div>
                            <span className="font-medium">{order.orderType}</span>
                            <span className="text-muted-foreground ml-2">
                              {order.createdAt ? formatLocalDate(order.createdAt, outletTimezone) : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{order.status}</Badge>
                            <span className="font-medium">{fmt(Number(order.total || 0))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Parking History Section */}
              {((selectedCustomer.parkingVisitCount && selectedCustomer.parkingVisitCount > 0) || parkingHistory.length > 0) && (
                <div data-testid="section-parking-history">
                  <div className="flex items-center gap-2 mb-2">
                    <ParkingSquare className="w-4 h-4 text-blue-600" />
                    <h4 className="text-sm font-semibold">Parking History</h4>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-700 bg-blue-50" data-testid="badge-parking-visit-count">
                      {selectedCustomer.parkingVisitCount ?? 0} visits
                    </Badge>
                    {selectedCustomer.parkingTotalSpent && parseFloat(selectedCustomer.parkingTotalSpent) > 0 && (
                      <span className="text-xs text-muted-foreground ml-auto" data-testid="text-parking-total-spent">
                        {fmt(parseFloat(selectedCustomer.parkingTotalSpent))} total
                      </span>
                    )}
                  </div>
                  {selectedCustomer.vehiclePlates && selectedCustomer.vehiclePlates.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {selectedCustomer.vehiclePlates.map((plate, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[10px] px-2 gap-1" data-testid={`badge-plate-${idx}`}>
                          <Car className="w-3 h-3" /> {plate}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {parkingHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No completed parking sessions found</p>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {parkingHistory.map((session: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-sm" data-testid={`row-parking-session-${idx}`}>
                          <div className="flex items-center gap-2">
                            <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <div>
                              <span className="font-medium text-xs">{session.vehicleNumber}</span>
                              {session.zoneName && <span className="text-[10px] text-muted-foreground ml-1">· {session.zoneName}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            {session.durationMinutes != null && (
                              <span className="flex items-center gap-0.5 text-muted-foreground">
                                <Clock className="w-3 h-3" /> {session.durationMinutes}m
                              </span>
                            )}
                            {session.chargeAmount != null && (
                              <span className="font-semibold text-blue-700">{fmt(parseFloat(session.chargeAmount))}</span>
                            )}
                            {session.exitTime && (
                              <span className="text-muted-foreground">{formatLocalDate(session.exitTime, outletTimezone)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setShowProfileDialog(false); openEdit(selectedCustomer); }} data-testid="button-edit-customer">
                  <Edit className="w-4 h-4 mr-1" /> Edit
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate(selectedCustomer.id)}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-customer"
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Delete
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) setCrmFormDirty(false); setShowAddDialog(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" onChange={() => setCrmFormDirty(true)}>
            <div>
              <Label>Name *</Label>
              <Input value={formData.name} onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setCrmFormErrors({}); }} className={crmFormErrors.name ? "border-red-500" : ""} data-testid="input-customer-name" />
              {crmFormErrors.name && <p className="text-red-500 text-xs mt-1">{crmFormErrors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} data-testid="input-customer-phone" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} data-testid="input-customer-email" />
              </div>
            </div>
            <div>
              <Label>Loyalty Tier</Label>
              <Select value={formData.loyaltyTier} onValueChange={(v) => setFormData({ ...formData, loyaltyTier: v })}>
                <SelectTrigger data-testid="select-customer-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bronze">Bronze</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="platinum">Platinum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} placeholder="vip, regular, birthday" data-testid="input-customer-tags" />
            </div>
            <div>
              <Label>Notes</Label>
              <CharCountTextarea maxLength={500} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} data-testid="input-customer-notes" />
            </div>
            {currency === "INR" && (
              <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 p-3 space-y-3">
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide">GST Details</p>
                <div>
                  <Label>Customer GSTIN (optional)</Label>
                  <Input value={formData.gstin} onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" maxLength={15} data-testid="input-customer-gstin" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Birthday</Label>
                    <Input type="date" value={formData.birthday} onChange={(e) => setFormData({ ...formData, birthday: e.target.value })} data-testid="input-customer-birthday" />
                  </div>
                  <div>
                    <Label>Anniversary</Label>
                    <Input type="date" value={formData.anniversary} onChange={(e) => setFormData({ ...formData, anniversary: e.target.value })} data-testid="input-customer-anniversary" />
                  </div>
                </div>
              </div>
            )}
            <Button className="w-full" onClick={handleSubmitAdd} disabled={!formData.name || createMutation.isPending} data-testid="button-submit-customer">
              Add Customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) setCrmFormDirty(false); setShowEditDialog(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" onChange={() => setCrmFormDirty(true)}>
            <div>
              <Label>Name *</Label>
              <Input value={formData.name} onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setCrmFormErrors({}); }} className={crmFormErrors.name ? "border-red-500" : ""} data-testid="input-edit-customer-name" />
              {crmFormErrors.name && <p className="text-red-500 text-xs mt-1">{crmFormErrors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} data-testid="input-edit-customer-phone" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} data-testid="input-edit-customer-email" />
              </div>
            </div>
            <div>
              <Label>Loyalty Tier</Label>
              <Select value={formData.loyaltyTier} onValueChange={(v) => setFormData({ ...formData, loyaltyTier: v })}>
                <SelectTrigger data-testid="select-edit-customer-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bronze">Bronze</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="platinum">Platinum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} data-testid="input-edit-customer-tags" />
            </div>
            <div>
              <Label>Notes</Label>
              <CharCountTextarea maxLength={500} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} data-testid="input-edit-customer-notes" />
            </div>
            {currency === "INR" && (
              <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 p-3 space-y-3">
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide">GST Details</p>
                <div>
                  <Label>Customer GSTIN (optional)</Label>
                  <Input value={formData.gstin} onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" maxLength={15} data-testid="input-edit-customer-gstin" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Birthday</Label>
                    <Input type="date" value={formData.birthday} onChange={(e) => setFormData({ ...formData, birthday: e.target.value })} data-testid="input-edit-customer-birthday" />
                  </div>
                  <div>
                    <Label>Anniversary</Label>
                    <Input type="date" value={formData.anniversary} onChange={(e) => setFormData({ ...formData, anniversary: e.target.value })} data-testid="input-edit-customer-anniversary" />
                  </div>
                </div>
              </div>
            )}
            <Button className="w-full" onClick={handleSubmitEdit} disabled={!formData.name || updateMutation.isPending} data-testid="button-update-customer">
              Update Customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showFeedbackDialog} onOpenChange={setShowFeedbackDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Customer Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Customer</Label>
              <Select value={feedbackForm.customerId} onValueChange={(v) => {
                setFeedbackForm({ ...feedbackForm, customerId: v, orderId: "" });
              }}>
                <SelectTrigger data-testid="select-feedback-customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {feedbackForm.customerId && (
              <div>
                <Label>Linked Order</Label>
                <Select value={feedbackForm.orderId || "no_order"} onValueChange={(v) => setFeedbackForm({ ...feedbackForm, orderId: v === "no_order" ? "" : v })}>
                  <SelectTrigger data-testid="select-feedback-order">
                    <SelectValue placeholder="Select order (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_order">No specific order</SelectItem>
                    {orders
                      .filter((o) => o.customerId === feedbackForm.customerId && o.status === "paid")
                      .slice(0, 10)
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          #{o.id.slice(-6).toUpperCase()} · {fmt(Number(o.total || 0))} · {o.createdAt ? formatLocalDate(o.createdAt, outletTimezone) : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Rating</Label>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFeedbackForm({ ...feedbackForm, rating: String(star) })}
                    className="focus:outline-none"
                    data-testid={`button-star-${star}`}
                  >
                    <Star className={`w-6 h-6 ${star <= parseInt(feedbackForm.rating) ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`} />
                  </button>
                ))}
                <span className="text-sm text-muted-foreground ml-2">{feedbackForm.rating}/5</span>
              </div>
            </div>
            <div>
              <Label>Comment</Label>
              <Textarea
                value={feedbackForm.comment}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, comment: e.target.value })}
                placeholder="Customer feedback or comments..."
                data-testid="input-feedback-comment"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (!feedbackForm.customerId) {
                  toast({ title: "Please select a customer", variant: "destructive" });
                  return;
                }
                feedbackMutation.mutate({
                  customerId: feedbackForm.customerId,
                  orderId: feedbackForm.orderId || null,
                  rating: parseInt(feedbackForm.rating),
                  comment: feedbackForm.comment || null,
                });
              }}
              disabled={!feedbackForm.customerId || feedbackMutation.isPending}
              data-testid="button-submit-feedback"
            >
              Submit Feedback
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
