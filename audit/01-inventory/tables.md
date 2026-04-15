# Phase 1 — Database Tables Inventory

**Source:** `shared/schema.ts`
**Total tables:** 179
**Total enums:** 23
**ORM:** Drizzle ORM (PostgreSQL dialect)

---

## Enums

| # | Name | Values |
|---|------|--------|
| 1 | `user_role` | owner, franchise_owner, hq_admin, manager, outlet_manager, supervisor, cashier, waiter, kitchen, accountant, auditor, customer, super_admin, delivery_agent, cleaning_staff |
| 2 | `order_status` | new, on_hold, confirmed, sent_to_kitchen, in_progress, ready, served, ready_to_pay, paid, completed, cancelled, voided, pending_payment |
| 3 | `order_type` | dine_in, takeaway, delivery |
| 4 | `table_status` | free, occupied, reserved, cleaning, blocked |
| 5 | `reservation_status` | pending, requested, confirmed, seated, completed, no_show |
| 6-23 | Additional enums for: ticket status, item status, payment status, void request status, cleaning task status, procurement statuses, stock movement types, leave types, etc. |

---

## Multi-Tenancy Summary

| Category | Count | Notes |
|----------|-------|-------|
| Tables with `tenant_id` column | 172 | Scoped to a specific tenant |
| Global tables (no `tenant_id`) | 7 | `session`, `salesInquiries`, `supportTickets`, `platformSettings`, `systemEvents`, `systemHealthLog`, `platformSettingsKv` |
| Total | 179 | |

**Global tables detail:**
- `session` — Express session store (PG-backed), has `sid` PK
- `platformSettings` — Single-row platform config (settingKey UNIQUE)
- `platformSettingsKv` — Key-value platform config
- `systemEvents` — Platform-level system events
- `systemHealthLog` — Health check log entries
- `salesInquiries` — Contact form submissions (no auth required)
- `supportTickets` — Support tickets (has optional tenantId but nullable)

---

## Tables by Domain

### Core Tenant & Auth (6 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `tenants` | id (uuid) | IS the tenant | name, slug (UNIQUE), currency, taxRate, taxType, plan, subscriptionStatus, stripeCustomerId, razorpayKeyId, razorpayKeySecret, gstin, cgstRate, sgstRate, moduleConfig (jsonb), wallScreenToken | slug UNIQUE |
| `users` | id (uuid) | YES (FK) | username (UNIQUE), password, name, email, phone, role (enum), active, totpSecret, totpEnabled, recoveryCodes[], pinHash, sessionToken, processingRestricted | username UNIQUE, idx_users_tenant_id |
| `outlets` | id (uuid) | YES (FK) | name, regionId (FK->regions), currencyCode, timezone, jurisdictionCode, taxRegistrationNumber, vatRegistered, outletTaxRate, qrRequestSettings (jsonb), assignmentSettings (jsonb), printSettings (jsonb), idleTimeoutMinutes | idx_outlets_tenant_id, idx_outlets_tenant_active |
| `regions` | id (uuid) | YES (FK) | name, description, sortOrder | |
| `passwordResetTokens` | id (uuid) | YES | userId, token (UNIQUE), expiresAt | token UNIQUE |
| `impersonationSessions` | id (uuid) | YES (FK) | adminId (FK->users), targetUserId (FK->users), startedAt, endedAt, reason, ipAddress | idx_impersonation_sessions_tenant_admin |

### Menu & Modifiers (5 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `menuCategories` | id | YES (FK) | name, sortOrder, active | idx_menu_categories_tenant_id |
| `menuItems` | id | YES (FK) | name, price (decimal 10,2), categoryId (FK), image, allergenFlags (jsonb), station, course, prepTimeMinutes, isDeleted (soft delete) | idx_menu_items_tenant_id, idx_menu_items_tenant_category |
| `modifierGroups` | id | YES | name, minSelections, maxSelections, isRequired | |
| `modifierOptions` | id | YES | groupId (FK), name, priceAdjustment (decimal), isDefault | |
| `menuItemModifierGroups` | id | YES | menuItemId (FK), modifierGroupId (FK) | |

