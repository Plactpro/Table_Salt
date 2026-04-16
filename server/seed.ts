import { storage } from "./storage";
import { hashPassword } from "./auth";
import { pool } from "./db";

async function seedChefAssignment(tenantId: string, outletId: string, kitchenUserId: string) {
  const existing = await storage.getCounters(tenantId, outletId);
  if (existing.length > 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const counterDefs = [
    { name: "Grill", counterCode: "GRL", displayColor: "#EF4444", sortOrder: 1 },
    { name: "Cold Kitchen", counterCode: "CLD", displayColor: "#3B82F6", sortOrder: 2 },
    { name: "Bar", counterCode: "BAR", displayColor: "#A855F7", sortOrder: 3 },
    { name: "Dessert", counterCode: "DST", displayColor: "#F59E0B", sortOrder: 4 },
  ];

  const counters = await Promise.all(
    counterDefs.map(def =>
      storage.createCounter({ tenantId, outletId, ...def, maxCapacity: 3, isActive: true, handlesCategories: [] })
    )
  );

  const [grillCounter, coldCounter] = counters;

  const rosterEntries = [
    { counterId: grillCounter.id, counterName: grillCounter.name, shiftDate: yesterday, shiftStart: "08:00", shiftEnd: "16:00", shiftType: "morning", status: "completed" },
    { counterId: coldCounter.id, counterName: coldCounter.name, shiftDate: yesterday, shiftStart: "08:00", shiftEnd: "16:00", shiftType: "morning", status: "completed" },
    { counterId: grillCounter.id, counterName: grillCounter.name, shiftDate: today, shiftStart: "08:00", shiftEnd: "16:00", shiftType: "morning", status: "checked_in", checkedInAt: new Date(Date.now() - 2 * 3600000) },
    { counterId: coldCounter.id, counterName: coldCounter.name, shiftDate: today, shiftStart: "16:00", shiftEnd: "23:00", shiftType: "evening", status: "scheduled" },
    { counterId: grillCounter.id, counterName: grillCounter.name, shiftDate: tomorrow, shiftStart: "08:00", shiftEnd: "16:00", shiftType: "morning", status: "scheduled" },
    { counterId: coldCounter.id, counterName: coldCounter.name, shiftDate: tomorrow, shiftStart: "08:00", shiftEnd: "16:00", shiftType: "morning", status: "scheduled" },
  ];

  await Promise.all(
    rosterEntries.map(entry =>
      storage.createRosterEntry({ tenantId, outletId, chefId: kitchenUserId, chefName: "Pat Garcia", ...entry })
    )
  );

  await storage.upsertChefAvailability({
    tenantId, outletId, chefId: kitchenUserId, counterId: grillCounter.id,
    shiftDate: today, status: "available", activeTickets: 2,
  });

  const now = new Date();
  const assignments: Array<{ menuItemName: string; counterId: string; counterName: string; status: string; chefId?: string; chefName?: string; tableNumber?: number; assignmentType: string; minsAgo: number }> = [
    { menuItemName: "Grilled Ribeye Steak",   counterId: grillCounter.id, counterName: "Grill",        status: "in_progress", chefId: kitchenUserId, chefName: "Pat Garcia", tableNumber: 4,  assignmentType: "AUTO",      minsAgo: 8 },
    { menuItemName: "BBQ Chicken Wings",       counterId: grillCounter.id, counterName: "Grill",        status: "in_progress", chefId: kitchenUserId, chefName: "Pat Garcia", tableNumber: 7,  assignmentType: "ROSTER",    minsAgo: 5 },
    { menuItemName: "Caesar Salad",            counterId: coldCounter.id,  counterName: "Cold Kitchen",  status: "assigned",    chefId: kitchenUserId, chefName: "Pat Garcia", tableNumber: 2,  assignmentType: "AUTO",      minsAgo: 3 },
    { menuItemName: "Bruschetta",              counterId: coldCounter.id,  counterName: "Cold Kitchen",  status: "assigned",    chefId: kitchenUserId, chefName: "Pat Garcia", tableNumber: 9,  assignmentType: "SELF",      minsAgo: 2 },
    { menuItemName: "Beef Burger",             counterId: grillCounter.id, counterName: "Grill",        status: "unassigned",                                                 tableNumber: 11, assignmentType: "UNASSIGNED", minsAgo: 4 },
    { menuItemName: "Grilled Salmon",          counterId: grillCounter.id, counterName: "Grill",        status: "unassigned",                                                 tableNumber: 3,  assignmentType: "UNASSIGNED", minsAgo: 6 },
    { menuItemName: "Tiramisu",                counterId: counters[3].id,  counterName: "Dessert",      status: "unassigned",                                                 tableNumber: 5,  assignmentType: "UNASSIGNED", minsAgo: 1 },
    { menuItemName: "Mojito",                  counterId: counters[2].id,  counterName: "Bar",          status: "assigned",    chefId: kitchenUserId, chefName: "Pat Garcia", tableNumber: 6,  assignmentType: "MANUAL",    minsAgo: 2 },
    { menuItemName: "Mushroom Risotto",        counterId: coldCounter.id,  counterName: "Cold Kitchen",  status: "completed",   chefId: kitchenUserId, chefName: "Pat Garcia", tableNumber: 1,  assignmentType: "AUTO",      minsAgo: 30 },
    { menuItemName: "Spaghetti Carbonara",     counterId: coldCounter.id,  counterName: "Cold Kitchen",  status: "completed",   chefId: kitchenUserId, chefName: "Pat Garcia", tableNumber: 8,  assignmentType: "ROSTER",    minsAgo: 45 },
  ];

  await Promise.all(
    assignments.map(a => {
      const assignedAt = new Date(now.getTime() - a.minsAgo * 60000);
      const startedAt = a.status === "in_progress" || a.status === "completed"
        ? new Date(assignedAt.getTime() + 60000) : undefined;
      const completedAt = a.status === "completed"
        ? new Date(assignedAt.getTime() + 10 * 60000) : undefined;
      return storage.createAssignment({
        tenantId, outletId,
        menuItemName: a.menuItemName,
        counterId: a.counterId,
        counterName: a.counterName,
        chefId: a.chefId ?? null,
        chefName: a.chefName ?? null,
        assignmentType: a.assignmentType,
        status: a.status,
        tableNumber: a.tableNumber ?? null,
        assignmentScore: a.chefId ? 75 : null,
        assignedAt: a.chefId ? assignedAt : null,
        startedAt: startedAt ?? null,
        completedAt: completedAt ?? null,
        estimatedTimeMin: 15,
        actualTimeMin: a.status === "completed" ? 10 : null,
      });
    })
  );
}

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

  const seedPassword = process.env.DEFAULT_STAFF_PASSWORD;
  if (!seedPassword) {
    console.warn("[Seed] DEFAULT_STAFF_PASSWORD not set — skipping seed data");
    return;
  }
  const pw = await hashPassword(seedPassword);

  const owner = await storage.createUser({
    tenantId: tenant.id, username: "owner", password: pw, name: "Alex Sterling", email: "alex@grandkitchen.com", role: "owner", hourlyRate: "50.00", overtimeRate: "75.00",
  });
  const manager = await storage.createUser({
    tenantId: tenant.id, username: "manager", password: pw, name: "Jordan Rivera", email: "jordan@grandkitchen.com", role: "manager", hourlyRate: "35.00", overtimeRate: "52.50",
  });
  const waiter = await storage.createUser({
    tenantId: tenant.id, username: "waiter", password: pw, name: "Sam Chen", email: "sam@grandkitchen.com", role: "waiter", hourlyRate: "18.00", overtimeRate: "27.00",
  });
  const kitchen = await storage.createUser({
    tenantId: tenant.id, username: "kitchen", password: pw, name: "Pat Garcia", email: "pat@grandkitchen.com", role: "kitchen", hourlyRate: "20.00", overtimeRate: "30.00",
  });
  await storage.createUser({
    tenantId: tenant.id, username: "accountant", password: pw, name: "Morgan Lee", email: "morgan@grandkitchen.com", role: "accountant", hourlyRate: "30.00", overtimeRate: "45.00",
  });

  // Delivery agents for Service Coordination System (Task #94)
  await storage.createUser({
    tenantId: tenant.id, username: "delivery1", password: pw, name: "Carlos Mendez", email: "carlos@grandkitchen.com", role: "delivery_agent",
  });
  await storage.createUser({
    tenantId: tenant.id, username: "delivery2", password: pw, name: "Jamie Park", email: "jamie@grandkitchen.com", role: "delivery_agent",
  });
  await storage.createUser({
    tenantId: tenant.id, username: "delivery3", password: pw, name: "Priya Sharma", email: "priya@grandkitchen.com", role: "delivery_agent",
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

  const zoneMain = await storage.createTableZone({ tenantId: tenant.id, outletId: outlet.id, name: "Main Hall", color: "#10b981", sortOrder: 0 });
  const zonePatio = await storage.createTableZone({ tenantId: tenant.id, outletId: outlet.id, name: "Patio", color: "#6366f1", sortOrder: 1 });
  const zonePrivate = await storage.createTableZone({ tenantId: tenant.id, outletId: outlet.id, name: "Private", color: "#f59e0b", sortOrder: 2 });
  await storage.createTableZone({ tenantId: tenant.id, outletId: outlet.id, name: "Bar", color: "#8b5cf6", sortOrder: 3 });

  const zones = ["Main Hall", "Patio", "Private"];
  const tableData = [
    { number: 1, capacity: 2, zone: "Main Hall", zoneId: zoneMain.id, shape: "square" as const, posX: 20, posY: 20 },
    { number: 2, capacity: 2, zone: "Main Hall", zoneId: zoneMain.id, shape: "circle" as const, posX: 160, posY: 20 },
    { number: 3, capacity: 4, zone: "Main Hall", zoneId: zoneMain.id, shape: "square" as const, posX: 300, posY: 20 },
    { number: 4, capacity: 4, zone: "Main Hall", zoneId: zoneMain.id, shape: "rectangle" as const, posX: 440, posY: 20 },
    { number: 5, capacity: 6, zone: "Main Hall", zoneId: zoneMain.id, shape: "circle" as const, posX: 620, posY: 20 },
    { number: 6, capacity: 4, zone: "Patio", zoneId: zonePatio.id, shape: "circle" as const, posX: 20, posY: 160 },
    { number: 7, capacity: 2, zone: "Patio", zoneId: zonePatio.id, shape: "square" as const, posX: 160, posY: 160 },
    { number: 8, capacity: 6, zone: "Patio", zoneId: zonePatio.id, shape: "rectangle" as const, posX: 300, posY: 160 },
    { number: 9, capacity: 8, zone: "Private", zoneId: zonePrivate.id, shape: "rectangle" as const, posX: 20, posY: 300 },
    { number: 10, capacity: 10, zone: "Private", zoneId: zonePrivate.id, shape: "circle" as const, posX: 200, posY: 300 },
  ];

  const tableIds: string[] = [];
  for (const t of tableData) {
    const tbl = await storage.createTable({
      ...t,
      tenantId: tenant.id,
      outletId: outlet.id,
      status: t.number <= 3 ? "occupied" : t.number === 6 ? "reserved" : "free",
      partyName: t.number === 1 ? "Smith Family" : t.number === 2 ? "Johnson" : t.number === 3 ? "VIP Guest" : undefined,
      partySize: t.number === 1 ? 2 : t.number === 2 ? 2 : t.number === 3 ? 4 : undefined,
      seatedAt: t.number <= 3 ? new Date(Date.now() - (t.number * 15 * 60000)) : undefined,
      qrToken: `tbl-${t.number.toString().padStart(3, "0")}`,
    });
    tableIds.push(tbl.id);
  }

  await storage.createWaitlistEntry({ tenantId: tenant.id, outletId: outlet.id, customerName: "Ahmed Al-Rashid", customerPhone: "+971-55-123-4567", partySize: 4, preferredZone: "Main Hall", status: "waiting", estimatedWaitMinutes: 15, notes: "Birthday celebration", priority: 1 });
  await storage.createWaitlistEntry({ tenantId: tenant.id, outletId: outlet.id, customerName: "Sarah Johnson", customerPhone: "+971-50-987-6543", partySize: 2, status: "waiting", estimatedWaitMinutes: 10, priority: 2 });
  await storage.createWaitlistEntry({ tenantId: tenant.id, outletId: outlet.id, customerName: "Kumar Family", customerPhone: "+971-56-456-7890", partySize: 6, preferredZone: "Patio", status: "waiting", estimatedWaitMinutes: 25, notes: "Need high chair", priority: 3 });

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

  // Seed promotion rules
  await storage.createPromotionRule({
    tenantId: tenant.id,
    name: "Happy Hour Cocktails",
    description: "20% off all cocktails between 4-7 PM, Mon-Fri",
    ruleType: "happy_hour",
    discountType: "percentage",
    discountValue: "20",
    scope: "category",
    scopeRef: catMap["Cocktails"],
    channels: ["pos"],
    priority: 10,
    stackable: false,
    active: true,
    conditions: { startHour: 16, endHour: 19, daysOfWeek: [1, 2, 3, 4, 5] },
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-12-31"),
  });

  await storage.createPromotionRule({
    tenantId: tenant.id,
    name: "Combo Meal Discount",
    description: "15% off when ordering a starter + main course, min order $30",
    ruleType: "combo_deal",
    discountType: "percentage",
    discountValue: "15",
    scope: "all_items",
    minOrderAmount: "30",
    priority: 5,
    stackable: true,
    active: true,
    maxDiscount: "25",
    conditions: { requiredCategories: [catMap["Starters"], catMap["Main Course"]] },
  });

  await storage.createPromotionRule({
    tenantId: tenant.id,
    name: "Delivery Surcharge",
    description: "Service fee for delivery channel orders",
    ruleType: "channel_surcharge",
    discountType: "surcharge",
    discountValue: "3.50",
    scope: "order_total",
    channels: ["delivery"],
    priority: 1,
    stackable: true,
    active: true,
  });

  await storage.createPromotionRule({
    tenantId: tenant.id,
    name: "Gold Loyalty 10% Off",
    description: "10% discount for Gold-tier and above loyalty members",
    ruleType: "loyalty_discount",
    discountType: "percentage",
    discountValue: "10",
    scope: "all_items",
    priority: 3,
    stackable: true,
    active: true,
    maxDiscount: "50",
    conditions: { loyaltyTier: "gold" },
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
        hourlyRate: "18.00",
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
        hourlyRate: "20.00",
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
        hourlyRate: "35.00",
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
  const chQrDinein = await storage.createOrderChannel({ tenantId: tenant.id, name: "QR Table Order", slug: "qr_dinein", icon: "qr-code", active: true, commissionPct: "0" });

  await storage.createChannelConfig({ tenantId: tenant.id, channelId: chSwiggy.id, outletId: outlet.id, enabled: true, prepTimeMinutes: 25, packagingFee: "5.00", autoAccept: true });
  await storage.createChannelConfig({ tenantId: tenant.id, channelId: chZomato.id, outletId: outlet.id, enabled: true, prepTimeMinutes: 20, packagingFee: "4.50", autoAccept: false });
  await storage.createChannelConfig({ tenantId: tenant.id, channelId: chUberEats.id, outletId: outlet.id, enabled: true, prepTimeMinutes: 30, packagingFee: "6.00", autoAccept: true });
  await storage.createChannelConfig({ tenantId: tenant.id, channelId: chWebsite.id, outletId: outlet.id, enabled: true, prepTimeMinutes: 15, packagingFee: "0", autoAccept: true });
  await storage.createChannelConfig({ tenantId: tenant.id, channelId: chQrDinein.id, outletId: outlet.id, enabled: true, prepTimeMinutes: 10, packagingFee: "0", autoAccept: true });

  if (tableIds.length > 0) {
    const sampleSession = await storage.createTableSession({
      tenantId: tenant.id, outletId: outlet.id, tableId: tableIds[0],
      token: "tbl-001", status: "active", guestCount: 2,
    });
    const sampleMenuItems = await storage.getMenuItemsByTenant(tenant.id);
    if (sampleMenuItems.length > 0) {
      await storage.createGuestCartItem({
        sessionId: sampleSession.id, menuItemId: sampleMenuItems[0].id,
        name: sampleMenuItems[0].name, price: sampleMenuItems[0].price,
        quantity: 2, notes: "No onions", guestLabel: "Guest 1",
      });
      if (sampleMenuItems.length > 1) {
        await storage.createGuestCartItem({
          sessionId: sampleSession.id, menuItemId: sampleMenuItems[1].id,
          name: sampleMenuItems[1].name, price: sampleMenuItems[1].price,
          quantity: 1, notes: null, guestLabel: "Guest 2",
        });
      }
    }
  }

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

  const supplierFarmDirect = await storage.createSupplier({
    tenantId: tenant.id, name: "Farm Direct Produce", contactName: "Ahmed Hassan",
    email: "ahmed@farmdirect.ae", phone: "+971-4-555-1001", address: "Al Quoz Industrial 3, Dubai",
    paymentTerms: "Net 15", leadTimeDays: 1, rating: "4.5", notes: "Fresh daily delivery before 7am",
  });
  const supplierItalian = await storage.createSupplier({
    tenantId: tenant.id, name: "Italian Imports LLC", contactName: "Marco Rossi",
    email: "marco@italianimports.ae", phone: "+971-4-555-2002", address: "Jebel Ali Free Zone, Dubai",
    paymentTerms: "Net 30", leadTimeDays: 7, rating: "4.8", notes: "Premium Italian products, minimum order 500 AED",
  });
  const supplierMetro = await storage.createSupplier({
    tenantId: tenant.id, name: "Metro Foods Trading", contactName: "Priya Sharma",
    email: "priya@metrofoods.ae", phone: "+971-4-555-3003", address: "Dubai Investment Park, Dubai",
    paymentTerms: "Net 30", leadTimeDays: 3, rating: "4.2", notes: "Bulk dry goods and pantry staples",
  });
  const supplierDairy = await storage.createSupplier({
    tenantId: tenant.id, name: "Dairy Fresh Co.", contactName: "Sara Al-Mahmoud",
    email: "sara@dairyfresh.ae", phone: "+971-4-555-4004", address: "Al Ain Farms, Abu Dhabi",
    paymentTerms: "COD", leadTimeDays: 2, rating: "4.0", notes: "Refrigerated delivery. Call before 2pm for next-day.",
  });

  if (createdInvItems.length >= 6) {
    await storage.createSupplierCatalogItem({ tenantId: tenant.id, supplierId: supplierFarmDirect.id, inventoryItemId: createdInvItems[5].id, packSize: "5", packUnit: "kg", packCost: "35.00", preferred: true });
    await storage.createSupplierCatalogItem({ tenantId: tenant.id, supplierId: supplierFarmDirect.id, inventoryItemId: createdInvItems[6].id, packSize: "10", packUnit: "kg", packCost: "22.00", preferred: true });
    await storage.createSupplierCatalogItem({ tenantId: tenant.id, supplierId: supplierFarmDirect.id, inventoryItemId: createdInvItems[7].id, packSize: "5", packUnit: "kg", packCost: "22.50", preferred: true });
    await storage.createSupplierCatalogItem({ tenantId: tenant.id, supplierId: supplierItalian.id, inventoryItemId: createdInvItems[2].id, packSize: "10", packUnit: "kg", packCost: "16.00", preferred: true });
    await storage.createSupplierCatalogItem({ tenantId: tenant.id, supplierId: supplierItalian.id, inventoryItemId: createdInvItems[3].id, packSize: "5", packUnit: "kg", packCost: "15.50", preferred: true });
    await storage.createSupplierCatalogItem({ tenantId: tenant.id, supplierId: supplierMetro.id, inventoryItemId: createdInvItems[8].id, packSize: "25", packUnit: "kg", packCost: "45.00", preferred: true });
    await storage.createSupplierCatalogItem({ tenantId: tenant.id, supplierId: supplierMetro.id, inventoryItemId: createdInvItems[9].id, packSize: "25", packUnit: "kg", packCost: "32.00", preferred: true });
    await storage.createSupplierCatalogItem({ tenantId: tenant.id, supplierId: supplierDairy.id, inventoryItemId: createdInvItems[4].id, packSize: "5", packUnit: "kg", packCost: "20.00", preferred: true });

    const po1 = await storage.createPurchaseOrder({
      tenantId: tenant.id, outletId: outlet.id, supplierId: supplierFarmDirect.id,
      poNumber: "PO-2026-001", status: "closed", totalAmount: "79.50",
      notes: "Weekly produce order", createdBy: owner.id, approvedBy: owner.id,
      approvedAt: new Date("2026-03-10"), expectedDelivery: new Date("2026-03-11"),
    });
    await storage.createPurchaseOrderItem({ purchaseOrderId: po1.id, inventoryItemId: createdInvItems[5].id, quantity: "5", unitCost: "7.00", totalCost: "35.00", receivedQty: "5" });
    await storage.createPurchaseOrderItem({ purchaseOrderId: po1.id, inventoryItemId: createdInvItems[6].id, quantity: "10", unitCost: "2.20", totalCost: "22.00", receivedQty: "10" });
    await storage.createPurchaseOrderItem({ purchaseOrderId: po1.id, inventoryItemId: createdInvItems[7].id, quantity: "5", unitCost: "4.50", totalCost: "22.50", receivedQty: "5" });
    await storage.createProcurementApproval({ tenantId: tenant.id, purchaseOrderId: po1.id, action: "approved", performedBy: owner.id, notes: "Approved weekly order" });

    const po1Items = await storage.getPurchaseOrderItems(po1.id);
    const grn1 = await storage.createGRN({ tenantId: tenant.id, purchaseOrderId: po1.id, grnNumber: "GRN-0001", receivedBy: owner.id, notes: "Full delivery received, all items in good condition" });
    for (const pi of po1Items) {
      await storage.createGRNItem({ grnId: grn1.id, purchaseOrderItemId: pi.id, inventoryItemId: pi.inventoryItemId, quantityReceived: pi.quantity, actualUnitCost: pi.unitCost, priceVariance: "0.00" });
    }

    const po2 = await storage.createPurchaseOrder({
      tenantId: tenant.id, outletId: outlet.id, supplierId: supplierItalian.id,
      poNumber: "PO-2026-002", status: "sent", totalAmount: "31.50",
      notes: "Pasta and rice restock", createdBy: owner.id, approvedBy: owner.id,
      approvedAt: new Date("2026-03-14"), expectedDelivery: new Date("2026-03-20"),
    });
    await storage.createPurchaseOrderItem({ purchaseOrderId: po2.id, inventoryItemId: createdInvItems[2].id, quantity: "10", unitCost: "1.60", totalCost: "16.00", receivedQty: "0" });
    await storage.createPurchaseOrderItem({ purchaseOrderId: po2.id, inventoryItemId: createdInvItems[3].id, quantity: "5", unitCost: "3.10", totalCost: "15.50", receivedQty: "0" });
    await storage.createProcurementApproval({ tenantId: tenant.id, purchaseOrderId: po2.id, action: "approved", performedBy: owner.id, notes: "Approved Italian restock" });
    await storage.createProcurementApproval({ tenantId: tenant.id, purchaseOrderId: po2.id, action: "sent", performedBy: owner.id, notes: "Emailed to supplier" });

    const po3 = await storage.createPurchaseOrder({
      tenantId: tenant.id, outletId: outlet.id, supplierId: supplierMetro.id,
      poNumber: "PO-2026-003", status: "draft", totalAmount: "77.00",
      notes: "Monthly dry goods", createdBy: owner.id, expectedDelivery: new Date("2026-03-25"),
    });
    await storage.createPurchaseOrderItem({ purchaseOrderId: po3.id, inventoryItemId: createdInvItems[8].id, quantity: "25", unitCost: "1.80", totalCost: "45.00", receivedQty: "0" });
    await storage.createPurchaseOrderItem({ purchaseOrderId: po3.id, inventoryItemId: createdInvItems[9].id, quantity: "25", unitCost: "1.28", totalCost: "32.00", receivedQty: "0" });
  }

  const snapshotDays = [5, 4, 3, 2, 1];
  for (const daysAgo of snapshotDays) {
    const snapDate = new Date(); snapDate.setDate(snapDate.getDate() - daysAgo); snapDate.setHours(0, 0, 0, 0);
    const baseSales = 800 + Math.random() * 400;
    await storage.createLabourCostSnapshot({
      tenantId: tenant.id, date: snapDate, role: "waiter",
      scheduledHours: "8.00", actualHours: String((7 + Math.random() * 2).toFixed(2)),
      overtimeHours: String(Math.max(0, Math.random() * 1.5).toFixed(2)),
      scheduledCost: "144.00", actualCost: String((130 + Math.random() * 30).toFixed(2)),
      overtimeCost: String((Math.random() * 20).toFixed(2)),
      salesRevenue: String(baseSales.toFixed(2)),
      labourPct: String(((150 / baseSales) * 100).toFixed(1)),
      headcount: 1,
    });
    await storage.createLabourCostSnapshot({
      tenantId: tenant.id, date: snapDate, role: "kitchen",
      scheduledHours: "8.00", actualHours: String((7.5 + Math.random() * 1.5).toFixed(2)),
      overtimeHours: String(Math.max(0, Math.random() * 1).toFixed(2)),
      scheduledCost: "160.00", actualCost: String((150 + Math.random() * 25).toFixed(2)),
      overtimeCost: String((Math.random() * 15).toFixed(2)),
      salesRevenue: String(baseSales.toFixed(2)),
      labourPct: String(((160 / baseSales) * 100).toFixed(1)),
      headcount: 1,
    });
    await storage.createLabourCostSnapshot({
      tenantId: tenant.id, date: snapDate, role: "manager",
      scheduledHours: "8.00", actualHours: "8.00",
      overtimeHours: "0.00",
      scheduledCost: "280.00", actualCost: "280.00",
      overtimeCost: "0.00",
      salesRevenue: String(baseSales.toFixed(2)),
      labourPct: String(((280 / baseSales) * 100).toFixed(1)),
      headcount: 1,
    });
  }

  const auditSamples = [
    { action: "login", userId: owner.id, userName: owner.name, entityType: "user", entityId: owner.id, entityName: owner.name, ipAddress: "192.168.1.10" },
    { action: "login", userId: manager.id, userName: manager.name, entityType: "user", entityId: manager.id, entityName: manager.name, ipAddress: "192.168.1.11" },
    { action: "menu_item_updated", userId: owner.id, userName: owner.name, entityType: "menu_item", entityId: allItems[0]?.id, entityName: allItems[0]?.name, before: { price: "7.99" }, after: { price: "8.99" } },
    { action: "inventory_adjusted", userId: manager.id, userName: manager.name, entityType: "inventory_item", entityId: createdInvItems[0]?.id, entityName: createdInvItems[0]?.name, before: { currentStock: "20" }, after: { currentStock: "25" }, metadata: { type: "in", quantity: "5", reason: "Weekly delivery" } },
    { action: "order_voided", userId: owner.id, userName: owner.name, entityType: "order", entityId: allOrders[0]?.id, before: { status: "paid", total: "45.50" }, after: { status: "voided" }, metadata: { reason: "Customer complaint" } },
    { action: "tenant_settings_updated", userId: owner.id, userName: owner.name, entityType: "tenant", entityId: tenant.id, before: { taxRate: "8.0" }, after: { taxRate: "8.5" } },
    { action: "supervisor_override", userId: waiter.id, userName: waiter.name, metadata: { supervisorId: manager.id, supervisorName: manager.name, forAction: "apply_large_discount", requestedBy: waiter.name }, supervisorId: manager.id },
    { action: "login_failed", metadata: { username: "unknown_user" }, ipAddress: "10.0.0.99" },
    { action: "offer_created", userId: owner.id, userName: owner.name, entityType: "offer", entityName: "Happy Hour - 20% Off Cocktails", after: { name: "Happy Hour", type: "percentage", value: "20" } },
    { action: "user_created", userId: owner.id, userName: owner.name, entityType: "user", entityId: waiter.id, entityName: waiter.name, after: { name: waiter.name, role: "waiter" } },
  ];

  for (const sample of auditSamples) {
    await storage.createAuditEvent({
      tenantId: tenant.id,
      userId: sample.userId || null,
      userName: sample.userName || null,
      action: sample.action,
      entityType: sample.entityType || null,
      entityId: sample.entityId || null,
      entityName: sample.entityName || null,
      outletId: null,
      before: (sample.before as Record<string, unknown>) || null,
      after: (sample.after as Record<string, unknown>) || null,
      metadata: (sample.metadata as Record<string, unknown>) || null,
      ipAddress: sample.ipAddress || null,
      userAgent: null,
      supervisorId: sample.supervisorId || null,
    });
  }

  const { deviceSessions } = await import("@shared/schema");
  const { db } = await import("./db");
  const deviceSeeds = [
    { tenantId: tenant.id, userId: owner.id, deviceFingerprint: "fp_owner_desktop_01", deviceName: "Owner MacBook Pro", browser: "Chrome 121", os: "macOS 14.3", ipAddress: "10.0.1.10", isTrusted: true, lastActive: new Date(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    { tenantId: tenant.id, userId: owner.id, deviceFingerprint: "fp_owner_ipad_02", deviceName: "Owner iPad", browser: "Safari 17", os: "iPadOS 17.2", ipAddress: "10.0.1.11", isTrusted: true, lastActive: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    { tenantId: tenant.id, userId: manager.id, deviceFingerprint: "fp_manager_pos_01", deviceName: "POS Terminal 1", browser: "Chrome 120", os: "Windows 11", ipAddress: "10.0.2.20", isTrusted: true, lastActive: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    { tenantId: tenant.id, userId: waiter.id, deviceFingerprint: "fp_waiter_tablet_01", deviceName: "Waiter Tablet", browser: "Chrome 121", os: "Android 14", ipAddress: "10.0.3.30", isTrusted: false, lastActive: new Date(Date.now() - 3 * 60 * 60 * 1000), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  ];
  for (const ds of deviceSeeds) {
    await db.insert(deviceSessions).values(ds);
  }

  const kioskMain = await storage.createKioskDevice({
    tenantId: tenant.id,
    outletId: outlet.id,
    name: "Main Entrance Kiosk",
    deviceToken: "kiosk-demo-token-main-001",
    active: true,
    settings: { theme: "dark", idleTimeout: 120 },
  });

  await storage.createKioskDevice({
    tenantId: tenant.id,
    outletId: outletMarina.id,
    name: "Marina Walk Kiosk",
    deviceToken: "kiosk-demo-token-marina-001",
    active: true,
    settings: { theme: "dark", idleTimeout: 120 },
  });

  await storage.createKioskDevice({
    tenantId: tenant.id,
    outletId: outletAirport.id,
    name: "Airport T3 Kiosk",
    deviceToken: "kiosk-demo-token-airport-001",
    active: true,
    settings: { theme: "dark", idleTimeout: 90 },
  });

  const beverageCatId = catMap["Beverages"];
  const dessertCatId = catMap["Desserts"];
  const mainCourseCatId = catMap["Main Course"];

  const allMenuItemsKiosk = await storage.getMenuItemsByTenant(tenant.id);
  const espressoItem = allMenuItemsKiosk.find(i => i.name === "Espresso");
  const tiramisuItem = allMenuItemsKiosk.find(i => i.name === "Tiramisu");
  const sparklingItem = allMenuItemsKiosk.find(i => i.name === "Sparkling Water");
  const chocoLavaItem = allMenuItemsKiosk.find(i => i.name === "Chocolate Lava Cake");

  if (espressoItem && mainCourseCatId) {
    await storage.createUpsellRule({
      tenantId: tenant.id,
      triggerCategoryId: mainCourseCatId,
      suggestItemId: espressoItem.id,
      label: "Add an Espresso to finish your meal?",
      priority: 10,
      active: true,
    });
  }

  if (tiramisuItem && mainCourseCatId) {
    await storage.createUpsellRule({
      tenantId: tenant.id,
      triggerCategoryId: mainCourseCatId,
      suggestItemId: tiramisuItem.id,
      label: "Top it off with our signature Tiramisu!",
      priority: 8,
      active: true,
    });
  }

  if (sparklingItem && beverageCatId) {
    await storage.createUpsellRule({
      tenantId: tenant.id,
      triggerCategoryId: beverageCatId,
      suggestItemId: sparklingItem.id,
      label: "Stay refreshed with Sparkling Water",
      priority: 5,
      active: true,
    });
  }

  if (chocoLavaItem) {
    await storage.createUpsellRule({
      tenantId: tenant.id,
      triggerCategoryId: catMap["Grills"],
      suggestItemId: chocoLavaItem.id,
      label: "Perfect dessert after your grill!",
      priority: 7,
      active: true,
    });
  }

  const now = new Date();
  const eventSeeds = [
    {
      tenantId: tenant.id,
      title: "New Year's Eve Celebration",
      description: "Special New Year's Eve dinner service with countdown event",
      type: "holiday" as const,
      impact: "very_high" as const,
      startDate: new Date(now.getFullYear(), 11, 31, 18, 0).toISOString(),
      endDate: new Date(now.getFullYear() + 1, 0, 1, 2, 0).toISOString(),
      allDay: false,
      color: "#f59e0b",
      outlets: null,
      tags: ["busy", "extra-staff", "special-menu"],
      linkedOfferId: null,
      notes: "Plan for extended hours. All hands required.",
      createdBy: owner.id,
    },
    {
      tenantId: tenant.id,
      title: "World Cup Final Screening",
      description: "Live screening of the World Cup final match with special F&B packages",
      type: "sports" as const,
      impact: "high" as const,
      startDate: new Date(now.getFullYear(), now.getMonth(), 20, 19, 0).toISOString(),
      endDate: new Date(now.getFullYear(), now.getMonth(), 20, 23, 0).toISOString(),
      allDay: false,
      color: "#22c55e",
      outlets: null,
      tags: ["sports", "screening", "packages"],
      linkedOfferId: null,
      notes: "Set up projector screens in Main Branch and Marina Walk",
      createdBy: manager.id,
    },
    {
      tenantId: tenant.id,
      title: "Local Marathon Day",
      description: "City marathon passing by our outlets - expect road closures and extra foot traffic",
      type: "corporate" as const,
      impact: "medium" as const,
      startDate: new Date(now.getFullYear(), now.getMonth() + 1, 15, 6, 0).toISOString(),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 15, 14, 0).toISOString(),
      allDay: false,
      color: "#3b82f6",
      outlets: null,
      tags: ["road-closure", "foot-traffic"],
      linkedOfferId: null,
      notes: "Coordinate with delivery partners about alternate routes",
      createdBy: owner.id,
    },
    {
      tenantId: tenant.id,
      title: "Corporate Team Lunch Booking",
      description: "Large corporate booking for 50 pax team lunch",
      type: "corporate" as const,
      impact: "high" as const,
      startDate: new Date(now.getFullYear(), now.getMonth(), 25, 12, 0).toISOString(),
      endDate: new Date(now.getFullYear(), now.getMonth(), 25, 15, 0).toISOString(),
      allDay: false,
      color: "#3b82f6",
      outlets: null,
      tags: ["corporate", "large-party", "pre-order"],
      linkedOfferId: null,
      notes: "Menu pre-selected. Extra kitchen staff needed.",
      createdBy: manager.id,
    },
  ];

  for (const eventData of eventSeeds) {
    await storage.createEvent(eventData);
  }

  const comboMenuItems = await storage.getMenuItemsByTenant(tenant.id);
  const findItem = (name: string) => comboMenuItems.find((i) => i.name === name);

  const chickenWings = findItem("Chicken Wings");
  const fries = findItem("Spring Rolls");
  const espresso = findItem("Espresso");
  const grilledSalmon = findItem("Grilled Salmon");
  const mushroomRisotto = findItem("Mushroom Risotto");
  const tiramisu = findItem("Tiramisu");
  const ribeyeSteak = findItem("Ribeye Steak");
  const tomatoSoup = findItem("Tomato Basil Soup");
  const chocolateLava = findItem("Chocolate Lava Cake");
  const mojito = findItem("Classic Mojito");

  if (chickenWings && fries && espresso) {
    const mainTotal = Number(chickenWings.price);
    const sideTotal = Number(fries.price);
    const addonTotal = Number(espresso.price);
    const indivTotal = mainTotal + sideTotal + addonTotal;
    const comboPrice = 19.99;
    const savings = ((indivTotal - comboPrice) / indivTotal * 100).toFixed(2);
    await storage.createComboOffer({
      tenantId: tenant.id,
      name: "Wings + Rolls + Espresso Combo",
      description: "Crispy chicken wings with spring rolls and an espresso to finish",
      comboPrice: String(comboPrice),
      individualTotal: indivTotal.toFixed(2),
      savingsPercentage: savings,
      mainItems: [{ menuItemId: chickenWings.id, name: chickenWings.name, price: chickenWings.price }],
      sideItems: [{ menuItemId: fries.id, name: fries.name, price: fries.price }],
      addonItems: [{ menuItemId: espresso.id, name: espresso.name, price: espresso.price }],
      isActive: true,
      validityStart: new Date("2026-01-01"),
      validityEnd: new Date("2026-12-31"),
      orderCount: 42,
      createdBy: owner.id,
    });
  }

  if (grilledSalmon && mushroomRisotto && tiramisu) {
    const indivTotal = Number(grilledSalmon.price) + Number(mushroomRisotto.price) + Number(tiramisu.price);
    const comboPrice = 42.99;
    const savings = ((indivTotal - comboPrice) / indivTotal * 100).toFixed(2);
    await storage.createComboOffer({
      tenantId: tenant.id,
      name: "Salmon + Risotto + Dessert Combo",
      description: "Premium dining combo with salmon, mushroom risotto, and tiramisu",
      comboPrice: String(comboPrice),
      individualTotal: indivTotal.toFixed(2),
      savingsPercentage: savings,
      mainItems: [{ menuItemId: grilledSalmon.id, name: grilledSalmon.name, price: grilledSalmon.price }],
      sideItems: [{ menuItemId: mushroomRisotto.id, name: mushroomRisotto.name, price: mushroomRisotto.price }],
      addonItems: [{ menuItemId: tiramisu.id, name: tiramisu.name, price: tiramisu.price }],
      isActive: true,
      validityStart: new Date("2026-01-01"),
      validityEnd: new Date("2026-12-31"),
      orderCount: 28,
      createdBy: owner.id,
    });
  }

  if (ribeyeSteak && tomatoSoup && chocolateLava && mojito) {
    const indivTotal = Number(ribeyeSteak.price) + Number(tomatoSoup.price) + Number(chocolateLava.price) + Number(mojito.price);
    const comboPrice = 54.99;
    const savings = ((indivTotal - comboPrice) / indivTotal * 100).toFixed(2);
    await storage.createComboOffer({
      tenantId: tenant.id,
      name: "Steak Night Special",
      description: "Ribeye steak with soup, chocolate lava cake, and a mojito",
      comboPrice: String(comboPrice),
      individualTotal: indivTotal.toFixed(2),
      savingsPercentage: savings,
      mainItems: [{ menuItemId: ribeyeSteak.id, name: ribeyeSteak.name, price: ribeyeSteak.price }],
      sideItems: [{ menuItemId: tomatoSoup.id, name: tomatoSoup.name, price: tomatoSoup.price }],
      addonItems: [{ menuItemId: chocolateLava.id, name: chocolateLava.name, price: chocolateLava.price }, { menuItemId: mojito.id, name: mojito.name, price: mojito.price }],
      isActive: true,
      validityStart: new Date("2026-01-01"),
      validityEnd: new Date("2026-12-31"),
      timeSlots: ["dinner"],
      orderCount: 15,
      createdBy: owner.id,
    });
  }

  const qrTokenValues: string[] = [];
  for (let i = 0; i < tableIds.length; i++) {
    const tableId = tableIds[i];
    const tableNum = i + 1;
    const tokenVal = `qr-demo-table-${String(tableNum).padStart(3, "0")}`;
    await storage.createQrToken({
      tenantId: tenant.id,
      outletId: outlet.id,
      tableId,
      token: tokenVal,
      active: true,
      label: `Table ${tableNum}`,
    });
    qrTokenValues.push(tokenVal);
  }

  const qrTokenRecords = [];
  for (const tv of qrTokenValues) {
    const t = await storage.getQrTokenByValue(tv);
    if (t) qrTokenRecords.push(t);
  }

  if (qrTokenRecords.length >= 5) {
    const now = Date.now();
    const sampleRequests = [
      { tokenIdx: 0, type: "call_server", priority: "high", status: "pending", note: "Need help with the menu", minsAgo: 1 },
      { tokenIdx: 1, type: "water_refill", priority: "medium", status: "acknowledged", note: null, minsAgo: 8 },
      { tokenIdx: 2, type: "request_bill", priority: "high", status: "pending", note: "In a hurry", minsAgo: 3 },
      { tokenIdx: 0, type: "feedback", priority: "low", status: "completed", note: "Everything was great!", minsAgo: 45 },
      { tokenIdx: 3, type: "cleaning", priority: "medium", status: "acknowledged", note: "Spilled some water", minsAgo: 12 },
      { tokenIdx: 4, type: "order_food", priority: "medium", status: "pending_confirmation", note: "Allergic to nuts, please confirm", minsAgo: 5 },
      { tokenIdx: 1, type: "call_server", priority: "low", status: "completed", note: null, minsAgo: 120 },
      { tokenIdx: 2, type: "feedback", priority: "low", status: "completed", note: "Loved the ambiance", minsAgo: 200 },
      { tokenIdx: 3, type: "feedback", priority: "low", status: "completed", note: "Steak was overcooked", minsAgo: 90 },
      { tokenIdx: 0, type: "water_refill", priority: "medium", status: "pending", note: null, minsAgo: 10, escalated: true },
    ];

    for (const sr of sampleRequests) {
      const qrt = qrTokenRecords[sr.tokenIdx];
      if (!qrt) continue;
      const createdAt = new Date(now - sr.minsAgo * 60000);
      const acknowledgedAt = sr.status === "acknowledged" || sr.status === "completed"
        ? new Date(createdAt.getTime() + 2 * 60000) : null;
      const completedAt = sr.status === "completed"
        ? new Date(createdAt.getTime() + (sr.minsAgo > 60 ? 10 : 5) * 60000) : null;
      const escalatedAt = (sr as any).escalated ? new Date(createdAt.getTime() + 2 * 60000) : null;

      await storage.createTableRequest({
        tenantId: tenant.id,
        outletId: outlet.id,
        tableId: qrt.tableId,
        qrTokenId: qrt.id,
        requestType: sr.type,
        priority: sr.priority,
        status: sr.status,
        guestNote: sr.note ?? null,
        acknowledgedAt,
        completedAt,
        escalatedAt,
      });
    }
  }

  await seedChefAssignment(tenant.id, outlet.id, kitchen.id);

  // ─── Seed Audit Templates ────────────────────────────────────────────────
  const kitchenAuditTemplate = await storage.createAuditTemplate({
    tenantId: tenant.id,
    name: "Kitchen Operations Audit",
    category: "food_safety",
    frequency: "daily",
    scheduledTime: "14:00",
    scheduledDay: null,
    riskLevel: "critical",
    isActive: true,
  });
  const kitchenAuditItems = [
    { title: "All food stored at correct temperatures", description: "Check refrigerator and freezer temps are within safe range", category: "food_safety", points: 10, photoRequired: true, supervisorApproval: false },
    { title: "Raw meat stored separately from other foods", description: "Verify correct storage segregation to prevent cross-contamination", category: "food_safety", points: 10, photoRequired: false, supervisorApproval: false },
    { title: "All food properly labeled and dated", description: "Check labels on all stored items including prep containers", category: "food_safety", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "Food rotation (FIFO) practised correctly", description: "First-in, first-out rotation observed in all storage areas", category: "operations", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "All surfaces sanitized before use", description: "Prep tables and cutting boards sanitized with approved solution", category: "food_safety", points: 10, photoRequired: true, supervisorApproval: false },
    { title: "Hand wash stations fully stocked", description: "Soap, paper towels, and sanitizer available at each station", category: "food_safety", points: 10, photoRequired: false, supervisorApproval: false },
    { title: "PPE correctly used by all kitchen staff", description: "Gloves, hairnets, and aprons worn as required", category: "compliance", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "No expired ingredients in use", description: "Check all items in active use are within their use-by date", category: "food_safety", points: 10, photoRequired: false, supervisorApproval: true },
    { title: "Pest control log reviewed and up to date", description: "Verify pest control records are current and no activity noted", category: "compliance", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "Equipment in good working order", description: "All cooking equipment functioning safely with no defects", category: "operations", points: 5, photoRequired: false, supervisorApproval: false },
  ];
  for (let i = 0; i < kitchenAuditItems.length; i++) {
    await storage.createAuditTemplateItem({ ...kitchenAuditItems[i], templateId: kitchenAuditTemplate.id, sortOrder: i });
  }

  const fohAuditTemplate = await storage.createAuditTemplate({
    tenantId: tenant.id,
    name: "Front of House Audit",
    category: "operations",
    frequency: "daily",
    scheduledTime: "16:00",
    scheduledDay: null,
    riskLevel: "high",
    isActive: true,
  });
  const fohAuditItems = [
    { title: "Entrance and reception area clean and welcoming", description: "Check cleanliness and presentation of entry area", category: "facilities", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "All tables properly set and clean", description: "Tables have clean linens/covers, correct cutlery and condiments", category: "operations", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "Restrooms clean and fully stocked", description: "Verify restrooms are clean with soap, paper, and sanitizer", category: "facilities", points: 10, photoRequired: false, supervisorApproval: false },
    { title: "Staff uniforms neat and name badges visible", description: "All FOH staff in correct uniform with visible identification", category: "staff", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "Menus clean and in good condition", description: "No torn or dirty menus in circulation", category: "operations", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "POS and payment systems operational", description: "Cash registers and card terminals tested and working", category: "operations", points: 10, photoRequired: false, supervisorApproval: false },
    { title: "Emergency exits clear and signage visible", description: "Fire exits unblocked and safety signs illuminated", category: "compliance", points: 10, photoRequired: true, supervisorApproval: true },
    { title: "Customer feedback forms available", description: "Feedback cards or digital option available to guests", category: "operations", points: 5, photoRequired: false, supervisorApproval: false },
  ];
  for (let i = 0; i < fohAuditItems.length; i++) {
    await storage.createAuditTemplateItem({ ...fohAuditItems[i], templateId: fohAuditTemplate.id, sortOrder: i });
  }

  const financialAuditTemplate = await storage.createAuditTemplate({
    tenantId: tenant.id,
    name: "Financial Audit",
    category: "financial",
    frequency: "weekly",
    scheduledTime: "10:00",
    scheduledDay: "monday",
    riskLevel: "critical",
    isActive: true,
  });
  const financialAuditItems = [
    { title: "Cash drawer count matches opening float", description: "Count cash drawer and verify against expected opening amount", category: "financial", points: 10, photoRequired: false, supervisorApproval: true },
    { title: "Daily sales reports reconciled", description: "POS sales totals match bank deposits and receipts", category: "financial", points: 10, photoRequired: false, supervisorApproval: true },
    { title: "Void and refund log reviewed", description: "All voided transactions reviewed and authorized", category: "financial", points: 10, photoRequired: false, supervisorApproval: true },
    { title: "Petty cash log accurate and up to date", description: "All petty cash expenses recorded with receipts", category: "financial", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "Tip distribution records complete", description: "Staff tip records accurate and signed off", category: "financial", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "Inventory variance within accepted threshold", description: "Theoretical vs actual food cost variance within 3% tolerance", category: "financial", points: 10, photoRequired: false, supervisorApproval: true },
    { title: "Supplier invoices matched to deliveries", description: "GRN records match supplier invoices for the week", category: "financial", points: 10, photoRequired: false, supervisorApproval: false },
    { title: "Payroll hours verified against timesheets", description: "All staff hours cross-checked against clock-in records", category: "financial", points: 5, photoRequired: false, supervisorApproval: true },
    { title: "Outstanding credit notes reviewed", description: "Any outstanding supplier credit notes addressed", category: "financial", points: 5, photoRequired: false, supervisorApproval: false },
  ];
  for (let i = 0; i < financialAuditItems.length; i++) {
    await storage.createAuditTemplateItem({ ...financialAuditItems[i], templateId: financialAuditTemplate.id, sortOrder: i });
  }

  const staffAuditTemplate = await storage.createAuditTemplate({
    tenantId: tenant.id,
    name: "Staff & Training Audit",
    category: "staff",
    frequency: "weekly",
    scheduledTime: "11:00",
    scheduledDay: "friday",
    riskLevel: "medium",
    isActive: true,
  });
  const staffAuditItems = [
    { title: "All staff have completed required food safety training", description: "Verify training certificates are current for all active staff", category: "compliance", points: 10, photoRequired: false, supervisorApproval: true },
    { title: "Onboarding documentation complete for new hires", description: "New staff have signed all required forms", category: "compliance", points: 10, photoRequired: false, supervisorApproval: false },
    { title: "Performance review schedule on track", description: "Scheduled performance reviews completed within timeframe", category: "staff", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "Safety incident log reviewed", description: "Any workplace incidents properly documented and followed up", category: "compliance", points: 10, photoRequired: false, supervisorApproval: true },
    { title: "Staff scheduling meets legal requirements", description: "Minimum rest periods and hours compliance verified", category: "compliance", points: 5, photoRequired: false, supervisorApproval: false },
  ];
  for (let i = 0; i < staffAuditItems.length; i++) {
    await storage.createAuditTemplateItem({ ...staffAuditItems[i], templateId: staffAuditTemplate.id, sortOrder: i });
  }

  const opsAuditTemplate = await storage.createAuditTemplate({
    tenantId: tenant.id,
    name: "Comprehensive Operations Audit",
    category: "operations",
    frequency: "monthly",
    scheduledTime: "09:00",
    scheduledDay: "1",
    riskLevel: "high",
    isActive: true,
  });
  const opsAuditItems = [
    { title: "Fire suppression system inspected", description: "Annual inspection sticker current and system tested", category: "facilities", points: 10, photoRequired: true, supervisorApproval: true },
    { title: "All fire extinguishers checked and accessible", description: "Fire extinguishers in date and in designated locations", category: "compliance", points: 10, photoRequired: false, supervisorApproval: false },
    { title: "Grease trap cleaned and documented", description: "Commercial grease trap serviced and service record available", category: "facilities", points: 10, photoRequired: true, supervisorApproval: false },
    { title: "HVAC system filters cleaned or replaced", description: "Ventilation system filters serviced and functioning", category: "facilities", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "Walk-in cooler and freezer door seals checked", description: "Door gaskets in good condition with no air leaks", category: "operations", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "Plumbing for leaks and drainage function", description: "All drains clear and no visible plumbing issues", category: "facilities", points: 5, photoRequired: false, supervisorApproval: false },
    { title: "Food safety audit records reviewed", description: "Previous audit findings reviewed and corrected", category: "compliance", points: 10, photoRequired: false, supervisorApproval: true },
    { title: "License and permit renewals on schedule", description: "Business, food handler, and liquor licenses current", category: "compliance", points: 10, photoRequired: false, supervisorApproval: true },
    { title: "Menu allergen information updated and accurate", description: "Allergen declarations match current menu ingredients", category: "compliance", points: 10, photoRequired: false, supervisorApproval: false },
    { title: "Supplier contracts and agreements reviewed", description: "All supplier agreements current and pricing verified", category: "financial", points: 5, photoRequired: false, supervisorApproval: false },
  ];
  for (let i = 0; i < opsAuditItems.length; i++) {
    await storage.createAuditTemplateItem({ ...opsAuditItems[i], templateId: opsAuditTemplate.id, sortOrder: i });
  }

  const healthPrepTemplate = await storage.createAuditTemplate({
    tenantId: tenant.id,
    name: "Health Inspection Prep",
    category: "compliance",
    frequency: "quarterly",
    scheduledTime: "08:00",
    scheduledDay: "90",
    riskLevel: "critical",
    isActive: true,
  });
  const healthPrepItems = [
    { title: "Food temperatures logged for all critical control points", description: "Temperature logs complete for all required time periods", category: "food_safety", points: 10, photoRequired: true, supervisorApproval: true },
    { title: "Pest control records complete and filed", description: "All pest control visits documented with findings", category: "compliance", points: 10, photoRequired: false, supervisorApproval: true },
    { title: "Staff food handler certifications current", description: "All certifications valid and photocopies on file", category: "compliance", points: 10, photoRequired: false, supervisorApproval: true },
    { title: "HACCP plan reviewed and up to date", description: "Hazard analysis and critical control point plan current", category: "food_safety", points: 10, photoRequired: false, supervisorApproval: true },
    { title: "Facility cleanliness and repair log current", description: "All maintenance issues documented and actioned", category: "facilities", points: 10, photoRequired: false, supervisorApproval: false },
  ];
  for (let i = 0; i < healthPrepItems.length; i++) {
    await storage.createAuditTemplateItem({ ...healthPrepItems[i], templateId: healthPrepTemplate.id, sortOrder: i });
  }

  // Seed sample audit schedules
  const auditYesterday = new Date();
  auditYesterday.setDate(auditYesterday.getDate() - 1);
  const auditToday = new Date();
  const auditLastWeek = new Date();
  auditLastWeek.setDate(auditLastWeek.getDate() - 7);

  const completedKitchenItems = await storage.getAuditTemplateItems(kitchenAuditTemplate.id);
  const kitchenMaxScore = completedKitchenItems.reduce((sum, i) => sum + (i.points || 5), 0);

  const completedKitchenSchedule = await storage.createAuditSchedule({
    tenantId: tenant.id,
    templateId: kitchenAuditTemplate.id,
    scheduledDate: auditLastWeek,
    status: "completed",
    assignedTo: manager.id,
    approvedBy: owner.id,
    totalScore: Math.round(kitchenMaxScore * 0.87),
    maxScore: kitchenMaxScore,
    completedAt: new Date(auditLastWeek.getTime() + 3600000),
    notes: "Good overall compliance. Noted one item needed attention regarding label dating.",
  });

  for (let i = 0; i < completedKitchenItems.length; i++) {
    await storage.createAuditResponse({
      scheduleId: completedKitchenSchedule.id,
      itemId: completedKitchenItems[i].id,
      status: i === 2 ? "fail" : "pass",
      notes: i === 2 ? "Some containers found without labels in the walk-in" : null,
      completedBy: manager.id,
      completedAt: new Date(auditLastWeek.getTime() + (i * 120000)),
    });
  }

  await storage.createAuditIssue({
    tenantId: tenant.id,
    scheduleId: completedKitchenSchedule.id,
    itemId: completedKitchenItems[2].id,
    title: "Unlabeled prep containers in walk-in cooler",
    description: "Multiple prep containers found without date or content labels. Risk of food waste and cross-contamination.",
    severity: "high",
    status: "resolved",
    assignedTo: manager.id,
    dueDate: auditYesterday,
    resolvedAt: auditYesterday,
    resolvedBy: manager.id,
  });

  await storage.createAuditSchedule({
    tenantId: tenant.id,
    templateId: fohAuditTemplate.id,
    scheduledDate: auditToday,
    status: "pending",
    assignedTo: manager.id,
    maxScore: (await storage.getAuditTemplateItems(fohAuditTemplate.id)).reduce((sum, i) => sum + (i.points || 5), 0),
    notes: null,
  });

  const overdueFinancialSchedule = await storage.createAuditSchedule({
    tenantId: tenant.id,
    templateId: financialAuditTemplate.id,
    scheduledDate: auditYesterday,
    status: "overdue",
    assignedTo: manager.id,
    maxScore: (await storage.getAuditTemplateItems(financialAuditTemplate.id)).reduce((sum, i) => sum + (i.points || 5), 0),
    notes: null,
  });

  await storage.createAuditIssue({
    tenantId: tenant.id,
    scheduleId: overdueFinancialSchedule.id,
    itemId: null,
    title: "Weekly Financial Audit overdue",
    description: "Financial audit was not completed on the scheduled Monday. Requires immediate attention.",
    severity: "critical",
    status: "open",
    assignedTo: manager.id,
    dueDate: auditToday,
  });

  console.log("Demo data seeded successfully!");
  console.log("Seed users created: owner, manager, waiter, kitchen, accountant (passwords redacted)");
  console.log("Kiosk tokens created for 3 outlets (tokens redacted)");

  await seedServiceCoordination(tenant.id, outlet.id, waiter.id, manager.id, kitchen.id);
  await seedFoodModifications(tenant.id);
  await seedWastageData(tenant.id, outlet.id, kitchen.id, manager.id);
  await seedSelectiveCookingData(tenant.id, outlet.id, kitchen.id, waiter.id);
}

async function seedWastageData(
  tenantId: string,
  outletId: string,
  chefId: string,
  managerId: string,
): Promise<void> {
  const existing = await pool.query(
    `SELECT COUNT(*) AS cnt FROM wastage_logs WHERE tenant_id = $1`,
    [tenantId]
  );
  if (parseInt(existing.rows[0].cnt) > 0) {
    console.log("Wastage seed data already exists, skipping.");
    return;
  }

  console.log("Seeding wastage tracking data...");

  const { rows: invRows } = await pool.query(
    `SELECT id, name, unit, cost_price FROM inventory_items WHERE tenant_id = $1 ORDER BY name LIMIT 20`,
    [tenantId]
  );
  if (invRows.length === 0) return;

  const invMap: Record<string, { id: string; unit: string; costPrice: number }> = {};
  for (const r of invRows) {
    invMap[r.name] = { id: r.id, unit: r.unit || "kg", costPrice: Number(r.cost_price || 0) };
  }

  const { rows: counterRows } = await pool.query(
    `SELECT id, name FROM kitchen_counters WHERE tenant_id = $1 LIMIT 4`,
    [tenantId]
  );
  const counters = counterRows.length > 0
    ? counterRows
    : [
        { id: "cnt-1", name: "Hot Counter" },
        { id: "cnt-2", name: "Cold Counter" },
        { id: "cnt-3", name: "Grill Station" },
        { id: "cnt-4", name: "Dessert Bar" },
      ];

  const chefs = [
    { id: chefId, name: "Pat Garcia" },
    { id: null, name: "Rina Patel" },
    { id: null, name: "Mohammed Al-Farsi" },
    { id: null, name: "Lily Chen" },
    { id: null, name: "Dev Kumar" },
  ];

  const categories = [
    "spoilage", "overproduction", "plate_return", "trim_waste", "cooking_error",
    "expired", "dropped", "cross_contamination", "portion_error", "transfer_loss",
    "quality_rejection", "storage_damage", "other",
  ];

  const ingredientList = Object.keys(invMap).length > 0
    ? Object.entries(invMap).map(([name, meta]) => ({ name, ...meta }))
    : [
        { name: "Chicken Breast", id: null, unit: "kg", costPrice: 8.5 },
        { name: "Salmon Fillet", id: null, unit: "kg", costPrice: 18 },
        { name: "Tomatoes", id: null, unit: "kg", costPrice: 2.5 },
        { name: "Heavy Cream", id: null, unit: "ltr", costPrice: 3.5 },
        { name: "Mushrooms", id: null, unit: "kg", costPrice: 6 },
      ];

  function dateStr(daysAgo: number): string {
    const d = new Date(Date.now() - daysAgo * 86400000);
    return d.toISOString().slice(0, 10);
  }

  async function insertWastage(params: {
    date: string; category: string; ingIndex: number; qty: number;
    chefIndex: number; counterIndex: number; isPreventable: boolean; reason?: string; isRecovery?: boolean;
  }): Promise<void> {
    const ing = ingredientList[params.ingIndex % ingredientList.length];
    const chef = chefs[params.chefIndex % chefs.length];
    const counter = counters[params.counterIndex % counters.length];
    const unitCost = ing.costPrice;
    const totalCost = +(params.qty * unitCost).toFixed(2);

    const { rows: cntRows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM wastage_logs WHERE tenant_id = $1 AND wastage_date = $2`,
      [tenantId, params.date]
    );
    const seq = (parseInt(cntRows[0].cnt) + 1).toString().padStart(4, "0");
    const wastageNumber = `WST-${params.date.replace(/-/g, "")}-${seq}`;

    await pool.query(
      `INSERT INTO wastage_logs
         (tenant_id, outlet_id, wastage_number, wastage_date, wastage_category,
          ingredient_id, ingredient_name, quantity, unit, unit_cost, total_cost,
          reason, is_preventable, chef_id, chef_name, counter_id, counter_name, is_recovery)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        tenantId, outletId, wastageNumber, params.date, params.category,
        ing.id, ing.name, params.qty, ing.unit, unitCost, totalCost,
        params.reason || `${params.category} — kitchen log`, params.isPreventable,
        chef.id, chef.name, counter.id, counter.name, params.isRecovery || false,
      ]
    );
  }

  const today = dateStr(0);

  const historyEntries = [
    { daysAgo: 7, category: "spoilage", ingIndex: 1, qty: 0.5, chefIndex: 1, counterIndex: 0, isPreventable: true },
    { daysAgo: 7, category: "overproduction", ingIndex: 0, qty: 0.8, chefIndex: 2, counterIndex: 2, isPreventable: true },
    { daysAgo: 7, category: "trim_waste", ingIndex: 2, qty: 0.3, chefIndex: 0, counterIndex: 1, isPreventable: false },
    { daysAgo: 6, category: "cooking_error", ingIndex: 0, qty: 0.4, chefIndex: 3, counterIndex: 2, isPreventable: true },
    { daysAgo: 6, category: "expired", ingIndex: 4, qty: 1.0, chefIndex: 1, counterIndex: 0, isPreventable: true },
    { daysAgo: 6, category: "dropped", ingIndex: 2, qty: 0.6, chefIndex: 4, counterIndex: 1, isPreventable: false },
    { daysAgo: 5, category: "plate_return", ingIndex: 0, qty: 0.3, chefIndex: 2, counterIndex: 3, isPreventable: false },
    { daysAgo: 5, category: "cross_contamination", ingIndex: 1, qty: 0.4, chefIndex: 0, counterIndex: 0, isPreventable: true },
    { daysAgo: 5, category: "portion_error", ingIndex: 3, qty: 0.2, chefIndex: 1, counterIndex: 2, isPreventable: true },
    { daysAgo: 4, category: "storage_damage", ingIndex: 4, qty: 0.8, chefIndex: 3, counterIndex: 1, isPreventable: true },
    { daysAgo: 4, category: "quality_rejection", ingIndex: 0, qty: 0.5, chefIndex: 2, counterIndex: 3, isPreventable: false },
    { daysAgo: 4, category: "transfer_loss", ingIndex: 2, qty: 0.3, chefIndex: 4, counterIndex: 0, isPreventable: false },
    { daysAgo: 3, category: "spoilage", ingIndex: 1, qty: 0.6, chefIndex: 1, counterIndex: 1, isPreventable: true },
    { daysAgo: 3, category: "overproduction", ingIndex: 0, qty: 1.0, chefIndex: 0, counterIndex: 2, isPreventable: true },
    { daysAgo: 3, category: "cooking_error", ingIndex: 3, qty: 0.15, chefIndex: 3, counterIndex: 3, isPreventable: true },
    { daysAgo: 2, category: "trim_waste", ingIndex: 2, qty: 0.4, chefIndex: 2, counterIndex: 0, isPreventable: false },
    { daysAgo: 2, category: "expired", ingIndex: 4, qty: 0.7, chefIndex: 1, counterIndex: 1, isPreventable: true },
    { daysAgo: 2, category: "dropped", ingIndex: 0, qty: 0.3, chefIndex: 4, counterIndex: 2, isPreventable: false },
    { daysAgo: 1, category: "plate_return", ingIndex: 1, qty: 0.2, chefIndex: 0, counterIndex: 3, isPreventable: false },
    { daysAgo: 1, category: "other", ingIndex: 3, qty: 0.1, chefIndex: 3, counterIndex: 0, isPreventable: false },
    { daysAgo: 1, category: "spoilage", ingIndex: 2, qty: 0.5, chefIndex: 2, counterIndex: 1, isPreventable: true },
  ];

  for (const e of historyEntries) {
    await insertWastage({ date: dateStr(e.daysAgo), category: e.category, ingIndex: e.ingIndex, qty: e.qty, chefIndex: e.chefIndex, counterIndex: e.counterIndex, isPreventable: e.isPreventable });
  }

  const todayEntries = [
    { category: "spoilage", ingIndex: 1, qty: 0.8, chefIndex: 0, counterIndex: 0, isPreventable: true, reason: "Salmon left out — temperature breach" },
    { category: "cooking_error", ingIndex: 0, qty: 0.5, chefIndex: 1, counterIndex: 2, isPreventable: true, reason: "Overcooked chicken — discarded" },
    { category: "trim_waste", ingIndex: 2, qty: 0.4, chefIndex: 2, counterIndex: 1, isPreventable: false, reason: "Tomato trimming prep" },
    { category: "overproduction", ingIndex: 0, qty: 1.2, chefIndex: 3, counterIndex: 2, isPreventable: true, reason: "Excess grilled chicken — shift close" },
    { category: "expired", ingIndex: 4, qty: 0.6, chefIndex: 4, counterIndex: 0, isPreventable: true, reason: "Mushrooms past use-by date" },
    { category: "dropped", ingIndex: 2, qty: 0.3, chefIndex: 0, counterIndex: 1, isPreventable: false, reason: "Dropped during plating" },
    { category: "plate_return", ingIndex: 0, qty: 0.25, chefIndex: 1, counterIndex: 3, isPreventable: false, reason: "Customer returned — undercooked" },
    { category: "cross_contamination", ingIndex: 1, qty: 0.5, chefIndex: 2, counterIndex: 0, isPreventable: true, reason: "Cross-contamination with allergen" },
    { category: "quality_rejection", ingIndex: 3, qty: 0.2, chefIndex: 3, counterIndex: 2, isPreventable: false, reason: "Cream curdled — texture issue" },
    { category: "portion_error", ingIndex: 0, qty: 0.3, chefIndex: 4, counterIndex: 2, isPreventable: true, reason: "Over-portioned at grill station" },
    { category: "storage_damage", ingIndex: 4, qty: 0.4, chefIndex: 0, counterIndex: 1, isPreventable: true, reason: "Freezer burn — storage issue" },
    { category: "transfer_loss", ingIndex: 2, qty: 0.2, chefIndex: 1, counterIndex: 0, isPreventable: false, reason: "Spillage during transfer" },
    { category: "other", ingIndex: 3, qty: 0.1, chefIndex: 2, counterIndex: 3, isPreventable: false, reason: "Misc kitchen waste" },
    { category: "spoilage", ingIndex: 1, qty: 0.5, chefIndex: 3, counterIndex: 0, isPreventable: true, reason: "Second spoilage batch — refrigerator issue" },
    { category: "cooking_error", ingIndex: 0, qty: 0.35, chefIndex: 4, counterIndex: 2, isPreventable: true, reason: "Burned on grill — distraction" },
  ];

  for (const e of todayEntries) {
    await insertWastage({ date: today, category: e.category, ingIndex: e.ingIndex, qty: e.qty, chefIndex: e.chefIndex, counterIndex: e.counterIndex, isPreventable: e.isPreventable, reason: e.reason });
  }

  const recoveryEntries = [
    { category: "overproduction", ingIndex: 0, qty: 0.4, chefIndex: 0, counterIndex: 2, isPreventable: false, reason: "Excess repurposed into staff meal", isRecovery: true },
    { category: "trim_waste", ingIndex: 2, qty: 0.2, chefIndex: 1, counterIndex: 1, isPreventable: false, reason: "Trim used for stock", isRecovery: true },
  ];
  for (const e of recoveryEntries) {
    await insertWastage({ date: today, category: e.category, ingIndex: e.ingIndex, qty: e.qty, chefIndex: e.chefIndex, counterIndex: e.counterIndex, isPreventable: e.isPreventable, reason: e.reason, isRecovery: true });
  }

  await pool.query(
    `INSERT INTO wastage_targets (tenant_id, outlet_id, period_type, target_amount, currency, effective_from, is_active, created_by)
     VALUES ($1, $2, 'daily', 2000, 'INR', $3, true, $4)
     ON CONFLICT DO NOTHING`,
    [tenantId, outletId, dateStr(30), managerId]
  );

  for (let d = 7; d >= 0; d--) {
    const summaryDate = dateStr(d);
    const { rows: logRows } = await pool.query(
      `SELECT total_cost, is_preventable, wastage_category, counter_id, counter_name, chef_id, chef_name
       FROM wastage_logs WHERE tenant_id = $1 AND wastage_date = $2 AND is_voided = false`,
      [tenantId, summaryDate]
    );
    if (logRows.length === 0) continue;

    const totalCost = logRows.reduce((s: number, r: any) => s + Number(r.total_cost), 0);
    const totalEntries = logRows.length;
    const preventable = logRows.filter((r: any) => r.is_preventable);
    const preventableCost = preventable.reduce((s: number, r: any) => s + Number(r.total_cost), 0);

    const catBreak: Record<string, { cost: number; count: number }> = {};
    const cntBreak: Record<string, { cost: number; count: number; name: string }> = {};
    const chefBreak: Record<string, { cost: number; count: number; name: string }> = {};

    for (const log of logRows) {
      const cat = log.wastage_category || "other";
      if (!catBreak[cat]) catBreak[cat] = { cost: 0, count: 0 };
      catBreak[cat].cost += Number(log.total_cost);
      catBreak[cat].count++;
      if (log.counter_id) {
        if (!cntBreak[log.counter_id]) cntBreak[log.counter_id] = { cost: 0, count: 0, name: log.counter_name };
        cntBreak[log.counter_id].cost += Number(log.total_cost);
        cntBreak[log.counter_id].count++;
      }
      if (log.chef_id) {
        if (!chefBreak[log.chef_id]) chefBreak[log.chef_id] = { cost: 0, count: 0, name: log.chef_name };
        chefBreak[log.chef_id].cost += Number(log.total_cost);
        chefBreak[log.chef_id].count++;
      }
    }

    await pool.query(
      `INSERT INTO wastage_daily_summary
         (tenant_id, outlet_id, summary_date, total_cost, total_entries, preventable_cost, preventable_entries,
          target_amount, category_breakdown, counter_breakdown, chef_breakdown)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (tenant_id, COALESCE(outlet_id, ''), summary_date) DO UPDATE SET
         total_cost = EXCLUDED.total_cost, total_entries = EXCLUDED.total_entries,
         preventable_cost = EXCLUDED.preventable_cost, preventable_entries = EXCLUDED.preventable_entries,
         target_amount = EXCLUDED.target_amount, category_breakdown = EXCLUDED.category_breakdown,
         counter_breakdown = EXCLUDED.counter_breakdown, chef_breakdown = EXCLUDED.chef_breakdown,
         updated_at = now()`,
      [
        tenantId, outletId, summaryDate,
        totalCost.toFixed(2), totalEntries,
        preventableCost.toFixed(2), preventable.length,
        2000,
        JSON.stringify(catBreak), JSON.stringify(cntBreak), JSON.stringify(chefBreak),
      ]
    );
  }

  console.log("Wastage tracking seed data added successfully!");
}

async function seedServiceCoordination(
  tenantId: string,
  outletId: string,
  waiterId: string,
  managerId: string,
  kitchenId: string
): Promise<void> {
  // Idempotency: check for coordination demo orders (QR_TABLE orders are coordination-seeded)
  // and rules separately — this allows re-seeding orders/messages even if rules already exist
  const existingCoordOrders = await pool.query(
    `SELECT id FROM orders WHERE tenant_id = $1 AND order_source = 'QR_TABLE' LIMIT 1`,
    [tenantId]
  );
  if (existingCoordOrders.rows.length > 0) {
    console.log("Service coordination demo data already seeded, skipping.");
    return;
  }

  console.log("Seeding service coordination data...");

  const allItems = await storage.getMenuItemsByTenant(tenantId);
  const menuItem1 = allItems[0];
  const menuItem2 = allItems[2];
  const menuItem3 = allItems[6];

  const now = Date.now();

  const makeOrder = async (params: {
    orderType: string;
    status: string;
    tableId?: string;
    orderSource?: string;
    priority?: number;
    section?: string;
    covers?: number;
    specialInstructions?: string;
    allergies?: string;
    vipNotes?: string;
    promisedTime?: Date;
    firstItemReadyAt?: Date;
    fullyReadyAt?: Date;
    servedAt?: Date;
    paidAt?: Date;
    paymentStatus?: string;
    waiterName?: string;
    createdAtOffset?: number;
    customerName?: string;
    customerPhone?: string;
    channel?: string;
    channelOrderId?: string;
  }) => {
    const sub = (Number(menuItem1?.price || 10) + Number(menuItem2?.price || 12)).toFixed(2);
    const tax = (Number(sub) * 0.085).toFixed(2);
    const total = (Number(sub) + Number(tax)).toFixed(2);

    const { rows } = await pool.query(
      `INSERT INTO orders
       (id, tenant_id, outlet_id, table_id, waiter_id, order_type, status,
        order_source, priority, section, covers, special_instructions, allergies,
        vip_notes, promised_time, first_item_ready_at, fully_ready_at, served_at,
        paid_at, payment_status, waiter_name, subtotal, tax, total, created_at,
        channel, channel_order_id, notes)
       VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17,
         $18, $19, $20, $21, $22, $23,
         $24 - ($25 * interval '1 minute'),
         $26, $27, $28
       )
       RETURNING *`,
      [
        tenantId, outletId, params.tableId || null, waiterId, params.orderType, params.status,
        params.orderSource || "POS", params.priority ?? 2, params.section || null,
        params.covers ?? 2, params.specialInstructions || null, params.allergies || null,
        params.vipNotes || null, params.promisedTime || null, params.firstItemReadyAt || null,
        params.fullyReadyAt || null, params.servedAt || null,
        params.paidAt || null, params.paymentStatus || "pending", params.waiterName || "Sam Chen",
        sub, tax, total, new Date(),
        params.createdAtOffset ?? 0,
        params.channel || null, params.channelOrderId || null,
        params.customerName ? `Customer: ${params.customerName}${params.customerPhone ? ` (${params.customerPhone})` : ""}` : null,
      ]
    );
    return rows[0];
  };

  const addItems = async (orderId: string, statuses: string[]) => {
    const itemDefs = [menuItem1, menuItem2, menuItem3].filter(Boolean);
    for (let i = 0; i < Math.min(statuses.length, itemDefs.length); i++) {
      const item = itemDefs[i];
      if (!item) continue;
      await pool.query(
        `INSERT INTO order_items (id, order_id, menu_item_id, name, quantity, price, status)
         VALUES (gen_random_uuid(), $1, $2, $3, 1, $4, $5)`,
        [orderId, item.id, item.name, item.price, statuses[i]]
      );
    }
  };

  const tables = await pool.query(
    `SELECT id FROM tables WHERE tenant_id = $1 LIMIT 10`,
    [tenantId]
  );
  const tableIds = tables.rows.map((t: any) => t.id);

  const dineIn1 = await makeOrder({ orderType: "dine_in", status: "new", tableId: tableIds[0], orderSource: "QR_TABLE", section: "Main Hall", covers: 2, createdAtOffset: 5 });
  await addItems(dineIn1.id, ["pending", "pending"]);

  const dineIn2 = await makeOrder({ orderType: "dine_in", status: "in_progress", tableId: tableIds[1], orderSource: "POS", section: "Patio", covers: 4, createdAtOffset: 18, specialInstructions: "No onions please" });
  await addItems(dineIn2.id, ["in_preparation", "pending"]);

  const dineIn3 = await makeOrder({ orderType: "dine_in", status: "in_progress", tableId: tableIds[2], orderSource: "POS", section: "Main Hall", covers: 3, createdAtOffset: 25 });
  await addItems(dineIn3.id, ["ready", "in_preparation"]);

  const dineIn4 = await makeOrder({ orderType: "dine_in", status: "ready", tableId: tableIds[3], orderSource: "QR_TABLE", covers: 2, firstItemReadyAt: new Date(now - 8 * 60000), fullyReadyAt: new Date(now - 6 * 60000), createdAtOffset: 35 });
  await addItems(dineIn4.id, ["ready", "ready"]);

  const dineIn5 = await makeOrder({ orderType: "dine_in", status: "served", tableId: tableIds[4], orderSource: "POS", covers: 6, firstItemReadyAt: new Date(now - 40 * 60000), fullyReadyAt: new Date(now - 38 * 60000), servedAt: new Date(now - 35 * 60000), createdAtOffset: 60 });
  await addItems(dineIn5.id, ["served", "served"]);

  const takeaway1 = await makeOrder({ orderType: "takeaway", status: "ready", orderSource: "KIOSK", customerName: "Alice Wong", customerPhone: "+1-555-0101", createdAtOffset: 20, firstItemReadyAt: new Date(now - 5 * 60000), fullyReadyAt: new Date(now - 3 * 60000) });
  await addItems(takeaway1.id, ["ready"]);

  const takeaway2 = await makeOrder({ orderType: "takeaway", status: "sent_to_kitchen", orderSource: "PHONE", customerName: "Bob Singh", customerPhone: "+1-555-0102", createdAtOffset: 12 });
  await addItems(takeaway2.id, ["in_preparation"]);

  const takeaway3 = await makeOrder({ orderType: "takeaway", status: "in_progress", orderSource: "WALK_IN", customerName: "Carol Diaz", customerPhone: "+1-555-0103", createdAtOffset: 8 });
  await addItems(takeaway3.id, ["pending", "in_preparation"]);

  const delivery1 = await makeOrder({ orderType: "delivery", status: "new", orderSource: "ONLINE_DELIVERY", channel: "Zomato", channelOrderId: "ZMT-10023", customerName: "David Park", customerPhone: "+1-555-0201", createdAtOffset: 10, promisedTime: new Date(now + 30 * 60000) });
  await addItems(delivery1.id, ["pending"]);

  const delivery2 = await makeOrder({ orderType: "delivery", status: "in_progress", orderSource: "PHONE", customerName: "Eva Martinez", customerPhone: "+1-555-0202", createdAtOffset: 20, promisedTime: new Date(now + 15 * 60000) });
  await addItems(delivery2.id, ["in_preparation"]);

  const delivery3 = await makeOrder({ orderType: "delivery", status: "in_progress", orderSource: "ONLINE_DELIVERY", channel: "Zomato", channelOrderId: "ZMT-10024", customerName: "Frank Liu", customerPhone: "+1-555-0203", createdAtOffset: 30, promisedTime: new Date(now + 8 * 60000) });
  await addItems(delivery3.id, ["in_preparation", "pending"]);

  const delivery4 = await makeOrder({ orderType: "delivery", status: "ready", orderSource: "POS", customerName: "Grace Kim", customerPhone: "+1-555-0204", createdAtOffset: 45, firstItemReadyAt: new Date(now - 10 * 60000), fullyReadyAt: new Date(now - 8 * 60000) });
  await addItems(delivery4.id, ["ready"]);

  const advance1 = await makeOrder({ orderType: "dine_in", status: "new", orderSource: "ADVANCE", tableId: tableIds[5], customerName: "Henry Brown", customerPhone: "+1-555-0301", covers: 4, promisedTime: new Date(now + 2 * 3600000), createdAtOffset: 3 });
  await addItems(advance1.id, ["pending"]);

  const advance2 = await makeOrder({ orderType: "dine_in", status: "new", orderSource: "ADVANCE", tableId: tableIds[6], customerName: "Isabella Clark", customerPhone: "+1-555-0302", covers: 6, promisedTime: new Date(now + 2.5 * 3600000), createdAtOffset: 5, specialInstructions: "Birthday celebration, please prepare table" });
  await addItems(advance2.id, ["pending"]);

  const vipOrder = await makeOrder({ orderType: "dine_in", status: "in_progress", tableId: tableIds[7], orderSource: "POS", priority: 4, section: "Private", covers: 2, vipNotes: "Corporate client — top priority", waiterName: "Sam Chen", createdAtOffset: 15 });
  await addItems(vipOrder.id, ["in_preparation", "in_preparation"]);

  await pool.query(
    `INSERT INTO vip_order_flags (tenant_id, order_id, vip_level, special_notes, special_setup, manager_notified, flagged_by)
     VALUES ($1, $2, 'CORPORATE', $3, 'Premium table setup with flowers', true, $4)`,
    [tenantId, vipOrder.id, "Corporate client — priority seating required", managerId]
  );

  const alertOrder1 = await makeOrder({ orderType: "dine_in", status: "in_progress", tableId: tableIds[8], orderSource: "POS", covers: 3, createdAtOffset: 35, firstItemReadyAt: new Date(now - 25 * 60000) });
  await addItems(alertOrder1.id, ["ready", "ready"]);

  const alertOrder2 = await makeOrder({ orderType: "delivery", status: "in_progress", orderSource: "ONLINE_DELIVERY", customerName: "Jake Wilson", customerPhone: "+1-555-0401", createdAtOffset: 45, promisedTime: new Date(now + 5 * 60000) });
  await addItems(alertOrder2.id, ["in_preparation"]);

  const paid1 = await makeOrder({ orderType: "dine_in", status: "paid", tableId: tableIds[9], orderSource: "POS", covers: 2, createdAtOffset: 90, servedAt: new Date(now - 20 * 60000), paidAt: new Date(now - 10 * 60000), paymentStatus: "paid" });
  await addItems(paid1.id, ["served"]);

  const paid2 = await makeOrder({ orderType: "takeaway", status: "paid", orderSource: "KIOSK", customerName: "Laura Patel", createdAtOffset: 75, paidAt: new Date(now - 5 * 60000), paymentStatus: "paid" });
  await addItems(paid2.id, ["served"]);

  const paid3 = await makeOrder({ orderType: "delivery", status: "paid", orderSource: "ONLINE_DELIVERY", customerName: "Mike Torres", createdAtOffset: 120, paidAt: new Date(now - 15 * 60000), paymentStatus: "paid" });
  await addItems(paid3.id, ["served"]);

  const rules = [
    {
      ruleName: "Order Age Exceeds 20min in Preparation",
      triggerEvent: "order_age_exceeds",
      conditionJson: { threshold_minutes: 20, status: "in_progress" },
      action: "notify_coordinator",
      messageTemplate: "Order #{{orderNumber}} has been in preparation for {{minutes}} minutes. Please check status.",
      isActive: true,
    },
    {
      ruleName: "Item Ready Unserved for 5min",
      triggerEvent: "item_ready_unserved",
      conditionJson: { threshold_minutes: 5 },
      action: "notify_waiter",
      messageTemplate: "Order #{{orderNumber}} is ready and has not been served for {{minutes}} minutes.",
      isActive: true,
    },
    {
      ruleName: "VIP Order Delayed 5min",
      triggerEvent: "vip_order_delayed",
      conditionJson: { threshold_minutes: 5 },
      action: "notify_manager_urgent",
      messageTemplate: "URGENT: VIP Order #{{orderNumber}} has been waiting for {{minutes}} minutes.",
      isActive: true,
    },
    {
      ruleName: "Order Stuck in Served State 30min",
      triggerEvent: "order_status_stuck",
      conditionJson: { threshold_minutes: 30, status: "served" },
      action: "prompt_coordinator",
      messageTemplate: "Order #{{orderNumber}} has been in '{{status}}' state for {{minutes}} minutes. Please close the order.",
      isActive: true,
    },
    {
      ruleName: "Kitchen Overload — More than 15 Active Tickets",
      triggerEvent: "active_kitchen_tickets_exceed",
      conditionJson: { threshold: 15 },
      action: "notify_manager_urgent",
      messageTemplate: "Kitchen is overloaded with {{count}} active tickets (threshold: {{threshold}}). Immediate attention required.",
      isActive: true,
    },
    {
      ruleName: "Delivery Time at Risk — Less than 10min Remaining",
      triggerEvent: "delivery_time_at_risk",
      conditionJson: { threshold_minutes: 10 },
      action: "notify_coordinator",
      messageTemplate: "Delivery Order #{{orderNumber}} is at risk — only {{minutes}} minutes until promised time.",
      isActive: false,
    },
    {
      ruleName: "Order Age Exceeds 45min Any Status",
      triggerEvent: "order_age_exceeds",
      conditionJson: { threshold_minutes: 45, status: "any" },
      action: "notify_manager_urgent",
      messageTemplate: "Order #{{orderNumber}} is {{minutes}} minutes old. Please investigate.",
      isActive: false,
    },
    {
      ruleName: "Order Paid Status Confirmation",
      triggerEvent: "order_status_stuck",
      conditionJson: { threshold_minutes: 5, status: "paid" },
      action: "notify_coordinator",
      messageTemplate: "Order #{{orderNumber}} marked paid — please ensure table has been cleared.",
      isActive: false,
    },
  ];

  for (const rule of rules) {
    await pool.query(
      `INSERT INTO coordination_rules (tenant_id, rule_name, trigger_event, condition_json, action, message_template, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [
        tenantId,
        rule.ruleName,
        rule.triggerEvent,
        JSON.stringify(rule.conditionJson),
        rule.action,
        rule.messageTemplate,
        rule.isActive,
      ]
    );
  }

  const messages: Array<{ fromId: string; fromName: string; fromRole: string; toRole?: string; toId?: string; msg: string; type: string; priority: string; orderId: string | null }> = [
    { fromId: kitchenId, fromName: "Pat Garcia", fromRole: "kitchen", toRole: "waiter", msg: "Table 3 order ready — please pick up", type: "TABLE_READY", priority: "high", orderId: dineIn4.id },
    { fromId: managerId, fromName: "Jordan Rivera", fromRole: "manager", toRole: "waiter", msg: "VIP guest at table 8 — ensure premium service", type: "VIP_ALERT", priority: "urgent", orderId: vipOrder.id },
    { fromId: kitchenId, fromName: "Pat Garcia", fromRole: "kitchen", toRole: "waiter", msg: "Salmon is running low — suggest alternatives for table 2", type: "KITCHEN_NOTE", priority: "normal", orderId: null },
    { fromId: waiterId, fromName: "Sam Chen", fromRole: "waiter", toRole: "manager", msg: "Customer at table 5 complained about slow service", type: "GENERAL", priority: "normal", orderId: dineIn5.id },
    { fromId: managerId, fromName: "Jordan Rivera", fromRole: "manager", toRole: "kitchen", msg: "Rush hour starting — please prioritize takeaway orders", type: "ORDER_UPDATE", priority: "high", orderId: null },
    { fromId: kitchenId, fromName: "Pat Garcia", fromRole: "kitchen", toRole: "manager", msg: "Grill station is behind by 10 minutes — requesting assistance", type: "DELAY_ALERT", priority: "high", orderId: null },
    { fromId: waiterId, fromName: "Sam Chen", fromRole: "waiter", toRole: "kitchen", msg: "Table 1 has nut allergy — please double-check Bruschetta preparation", type: "SPECIAL_REQUEST", priority: "urgent", orderId: dineIn1.id },
    { fromId: managerId, fromName: "Jordan Rivera", fromRole: "manager", toId: waiterId, toRole: "waiter", msg: "Please ensure Zomato delivery #ZMT-10023 is ready on time", type: "DELIVERY_UPDATE", priority: "normal", orderId: delivery1.id },
    { fromId: kitchenId, fromName: "Pat Garcia", fromRole: "kitchen", toRole: "waiter", msg: "Table 4 main courses ready", type: "TABLE_READY", priority: "normal", orderId: dineIn3.id },
    { fromId: waiterId, fromName: "Sam Chen", fromRole: "waiter", toRole: "manager", msg: "Advance booking for Henry Brown confirmed for 2 hours — table setup needed", type: "GENERAL", priority: "low", orderId: advance1.id },
  ];

  for (const m of messages) {
    await pool.query(
      `INSERT INTO service_messages
       (tenant_id, outlet_id, order_id, from_staff_id, from_name, from_role, to_staff_id, to_role, message, message_type, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        tenantId,
        outletId,
        m.orderId || null,
        m.fromId,
        m.fromName,
        m.fromRole,
        m.toId || null,
        m.toRole || null,
        m.msg,
        m.type,
        m.priority,
      ]
    );
  }

  console.log("Service coordination seed data added successfully!");
}

async function seedFoodModifications(tenantId: string): Promise<void> {
  const existing = await pool.query(
    `SELECT COUNT(*) AS cnt FROM order_item_modifications WHERE tenant_id = $1`,
    [tenantId]
  );
  if (parseInt(existing.rows[0].cnt) > 0) return;

  const { rows: orderItems } = await pool.query(
    `SELECT oi.id, oi.name, o.id AS order_id
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.tenant_id = $1
     ORDER BY oi.id
     LIMIT 10`,
    [tenantId]
  );

  if (orderItems.length < 3) return;

  const [item1, item2, item3] = orderItems;

  const { rows: orderItemOrders } = await pool.query(
    `SELECT oi.id AS order_item_id, oi.order_id
     FROM order_items oi WHERE oi.id = ANY($1::varchar[])`,
    [[item1.id, item2.id, item3.id]]
  );
  const orderIdByItem: Record<string, string> = {};
  for (const r of orderItemOrders) orderIdByItem[r.order_item_id] = r.order_id;

  await pool.query(
    `INSERT INTO order_item_modifications
       (tenant_id, order_item_id, order_id, has_allergy, allergy_flags, allergy_details, spice_level, salt_level, removed_ingredients, special_notes)
     VALUES ($1, $2, $3, true, $4, $5, 'MILD', 'LESS', '{}', $6)
     ON CONFLICT (order_item_id) DO NOTHING`,
    [tenantId, item1.id, orderIdByItem[item1.id] ?? null, ["nut_allergy", "cross_contamination"], "Guest has severe nut allergy — please verify no cross-contamination", "Please plate separately from other items"]
  );

  await pool.query(
    `INSERT INTO order_item_modifications
       (tenant_id, order_item_id, order_id, has_allergy, allergy_flags, allergy_details, spice_level, salt_level, removed_ingredients, special_notes)
     VALUES ($1, $2, $3, false, '{}', null, 'SPICY', 'NORMAL', $4, null)
     ON CONFLICT (order_item_id) DO NOTHING`,
    [tenantId, item2.id, orderIdByItem[item2.id] ?? null, ["onions", "garlic", "mushrooms"]]
  );

  await pool.query(
    `INSERT INTO order_item_modifications
       (tenant_id, order_item_id, order_id, has_allergy, allergy_flags, allergy_details, spice_level, salt_level, removed_ingredients, special_notes)
     VALUES ($1, $2, $3, false, '{}', null, null, null, '{}', $4)
     ON CONFLICT (order_item_id) DO NOTHING`,
    [tenantId, item3.id, orderIdByItem[item3.id] ?? null, "No sauce please, dressing on the side. Extra napkins requested."]
  );

  const { rows: menuItems } = await pool.query(
    `SELECT id, name FROM menu_items WHERE tenant_id = $1 LIMIT 3`,
    [tenantId]
  );

  for (const mi of menuItems) {
    const components = [
      { name: "onions", removable: true, sort: 1 },
      { name: "garlic", removable: true, sort: 2 },
      { name: "chili", removable: true, sort: 3 },
      { name: "salt", removable: false, sort: 4 },
    ];
    for (const comp of components) {
      await pool.query(
        `INSERT INTO recipe_components (tenant_id, menu_item_id, ingredient_name, is_removable, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [tenantId, mi.id, comp.name, comp.removable, comp.sort]
      );
    }
  }

  console.log("Food modification seed data added successfully!");
}

export async function seedPricingData(): Promise<void> {
  const { rows: tenantRows } = await pool.query(
    `SELECT t.id FROM tenants t
     WHERE t.slug != 'platform' AND t.active = true
     AND EXISTS (SELECT 1 FROM menu_items mi WHERE mi.tenant_id = t.id)
     LIMIT 1`
  );
  if (tenantRows.length === 0) return;
  const tenantId = tenantRows[0].id;

  const { rows: existingRules } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM outlet_menu_prices WHERE tenant_id = $1`,
    [tenantId]
  );
  if (Number(existingRules[0].cnt) > 0) return;

  console.log("[Pricing] Seeding multi-outlet pricing data...");

  const { rows: outletRows } = await pool.query(
    `SELECT id, name FROM outlets WHERE tenant_id = $1 AND active = true ORDER BY id LIMIT 4`,
    [tenantId]
  );
  if (outletRows.length === 0) return;

  const { rows: menuItemRows } = await pool.query(
    `SELECT id, name, price FROM menu_items WHERE tenant_id = $1 ORDER BY name LIMIT 20`,
    [tenantId]
  );
  if (menuItemRows.length === 0) return;

  const outlets = outletRows;
  const menuItems = menuItemRows;

  const outletMultipliers: number[] = [1.0, 1.1, 1.15, 0.95];

  for (let oi = 0; oi < outlets.length; oi++) {
    const outlet = outlets[oi];
    const multiplier = outletMultipliers[oi] ?? 1.0;

    for (const mi of menuItems) {
      const outletBasePrice = Math.round(Number(mi.price) * multiplier * 100) / 100;
      const alreadyExists = await pool.query(
        `SELECT 1 FROM outlet_menu_prices WHERE tenant_id=$1 AND outlet_id=$2 AND menu_item_id=$3 AND price_type='OUTLET_BASE'`,
        [tenantId, outlet.id, mi.id]
      );
      if (alreadyExists.rows.length === 0) {
        await pool.query(
          `INSERT INTO outlet_menu_prices
           (tenant_id, outlet_id, menu_item_id, price_type, price, currency, priority, is_active, notes, created_by)
           VALUES ($1,$2,$3,'OUTLET_BASE',$4,'USD',2,true,$5,'system')`,
          [tenantId, outlet.id, mi.id, outletBasePrice.toFixed(2), `Base price for ${outlet.name}`]
        );
      }
    }

    const deliveryExists = await pool.query(
      `SELECT 1 FROM outlet_menu_prices WHERE tenant_id=$1 AND outlet_id=$2 AND menu_item_id=$3 AND price_type='ORDER_TYPE' AND order_type='DELIVERY'`,
      [tenantId, outlet.id, menuItems[0].id]
    );
    if (deliveryExists.rows.length === 0) {
      const deliveryPrice = Math.round(Number(menuItems[0].price) * multiplier * 1.1 * 100) / 100;
      await pool.query(
        `INSERT INTO outlet_menu_prices
         (tenant_id, outlet_id, menu_item_id, price_type, price, currency, order_type, priority, is_active, notes, created_by)
         VALUES ($1,$2,$3,'ORDER_TYPE',$4,'USD','DELIVERY',3,true,'Delivery surcharge','system')`,
        [tenantId, outlet.id, menuItems[0].id, deliveryPrice.toFixed(2)]
      );
    }

    if (menuItems.length > 1) {
      const lunchExists = await pool.query(
        `SELECT 1 FROM outlet_menu_prices WHERE tenant_id=$1 AND outlet_id=$2 AND menu_item_id=$3 AND price_type='TIME_SLOT'`,
        [tenantId, outlet.id, menuItems[1].id]
      );
      if (lunchExists.rows.length === 0) {
        const lunchPrice = Math.round(Number(menuItems[1].price) * multiplier * 0.85 * 100) / 100;
        await pool.query(
          `INSERT INTO outlet_menu_prices
           (tenant_id, outlet_id, menu_item_id, price_type, price, currency,
            time_slot_start, time_slot_end, priority, is_active, notes, created_by)
           VALUES ($1,$2,$3,'TIME_SLOT',$4,'USD','12:00','15:00',5,true,'Lunch Special discount','system')`,
          [tenantId, outlet.id, menuItems[1].id, lunchPrice.toFixed(2)]
        );
      }
    }

    if (menuItems.length > 2) {
      const loyaltyExists = await pool.query(
        `SELECT 1 FROM outlet_menu_prices WHERE tenant_id=$1 AND outlet_id=$2 AND menu_item_id=$3 AND price_type='CUSTOMER_SEGMENT' AND customer_segment='LOYALTY'`,
        [tenantId, outlet.id, menuItems[2].id]
      );
      if (loyaltyExists.rows.length === 0) {
        const loyaltyPrice = Math.round(Number(menuItems[2].price) * multiplier * 0.9 * 100) / 100;
        await pool.query(
          `INSERT INTO outlet_menu_prices
           (tenant_id, outlet_id, menu_item_id, price_type, price, currency,
            customer_segment, priority, is_active, notes, created_by)
           VALUES ($1,$2,$3,'CUSTOMER_SEGMENT',$4,'USD','LOYALTY',8,true,'Loyalty member price','system')`,
          [tenantId, outlet.id, menuItems[2].id, loyaltyPrice.toFixed(2)]
        );
      }
    }
  }

  if (outlets.length > 0 && menuItems.length > 3) {
    const weekendItem = menuItems[3];
    for (const outlet of outlets) {
      const eventExists = await pool.query(
        `SELECT 1 FROM outlet_menu_prices WHERE tenant_id=$1 AND outlet_id=$2 AND menu_item_id=$3 AND price_type='EVENT'`,
        [tenantId, outlet.id, weekendItem.id]
      );
      if (eventExists.rows.length === 0) {
        const eventPrice = Math.round(Number(weekendItem.price) * 1.15 * 100) / 100;
        await pool.query(
          `INSERT INTO outlet_menu_prices
           (tenant_id, outlet_id, menu_item_id, price_type, price, currency,
            day_of_week, priority, is_active, notes, created_by,
            valid_from, valid_until)
           VALUES ($1,$2,$3,'EVENT',$4,'USD','[6,7]'::jsonb,10,true,'Weekend Festival +15%','system',
            CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days')`,
          [tenantId, outlet.id, weekendItem.id, eventPrice.toFixed(2)]
        );
      }
    }
  }

  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const mi = menuItems[i % menuItems.length];
    const outlet = outlets[i % outlets.length];
    const baseP = Number(mi.price);
    const resolvedP = Math.round(baseP * (0.85 + Math.random() * 0.3) * 100) / 100;
    const hoursAgo = Math.floor(Math.random() * 72);
    const resolvedAt = new Date(now.getTime() - hoursAgo * 3600000);

    await pool.query(
      `INSERT INTO price_resolution_log
       (tenant_id, outlet_id, menu_item_id, menu_item_name, base_price, resolved_price,
        price_type_applied, resolution_reason, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        tenantId, outlet.id, mi.id, mi.name,
        baseP.toFixed(2), resolvedP.toFixed(2),
        ["OUTLET_BASE","TIME_SLOT","CUSTOMER_SEGMENT","ORDER_TYPE","GLOBAL_BASE"][i % 5],
        "Seed resolution entry",
        resolvedAt,
      ]
    );
  }

  console.log("[Pricing] Pricing seed data complete.");
}

async function seedSelectiveCookingData(
  tenantId: string,
  outletId: string,
  chefId: string,
  waiterId: string,
): Promise<void> {
  const existing = await pool.query(
    `SELECT COUNT(*) AS cnt FROM order_courses WHERE tenant_id = $1`,
    [tenantId]
  );
  if (parseInt(existing.rows[0].cnt) > 0) {
    console.log("[SelectiveCooking] Seed data already exists, skipping.");
    return;
  }

  console.log("[SelectiveCooking] Seeding selective cooking demo data...");

  const { rows: menuRows } = await pool.query(
    `SELECT id, name, price FROM menu_items WHERE tenant_id = $1 LIMIT 10`,
    [tenantId]
  );
  if (menuRows.length < 4) {
    console.log("[SelectiveCooking] Not enough menu items to seed, skipping.");
    return;
  }

  const now = new Date();
  const makeOrderId = () => require("crypto").randomUUID();

  // Helper to create an order and items via pool
  async function createSeedOrder(label: string, items: Array<{
    name: string; price: string; station: string; cookingStatus: string;
    itemPrepMinutes: number; courseNumber: number;
    suggestedStartAt?: Date; actualStartAt?: Date; estimatedReadyAt?: Date; actualReadyAt?: Date;
    holdReason?: string; holdUntilItemId?: string;
  }>) {
    const orderId = makeOrderId();
    await pool.query(
      `INSERT INTO orders (id, tenant_id, outlet_id, order_type, status, order_number)
       VALUES ($1,$2,$3,'dine_in','in_progress',$4)
       ON CONFLICT (id) DO NOTHING`,
      [orderId, tenantId, outletId, `SEED-SC-${label}`]
    );

    const itemIds: string[] = [];
    for (const item of items) {
      const itemId = makeOrderId();
      itemIds.push(itemId);
      await pool.query(
        `INSERT INTO order_items
         (id, order_id, name, price, status, station, cooking_status, item_prep_minutes, course_number,
          suggested_start_at, actual_start_at, estimated_ready_at, actual_ready_at,
          hold_reason, hold_until_item_id, started_by_id, started_by_name)
         VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO NOTHING`,
        [
          itemId, orderId, item.name, item.price, item.station,
          item.cookingStatus, item.itemPrepMinutes, item.courseNumber,
          item.suggestedStartAt || null,
          item.actualStartAt || null,
          item.estimatedReadyAt || null,
          item.actualReadyAt || null,
          item.holdReason || null,
          item.holdUntilItemId || null,
          item.actualStartAt ? chefId : null,
          item.actualStartAt ? "Pat Garcia" : null,
        ]
      );
    }
    return { orderId, itemIds };
  }

  // Order 1: Mixed states — queued/started/ready/hold
  const m0 = menuRows[0];
  const m1 = menuRows[1];
  const m2 = menuRows[2];
  const m3 = menuRows[3];

  const startedAt1 = new Date(now.getTime() - 8 * 60000);
  const estReady1 = new Date(startedAt1.getTime() + 15 * 60000);

  await createSeedOrder("O1", [
    { name: m0.name, price: m0.price, station: "grill", cookingStatus: "queued", itemPrepMinutes: 15, courseNumber: 1, suggestedStartAt: new Date(now.getTime() + 2 * 60000) },
    { name: m1.name, price: m1.price, station: "cold", cookingStatus: "started", itemPrepMinutes: 10, courseNumber: 1, actualStartAt: startedAt1, estimatedReadyAt: estReady1 },
    { name: m2.name, price: m2.price, station: "grill", cookingStatus: "ready", itemPrepMinutes: 12, courseNumber: 1, actualStartAt: new Date(now.getTime() - 15 * 60000), actualReadyAt: new Date(now.getTime() - 2 * 60000) },
    { name: m3.name, price: m3.price, station: "bar",   cookingStatus: "hold",  itemPrepMinutes: 5,  courseNumber: 1, holdReason: "Auto-held: start when food is ready" },
  ]);

  // Order 2: Course-based — course 1 served, course 2 fired
  if (menuRows.length >= 5) {
    const m4 = menuRows[4 % menuRows.length];
    const { orderId: o2Id, itemIds: o2Items } = await createSeedOrder("O2", [
      { name: m0.name, price: m0.price, station: "cold", cookingStatus: "served", itemPrepMinutes: 8, courseNumber: 1, actualStartAt: new Date(now.getTime() - 30 * 60000), actualReadyAt: new Date(now.getTime() - 15 * 60000) },
      { name: m1.name, price: m1.price, station: "grill", cookingStatus: "started", itemPrepMinutes: 20, courseNumber: 2, actualStartAt: new Date(now.getTime() - 5 * 60000), estimatedReadyAt: new Date(now.getTime() + 15 * 60000) },
      { name: m4.name, price: m4.price, station: "cold", cookingStatus: "queued", itemPrepMinutes: 10, courseNumber: 2 },
    ]);
    await pool.query(
      `INSERT INTO order_courses (tenant_id, order_id, course_number, course_name, status, fire_at, fired_by, fired_by_name)
       VALUES ($1,$2,1,'Starters','served',$3,$4,'Pat Garcia'),
              ($1,$2,2,'Mains','cooking',$5,$4,'Pat Garcia')
       ON CONFLICT DO NOTHING`,
      [tenantId, o2Id, new Date(now.getTime() - 30 * 60000), chefId, new Date(now.getTime() - 5 * 60000)]
    );
  }

  // Order 3: 1 item on HOLD (waiting for another), 2 started, 1 queued
  const { orderId: o3Id, itemIds: o3Items } = await createSeedOrder("O3", [
    { name: m0.name, price: m0.price, station: "grill", cookingStatus: "started", itemPrepMinutes: 18, courseNumber: 1, actualStartAt: new Date(now.getTime() - 3 * 60000), estimatedReadyAt: new Date(now.getTime() + 15 * 60000) },
    { name: m1.name, price: m1.price, station: "grill", cookingStatus: "started", itemPrepMinutes: 18, courseNumber: 1, actualStartAt: new Date(now.getTime() - 3 * 60000), estimatedReadyAt: new Date(now.getTime() + 15 * 60000) },
    { name: m2.name, price: m2.price, station: "cold",  cookingStatus: "queued",  itemPrepMinutes: 5, courseNumber: 1 },
    { name: m3.name, price: m3.price, station: "bar",   cookingStatus: "hold",   itemPrepMinutes: 5, courseNumber: 1, holdReason: "Waiting for grilled chicken to be ready" },
  ]);
  // Update the hold item to reference the first item
  if (o3Items.length >= 4) {
    await pool.query(
      `UPDATE order_items SET hold_until_item_id=$1 WHERE id=$2`,
      [o3Items[0], o3Items[3]]
    );
  }

  // Order 4: Rush triggered — all started
  const rushAt = new Date(now.getTime() - 2 * 60000);
  await createSeedOrder("O4", [
    { name: m0.name, price: m0.price, station: "grill", cookingStatus: "started", itemPrepMinutes: 15, courseNumber: 1, actualStartAt: rushAt, estimatedReadyAt: new Date(rushAt.getTime() + 15 * 60000) },
    { name: m1.name, price: m1.price, station: "cold",  cookingStatus: "started", itemPrepMinutes: 10, courseNumber: 1, actualStartAt: rushAt, estimatedReadyAt: new Date(rushAt.getTime() + 10 * 60000) },
    { name: m2.name, price: m2.price, station: "grill", cookingStatus: "started", itemPrepMinutes: 20, courseNumber: 1, actualStartAt: rushAt, estimatedReadyAt: new Date(rushAt.getTime() + 20 * 60000) },
  ]);

  // Order 5: All items ready, waiting for waiter
  const readyAt5 = new Date(now.getTime() - 3 * 60000);
  await pool.query(
    `INSERT INTO orders (id, tenant_id, outlet_id, order_type, status, order_number)
     SELECT gen_random_uuid()::text,$1,$2,'dine_in','ready','SEED-SC-O5'
     WHERE NOT EXISTS (SELECT 1 FROM orders WHERE tenant_id=$1 AND order_number='SEED-SC-O5')`,
    [tenantId, outletId]
  );
  const { rows: o5Rows } = await pool.query(
    `SELECT id FROM orders WHERE tenant_id=$1 AND order_number='SEED-SC-O5' LIMIT 1`,
    [tenantId]
  );
  if (o5Rows.length > 0) {
    const o5Id = o5Rows[0].id;
    for (const mi of [m0, m1, m2].slice(0, 3)) {
      await pool.query(
        `INSERT INTO order_items (id, order_id, name, price, status, station, cooking_status, item_prep_minutes, course_number, actual_start_at, actual_ready_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3,'ready','grill','ready',$4,1,$5,$6)`,
        [o5Id, mi.name, mi.price, 12, new Date(now.getTime() - 15 * 60000), readyAt5]
      );
    }
  }

  console.log("[SelectiveCooking] Selective cooking seed data complete.");
}

export async function seedTimeTrackingData(): Promise<void> {
  const existingCheck = await pool.query(`SELECT 1 FROM item_time_logs LIMIT 1`);
  if (existingCheck.rows.length > 0) return;

  const { rows: tenantRows } = await pool.query(`
    SELECT t.id FROM tenants t
    JOIN menu_items mi ON mi.tenant_id = t.id
    JOIN outlets o ON o.tenant_id = t.id
    WHERE t.slug != 'platform'
    GROUP BY t.id
    HAVING COUNT(DISTINCT mi.id) > 0
    ORDER BY COUNT(DISTINCT mi.id) DESC
    LIMIT 1
  `);
  if (tenantRows.length === 0) return;
  const tenant = await storage.getTenant(tenantRows[0].id);
  if (!tenant) return;

  const outlets = await storage.getOutletsByTenant(tenant.id);
  const outlet = outlets[0];
  if (!outlet) return;

  const menuItems = await storage.getMenuItemsByTenant(tenant.id);
  if (menuItems.length === 0) return;

  console.log("[TimeTracking] Seeding time tracking demo data...");

  await pool.query(
    `INSERT INTO time_performance_targets
       (tenant_id, outlet_id, order_type, target_name, waiter_response_target, kitchen_pickup_target, total_kitchen_target, total_cycle_target, alert_at_percent)
     VALUES ($1,$2,'ALL','Default Targets',120,60,900,1500,80)
     ON CONFLICT DO NOTHING`,
    [tenant.id, outlet.id]
  );

  const chefProfiles = [
    { name: "Ravi Kumar", style: "fast", multiplier: 0.75 },
    { name: "Anita Sharma", style: "consistent", multiplier: 0.95 },
    { name: "Priya Patel", style: "slow", multiplier: 1.35 },
    { name: "Mohammed Ali", style: "consistent", multiplier: 1.0 },
    { name: "Sunita Das", style: "fast", multiplier: 0.85 },
  ];

  const shiftTypes = ["morning", "afternoon", "evening"];

  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const shiftDate = new Date(Date.now() - dayOffset * 86400000).toISOString().slice(0, 10);
    const ordersForDay = dayOffset === 0 ? 12 : 12;

    for (let orderIdx = 0; orderIdx < ordersForDay; orderIdx++) {
      const chef = chefProfiles[orderIdx % chefProfiles.length];
      const menuItem = menuItems[orderIdx % menuItems.length];
      const shiftType = shiftTypes[orderIdx % shiftTypes.length];
      const orderHour = 10 + (orderIdx % 12);

      const orderReceivedAt = new Date(`${shiftDate}T${String(orderHour).padStart(2, "0")}:${String(orderIdx * 5 % 60).padStart(2, "0")}:00Z`);
      const kotSentAt = new Date(orderReceivedAt.getTime() + (30 + Math.random() * 60) * 1000);
      const ticketAcknowledgedAt = new Date(kotSentAt.getTime() + (20 + Math.random() * 40) * 1000);

      const basePrepSec = (menuItem.prepTimeMinutes || 15) * 60;
      const variance = (0.7 + Math.random() * 0.8) * chef.multiplier;
      const actualCookingSec = Math.round(basePrepSec * variance);

      const cookingStartedAt = new Date(ticketAcknowledgedAt.getTime() + (10 + Math.random() * 30) * 1000);
      const cookingReadyAt = new Date(cookingStartedAt.getTime() + actualCookingSec * 1000);

      const passWaitSec = Math.round(30 + Math.random() * 120);
      const waiterPickupAt = new Date(cookingReadyAt.getTime() + passWaitSec * 1000);
      const serviceDeliverySec = Math.round(20 + Math.random() * 60);
      const servedAt = new Date(waiterPickupAt.getTime() + serviceDeliverySec * 1000);

      const kitchenPickupTime = Math.round((kotSentAt.getTime() - orderReceivedAt.getTime()) / 1000);
      const idleWaitTime = Math.round((ticketAcknowledgedAt.getTime() - kotSentAt.getTime()) / 1000);
      const totalKitchenTime = Math.round((cookingReadyAt.getTime() - kotSentAt.getTime()) / 1000);
      const totalCycleTime = Math.round((servedAt.getTime() - orderReceivedAt.getTime()) / 1000);

      const timeVariance = actualCookingSec - basePrepSec;
      const variancePct = basePrepSec > 0 ? parseFloat(((timeVariance / basePrepSec) * 100).toFixed(2)) : null;

      let performanceFlag = "ON_TIME";
      if (variance * chef.multiplier < 0.8) performanceFlag = "FAST";
      else if (variance * chef.multiplier > 1.2) performanceFlag = "VERY_SLOW";
      else if (variance * chef.multiplier > 1.0) performanceFlag = "SLOW";

      const fakeOrderItemId = `seed-item-${shiftDate}-${orderIdx}`;
      const fakeOrderId = `seed-order-${shiftDate}-${orderIdx}`;

      await pool.query(
        `INSERT INTO item_time_logs (
           tenant_id, outlet_id, order_id, order_number, order_item_id,
           menu_item_id, menu_item_name, chef_name,
           shift_date, shift_type, order_type, table_number,
           order_received_at, kot_sent_at, ticket_acknowledged_at,
           cooking_started_at, cooking_ready_at,
           waiter_pickup_at, served_at,
           waiter_response_time, kitchen_pickup_time, idle_wait_time,
           actual_cooking_time, pass_wait_time, service_delivery_time,
           total_kitchen_time, total_cycle_time,
           recipe_estimated_time, time_variance, variance_percent,
           performance_flag, course_number
         ) VALUES (
           $1,$2,$3,$4,$5,
           $6,$7,$8,
           $9,$10,$11,$12,
           $13,$14,$15,
           $16,$17,
           $18,$19,
           $20,$21,$22,
           $23,$24,$25,
           $26,$27,
           $28,$29,$30,
           $31,$32
         ) ON CONFLICT (order_item_id) DO NOTHING`,
        [
          tenant.id, outlet.id, fakeOrderId,
          `ORD-${shiftDate.replace(/-/g, "")}-${orderIdx + 1}`,
          fakeOrderItemId,
          menuItem.id, menuItem.name, chef.name,
          shiftDate, shiftType, "dine_in", String(orderIdx + 1),
          orderReceivedAt, kotSentAt, ticketAcknowledgedAt,
          cookingStartedAt, cookingReadyAt,
          waiterPickupAt, servedAt,
          passWaitSec, kitchenPickupTime, idleWaitTime,
          actualCookingSec, passWaitSec, serviceDeliverySec,
          totalKitchenTime, totalCycleTime,
          basePrepSec, timeVariance, variancePct,
          performanceFlag, (orderIdx % 3) + 1,
        ]
      );

      await pool.query(
        `INSERT INTO recipe_time_benchmarks (tenant_id, menu_item_id, counter_id, estimated_prep_time, actual_avg_time, fastest_time, slowest_time, sample_count, last_calculated)
         VALUES ($1,$2,'default',$3,$4,$4,$4,1,NOW())
         ON CONFLICT (tenant_id, menu_item_id, counter_id) DO UPDATE SET
           actual_avg_time = ROUND((recipe_time_benchmarks.actual_avg_time * recipe_time_benchmarks.sample_count + $4) / (recipe_time_benchmarks.sample_count + 1)),
           fastest_time = LEAST(recipe_time_benchmarks.fastest_time, $4),
           slowest_time = GREATEST(recipe_time_benchmarks.slowest_time, $4),
           sample_count = recipe_time_benchmarks.sample_count + 1,
           last_calculated = NOW()`,
        [tenant.id, menuItem.id, basePrepSec, actualCookingSec]
      );
    }

    const { rows: logs } = await pool.query(
      `SELECT * FROM item_time_logs WHERE tenant_id = $1 AND shift_date = $2`,
      [tenant.id, shiftDate]
    );

    if (logs.length > 0) {
      const onTime = logs.filter((l: any) => ["FAST", "ON_TIME"].includes(l.performance_flag)).length;
      const onTimePct = parseFloat(((onTime / logs.length) * 100).toFixed(2));
      const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

      await pool.query(
        `INSERT INTO daily_time_performance (
           tenant_id, outlet_id, performance_date, shift_type,
           total_orders, orders_on_time, orders_delayed,
           avg_cooking_time, avg_total_kitchen_time, avg_total_cycle_time,
           target_kitchen_time, target_cycle_time, on_time_percentage
         ) VALUES ($1,$2,$3,'ALL',$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (tenant_id, outlet_id, performance_date, shift_type) DO UPDATE SET
           total_orders = EXCLUDED.total_orders,
           orders_on_time = EXCLUDED.orders_on_time,
           on_time_percentage = EXCLUDED.on_time_percentage`,
        [
          tenant.id, outlet.id, shiftDate,
          logs.length, onTime, logs.length - onTime,
          avg(logs.map((l: any) => l.actual_cooking_time).filter((v: any) => v != null)),
          avg(logs.map((l: any) => l.total_kitchen_time).filter((v: any) => v != null)),
          avg(logs.map((l: any) => l.total_cycle_time).filter((v: any) => v != null)),
          900, 1500, onTimePct,
        ]
      );
    }
  }

  console.log("[TimeTracking] Time tracking seed data complete.");
}

export async function seedTicketHistoryData(): Promise<void> {
  const tenantRes = await pool.query(`SELECT id FROM tenants LIMIT 1`);
  if (!tenantRes.rows[0]) return;
  const tenantId = tenantRes.rows[0].id;

  const outletRes = await pool.query(`SELECT id FROM outlets WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  if (!outletRes.rows[0]) return;
  const outletId = outletRes.rows[0].id;

  const waiterRes = await pool.query(`SELECT id, name FROM users WHERE tenant_id = $1 AND role = 'waiter' LIMIT 1`, [tenantId]);
  const managerRes = await pool.query(`SELECT id, name FROM users WHERE tenant_id = $1 AND role IN ('manager','owner') LIMIT 1`, [tenantId]);

  if (!waiterRes.rows[0] || !managerRes.rows[0]) {
    console.log("[TicketHistory] Skipping seed — no waiter/manager found.");
    return;
  }
  const waiter = waiterRes.rows[0];
  const manager = managerRes.rows[0];

  // Check if we already seeded
  const existingVoid = await pool.query(`SELECT id FROM item_void_requests WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  if (existingVoid.rows.length > 0) {
    console.log("[TicketHistory] Void/refire seed data already exists, skipping.");
    return;
  }

  // Fetch 3 paid orders with items
  const ordersRes = await pool.query(
    `SELECT o.id AS order_id, oi.id AS item_id, oi.name AS item_name, oi.price, oi.quantity
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.tenant_id = $1 AND o.status = 'paid'
     LIMIT 5`,
    [tenantId]
  );
  if (ordersRes.rows.length < 3) {
    console.log("[TicketHistory] Not enough paid orders to seed void/refire data.");
    return;
  }

  const [row0, row1, row2, row3, row4] = ordersRes.rows;

  // 1. Approved void request
  await pool.query(
    `INSERT INTO item_void_requests (
      tenant_id, outlet_id, order_id, order_item_id, menu_item_name,
      quantity, unit_price, total_value, void_reason, void_type,
      status, requested_by, requested_by_name, requested_by_role,
      approved_by, approved_by_name, approved_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Customer allergy concern','ALLERGY',
      'approved',$9,$10,'waiter',$11,$12,NOW() - INTERVAL '2 hours')`,
    [
      tenantId, outletId, row0.order_id, row0.item_id, row0.item_name,
      row0.quantity, row0.price, (parseFloat(row0.price) * (row0.quantity || 1)).toFixed(2),
      waiter.id, waiter.name, manager.id, manager.name,
    ]
  );
  await pool.query(
    `UPDATE order_items SET is_voided = true, voided_at = NOW() - INTERVAL '2 hours', voided_reason = 'Customer allergy concern' WHERE id = $1`,
    [row0.item_id]
  );
  await pool.query(
    `INSERT INTO voided_items (tenant_id, order_id, order_item_id, void_request_id, menu_item_name, quantity, unit_price, total_value, void_reason, void_type, voided_by, voided_by_name, approved_by, approved_by_name)
     SELECT $1,$2,$3,id,$4,$5,$6,$7,'Customer allergy concern','ALLERGY',$8,$9,$10,$11
     FROM item_void_requests WHERE order_item_id = $3 LIMIT 1`,
    [tenantId, row0.order_id, row0.item_id, row0.item_name, row0.quantity, row0.price, (parseFloat(row0.price) * (row0.quantity || 1)).toFixed(2), waiter.id, waiter.name, manager.id, manager.name]
  );

  // 2. Pending void request
  if (row1) {
    await pool.query(
      `INSERT INTO item_void_requests (
        tenant_id, outlet_id, order_id, order_item_id, menu_item_name,
        quantity, unit_price, total_value, void_reason, void_type,
        status, requested_by, requested_by_name, requested_by_role
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Wrong item delivered','WRONG_ITEM',
        'pending',$9,$10,'waiter')`,
      [
        tenantId, outletId, row1.order_id, row1.item_id, row1.item_name,
        row1.quantity, row1.price, (parseFloat(row1.price) * (row1.quantity || 1)).toFixed(2),
        waiter.id, waiter.name,
      ]
    );
  }

  // 3. Rejected void request
  if (row2) {
    await pool.query(
      `INSERT INTO item_void_requests (
        tenant_id, outlet_id, order_id, order_item_id, menu_item_name,
        quantity, unit_price, total_value, void_reason, void_type,
        status, requested_by, requested_by_name, requested_by_role,
        approved_by, approved_by_name, rejected_reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Customer changed mind','CHANGE_OF_MIND',
        'rejected',$9,$10,'waiter',$11,$12,'Order already prepared')`,
      [
        tenantId, outletId, row2.order_id, row2.item_id, row2.item_name,
        row2.quantity, row2.price, (parseFloat(row2.price) * (row2.quantity || 1)).toFixed(2),
        waiter.id, waiter.name, manager.id, manager.name,
      ]
    );
  }

  // 4. Completed refire request
  if (row3) {
    const kotNum1 = `REFIRE-${new Date().toISOString().slice(0,10).replace(/-/g,'')} -1001`;
    await pool.query(
      `INSERT INTO item_refire_requests (
        tenant_id, outlet_id, order_id, order_item_id, menu_item_name,
        quantity, refire_reason, priority, new_kot_number, status,
        requested_by, requested_by_name
      ) VALUES ($1,$2,$3,$4,$5,$6,'Item was undercooked','high',$7,'sent',$8,$9)`,
      [tenantId, outletId, row3.order_id, row3.item_id, row3.item_name, row3.quantity, kotNum1, waiter.id, waiter.name]
    );
  }

  // 5. Active refire request
  if (row4) {
    const kotNum2 = `REFIRE-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-1002`;
    await pool.query(
      `INSERT INTO item_refire_requests (
        tenant_id, outlet_id, order_id, order_item_id, menu_item_name,
        quantity, refire_reason, priority, new_kot_number, status,
        requested_by, requested_by_name
      ) VALUES ($1,$2,$3,$4,$5,$6,'Customer requested fresh preparation','high',$7,'sent',$8,$9)`,
      [tenantId, outletId, row4.order_id, row4.item_id, row4.item_name, row4.quantity, kotNum2, manager.id, manager.name]
    );
  }

  // 5 reprint audit events
  const auditOrdersRes = await pool.query(`SELECT id FROM orders WHERE tenant_id = $1 LIMIT 5`, [tenantId]);
  for (const [i, ord] of auditOrdersRes.rows.entries()) {
    const action = i % 3 === 0 ? "RECEIPT_REPRINTED" : i % 3 === 1 ? "KOT_REPRINTED" : "BILL_REPRINTED";
    await pool.query(
      `INSERT INTO audit_events (tenant_id, user_id, user_name, action, entity_type, entity_id)
       VALUES ($1,$2,$3,$4,'order',$5)
       ON CONFLICT DO NOTHING`,
      [tenantId, manager.id, manager.name, action, ord.id]
    );
  }

  console.log("[TicketHistory] Void/refire/reprint seed data complete.");
}
export async function seedCrockeryItems(): Promise<void> {
  const tenantRes = await pool.query(`SELECT id FROM tenants WHERE slug != 'platform' LIMIT 1`);
  if (!tenantRes.rows[0]) return;
  const tenantId = tenantRes.rows[0].id;

  const existingRes = await pool.query(
    `SELECT COUNT(*) AS cnt FROM inventory_items WHERE tenant_id = $1 AND item_category IN ('CROCKERY','CUTLERY','GLASSWARE')`,
    [tenantId]
  );
  const alreadyHasItems = Number(existingRes.rows[0].cnt) > 0;

  const items: Array<{
    name: string; itemCategory: string; unitType: string;
    parLevelPerShift: number; reorderPieces: number; costPerPiece: number; currentStock: number;
  }> = [
    { name: 'Dinner Plate',   itemCategory: 'CROCKERY',  unitType: 'PIECE', parLevelPerShift: 80, reorderPieces: 60, costPerPiece: 350, currentStock: 80 },
    { name: 'Side Plate',     itemCategory: 'CROCKERY',  unitType: 'PIECE', parLevelPerShift: 60, reorderPieces: 40, costPerPiece: 180, currentStock: 60 },
    { name: 'Soup Bowl',      itemCategory: 'CROCKERY',  unitType: 'PIECE', parLevelPerShift: 40, reorderPieces: 30, costPerPiece: 220, currentStock: 40 },
    { name: 'Dessert Bowl',   itemCategory: 'CROCKERY',  unitType: 'PIECE', parLevelPerShift: 30, reorderPieces: 20, costPerPiece: 180, currentStock: 30 },
    { name: 'Serving Dish',   itemCategory: 'CROCKERY',  unitType: 'PIECE', parLevelPerShift: 20, reorderPieces: 12, costPerPiece: 480, currentStock: 20 },
    { name: 'Sauce Boat',     itemCategory: 'CROCKERY',  unitType: 'PIECE', parLevelPerShift: 15, reorderPieces: 10, costPerPiece: 320, currentStock: 15 },
    { name: 'Bread Basket',   itemCategory: 'CROCKERY',  unitType: 'PIECE', parLevelPerShift: 20, reorderPieces: 12, costPerPiece: 280, currentStock: 20 },
    { name: 'Dinner Fork',    itemCategory: 'CUTLERY',   unitType: 'PIECE', parLevelPerShift: 100, reorderPieces: 80, costPerPiece: 120, currentStock: 100 },
    { name: 'Dessert Fork',   itemCategory: 'CUTLERY',   unitType: 'PIECE', parLevelPerShift: 60, reorderPieces: 40, costPerPiece: 100, currentStock: 60 },
    { name: 'Table Spoon',    itemCategory: 'CUTLERY',   unitType: 'PIECE', parLevelPerShift: 100, reorderPieces: 80, costPerPiece: 100, currentStock: 100 },
    { name: 'Dessert Spoon',  itemCategory: 'CUTLERY',   unitType: 'PIECE', parLevelPerShift: 60, reorderPieces: 40, costPerPiece: 90, currentStock: 60 },
    { name: 'Tea Spoon',      itemCategory: 'CUTLERY',   unitType: 'PIECE', parLevelPerShift: 80, reorderPieces: 60, costPerPiece: 80, currentStock: 80 },
    { name: 'Dinner Knife',   itemCategory: 'CUTLERY',   unitType: 'PIECE', parLevelPerShift: 100, reorderPieces: 80, costPerPiece: 150, currentStock: 100 },
    { name: 'Serving Spoon',  itemCategory: 'CUTLERY',   unitType: 'PIECE', parLevelPerShift: 20, reorderPieces: 12, costPerPiece: 180, currentStock: 20 },
    { name: 'Tongs',          itemCategory: 'CUTLERY',   unitType: 'PIECE', parLevelPerShift: 10, reorderPieces: 6,  costPerPiece: 220, currentStock: 10 },
    { name: 'Butter Knife',   itemCategory: 'CUTLERY',   unitType: 'PIECE', parLevelPerShift: 40, reorderPieces: 30, costPerPiece: 90, currentStock: 40 },
    { name: 'Water Glass',    itemCategory: 'GLASSWARE', unitType: 'PIECE', parLevelPerShift: 80, reorderPieces: 60, costPerPiece: 180, currentStock: 74 },
    { name: 'Juice Glass',    itemCategory: 'GLASSWARE', unitType: 'PIECE', parLevelPerShift: 60, reorderPieces: 40, costPerPiece: 160, currentStock: 60 },
    { name: 'Wine Glass',     itemCategory: 'GLASSWARE', unitType: 'PIECE', parLevelPerShift: 40, reorderPieces: 30, costPerPiece: 320, currentStock: 38 },
    { name: 'Beer Mug',       itemCategory: 'GLASSWARE', unitType: 'PIECE', parLevelPerShift: 30, reorderPieces: 20, costPerPiece: 280, currentStock: 30 },
    { name: 'Tea Cup+Saucer', itemCategory: 'GLASSWARE', unitType: 'PIECE', parLevelPerShift: 40, reorderPieces: 30, costPerPiece: 260, currentStock: 40 },
    { name: 'Coffee Mug',     itemCategory: 'GLASSWARE', unitType: 'PIECE', parLevelPerShift: 30, reorderPieces: 20, costPerPiece: 220, currentStock: 30 },
    { name: 'Water Jug',      itemCategory: 'GLASSWARE', unitType: 'PIECE', parLevelPerShift: 10, reorderPieces: 6,  costPerPiece: 480, currentStock: 10 },
  ];

  const insertedIds: Record<string, string> = {};
  if (!alreadyHasItems) {
    for (const item of items) {
      const res = await pool.query(
        `INSERT INTO inventory_items (tenant_id, name, unit, current_stock, item_category, unit_type, par_level_per_shift, reorder_pieces, cost_per_piece, cost_price)
         VALUES ($1,$2,'pcs',$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
        [tenantId, item.name, item.currentStock, item.itemCategory, item.unitType, item.parLevelPerShift, item.reorderPieces, item.costPerPiece]
      );
      insertedIds[item.name] = res.rows[0].id;
    }
  } else {
    const existingItems = await pool.query(
      `SELECT id, name FROM inventory_items WHERE tenant_id = $1 AND item_category IN ('CROCKERY','CUTLERY','GLASSWARE')`,
      [tenantId]
    );
    for (const row of existingItems.rows) {
      insertedIds[row.name] = row.id;
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const wineGlassId = insertedIds['Wine Glass'];
  const waterGlassId = insertedIds['Water Glass'];
  const dinnerPlateId = insertedIds['Dinner Plate'];

  if (wineGlassId && waterGlassId && dinnerPlateId) {
    const dmgCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM damaged_inventory WHERE tenant_id = $1 AND damage_number IN ('DMG-CRK-001','DMG-CRK-002','DMG-CRK-003')`,
      [tenantId]
    );
    if (Number(dmgCheck.rows[0].cnt) === 0) {
      await pool.query(
        `INSERT INTO damaged_inventory (tenant_id, damage_number, inventory_item_id, damaged_qty, unit_cost, total_value, damage_type, damage_date, disposal_method, status, caused_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tenantId, 'DMG-CRK-001', wineGlassId, 2, 320, 640, 'BREAKAGE_SERVICE', today, 'DISCARDED', 'approved', 'Service Staff']
      );
      await pool.query(
        `INSERT INTO damaged_inventory (tenant_id, damage_number, inventory_item_id, damaged_qty, unit_cost, total_value, damage_type, damage_date, disposal_method, status, caused_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tenantId, 'DMG-CRK-002', waterGlassId, 3, 180, 540, 'BREAKAGE_WASHING', today, 'DISCARDED', 'approved', 'Kitchen Staff']
      );
      await pool.query(
        `INSERT INTO damaged_inventory (tenant_id, damage_number, inventory_item_id, damaged_qty, unit_cost, total_value, damage_type, damage_date, disposal_method, status, caused_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tenantId, 'DMG-CRK-003', dinnerPlateId, 2, 350, 700, 'LOST_MISSING', today, 'DISCARDED', 'approved', null]
      );
    }

    const sessionCheck = await pool.query(
      `SELECT id FROM stock_count_sessions WHERE tenant_id = $1 AND count_number = 'CNT-CRK-001'`,
      [tenantId]
    );
    if (!sessionCheck.rows[0]) {
      const userRes = await pool.query(
        `SELECT id FROM users WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      );
      const userId = userRes.rows[0]?.id;
      const sessionRes = await pool.query(
        `INSERT INTO stock_count_sessions (tenant_id, count_number, status, scheduled_date, approved_at, approved_by, created_by)
         VALUES ($1,$2,$3,$4,NOW(),$5,$5) RETURNING id`,
        [tenantId, 'CNT-CRK-001', 'approved', today, userId]
      );
      if (sessionRes.rows[0]) {
        const sessionId = sessionRes.rows[0].id;
        const crockeryCountItems = [
          { itemId: dinnerPlateId, system: 80, physical: 78, reason: 'BREAKAGE_SERVICE' },
          { itemId: insertedIds['Soup Bowl'], system: 40, physical: 38, reason: 'BREAKAGE_WASHING' },
          { itemId: insertedIds['Wine Glass'], system: 40, physical: 38, reason: 'BREAKAGE_SERVICE' },
          { itemId: waterGlassId, system: 80, physical: 74, reason: 'BREAKAGE_WASHING' },
          { itemId: insertedIds['Dinner Fork'], system: 100, physical: 98, reason: 'LOST_MISSING' },
          { itemId: insertedIds['Tea Spoon'], system: 80, physical: 79, reason: 'UNKNOWN' },
        ];
        for (const ci of crockeryCountItems) {
          if (!ci.itemId) continue;
          await pool.query(
            `INSERT INTO stock_count_items (session_id, inventory_item_id, system_qty, physical_qty, counted, variance_reason)
             VALUES ($1,$2,$3,$4,true,$5)`,
            [sessionId, ci.itemId, ci.system, ci.physical, ci.reason]
          );
        }
      }
    }
  }

  console.log("[CrockeryItems] Seeded 23 crockery/cutlery/glassware items + damage records + stock count session.");
}

export async function seedCashSessionData(): Promise<void> {
  const tenantsRes = await pool.query(`SELECT id FROM tenants WHERE slug != 'platform' LIMIT 1`);
  if (!tenantsRes.rows[0]) return;
  const tenantId = tenantsRes.rows[0].id;

  const existing = await pool.query(`SELECT id FROM cash_sessions WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  if (existing.rows[0]) {
    console.log("[CashSession] Seed data already exists, skipping.");
    return;
  }

  const outletRes = await pool.query(`SELECT id FROM outlets WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  const outletId = outletRes.rows[0]?.id || null;

  const cashierRes = await pool.query(
    `SELECT id, name FROM users WHERE tenant_id = $1 AND role IN ('cashier','manager','owner') LIMIT 1`,
    [tenantId]
  );
  const cashier = cashierRes.rows[0];
  if (!cashier) {
    console.log("[CashSession] No cashier/manager/owner found, skipping.");
    return;
  }

  const managerRes = await pool.query(
    `SELECT id, name FROM users WHERE tenant_id = $1 AND role = 'manager' LIMIT 1`,
    [tenantId]
  );
  const manager = managerRes.rows[0];

  await pool.query(
    `UPDATE outlets SET currency_code = 'INR', currency_symbol = '₹', currency_name = 'Indian Rupee',
     currency_position = 'before', decimal_places = 2, cash_rounding = 'ROUND_1',
     denomination_config = $1
     WHERE id = $2`,
    [
      JSON.stringify({
        notes: [2000,500,200,100,50,20,10],
        coins: [10,5,2,1],
        rounding: 'ROUND_1',
        subunit: 'Paise',
        subunitValue: 100,
      }),
      outletId,
    ]
  );

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const sessionNumber = `CS-${dateStr}-0001`;

  const openingFloat = 5000.00;
  const sale1 = 1185.00;
  const sale2 = 2340.00;
  const sale3 = 890.00;
  const payoutAmount = 500.00;
  const totalSales = sale1 + sale2 + sale3;
  const expectedClosing = openingFloat + totalSales - payoutAmount;
  const physicalClosing = expectedClosing - 15;
  const variance = physicalClosing - expectedClosing;

  const sessionRes = await pool.query(
    `INSERT INTO cash_sessions (
       tenant_id, outlet_id, session_number, cashier_id, cashier_name,
       currency_code, currency_symbol, status, opening_float, opening_float_breakdown,
       expected_closing_cash, physical_closing_cash, closing_breakdown,
       cash_variance, variance_reason, total_cash_sales, total_cash_refunds,
       total_cash_payouts, total_transactions, opened_at, closed_at
     ) VALUES ($1,$2,$3,$4,$5,'INR','₹','closed',$6,$7,$8,$9,$10,$11,$12,$13,0,$14,3,NOW()-INTERVAL '4 hours',NOW()-INTERVAL '10 minutes')
     RETURNING id`,
    [
      tenantId, outletId, sessionNumber, cashier.id, cashier.name,
      openingFloat,
      JSON.stringify({ "₹500": 8, "₹200": 2, "₹100": 4 }),
      expectedClosing.toFixed(2),
      physicalClosing.toFixed(2),
      JSON.stringify({ "₹2000": 4, "₹500": 2, "₹200": 1, "₹100": 0, "₹50": 1 }),
      variance.toFixed(2),
      "Change error during rush hour",
      totalSales.toFixed(2),
      payoutAmount.toFixed(2),
    ]
  );
  const sessionId = sessionRes.rows[0].id;

  let runningBalance = openingFloat;

  await pool.query(
    `INSERT INTO cash_drawer_events (tenant_id, outlet_id, session_id, event_type, amount, running_balance, performed_by, performed_by_name, reason)
     VALUES ($1,$2,$3,'OPENING',$4,$5,$6,$7,'Opening float for shift')`,
    [tenantId, outletId, sessionId, openingFloat, runningBalance, cashier.id, cashier.name]
  );

  runningBalance += sale1;
  await pool.query(
    `INSERT INTO cash_drawer_events (tenant_id, outlet_id, session_id, event_type, amount, tendered_amount, change_given, running_balance, performed_by, performed_by_name)
     VALUES ($1,$2,$3,'SALE',$4,$5,$6,$7,$8,$9)`,
    [tenantId, outletId, sessionId, sale1, 1200, 15, runningBalance, cashier.id, cashier.name]
  );

  runningBalance += sale2;
  await pool.query(
    `INSERT INTO cash_drawer_events (tenant_id, outlet_id, session_id, event_type, amount, tendered_amount, change_given, running_balance, performed_by, performed_by_name)
     VALUES ($1,$2,$3,'SALE',$4,$5,$6,$7,$8,$9)`,
    [tenantId, outletId, sessionId, sale2, 2500, 160, runningBalance, cashier.id, cashier.name]
  );

  runningBalance += sale3;
  await pool.query(
    `INSERT INTO cash_drawer_events (tenant_id, outlet_id, session_id, event_type, amount, tendered_amount, change_given, running_balance, performed_by, performed_by_name)
     VALUES ($1,$2,$3,'SALE',$4,$5,$6,$7,$8,$9)`,
    [tenantId, outletId, sessionId, sale3, 1000, 110, runningBalance, cashier.id, cashier.name]
  );

  runningBalance -= payoutAmount;
  await pool.query(
    `INSERT INTO cash_drawer_events (tenant_id, outlet_id, session_id, event_type, amount, running_balance, performed_by, performed_by_name, reason, is_manual)
     VALUES ($1,$2,$3,'PAYOUT',$4,$5,$6,$7,'Petty cash — delivery supplies',true)`,
    [tenantId, outletId, sessionId, payoutAmount, runningBalance, cashier.id, cashier.name]
  );

  await pool.query(
    `INSERT INTO cash_payouts (tenant_id, outlet_id, session_id, payout_number, payout_type, amount, recipient, reason, performed_by)
     VALUES ($1,$2,$3,'PYT-${dateStr}-0001','PETTY_CASH',$4,'Delivery Vendor','Delivery supplies for the day',$5)`,
    [tenantId, outletId, sessionId, payoutAmount, cashier.id]
  );

  await pool.query(
    `INSERT INTO cash_drawer_events (tenant_id, outlet_id, session_id, event_type, amount, running_balance, performed_by, performed_by_name, reason)
     VALUES ($1,$2,$3,'CLOSING',$4,$5,$6,$7,$8)`,
    [tenantId, outletId, sessionId, physicalClosing, physicalClosing, cashier.id, cashier.name, "Change error during rush hour"]
  );

  await pool.query(
    `INSERT INTO cash_handovers (tenant_id, outlet_id, session_id, handover_number, amount_handed_over, denomination_breakdown, handed_by, handed_by_name, received_by_name, notes)
     VALUES ($1,$2,$3,'HND-${dateStr}-0001',$4,$5,$6,$7,$8,'End of shift handover to night manager')`,
    [
      tenantId, outletId, sessionId,
      physicalClosing.toFixed(2),
      JSON.stringify({ "₹2000": 4, "₹500": 2, "₹200": 1, "₹50": 1 }),
      cashier.id, cashier.name, manager?.name || "Night Manager",
    ]
  );

  console.log("[CashSession] Seed data complete — 1 closed session, 6 events, 1 payout, 1 handover.");
}

export async function seedAlertDefinitions(): Promise<void> {
  const alertDefs = [
    { code: 'ALERT-01', name: 'New Order Received', soundKey: 'new_order', urgency: 'normal', targetRoles: ['kitchen', 'manager', 'owner'], requiresAck: false, repeatSec: 0, canDisable: true, minVol: 0 },
    { code: 'ALERT-02', name: 'Rush/VIP Order', soundKey: 'rush_order', urgency: 'high', targetRoles: ['kitchen', 'manager', 'owner'], requiresAck: true, repeatSec: 30, canDisable: false, minVol: 60 },
    { code: 'ALERT-03', name: 'Allergy Flagged', soundKey: 'allergy_alarm', urgency: 'critical', targetRoles: ['kitchen', 'manager', 'owner'], requiresAck: true, repeatSec: 60, canDisable: false, minVol: 80 },
    { code: 'ALERT-04', name: 'All Items Ready', soundKey: 'order_ready', urgency: 'normal', targetRoles: ['waiter', 'manager', 'owner'], requiresAck: false, repeatSec: 0, canDisable: true, minVol: 0 },
    { code: 'ALERT-05', name: 'Item Overdue', soundKey: 'overdue_warning', urgency: 'high', targetRoles: ['manager', 'owner', 'kitchen'], requiresAck: false, repeatSec: 0, canDisable: true, minVol: 0 },
    { code: 'ALERT-06', name: 'Waiter Called via QR', soundKey: 'waiter_call', urgency: 'normal', targetRoles: ['waiter', 'manager'], requiresAck: false, repeatSec: 0, canDisable: true, minVol: 0 },
    { code: 'ALERT-07', name: 'Kitchen Printer Offline', soundKey: 'printer_error', urgency: 'high', targetRoles: ['manager', 'owner'], requiresAck: true, repeatSec: 120, canDisable: true, minVol: 50 },
    { code: 'ALERT-08', name: 'Receipt Printer Offline', soundKey: 'printer_error', urgency: 'high', targetRoles: ['manager', 'owner'], requiresAck: true, repeatSec: 120, canDisable: true, minVol: 50 },
    { code: 'ALERT-09', name: 'Void Request Pending', soundKey: 'attention_chime', urgency: 'normal', targetRoles: ['manager', 'owner'], requiresAck: false, repeatSec: 0, canDisable: true, minVol: 0 },
    { code: 'ALERT-10', name: 'Stock Out of Stock', soundKey: 'stock_alert', urgency: 'high', targetRoles: ['manager', 'owner'], requiresAck: false, repeatSec: 0, canDisable: true, minVol: 0 },
    { code: 'ALERT-11', name: 'Delivery at Risk', soundKey: 'urgent_tone', urgency: 'high', targetRoles: ['manager', 'owner', 'waiter'], requiresAck: false, repeatSec: 0, canDisable: true, minVol: 0 },
    { code: 'ALERT-12', name: 'Staff Not Clocked In', soundKey: 'reminder_chime', urgency: 'normal', targetRoles: ['manager', 'owner'], requiresAck: false, repeatSec: 0, canDisable: true, minVol: 0 },
    { code: 'ALERT-13', name: 'Account Sharing Detected', soundKey: 'attention_chime', urgency: 'high', targetRoles: ['manager', 'owner', 'franchise_owner', 'hq_admin', 'super_admin'], requiresAck: false, repeatSec: 0, canDisable: true, minVol: 50 },
    { code: 'RESOURCE_DEPLETED', name: 'Special Resource Depleted', soundKey: 'stock_alert', urgency: 'high', targetRoles: ['manager', 'owner', 'supervisor'], requiresAck: false, repeatSec: 0, canDisable: true, minVol: 0 },
    { code: 'PARKING_FULL', name: 'Parking Lot Full', soundKey: 'stock_alert', urgency: 'high', targetRoles: ['manager', 'owner', 'cashier'], requiresAck: false, repeatSec: 0, canDisable: true, minVol: 0 },
    { code: 'PARKING_RETRIEVAL_REQUESTED', name: 'Vehicle Retrieval Requested', soundKey: 'attention_chime', urgency: 'normal', targetRoles: ['manager', 'owner', 'waiter'], requiresAck: false, repeatSec: 0, canDisable: true, minVol: 0 },
  ];

  for (const def of alertDefs) {
    const exists = await pool.query(`SELECT id FROM alert_definitions WHERE alert_code = $1 AND tenant_id IS NULL`, [def.code]);
    if (!exists.rows[0]) {
      await pool.query(
        `INSERT INTO alert_definitions (alert_code, alert_name, sound_key, urgency, target_roles, requires_acknowledge, repeat_interval_sec, can_be_disabled, min_volume, is_active, is_system_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true)`,
        [def.code, def.name, def.soundKey, def.urgency, JSON.stringify(def.targetRoles), def.requiresAck, def.repeatSec, def.canDisable, def.minVol]
      );
    }
  }
  console.log("[AlertDefinitions] Seeded 15 system alert definitions.");
}

export async function seedTipSettings(): Promise<void> {
  const tenantsRes = await pool.query(`SELECT id FROM tenants WHERE slug != 'platform' LIMIT 1`);
  if (!tenantsRes.rows[0]) return;
  const tenantId = tenantsRes.rows[0].id;

  const outletRes = await pool.query(`SELECT id FROM outlets WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  if (!outletRes.rows[0]) return;
  const outletId = outletRes.rows[0].id;

  const existing = await pool.query(
    `SELECT id FROM outlet_tip_settings WHERE tenant_id = $1 AND outlet_id = $2 LIMIT 1`,
    [tenantId, outletId]
  );
  if (existing.rows[0]) {
    console.log("[TipSettings] Seed data already exists, skipping.");
    return;
  }

  await pool.query(`
    INSERT INTO outlet_tip_settings (
      tenant_id, outlet_id, tips_enabled, show_on_pos, show_on_qr, show_on_receipt,
      prompt_style, suggested_pct_1, suggested_pct_2, suggested_pct_3, allow_custom_amount,
      tip_basis, distribution_method, waiter_share_pct, kitchen_share_pct,
      tip_is_taxable, currency_code, currency_symbol
    ) VALUES ($1,$2,true,true,false,true,'BUTTONS',5,10,15,true,'SUBTOTAL','INDIVIDUAL',70,30,false,'INR','₹')
    ON CONFLICT (tenant_id, outlet_id) DO NOTHING
  `, [tenantId, outletId]);

  const waiterRes = await pool.query(
    `SELECT id, name FROM users WHERE tenant_id = $1 AND role = 'waiter' LIMIT 1`,
    [tenantId]
  );
  const waiter = waiterRes.rows[0];
  if (!waiter) {
    console.log("[TipSettings] No waiter found for tip seed, skipping bill_tips.");
    return;
  }

  const billsRes = await pool.query(
    `SELECT id, order_id FROM bills WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [tenantId]
  );
  if (!billsRes.rows.length) {
    console.log("[TipSettings] No bills found for tip seed, skipping bill_tips.");
    return;
  }

  for (let i = 0; i < billsRes.rows.length; i++) {
    const bill = billsRes.rows[i];
    const tipType = i % 2 === 0 ? 'PERCENTAGE' : 'CUSTOM';
    const tipAmount = tipType === 'PERCENTAGE' ? 50 + i * 30 : 100 + i * 20;
    const tipPct = tipType === 'PERCENTAGE' ? 10 : null;

    const tipRes = await pool.query(`
      INSERT INTO bill_tips (
        tenant_id, outlet_id, bill_id, order_id, tip_amount, tip_type,
        tip_percentage, payment_method, waiter_id, waiter_name, distribution_method,
        is_distributed, distributed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'CASH',$8,$9,'INDIVIDUAL',true,NOW())
      ON CONFLICT (bill_id) DO NOTHING
      RETURNING id
    `, [tenantId, outletId, bill.id, bill.order_id, tipAmount, tipType, tipPct, waiter.id, waiter.name]);

    if (tipRes.rows[0]) {
      const tipId = tipRes.rows[0].id;
      const today = new Date().toISOString().split('T')[0];
      await pool.query(`
        INSERT INTO tip_distributions (
          tenant_id, outlet_id, bill_tip_id, staff_id, staff_name, staff_role,
          share_percentage, share_amount, distribution_date, is_paid
        ) VALUES ($1,$2,$3,$4,$5,'waiter',100,$6,$7,false)
        ON CONFLICT DO NOTHING
      `, [tenantId, outletId, tipId, waiter.id, waiter.name, tipAmount.toFixed(2), today]);
    }
  }

  console.log("[TipSettings] Seeded tip settings and sample bill_tips/distributions.");
}

export async function seedPackingSettings(): Promise<void> {
  const tenantsRes = await pool.query(`SELECT id FROM tenants WHERE slug != 'platform' LIMIT 1`);
  if (!tenantsRes.rows[0]) return;
  const tenantId = tenantsRes.rows[0].id;

  const outletRes = await pool.query(`SELECT id FROM outlets WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  if (!outletRes.rows[0]) return;
  const outletId = outletRes.rows[0].id;

  const existing = await pool.query(
    `SELECT id FROM outlet_packing_settings WHERE tenant_id = $1 AND outlet_id = $2 LIMIT 1`,
    [tenantId, outletId]
  );
  if (existing.rows[0]) {
    console.log("[PackingSettings] Seed data already exists, skipping.");
    return;
  }

  await pool.query(`
    INSERT INTO outlet_packing_settings (
      tenant_id, outlet_id, takeaway_charge_enabled, delivery_charge_enabled,
      charge_type, takeaway_charge_amount, delivery_charge_amount,
      takeaway_per_item, delivery_per_item, max_charge_per_order,
      packing_charge_taxable, packing_charge_tax_pct, show_on_receipt,
      charge_label, currency_code, currency_symbol
    ) VALUES ($1,$2,false,true,'FIXED_PER_ORDER',0,30,0,0,100,false,0,true,'Packing Charge','INR','₹')
    ON CONFLICT (tenant_id, outlet_id) DO NOTHING
  `, [tenantId, outletId]);

  const liquidsCatRes = await pool.query(
    `SELECT id FROM menu_categories WHERE tenant_id = $1 AND name ILIKE '%liquid%' LIMIT 1`,
    [tenantId]
  );
  const dryCatRes = await pool.query(
    `SELECT id FROM menu_categories WHERE tenant_id = $1 AND name ILIKE '%dry%' LIMIT 1`,
    [tenantId]
  );

  const liquidsIds = liquidsCatRes.rows[0] ? [liquidsCatRes.rows[0].id] : [];
  const dryIds = dryCatRes.rows[0] ? [dryCatRes.rows[0].id] : [];

  await pool.query(`
    INSERT INTO packing_charge_categories (tenant_id, outlet_id, category_name, takeaway_charge, delivery_charge, applies_to_categories)
    VALUES ($1,$2,'Liquids',15,25,$3)
    ON CONFLICT DO NOTHING
  `, [tenantId, outletId, JSON.stringify(liquidsIds)]);

  await pool.query(`
    INSERT INTO packing_charge_categories (tenant_id, outlet_id, category_name, takeaway_charge, delivery_charge, applies_to_categories)
    VALUES ($1,$2,'Dry Items',10,15,$3)
    ON CONFLICT DO NOTHING
  `, [tenantId, outletId, JSON.stringify(dryIds)]);

  const waterCatRes = await pool.query(
    `SELECT id, name FROM menu_categories WHERE tenant_id = $1 AND name ILIKE '%water%' LIMIT 1`,
    [tenantId]
  );
  if (waterCatRes.rows[0]) {
    await pool.query(`
      INSERT INTO packing_charge_exemptions (tenant_id, outlet_id, exemption_type, reference_id, reference_name, reason)
      VALUES ($1,$2,'CATEGORY',$3,$4,'Water bottles are exempt from packing charge')
      ON CONFLICT DO NOTHING
    `, [tenantId, outletId, waterCatRes.rows[0].id, waterCatRes.rows[0].name]);
  }

  console.log("[PackingSettings] Seeded packing charge settings, categories, and exemptions.");
}

export async function seedSpecialResources(): Promise<void> {
  const tenantsRes = await pool.query(`SELECT id FROM tenants WHERE slug != 'platform' LIMIT 1`);
  if (!tenantsRes.rows[0]) return;
  const tenantId = tenantsRes.rows[0].id;

  const outletRes = await pool.query(`SELECT id FROM outlets WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  if (!outletRes.rows[0]) return;
  const outletId = outletRes.rows[0].id;

  const existing = await pool.query(
    `SELECT id FROM special_resources WHERE tenant_id = $1 AND outlet_id = $2 LIMIT 1`,
    [tenantId, outletId]
  );
  if (existing.rows[0]) {
    console.log("[SpecialResources] Seed data already exists, skipping.");
    return;
  }

  const resourceDefs = [
    { code: "HIGH_CHAIR", name: "High Chair", icon: "🪑", totalUnits: 3, unitPrefix: "HC", isTrackable: true },
    { code: "BOOSTER_SEAT", name: "Booster Seat", icon: "🪑", totalUnits: 2, unitPrefix: "BS", isTrackable: true },
    { code: "BABY_COT", name: "Baby Cot", icon: "🛏️", totalUnits: 1, unitPrefix: "BC", isTrackable: true },
    { code: "WHEELCHAIR", name: "Wheelchair Access", icon: "♿", totalUnits: 0, unitPrefix: "WC", isTrackable: false },
    { code: "PRAYER_MAT", name: "Prayer Mat", icon: "🕌", totalUnits: 5, unitPrefix: "PM", isTrackable: true },
  ];

  for (const def of resourceDefs) {
    const res = await pool.query(
      `INSERT INTO special_resources (tenant_id, outlet_id, resource_code, resource_name, resource_icon, total_units, available_units, in_use_units, under_cleaning_units, damaged_units, is_trackable, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$6,0,0,0,$7,true)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [tenantId, outletId, def.code, def.name, def.icon, def.totalUnits, def.isTrackable]
    );
    const resourceId = res.rows[0]?.id;
    if (!resourceId) continue;

    if (def.isTrackable && def.totalUnits > 0) {
      for (let i = 1; i <= def.totalUnits; i++) {
        const unitCode = `${def.unitPrefix}-${String(i).padStart(2, "0")}`;
        await pool.query(
          `INSERT INTO resource_units (tenant_id, outlet_id, resource_id, unit_code, unit_name, status)
           VALUES ($1,$2,$3,$4,$5,'available')
           ON CONFLICT DO NOTHING`,
          [tenantId, outletId, resourceId, unitCode, `${def.name} ${i}`]
        );
      }
    }
  }

  console.log("[SpecialResources] Seeded 5 special resource types for demo outlet.");
}
