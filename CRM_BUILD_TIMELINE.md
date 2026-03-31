# CRM ANAQATOKI — DEFINITIVE BUILD TIMELINE
## Step-by-Step Roadmap — Nothing Missing, Nothing Confusing

> **How to read this**: Each phase has a clear goal, exact steps in order, what you build, how to test it, and what must work before moving on. Follow it top to bottom — no jumping ahead.

---

## 📋 REFERENCE DOCUMENTS

| # | Document | What to reference |
|---|---|---|
| 1 | `CRM_System_ORGANIZED.md` | Core modules, DB schema, business logic |
| 2 | `CRM_System_FINAL_ADDENDUM.md` | API routes, permissions, tech decisions |
| 3 | `CRM_BUILD_PLAN.md` | Missing logic (transitions, algorithms, events), project structure |
| 4 | `CRM_FINAL_SPECS.md` | UI/UX, branding, page layouts, design enhancements |

---

## 🧱 TECH STACK (Quick Reference)

| Layer | Technology |
|---|---|
| **Backend** | Node.js + Express + TypeScript |
| **Database** | PostgreSQL (no ORM — raw SQL with `pg` driver) |
| **Migrations** | `node-pg-migrate` |
| **Auth** | `express-session` + `connect-pg-simple` + `bcrypt` |
| **Validation** | Zod |
| **Real-time** | Socket.IO |
| **Frontend** | React + TypeScript + Vite |
| **UI Library** | Ant Design (customized with brown theme) |
| **State** | Zustand (auth, UI) + React Query (server data) |
| **Charts** | Recharts |
| **i18n** | react-i18next (English default, Arabic RTL toggle) |
| **Background Jobs** | node-cron |
| **Logging** | Winston |

---

# ═══════════════════════════════════════════════════════════
# PHASE 1 — FOUNDATION (Weeks 1-2)
# ═══════════════════════════════════════════════════════════

> **Goal**: A working app skeleton — login, sidebar, user management.

---

## Week 1: Backend Core

### Step 1.1 — Project Setup
```
What to do:
├── Create monorepo: crm-cod/backend + crm-cod/frontend
├── Backend: npm init → install Express, TypeScript, pg, dotenv, cors, helmet
├── Setup tsconfig.json (strict mode)
├── Setup ESLint + Prettier
├── Create docker-compose.yml for PostgreSQL
├── Start PostgreSQL container
└── Create .env file (see CRM_BUILD_PLAN.md §2 for all variables)
```

**Files to create**:
- `backend/src/app.ts` — Express entry point
- `backend/src/config/database.ts` — pg Pool connection
- `backend/src/config/env.ts` — Environment variable validation (Zod)
- `docker-compose.yml` — PostgreSQL 16

**✅ Test**: Run `npm run dev`, PostgreSQL connects, server starts on port 3001.

---

### Step 1.2 — Database Migrations (Core Tables)
```
Run these migrations IN ORDER:
├── 001_create_users_and_auth.sql
├── 002_create_roles_and_permissions.sql
├── 003_create_stores.sql              ← NEW (multi-store support)
├── 004_create_products_and_variants.sql
├── 005_create_customers.sql
├── 006_create_orders.sql              ← includes store_id FK
├── 007_create_order_items_and_assignments.sql
├── 008_create_couriers_and_shipping.sql
├── 009_create_returns.sql
├── 010_create_commissions.sql
├── 011_create_expenses.sql
├── 012_create_call_centre.sql
├── 013_create_audit_logs.sql
├── 014_create_settings_and_notifications.sql
├── 015_create_file_uploads.sql
├── 016_create_delivery_queue.sql
├── 017_create_scheduled_callbacks.sql
├── 018_create_order_locks.sql
├── 019_create_notification_logs.sql
├── 020_create_courier_invoices.sql
├── 021_create_materialized_views.sql
├── 022_create_indexes.sql
├── 023_seed_permissions.sql
├── 024_seed_default_roles.sql
├── 025_seed_admin_user.sql
├── 026_seed_status_definitions.sql
├── 027_create_ad_campaigns.sql         ← ads cost tracking tables
├── 028_create_ad_daily_costs.sql
├── 029_create_customer_tags.sql
├── 030_create_customer_notes.sql
├── 031_create_webhook_logs.sql
├── 032_create_sync_logs.sql            ← for polling fallback
├── 033_create_field_mappings.sql
└── 034_add_store_id_to_orders_products.sql
```

> **Reference**: 
> - Schema details → `CRM_System_ORGANIZED.md` §10-11
> - Missing tables → `CRM_System_FINAL_ADDENDUM.md` §6
> - Multi-store schema → `CRM_FINAL_SPECS.md` §31

**✅ Test**: Run all migrations. Check with `\dt` in psql — you should see 46+ tables.

---

### Step 1.3 — Middleware Layer
```
Create these middleware files:
├── auth.ts              — Session check, load user + permissions from DB
├── permission.ts        — requirePermission('view_orders') guard
├── validate.ts          — Zod request body/query validation
├── softDelete.ts        — Auto-filter deleted_at IS NULL on all queries
├── rateLimiter.ts       — express-rate-limit (100/15min global, 10/15min login)
├── errorHandler.ts      — Catch all errors → return standard JSON format
└── upload.ts            — Multer config (10MB max, allowed file types)
```

> **Reference**: 
> - Error format → `CRM_BUILD_PLAN.md` §9
> - CORS + Security → `CRM_BUILD_PLAN.md` §13
> - Permissions list → `CRM_System_FINAL_ADDENDUM.md` §10

**✅ Test**: Hitting any protected route without login returns `401 UNAUTHORIZED`.

---

## Week 2: Auth + Frontend Scaffold

### Step 1.4 — Auth System (Backend)
```
Routes to implement:
├── POST /api/auth/login      — validate credentials, create session
├── POST /api/auth/logout     — destroy session
├── GET  /api/auth/me         — return current user + permissions
└── POST /api/auth/change-password — authenticated user changes own password
```

> **Reference**: `CRM_System_FINAL_ADDENDUM.md` §1 (session config)

**✅ Test**: Login with seed admin user → get session cookie → `/me` returns user data.

---

