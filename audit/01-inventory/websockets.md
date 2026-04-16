# Phase 1 — WebSocket Inventory

**Source:** `server/realtime.ts` + all `emitToTenant()` call sites
**Protocol:** Raw `ws` library over `/ws` endpoint
**Auth:** Session cookie validated on connection (session lookup in PG)
**Tenant scoping:** All sockets stored in `tenantSockets` Map keyed by tenantId
**Pub/sub:** Redis `tenant:*` pattern subscription when REDIS_URL configured; in-process EventEmitter fallback

---

## Connection Auth Flow (server/realtime.ts:71-107)

1. Parse `connect.sid` or `ts.sid` cookie from upgrade request
2. Verify HMAC signature against SESSION_SECRET
3. Look up session in `session` PG table
4. Extract `passport.user` (userId) from session data
5. Look up user to get `tenantId` and `role`
6. **Fallback paths (no cookie):**
   - `?token=<wallScreenToken>` — KDS wall screen auth via `tenants.wallScreenToken`
   - `?qrToken=<token>` — Guest QR session via `tableQrTokens.token`
   - `?tenantId=<id>` — Direct tenant ID (verifies tenant exists)
7. If no valid auth: `ws.close(4001, "Unauthorized")`

## Heartbeat (server/realtime.ts:259-298)

- Server sends `{"event":"ping"}` every 30 seconds
- Client must respond `{"event":"pong"}` within 10 seconds
- Per-socket deadline timer terminates stale connections
- Active connection count logged every 5 minutes

## Event Delivery

- `emitToTenant(tenantId, event, payload)` — broadcasts to all sockets for that tenant
- `emitToTenantManagers(tenantId, event, payload)` — only to owner/manager/hq_admin/franchise_owner/super_admin sockets (defined but not called from any router)
- Guest sockets only receive `table-request:*` events matching their tableId

---

## All WebSocket Events (73 distinct events)

### Order Lifecycle (12 events)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `order:new` | orders.ts:746 | New order created |
| `order:updated` | orders.ts, kitchen.ts, coordination.ts, service-coordination.ts, restaurant-billing.ts | Order status/data changed |
| `order:completed` | orders.ts:1070, kitchen.ts:104, restaurant-billing.ts:122,608 | Order reached terminal status |
| `order:ready` | kitchen.ts:821 | All items ready for pickup |
| `order:table_changed` | orders.ts:1103 | Order moved to different table |
| `order:table_transferred` | orders.ts:1277 | Table transfer completed |
| `order:tables_merged` | orders.ts:1310 | Two table orders merged |
| `order:bill_split` | orders.ts:1352 | Bill split into multiple |
| `order:stale_archived` | orders.ts:1248 | Stale orders auto-archived |
| `order:item_updated` | kitchen.ts:101,148 | Individual item status change |
| `order:delivery_accepted` | orders.ts:215,283 | Delivery order accepted |
| `order:delivery_rejected` | orders.ts:237,305 | Delivery order rejected |
| `order:delivery_dispatched` | orders.ts:255 | Delivery order dispatched |

### Kitchen / KDS (11 events)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `kitchen:new_order` | advance-order-scheduler.ts:44, service-coordination.ts:717 | New order sent to kitchen |
| `kds:order_arrived` | orders.ts:49,82 | KOT arrived at kitchen |
| `kds:item_started` | kitchen.ts:761 | Chef started item prep |
| `kds:item_held` | kitchen.ts:786 | Item placed on hold |
| `kds:item_ready` | kitchen.ts:827 | Item marked ready |
| `kds:hold_released` | kitchen.ts:833 | Hold released on item |
| `kds:order_rushed` | kitchen.ts:897,954 | Order priority escalated |
| `kds:items_ready_to_start` | kitchen.ts:1032 | Items queued for cooking |
| `kds:item_overdue` | kitchen.ts:1071 | Item past deadline |
| `kds:manager_alert` | kitchen.ts:1083 | Manager alerted about issue |
| `kds:course_fired` | kitchen.ts:1168 | Course fired to kitchen |
| `kds:refire_ticket` | ticket-history.ts:1036 | Ticket refired |
| `kds:timing_update` | time-logger.ts:256 | Timing data updated |

### Table Management (2 events)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `table:updated` | orders.ts, tables.ts | Table status changed |
| `table-request:new` | table-requests.ts:488 | New guest table request |
| `table-request:updated` | table-requests.ts:587,608,629,646 | Request status change |
| `table-request:escalated` | table-requests.ts:815 | Request auto-escalated |

