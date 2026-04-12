export interface AggregatorOrderItem {
  externalItemId?: string;
  menuItemId?: string;
  name: string;
  quantity: number;
  price: string;
}

export interface AggregatorIncomingOrder {
  channelOrderId: string;
  items: AggregatorOrderItem[];
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes?: string;
}

export interface AggregatorAdapter {
  readonly platformSlug: string;
  readonly platformName: string;
  parseOrder(rawPayload: Record<string, unknown>): AggregatorIncomingOrder;
  generateMockOrder(menuItems: Array<{ id: string; name: string; price: string }>): AggregatorIncomingOrder;
}

const SAMPLE_NAMES = ["Ahmed", "Fatima", "Omar", "Sara", "Khalid", "Maryam", "Rashid", "Aisha"];
const SAMPLE_ADDRESSES = [
  "Downtown Dubai, Tower B, Apt 1203",
  "JBR Walk, Building 5, Unit 8A",
  "Business Bay, Sky Tower, Floor 22",
  "Marina Walk, Pearl Tower, 1804",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class SwiggyAdapter implements AggregatorAdapter {
  readonly platformSlug = "swiggy";
  readonly platformName = "Swiggy";

  parseOrder(raw: Record<string, unknown>): AggregatorIncomingOrder {
    const data = raw as Record<string, unknown>;
    const items = (data.order_items as Array<Record<string, unknown>> || []).map(i => ({
      externalItemId: String(i.item_id || ""),
      name: String(i.item_name || ""),
      quantity: Number(i.quantity || 1),
      price: String(i.price || "0"),
    }));
    return {
      channelOrderId: String(data.order_id || `SWG-${Date.now().toString(36).toUpperCase()}`),
      items,
      customerName: String((data.customer as Record<string, unknown>)?.name || ""),
      customerPhone: String((data.customer as Record<string, unknown>)?.phone || ""),
      customerAddress: String((data.delivery as Record<string, unknown>)?.address || ""),
      notes: String(data.special_instructions || ""),
    };
  }

  generateMockOrder(menuItems: Array<{ id: string; name: string; price: string }>): AggregatorIncomingOrder {
    const numItems = Math.floor(Math.random() * 3) + 1;
    const items: AggregatorOrderItem[] = [];
    for (let i = 0; i < numItems; i++) {
      const mi = pick(menuItems);
      items.push({ menuItemId: mi.id, name: mi.name, quantity: Math.floor(Math.random() * 2) + 1, price: mi.price });
    }
    return {
      channelOrderId: `SWG-${Date.now().toString(36).toUpperCase()}`,
      items,
      customerName: pick(SAMPLE_NAMES),
      customerPhone: `+971-5${Math.floor(Math.random() * 10000000).toString().padStart(7, "0")}`,
      customerAddress: pick(SAMPLE_ADDRESSES),
      notes: "Swiggy order - please pack carefully",
    };
  }
}

export class ZomatoAdapter implements AggregatorAdapter {
  readonly platformSlug = "zomato";
  readonly platformName = "Zomato";

  parseOrder(raw: Record<string, unknown>): AggregatorIncomingOrder {
    const data = raw as Record<string, unknown>;
    const items = (data.cart as Array<Record<string, unknown>> || []).map(i => ({
      externalItemId: String(i.zomato_item_id || ""),
      name: String(i.dish_name || ""),
      quantity: Number(i.qty || 1),
      price: String(i.unit_price || "0"),
    }));
    return {
      channelOrderId: String(data.zomato_order_id || `ZMT-${Date.now().toString(36).toUpperCase()}`),
      items,
      customerName: String(data.customer_name || ""),
      customerPhone: String(data.customer_contact || ""),
      customerAddress: String(data.drop_location || ""),
      notes: String(data.notes || ""),
    };
  }

  generateMockOrder(menuItems: Array<{ id: string; name: string; price: string }>): AggregatorIncomingOrder {
    const numItems = Math.floor(Math.random() * 3) + 1;
    const items: AggregatorOrderItem[] = [];
    for (let i = 0; i < numItems; i++) {
      const mi = pick(menuItems);
      items.push({ menuItemId: mi.id, name: mi.name, quantity: Math.floor(Math.random() * 2) + 1, price: mi.price });
    }
    return {
      channelOrderId: `ZMT-${Date.now().toString(36).toUpperCase()}`,
      items,
      customerName: pick(SAMPLE_NAMES),
      customerPhone: `+971-5${Math.floor(Math.random() * 10000000).toString().padStart(7, "0")}`,
      customerAddress: pick(SAMPLE_ADDRESSES),
      notes: "Zomato delivery - ring doorbell",
    };
  }
}

export class UberEatsAdapter implements AggregatorAdapter {
  readonly platformSlug = "ubereats";
  readonly platformName = "UberEats";

  parseOrder(raw: Record<string, unknown>): AggregatorIncomingOrder {
    const data = raw as Record<string, unknown>;
    const items = (data.line_items as Array<Record<string, unknown>> || []).map(i => ({
      externalItemId: String(i.uber_item_id || ""),
      name: String(i.title || ""),
      quantity: Number(i.count || 1),
      price: String(i.base_price || "0"),
    }));
    return {
      channelOrderId: String(data.uber_order_id || `UBE-${Date.now().toString(36).toUpperCase()}`),
      items,
      customerName: String((data.eater as Record<string, unknown>)?.first_name || "") + " " + String((data.eater as Record<string, unknown>)?.last_name || ""),
      customerPhone: String((data.eater as Record<string, unknown>)?.phone || ""),
      customerAddress: String((data.dropoff as Record<string, unknown>)?.address_line || ""),
      notes: String(data.special_request || ""),
    };
  }

  generateMockOrder(menuItems: Array<{ id: string; name: string; price: string }>): AggregatorIncomingOrder {
    const numItems = Math.floor(Math.random() * 3) + 1;
    const items: AggregatorOrderItem[] = [];
    for (let i = 0; i < numItems; i++) {
      const mi = pick(menuItems);
      items.push({ menuItemId: mi.id, name: mi.name, quantity: Math.floor(Math.random() * 2) + 1, price: mi.price });
    }
    return {
      channelOrderId: `UBE-${Date.now().toString(36).toUpperCase()}`,
      items,
      customerName: pick(SAMPLE_NAMES),
      customerPhone: `+971-5${Math.floor(Math.random() * 10000000).toString().padStart(7, "0")}`,
      customerAddress: pick(SAMPLE_ADDRESSES),
      notes: "UberEats order - contactless delivery",
    };
  }
}


export class TalabatAdapter implements AggregatorAdapter {
  readonly platformSlug = "talabat";
  readonly platformName = "Talabat";

  parseOrder(raw: Record<string, unknown>): AggregatorIncomingOrder {
    const data = raw as Record<string, unknown>;
    const orderData = (data.order as Record<string, unknown>) ?? data;
    const items = (
      (orderData.items as Array<Record<string, unknown>>) ??
      (data.items as Array<Record<string, unknown>>) ?? []
    ).map(i => ({
      externalItemId: String(i.item_id ?? i.id ?? ""),
      name: String(i.name ?? i.item_name ?? ""),
      quantity: Number(i.quantity ?? i.qty ?? 1),
      price: String(i.price ?? i.unit_price ?? "0"),
    }));
    const customer = (orderData.customer as Record<string, unknown>) ?? {};
    return {
      channelOrderId: String(
        orderData.id ?? data.order_id ??
        `TAL-${Date.now().toString(36).toUpperCase()}`
      ),
      items,
      customerName: String(customer.name ?? data.customer_name ?? ""),
      customerPhone: String(customer.phone ?? data.customer_phone ?? ""),
      customerAddress: String(orderData.delivery_address ?? data.delivery_address ?? ""),
      notes: String(orderData.special_instructions ?? data.notes ?? ""),
    };
  }

  generateMockOrder(
    menuItems: Array<{ id: string; name: string; price: string }>
  ): AggregatorIncomingOrder {
    const items: AggregatorOrderItem[] = [];
    const count = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < count; i++) {
      const mi = pick(menuItems);
      items.push({
        menuItemId: mi.id,
        name: mi.name,
        quantity: Math.floor(Math.random() * 2) + 1,
        price: mi.price,
      });
    }
    return {
      channelOrderId: `TAL-${Date.now().toString(36).toUpperCase()}`,
      items,
      customerName: pick(SAMPLE_NAMES),
      customerPhone: `+971-5${Math.floor(Math.random()*10000000).toString().padStart(7,"0")}`,
      customerAddress: pick(SAMPLE_ADDRESSES),
      notes: "Talabat order - keep warm",
    };
  }
}

const adapters: Record<string, AggregatorAdapter> = {
  talabat: new TalabatAdapter(),
  swiggy: new SwiggyAdapter(),
  zomato: new ZomatoAdapter(),
  ubereats: new UberEatsAdapter(),
};

export function getAdapter(platform: string): AggregatorAdapter | undefined {
  return adapters[platform];
}

export function getAllAdapters(): AggregatorAdapter[] {
  return Object.values(adapters);
}