### Step 1.5 — Users + Roles CRUD (Backend)
```
Routes:
├── GET    /api/users              — list users (paginated)
├── POST   /api/users              — create user (admin only)
├── PUT    /api/users/:id          — update user
├── DELETE /api/users/:id          — soft delete
├── POST   /api/users/:id/reset-password — admin resets user password
├── GET    /api/roles              — list roles
├── POST   /api/roles              — create custom role
├── PUT    /api/roles/:id          — update role permissions
└── DELETE /api/roles/:id          — delete non-system role
```

---

### Step 1.6 — Frontend Scaffold
```
Setup:
├── npx create-vite frontend --template react-ts
├── Install: antd, @ant-design/icons, antd-dayjs, zustand, @tanstack/react-query, 
│            axios, react-router-dom, react-i18next, socket.io-client, recharts
├── Configure Ant Design theme (brown palette from CRM_FINAL_SPECS.md §1)
├── Setup React Router
├── Setup axios instance (baseURL, withCredentials: true)
├── Setup React Query client
└── Setup Zustand stores (useAuthStore, useUIStore, useSocketStore)
```

> **Reference**: 
> - Color palette → `CRM_FINAL_SPECS.md` §1 (6 brown shades)
> - Sidebar layout → `CRM_FINAL_SPECS.md` §2

---

### Step 1.7 — Login Page + Layout
```
Build:
├── Login page (username + password form, brand logo ANAQATOKI)
├── Protected route wrapper (redirect to login if no session)
├── App Layout:
│   ├── Dark sidebar (left) with navigation menu
│   ├── Header bar with:
│   │   ├── 🔍 Global search bar (placeholder, build in Phase 6)
│   │   ├── 🔔 Notification bell (placeholder)
│   │   ├── 🌐 Language toggle (EN/AR)
│   │   └── 👤 User avatar + dropdown (Profile, Logout)
│   └── Content area
├── Sidebar items based on user permissions
└── Responsive collapse on smaller screens
```

> **Reference**: 
> - Sidebar nav items → `CRM_FINAL_SPECS.md` §2
> - Global search → `CRM_FINAL_SPECS.md` §32 (implement in Phase 6)

### ✅ PHASE 1 EXIT CHECK
```
□ Can start the app (backend + frontend)
□ PostgreSQL has all 46+ tables
□ Can login as admin
□ See dark sidebar with navigation
□ Can create users and assign roles
□ Permissions work (agent can't access admin pages)
□ Logout works
```

---

# ═══════════════════════════════════════════════════════════
# PHASE 2 — ORDERS CORE (Weeks 3-4)
# ═══════════════════════════════════════════════════════════

> **Goal**: Full order lifecycle — create, list, filter, confirm, assign, track changes.

---

## Week 3: Products, Customers, Orders CRUD

### Step 2.1 — Products + Variants
```
Backend:
├── GET    /api/products            — list with variants, stock, images
├── POST   /api/products            — create product + variants
├── PUT    /api/products/:id        — update product
├── DELETE /api/products/:id        — soft delete
├── PUT    /api/products/:id/variants/:vid — update variant (price, stock, cost)
└── POST   /api/products/:id/images — upload product images (Multer)

Frontend — Products page:
├── Table with: Name, Image, SKU, Variants count, Total Stock, Price Range, Status
├── Create/Edit drawer with variant matrix (Size × Color → price, stock, cost per cell)
├── Image upload (drag & drop)
└── Stock KPIs: Total Products, Low Stock (< threshold), Out of Stock
```

> **Reference**:
> - Variant matrix UI → `CRM_FINAL_SPECS.md` §22
> - Stock management → `CRM_System_ORGANIZED.md` §5

---

### Step 2.2 — Customers CRUD
```
Backend:
├── GET    /api/customers           — list (paginated, search by name/phone)
├── POST   /api/customers           — create customer
├── GET    /api/customers/:id       — profile + order history
├── PUT    /api/customers/:id       — update customer
├── POST   /api/customers/:id/notes — add timestamped note
├── POST   /api/customers/:id/tags  — add/remove tag (VIP, Blacklist, Wholesale, etc.)
└── Phone normalization: all phones stored as +212XXXXXXXXX

Frontend — Customers page:
├── Table with: Name, Phone, City, Order Count, Total Spent, Tags, Last Order Date
├── Customer detail page:
│   ├── Profile info (name, phone, address, city)
│   ├── Tags (VIP, Blacklist, Wholesale, Repeat, High Return)
│   ├── Order history table (all orders for this customer)
│   └── Notes timeline (timestamped, who wrote it)
└── Search works across name, phone, city
```

> **Reference**: `CRM_System_ORGANIZED.md` §6 + `CRM_FINAL_SPECS.md` §24

---

### Step 2.3 — Orders CRUD (Manual)
```
Backend:
├── GET    /api/orders              — list with filters, pagination, sorting
├── POST   /api/orders              — create manual order
├── GET    /api/orders/:id          — full order detail
├── PUT    /api/orders/:id          — edit order (with admin unlock if confirmed)
├── DELETE /api/orders/:id          — soft delete
└── GET    /api/orders/:id/history  — audit log timeline

Frontend — Create Order form:
├── Customer search (by phone → auto-fill if existing)
├── Product/variant selector (add multiple items)
├── Quantity per item
├── Auto-calculate total
├── Source dropdown: Manual, WhatsApp, Instagram, Phone
├── Delivery notes (textarea)
├── Address + City fields
└── [Save as Pending] button

Frontend — All Orders page (enhanced):
├── Filter Pills (inline compact dropdowns):
│   ├── Confirmation status
│   ├── Shipping status
│   ├── Delivery company
│   ├── Source
│   ├── Product
│   └── City
├── ⚙️ Columns toggle button (select which columns to show, saved in localStorage)
├── Universal search bar
├── Select All checkbox + bulk actions (Export CSV, Assign Agent)
├── Table columns (configurable):
│   ├── Order # 
│   ├── Customer name (+ 📦N badge for repeat customers)
│   ├── Phone (+ 📋 copy icon)
│   ├── Product + variant
│   ├── Amount (MAD)
│   ├── Confirmation status pill (color-coded)
│   ├── Shipping status pill (color-coded)
│   ├── Source
│   ├── City
│   ├── Assigned agent
│   ├── Created date (DD/MM/YYYY)
│   └── Actions: 👁️ View | ✏️ Edit | 📞 Call | 🗑️ Delete
└── Pagination at bottom (page size: 20, configurable)
```

