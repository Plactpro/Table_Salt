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

  const outlet = await storage.createOutlet({
    tenantId: tenant.id,
    name: "Main Branch",
    address: "123 Culinary Avenue",
    openingHours: "10:00-23:00",
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
    { name: "Bruschetta", price: "8.99", categoryId: catMap["Starters"], isVeg: true, description: "Toasted bread with tomato, basil, and olive oil" },
    { name: "Chicken Wings", price: "12.99", categoryId: catMap["Starters"], isVeg: false, spicyLevel: 2, description: "Crispy wings with buffalo sauce" },
    { name: "Spring Rolls", price: "7.99", categoryId: catMap["Starters"], isVeg: true, description: "Crispy veggie spring rolls with sweet chili" },
    { name: "Calamari Fritti", price: "11.99", categoryId: catMap["Starters"], isVeg: false, description: "Fried squid rings with tartar sauce" },
    { name: "Tomato Basil Soup", price: "6.99", categoryId: catMap["Soups"], isVeg: true, description: "Classic creamy tomato soup" },
    { name: "French Onion Soup", price: "8.99", categoryId: catMap["Soups"], isVeg: true, description: "Caramelized onion soup with gruyere crouton" },
    { name: "Grilled Salmon", price: "24.99", categoryId: catMap["Main Course"], isVeg: false, description: "Atlantic salmon with lemon butter sauce" },
    { name: "Chicken Tikka Masala", price: "18.99", categoryId: catMap["Main Course"], isVeg: false, spicyLevel: 2, description: "Creamy spiced chicken curry" },
    { name: "Lamb Rack", price: "32.99", categoryId: catMap["Main Course"], isVeg: false, description: "Herb-crusted lamb with rosemary jus" },
    { name: "Mushroom Risotto", price: "16.99", categoryId: catMap["Main Course"], isVeg: true, description: "Creamy arborio rice with wild mushrooms" },
    { name: "Beef Tenderloin", price: "34.99", categoryId: catMap["Main Course"], isVeg: false, description: "8oz tenderloin with red wine reduction" },
    { name: "Spaghetti Carbonara", price: "14.99", categoryId: catMap["Pasta & Noodles"], isVeg: false, description: "Classic Roman pasta with pancetta" },
    { name: "Penne Arrabbiata", price: "12.99", categoryId: catMap["Pasta & Noodles"], isVeg: true, spicyLevel: 2, description: "Spicy tomato sauce pasta" },
    { name: "Pad Thai", price: "15.99", categoryId: catMap["Pasta & Noodles"], isVeg: false, description: "Thai stir-fried rice noodles with shrimp" },
    { name: "Ribeye Steak", price: "38.99", categoryId: catMap["Grills"], isVeg: false, description: "12oz USDA prime ribeye, chargrilled" },
    { name: "BBQ Chicken", price: "19.99", categoryId: catMap["Grills"], isVeg: false, description: "Half chicken with smoky BBQ glaze" },
    { name: "Grilled Vegetable Platter", price: "14.99", categoryId: catMap["Grills"], isVeg: true, description: "Seasonal veggies with herb oil" },
    { name: "Tiramisu", price: "9.99", categoryId: catMap["Desserts"], isVeg: true, description: "Classic Italian coffee-flavored dessert" },
    { name: "Chocolate Lava Cake", price: "11.99", categoryId: catMap["Desserts"], isVeg: true, description: "Warm chocolate cake with molten center" },
    { name: "Crème Brûlée", price: "8.99", categoryId: catMap["Desserts"], isVeg: true, description: "French vanilla custard with caramelized top" },
    { name: "Espresso", price: "3.99", categoryId: catMap["Beverages"], isVeg: true, description: "Double-shot Italian espresso" },
    { name: "Fresh Orange Juice", price: "5.99", categoryId: catMap["Beverages"], isVeg: true, description: "Freshly squeezed orange juice" },
    { name: "Sparkling Water", price: "2.99", categoryId: catMap["Beverages"], isVeg: true, description: "San Pellegrino 500ml" },
    { name: "Classic Mojito", price: "12.99", categoryId: catMap["Cocktails"], isVeg: true, description: "Rum, mint, lime, soda" },
    { name: "Old Fashioned", price: "14.99", categoryId: catMap["Cocktails"], isVeg: true, description: "Bourbon, bitters, sugar, orange peel" },
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
      });
    }
  }

  const inventoryData = [
    { name: "Chicken Breast", sku: "CHK-001", category: "Protein", unit: "kg", currentStock: "25", reorderLevel: "10", costPrice: "8.50", supplier: "Metro Foods" },
    { name: "Salmon Fillet", sku: "SAL-001", category: "Protein", unit: "kg", currentStock: "8", reorderLevel: "5", costPrice: "18.00", supplier: "Ocean Fresh" },
    { name: "Lamb Rack", sku: "LMB-001", category: "Protein", unit: "kg", currentStock: "4", reorderLevel: "5", costPrice: "22.00", supplier: "Metro Foods" },
    { name: "Olive Oil", sku: "OIL-001", category: "Pantry", unit: "liters", currentStock: "12", reorderLevel: "5", costPrice: "6.50", supplier: "Italian Imports" },
    { name: "All Purpose Flour", sku: "FLR-001", category: "Pantry", unit: "kg", currentStock: "30", reorderLevel: "15", costPrice: "1.20", supplier: "Baker Supply" },
    { name: "Tomatoes", sku: "TOM-001", category: "Produce", unit: "kg", currentStock: "15", reorderLevel: "10", costPrice: "2.50", supplier: "Farm Direct" },
    { name: "Mushrooms", sku: "MSH-001", category: "Produce", unit: "kg", currentStock: "3", reorderLevel: "5", costPrice: "6.00", supplier: "Farm Direct" },
    { name: "Heavy Cream", sku: "CRM-001", category: "Dairy", unit: "liters", currentStock: "8", reorderLevel: "5", costPrice: "3.50", supplier: "Dairy Fresh" },
    { name: "Parmesan", sku: "PRM-001", category: "Dairy", unit: "kg", currentStock: "2", reorderLevel: "3", costPrice: "18.00", supplier: "Italian Imports" },
    { name: "Bourbon", sku: "BRB-001", category: "Bar", unit: "bottles", currentStock: "6", reorderLevel: "3", costPrice: "28.00", supplier: "Spirit Co" },
    { name: "White Rum", sku: "RUM-001", category: "Bar", unit: "bottles", currentStock: "8", reorderLevel: "4", costPrice: "15.00", supplier: "Spirit Co" },
    { name: "Espresso Beans", sku: "COF-001", category: "Beverages", unit: "kg", currentStock: "5", reorderLevel: "3", costPrice: "12.00", supplier: "Bean Roasters" },
    { name: "Spaghetti Pasta", sku: "PAS-001", category: "Pantry", unit: "kg", currentStock: "20", reorderLevel: "10", costPrice: "1.80", supplier: "Italian Imports" },
    { name: "Arborio Rice", sku: "RIC-001", category: "Pantry", unit: "kg", currentStock: "10", reorderLevel: "5", costPrice: "3.50", supplier: "Italian Imports" },
    { name: "Fresh Mint", sku: "MNT-001", category: "Produce", unit: "bunches", currentStock: "10", reorderLevel: "5", costPrice: "1.50", supplier: "Farm Direct" },
  ];

  for (const inv of inventoryData) {
    await storage.createInventoryItem({ ...inv, tenantId: tenant.id });
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
  for (const task of [
    "Sanitize all cutting boards and prep surfaces",
    "Check and record refrigerator temperatures",
    "Clean and sanitize sinks",
    "Sweep and mop kitchen floor",
    "Wipe down all stainless steel surfaces",
    "Empty and clean grease traps",
    "Check hand-wash stations (soap, paper towels)",
  ]) {
    await storage.createCleaningTemplateItem({ templateId: kitchenMorning.id, task, sortOrder: 0 });
  }

  const kitchenClosing = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Kitchen Closing", area: "kitchen", frequency: "daily", shift: "Closing", sortOrder: 2,
  });
  for (const task of [
    "Deep clean all cooking stations",
    "Clean and sanitize deep fryer",
    "Break down, clean, and sanitize slicer",
    "Clean hood vents and filters",
    "Empty all trash bins and replace liners",
    "Mop floors with sanitizer solution",
    "Turn off all equipment and check gas lines",
  ]) {
    await storage.createCleaningTemplateItem({ templateId: kitchenClosing.id, task, sortOrder: 0 });
  }

  const premisesHourly = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Dining Area Hourly Check", area: "restaurant_premises", frequency: "hourly", sortOrder: 1,
  });
  for (const task of [
    "Wipe down all vacant tables and chairs",
    "Check and restock napkin dispensers",
    "Sweep visible floor debris",
    "Check restroom cleanliness and supplies",
    "Empty full waste bins in dining area",
  ]) {
    await storage.createCleaningTemplateItem({ templateId: premisesHourly.id, task, sortOrder: 0 });
  }

  const premisesShift = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Premises Per-Shift Clean", area: "restaurant_premises", frequency: "per_shift", sortOrder: 2,
  });
  for (const task of [
    "Deep clean all restrooms",
    "Mop entire dining floor",
    "Clean entrance glass doors and windows",
    "Wipe down bar area and counter",
    "Sanitize all condiment containers",
    "Polish hostess stand and reception area",
  ]) {
    await storage.createCleaningTemplateItem({ templateId: premisesShift.id, task, sortOrder: 0 });
  }

  const deepWeekly = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Weekly Deep Clean", area: "deep_cleaning", frequency: "weekly", sortOrder: 1,
  });
  for (const task of [
    "Deep clean walk-in cooler/freezer",
    "Clean behind and under all kitchen equipment",
    "Descale dishwasher and coffee machines",
    "Clean and sanitize ice machine",
    "Wash walls and baseboards in kitchen",
    "Deep clean exhaust hoods and ductwork",
    "Shampoo dining area carpets/rugs",
    "Clean light fixtures and ceiling fans",
  ]) {
    await storage.createCleaningTemplateItem({ templateId: deepWeekly.id, task, sortOrder: 0 });
  }

  const deepMonthly = await storage.createCleaningTemplate({
    tenantId: tenant.id, name: "Monthly Deep Clean", area: "deep_cleaning", frequency: "monthly", sortOrder: 2,
  });
  for (const task of [
    "Professional pest control inspection",
    "Deep clean all ventilation systems",
    "Power wash exterior areas and dumpster area",
    "Clean and service fire suppression system",
    "Deep clean storage areas and shelving",
    "Inspect and clean all drains",
    "Polish and seal hardwood/tile floors",
  ]) {
    await storage.createCleaningTemplateItem({ templateId: deepMonthly.id, task, sortOrder: 0 });
  }

  console.log("Demo data seeded successfully!");
  console.log("Login credentials (all passwords: demo123):");
  console.log("  Owner: username=owner");
  console.log("  Manager: username=manager");
  console.log("  Waiter: username=waiter");
  console.log("  Kitchen: username=kitchen");
  console.log("  Accountant: username=accountant");
}