### Tables & Zones (4 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `tableZones` | id | YES (FK) | outletId (FK), name, color | idx_table_zones_tenant_id |
| `tables` | id | YES (FK) | outletId (FK), number, capacity, zoneId (FK), status (enum), qrToken, mergedWith, callServerFlag, requestBillFlag | idx_tables_tenant_id, idx_tables_tenant_status |
| `waitlistEntries` | id | YES (FK) | outletId (FK), customerName, customerPhone, partySize, status, seatedTableId (FK) | idx_waitlist_tenant_status |
| `tableQrTokens` | id | YES | tableId (FK), token (UNIQUE), active, sessionId | UNIQUE(token) |

### Orders & Items (7 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `orders` | id | YES (FK) | outletId (FK), tableId (FK), waiterId (FK), customerId (FK), orderNumber, orderType (enum), status (enum), subtotal/tax/discount/total/serviceCharge/tips (all decimal 10,2), paymentMethod, channel, idempotencyKey, version (optimistic locking), posSessionId, parentOrderId, isDeleted (soft delete) | idx_orders_tenant_created, idx_orders_tenant_status |
| `orderItems` | id | YES | orderId (FK, CASCADE DELETE), menuItemId (FK), name, quantity, unitPrice (decimal 10,2), modifiers (jsonb), status, course, isVoided, station | idx_order_items_order_id |
| `orderItemModifications` | id | YES | orderItemId (FK), modificationType, description, acknowledgedBy, allergyInfo (jsonb) | |
| `orderTimeSummary` | id | YES | orderId (UNIQUE), kotToReady, readyToServe, totalWaitTime | UNIQUE(orderId) |
| `splitBillItems` | id | YES | orderId (FK), splitGroup, orderItemId (FK) | |
| `idempotencyKeys` | id | YES | requestKey (UNIQUE), responseData (jsonb), expiresAt | UNIQUE(requestKey) |
| `orderCourses` | id | YES | orderId (FK), courseNumber, status, firedAt | |

### Kitchen & KDS (7 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `kitchenStations` | id | YES | name, outletId (FK), assignedCategories (jsonb), color | |
| `kitchenCounters` | id | YES | outletId (FK), name, stationId, color, maxCapacity, isActive | |
| `chefAvailability` | id | YES | outletId (FK), userId (FK), counterId (FK), status, startTime, endTime | |
| `ticketAssignments` | id | YES | outletId (FK), orderId (FK), chefId (FK), counterId (FK), menuItemId (FK), status, deadlineAt, startedAt, completedAt, verifiedAt | idx_ticket_assignments_tenant_outlet_status |
| `recipeTimeBenchmarks` | id | YES | menuItemId (FK), outletId (FK), avgMinutes, p95Minutes, sampleCount | UNIQUE(tenantId, menuItemId, outletId) |
| `snapshotPrepTime` | id | YES | orderId (FK), computedAt, totalMinutes, perItem (jsonb) | |
| `cookingTimerLog` | id | YES | orderId (FK), orderItemId (FK), chefId (FK), startedAt, completedAt, durationSeconds | |

### Billing & Payments (4 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `bills` | id | YES | orderId (FK), outletId (FK), invoiceNumber, subtotal/tax/discount/total/serviceCharge/tips (all decimal 10,2), paymentStatus, paidAt, currencyCode, razorpayPaymentLinkId, stripeSessionId | UNIQUE(tenantId, invoiceNumber) |
| `billPayments` | id | YES | billId (FK), amount (decimal 10,2), method, transactionId, originalPaymentId (self-FK for refunds), isRefund | |
| `posSessionSnapshots` | id | YES | userId (FK), outletId (FK), openedAt, closedAt, openingFloat/closingBalance (decimal 12,2), salesBreakdown (jsonb) | |
| `tipDistributions` | id | YES | billId (FK), userId (FK), amount (decimal 10,2), method | |