> **Reference**:
> - Filter pills → `CRM_FINAL_SPECS.md` §29
> - Column toggle → `CRM_FINAL_SPECS.md` §29
> - Status pills → `CRM_FINAL_SPECS.md` §33
> - Order table → `CRM_System_ORGANIZED.md` §4

---

## Week 4: Order Lifecycle + Real-Time

### Step 2.4 — Order Confirmation Flow
```
Backend:
├── PUT /api/orders/:id/confirm — confirmation popup logic
│   ├── Validate stock availability for all items
│   ├── Apply discount if provided (fixed or percentage)
│   ├── Log discount in audit_logs
│   ├── Update confirmation_status → 'confirmed'
│   ├── DEDUCT stock for each variant
│   └── Create audit log entry

Frontend — Confirmation popup (modal):
├── Order summary (items, quantities, prices)
├── Discount section:
│   ├── Type: [Fixed ▼] or [Percentage ▼]
│   ├── Amount: [___] MAD
│   ├── New total calculated live
│   └── Discount reason (optional text)
├── Stock check indicator (✅ In Stock / ❌ X items out of stock)
├── Call notes (textarea — what customer said)
└── [Confirm Order] button (disabled if stock insufficient)
```

> **Reference**: `CRM_System_ORGANIZED.md` §4.1.3 + `CRM_System_FINAL_ADDENDUM.md` §5

---

### Step 2.5 — Order Status Transitions
```
Implement the FULL transition matrix from CRM_BUILD_PLAN.md §3:

Backend service: order.service.ts → changeStatus(orderId, newStatus)
├── Validate transition is allowed (check matrix)
├── Apply stock impact (deduct, restore, or none — see stock impact table)
├── Create audit log (who, when, from → to)
├── Send notification to relevant users
├── Emit Socket.IO event: 'order:statusChanged'
└── Handle special cases:
    ├── 'unreachable' → increment unreachable_count → auto 'fake' at 5
    ├── 'reported' → require callback datetime picker
    ├── 'confirmed' → 'cancelled' requires admin unlock
    └── 'out_of_stock' → add to restock queue
```

> **Reference**: `CRM_BUILD_PLAN.md` §3 (full matrix + stock impact table)

---

### Step 2.6 — Order Assignment
```
Backend:
├── POST /api/orders/:id/assign     — manual assign to agent
├── POST /api/orders/auto-assign    — run auto-assignment rules
├── GET  /api/orders/unassigned     — list unassigned orders

Auto-assignment algorithm (from CRM_BUILD_PLAN.md §4):
├── Check AssignmentRules table (ordered by priority)
├── Evaluate conditions (source, city, product)
├── Apply method: round_robin, workload, geographic, or manual
├── Fallback: round_robin if no rule matches
├── Create OrderAssignment record
├── Notify assigned agent
└── Emit 'order:assigned'
```

---

### Step 2.7 — Socket.IO Setup + Real-Time
```
Backend:
├── Configure Socket.IO server (attach to Express)
├── Authenticate socket connections (validate session cookie)
├── Room strategy:
│   ├── user:{userId}      — personal notifications
│   ├── page:orders        — order list updates
│   └── order:{orderId}    — specific order lock/edit events
├── Implement event bus (eventBus.ts)
└── Fire events on: order create, assign, status change, update

Frontend:
├── useSocketStore.ts — manage connection, reconnection, rooms
├── Disconnect handling:
│   ├── Show "⚠️ Connection lost" banner
│   ├── On reconnect → invalidate React Query cache (refetch all)
│   └── Exponential backoff (1s → 2s → 4s → 8s)
├── Auto-join room when viewing orders page
└── Listen for updates → trigger React Query refetch or optimistic update
```

> **Reference**: `CRM_BUILD_PLAN.md` §6 (event catalog) + §10 (disconnect handling)

---

### Step 2.8 — Order History Viewer (👁️)
```
Frontend — History modal (opens from eye icon):
├── Timeline component (Ant Design Timeline)
├── Newest entry first
├── Each entry shows:
│   ├── 📅 Date/Time
│   ├── 👤 User who made the change
│   ├── 🏷️ Action type badge (Status Change, Field Edit, Assignment, etc.)
│   └── 📝 Details: "Status changed from pending → confirmed"
│                    "Phone edited: 061... → 069..."
│                    "Assigned to Ahmed B."
│                    "Discount applied: 20 MAD"
└── Loads from GET /api/orders/:id/history (queries audit_logs by order_id)
```

### ✅ PHASE 2 EXIT CHECK
```
□ Can create products with multiple variants and images
□ Can create customers (phone normalized to +212)
□ Can create manual orders
□ Orders list shows with filter pills and status pills
□ Can confirm an order (discount works, stock deducted)
□ Can change statuses (all transitions validated)
□ Stock auto-adjusts on confirm/cancel
□ Orders assigned to agents (manual + auto)
□ Real-time updates work (open 2 browsers, change in one → appears in other)
□ Order history (👁️) shows all changes
□ Column toggle works (saves to localStorage)
```

---

# ═══════════════════════════════════════════════════════════
# PHASE 3 — STOCK + YOUCAN INTEGRATION (Weeks 5-6)
# ═══════════════════════════════════════════════════════════

> **Goal**: Stock management works perfectly. YouCan orders flow in automatically.

---

## Week 5: Stock Management

### Step 3.1 — Stock Deduction/Restoration Engine
```
Backend service: stock.service.ts
├── deductStock(variantId, qty, orderId, reason) — with DB transaction
├── restoreStock(variantId, qty, orderId, reason) — with DB transaction
├── Concurrency: Use SELECT ... FOR UPDATE to prevent race conditions
├── Every stock change creates audit_log entry
├── Low stock check: if new qty ≤ threshold → emit 'stock:lowAlert'
└── Out of stock: if new qty = 0 → flag variant, check pending orders

All stock changes triggered automatically:
├── pending → confirmed: DEDUCT
├── confirmed → cancelled: RESTORE
├── return verified (OK): RESTORE
├── return verified (damaged): NO CHANGE
└── See CRM_BUILD_PLAN.md §3 for full stock impact table
```

---

