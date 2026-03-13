import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@shared/currency";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Search, Plus, Edit, Trash2, Phone, Mail, Star,
  Tag, Award, DollarSign, ShoppingBag, ChevronRight, X,
  UserPlus, Filter, Megaphone, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export default function CrmPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currency = user?.tenant?.currency || "USD";

  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);

  const [formData, setFormData] = useState({
    name: "", phone: "", email: "", notes: "", loyaltyTier: "bronze", tags: "",
  });

  const [feedbackForm, setFeedbackForm] = useState({
    customerId: "", orderId: "", rating: "5", comment: "",
  });

  const { data: customers = [], isLoading } = useQuery<CustomerData[]>({
    queryKey: ["/api/customers"],
  });

  const { data: orders = [] } = useQuery<OrderData[]>({
    queryKey: ["/api/orders"],
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
    });
    setSelectedCustomer(customer);
    setShowEditDialog(true);
  };

  const openAdd = () => {
    setFormData({ name: "", phone: "", email: "", notes: "", loyaltyTier: "bronze", tags: "" });
    setShowAddDialog(true);
  };

  const handleSubmitAdd = () => {
    const tags = formData.tags ? formData.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    createMutation.mutate({
      name: formData.name,
      phone: formData.phone || null,
      email: formData.email || null,
      notes: formData.notes || null,
      loyaltyTier: formData.loyaltyTier,
      tags: tags.length > 0 ? tags : null,
    });
  };

  const handleSubmitEdit = () => {
    if (!selectedCustomer) return;
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
      },
    });
  };

  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0);
  const avgSpend = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
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
                {formatCurrency(totalRevenue, currency)}
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
                {formatCurrency(avgSpend, currency)}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-customers">No customers found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredCustomers.map((customer, idx) => (
              <motion.div
                key={customer.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <Card
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => openProfile(customer)}
                  data-testid={`card-customer-${customer.id}`}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold" data-testid={`text-customer-name-${customer.id}`}>
                            {customer.name}
                          </p>
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
                        <span data-testid={`text-spent-${customer.id}`}>
                          {formatCurrency(Number(customer.totalSpent || 0), currency)}
                        </span>
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
              </motion.div>
            ))}
          </AnimatePresence>
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
                      Avg spend: {formatCurrency(
                        tierCustomers.reduce((s, c) => s + Number(c.totalSpent || 0), 0) / tierCustomers.length,
                        currency
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
                        {new Date(fb.createdAt).toLocaleDateString()}
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
                    {formatCurrency(Number(selectedCustomer.totalSpent || 0), currency)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Avg Spend</p>
                  <p className="font-bold" data-testid="text-profile-avg">
                    {formatCurrency(Number(selectedCustomer.averageSpend || 0), currency)}
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
                              {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{order.status}</Badge>
                            <span className="font-medium">{formatCurrency(Number(order.total || 0), currency)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

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

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-customer-name" />
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
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} data-testid="input-customer-notes" />
            </div>
            <Button className="w-full" onClick={handleSubmitAdd} disabled={!formData.name || createMutation.isPending} data-testid="button-submit-customer">
              Add Customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-edit-customer-name" />
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
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} data-testid="input-edit-customer-notes" />
            </div>
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
                          #{o.id.slice(-6).toUpperCase()} · {formatCurrency(Number(o.total || 0), currency)} · {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : ""}
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