### Customers & CRM (4 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `customers` | id | YES | name, phone, email, loyaltyPoints, loyaltyTier, totalSpend (decimal 12,2), visitCount, isDeleted (soft delete) | idx_customers_tenant_phone |
| `customerNotes` | id | YES | customerId (FK), note, createdBy (FK) | |
| `loyaltyTierLog` | id | YES | customerId (FK), previousTier, newTier, reason | |
| `customerFeedback` | id | YES | orderId (FK), customerId (FK), rating, comment | |

### Inventory & Stock (9 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `inventoryItems` | id | YES | outletId (FK), name, currentStock (decimal 10,3), reorderLevel (decimal 10,3), unit, costPerUnit (decimal 10,2) | idx_inventory_items_tenant |
| `stockMovements` | id | YES | inventoryItemId (FK), orderId (FK), type (enum), quantity (decimal 10,3), reason | idx_stock_movements_tenant_created |
| `stockAlerts` | id | YES | inventoryItemId (FK), outletId (FK), alertType, acknowledgedAt | |
| `stockTakes` | id | YES | outletId (FK), performedBy (FK), status | |
| `stockTakeItems` | id | YES | stockTakeId (FK, CASCADE), inventoryItemId (FK), systemQuantity, countedQuantity, varianceQuantity | |
| `stockCapacityReports` | id | YES | outletId (FK), reportType, reportData (jsonb), generatedAt | |
| `suppliers` | id | YES | name, email, phone, isDeleted (soft delete) | idx_suppliers_tenant |
| `recipes` | id | YES | menuItemId (FK), servingSize, ingredients (jsonb), isDeleted (soft delete) | |
| `recipeIngredients` | id | YES | recipeId (FK), inventoryItemId (FK), quantity (decimal 10,3), unit | |

### Procurement (9 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `purchaseOrders` | id | YES | supplierId (FK), outletId (FK), poNumber, status, totalAmount (decimal 12,2), isDeleted (soft delete) | |
| `purchaseOrderItems` | id | YES | purchaseOrderId (FK, CASCADE), inventoryItemId (FK), quantity, unitCost (decimal 10,2) | |
| `goodsReceivedNotes` | id | YES | purchaseOrderId (FK), outletId (FK), receivedBy (FK), status | |
| `grnItems` | id | YES | grnId (FK, CASCADE), purchaseOrderItemId (FK), receivedQuantity, acceptedQuantity | |
| `purchaseReturns` | id | YES | purchaseOrderId (FK), supplierId (FK), outletId (FK), status | |
| `purchaseReturnItems` | id | YES | returnId (FK, CASCADE), inventoryItemId (FK), quantity | |
| `rfqs` | id | YES | title, status | |
| `rfqItems` | id | YES | rfqId (FK, CASCADE), inventoryItemId (FK), quantity | |
| `supplierQuotations` | id | YES | rfqId (FK, CASCADE), supplierId (FK), totalAmount (decimal 12,2) | |
| `stockTransfers` | id | YES | fromOutletId (FK), toOutletId (FK), status | |
| `stockTransferItems` | id | YES | transferId (FK, CASCADE), inventoryItemId (FK), quantity | |
| `stockCountSessions` | id | YES | outletId (FK), status | |
| `stockCountItems` | id | YES | sessionId (FK, CASCADE), inventoryItemId (FK), systemQty, countedQty | |

### Staff & Workforce (10 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `staffSchedules` | id | YES | userId (FK), outletId (FK), date, startTime, endTime, role | |
| `shifts` | id | YES | userId (FK), outletId (FK), startedAt, endedAt, breakMinutes | |
| `attendance` | id | YES | userId (FK), outletId (FK), clockIn, clockOut, method | |
| `attendanceSettings` | id | YES | outletId (FK), minShiftMinutes, maxShiftMinutes | |
| `timeLogs` | id | YES | orderId (FK), orderItemId (FK), userId (FK), eventType, recordedAt | |
| `leaveRequests` | id | YES | userId (FK), leaveType, startDate, endDate, status, approvedBy (FK) | |
| `leaveBalances` | id | YES | userId (FK), leaveType, balance, year | |
| `cashDrawerLogs` | id | YES | outletId (FK), userId (FK), sessionId (FK), action, amount (decimal 12,2) | |
| `cashSessions` | id | YES | outletId (FK), userId (FK), openFloat (decimal 12,2), closeFloat, status | |
| `cashPayouts` | id | YES | sessionId (FK), amount (decimal 12,2), reason, approvedBy (FK) | |