### Step 3.2 — Stock Page (Frontend)
```
Page layout:
├── KPI Cards: Total Products, Total Value, Low Stock Count, Out of Stock Count
├── Table:
│   ├── Product name + image
│   ├── Variant (Size/Color)
│   ├── SKU
│   ├── Current Stock (editable inline)
│   ├── Reserved (in confirmed orders)
│   ├── Available (stock - reserved)
│   ├── Low Stock Threshold (editable)
│   └── Status indicator (🟢 OK, 🟡 Low, 🔴 Out)
├── Filters: Category, Stock Status, Product
├── Manual stock adjustment: +/- buttons with reason note
└── Variant matrix editor (click product → expand → edit all variants)
```

> **Reference**: `CRM_FINAL_SPECS.md` §22

---

### Step 3.3 — Out-of-Stock Queue
```
When stock runs out:
├── Orders with status 'out_of_stock' are queued
├── When stock is restocked (manual or import):
│   ├── System finds orders in out_of_stock queue for that variant
│   ├── Sends notification: "📦 Product X is back in stock — 3 orders waiting"
│   └── Admin/agent can bulk-confirm from the queue
└── Queue visible in dedicated tab on Orders page
```

---

### Step 3.4 — Order Merge Feature
```
Flow:
├── Detect: same phone_norm + 2+ orders with status 'pending'
├── Show badge on order: "Customer has 2 pending orders — Merge available"
├── Merge modal:
│   ├── Show all pending orders for this customer
│   ├── User selects which orders to merge
│   ├── User can edit combined items (add/remove/change qty)
│   ├── System combines: items, notes, keeps earliest order number
│   └── [Merge] button
├── After merge:
│   ├── Primary order: updated with combined items
│   ├── Secondary orders: status → 'merged_into', reference primary
│   └── Audit log records the merge action
└── Stock validation before merge
```

> **Reference**: `CRM_System_ORGANIZED.md` §4.1.9

---

## Week 6: YouCan Integration

### Step 3.5 — YouCan OAuth + Store Connection
```
Backend:
├── GET  /api/stores/connect         — redirect to YouCan OAuth
├── GET  /api/stores/callback        — handle OAuth callback, save token
├── GET  /api/stores                 — list connected stores
├── POST /api/stores/:id/field-mapping — save checkout field mapping
├── PUT  /api/stores/:id             — update sync settings
├── DELETE /api/stores/:id           — disconnect store
└── POST /api/stores/:id/sync        — trigger manual sync

Frontend — YouCan Integration page (Settings → Integrations):
├── First time: 4-step onboarding wizard
│   ├── Step 1: OAuth authorization (popup)
│   ├── Step 2: Select store (if multiple)
│   ├── Step 3: Field mapping (YouCan checkout fields → CRM fields)
│   └── Step 4: Initial sync dialog (choose: All Orders vs Today Only)
├── After setup: Integration Performance Dashboard
│   ├── Table: Store name, Status, Products synced, Orders imported, Success rate, Last sync
│   └── Actions: 🔄 Manual sync, ⚙️ Settings modal, 🗑️ Delete
├── Settings modal (3 tabs):
│   ├── Settings: name, field mapping, status toggle
│   ├── Sync: frequency, direction, type, KPI cards, last sync time
│   └── Logs: paginated sync log entries (timestamp, event, status, details)
└── Multi-store: "+ Add New Integration" button → repeat flow for another store
```

> **Reference**: `CRM_FINAL_SPECS.md` §31 (full wireframes)

---

### Step 3.6 — YouCan Webhook + Polling Fallback
```
Backend — Webhook receiver:
├── POST /webhooks/youcan
├── Verify HMAC signature
├── Handle events: order.create, order.update, product.create, product.update
├── Process flow (see CRM_BUILD_PLAN.md §11):
│   ├── Check duplicate by external_order_id
│   ├── Normalize phone → find/create customer
│   ├── Map items → find/create variants
│   ├── Create order (status: pending)
│   ├── Run auto-assignment
│   ├── Emit 'order:created'
│   └── Check merge candidates
└── Save raw payload to webhook_logs table

Backend — Polling fallback worker:
├── Runs every X minutes (configurable per store: 5, 10, 15, 30 min)
├── For each active store:
│   ├── Fetch orders updated after last_sync_at from YouCan API
│   ├── Fetch products updated after last_sync_at
│   ├── Deduplicate by youcan_id (skip if already imported)
│   ├── Process new items same as webhook flow
│   ├── Update store.last_sync_at
│   └── Log to sync_logs (source: 'poll')
└── Can be disabled ("Manual only" option)
```

> **Reference**: `CRM_FINAL_SPECS.md` §31 (sync architecture diagram)

---

### Step 3.7 — Product Sync (YouCan → CRM)
```
When YouCan product webhook fires or polling finds new products:
├── Create/update product in CRM
├── Sync all variants (size, color, SKU, price)
├── Download and store product images
├── Link product to store via store_id
├── Track sync status in sync_logs
└── NOTE: Sync is ONE-WAY (YouCan → CRM only). CRM is source of truth for stock.
```

### ✅ PHASE 3 EXIT CHECK
```
□ Stock deducts on confirm, restores on cancel
□ Low stock alerts fire when quantity drops below threshold
□ Out-of-stock orders queued, notification when restocked
□ Order merge works for same customer
□ Can connect YouCan store via OAuth
□ Field mapping UI works
□ YouCan orders auto-import (via webhook)
□ Polling fallback catches missed events
□ Products sync from YouCan
□ Multi-store: can connect second store
□ Integration dashboard shows all stores with metrics
□ Customer profile shows order history
```

---

# ═══════════════════════════════════════════════════════════
# PHASE 4 — DELIVERY + RETURNS (Weeks 7-8)
# ═══════════════════════════════════════════════════════════

> **Goal**: Ship orders to delivery company, track them, process returns at warehouse.

---

## Week 7: Delivery Integration

