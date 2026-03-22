import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency, type FormatCurrencyOptions } from "@shared/currency";
import { motion } from "framer-motion";
import {
  Phone, Search, Plus, Minus, Trash2, Clock, MapPin,
  User, CheckCircle, RefreshCw, Printer, X, Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface MenuItem {
  id: string;
  name: string;
  price: string;
  category: string;
  available: boolean;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number | null;
}

interface OrderItem {
  menuItemId: string | null;
  name: string;
  price: number;
  quantity: number;
}

interface Table {
  id: string;
  name: string;
  capacity: number;
  status: string;
}

type OrderType = "takeaway" | "delivery" | "advance" | "dine_in";

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  takeaway: "Takeaway",
  delivery: "Delivery",
  advance: "Advance",
  dine_in: "Dine-in",
};

export default function PhoneOrderPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currency = user?.tenant?.currency || "USD";
  const currencyOpts: FormatCurrencyOptions = {
    position: (user?.tenant?.currencyPosition || "before") as "before" | "after",
    decimals: user?.tenant?.currencyDecimals ?? 2,
  };
  const fmt = (val: string | number) => formatCurrency(val, currency, currencyOpts);

  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [tableId, setTableId] = useState("");
  const [notes, setNotes] = useState("");
  const [allergies, setAllergies] = useState("");

  const [menuSearch, setMenuSearch] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [successOrder, setSuccessOrder] = useState<{ orderNumber: string; orderType: string } | null>(null);

  const { data: menuItemsData } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items"],
  });
  const menuItems = menuItemsData ?? [];

  const { data: tablesData } = useQuery<Table[]>({
    queryKey: ["/api/tables"],
  });
  const tables = tablesData ?? [];

  const filteredMenu = menuItems.filter((item) => {
    if (!item.available) return false;
    if (!menuSearch.trim()) return true;
    return item.name.toLowerCase().includes(menuSearch.toLowerCase());
  });

  const lookupCustomer = useCallback(async () => {
    if (!phone.trim()) return;
    setLookingUp(true);
    try {
      const res = await apiRequest("GET", `/api/customers/lookup?phone=${encodeURIComponent(phone.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setFoundCustomer(data);
        setCustomerName(data.name || "");
        toast({ title: "Customer found", description: `Welcome back, ${data.name}!` });
      } else {
        setFoundCustomer(null);
        toast({ title: "No customer found", description: "New customer — please fill in the name." });
      }
    } catch {
      setFoundCustomer(null);
    } finally {
      setLookingUp(false);
    }
  }, [phone, toast]);

  const repeatLastOrder = useCallback(async () => {
    if (!foundCustomer) return;
    try {
      const res = await apiRequest("GET", `/api/orders?customerId=${foundCustomer.id}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        const lastOrder = data.data?.[0];
        if (lastOrder) {
          const itemsRes = await apiRequest("GET", `/api/orders/${lastOrder.id}/items`);
          if (itemsRes.ok) {
            const items = await itemsRes.json();
            if (items.length > 0) {
              setOrderItems(items.map((i: any) => ({
                menuItemId: i.menuItemId,
                name: i.name,
                price: parseFloat(i.price) || 0,
                quantity: i.quantity || 1,
              })));
              toast({ title: "Last order loaded", description: `${items.length} items added.` });
            }
          }
        }
      }
    } catch {
      toast({ title: "Could not load last order", variant: "destructive" });
    }
  }, [foundCustomer, toast]);

  const addItem = (item: MenuItem) => {
    setOrderItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === item.id);
      if (existing) {
        return prev.map((i) =>
          i.menuItemId === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: parseFloat(item.price) || 0, quantity: 1 }];
    });
  };

  const updateQty = (menuItemId: string | null, name: string, delta: number) => {
    setOrderItems((prev) =>
      prev
        .map((i) =>
          (menuItemId ? i.menuItemId === menuItemId : i.name === name)
            ? { ...i, quantity: i.quantity + delta }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const removeItem = (menuItemId: string | null, name: string) => {
    setOrderItems((prev) =>
      prev.filter((i) => (menuItemId ? i.menuItemId !== menuItemId : i.name !== name))
    );
  };

  const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const taxRate = parseFloat(user?.tenant?.taxRate || "0") / 100;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const isAdvance = orderType === "advance";

  const placeMutation = useMutation({
    mutationFn: async (isDraft = false) => {
      let scheduledDateTime: string | undefined;
      if ((orderType === "advance" || orderType === "takeaway" || orderType === "delivery") && scheduledDate && scheduledTime) {
        scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }

      const res = await apiRequest("POST", "/api/phone-orders", {
        customerPhone: phone || null,
        customerId: foundCustomer?.id || null,
        customerName: customerName || foundCustomer?.name || null,
        orderType: isAdvance ? "advance" : orderType,
        deliveryAddress: orderType === "delivery" ? deliveryAddress : null,
        scheduledTime: scheduledDateTime || null,
        tableId: orderType === "dine_in" ? tableId : null,
        notes: isDraft ? `[DRAFT] ${notes}` : notes || null,
        allergies: allergies || null,
        items: orderItems,
        subtotal,
        tax,
        total,
        isAdvance,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to place order");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSuccessOrder({ orderNumber: data.orderNumber || data.id?.slice(-6).toUpperCase(), orderType });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setPhone("");
    setCustomerName("");
    setFoundCustomer(null);
    setOrderType("takeaway");
    setDeliveryAddress("");
    setScheduledDate("");
    setScheduledTime("");
    setTableId("");
    setNotes("");
    setAllergies("");
    setMenuSearch("");
    setOrderItems([]);
    setSuccessOrder(null);
  };

  if (successOrder) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center min-h-[60vh] space-y-6"
      >
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold font-heading" data-testid="text-order-success">
            Order Placed!
          </h2>
          <p className="text-muted-foreground mt-1">
            Order #{successOrder.orderNumber} — {ORDER_TYPE_LABELS[successOrder.orderType as OrderType] || successOrder.orderType}
          </p>
          {isAdvance && (
            <Badge className="mt-2 bg-amber-100 text-amber-700 border-amber-200">
              Advance Order — Scheduled
            </Badge>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2" data-testid="button-print-ticket">
            <Printer className="w-4 h-4" /> Print Ticket
          </Button>
          <Button onClick={resetForm} className="gap-2" data-testid="button-new-order">
            <RefreshCw className="w-4 h-4" /> New Order
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Phone className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-heading" data-testid="text-phone-order-title">
            Phone / Advance Order Entry
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter orders from phone calls or schedule advance orders
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4" /> Customer Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Phone Number</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter phone number..."
                    onKeyDown={(e) => e.key === "Enter" && lookupCustomer()}
                    data-testid="input-phone"
                  />
                  <Button
                    variant="outline"
                    onClick={lookupCustomer}
                    disabled={lookingUp || !phone.trim()}
                    className="shrink-0"
                    data-testid="button-lookup-crm"
                  >
                    {lookingUp ? "..." : "LOOKUP"}
                  </Button>
                </div>
              </div>

              {foundCustomer && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-green-800">{foundCustomer.name}</span>
                    {foundCustomer.loyaltyPoints != null && (
                      <Badge variant="outline" className="text-xs" data-testid="badge-loyalty-points">
                        {foundCustomer.loyaltyPoints} pts
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs gap-1 border-green-300 text-green-700 hover:bg-green-100"
                    onClick={repeatLastOrder}
                    data-testid="button-repeat-last-order"
                  >
                    <RefreshCw className="w-3 h-3" /> Repeat Last Order
                  </Button>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">Customer Name</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter name..."
                  className="mt-1"
                  data-testid="input-customer-name"
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Order Type</Label>
                <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
                  <SelectTrigger className="mt-1" data-testid="select-order-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="takeaway">Takeaway</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="advance">Advance (Scheduled)</SelectItem>
                    <SelectItem value="dine_in">Dine-in</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(orderType === "takeaway" || orderType === "advance" || orderType === "delivery") && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {orderType === "advance" ? "Scheduled Date & Time" :
                     orderType === "delivery" ? "Estimated Delivery Time" : "Pickup Time"}
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="flex-1"
                      data-testid="input-scheduled-date"
                    />
                    <Input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-32"
                      data-testid="input-scheduled-time"
                    />
                  </div>
                </div>
              )}

              {orderType === "delivery" && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3 inline mr-1" />Delivery Address
                  </Label>
                  <Input
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Enter delivery address..."
                    className="mt-1"
                    data-testid="input-delivery-address"
                  />
                </div>
              )}

              {orderType === "dine_in" && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    <Utensils className="w-3 h-3 inline mr-1" />Table
                  </Label>
                  <Select value={tableId} onValueChange={setTableId}>
                    <SelectTrigger className="mt-1" data-testid="select-table">
                      <SelectValue placeholder="Select table..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tables.filter(t => t.status === "free").map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} (Capacity: {t.capacity})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">Allergies / Dietary Notes</Label>
                <Input
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="Nut allergy, vegan, halal..."
                  className="mt-1"
                  data-testid="input-allergies"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Search className="w-4 h-4" /> Order Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Search menu items..."
                data-testid="input-menu-search"
              />

              {menuSearch.trim() && filteredMenu.length > 0 && (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {filteredMenu.slice(0, 10).map((item) => (
                    <button
                      key={item.id}
                      className="w-full flex items-center justify-between p-2.5 hover:bg-muted/50 text-left text-sm"
                      onClick={() => { addItem(item); setMenuSearch(""); }}
                      data-testid={`button-add-menu-item-${item.id}`}
                    >
                      <span className="font-medium">{item.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{fmt(item.price)}</span>
                        <Plus className="w-3.5 h-3.5 text-primary" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {orderItems.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm" data-testid="text-no-items">
                  Search above to add items
                </div>
              ) : (
                <div className="space-y-2">
                  {orderItems.map((item) => (
                    <div
                      key={item.menuItemId || item.name}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/40"
                      data-testid={`row-order-item-${item.menuItemId || item.name}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{fmt(item.price)} each</p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => updateQty(item.menuItemId, item.name, -1)}
                          data-testid={`button-dec-qty-${item.menuItemId || item.name}`}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="text-sm font-semibold w-6 text-center" data-testid={`text-qty-${item.menuItemId || item.name}`}>
                          {item.quantity}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => updateQty(item.menuItemId, item.name, 1)}
                          data-testid={`button-inc-qty-${item.menuItemId || item.name}`}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <span className="text-sm font-semibold w-16 text-right">
                          {fmt(item.price * item.quantity)}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={() => removeItem(item.menuItemId, item.name)}
                          data-testid={`button-remove-item-${item.menuItemId || item.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <div className="border-t pt-2 space-y-1">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Subtotal</span>
                      <span data-testid="text-subtotal">{fmt(subtotal)}</span>
                    </div>
                    {taxRate > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Tax ({(taxRate * 100).toFixed(0)}%)</span>
                        <span data-testid="text-tax">{fmt(tax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold">
                      <span>Total</span>
                      <span data-testid="text-total">{fmt(total)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">Special Instructions</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special instructions for the kitchen..."
                  rows={2}
                  className="mt-1 resize-none"
                  data-testid="textarea-notes"
                />
              </div>

              {isAdvance && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                  <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-800">
                    <p className="font-semibold">Advance Order</p>
                    <p>This order will be scheduled and auto-released to the kitchen 30 minutes before the set time.</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1"
                  onClick={() => placeMutation.mutate(false)}
                  disabled={placeMutation.isPending || orderItems.length === 0}
                  data-testid="button-place-order"
                >
                  {isAdvance ? "Schedule Order" : "Place Order"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => placeMutation.mutate(true)}
                  disabled={placeMutation.isPending || orderItems.length === 0}
                  data-testid="button-save-draft"
                >
                  Save Draft
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