### Reservations & Events (3 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `reservations` | id | YES (FK) | tableId (FK), customerId (FK), customerName, customerPhone, customerEmail, guests, dateTime, status (enum), isDeleted (soft delete), reminder24hSent, reminder2hSent | idx_reservations_tenant_datetime |
| `events` | id | YES | outletId (FK), name, date, guestCount, status | |
| `eventOrders` | id | YES | eventId (FK), orderId (FK) | |

### Delivery & Channels (5 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `deliveryOrders` | id | YES | orderId (FK), driverName, driverPhone, deliveryAddress, status, deliveryFee (decimal 10,2) | |
| `deliveryAgentLogs` | id | YES | agentId (FK), orderId (FK), status, location (jsonb) | |
| `orderChannels` | id | YES | name, slug, active, webhookUrl, webhookSecret, lastWebhookAt | |
| `aggregatorOrders` | id | YES | channelId (FK), externalOrderId, rawPayload (jsonb) | |
| `channelRevenueReports` | id | YES | channelId (FK), reportDate, revenue (decimal 12,2) | |

### Cleaning, Compliance, Alerts (8 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `cleaningTemplates` | id | YES | outletId (FK), name, frequency, items (jsonb) | |
| `cleaningTasks` | id | YES | templateId (FK), outletId (FK), assignedTo (FK), status, completedAt | |
| `complianceChecks` | id | YES | outletId (FK), checkType, result, performedBy (FK) | |
| `alertDefinitions` | id | YES | code (UNIQUE per tenant), name, severity, channel, enabled | |
| `alertEvents` | id | YES | outletId (FK), alertCode, severity, message, acknowledgedBy (FK) | idx_audit_events_tenant_created |
| `securityAlerts` | id | YES | alertType, severity, message, metadata (jsonb), acknowledgedBy (FK) | |
| `detectionAlerts` | id | YES | alertType, severity, metadata (jsonb), dismissed | |
| `alertEscalationRules` | id | YES | alertCode, escalateAfterMin, notifyRole | |

### Audit Trail (2 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `auditEvents` | id | YES | userId (FK), entityType, entityId, action, before (jsonb), after (jsonb), ipAddress | idx_audit_events_tenant_created (append-only, no DELETE/PUT/PATCH routes) |
| `auditEventsArchive` | id | YES | (same schema as auditEvents) | Archive for records >12 months |

### Wastage (2 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `wastageLogs` | id | YES | outletId (FK), menuItemId (FK), inventoryItemId (FK), quantity, reason, preventable, counterId (FK), chefId (FK), costEstimate (decimal 10,2) | idx_wastage_logs_tenant_created |
| `wastageDailySummaries` | id | YES | outletId (FK), summaryDate, totalItems, totalCost (decimal 12,2), preventableCount | |

### Notifications & Push (3 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `prepNotifications` | id | YES | outletId (FK), userId (FK), orderId (FK), type, message, isRead | |
| `pushSubscriptions` | id | YES | userId (FK), subscriptionData (jsonb) | |
| `smsLog` | id | YES | phone, message, provider, status, error | |

### Printing (3 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `printers` | id | YES | outletId (FK), name, type, ipAddress, port, status | |
| `printJobs` | id | YES | printerId (FK), orderId (FK), type, status, content (jsonb) | |
| `printTemplates` | id | YES | outletId (FK), name, type, template (jsonb) | |

### Pricing & Promotions (5 tables)

