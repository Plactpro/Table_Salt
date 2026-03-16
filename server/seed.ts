import { storage } from "./storage";
import { hashPassword } from "./auth";

export async function seedDatabase() {
  const existing = await storage.getAllTenants();
  if (existing.length > 0) return;

  console.log("Seeding demo data...");

  const tenant = await storage.createTenant({
    name: "The Grand Kitchen",
    slug: "the-grand-kitchen",
    address: "123 Culinary Avenue, Food City",
    timezone: "America/New_York",
    currency: "USD",
    taxRate: "8.5",
    serviceCharge: "5",
    plan: "premium",
    businessType: "fine_dining",
  });

  const regionDowntown = await storage.createRegion({ tenantId: tenant.id, name: "Downtown", description: "City centre outlets", sortOrder: 1 });
  const regionMarina = await storage.createRegion({ tenantId: tenant.id, name: "Marina District", description: "Waterfront & marina area outlets", sortOrder: 2 });
  const regionAirport = await storage.createRegion({ tenantId: tenant.id, name: "Airport Zone", description: "Airport terminals & vicinity", sortOrder: 3 });

  const outlet = await storage.createOutlet({
    tenantId: tenant.id,
    regionId: regionDowntown.id,
    name: "Main Branch",
    address: "123 Culinary Avenue",
    openingHours: "10:00-23:00",
    isFranchise: false,
  });

  const outletMarina = await storage.createOutlet({
    tenantId: tenant.id,
    regionId: regionMarina.id,
    name: "Marina Walk",
    address: "Marina Promenade, Block C",
    openingHours: "11:00-00:00",
    isFranchise: true,
    franchiseeName: "Gulf Dining Group LLC",
    royaltyRate: "8",
    minimumGuarantee: "5000",
  });

  const outletAirport = await storage.createOutlet({
    tenantId: tenant.id,
    regionId: regionAirport.id,
    name: "Airport Terminal 3",
    address: "Terminal 3, Gate B12",
    openingHours: "05:00-01:00",
    isFranchise: true,
    franchiseeName: "Airport F&B Holdings",
    royaltyRate: "10",
    minimumGuarantee: "8000",
  });

  const pw = await hashPassword("demo123");

  const owner = await storage.createUser({
    tenantId: tenant.id, username: "owner", password: pw, name: "Alex Sterling", email: "alex@grandkitchen.com", role: "owner",
  });
  const manager = await storage.createUser({
    tenantId: tenant.id, username: "manager", password: pw, name: "Jordan Rivera", email: "jordan@grandkitchen.com", role: "manager",
  });
  const waiter = await storage.createUser({
    tenantId: tenant.id, username: "waiter", password: pw, name: "Sam Chen", email: "sam@grandkitchen.com", role: "waiter",
  });
  const kitchen = await storage.createUser({
    tenantId: tenant.id, username: "kitchen", password: pw, name: "Pat Garcia", email: "pat@grandkitchen.com", role: "kitchen",
  });
  await storage.createUser({
    tenantId: tenant.id, username: "accountant", password: pw, name: "Morgan Lee", email: "morgan@grandkitchen.com", role: "accountant",
  });

  const categories = [
    { name: "Starters", sortOrder: 1 },
    { name: "Soups", sortOrder: 2 },
    { name: "Main Course", sortOrder: 3 },
    { name: "Pasta & Noodles", sortOrder: 4 },
    { name: "Grills", sortOrder: 5 },
    { name: "Desserts", sortOrder: 6 },
    { name: "Beverages", sortOrder: 7 },
    { name: "Cocktails", sortOrder: 8 },
  ];

  const catMap: Record<string, string> = {};
  for (const c of categories) {
    const cat = await storage.createCategory({ ...c, tenantId: tenant.id });
    catMap[c.name] = cat.id;
  }

  const items = [
    { name: "Bruschetta", price: "8.99", categoryId: catMap["Starters"], isVeg: true, description: "Toasted bread with tomato, basil, and olive oil", station: "cold", course: "starter" },
    { name: "Chicken Wings", price: "12.99", categoryId: catMap["Starters"], isVeg: false, spicyLevel: 2, description: "Crispy wings with buffalo sauce", station: "fryer", course: "starter" },
    { name: "Spring Rolls", price: "7.99", categoryId: catMap["Starters"], isVeg: true, description: "Crispy veggie spring rolls with sweet chili", station: "fryer", course: "starter" },
    { name: "Calamari Fritti", price: "11.99", categoryId: catMap["Starters"], isVeg: false, description: "Fried squid rings with tartar sauce", station: "fryer", course: "starter" },
    { name: "Tomato Basil Soup", price: "6.99", categoryId: catMap["Soups"], isVeg: true, description: "Classic creamy tomato soup", station: "main", course: "starter" },
    { name: "French Onion Soup", price: "8.99", categoryId: catMap["Soups"], isVeg: true, description: "Caramelized onion soup with gruyere crouton", station: "main", course: "starter" },
    { name: "Grilled Salmon", price: "24.99", categoryId: catMap["Main Course"], isVeg: false, description: "Atlantic salmon with lemon butter sauce", station: "grill", course: "main" },
    { name: "Chicken Tikka Masala", price: "18.99", categoryId: catMap["Main Course"], isVeg: false, spicyLevel: 2, description: "Creamy spiced chicken curry", station: "main", course: "main" },
    { name: "Lamb Rack", price: "32.99", categoryId: catMap["Main Course"], isVeg: false, description: "Herb-crusted lamb with rosemary jus", station: "grill", course: "main" },
    { name: "Mushroom Risotto", price: "16.99", categoryId: catMap["Main Course"], isVeg: true, description: "Creamy arborio rice with wild mushrooms", station: "main", course: "main" },
    { name: "Beef Tenderloin", price: "34.99", categoryId: catMap["Main Course"], isVeg: false, description: "8oz tenderloin with red wine reduction", station: "grill", course: "main" },
    { name: "Spaghetti Carbonara", price: "14.99", categoryId: catMap["Pasta & Noodles"], isVeg: false, description: "Classic Roman pasta with pancetta", station: "main", course: "main" },
    { name: "Penne Arrabbiata", price: "12.99", categoryId: catMap["Pasta & Noodles"], isVeg: true, spicyLevel: 2, description: "Spicy tomato sauce pasta", station: "main", course: "main" },
    { name: "Pad Thai", price: "15.99", categoryId: catMap["Pasta & Noodles"], isVeg: false, description: "Thai stir-fried rice noodles with shrimp", station: "main", course: "main" },
    { name: "Ribeye Steak", price: "38.99", categoryId: catMap["Grills"], isVeg: false, description: "12oz USDA prime ribeye, chargrilled", station: "grill", course: "main" },
    { name: "BBQ Chicken", price: "19.99", categoryId: catMap["Grills"], isVeg: false, description: "Half chicken with smoky BBQ glaze", station: "grill", course: "main" },
    { name: "Grilled Vegetable Platter", price: "14.99", categoryId: catMap["Grills"], isVeg: true, description: "Seasonal veggies with herb oil", station: "grill", course: "main" },
    { name: "Tiramisu", price: "9.99", categoryId: catMap["Desserts"], isVeg: true, description: "Classic Italian coffee-flavored dessert", station: "pastry", course: "dessert" },
    { name: "Chocolate Lava Cake", price: "11.99", categoryId: catMap["Desserts"], isVeg: true, description: "Warm chocolate cake with molten center", station: "pastry", course: "dessert" },
    { name: "Crème Brûlée", price: "8.99", categoryId: catMap["Desserts"], isVeg: true, description: "French vanilla custard with caramelized top", station: "pastry", course: "dessert" },
    { name: "Espresso", price: "3.99", categoryId: catMap["Beverages"], isVeg: true, description: "Double-shot Italian espresso", station: "bar", course: "beverage" },
    { name: "Fresh Orange Juice", price: "5.99", categoryId: catMap["Beverages"], isVeg: true, description: "Freshly squeezed orange juice", station: "bar", course: "beverage" },
    { name: "Sparkling Water", price: "2.99", categoryId: catMap["Beverages"], isVeg: true, description: "San Pellegrino 500ml", station: "bar", course: "beverage" },
    { name: "Classic Mojito", price: "12.99", categoryId: catMap["Cocktails"], isVeg: true, description: "Rum, mint, lime, soda", station: "bar", course: "beverage" },
    { name: "Old Fashioned", price: "14.99", categoryId: catMap["Cocktails"], isVeg: true, description: "Bourbon, bitters, sugar, orange peel", station: "bar", course: "beverage" },
  ];

  for (const item of items) {
    await storage.createMenuItem({ ...item, tenantId: tenant.id });
  }

  const zones = ["Main Hall", "Patio", "Private"];
  const tableData = [
    { number: 1, capacity: 2, zone: "Main Hall" },
    { number: 2, capacity: 2, zone: "Main Hall" },
    { number: 3, capacity: 4, zone: "Main Hall" },
    { number: 4, capacity: 4, zone: "Main Hall" },
    { number: 5, capacity: 6, zone: "Main Hall" },
    { number: 6, capacity: 4, zone: "Patio" },
    { number: 7, capacity: 2, zone: "Patio" },
    { number: 8, capacity: 6, zone: "Patio" },
    { number: 9, capacity: 8, zone: "Private" },
    { number: 10, capacity: 10, zone: "Private" },
  ];

  const tableIds: string[] = [];
  for (const t of tableData) {
    const tbl = await storage.createTable({
      ...t,
      tenantId: tenant.id,
      outletId: outlet.id,
      status: t.number <= 3 ? "occupied" : t.number === 6 ? "reserved" : "free",
    });
    tableIds.push(tbl.id);
  }

  const stationDefs = [
    { name: "grill", displayName: "Grill Station", color: "#EF4444", sortOrder: 1 },
    { name: "main", displayName: "Main Kitchen", color: "#F97316", sortOrder: 2 },
    { name: "fryer", displayName: "Fryer Station", color: "#EAB308", sortOrder: 3 },
    { name: "cold", displayName: "Cold / Salads", color: "#3B82F6", sortOrder: 4 },
    { name: "pastry", displayName: "Pastry Station", color: "#EC4899", sortOrder: 5 },
    { name: "bar", displayName: "Bar", color: "#8B5CF6", sortOrder: 6 },
  ];
  for (const s of stationDefs) {
    await storage.createKitchenStation({ ...s, tenantId: tenant.id, active: true });
  }

  const allItems = await storage.getMenuItemsByTenant(tenant.id);
  const orderStatuses = ["paid", "paid", "served", "in_progress", "new"] as const;
  for (let i = 0; i < 5; i++) {
    const selectedItems = allItems.slice(i * 3, i * 3 + 3);
    const subtotal = selectedItems.reduce((s, it) => s + Number(it.price), 0);
    const tax = subtotal * 0.085;
    const total = subtotal + tax;

    const order = await storage.createOrder({
      tenantId: tenant.id,
      outletId: outlet.id,
      tableId: tableIds[i],
      waiterId: waiter.id,
      orderType: "dine_in",
      status: orderStatuses[i],
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      discount: "0",
      total: total.toFixed(2),
      paymentMethod: orderStatuses[i] === "paid" ? "card" : null,
    });

    for (const item of selectedItems) {
      await storage.createOrderItem({
        orderId: order.id,
        menuItemId: item.id,
        name: item.name,
        quantity: Math.floor(Math.random() * 3) + 1,
        price: item.price,
        station: item.station || null,
        course: item.course || null,
      });
    }
  }

  const inventoryData = [
    { name: "Chicken Breast", sku: "CHK-001", category: "Protein", unit: "kg", currentStock: "25", reorderLevel: "10", costPrice: "8.50", supplier: "Metro Foods" },
    { name: "Salmon Fillet", sku: "SAL-001", category: "Protein", unit: "kg", currentStock: "8", reorderLevel: "5", costPrice: "18.00", supplier: "Ocean Fresh" },
    { name: "Lamb Rack", sku: "LMB-001", category: "Protein", unit: "kg", currentStock: "4", reorderLevel: "5", costPrice: "22.00", supplier: "Metro Foods" },
    { name: "Olive Oil", sku: "OIL-001", category: "Pantry", unit: "ltr", currentStock: "12", reorderLevel: "5", costPrice: "6.50", supplier: "Italian Imports" },
    { name: "All Purpose Flour", sku: "FLR-001", category: "Pantry", unit: "kg", currentStock: "30", reorderLevel: "15", costPrice: "1.20", supplier: "Baker Supply" },
    { name: "Tomatoes", sku: "TOM-001", category: "Produce", unit: "kg", currentStock: "15", reorderLevel: "10", costPrice: "2.50", supplier: "Farm Direct" },
    { name: "Mushrooms", sku: "MSH-001", category: "Produce", unit: "kg", currentStock: "3", reorderLevel: "5", costPrice: "6.00", supplier: "Farm Direct" },
    { name: "Heavy Cream", sku: "CRM-001", category: "Dairy", unit: "ltr", currentStock: "8", reorderLevel: "5", costPrice: "3.50", supplier: "Dairy Fresh" },
    { name: "Parmesan", sku: "PRM-001", category: "Dairy", unit: "kg", currentStock: "2", reorderLevel: "3", costPrice: "18.00", supplier: "Italian Imports" },
    { name: "Bourbon", sku: "BRB-001", category: "Bar", unit: "bottles", currentStock: "6", reorderLevel: "3", costPrice: "28.00", supplier: "Spirit Co" },
    { name: "White Rum", sku: "RUM-001", category: "Bar", unit: "bottles", currentStock: "8", reorderLevel: "4", costPrice: "15.00", supplier: "Spirit Co" },
    { name: "Espresso Beans", sku: "COF-001", category: "Beverages", unit: "kg", currentStock: "5", reorderLevel: "3", costPrice: "12.00", supplier: "Bean Roasters" },
    { name: "Spaghetti Pasta", sku: "PAS-001", category: "Pantry", unit: "kg", currentStock: "20", reorderLevel: "10", costPrice: "1.80", supplier: "Italian Imports" },
    { name: "Arborio Rice", sku: "RIC-001", category: "Pantry", unit: "kg", currentStock: "10", reorderLevel: "5", costPrice: "3.50", supplier: "Italian Imports" },
    { name: "Fresh Mint", sku: "MNT-001", category: "Produce", unit: "bunches", currentStock: "10", reorderLevel: "5", costPrice: "1.50", supplier: "Farm Direct" },
    { name: "Butter", sku: "BTR-001", category: "Dairy", unit: "kg", currentStock: "8", reorderLevel: "5", costPrice: "4.50", supplier: "Dairy Fresh" },
    { name: "Garlic", sku: "GRL-001", category: "Produce", unit: "kg", currentStock: "3.50", reorderLevel: "3", costPrice: "8.00", supplier: "Farm Direct" },
    { name: "Onions", sku: "ONI-001", category: "Produce", unit: "kg", currentStock: "12", reorderLevel: "8", costPrice: "2.50", supplier: "Farm Direct" },
    { name: "Lemon", sku: "LMN-001", category: "Produce", unit: "kg", currentStock: "4", reorderLevel: "5", costPrice: "5.00", supplier: "Farm Direct" },
    { name: "Sugar", sku: "SGR-001", category: "Dry Goods", unit: "kg", currentStock: "15", reorderLevel: "5", costPrice: "2.00", supplier: "Metro Foods" },
    { name: "Salt", sku: "SLT-001", category: "Dry Goods", unit: "kg", currentStock: "10", reorderLevel: "4", costPrice: "1.50", supplier: "Metro Foods" },
    { name: "Black Pepper", sku: "BPP-001", category: "Spices", unit: "kg", currentStock: "1.50", reorderLevel: "2", costPrice: "25.00", supplier: "Italian Imports" },
    { name: "Basil", sku: "BSL-001", category: "Produce", unit: "bunches", currentStock: "6", reorderLevel: "5", costPrice: "3.00", supplier: "Farm Direct" },
  ];

  const createdInvItems = [];
  for (const inv of inventoryData) {
    const item = await storage.createInventoryItem({ ...inv, tenantId: tenant.id });
    createdInvItems.push(item);
  }

  const customerData = [
    { name: "Sarah Johnson", phone: "555-0101", email: "sarah@email.com", loyaltyPoints: 240, totalSpent: "480.00" },
    { name: "Mike Thompson", phone: "555-0102", email: "mike@email.com", loyaltyPoints: 180, totalSpent: "360.00" },
    { name: "Emily Davis", phone: "555-0103", email: "emily@email.com", loyaltyPoints: 520, totalSpent: "1040.00" },
    { name: "David Wilson", phone: "555-0104", email: "david@email.com", loyaltyPoints: 90, totalSpent: "180.00" },
    { name: "Lisa Anderson", phone: "555-0105", email: "lisa@email.com", loyaltyPoints: 340, totalSpent: "680.00" },
  ];

  for (const c of customerData) {
    await storage.createCustomer({ ...c, tenantId: tenant.id });
  }

  // Seed sample offers
  const happyHour = await storage.createOffer({
    tenantId: tenant.id,
    name: "Happy Hour - 20% Off Cocktails",
    description: "20% discount on all cocktails between 4-7 PM",
    type: "percentage",
    value: "20",
    scope: "category",
    scopeRef: "Cocktails",
    active: true,
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-12-31"),
  });

  await storage.createOffer({
    tenantId: tenant.id,
    name: "Combo Meal Deal",
    description: "Get a free dessert with any Main Course order over $25",
    type: "free_item",
    value: "0",
    scope: "order_total",
    minOrderAmount: "25",
    active: true,
    conditions: { freeCategory: "Desserts", requireCategory: "Main Course" },
  });

  await storage.createOffer({
    tenantId: tenant.id,
    name: "First-Time Customer 10% Off",
    description: "10% off for first-time customers, max $15 discount",
    type: "percentage",
    value: "10",
    scope: "all_items",
    maxDiscount: "15",
    active: true,
    usageLimit: 1,
  });

  // Seed sample delivery orders
  const allCustomers = await storage.getCustomersByTenant(tenant.id);
  const allOrders = await storage.getOrdersByTenant(tenant.id);

  if (allCustomers.length > 0 && allOrders.length > 0) {
    await storage.createDeliveryOrder({
      tenantId: tenant.id,
      orderId: allOrders[0].id,
      customerId: allCustomers[0].id,
      customerAddress: "456 Oak Street, Apt 2B, Food City",
      customerPhone: allCustomers[0].phone || "555-0101",
      deliveryPartner: "DoorDash",
      driverName: "Carlos Mendez",
      driverPhone: "555-0200",
      status: "delivered",
      estimatedTime: 35,
      actualTime: 32,
      deliveryFee: "4.99",
    });

    await storage.createDeliveryOrder({
      tenantId: tenant.id,
      orderId: allOrders[1]?.id || allOrders[0].id,
      customerId: allCustomers[1]?.id || allCustomers[0].id,
      customerAddress: "789 Elm Avenue, Suite 5, Food City",
      customerPhone: "555-0102",
      deliveryPartner: "UberEats",
      driverName: "Jamie Park",
      driverPhone: "555-0201",
      status: "in_transit",
      estimatedTime: 40,
      deliveryFee: "5.99",
    });
  }

  // Seed sample employee performance logs
  await storage.createPerformanceLog({
    tenantId: tenant.id,
    userId: waiter.id,
    metricType: "orders_served",
    metricValue: "47",
    period: "2026-03-W1",
    notes: "Strong week, handled busy Saturday dinner service",
  });

  await storage.createPerformanceLog({
    tenantId: tenant.id,
    userId: waiter.id,
    metricType: "avg_rating",
    metricValue: "4.8",
    period: "2026-03-W1",
  });

  await storage.createPerformanceLog({
    tenantId: tenant.id,
    userId: kitchen.id,
    metricType: "avg_prep_time_minutes",
    metricValue: "12.5",
    period: "2026-03-W1",
    notes: "Below target of 15 minutes — excellent performance",
  });

  await storage.createPerformanceLog({
    tenantId: tenant.id,
    userId: manager.id,
    metricType: "revenue_managed",
    metricValue: "8450.00",
    period: "2026-03-W1",
  });

  const today = new Date();
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() - date.getDay() + dayOffset);
    date.setHours(0, 0, 0, 0);

    if (dayOffset < 6) {
      await storage.createStaffSchedule({
        tenantId: tenant.id,
        userId: waiter.id,
        date: date,
        startTime: "10:00",
        endTime: "18:00",
        role: "waiter",
        attendance: dayOffset < new Date().getDay() ? "present" : "scheduled",
      });
    }

    if (dayOffset < 5) {
      await storage.createStaffSchedule({
        tenantId: tenant.id,
        userId: kitchen.id,
        date: date,
        startTime: "08:00",
        endTime: "16:00",
        role: "kitchen",
        attendance: dayOffset < new Date().getDay() ? "present" : "scheduled",
      });
    }

    if (dayOffset % 2 === 0) {
      await storage.createStaffSchedule({
        tenantId: tenant.id,
        userId: manager.id,
        date: date,
        startTime: "09:00",
        endTime: "17:00",
        role: "manager",
        attendance: dayOffset < new Date().getDay() ? "present" : "scheduled",
      });
    }
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  await storage.createReservation({
    tenantId: tenant.id,
    tableId: tableIds[3],
    customerName: "Sarah Johnson",
    customerPhone: "555-0101",
    guests: 4,
    dateTime: new Date(tomorrow.setHours(19, 0, 0, 0)),
    notes: "Anniversary dinner",
    status: "confirmed",
  });

  await storage.createReservation({
    tenantId: tenant.id,
    tableId: tableIds[4],
    customerName: "Mike Thompson",
    customerPhone: "555-0102",
    guests: 6,
    dateTime: new Date(tomorrow.setHours(20, 30, 0, 0)),
    notes: "Birthday celebration",
    status: "pending",
  });

  const todayEvening = new Date(today);
  todayEvening.setHours(19, 30, 0, 0);
  await storage.createReservation({
    tenantId: tenant.id,
    tableId: tableIds[5],
    customerName: "Emily Davis",
    customerPhone: "555-0103",
    guests: 2,
    dateTime: todayEvening,
    status: "confirmed",
  });

  const kitchenMorning = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Kitchen Morning Prep", area: "kitchen", frequency: "daily", shift: "Morning", sortOrder: 1,
  });
  for (const [i, task] of [
    "Sanitize all cutting boards and prep surfaces",
    "Check and record refrigerator temperatures",
    "Clean and sanitize sinks",
    "Sweep and mop kitchen floor",
    "Wipe down all stainless steel surfaces",
    "Empty and clean grease traps",
    "Check hand-wash stations (soap, paper towels)",
  ].entries()) {
    await storage.createCleaningTemplateItem({ templateId: kitchenMorning.id, task, sortOrder: i + 1 });
  }

  const kitchenAfternoon = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Kitchen Afternoon Service", area: "kitchen", frequency: "daily", shift: "Afternoon", sortOrder: 2,
  });
  for (const [i, task] of [
    "Re-sanitize all prep surfaces after lunch rush",
    "Restock cooking stations with fresh supplies",
    "Clean and organize walk-in cooler",
    "Wipe down all equipment exteriors",
    "Check and replenish cleaning supply stations",
    "Clean floor drains",
  ].entries()) {
    await storage.createCleaningTemplateItem({ templateId: kitchenAfternoon.id, task, sortOrder: i + 1 });
  }

  const kitchenClosing = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Kitchen Closing", area: "kitchen", frequency: "daily", shift: "Closing", sortOrder: 3,
  });
  for (const [i, task] of [
    "Deep clean all cooking stations",
    "Clean and sanitize deep fryer",
    "Break down, clean, and sanitize slicer",
    "Clean hood vents and filters",
    "Empty all trash bins and replace liners",
    "Mop floors with sanitizer solution",
    "Turn off all equipment and check gas lines",
  ].entries()) {
    await storage.createCleaningTemplateItem({ templateId: kitchenClosing.id, task, sortOrder: i + 1 });
  }

  const restroomHourly = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Restroom Hourly Check", area: "restaurant_premises", frequency: "hourly", sortOrder: 1,
  });
  for (const [i, task] of [
    "Check and restock toilet paper and hand towels",
    "Wipe down sinks, counters, and mirrors",
    "Empty waste bins and replace liners",
    "Mop floor and check for spills",
    "Refill soap dispensers",
    "Check air freshener levels",
  ].entries()) {
    await storage.createCleaningTemplateItem({ templateId: restroomHourly.id, task, sortOrder: i + 1 });
  }

  const diningEvery2h = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Dining Area (Every 2 Hours)", area: "restaurant_premises", frequency: "every_2_hours", sortOrder: 2,
  });
  for (const [i, task] of [
    "Wipe down all vacant tables and chairs",
    "Check and restock napkin dispensers",
    "Sweep visible floor debris",
    "Empty full waste bins in dining area",
    "Wipe down bar area and counter",
    "Sanitize all condiment containers",
  ].entries()) {
    await storage.createCleaningTemplateItem({ templateId: diningEvery2h.id, task, sortOrder: i + 1 });
  }

  const entryReception = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Entry & Reception Per-Shift", area: "restaurant_premises", frequency: "per_shift", sortOrder: 3,
  });
  for (const [i, task] of [
    "Clean entrance glass doors and windows",
    "Polish hostess stand and reception area",
    "Sweep and mop entry foyer",
    "Wipe down waiting area seating",
    "Check exterior signage cleanliness",
  ].entries()) {
    await storage.createCleaningTemplateItem({ templateId: entryReception.id, task, sortOrder: i + 1 });
  }

  const deepWeekly = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Weekly Deep Clean", area: "deep_cleaning", frequency: "weekly", sortOrder: 1,
  });
  for (const [i, task] of [
    "Deep clean walk-in cooler/freezer",
    "Clean behind and under all kitchen equipment",
    "Descale dishwasher and coffee machines",
    "Clean and sanitize ice machine",
    "Wash walls and baseboards in kitchen",
    "Deep clean exhaust hoods and ductwork",
    "Shampoo dining area carpets/rugs",
    "Clean light fixtures and ceiling fans",
  ].entries()) {
    await storage.createCleaningTemplateItem({ templateId: deepWeekly.id, task, sortOrder: i + 1 });
  }

  const deepMonthly = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Monthly Deep Clean", area: "deep_cleaning", frequency: "monthly", sortOrder: 2,
  });
  for (const [i, task] of [
    "Professional pest control inspection",
    "Deep clean all ventilation systems",
    "Power wash exterior areas and dumpster area",
    "Clean and service fire suppression system",
    "Deep clean storage areas and shelving",
    "Inspect and clean all drains",
    "Polish and seal hardwood/tile floors",
  ].entries()) {
    await storage.createCleaningTemplateItem({ templateId: deepMonthly.id, task, sortOrder: i + 1 });
  }

  const auditKitchen = await storage.createAuditTemplate({ tenantId: tenant.id, name: "Daily Kitchen Safety Audit", category: "food_safety", frequency: "daily", scheduledTime: "06:00", riskLevel: "critical", isActive: true });
  for (const [i, title] of [
    "Fridge temperature within range (0-4°C)", "Freezer temperature within range (-18°C or below)",
    "Raw and cooked food stored separately", "All food items properly labeled and dated",
    "Hand wash stations stocked and accessible", "Cutting boards sanitized and color-coded",
    "No expired products on shelves", "Kitchen surfaces clean and sanitized",
    "Staff wearing proper protective equipment", "Pest control measures in place",
  ].entries()) {
    await storage.createAuditTemplateItem({ templateId: auditKitchen.id, title, category: "food_safety", points: i < 3 ? 10 : 8, photoRequired: i === 0 || i === 1, sortOrder: i + 1 });
  }

  const auditFinancial = await storage.createAuditTemplate({ tenantId: tenant.id, name: "Weekly Financial Review", category: "financial", frequency: "weekly", scheduledDay: "monday", scheduledTime: "10:00", riskLevel: "high", isActive: true });
  for (const [i, title] of [
    "Daily cash register reconciliation completed", "Credit card transactions verified",
    "Expense receipts properly filed", "Supplier invoices matched to deliveries",
    "Petty cash accounted for", "Void/comp transactions reviewed",
  ].entries()) {
    await storage.createAuditTemplateItem({ templateId: auditFinancial.id, title, category: "financial", points: i < 2 ? 10 : 8, photoRequired: false, sortOrder: i + 1 });
  }

  const auditOps = await storage.createAuditTemplate({ tenantId: tenant.id, name: "Monthly Operations Audit", category: "operations", frequency: "monthly", scheduledDay: "1", scheduledTime: "09:00", riskLevel: "medium", isActive: true });
  for (const [i, title] of [
    "Opening procedures followed correctly", "Closing procedures followed correctly",
    "Average wait times within target", "Customer complaints logged and resolved",
    "Equipment maintained and functional", "Inventory levels adequate", "Table turnover rate meets standard",
  ].entries()) {
    await storage.createAuditTemplateItem({ templateId: auditOps.id, title, category: "operations", points: i === 2 || i === 4 ? 10 : 8, photoRequired: i === 4, sortOrder: i + 1 });
  }

  const auditStaff = await storage.createAuditTemplate({ tenantId: tenant.id, name: "Staff Training Compliance", category: "staff", frequency: "monthly", scheduledTime: "14:00", riskLevel: "medium", isActive: true });
  for (const [i, title] of [
    "All staff completed food safety training", "New hire onboarding completed on time",
    "Fire safety drill conducted this month", "Allergen awareness training up to date", "Service standards refresher completed",
  ].entries()) {
    await storage.createAuditTemplateItem({ templateId: auditStaff.id, title, category: "staff", points: i === 0 || i === 2 || i === 3 ? 10 : 7, photoRequired: i === 2, sortOrder: i + 1 });
  }

  const auditFacilities = await storage.createAuditTemplate({ tenantId: tenant.id, name: "Quarterly Facilities Inspection", category: "facilities", frequency: "quarterly", scheduledTime: "08:00", riskLevel: "high", isActive: true });
  for (const [i, title] of [
    "Fire exits clear and properly marked", "Fire extinguishers inspected and charged",
    "Emergency lighting functional", "HVAC system serviced", "Plumbing in good working order",
    "Electrical systems inspected", "Building exterior maintained", "Restrooms clean and stocked",
  ].entries()) {
    await storage.createAuditTemplateItem({ templateId: auditFacilities.id, title, category: "facilities", points: i < 2 || i === 5 ? 10 : 8, photoRequired: i === 0 || i === 1 || i === 4, sortOrder: i + 1 });
  }

  const auditCompliance = await storage.createAuditTemplate({ tenantId: tenant.id, name: "Health & Compliance Audit", category: "compliance", frequency: "monthly", scheduledTime: "11:00", riskLevel: "critical", isActive: true });
  for (const [i, title] of [
    "Health permits current and displayed", "Liquor license valid and displayed",
    "Food handler certifications current", "HACCP plan followed and documented",
    "Allergen information available to customers", "ADA accessibility requirements met", "Workers compensation insurance current",
  ].entries()) {
    await storage.createAuditTemplateItem({ templateId: auditCompliance.id, title, category: "compliance", points: i < 4 || i === 6 ? 10 : 8, photoRequired: i < 2, sortOrder: i + 1 });
  }

  const allMenuItems = await storage.getMenuItemsByTenant(tenant.id);
  const allInvItems = await storage.getInventoryByTenant(tenant.id);
  const invByName = new Map(allInvItems.map(i => [i.name.toLowerCase(), i]));
  const menuByName = new Map(allMenuItems.map(m => [m.name.toLowerCase(), m]));

  const recipeDefinitions = [
    { name: "Grilled Salmon Recipe", menuItem: "Grilled Salmon", ingredients: [
      { item: "Salmon Fillet", qty: "0.25", unit: "kg", waste: "5" },
      { item: "Olive Oil", qty: "0.03", unit: "ltr", waste: "0" },
      { item: "Tomatoes", qty: "0.1", unit: "kg", waste: "10" },
    ]},
    { name: "Chicken Tikka Masala Recipe", menuItem: "Chicken Tikka Masala", ingredients: [
      { item: "Chicken Breast", qty: "0.3", unit: "kg", waste: "8" },
      { item: "Heavy Cream", qty: "0.1", unit: "ltr", waste: "0" },
      { item: "Tomatoes", qty: "0.15", unit: "kg", waste: "10" },
      { item: "Olive Oil", qty: "0.02", unit: "ltr", waste: "0" },
    ]},
    { name: "Lamb Rack Recipe", menuItem: "Lamb Rack", ingredients: [
      { item: "Lamb Rack", qty: "0.35", unit: "kg", waste: "5" },
      { item: "Olive Oil", qty: "0.02", unit: "ltr", waste: "0" },
    ]},
    { name: "Mushroom Risotto Recipe", menuItem: "Mushroom Risotto", ingredients: [
      { item: "Arborio Rice", qty: "0.12", unit: "kg", waste: "0" },
      { item: "Mushrooms", qty: "0.15", unit: "kg", waste: "15" },
      { item: "Parmesan", qty: "0.04", unit: "kg", waste: "0" },
      { item: "Heavy Cream", qty: "0.05", unit: "ltr", waste: "0" },
      { item: "Olive Oil", qty: "0.02", unit: "ltr", waste: "0" },
    ]},
    { name: "Spaghetti Carbonara Recipe", menuItem: "Spaghetti Carbonara", ingredients: [
      { item: "Spaghetti Pasta", qty: "0.15", unit: "kg", waste: "0" },
      { item: "Parmesan", qty: "0.05", unit: "kg", waste: "0" },
      { item: "Heavy Cream", qty: "0.08", unit: "ltr", waste: "0" },
    ]},
    { name: "Bruschetta Recipe", menuItem: "Bruschetta", ingredients: [
      { item: "Tomatoes", qty: "0.12", unit: "kg", waste: "10" },
      { item: "Olive Oil", qty: "0.02", unit: "ltr", waste: "0" },
      { item: "All Purpose Flour", qty: "0.08", unit: "kg", waste: "0" },
    ]},
    { name: "Classic Mojito Recipe", menuItem: "Classic Mojito", ingredients: [
      { item: "White Rum", qty: "0.06", unit: "bottles", waste: "0" },
      { item: "Fresh Mint", qty: "0.1", unit: "bunches", waste: "20" },
    ]},
    { name: "Old Fashioned Recipe", menuItem: "Old Fashioned", ingredients: [
      { item: "Bourbon", qty: "0.06", unit: "bottles", waste: "0" },
    ]},
    { name: "Espresso Recipe", menuItem: "Espresso", ingredients: [
      { item: "Espresso Beans", qty: "0.018", unit: "kg", waste: "5" },
    ]},
    { name: "Beef Tenderloin Recipe", menuItem: "Beef Tenderloin", ingredients: [
      { item: "Olive Oil", qty: "0.03", unit: "ltr", waste: "0" },
      { item: "Mushrooms", qty: "0.08", unit: "kg", waste: "10" },
    ]},
  ];

  for (const rd of recipeDefinitions) {
    const mi = menuByName.get(rd.menuItem.toLowerCase());
    const recipe = await storage.createRecipe({
      tenantId: tenant.id,
      name: rd.name,
      menuItemId: mi?.id || null,
      yield: "1",
      yieldUnit: "portion",
      notes: null,
    });
    for (let i = 0; i < rd.ingredients.length; i++) {
      const invItem = invByName.get(rd.ingredients[i].item.toLowerCase());
      if (invItem) {
        await storage.createRecipeIngredient({
          recipeId: recipe.id,
          inventoryItemId: invItem.id,
          quantity: rd.ingredients[i].qty,
          unit: rd.ingredients[i].unit,
          wastePct: rd.ingredients[i].waste,
          sortOrder: i,
        });
      }
    }
  }

  const stockTake = await storage.createStockTake({
    tenantId: tenant.id,
    conductedBy: owner.id,
    status: "completed",
    notes: "Weekly stock count - demo",
  });
  const stItems = createdInvItems.slice(0, 10);
  for (const item of stItems) {
    const sys = Number(item.currentStock);
    const variance = Math.round((Math.random() * 4 - 2) * 100) / 100;
    const counted = Math.max(0, sys + variance);
    const varianceCost = variance * Number(item.costPrice || 0);
    await storage.createStockTakeLine({
      stockTakeId: stockTake.id,
      inventoryItemId: item.id,
      expectedQty: String(sys),
      countedQty: String(counted.toFixed(2)),
      varianceQty: String(variance.toFixed(2)),
      varianceCost: String(varianceCost.toFixed(2)),
    });
  }

  await storage.createAuditSchedule({ tenantId: tenant.id, templateId: auditKitchen.id, scheduledDate: new Date(), status: "pending", assignedTo: manager.id, maxScore: 85 });
  await storage.createAuditSchedule({ tenantId: tenant.id, templateId: auditOps.id, scheduledDate: new Date(Date.now() + 3 * 86400000), status: "pending", assignedTo: owner.id, maxScore: 59 });

  await storage.createAuditIssue({ tenantId: tenant.id, title: "Walk-in cooler temperature fluctuation", description: "Temperature readings showing inconsistent values between 2-6°C.", severity: "high", status: "open", assignedTo: manager.id });
  await storage.createAuditIssue({ tenantId: tenant.id, title: "Fire extinguisher expired in kitchen B", description: "Monthly inspection found expired fire extinguisher near station B.", severity: "critical", status: "open", assignedTo: owner.id });

  const chPOS = await storage.createOrderChannel({ tenantId: tenant.id, name: "POS (In-house)", slug: "pos", icon: "monitor", active: true, commissionPct: "0" });
  const chSwiggy = await storage.createOrderChannel({ tenantId: tenant.id, name: "Swiggy", slug: "swiggy", icon: "bike", active: true, commissionPct: "22" });
  const chZomato = await storage.createOrderChannel({ tenantId: tenant.id, name: "Zomato", slug: "zomato", icon: "utensils", active: true, commissionPct: "18" });
  const chUberEats = await storage.createOrderChannel({ tenantId: tenant.id, name: "UberEats", slug: "ubereats", icon: "car", active: true, commissionPct: "25" });
  const chWebsite = await storage.createOrderChannel({ tenantId: tenant.id, name: "Website", slug: "website", icon: "globe", active: true, commissionPct: "0" });

  await storage.createChannelConfig({ tenantId: tenant.id, channelId: chSwiggy.id, outletId: outlet.id, enabled: true, prepTimeMinutes: 25, packagingFee: "5.00", autoAccept: true });
  await storage.createChannelConfig({ tenantId: tenant.id, channelId: chZomato.id, outletId: outlet.id, enabled: true, prepTimeMinutes: 20, packagingFee: "4.50", autoAccept: false });
  await storage.createChannelConfig({ tenantId: tenant.id, channelId: chUberEats.id, outletId: outlet.id, enabled: true, prepTimeMinutes: 30, packagingFee: "6.00", autoAccept: true });
  await storage.createChannelConfig({ tenantId: tenant.id, channelId: chWebsite.id, outletId: outlet.id, enabled: true, prepTimeMinutes: 15, packagingFee: "0", autoAccept: true });

  const allMenuForMapping = await storage.getMenuItemsByTenant(tenant.id);
  for (const mi of allMenuForMapping.slice(0, 6)) {
    const markup = 1.1;
    const extPrice = (parseFloat(mi.price) * markup).toFixed(2);
    await storage.createOnlineMenuMapping({ tenantId: tenant.id, menuItemId: mi.id, channelId: chSwiggy.id, externalItemId: `SWG-${mi.id.slice(-6)}`, externalPrice: extPrice, available: true });
    await storage.createOnlineMenuMapping({ tenantId: tenant.id, menuItemId: mi.id, channelId: chZomato.id, externalItemId: `ZMT-${mi.id.slice(-6)}`, externalPrice: extPrice, available: true });
    await storage.createOnlineMenuMapping({ tenantId: tenant.id, menuItemId: mi.id, channelId: chUberEats.id, externalItemId: `UBE-${mi.id.slice(-6)}`, externalPrice: (parseFloat(mi.price) * 1.15).toFixed(2), available: true });
  }

  await storage.createFranchiseInvoice({
    tenantId: tenant.id, outletId: outletMarina.id,
    periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-31"),
    netSales: "62500", royaltyRate: "8", calculatedRoyalty: "5000",
    minimumGuarantee: "5000", finalAmount: "5000", status: "paid",
    notes: "January 2026 royalty — paid on time",
  });
  await storage.createFranchiseInvoice({
    tenantId: tenant.id, outletId: outletMarina.id,
    periodStart: new Date("2026-02-01"), periodEnd: new Date("2026-02-28"),
    netSales: "58200", royaltyRate: "8", calculatedRoyalty: "4656",
    minimumGuarantee: "5000", finalAmount: "5000", status: "sent",
    notes: "February 2026 royalty — minimum guarantee applied",
  });
  await storage.createFranchiseInvoice({
    tenantId: tenant.id, outletId: outletAirport.id,
    periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-31"),
    netSales: "95000", royaltyRate: "10", calculatedRoyalty: "9500",
    minimumGuarantee: "8000", finalAmount: "9500", status: "paid",
    notes: "January 2026 royalty — Airport T3",
  });
  await storage.createFranchiseInvoice({
    tenantId: tenant.id, outletId: outletAirport.id,
    periodStart: new Date("2026-02-01"), periodEnd: new Date("2026-02-28"),
    netSales: "87300", royaltyRate: "10", calculatedRoyalty: "8730",
    minimumGuarantee: "8000", finalAmount: "8730", status: "draft",
    notes: "February 2026 royalty — Airport T3",
  });

  if (allMenuItems.length >= 3) {
    await storage.createOutletMenuOverride({ tenantId: tenant.id, outletId: outletMarina.id, menuItemId: allMenuItems[0].id, overridePrice: (parseFloat(allMenuItems[0].price) * 1.15).toFixed(2), available: true });
    await storage.createOutletMenuOverride({ tenantId: tenant.id, outletId: outletMarina.id, menuItemId: allMenuItems[1].id, overridePrice: (parseFloat(allMenuItems[1].price) * 0.9).toFixed(2), available: true });
    await storage.createOutletMenuOverride({ tenantId: tenant.id, outletId: outletAirport.id, menuItemId: allMenuItems[0].id, overridePrice: (parseFloat(allMenuItems[0].price) * 1.25).toFixed(2), available: true });
    await storage.createOutletMenuOverride({ tenantId: tenant.id, outletId: outletAirport.id, menuItemId: allMenuItems[2].id, overridePrice: (parseFloat(allMenuItems[2].price) * 1.2).toFixed(2), available: true });
  }

  console.log("Demo data seeded successfully!");
  console.log("Login credentials (all passwords: demo123):");
  console.log("  Owner: username=owner");
  console.log("  Manager: username=manager");
  console.log("  Waiter: username=waiter");
  console.log("  Kitchen: username=kitchen");
  console.log("  Accountant: username=accountant");
}