import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  UtensilsCrossed,
  Package,
  Truck,
  StickyNote,
  CreditCard,
  Banknote,
  Wallet,
  Leaf,
} from "lucide-react";
import type { MenuCategory, MenuItem, Table } from "@shared/schema";

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  isVeg: boolean | null;
}

type OrderType = "dine_in" | "takeaway" | "delivery";
type PaymentMethod = "cash" | "card" | "upi";

export default function POSPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [orderNotes, setOrderNotes] = useState("");
  const [noteDialogItem, setNoteDialogItem] = useState<string | null>(null);
  const [itemNoteText, setItemNoteText] = useState("");

  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ["/api/menu-categories"],
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items"],
  });

  const { data: tables = [] } = useQuery<Table[]>({
    queryKey: ["/api/tables"],
  });

  const freeTables = useMemo(
    () => tables.filter((t) => t.status === "free"),
    [tables]
  );

  const filteredItems = useMemo(() => {
    let items = menuItems.filter((item) => item.available !== false);
    if (selectedCategory) {
      items = items.filter((item) => item.categoryId === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [menuItems, selectedCategory, searchQuery]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );

  const discountAmount = useMemo(() => {
    const d = parseFloat(discount);
    return isNaN(d) ? 0 : d;
  }, [discount]);

  const taxRate = 0.05;
  const taxAmount = (subtotal - discountAmount) * taxRate;
  const total = subtotal - discountAmount + taxAmount;

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          price: parseFloat(item.price),
          quantity: 1,
          notes: "",
          isVeg: item.isVeg,
        },
      ];
    });
  };

  const updateQuantity = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.menuItemId === menuItemId
            ? { ...c, quantity: c.quantity + delta }
            : c
        )
        .filter((c) => c.quantity > 0)
    );
  };

  const removeFromCart = (menuItemId: string) => {
    setCart((prev) => prev.filter((c) => c.menuItemId !== menuItemId));
  };

  const openNoteDialog = (menuItemId: string) => {
    const item = cart.find((c) => c.menuItemId === menuItemId);
    setItemNoteText(item?.notes || "");
    setNoteDialogItem(menuItemId);
  };

  const saveItemNote = () => {
    if (noteDialogItem) {
      setCart((prev) =>
        prev.map((c) =>
          c.menuItemId === noteDialogItem ? { ...c, notes: itemNoteText } : c
        )
      );
    }
    setNoteDialogItem(null);
    setItemNoteText("");
  };

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      const orderData = {
        orderType,
        tableId: orderType === "dine_in" ? selectedTable || null : null,
        subtotal: subtotal.toFixed(2),
        tax: taxAmount.toFixed(2),
        discount: discountAmount.toFixed(2),
        total: total.toFixed(2),
        paymentMethod,
        notes: orderNotes || null,
        status: "new",
        items: cart.map((c) => ({
          menuItemId: c.menuItemId,
          name: c.name,
          quantity: c.quantity,
          price: c.price.toFixed(2),
          notes: c.notes || null,
        })),
      };
      const res = await apiRequest("POST", "/api/orders", orderData);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Order placed successfully!" });
      setCart([]);
      setDiscount("");
      setOrderNotes("");
      setSelectedTable("");
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to place order", description: err.message, variant: "destructive" });
    },
  });

  const handlePlaceOrder = () => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add items before placing an order", variant: "destructive" });
      return;
    }
    if (orderType === "dine_in" && !selectedTable) {
      toast({ title: "Select a table", description: "Choose a table for dine-in orders", variant: "destructive" });
      return;
    }
    placeOrderMutation.mutate();
  };

  const getCategoryName = (id: string | null) => {
    if (!id) return "Uncategorized";
    return categories.find((c) => c.id === id)?.name || "Uncategorized";
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0" data-testid="pos-page">
      <div className="flex-1 flex flex-col overflow-hidden border-r">
        <div className="p-4 border-b space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-search-menu"
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button
              data-testid="button-category-all"
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
            >
              All
            </Button>
            {categories
              .filter((c) => c.active !== false)
              .map((cat) => (
                <Button
                  key={cat.id}
                  data-testid={`button-category-${cat.id}`}
                  variant={selectedCategory === cat.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.id)}
                  className="whitespace-nowrap"
                >
                  {cat.name}
                </Button>
              ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <UtensilsCrossed className="h-12 w-12 mb-2" />
              <p>No items found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredItems.map((item) => {
                const inCart = cart.find((c) => c.menuItemId === item.id);
                return (
                  <Card
                    key={item.id}
                    data-testid={`card-menu-item-${item.id}`}
                    className="cursor-pointer hover:shadow-md transition-shadow relative"
                    onClick={() => addToCart(item)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-1">
                        <h4 className="font-medium text-sm leading-tight line-clamp-2">
                          {item.name}
                        </h4>
                        {item.isVeg && (
                          <Leaf className="h-4 w-4 text-green-600 shrink-0 ml-1" />
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm" data-testid={`text-price-${item.id}`}>
                          ${parseFloat(item.price).toFixed(2)}
                        </span>
                        {inCart && (
                          <Badge variant="default" className="text-xs" data-testid={`badge-qty-${item.id}`}>
                            {inCart.quantity}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="w-[380px] flex flex-col bg-card">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="h-5 w-5" />
            <h2 className="font-heading font-semibold text-lg">Current Order</h2>
            {cart.length > 0 && (
              <Badge variant="secondary" data-testid="badge-cart-count">
                {cart.reduce((s, c) => s + c.quantity, 0)}
              </Badge>
            )}
          </div>

          <div className="flex gap-1">
            <Button
              data-testid="button-order-type-dine-in"
              variant={orderType === "dine_in" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setOrderType("dine_in")}
            >
              <UtensilsCrossed className="h-3.5 w-3.5 mr-1" />
              Dine-in
            </Button>
            <Button
              data-testid="button-order-type-takeaway"
              variant={orderType === "takeaway" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setOrderType("takeaway")}
            >
              <Package className="h-3.5 w-3.5 mr-1" />
              Takeaway
            </Button>
            <Button
              data-testid="button-order-type-delivery"
              variant={orderType === "delivery" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setOrderType("delivery")}
            >
              <Truck className="h-3.5 w-3.5 mr-1" />
              Delivery
            </Button>
          </div>

          {orderType === "dine_in" && (
            <div className="mt-3">
              <Select value={selectedTable} onValueChange={setSelectedTable}>
                <SelectTrigger data-testid="select-table">
                  <SelectValue placeholder="Select table..." />
                </SelectTrigger>
                <SelectContent>
                  {freeTables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      Table {t.number} ({t.zone} - {t.capacity} seats)
                    </SelectItem>
                  ))}
                  {freeTables.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No free tables
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs">Tap items to add them</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div
                  key={item.menuItemId}
                  data-testid={`cart-item-${item.menuItemId}`}
                  className="flex flex-col gap-1.5 p-2 rounded-lg border bg-background"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        {item.isVeg && <Leaf className="h-3 w-3 text-green-600 shrink-0" />}
                        <span className="font-medium text-sm truncate">{item.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        ${item.price.toFixed(2)} each
                      </span>
                    </div>
                    <span className="font-semibold text-sm">
                      ${(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        data-testid={`button-decrease-${item.menuItemId}`}
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.menuItemId, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium" data-testid={`text-qty-${item.menuItemId}`}>
                        {item.quantity}
                      </span>
                      <Button
                        data-testid={`button-increase-${item.menuItemId}`}
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.menuItemId, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        data-testid={`button-note-${item.menuItemId}`}
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openNoteDialog(item.menuItemId)}
                      >
                        <StickyNote className="h-3 w-3" />
                      </Button>
                      <Button
                        data-testid={`button-remove-${item.menuItemId}`}
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeFromCart(item.menuItemId)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {item.notes && (
                    <p className="text-xs text-muted-foreground italic pl-1">
                      Note: {item.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t p-4 space-y-3">
          <div className="space-y-2">
            <Input
              data-testid="input-discount"
              type="number"
              placeholder="Discount amount ($)"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              min="0"
              step="0.01"
            />
            <Textarea
              data-testid="input-order-notes"
              placeholder="Order notes..."
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="flex gap-1">
            <Button
              data-testid="button-payment-cash"
              variant={paymentMethod === "cash" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setPaymentMethod("cash")}
            >
              <Banknote className="h-3.5 w-3.5 mr-1" />
              Cash
            </Button>
            <Button
              data-testid="button-payment-card"
              variant={paymentMethod === "card" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setPaymentMethod("card")}
            >
              <CreditCard className="h-3.5 w-3.5 mr-1" />
              Card
            </Button>
            <Button
              data-testid="button-payment-upi"
              variant={paymentMethod === "upi" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setPaymentMethod("upi")}
            >
              <Wallet className="h-3.5 w-3.5 mr-1" />
              UPI
            </Button>
          </div>

          <Separator />

          <div className="space-y-1 text-sm">
            <div className="flex justify-between" data-testid="text-subtotal">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-green-600" data-testid="text-discount">
                <span>Discount</span>
                <span>-${discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between" data-testid="text-tax">
              <span className="text-muted-foreground">Tax (5%)</span>
              <span>${taxAmount.toFixed(2)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-base" data-testid="text-total">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          <Button
            data-testid="button-place-order"
            className="w-full"
            size="lg"
            onClick={handlePlaceOrder}
            disabled={cart.length === 0 || placeOrderMutation.isPending}
          >
            {placeOrderMutation.isPending ? "Placing Order..." : "Place Order"}
          </Button>
        </div>
      </div>

      <Dialog open={noteDialogItem !== null} onOpenChange={() => setNoteDialogItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item Notes</DialogTitle>
          </DialogHeader>
          <Textarea
            data-testid="input-item-note"
            placeholder="Add special instructions..."
            value={itemNoteText}
            onChange={(e) => setItemNoteText(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNoteDialogItem(null)} data-testid="button-cancel-note">
              Cancel
            </Button>
            <Button onClick={saveItemNote} data-testid="button-save-note">
              Save Note
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