| Table | PK | tenant_id | Key Columns | FK / Unique |
|-------|-----|-----------|-------------|-------------|
| `outletMenuPrices` | id | YES | outletId (FK), menuItemId (FK), price (decimal 10,2), timeSlot, dayOfWeek, customerSegment | |
| `promotionRules` | id | YES | name, type, conditions (jsonb), rewards (jsonb), active, isDeleted (soft delete) | |
| `offers` | id | YES | name, type, discountValue (decimal 10,2), conditions (jsonb), active | |
| `tipSettings` | id | YES | outletId (FK), suggestedPercentages (jsonb), tipPoolEnabled | |
| `packingChargeSettings` | id | YES | outletId (FK), categories (jsonb), enabled | |

### Resources, Parking, Ads, Campaigns (14 tables)

| Table | PK | tenant_id | Key Columns |
|-------|-----|-----------|-------------|
| `specialResources` | id | YES | resourceName, resourceType, quantity |
| `resourceUnits` | id | YES | resourceId (FK), unitCode, status |
| `resourceAssignments` | id | YES | resourceUnitId (FK), assignedTo (FK) |
| `resourceCleaningLog` | id | YES | resourceUnitId (FK), cleanedBy (FK) |
| `valetTickets` | id | YES | outletId (FK), ticketNumber, vehicleInfo, status |
| `parkingZones` | id | YES | outletId (FK), name, capacity |
| `parkingChargeConfig` | id | YES | outletId (FK), freeMinutes, ratePerHour (decimal) |
| `adCampaigns` | id | YES | campaignName, budget (decimal 12,2), status |
| `adCreatives` | id | YES | campaignId (FK), creativeType, creativeUrl |
| `adImpressions` | id | YES | campaignId (FK), creativeId (FK), impressionCount |
| `adRevenueRecords` | id | YES | campaignId (FK), revenue (decimal 12,2), currency |
| `campaigns` | id | YES | campaignName, campaignType, status |
| `kioskDevices` | id | YES | outletId (FK), name, active |
| `qrSessions` | id | YES | tableId (FK), sessionId, items (jsonb), active |

### Platform / Global (7 tables)

| Table | PK | tenant_id | Key Columns |
|-------|-----|-----------|-------------|
| `session` | sid (varchar 255) | NO | sess (jsonb), expire, user_id, ip_address, user_agent |
| `platformSettings` | id | NO | settingKey (UNIQUE), settingValue (jsonb) |
| `platformSettingsKv` | id | NO | key, value |
| `systemEvents` | id | NO | eventType, severity, message, metadata (jsonb) |
| `systemHealthLog` | id | NO | status, dbResponseMs, memoryUsedMb, uptimeSeconds |
| `salesInquiries` | id | NO | name, email, phone, company, message |
| `supportTickets` | id | optional | subject, status, priority, messages (jsonb) |

### Reporting & Cache (3 tables)

| Table | PK | tenant_id | Key Columns |
|-------|-----|-----------|-------------|
| `reportJobs` | id | YES | reportType, status, resultData (jsonb) |
| `reportCache` | id | YES | cacheKey (UNIQUE), cacheData (jsonb), expiresAt |
| `onboardingChecklist` | id | YES | stepKey, completed |

---

## Key Architectural Observations

1. **All monetary values use `decimal(10,2)` or `decimal(12,2)`** — stored as strings in Drizzle, not floats. This is correct for money.
2. **Optimistic concurrency:** `orders` table has a `version` column for conflict detection.
3. **Soft delete pattern:** 11 tables use `isDeleted` + `deletedAt` + `deletedBy`.
4. **Cascade deletes:** 6 FK relationships use CASCADE (orderItems, rfqItems, supplierQuotations, stockTransferItems, purchaseReturnItems, stockCountItems).
5. **Self-referential FK:** `billPayments.originalPaymentId` -> `billPayments.id` for refund chains.
6. **Audit trail is append-only:** Startup assertion in `server/index.ts:576-586` verifies no DELETE/PUT/PATCH routes exist for audit endpoints.
7. **Razorpay credentials stored per-tenant:** `tenants.razorpayKeyId` and `tenants.razorpayKeySecret` — these are stored as plaintext in the tenants table.