### Step 4.1 — Delivery Company API Integration (Coliix)
```
Backend:
├── POST /api/delivery/export/:orderId   — send order to Coliix API
├── GET  /api/delivery/track/:trackingId — get tracking status
├── GET  /api/delivery/label/:orderId    — get shipping label PDF
├── POST /webhooks/coliix               — receive status updates

Export flow:
├── Validate order is confirmed
├── Map CRM fields → Coliix API format (name, phone, address, city, amount)
├── Send to Coliix API
├── If success: update shipping_status → 'pickup_scheduled', save tracking_number
├── If fail: add to delivery_export_queue (retry up to 3 times)
├── Emit 'order:statusChanged'
└── Create audit log

Delivery status mapping (Coliix → CRM):
├── "picked_up" → pickup_scheduled
├── "in_transit" → in_transit
├── "delivered" → delivered (triggers commission calculation!)
├── "returned" → returned (trigger return verification flow)
└── Unknown → log warning, keep current status
```

> **Reference**: 
> - Courier mapping → `CRM_System_ORGANIZED.md` §7
> - Retry queue → `CRM_BUILD_PLAN.md` §12

---

### Step 4.2 — Delivery Management Page (Frontend)
```
Page layout:
├── KPI Cards: Ready to Ship, In Transit, Delivered Today, Return Rate
├── Tabs: Ready to Ship | In Transit | Delivered | Returned
├── Table:
│   ├── Order #, Customer, City, Amount, Tracking #, Status pill, Delivery Company
│   └── Actions: 🚚 Export, 🏷️ Print Label, 📦 Track
├── Bulk actions: Select multiple → [🚚 Export All] [🏷️ Print All Labels]
├── Shipping label: opens browser print dialog (clean layout, address + barcode)
└── Export retry indicator: shows ⚠️ if export failed, click to retry
```

---

### Step 4.3 — Delivery Export Retry Queue
```
Background worker: deliveryRetry.worker.ts (runs every 2 min)
├── Find records in delivery_export_queue WHERE status = 'pending' OR 'failed'
├── For each: retry Coliix API call
├── Max 3 attempts with exponential backoff
├── After 3 failures: notify admin, mark as 'permanent_failure'
└── Admin can manually retry from UI
```

---

## Week 8: Returns + Concurrent Editing

### Step 4.4 — Returns Verification Page
```
Backend:
├── GET  /api/returns                    — list returns (filterable by status)
├── POST /api/returns/:orderId/verify    — verify a return (ok / damaged / wrong)
├── GET  /api/returns/scan/:trackingNum  — lookup order by tracking number

Returns Verification Page layout:
├── Header: "🔄 Returns Verification" + [📱 Scan QR Code] button
├── KPI Cards:
│   ├── Pending Verification (count)
│   ├── Verified Today (count)
│   ├── Total Returned (all time)
│   └── Return Rate (last 30 days %)
├── Tabs: ⏳ Pending Verification (12) | ✅ Verified (234)
├── Filters: search bar, delivery company dropdown, date range
├── Table:
│   ├── ☐ checkbox, Order #, Customer, Amount, Delivery Co., Tracking #, Return Date
│   └── Actions: [✅ Verify] [👁️ View Order] [📝 Add Note]
└── QR Code Scanner modal:
    ├── Camera feed (browser API) — scans barcode/QR on package
    ├── OR manual tracking number input
    └── Auto-finds order → one-click verify

Verification flow (confirmed by user):
├── Returns = client REFUSED delivery (never received product)
├── Courier brings undelivered package BACK TO YOUR WAREHOUSE
├── Warehouse staff scans package → finds order
├── Inspects package:
│   ├── ✅ "Product OK" → stock RESTORED to inventory
│   ├── ⚠️ "Damaged" → stock NOT restored, mark as damaged
│   └── ❌ "Wrong Package" → flag for investigation
├── Verified returns move to "Verified" tab
└── Commission: NOT affected (agent never earned it — commission only on delivered)
```

> **Reference**: `CRM_FINAL_SPECS.md` §30

---

### Step 4.5 — Concurrent Editing (Order Locks)
```
Backend:
├── POST /api/orders/:id/lock     — acquire lock (5 min expiry)
├── DELETE /api/orders/:id/lock   — release lock
├── Background worker: lockCleanup (every 1 min) — delete expired locks

Frontend:
├── When user opens order detail → acquire lock
├── If locked by another user → show banner: "⚠️ Ahmed is currently editing this order"
├── Disable edit fields, show "Request Edit" button
├── When user leaves page or saves → release lock
├── Lock auto-expires after 5 min of inactivity
└── Socket.IO events: 'order:locked' and 'order:unlocked'
```

---

### Step 4.6 — Scheduled Callbacks
```
For orders with status 'reported':
├── Agent picks callback date/time via datetime picker
├── Save to scheduled_callbacks table
├── Background worker: callbackReminder (every 5 min)
│   ├── Find callbacks due in next 15 minutes
│   └── Send notification to assigned agent
├── When agent calls back:
│   ├── Update order status (confirmed, cancelled, unreachable)
│   └── Log call result in audit
└── Show "Callbacks Due Today" count on Call Centre page
```

### ✅ PHASE 4 EXIT CHECK
```
□ Can export confirmed orders to Coliix
□ Shipping labels display and print
□ Delivery status updates come in (webhook or manual)
□ Shipped → Delivered triggers commission calculation
□ Shipped → Returned shows in Returns page
□ QR scanner finds order by tracking number
□ Can verify returns (OK → stock restored, Damaged → flagged)
□ Commission NOT deducted on returns (verified)
□ Order locking prevents 2 agents editing same order
□ Scheduled callbacks work with reminder notifications
□ Delivery retry queue retries failed exports
```

---

# ═══════════════════════════════════════════════════════════
# PHASE 5 — COMMISSIONS + EXPENSES (Weeks 9-10)
# ═══════════════════════════════════════════════════════════

> **Goal**: Agents earn commissions on delivered orders. Track all business expenses.

---

## Week 9: Commission System

### Step 5.1 — Commission Calculation Engine
```
Backend service: commission.service.ts
├── Triggered when: shipping_status → 'delivered'
├── Algorithm (from CRM_BUILD_PLAN.md §5):
│   ├── Load order + order_items + assigned agent
│   ├── For each item, find matching CommissionRule:
│   │   ├── Priority 1: agent_id + product_id (most specific)
│   │   ├── Priority 2: agent_id + category
│   │   ├── Priority 3: agent_id only (default rate)
│   │   └── Priority 4: global default (from SystemSettings)
│   ├── Calculate per item:
│   │   ├── fixed → rate value (e.g., 10 MAD per item)
│   │   ├── percentage_sale → unit_price × qty × rate / 100
│   │   └── percentage_margin → (unit_price - cost_price) × qty × rate / 100
│   ├── Sum all → total order commission
│   └── Insert into Commissions table (status: 'new')
└── Notify managers: "Commission 45 MAD calculated for Agent X on Order #123"
```