### Chef Assignment / Prep (13 events)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `chef-assignment:updated` | chef-assignment.ts (multiple), prep-notifications.ts:210 | Assignment changed |
| `chef-assignment:rebalanced` | chef-assignment.ts:568 | Workload rebalanced |
| `chef-assignment:escalation` | chef-assignment.ts:589 | Unassigned ticket escalation |
| `chef-availability:changed` | kitchen-assignment.ts:144,169 | Chef availability toggled |
| `prep:task_started` | chef-assignment.ts:232 | Prep task started |
| `prep:task_completed` | chef-assignment.ts:286 | Prep task completed |
| `prep:task_verified` | chef-assignment.ts:462 | Prep task verified by supervisor |
| `prep:task_issue` | chef-assignment.ts:497 | Issue flagged on task |
| `prep:task_help` | chef-assignment.ts:523 | Help requested on task |
| `prep:dish_complete` | chef-assignment.ts:323 | Dish fully complete |
| `prep:all_complete` | chef-assignment.ts:356, prep-deadline-checker.ts:267 | All prep tasks done |
| `prep:task_overdue` | prep-deadline-checker.ts:61 | Task past deadline |
| `prep:deadline_warning` | prep-deadline-checker.ts:83,107 | Approaching deadline |
| `prep:readiness_summary` | prep-deadline-checker.ts:187 | Hourly readiness stats |
| `prep:low_readiness_alert` | prep-deadline-checker.ts:236 | Low readiness threshold |
| `prep:notification` | prep-notifications.ts:70 | Generic prep notification |
| `prep:task_reminder` | prep-notifications.ts:172 | Task reminder |
| `prep:task_assigned` | prep-notifications.ts:211 | Task assigned to chef |
| `prep:task_progress` | prep-notifications.ts:299 | Task progress update |

### Coordination (7 events)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `coordination:order_updated` | advance-order-scheduler.ts:38, coordination.ts:193,259, service-coordination.ts, table-requests.ts:407 | Order coordination state change |
| `coordination:item_ready` | coordination.ts:197, kitchen.ts:828, service-coordination.ts:296 | Item ready for service |
| `coordination:message` | coordination.ts:238, service-coordination.ts:366 | Service message sent |
| `coordination:alert` | coordination-rules.ts:88 | Coordination rule alert |
| `coordination:prompt` | coordination-rules.ts:224 | Coordination action prompt |
| `coordination:overload` | coordination-rules.ts:274 | Kitchen overload alert |
| `coordination:vip_flagged` | service-coordination.ts:167,216 | VIP status flagged |

### Cash & Billing (5 events)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `cash_session:opened` | cash-machine.ts:134 | Cash session started |
| `cash_session:payment` | cash-machine.ts:185 | Payment recorded in session |
| `cash_session:closed` | cash-machine.ts:302 | Cash session closed |
| `bill:updated` | ticket-history.ts:859 | Bill modified |
| `void_request:new` | ticket-history.ts:759 | Void request submitted |
| `void_request:approved` | ticket-history.ts:852 | Void request approved |
| `void_request:rejected` | ticket-history.ts:899 | Void request rejected |

### Alerts & Security (4 events)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `alert:trigger` | alert-engine.ts:47,75 | Alert triggered |
| `alert:acknowledged` | alert-engine.ts:101 | Alert acknowledged by user |
| `security_alert` | security-alerts.ts:49,56 | Security alert (rate anomaly, etc.) |
| `circuit_breaker:open` | circuit-breaker.ts:91 | Circuit breaker tripped |

### Stock & Inventory (4 events)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `stock:updated` | inventory.ts:197, procurement.ts (multiple), recipes.ts:282 | Stock level changed |
| `low_stock_alert` | bulk-start-order.ts:121, kitchen.ts:313,453 | Stock below reorder level |
| `stock-report:generated` | stock-capacity.ts:267 | Stock report generated |

### Menu (1 event)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `menu:updated` | menu.ts:94,118,148 | Menu item created/updated/deleted |

### Delivery (1 event)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `delivery:updated` | delivery.ts:105,131 | Delivery order status change |

### Counter/Kitchen Assignment (1 event)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `counter:updated` | kitchen-assignment.ts:37,49,60 | Kitchen counter CRUD |

### Allergy (2 events)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `allergy:alert` | modifications.ts:114, orders.ts:753 | Allergy flagged on order/item |
| `allergy:acknowledged` | modifications.ts:179 | Allergy acknowledged by kitchen |

### Wastage (4 events)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `wastage:high_entry` | wastage.ts:126 | High-value wastage logged |
| `wastage:repeat_pattern` | wastage.ts:143 | Repeat wastage pattern detected |
| `wastage:threshold_alert` | wastage.ts:168 | Wastage threshold exceeded |
| `wastage:target_exceeded` | wastage.ts:177 | Wastage target exceeded |

### Parking (1 event)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `parking:retrieval_requested` | parking.ts:426,499,786 | Vehicle retrieval requested |

### Printer (1 event)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `printer:status_changed` | printer-service.ts:774 | Printer online/offline |

### Resources (1 event)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `resource:updated` | resources.ts:277,288 | Resource availability changed |

### Support (1 event)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `support:new_reply` | support.ts:215 | Support ticket reply |

### System (1 event)
| Event | Source File(s) | Description |
|-------|---------------|-------------|
| `connected` | realtime.ts:227 | Sent on successful WS connection |
| `ping` | realtime.ts:275 | Server heartbeat ping |
| `pong` | realtime.ts:239 | Legacy client ping echo |

---

## Summary

- **73 distinct event names** emitted via `emitToTenant()`
- **160+ individual emit call sites** across the codebase
- **0 calls** to `emitToTenantManagers()` (function defined but unused)
- All events broadcast to **all sockets in the tenant** (except guest sockets filtered to table-request events)
- No per-user or per-role event filtering (except the unused `emitToTenantManagers`)
