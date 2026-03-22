import { storage } from "./storage";
import { hashPassword } from "./auth";

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

  const pw = await hashPassword("demo123");

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
  console.log("Login credentials (all passwords: demo123):");
  console.log("  Owner: username=owner");
  console.log("  Manager: username=manager");
  console.log("  Waiter: username=waiter");
  console.log("  Kitchen: username=kitchen");
  console.log("  Accountant: username=accountant");
  console.log("\nKiosk URLs:");
  console.log("  Main Branch: /kiosk?token=kiosk-demo-token-main-001");
  console.log("  Marina Walk: /kiosk?token=kiosk-demo-token-marina-001");
  console.log("  Airport T3: /kiosk?token=kiosk-demo-token-airport-001");
}