> **Key rule**: Commission is ONLY calculated on delivered orders. Returns = refused delivery = never delivered = no commission earned = nothing to deduct.

---

### Step 5.2 — Commission Management Page
```
Backend:
├── GET    /api/commissions              — list all commissions (filterable)
├── PUT    /api/commissions/:id/approve  — approve commission
├── PUT    /api/commissions/:id/reject   — reject commission
├── POST   /api/commissions/payout       — batch payout (creates expense)

Frontend:
├── KPI Cards: Total Earned, Total Paid, Total Pending, Avg Commission
├── Tabs: New | Approved | Paid | Rejected
├── Table: Agent, Order #, Amount, Type, Status, Date, Actions (Approve/Reject/Pay)
├── Commission Rules page (Settings):
│   ├── Default rate
│   ├── Per-agent rates
│   ├── Per-product rates
│   └── Per-agent-per-product rates
└── Agent view:
    ├── Commission cards: 💰 Paid | 💵 Owed | ⚠️ Pending
    └── Can only see own commissions (filtered by agent_id)
```

> **Reference**: `CRM_FINAL_SPECS.md` §28 (commission cards in Call Centre)

---

## Week 10: Expenses System

### Step 5.3 — Expenses CRUD
```
Backend:
├── GET    /api/expenses              — list expenses (filterable by category, status)
├── POST   /api/expenses              — create expense + optional attachment
├── PUT    /api/expenses/:id          — update expense
├── PUT    /api/expenses/:id/approve  — approve expense (admin/manager)
├── PUT    /api/expenses/:id/pay      — mark as paid
└── DELETE /api/expenses/:id          — soft delete

Categories: Shipping, Commission Payouts, Marketing/Ads, Supplies, Salaries, Office, Other

Frontend:
├── KPI Cards: Total Expenses (Month), Pending Approval, Paid This Month
├── Table: Category, Description, Amount, Status (Pending/Approved/Paid), Date, Receipt
├── Create expense form with file upload (receipt/invoice)
├── Recurring expenses: set frequency (weekly, monthly, yearly)
└── Auto-approved expenses from commission payouts
```

---

### Step 5.4 — Ads Cost Tracking
```
Backend:
├── GET    /api/ads/campaigns         — list campaigns
├── POST   /api/ads/campaigns         — create campaign (platform, name, date range)
├── POST   /api/ads/campaigns/:id/costs — add daily cost
└── Analytics query: proportional allocation per order

Tables: ad_campaigns, ad_daily_costs (from CRM_FINAL_SPECS.md §16)

Profitability formula:
Revenue − Product Cost − Ads Cost − Shipping Fees − Commission − Other Expenses
(Ads cost is proportionally allocated across orders in the campaign period)
```

---

### Step 5.5 — Courier Invoice Import
```
Backend:
├── POST /api/courier-invoices/import — upload CSV/Excel file
├── Parse rows: tracking_number, amount, date
├── Match tracking_number → order in CRM
├── Flag mismatches: missing orders, amount discrepancies
├── Admin reviews and approves/rejects
└── Approved amounts recorded as shipping expenses
```

### ✅ PHASE 5 EXIT CHECK
```
□ Commission auto-calculated when order marked delivered
□ Commission rules configurable (global, per-agent, per-product)
□ Can approve/reject/payout commissions
□ Commission payout auto-creates expense
□ Expenses CRUD works with file attachments
□ Recurring expenses auto-generate
□ Ads campaigns with daily costs tracked
□ Courier invoices importable with validation
□ Agent sees own commission cards (Paid, Owed, Pending)
```

---

# ═══════════════════════════════════════════════════════════
# PHASE 6 — CALL CENTRE + ANALYTICS + SEARCH (Weeks 11-12)
# ═══════════════════════════════════════════════════════════

> **Goal**: Full call centre experience for agents, analytics dashboard, global search.

---

## Week 11: Call Centre

### Step 6.1 — Agent Queue View (Call Centre Page)
```
Frontend — Agent sees:
├── Commission Cards (top of page):
│   ├── 💰 Paid: 4,500 MAD
│   ├── 💵 Owed: 1,200 MAD
│   └── ⚠️ Pending Deductions: 200 MAD
├── Status Tabs with live counts:
│   ├── All (45) | ⏳ Pending (10) | 🔄 Resched (3) | 👆 Unreachable (8) | ❌ Cancelled (5)...
│   └── Clicking tab filters the list
├── Order List:
│   ├── FIFO order (oldest first within each tab)
│   ├── Each row: Order #, Customer (+ 📦N repeat badge), Phone (+ 📋 copy), Product, Amount, Status pill
│   ├── Actions: [📞 Call] [✅ Confirm] [❌ Cancel] [📅 Schedule Callback]
│   └── Clicking a row opens order detail panel
├── Break button: "☕ On Break" toggle → pauses auto-assignment
├── Callbacks Due Today: highlighted section at top
└── Pagination at bottom
```

> **Reference**: `CRM_FINAL_SPECS.md` §28

---

### Step 6.2 — Admin Queue View
```
Frontend — Admin sees everything agents see PLUS:
├── Agent filter: [All Agents ▼] → see any agent's queue
├── Unassigned orders section
├── Manual assign: select order → [Assign to ▼ Agent Name]
├── Bulk assign: select multiple → [Assign All to ▼]
├── Assignment Rules management page:
│   ├── Table of rules (priority, conditions, method)
│   ├── Create/edit rule:
│   │   ├── Conditions (JSON): source, city, product matches
│   │   ├── Method: round_robin, workload, geographic, manual
│   │   └── Priority (1-100)
│   └── Enable/disable rules
└── Agent performance summary: orders confirmed today, avgcall time
```

---

### Step 6.3 — Global Search Bar
```
Backend:
├── GET /api/search?q=ahmed&types=orders,customers,products
├── Search across:
│   ├── Orders: order_number, customer name, phone
│   ├── Customers: name, phone, city
│   └── Products: name, SKU
├── Return grouped results (max 5 per group)
├── Debounced (300ms on frontend)
└── Full-text search with trigram index for fuzzy matching

Frontend:
├── Search bar in header (visible on every page)
├── Dropdown results grouped: "Orders (3)", "Customers (2)", "Products (1)"
├── Keyboard navigation: ↑↓ to navigate, Enter to select, Esc to close
├── Click result → navigate to that item's detail page
└── If no results: "No results for 'ahmed'"
```

> **Reference**: `CRM_FINAL_SPECS.md` §32

---

## Week 12: Analytics Dashboard

### Step 6.4 — Main Dashboard
```
Backend:
├── GET /api/analytics/dashboard     — aggregated KPIs
├── GET /api/analytics/charts        — chart data (order trends, revenue)
├── GET /api/analytics/best-cities   — top performing cities
├── GET /api/analytics/best-products — top selling products
└── All endpoints accept: date_from, date_to, store_id, agent_id, product_id

Frontend — Dashboard page:
├── KPI Cards (with period comparison delta ▲▼):
│   ├── Total Orders | Confirmed | Delivered | Revenue
│   ├── Confirmation Rate | Delivery Rate | Return Rate
│   ├── Avg Order Value | Total Expenses | Net Profit
│   └── Period selector: Today, This Week, This Month, Custom Range
├── Charts (Recharts):
│   ├── Orders over time (line chart)
│   ├── Revenue vs Expenses (bar chart)
│   ├── Confirmation rate trend (line chart)
│   └── Orders by source (pie chart: YouCan, Manual, WhatsApp, etc.)
├── Best Cities table (top 10)
├── Best Products table (top 10)
├── Filters: Date range, Store, Agent, Product, City
└── Real-time counter: "Today: 23 orders, 15 confirmed, 8,500 MAD revenue"
```

> **Reference**: `CRM_FINAL_SPECS.md` §18-19

---

### Step 6.5 — Profitability Analysis
```
Backend:
├── GET /api/analytics/profitability      — by product, city, agent
├── Uses materialized view: mv_product_profitability
├── Refreshed every 15 min by background worker

Frontend:
├── Profitability by Product: Revenue, Cost, Ads Cost, Shipping, Commission, Profit, Margin%
├── Profitability by City: Orders, Revenue, Delivery Cost, Return Rate, Net Profit
├── Agent Performance: Orders Confirmed, Confirmation Rate, Avg Handle Time, Commission Earned
└── Export to CSV
```

---

### Step 6.6 — Materialized Views Worker
```
Background worker: materializedView.worker.ts (every 15 min)
├── REFRESH MATERIALIZED VIEW mv_product_profitability
├── REFRESH MATERIALIZED VIEW mv_agent_performance
└── Log refresh time and duration
```

### ✅ PHASE 6 EXIT CHECK
```
□ Agent Call Centre page works with commission cards, status tabs, FIFO queue
□ Break button pauses auto-assignment
□ Repeat customer badge (📦N) appears
□ Phone copy icon works
□ Admin can view any agent's queue and manually assign orders
□ Global search finds orders, customers, products (with keyboard nav)
□ Dashboard shows all KPIs with period comparison
□ Charts render (orders trend, revenue, by source)
□ Best cities and products tables display
□ Profitability analysis works by product, city, agent
□ Materialized views refresh automatically
```

---

# ═══════════════════════════════════════════════════════════
# PHASE 7 — NOTIFICATIONS + SETTINGS (Weeks 13-14)
# ═══════════════════════════════════════════════════════════

> **Goal**: Notification system, i18n, full settings panel.

---

## Week 13: Notifications

### Step 7.1 — In-App Notifications
```
Backend:
├── GET    /api/notifications           — list user's notifications (paginated)
├── PUT    /api/notifications/:id/read  — mark as read
├── PUT    /api/notifications/read-all  — mark all as read
├── GET    /api/notifications/unread-count — for bell badge

13 notification events (from CRM_FINAL_SPECS.md §12):
├── New order assigned to agent
├── Order status changed
├── New YouCan order imported
├── Stock low alert
├── Stock out alert
├── Callback reminder due
├── Commission calculated
├── Commission approved/paid
├── Delivery export failed
├── Merge candidate detected
├── Expense needs approval
├── Recurring expense due
└── System alert (connection lost, sync failed)

Frontend:
├── 🔔 Bell icon in header with unread count badge
├── Dropdown: list of recent notifications
├── Click notification → navigate to relevant page
├── "Mark all as read" button
└── Full notifications page (all history, paginated)
```

---

### Step 7.2 — Language Toggle (i18n)
```
Implementation:
├── react-i18next setup
├── Language files: en.json, ar.json
├── Toggle in header: 🌐 → switches between EN and AR
├── AR activates RTL layout (dir="rtl" on html element)
├── Ant Design RTL: ConfigProvider direction="rtl"
├── Store preference in localStorage
└── Key areas to translate:
    ├── Sidebar labels
    ├── Page titles
    ├── Button labels
    ├── Status names
    ├── Table headers
    ├── Form labels
    └── Error messages
```

> **Reference**: `CRM_FINAL_SPECS.md` §1 (language requirements)

---

## Week 14: Settings

### Step 7.3 — Settings Pages
```
Settings → Organization:
├── Company name, logo
├── Currency (MAD), timezone (Africa/Casablanca)
├── Date format (DD/MM/YYYY)
└── Default delivery company

Settings → Status Definitions:
├── View all confirmation/shipping/payment statuses
├── Edit colors and icons
├── Cannot delete system statuses
└── Can add custom statuses (future)

Settings → Security:
├── Password policy (min length, requirements)
├── Session timeout (default: 1 hour)
├── Active sessions list (kill session)
└── Login history (IP, browser, timestamp)

Settings → Integrations:
├── YouCan stores list (from Phase 3)
├── Delivery companies
└── Future: Shopify, WooCommerce

Settings → Notifications:
├── Configure which events send notifications
├── Per-user notification preferences
└── Email notification toggle (when SMTP configured)
```

### ✅ PHASE 7 EXIT CHECK
```
□ Notifications appear in bell icon with unread count
□ All 13 events trigger notifications
□ Can mark notifications as read (individual + all)
□ Arabic language toggle works (RTL layout flips)
□ All settings pages functional
□ Session management works
□ Integration settings reflect YouCan stores
```

---

# ═══════════════════════════════════════════════════════════
# PHASE 8 — TESTING + DEPLOYMENT (Weeks 15-16)
# ═══════════════════════════════════════════════════════════

> **Goal**: Full testing, production deployment, documentation.

---

## Week 15: Testing

### Step 8.1 — Backend Tests
```
Unit tests (Jest):
├── stock.service.ts: deduction, restoration, concurrency, low stock alert
├── commission.service.ts: fixed, percentage_sale, percentage_margin calculations
├── phone.service.ts: all phone format normalizations
├── assignment.service.ts: round-robin, workload, geographic
├── order.service.ts: status transitions (all valid + invalid transitions)
└── youcan.service.ts: webhook processing, duplicate detection

Integration tests (Supertest):
├── Auth flow: login → session → me → logout
├── Order CRUD: create → confirm → ship → deliver → commission
├── Stock lifecycle: confirm deducts, cancel restores, return restores
├── Permission checks: agent can't access admin endpoints
└── Webhook: simulate YouCan payload → order created in DB
```

---

### Step 8.2 — Frontend Tests
```
Component tests (React Testing Library):
├── Login form (validation, submit, error handling)
├── Order table (filter, sort, pagination, status pills)
├── Confirmation modal (discount calculation, stock check)
└── Global search (debounce, grouped results, keyboard nav)

E2E tests (Playwright or Cypress):
├── Full order lifecycle: login → create order → confirm → check stock → deliver
├── Agent assignment flow
├── YouCan import simulation
└── Returns verification flow
```

---

## Week 16: Deployment

### Step 8.3 — Production Setup
```
Steps:
├── Docker production build (multi-stage Dockerfile)
├── Deploy to Railway (or VPS):
│   ├── Backend service (Node.js)
│   ├── PostgreSQL database
│   └── Frontend (Nginx or Railway static)
├── Environment variables set in production
├── SSL certificate (Let's Encrypt)
├── Domain config
├── PostgreSQL: daily automated backups
├── Monitoring: health check endpoint + uptime monitoring
├── Rate limiting tuned for production traffic
└── Winston log rotation (30 days)
```

---

### Step 8.4 — Performance Validation
```
Tests:
├── Simulate 300 orders/day load
├── Check query performance (no query > 100ms)
├── Verify materialized views refresh correctly
├── Socket.IO: test with 20 concurrent connections
├── File uploads: verify 10MB limit works
└── Security checklist (OWASP top 10)
```

---

### Step 8.5 — Documentation + Handoff
```
Create:
├── API documentation (all endpoints, request/response examples)
├── Admin user guide (how to use each page)
├── Agent user guide (call centre workflow)
├── Deployment guide (how to redeploy, update, rollback)
└── Database backup/restore guide
```

### ✅ PHASE 8 EXIT CHECK
```
□ All backend unit + integration tests pass
□ Frontend E2E tests pass
□ App deployed and accessible on domain
□ SSL working
□ Database backups running
□ Can handle 300 orders/day
□ Documentation complete
□ Admin can log in on production
□ YouCan orders flow into production CRM
```

---

# ═══════════════════════════════════════════════════════════
# SUMMARY: WHAT TO BUILD, IN WHAT ORDER
# ═══════════════════════════════════════════════════════════

```
Phase 1 (Weeks 1-2):  🧱 Foundation
  → Project setup, DB, auth, login, sidebar, user management

Phase 2 (Weeks 3-4):  📦 Orders Core 
  → Products, customers, orders CRUD, confirmation, status transitions, 
    assignment, real-time updates, order history

Phase 3 (Weeks 5-6):  📦 Stock + 🔗 YouCan
  → Stock engine, out-of-stock queue, order merge, 
    YouCan OAuth, webhooks, polling fallback, multi-store

Phase 4 (Weeks 7-8):  🚚 Delivery + 🔄 Returns
  → Coliix API, shipping labels, return verification + QR scanner, 
    concurrent editing locks, scheduled callbacks

Phase 5 (Weeks 9-10): 💰 Money
  → Commission calculation, commission management, expenses, 
    ads tracking, profitability, courier invoices

Phase 6 (Weeks 11-12): 📞 Call Centre + 📊 Analytics + 🔍 Search
  → Agent queue, admin queue, global search, dashboard, 
    charts, profitability analysis

Phase 7 (Weeks 13-14): 🔔 Notifications + ⚙️ Settings
  → In-app notifications, i18n (EN/AR), all settings pages

Phase 8 (Weeks 15-16): ✅ Testing + 🚀 Deploy
  → Unit tests, integration tests, E2E, production deployment, docs
```

---

## ⏳ THINGS YOU STILL NEED TO PROVIDE (Non-Blocking for Phases 1-3)

| Item | Needed for Phase |
|---|---|
| Coliix.ma API documentation | Phase 4 |
| Second delivery company name + API docs (if any) | Phase 4 |
| SMTP server details (host, user, password) | Phase 7 |
| WhatsApp API provider choice | Phase 7 (optional) |
| Domain name for production | Phase 8 |
| Hosting preference (Railway / VPS / other) | Phase 8 |

---

## 🔄 STATUS PILL COLORS (Use Everywhere)

### Confirmation Status
| Status | Color | Hex |
|---|---|---|
| Pending | 🟡 Yellow | `#faad14` |
| Confirmed | 🟢 Green | `#52c41a` |
| Cancelled | 🔴 Red | `#ff4d4f` |
| Unreachable | ⚫ Gray | `#8c8c8c` |
| Fake | ⬛ Black | `#000000` |
| Reported | 🔵 Blue | `#1890ff` |
| Out of Stock | 🟠 Orange | `#fa8c16` |
| Merged | 🟣 Purple | `#722ed1` |

### Shipping Status
| Status | Color | Hex |
|---|---|---|
| Not Shipped | ⬜ Light Gray | `#d9d9d9` |
| Pickup Scheduled | 🔵 Blue | `#1890ff` |
| In Transit | 🟡 Yellow | `#faad14` |
| Delivered | 🟢 Green | `#52c41a` |
| Returned | 🔴 Red | `#ff4d4f` |

---

# END OF BUILD TIMELINE
