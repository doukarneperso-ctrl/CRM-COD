# CRM System — FINAL SPECIFICATIONS (v3)
## UI/UX, Branding, Business Rules & Edge Cases

> This is the **final piece**. Combined with `CRM_System_ORGANIZED.md`, `CRM_System_FINAL_ADDENDUM.md`, and `CRM_BUILD_PLAN.md`, the system is now **100% buildable**.

---

# 1. BRANDING & THEME

| Property | Value |
|---|---|
| Brand Name | **ANAQATOKI** |
| Logo | User-provided (will be placed in `/public/logo.png`) |
| Primary Color | **Brown** palette (see below) |
| UI Library | Ant Design with custom brown theme |
| CSS Framework | Tailwind CSS v3 |

## Color Palette (Brown Theme)

```css
:root {
  /* Primary Brown */
  --primary-50: #fdf8f3;
  --primary-100: #f5e6d8;
  --primary-200: #e8c9a8;
  --primary-300: #d4a574;
  --primary-400: #c08b50;
  --primary-500: #8B5E3C;    /* Main brand brown */
  --primary-600: #7a5235;
  --primary-700: #5c3d27;
  --primary-800: #3d2819;
  --primary-900: #1f140d;

  /* Semantic Colors */
  --success: #52c41a;
  --warning: #faad14;
  --error: #ff4d4f;
  --info: #1890ff;

  /* Backgrounds */
  --bg-light: #fefcfa;
  --bg-sidebar: #2c1a0e;
  --bg-card: #ffffff;
  --text-primary: #1f140d;
  --text-secondary: #7a5235;
}
```

## Ant Design Theme Override

```typescript
// theme.ts
const theme = {
  token: {
    colorPrimary: '#8B5E3C',
    colorBgLayout: '#fefcfa',
    colorBgContainer: '#ffffff',
    borderRadius: 8,
    fontFamily: "'Inter', sans-serif",
  },
  components: {
    Menu: { colorItemBg: '#2c1a0e', colorItemText: '#e8c9a8' },
    Button: { colorPrimary: '#8B5E3C' },
  }
};
```

---

# 2. LANGUAGE & LOCALIZATION

| Setting | Value |
|---|---|
| Default Language | **English** |
| Supported Languages | English + **Arabic** (switchable via header dropdown) |
| RTL Support | **Yes** (when Arabic is selected, entire UI flips to RTL) |
| Date Format | **DD/MM/YYYY** |
| Currency Display | **MAD** (e.g., `150.00 MAD`) |
| Timezone | Africa/Casablanca (UTC+1) |

## i18n Implementation

- Use **react-i18next** for translations
- Translation files: `src/locales/en.json`, `src/locales/ar.json`
- Store language preference in `localStorage` + user profile
- Ant Design has built-in locale support: `import arEG from 'antd/locale/ar_EG'`
- Tailwind RTL: use `dir="rtl"` on `<html>` + Tailwind `rtl:` variant
- All text in components wrapped in `t('key')` — no hardcoded strings

---

# 3. SIDEBAR NAVIGATION STRUCTURE

```
┌───────────────────────────────┐
│  🟤 ANAQATOKI (logo + name)  │
├───────────────────────────────┤
│  📊 Dashboard                │
│  📋 All Orders               │
│  📞 Call Centre              │
│  📦 Inventory          ▼     │
│      ├── Products            │
│      └── Stock               │
│  👥 Customers                │
│  🚚 Delivery            ▼    │
│      ├── Companies           │
│      └── Returns             │
│  💰 Cash                ▼    │
│      ├── Expenses            │
│      └── Commissions         │
│  📈 Analytics                │
│  👨‍💼 Team               ▼    │
│      ├── Agents              │
│      └── Assignment Rules    │
│  ⚙️ Settings                 │
├───────────────────────────────┤
│  🔔 Notifications            │
│  👤 Profile / Logout         │
└───────────────────────────────┘
```

**Sidebar behavior**:
- Collapsible (icon-only mode)
- Dark brown background (`#2c1a0e`)
- Light text (`#e8c9a8`)
- Active item highlighted with primary brown (`#8B5E3C`)
- Sub-items expandable with smooth animation
- Mobile: hamburger menu → slide-out drawer
- Permission-based: hide menu items user can't access

---

# 4. AGENT RULES & VISIBILITY

| Rule | Value |
|---|---|
| Agent sees only assigned orders | **Yes** (unless has `view_all_orders` permission) |
| Max orders per agent per day | **Configurable** in Assignment Rules (per rule, not global) |
| Agent can go offline/on break | **Yes** — toggle in header bar |
| Working hours | **No restriction** — agents can work anytime |
| Multiple devices/sessions | **Yes** — allowed simultaneously |
| IP restriction | **None** — accessible from anywhere |

## Agent Break/Offline Logic

```sql
ALTER TABLE users ADD COLUMN is_available BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN availability_changed_at TIMESTAMP;
```

- When `is_available = false`, auto-assignment **skips** this agent
- Show status indicator in Team → Agents page (green dot / grey dot)
- When agent goes back online, they keep their existing queue
- Agent can toggle via a switch in the header: "🟢 Available" / "⚫ On Break"

---

# 5. ORDER RULES & EDGE CASES

## Order Numbering

```
Format:  ORD-XXXX  (zero-padded, 4+ digits)
Start:   ORD-0001
Auto-increment via PostgreSQL sequence

CREATE SEQUENCE order_number_seq START WITH 1;

-- On new order:
order_number = 'ORD-' || LPAD(nextval('order_number_seq')::text, 4, '0');
-- Result: ORD-0001, ORD-0002, ... ORD-9999, ORD-10000
```

## Edit Lock After Shipping

- **Once shipping_status ≠ 'not_shipped'** → core order fields are **LOCKED**
- Locked fields: customer name, phone, address, city, items, quantities, prices, discount
- Still editable: delivery_notes, call_notes, internal tags
- Reason: shipping data comes from courier API/webhooks — editing would cause conflicts
- Admin **cannot** override this lock

## Agent Can Cancel Confirmed Orders

- Agent with `update_order_status` permission CAN cancel a confirmed order
- **Mandatory**: call_notes explaining the reason
- System auto-restores stock (since it was deducted on confirm)
- Audit log records: who cancelled, reason, timestamp
- Notification to managers

## Partial Delivery

```sql
-- Add to OrderItems table
ALTER TABLE order_items ADD COLUMN delivered_quantity INTEGER DEFAULT 0;
ALTER TABLE order_items ADD COLUMN delivery_status VARCHAR(20) DEFAULT 'pending';
  -- pending | delivered | partial | not_delivered
```

- When courier webhook says "delivered" but with partial info:
  - Admin/system can mark individual items as delivered/not_delivered
  - If all items delivered → order shipping_status = 'delivered'
  - If some items not delivered → shipping_status = 'partial_delivery' (new status)
  - Partial delivery triggers: adjust commission (only for delivered items), stock restore for undelivered items

## Duplicate Order Detection (24h Warning)

```
When creating/importing a new order:
1. Normalize phone
2. Check: SELECT * FROM orders
   WHERE customer_id IN (SELECT id FROM customers WHERE phone_norm = $phone)
   AND created_at > NOW() - INTERVAL '24 hours'
   AND confirmation_status NOT IN ('cancelled', 'fake', 'merged_into')
   AND deleted_at IS NULL

3. If found → show warning badge in order list:
   "⚠️ This customer placed another order in the last 24h"
   
4. Agent can still proceed (not blocking, just informational)
```

## Merged Order Display

- When orders are merged:
  - Primary order stays visible in the list normally
  - Secondary (merged) orders: `confirmation_status = 'merged_into'`
  - In the primary order detail, show a **collapsible section**: "📎 Merged Orders (2)"
  - Click to expand → shows the merged orders as collapsed cards inside
  - Merged orders are hidden from the main orders list by default
  - Filter option: "Show merged orders" toggle (off by default)

---

# 6. DELIVERY & SHIPPING

## City-Based Shipping Fee

```sql
CREATE TABLE city_shipping_fees (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER REFERENCES couriers(id),
  city_name VARCHAR(100) NOT NULL,
  normalized_name VARCHAR(100) NOT NULL,
  shipping_fee DECIMAL(10,2) NOT NULL,    -- variable per city
  is_active BOOLEAN DEFAULT true,
  UNIQUE(courier_id, normalized_name)
);
```

- Admin can set shipping fee per city per courier
- Import city list from Google Sheet (CSV upload) or fetch from courier API
- Customer always gets **free shipping** (fee is absorbed by the business)
- Shipping fee is used internally for **profitability calculations** only

## City List Import

```
Two options (both supported):
1. CSV Upload: Admin uploads Google Sheet exported as CSV
   Columns: city_name, shipping_fee
   → System normalizes names and inserts into city_shipping_fees

2. API Fetch: If courier provides city list endpoint
   → Fetch and sync (future implementation for Coliix)
```

## Second Delivery Company

- Leave placeholder in UI: "Company 2 — Coming Soon"
- Courier selection dropdown in order export shows only active couriers
- When added, just insert into `couriers` table and configure API credentials
- No code changes needed — delivery integration is **courier-agnostic** by design

## Return Window

```sql
-- In SystemSettings
INSERT INTO system_settings (key, value) VALUES
('return_window_days', '7');  -- configurable, default 7
```

- Return can be initiated only within `return_window_days` of `delivered_at`
- Admin can override (force accept a late return)
- Damaged returns: business absorbs cost, **no commission clawback**

---

# 7. REPORTS & EXPORTS

| Feature | Details |
|---|---|
| Export Format | **PDF only** |
| Downloadable | **Yes** — download button on each report |
| Daily Summary Print | **Yes** — warehouse team daily packing list |

## Daily Packing Summary

- Route: `GET /api/reports/daily-packing?date=2026-02-12`
- Content:
  - Date
  - List of confirmed orders ready for pickup
  - Per order: order number, customer name, city, items (product + variant + qty)
  - Total orders count
- Print-optimized layout (browser print dialog)
- Auto-available at Dashboard → "📋 Today's Packing List" button

## PDF Generation

- Use **pdfkit** or **puppeteer** (HTML → PDF) for server-side generation
- Reports available:
  - Orders report (filtered by date, status, agent, etc.)
  - Agent performance report
  - Profitability report
  - Commission payout report
  - Expense report
  - Daily packing list

---

# 8. BULK ACTIONS

| User | Bulk Actions Allowed |
|---|---|
| Agent | **None** — processes orders one by one |
| Admin/Manager | **Yes** — can bulk: assign orders, schedule pickup, export to delivery |

```
Admin bulk actions:
1. Select multiple orders (checkbox column)
2. Actions dropdown:
   - "Assign to Agent" → select agent → assign all selected
   - "Export to Delivery" → select courier → export all selected
   - "Schedule Pickup" → trigger pickup for all selected
```

---

# 9. MOBILE RESPONSIVENESS

- **No native app** — responsive web only
- Breakpoints:
  - Desktop: ≥1280px (full sidebar + content)
  - Tablet: 768px–1279px (collapsed sidebar + content)
  - Mobile: <768px (hamburger menu + stacked layout)
- Mobile priorities:
  - Orders list (card view instead of table on mobile)
  - Order detail (full scrollable view)
  - Callbacks due today
  - Quick status change buttons
- Ant Design's responsive Grid system + Tailwind responsive utilities

---

# 10. ADDITIONAL SCHEMA CHANGES

```sql
-- Agent availability
ALTER TABLE users ADD COLUMN is_available BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN availability_changed_at TIMESTAMP;

-- Partial delivery tracking
ALTER TABLE order_items ADD COLUMN delivered_quantity INTEGER DEFAULT 0;
ALTER TABLE order_items ADD COLUMN delivery_status VARCHAR(20) DEFAULT 'pending';

-- City shipping fees
CREATE TABLE city_shipping_fees (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER REFERENCES couriers(id),
  city_name VARCHAR(100) NOT NULL,
  normalized_name VARCHAR(100) NOT NULL,
  shipping_fee DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(courier_id, normalized_name)
);

-- Add partial_delivery shipping status
INSERT INTO status_definitions (status_type, status_name, status_slug, color, icon)
VALUES ('shipping', 'Partial Delivery', 'partial_delivery', '#fa8c16', 'MinusCircleOutlined');
```

---

# 11. UPDATED STOCK IMPACT TABLE (with Partial Delivery)

| Transition | Stock Action |
|---|---|
| `pending → confirmed` | **DEDUCT** qty per variant |
| `confirmed → cancelled` | **RESTORE** qty per variant (agent must provide reason) |
| `pending → cancelled` | No stock change |
| `pending → out_of_stock` | No stock change |
| `out_of_stock → confirmed` | **DEDUCT** qty per variant |
| Fully delivered | No stock change (already deducted on confirm) |
| Partial delivery | **RESTORE** undelivered item qty |
| Return verified (OK) | **RESTORE** qty per variant |
| Return verified (damaged) | No stock change (business absorbs cost) |
| Merge orders | No stock change |

---

# 12. UPDATED PERMISSIONS (New Additions)

```sql
INSERT INTO permissions (key, module) VALUES
-- New permissions from this round
('bulk_assign_orders', 'orders'),
('bulk_export_orders', 'orders'),
('cancel_confirmed_orders', 'orders'),
('import_city_list', 'delivery'),
('manage_shipping_fees', 'delivery'),
('view_daily_packing', 'reports'),
('download_reports', 'reports'),
('toggle_agent_availability', 'users'),
('manage_languages', 'settings');
```

---

# 13. GLOBAL FILTER BAR (Facebook Ads-Style)

> **Same filter component used across ALL pages** for consistency. Inspired by Facebook Ads Manager date picker.

## Filter Bar Component

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ � Date Range          👤 Agent           📦 Product       🏙️ City        │
│ [▼ Last 7 days    ]   [▼ All agents  ]   [▼ All products] [▼ All cities ] │
└─────────────────────────────────────────────────────────────────────────────┘
```

**This bar appears at the top of every filterable page.** Not all filters appear on every page — only relevant ones (see table below).

## Date Range Picker (Facebook Ads-Style)

```
┌──────────────────────────────────────────────────────────────┐
│  📅 Select Date Range                               [Apply] │
├──────────────────────┬───────────────────────────────────────┤
│                      │                                       │
│  PRESETS             │  CUSTOM RANGE                         │
│  ───────             │                                       │
│  ○ Today             │  From: [DD/MM/YYYY] 📅               │
│  ○ Yesterday         │  To:   [DD/MM/YYYY] 📅               │
│  ● Last 7 days       │                                       │
│  ○ Last 14 days      │  ┌──── February 2026 ────┐           │
│  ○ Last 30 days      │  │ Mo Tu We Th Fr Sa Su   │           │
│  ○ This month        │  │                 1  2   │           │
│  ○ Last month        │  │  3  4  5  6  7  8  9   │           │
│  ○ This quarter      │  │ 10 11 [12]13 14 15 16  │           │
│  ○ Last quarter      │  │ 17 18 19 20 21 22 23   │           │
│  ○ This year         │  │ 24 25 26 27 28         │           │
│  ○ Last year         │  └────────────────────────┘           │
│  ○ All time          │                                       │
│  ○ Custom range      │  Compare: ☐ Previous period           │
│                      │                                       │
└──────────────────────┴───────────────────────────────────────┘
```

### Date Picker Features
- **Presets** on the left (one-click selection)
- **Custom range** with dual calendar on the right
- **Compare toggle**: "Compare to previous period" shows +/- % change on every KPI
- Selected range shown as a pill: `📅 Feb 6 – Feb 12, 2026 ✕`
- Default: **Last 7 days**
- URL sync: filters stored in query params (`?from=2026-02-06&to=2026-02-12&agent=5&city=Casablanca`)
- Persists across page navigation (stored in Zustand `useFilterStore`)

## Filter Dropdown Behavior

| Filter | Type | Searchable | Multi-select |
|---|---|---|---|
| 📅 Date Range | Calendar picker (see above) | N/A | Range only |
| 👤 Agent | Dropdown with search | Yes | Single or multi |
| � Product | Dropdown with search | Yes | Single or multi |
| 🏙️ City | Dropdown with search | Yes | Single or multi |
| 📊 Status | Tag-style buttons | No | Multi-select |
| 🏪 Store | Dropdown | No | Single |
| 🚚 Courier | Dropdown | No | Single |

## Which Pages Get Which Filters

| Page | Date | Agent | Product | City | Status | Store | Courier |
|---|---|---|---|---|---|---|---|
| **Dashboard** | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| **All Orders** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Call Centre** | ✅ | ✅ (self) | — | ✅ | ✅ | — | — |
| **Products / Stock** | — | — | ✅ | — | — | — | — |
| **Customers** | ✅ | — | — | ✅ | — | — | — |
| **Delivery** | ✅ | — | — | ✅ | ✅ | — | ✅ |
| **Returns** | ✅ | — | ✅ | ✅ | ✅ | — | ✅ |
| **Expenses** | ✅ | — | — | — | ✅ | — | — |
| **Commissions** | ✅ | ✅ | ✅ | — | ✅ | — | — |
| **Analytics** | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| **Ad Campaigns** | ✅ | — | ✅ | — | — | — | — |

## Zustand Filter Store

```typescript
// useFilterStore.ts
interface FilterState {
  dateFrom: string;    // ISO date
  dateTo: string;      // ISO date
  datePreset: string;  // 'last_7_days' | 'this_month' | 'custom' | ...
  agentId: number | null;
  productId: number | null;
  cityName: string | null;
  storeId: number | null;
  courierId: number | null;
  comparePrevious: boolean;  // show +/- vs previous period
}

// All pages read from this store
// Changing a filter triggers React Query refetch on all visible data
```

---

# 13b. DASHBOARD KPIs (Expanded)

## Dashboard Layout with Filters

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📊 Dashboard                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  📅 [Last 7 days ▼]  👤 [All agents ▼]  📦 [All products ▼]  🏙️ [All ▼] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ROW 1 — TOP KPI CARDS                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Orders   │ │ Revenue  │ │ Confirm  │ │ Delivery │ │ Return   │        │
│  │   42     │ │ 12,450   │ │  Rate    │ │  Rate    │ │  Rate    │        │
│  │  +12% ▲  │ │  MAD     │ │  68%     │ │  91%     │ │  4.2%    │        │
│  │ vs prev  │ │ +8% ▲    │ │ +3% ▲    │ │ -1% ▼    │ │ -0.5% ▲  │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                                                                             │
│  ROW 2 — CHARTS                                                            │
│  ┌─────────────────────────────┬───────────────────────────────────┐       │
│  │ 📈 Revenue Trend (line)    │ 📋 Orders by Status (donut)      │       │
│  │                             │                                   │       │
│  │   ╱\    ╱\                  │   ████ Pending: 18 (42%)         │       │
│  │  ╱  \  ╱  \  ╱             │   ████ Confirmed: 14 (33%)      │       │
│  │ ╱    ╲╱    ╲╱              │   ██ Cancelled: 5 (12%)          │       │
│  │                             │   █ Other: 5 (13%)               │       │
│  └─────────────────────────────┴───────────────────────────────────┘       │
│                                                                             │
│  ROW 3 — RANKINGS                                                          │
│  ┌───────────────────┬───────────────────┬─────────────────────────┐       │
│  │ 🏆 Top Agents     │ 🏙️ Best Cities    │ 📦 Best Products       │       │
│  │                   │                   │                         │       │
│  │ 1. Ahmed    12 ✅ │ 1. Casablanca     │ 1. T-Shirt X           │       │
│  │ 2. Fatima    9 ✅ │    89 delivered   │    156 delivered        │       │
│  │ 3. Youssef   3 ✅ │    Rate: 94%     │    Rate: 92%            │       │
│  │                   │ 2. Rabat          │    ▸ M/Red: 45         │       │
│  │                   │    62 delivered   │    ▸ L/Blue: 38        │       │
│  │                   │    Rate: 91%     │    ▸ M/Black: 33       │       │
│  │                   │ 3. Marrakech     │ 2. Hoodie Y             │       │
│  │                   │    45 delivered   │    98 delivered         │       │
│  │                   │    Rate: 87%     │    ▸ XL/Grey: 28       │       │
│  └───────────────────┴───────────────────┴─────────────────────────┘       │
│                                                                             │
│  ROW 4 — OPERATIONAL                                                       │
│  ┌───────────────────────────┬─────────────────────────────────────┐       │
│  │ 📞 Callbacks Due: 5      │ ⚠️ Low Stock Alerts: 3              │       │
│  │ • Ahmed M. — 14:30       │ • T-Shirt X (M/Red) — 3 left       │       │
│  │ • Sara K. — 15:00        │ • Hoodie Y (L/Blue) — 5 left       │       │
│  │ • Youssef B. — 15:30     │ • Cap Z — 2 left                   │       │
│  ├───────────────────────────┴─────────────────────────────────────┤       │
│  │ 📋 Today's Packing List (14 orders ready)        [Download PDF]│       │
│  └─────────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## KPI Cards (Row 1) — With Period Comparison

| KPI | Formula | Compare Logic |
|---|---|---|
| Total Orders | COUNT orders in range | vs same-length previous period |
| Revenue | SUM total_amount WHERE confirmed | vs previous period |
| Confirmation Rate | confirmed / total × 100 | show +/- % difference |
| Delivery Rate | delivered / shipped × 100 | show +/- % |
| Return Rate | returned / delivered × 100 | lower is better (green ▼) |

**When "Compare to previous period" is ON:**
- Each card shows the delta: `+12% ▲` (green) or `-5% ▼` (red)
- Previous period = same-length window before the selected range
  - E.g., "Last 7 days" compares to the 7 days before that

## Best Cities KPI (Row 3)

```
🏙️ Best Cities (by Delivery Rate)

Ranked by: number of delivered orders in the selected range
Shows: city name, delivered count, delivery rate %

SQL:
SELECT 
  c.city,
  COUNT(*) FILTER (WHERE o.shipping_status = 'delivered') as delivered,
  COUNT(*) as total_shipped,
  ROUND(COUNT(*) FILTER (WHERE o.shipping_status = 'delivered')::numeric / 
        NULLIF(COUNT(*), 0) * 100, 1) as delivery_rate
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.shipping_status IN ('delivered', 'returned', 'in_transit')
  AND o.created_at BETWEEN $from AND $to
GROUP BY c.city
ORDER BY delivered DESC
LIMIT 5;
```

**Clicking a city** → filters the entire dashboard to that city.

## Best Products KPI (Row 3)

```
📦 Best Products (by Delivered Orders)

Ranked by: number of delivered orders containing this product
Shows: product name, delivered count, delivery rate %
Sub-section: top 3 variants for each product, ranked by delivered qty

SQL:
SELECT 
  p.name as product_name,
  COUNT(DISTINCT o.id) FILTER (WHERE o.shipping_status = 'delivered') as delivered_orders,
  -- Sub-query for top variants:
  (SELECT json_agg(variants) FROM (
    SELECT 
      pv.size || '/' || pv.color as variant,
      SUM(oi.quantity) FILTER (WHERE o.shipping_status = 'delivered') as qty_delivered
    FROM order_items oi
    JOIN product_variants pv ON oi.variant_id = pv.id
    WHERE pv.product_id = p.id
    GROUP BY pv.size, pv.color
    ORDER BY qty_delivered DESC
    LIMIT 3
  ) variants) as top_variants
FROM products p
JOIN product_variants pv2 ON p.id = pv2.product_id
JOIN order_items oi2 ON pv2.id = oi2.variant_id
JOIN orders o ON oi2.order_id = o.id
WHERE o.created_at BETWEEN $from AND $to
GROUP BY p.id, p.name
ORDER BY delivered_orders DESC
LIMIT 5;
```

**Display**:
- Product name + total delivered count
- Expandable `▸` arrow → shows top 3 variants with individual counts
- Color-coded: variant with stock < 10 shows yellow warning

**Clicking a product** → filters the entire dashboard to that product.

---

# 14. CALL CENTRE — AGENT CONFIRMATION FLOW

## Step-by-Step Agent Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CALL CENTRE VIEW                              │
│                                                                  │
│  Agent's Queue (assigned orders, sorted FIFO)                   │
│  ┌──────┬──────────┬────────────────┬──────────┬────────────┐   │
│  │ #    │ Customer │ Phone          │ City     │ Action     │   │
│  ├──────┼──────────┼────────────────┼──────────┼────────────┤   │
│  │ 0001 │ Ahmed M. │ 0612345678     │ Casa     │ [📞 Call]  │   │
│  │ 0002 │ Sara K.  │ 0698765432     │ Rabat    │ [📞 Call]  │   │
│  └──────┴──────────┴────────────────┴──────────┴────────────┘   │
└─────────────────────────────────────────────────────────────────┘

Agent clicks [📞 Call] → Opens CONFIRMATION POPUP:

┌─────────────────────────────────────────────────────────────────┐
│  📞 Order Confirmation — ORD-0001                    [✕ Close]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  👤 CUSTOMER INFO                                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Name: Ahmed Mansouri                                      │  │
│  │ Phone: 0612345678          📋 (click to copy)            │  │
│  │ City: Casablanca                                          │  │
│  │ Address: 123 Rue Mohammed V, Maarif                       │  │
│  │ Tags: [VIP] [Repeat]                                      │  │
│  │ Previous Orders: 3 (2 delivered, 1 returned)              │  │
│  │ ⚠️ Duplicate: Order ORD-0098 placed 2h ago (pending)     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  📦 ORDER ITEMS                                                 │
│  ┌────────────┬──────────┬─────┬────────┬──────────┐           │
│  │ Product    │ Variant  │ Qty │ Price  │ Stock    │           │
│  ├────────────┼──────────┼─────┼────────┼──────────┤           │
│  │ T-Shirt X  │ M / Red  │ 2   │ 99 MAD │ ✅ 45   │           │
│  │ Hoodie Y   │ L / Blue │ 1   │ 199 MAD│ ✅ 12   │           │
│  └────────────┴──────────┴─────┴────────┴──────────┘           │
│  Subtotal: 397 MAD                                              │
│                                                                  │
│  💸 DISCOUNT (optional)                                         │
│  ┌──────────────┬──────────────┐                                │
│  │ Type: [▼ %]  │ Value: [___] │  → New Total: 357 MAD         │
│  └──────────────┴──────────────┘                                │
│                                                                  │
│  🚚 DELIVERY COMPANY                                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Courier: [▼ Coliix.ma           ]                         │  │
│  │ City:    [▼ Casablanca          ] ✅ Valid city            │  │
│  │                                                            │  │
│  │ ⚠️ City must match courier's supported cities list        │  │
│  │ If city not found → show error: "City not supported by    │  │
│  │ this courier. Choose a different courier or update city."  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  📝 CALL NOTES                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Customer confirmed, wants delivery before Friday.         │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  📅 SCHEDULE CALLBACK (optional)                                │
│  ┌──────────────────────┐                                       │
│  │ Date: [__/__/____]   │  (for "reported" status)             │
│  │ Time: [__:__]        │                                       │
│  └──────────────────────┘                                       │
│                                                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────────────────┐  │
│  │ ✅ Confirm  │ │ ❌ Cancel   │ │ ⏰ Report (callback)     │  │
│  └─────────────┘ └─────────────┘ └──────────────────────────┘  │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────────────────┐  │
│  │ 📵 Unreach. │ │ 🚫 Fake     │ │ 📦 Out of Stock          │  │
│  └─────────────┘ └─────────────┘ └──────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## City Validation Logic

```typescript
// When agent selects a courier in the confirmation popup:
1. Load courier's supported cities from city_shipping_fees table
2. Check if order city (normalized) exists in courier's city list
3. If match → ✅ Show green check "Valid city"
4. If no match → ❌ Show red error:
   "City 'Tiflet' is not supported by Coliix.ma"
   Options:
   a. Change courier (if another courier supports it)
   b. Update customer city to a supported city
   c. Proceed anyway (admin override only)
5. City dropdown in popup → filtered to only show courier's supported cities
```

## Confirmation Popup Actions

| Button | Status Set | Stock Impact | Requirements |
|---|---|---|---|
| ✅ Confirm | confirmed | DEDUCT | Stock available, city valid, courier selected |
| ❌ Cancel | cancelled | None | Reason mandatory in call_notes |
| ⏰ Report | reported | None | Callback date/time required |
| 📵 Unreachable | unreachable | None | Auto after 3 attempts (or manual) |
| 🚫 Fake | fake | None | Terminal, cannot be undone |
| 📦 Out of Stock | out_of_stock | None | System can auto-detect from stock |

---

# 15. PRODUCTS & VARIANTS

## Product Categories

- **Admin creates categories freely** (no predefined list)
- Categories are flat (no nesting for V1)
- Examples: Clothing, Electronics, Accessories, Beauty

```sql
CREATE TABLE product_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES product_categories(id);
```

## Product Images

- Products imported from YouCan include **all images**
- Store images via file upload system (`./uploads/products/`)
- Max **5 images per product**
- First image = thumbnail (shown in lists)
- Supported: JPG, PNG, WebP
- YouCan sync copies images to local storage

## Variant Matrix Table (Size × Color)

Products have **2 variation axes**: Size and Color, displayed as a **matrix table**.

```
┌───────────────────────────────────────────────────────────┐
│  Product: Premium T-Shirt                                 │
│  Category: Clothing                                       │
│  Base Price: 99 MAD | Cost: 35 MAD                       │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  📊 VARIANT MATRIX                                       │
│  ┌────────┬──────┬──────┬──────┬──────┬──────┐          │
│  │        │  S   │  M   │  L   │  XL  │ XXL  │          │
│  ├────────┼──────┼──────┼──────┼──────┼──────┤          │
│  │ Red    │  12  │  25  │  18  │   8  │   3  │          │
│  ├────────┼──────┼──────┼──────┼──────┼──────┤          │
│  │ Blue   │  10  │  30  │  22  │  15  │   5  │          │
│  ├────────┼──────┼──────┼──────┼──────┼──────┤          │
│  │ Black  │  20  │  35  │  28  │  12  │   7  │          │
│  ├────────┼──────┼──────┼──────┼──────┼──────┤          │
│  │ White  │  15  │  20  │  16  │  10  │   4  │          │
│  └────────┴──────┴──────┴──────┴──────┴──────┘          │
│  Numbers = stock quantity per variant                     │
│  🟢 >10  🟡 1-10  🔴 0 (out of stock)                   │
│                                                           │
│  Click any cell to edit stock / price / SKU              │
└───────────────────────────────────────────────────────────┘
```

## Variant Schema (Updated)

```sql
ALTER TABLE product_variants ADD COLUMN size VARCHAR(20);
ALTER TABLE product_variants ADD COLUMN color VARCHAR(50);
-- variant_name becomes auto-generated: "{size} / {color}"
-- e.g., "M / Red", "L / Blue"
```

---

# 16. ADS COST TRACKING (New Feature)

> **New requirement**: Profitability calculation includes **ads cost**. Need to track advertising expenses per product/campaign.

## How Ads Cost Works

```sql
-- Option: Track ads as a special expense category
-- Ads expenses are linked to products (optional) or tracked globally

CREATE TABLE ad_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,            -- e.g., "FB - T-Shirt Campaign Feb"
  platform VARCHAR(50) NOT NULL,         -- facebook, instagram, google, tiktok
  product_id INTEGER REFERENCES products(id),  -- NULL = general campaign
  start_date DATE NOT NULL,
  end_date DATE,
  total_budget DECIMAL(10,2) NOT NULL,   -- total spent
  total_spent DECIMAL(10,2) DEFAULT 0,   -- actual spent so far
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Daily ad cost tracking for granular analytics
CREATE TABLE ad_daily_costs (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES ad_campaigns(id),
  date DATE NOT NULL,
  amount_spent DECIMAL(10,2) NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  orders_attributed INTEGER DEFAULT 0,    -- how many orders came from this ad
  UNIQUE(campaign_id, date)
);
```

## Ads in the Sidebar

- Ads management lives under **Cash → Expenses** (as a special category)
- OR add a new sub-item under Analytics: **Analytics → Ad Campaigns**
- Admin enters ad spend manually (daily or weekly totals)
- Future: connect Facebook Ads API for auto-import

---

# 17. PROFITABILITY FORMULA (Updated)

```
Profit per Order =
    Revenue (total_amount after discount, only if delivered)
  - Product Cost (SUM of cost_price × qty for each item)
  - Shipping Fee (from city_shipping_fees based on order city + courier)
  - Commission (agent commission for this order)
  - Ads Cost (proportional share — see below)

Ads Cost Attribution per Order:
  If campaign is linked to a product:
    ad_cost_per_order = campaign_total_spent / orders_for_that_product_in_period
  If campaign is general:
    ad_cost_per_order = campaign_total_spent / total_orders_in_period

Overall Business Profitability:
  Total Profit = Total Revenue (delivered)
               - Total Product Cost
               - Total Shipping Fees
               - Total Commissions Paid
               - Total Ad Spend
               - Other Expenses (from expenses table, non-commission, non-ads)
```

## Profitability Dashboard Widget

```
┌─────────────────────────────────────────────────────┐
│  💰 Profitability (This Month)                      │
├──────────────────────┬──────────────────────────────┤
│ Revenue              │         +45,200 MAD          │
│ Product Cost         │         -15,800 MAD          │
│ Ads Spend            │          -8,500 MAD          │
│ Shipping Fees        │          -4,200 MAD          │
│ Commissions          │          -3,100 MAD          │
│ Other Expenses       │          -2,800 MAD          │
├──────────────────────┼──────────────────────────────┤
│ NET PROFIT           │         +10,800 MAD    💚    │
│ Margin               │           23.9%              │
└──────────────────────┴──────────────────────────────┘
```

---

# 18. CUSTOMER TAGS

## Predefined Tags

| Tag | Color | Auto-Applied? | Criteria |
|---|---|---|---|
| **VIP** | 🟡 Gold | Manual | Admin/agent marks manually |
| **Blacklist** | 🔴 Red | Manual | Admin marks (blocks future orders warning) |
| **Wholesale** | 🔵 Blue | Manual | Admin marks |
| **Repeat** | 🟢 Green | **Auto** | ≥2 delivered orders |
| **High Return** | 🟠 Orange | **Auto** | Return rate >30% (≥3 orders) |

```sql
CREATE TABLE customer_tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  slug VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(7) NOT NULL,
  is_auto BOOLEAN DEFAULT false,        -- system-applied
  description VARCHAR(255)
);

CREATE TABLE customer_tag_assignments (
  customer_id INTEGER REFERENCES customers(id),
  tag_id INTEGER REFERENCES customer_tags(id),
  assigned_by INTEGER REFERENCES users(id),  -- NULL if auto
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (customer_id, tag_id)
);
```

## Blacklist Behavior

- When a customer is tagged **Blacklist**:
  - New orders from this phone show: "⚠️ BLACKLISTED CUSTOMER" banner in red
  - Order is still created (not blocked), but agent sees the warning
  - Admin can choose to cancel or proceed

## Customer Notes

- Both **agents** and **admins** can add notes
- Notes are timestamped and attributed to the author
- Shown in customer detail page as a timeline

```sql
CREATE TABLE customer_notes (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  note TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

# 19. NOTIFICATION EVENT CATALOG

| # | Event | Who Gets Notified | Channel |
|---|---|---|---|
| 1 | New order arrived | Assigned agent | In-app + WhatsApp |
| 2 | Order confirmed | Managers | In-app |
| 3 | Order cancelled | Managers | In-app |
| 4 | Callback due in 15 min | Assigned agent | In-app (real-time popup) |
| 5 | Low stock alert (≤ threshold) | Admins | In-app |
| 6 | Delivery export failed | Admins | In-app |
| 7 | Commission calculated | Agent + managers | In-app |
| 8 | New return received | Admins | In-app |
| 9 | Order status changed by courier | Agent + admins | In-app |
| 10 | Blacklisted customer placed order | Admins | In-app |
| 11 | Duplicate order detected (24h) | Assigned agent | In-app (badge) |
| 12 | Agent went offline/online | Managers | In-app |
| 13 | Recurring expense due today | Admins | In-app |

**WhatsApp**: Only used for outbound to customers (order updates, delivery tracking). Not for agent notifications.

---

# 20. ADDITIONAL SCHEMA CHANGES (from this round)

```sql
-- Product categories
CREATE TABLE product_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES product_categories(id);
ALTER TABLE product_variants ADD COLUMN size VARCHAR(20);
ALTER TABLE product_variants ADD COLUMN color VARCHAR(50);

-- Ad campaigns
CREATE TABLE ad_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  product_id INTEGER REFERENCES products(id),
  start_date DATE NOT NULL,
  end_date DATE,
  total_budget DECIMAL(10,2) NOT NULL,
  total_spent DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ad_daily_costs (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES ad_campaigns(id),
  date DATE NOT NULL,
  amount_spent DECIMAL(10,2) NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  orders_attributed INTEGER DEFAULT 0,
  UNIQUE(campaign_id, date)
);

-- Customer tags
CREATE TABLE customer_tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  slug VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(7) NOT NULL,
  is_auto BOOLEAN DEFAULT false,
  description VARCHAR(255)
);

CREATE TABLE customer_tag_assignments (
  customer_id INTEGER REFERENCES customers(id),
  tag_id INTEGER REFERENCES customer_tags(id),
  assigned_by INTEGER REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (customer_id, tag_id)
);

-- Customer notes
CREATE TABLE customer_notes (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  note TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- New migrations to add:
-- 027_create_product_categories.sql
-- 028_add_variant_size_color.sql
-- 029_create_ad_campaigns.sql
-- 030_create_customer_tags.sql
-- 031_create_customer_notes.sql
```

---

# 21. COMPLETE DOCUMENT MAP

# 22. ORDER MERGE FLOW (Detailed)

## Duplicate Alert on Call

When agent clicks **📞 Call** in the Call Centre queue:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ DUPLICATE ORDER ALERT                                      │
│                                                                  │
│  This customer has another pending order:                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ ORD-0042 (Pending) — placed 3 hours ago                   │  │
│  │ Items: T-Shirt X (M/Red) ×2, Hoodie Y (L/Blue) ×1        │  │
│  │ Total: 397 MAD                                             │  │
│  │                                                            │  │
│  │ [👁️ View Details]    [🔗 Merge Into This Order]           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Current order: ORD-0098 (Pending)                              │
│  Items: Cap Z (One Size/Black) ×1                               │
│  Total: 49 MAD                                                  │
│                                                                  │
│  [Continue Without Merging]    [🔗 Merge Orders]                │
└─────────────────────────────────────────────────────────────────┘
```

## Merge Logic

```
When agent clicks "🔗 Merge Orders":

1. Agent selects which order is the PRIMARY (the one that stays)
2. Items from the SECONDARY order are COPIED into the primary order
3. Agent sees the combined items list and can:
   - ✏️ EDIT quantities
   - ➕ ADD new items
   - 🗑️ REMOVE items
4. Agent reviews the merged total amount
5. Clicks "Confirm Merge"
6. System:
   a. Copies items from secondary → primary order
   b. Recalculates total_amount
   c. Sets secondary order: confirmation_status = 'merged_into'
   d. Sets secondary order: merged_into_order_id = primary.id
   e. Audit log: "ORD-0042 merged into ORD-0098 by Agent Ahmed"
   f. Emit Socket.IO 'order:merged' event
7. Secondary order disappears from queue and order list
8. Primary order shows "📎 Merged Orders (1)" collapsible section
```

## Merged Order Item Editing

```
┌─────────────────────────────────────────────────────────────────┐
│  📎 MERGE PREVIEW — Combined Items                   [Confirm] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┬──────────┬─────┬────────┬─────────┬──────────┐ │
│  │ Product    │ Variant  │ Qty │ Price  │ Source  │ Action   │ │
│  ├────────────┼──────────┼─────┼────────┼─────────┼──────────┤ │
│  │ T-Shirt X  │ M / Red  │ [2] │ 99 MAD │ ORD-42  │ 🗑️      │ │
│  │ Hoodie Y   │ L / Blue │ [1] │ 199 MAD│ ORD-42  │ 🗑️      │ │
│  │ Cap Z      │ OS/Black │ [1] │ 49 MAD │ ORD-98  │ 🗑️      │ │
│  └────────────┴──────────┴─────┴────────┴─────────┴──────────┘ │
│                                                                  │
│  [+ Add Item]                          New Total: 446 MAD       │
│                                                                  │
│  Qty fields are EDITABLE (inline number input)                  │
│  Agent can add new items or remove existing ones                │
└─────────────────────────────────────────────────────────────────┘
```

```sql
-- Schema addition
ALTER TABLE orders ADD COLUMN merged_into_order_id INTEGER REFERENCES orders(id);
```

---

# 23. STOCK PAGE LAYOUT

## Stock KPI Cards (Top)

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Total SKUs   │ │ Total Units  │ │ Stock Value  │ │ Low Stock    │
│     124      │ │    2,847     │ │  99,645 MAD  │ │  ⚠️ 8 items  │
│              │ │              │ │ (at cost)    │ │  (< threshold)│
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

| KPI | Formula |
|---|---|
| Total SKUs | COUNT of active product_variants |
| Total Units | SUM of stock_quantity across all variants |
| Stock Value | SUM of (stock_quantity × cost_price) per variant |
| Low Stock | COUNT of variants WHERE stock_quantity ≤ low_stock_threshold |

## 2-Column Layout (Desktop)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📦 Stock Management                                                       │
│  📅 [Filter bar if needed]                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  [KPI Cards — see above]                                                   │
├─────────────────────────────┬───────────────────────────────────────────────┤
│                             │                                               │
│  LEFT: Product List         │  RIGHT: Variant Matrix (selected product)    │
│  ─────────────────          │  ──────────────────────────────────           │
│                             │                                               │
│  🔍 [Search products...]    │  📦 T-Shirt X                               │
│                             │  Category: Clothing                           │
│  ┌──────┬────────┬──────┐  │  Cost: 35 MAD | Price: 99 MAD               │
│  │ 📷   │ T-Shirt│ 156  │  │                                               │
│  │      │ X      │units │  │  ┌────────┬─────┬─────┬─────┬─────┐         │
│  │      │ 99 MAD │      │  │  │        │  S  │  M  │  L  │  XL │         │
│  ├──────┼────────┼──────┤  │  ├────────┼─────┼─────┼─────┼─────┤         │
│  │ 📷   │ Hoodie │  98  │  │  │ Red    │ [12]│ [25]│ [18]│ [ 8]│         │
│  │      │ Y      │units │  │  ├────────┼─────┼─────┼─────┼─────┤         │
│  │      │ 199 MAD│      │  │  │ Blue   │ [10]│ [30]│ [22]│ [15]│         │
│  ├──────┼────────┼──────┤  │  ├────────┼─────┼─────┼─────┼─────┤         │
│  │ 📷   │ Cap Z  │  45  │  │  │ Black  │ [20]│ [35]│ [28]│ [12]│         │
│  │      │        │units │  │  ├────────┼─────┼─────┼─────┼─────┤         │
│  │      │ 49 MAD │      │  │  │ White  │ [15]│ [20]│ [16]│ [10]│         │
│  └──────┴────────┴──────┘  │  └────────┴─────┴─────┴─────┴─────┘         │
│                             │  Totals:   57   110    84    45 = 296 total  │
│  Total: 3 products          │                                               │
│  299 total units            │  Numbers in [ ] are EDITABLE                 │
│                             │  🟢 >10  🟡 1-10  🔴 0                      │
│                             │                                               │
│                             │  [+ Add Size] [+ Add Color]                  │
│                             │  [Save Changes]                               │
│                             │                                               │
├─────────────────────────────┴───────────────────────────────────────────────┤
│                                                                             │
│  ⚠️ LOW STOCK ITEMS (below threshold)                                      │
│  ┌────────────┬──────────┬───────┬───────────┬──────────────────┐          │
│  │ Product    │ Variant  │ Stock │ Threshold │ Action           │          │
│  ├────────────┼──────────┼───────┼───────────┼──────────────────┤          │
│  │ T-Shirt X  │ XL/Red   │   3  │    10     │ [Edit Stock]     │          │
│  │ Cap Z      │ OS/Black │   2  │     5     │ [Edit Stock]     │          │
│  │ Hoodie Y   │ L/Blue   │   5  │    10     │ [Edit Stock]     │          │
│  └────────────┴──────────┴───────┴───────────┴──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Stock Page Features
- **Left panel**: Product list with image thumbnail, name, price, total stock count
- **Right panel**: Editable variant matrix for selected product
  - Cells are editable inline — click a cell, type new qty, tab to next
  - Row totals and column totals auto-calculate
  - Color-coded cells: 🟢 >10, 🟡 1-10, 🔴 0
  - Add new sizes / colors buttons
  - Save button saves all changes in bulk
- **Bottom section**: Low stock alert table (variants below threshold)
- **Mobile**: stacks vertically (product list → matrix below)

---

# 24. AGENT PHONE CALLING (QR Code)

## How Agents Call Customers

```
Agent clicks "📞 Call" in Call Centre:
1. Confirmation popup opens (see §14)
2. Customer phone number displayed prominently
3. Two ways to call:

   a. 📋 COPY: Click phone number → copied to clipboard
      → Agent dials manually on personal phone

   b. 📱 QR CODE: Click "Scan to Call" button
      → Shows QR code encoding: tel:+212612345678
      → Agent scans with personal phone camera
      → Phone app opens with number pre-filled, ready to dial
```

### QR Code Display

```
┌─────────────────────────────────┐
│  📱 Scan to Call                │
│                                  │
│  ┌──────────────────────┐       │
│  │  ██▀▀██▀▀██▀▀██▀▀██ │       │
│  │  ██  ██  ██  ██  ██ │       │
│  │  ██▄▄██▄▄██▄▄██▄▄██ │       │
│  │  ██▀▀██▀▀██▀▀██▀▀██ │       │
│  │  ██  ██  ██  ██  ██ │       │
│  │  ██▄▄██▄▄██▄▄██▄▄██ │       │
│  └──────────────────────┘       │
│                                  │
│  0612345678  [📋 Copy]          │
│                                  │
│  Scan with your phone camera    │
└─────────────────────────────────┘
```

### Implementation
- Use **qrcode.react** library (lightweight, client-side)
- QR encodes: `tel:+212XXXXXXXXX` (normalized with country code)
- QR shown inside the confirmation popup alongside phone number
- On mobile (responsive): show `tel:` link directly → tap to call

---

# 25. ANALYTICS PAGE (Full)

## Analytics Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📈 Analytics                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  📅 [Last 30 days ▼]  👤 [All agents ▼]  📦 [All products ▼]  🏙️ [All ▼]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ── TAB 1: OVERVIEW ──                                                     │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │ 📈 Revenue Over Time (line chart)                               │      │
│  │                                                                  │      │
│  │   Revenue ──── (solid line)                                     │      │
│  │   Cost ─ ─ ─ (dashed line)                                     │      │
│  │   Profit ···· (dotted line)                                     │      │
│  │                                                                  │      │
│  │   ╱\    ╱\                                                      │      │
│  │  ╱  \  ╱  \  ╱                                                  │      │
│  │ ╱    ╲╱    ╲╱                                                   │      │
│  │ Jan   Feb   Mar   Apr   May                                     │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  ┌────────────────────────────┬────────────────────────────────────┐       │
│  │ 📊 Orders by Source        │ 📊 Orders by Status               │       │
│  │ (donut chart)              │ (horizontal bar)                   │       │
│  │                            │                                    │       │
│  │  YouCan: 65%  ███████████  │  ████████████ Delivered: 180      │       │
│  │  Manual: 20%  ████         │  ██████ In Transit: 45            │       │
│  │  WhatsApp: 10% ██          │  ████ Returned: 25                │       │
│  │  Phone: 5%    █            │  ██ Cancelled: 15                 │       │
│  └────────────────────────────┴────────────────────────────────────┘       │
│                                                                             │
│  ── TAB 2: BY CITY ──                                                      │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │ 🏙️ Revenue by City (bar chart)                                  │      │
│  │                                                                  │      │
│  │ Casablanca  ████████████████████ 15,200 MAD  (94% delivery)    │      │
│  │ Rabat       █████████████ 9,800 MAD  (91% delivery)            │      │
│  │ Marrakech   ████████ 6,400 MAD  (87% delivery)                 │      │
│  │ Fès         ██████ 4,200 MAD  (89% delivery)                   │      │
│  │ Tanger      █████ 3,800 MAD  (85% delivery)                    │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │ 📊 City Comparison Table                                        │      │
│  │ ┌──────────┬────────┬────────┬──────────┬────────┬────────────┐ │      │
│  │ │ City     │ Orders │ Conf.% │ Deliver% │Revenue │ Return%    │ │      │
│  │ ├──────────┼────────┼────────┼──────────┼────────┼────────────┤ │      │
│  │ │ Casa     │    89  │  72%   │   94%    │ 15.2K  │   3.2%     │ │      │
│  │ │ Rabat    │    62  │  68%   │   91%    │  9.8K  │   4.1%     │ │      │
│  │ │ Marrakech│    45  │  65%   │   87%    │  6.4K  │   5.5%     │ │      │
│  │ └──────────┴────────┴────────┴──────────┴────────┴────────────┘ │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  ── TAB 3: BY PRODUCT ──                                                   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │ 📦 Revenue by Product (bar chart) + Variant Sub-table           │      │
│  │                                                                  │      │
│  │ 1. T-Shirt X — 156 delivered — 15,444 MAD revenue              │      │
│  │    ▸ M/Red: 45 sold | L/Blue: 38 sold | M/Black: 33 sold      │      │
│  │ 2. Hoodie Y — 98 delivered — 19,502 MAD revenue                │      │
│  │    ▸ XL/Grey: 28 sold | L/Black: 25 sold | M/Blue: 20 sold    │      │
│  │ 3. Cap Z — 67 delivered — 3,283 MAD revenue                    │      │
│  │    ▸ OS/Black: 40 sold | OS/White: 27 sold                     │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  ── TAB 4: BY AGENT ──                                                     │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │ 👤 Agent Comparison Table                                        │      │
│  │ ┌──────────┬────────┬────────┬──────────┬────────┬────────────┐ │      │
│  │ │ Agent    │ Assigned│ Conf.% │ Deliver% │Revenue │ Avg Time  │ │      │
│  │ ├──────────┼────────┼────────┼──────────┼────────┼────────────┤ │      │
│  │ │ Ahmed    │   120  │  75%   │   93%    │ 18.5K  │ 2.3 min   │ │      │
│  │ │ Fatima   │   105  │  71%   │   90%    │ 15.2K  │ 3.1 min   │ │      │
│  │ │ Youssef  │    85  │  68%   │   88%    │ 11.8K  │ 2.8 min   │ │      │
│  │ └──────────┴────────┴────────┴──────────┴────────┴────────────┘ │      │
│  │                                                                  │      │
│  │  Avg Time = average time from assignment to confirmation         │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  ── TAB 5: PROFITABILITY ──                                                │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │ 💰 Profitability Trend (line chart)                              │      │
│  │                                                                  │      │
│  │   Revenue ──── Expenses ─ ─ ─ Net Profit ····                   │      │
│  │                                                                  │      │
│  ├──────────────────────────────────────────────────────────────────┤      │
│  │                                                                  │      │
│  │  Breakdown Table:                                                │      │
│  │  ┌────────────────┬──────────────┬────────────┐                 │      │
│  │  │ Category       │ Amount (MAD) │ % of Rev   │                 │      │
│  │  ├────────────────┼──────────────┼────────────┤                 │      │
│  │  │ Revenue        │ +45,200      │ 100%       │                 │      │
│  │  │ Product Cost   │ -15,800      │ 35.0%      │                 │      │
│  │  │ Ads Spend      │  -8,500      │ 18.8%      │                 │      │
│  │  │ Shipping Fees  │  -4,200      │  9.3%      │                 │      │
│  │  │ Commissions    │  -3,100      │  6.9%      │                 │      │
│  │  │ Other Expenses │  -2,800      │  6.2%      │                 │      │
│  │  ├────────────────┼──────────────┼────────────┤                 │      │
│  │  │ NET PROFIT     │ +10,800      │ 23.9%      │                 │      │
│  │  └────────────────┴──────────────┴────────────┘                 │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  All tabs respond to the global filter bar at the top                      │
│  Every chart has a [Download PDF] button                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Analytics Tabs Summary

| Tab | Charts | Tables |
|---|---|---|
| Overview | Revenue/Cost/Profit trend line, Orders by Source donut, Orders by Status bar | — |
| By City | Revenue by City bar chart | City comparison (orders, confirm%, deliver%, revenue, return%) |
| By Product | Revenue by Product bar chart | Product ranking with top variant sub-list |
| By Agent | — | Agent comparison (assigned, confirm%, deliver%, revenue, avg confirm time) |
| Profitability | Profit trend line | Breakdown table (revenue, costs, margins) |

## Chart Library

- Use **Recharts** (React-friendly, lightweight, responsive)
- All charts support: hover tooltips, responsive resize, PDF export
- Color scheme: uses brown palette from §1 for consistency

---

# 26. YOUCAN SYNC DIRECTION

| Direction | Supported | Details |
|---|---|---|
| YouCan → CRM | ✅ Yes | Webhooks for new orders, product import |
| CRM → YouCan | ❌ No | No push back to YouCan when order is confirmed or status changes |

- YouCan is **import-only**: orders and products come into CRM
- CRM is the **source of truth** for all order statuses, stock, and customer data
- No status sync back to YouCan store

---

# 28. CALL CENTRE — ENHANCED LAYOUT (Improved)

> **Inspired by reference**: Added commission visibility, status tabs with live counts, and repeat customer badges.

## Full Call Centre Page Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📞 Call Center                                                            │
│  Confirm and manage pending orders                   👤 Ahmed   ⏸️ Break  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ROW 1 — AGENT KPI CARDS                                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐│
│  │ Total      │ │ Pending    │ │ Confirmed  │ │ Delivered  │ │ Returned ││
│  │ Assigned   │ │ Calls      │ │            │ │            │ │          ││
│  │   395  📋  │ │   10   ⏳  │ │    0   ✅  │ │    0   📦  │ │   0   🔄 ││
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └──────────┘│
│                                                                             │
│  ROW 2 — COMMISSION CARDS (agent sees their money)                         │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌───────────────────────┐│
│  │ 💰 Commission Paid  │ │ 💵 Commission Owed  │ │ ⚠️ Pending Deductions ││
│  │    1,250.00 MAD     │ │    450.00 MAD       │ │    0.00 MAD           ││
│  │ Total received      │ │ Pending payment     │ │ May be applied later  ││
│  └─────────────────────┘ └─────────────────────┘ └───────────────────────┘│
│                                                                             │
│  📅 [This Year ▼] Jan 01, 2026 – Feb 12, 2026                             │
│  🔍 [Search by order number, customer name, or phone...]        🔄Refresh │
│                                                                             │
│  ROW 3 — STATUS TABS (clickable, each filters the queue)                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ [Pending 10] [Resched 3] [Failed 0] [Scheduled 2] [Confirmed 0]   │   │
│  │ [Delivered 0] [Returned 0] [Cancelled 0] [Paid 0]                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  Active tab = highlighted in primary color, count in badge                 │
│                                                                             │
│  ROW 4 — ORDERS QUEUE TABLE                                                │
│  ┌───────┬──────────────────┬─────────────────────────┬────────┬────┬────┐│
│  │ Order │ Customer         │ Product                 │ Amount │City│Act ││
│  ├───────┼──────────────────┼─────────────────────────┼────────┼────┼────┤│
│  │ORD-42 │ Ahmed M.  📦2   │ T-Shirt X (M/Red)       │ 290 MAD│Casa│📞 ││
│  │2/6    │ 📱0612345.. 📋  │                         │        │    │Call││
│  ├───────┼──────────────────┼─────────────────────────┼────────┼────┼────┤│
│  │ORD-41 │ Basma     📦1   │ Hoodie Y (GRIS/XXL)     │ 290 MAD│Fes │📞 ││
│  │2/6    │ 📱0649988.. 📋  │                         │        │    │Call││
│  └───────┴──────────────────┴─────────────────────────┴────────┴────┴────┘│
│                                                                             │
│  Showing 1 to 10 of 395         Rows per page: [10 ▼]   < 1 of 40 >       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### New Features from Reference

| Feature | Details |
|---|---|
| **Commission cards** | Agent sees Commission Paid / Owed / Pending Deductions right in Call Centre — motivational |
| **Status tabs with counts** | Clickable tabs: Pending (10), Rescheduled (3), etc. — each tab filters the queue list |
| **Order count badge** | `📦2` next to customer name = this customer has 2 previous orders (repeat indicator) |
| **Phone copy icon** | 📋 icon next to phone number — one-click copy to clipboard |
| **Break button** | Top-right "⏸️ Break" toggle — sets agent as unavailable, pauses auto-assignment |
| **Pagination** | Bottom row: "Showing 1 to 10 of 395" + rows per page selector + page navigation |

### Commission Cards Logic

```typescript
// Commission Paid:
SELECT SUM(amount) FROM commissions 
WHERE agent_id = $agentId AND status = 'paid';

// Commission Owed:
SELECT SUM(amount) FROM commissions 
WHERE agent_id = $agentId AND status = 'pending';

// Pending Deductions:
SELECT SUM(amount) FROM commissions 
WHERE agent_id = $agentId AND status = 'deducted_pending';
// (e.g., returned orders where commission may be clawed back)
```

---

# 29. ALL ORDERS PAGE — ENHANCED

> **Inspired by reference**: Filter pills, column toggle, Select All, universal search.

## All Orders Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📋 All Orders                                          10,234 orders      │
│  View and manage your orders                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🔍 [Search by Order ID, Customer, or Phone...]                            │
│                                                                             │
│  FILTER PILLS (inline, compact)                                            │
│  ┌──────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ ✅ All Confirm. ▼│ │ 🚚 All Ship.▼│ │ 🏢 All Co. ▼ │ │ 🌐 All Src.▼│  │
│  └──────────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│  ┌──────────────┐ ┌──────────────┐                                        │
│  │ 📦 All Prod.▼│ │ 🏙️ All City▼ │              [👤 Customer] [⚙️ Columns]│
│  └──────────────┘ └──────────────┘                                        │
│                                                                             │
│  ☐ Select All                                                              │
│  ┌────────┬──────────┬──────────────┬─────────────────┬────────┬─────────┐│
│  │ORDER ID│CREATED AT│ CUSTOMER     │ PRODUCT         │ AMOUNT │CONFIRM- ││
│  │        │          │              │                 │        │ATION    ││
│  ├────────┼──────────┼──────────────┼─────────────────┼────────┼─────────┤│
│  │☐ORD-42 │06/02/2026│ Ahmed M.     │ Ensemble rayé   │290 MAD │[Pending]││
│  │        │ 20:22    │📱0612..  📋  │ avec détail...  │        │  🟡     ││
│  │        │          │📍 Casablanca │                 │        │         ││
│  ├────────┼──────────┼──────────────┼─────────────────┼────────┼─────────┤│
│  │☐ORD-41 │06/02/2026│ Sarah        │ Ensemble rayé   │290 MAD │[Pending]││
│  │        │ 20:07    │📱0666..  📋  │ avec détail...  │        │  🟡     ││
│  │        │          │📍 Rabat      │                 │        │         ││
│  └────────┴──────────┴──────────────┴─────────────────┴────────┴─────────┘│
│                                                                             │
│  CONTINUED COLUMNS (scrollable right):                                     │
│  │SHIPPING  │DELIVERY │SOURCE  │CITY      │ ACTIONS                       │
│  │          │NOTES    │        │          │                               │
│  │Not Ship. │  —      │YouCan 🔴│Casa     │ 👁️  ✏️  📞  🗑️              │
│  │Not Ship. │  —      │YouCan 🔴│Rabat    │ 👁️  ✏️  📞  🗑️              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Filter Pills (Compact Dropdowns)

| Pill | Options |
|---|---|
| **Confirmation** | All, Pending, Confirmed, Cancelled, Reported, Unreachable, Fake, Out of Stock, Merged |
| **Shipping** | All, Not Shipped, Shipped, In Transit, Delivered, Returned |
| **Company** | All, Coliix.ma, [Second courier placeholder] |
| **Source** | All, YouCan, Manual, WhatsApp |
| **Product** | All, [searchable product list] |
| **City** | All, [searchable city list] |

### Column Toggle (⚙️ Columns)

```
┌──────────────────────────┐
│  ⚙️ Visible Columns      │
│                          │
│  ☑ Order ID              │
│  ☑ Created At            │
│  ☑ Customer              │
│  ☑ Product               │
│  ☑ Amount                │
│  ☑ Confirmation          │
│  ☑ Shipping              │
│  ☐ Delivery Notes        │
│  ☑ Source                 │
│  ☐ Delivery Company      │
│  ☑ City                  │
│  ☑ Actions               │
│                          │
│  [Reset to Default]      │
└──────────────────────────┘
```

- Columns checked = visible in table
- User preference saved in `localStorage`
- Default shows most-used columns; power users can toggle extras

### Select All + Bulk Actions (Admin Only)

```
When admin selects rows → Bulk action bar appears:

┌─────────────────────────────────────────────────────────────┐
│  ☑ 5 orders selected    [📤 Export]  [👤 Assign]  [✕ Clear]│
└─────────────────────────────────────────────────────────────┘
```

### Actions Column

| Icon | Action | Who |
|---|---|---|
| 👁️ | View order details | All |
| ✏️ | Edit order (if not shipped) | Admin + Manager |
| 📞 | Open call/confirmation popup | Agent |
| 🗑️ | Delete order | Admin only |

---

# 30. RETURNS VERIFICATION PAGE

> **Inspired by reference**: Dedicated returns workflow with QR scanning and verification tabs.

## Returns Page Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔄 Returns Verification                                 [📱 Scan QR Code]│
│  Verify returned orders from delivery companies                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  KPI CARDS                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ Pending      │ │ Verified     │ │ Total        │ │ Return Rate  │     │
│  │ Verification │ │ Today        │ │ Returned     │ │              │     │
│  │     12  ⏳   │ │     5   ✅   │ │    234  📦   │ │   4.2%  📉  │     │
│  │ Awaiting     │ │ Confirmed    │ │ All time     │ │ Last 30 days │     │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘     │
│                                                                             │
│  TABS                                                                      │
│  ┌────────────────────────────────┬────────────────────────────────┐       │
│  │  ⏳ Pending Verification (12) │  ✅ Verified (234)             │       │
│  └────────────────────────────────┴────────────────────────────────┘       │
│                                                                             │
│  🔍 [Search by order ID, customer, or tracking number...]                  │
│  🚚 [All Companies ▼]    📅 [Last 30 days ▼]               🔄 Refresh    │
│                                                                             │
│  ┌────────┬──────────┬────────┬──────────┬──────────┬──────────┬────────┐ │
│  │☐       │ ORDER #  │CUSTOMER│ AMOUNT   │ DELIVERY │TRACKING #│RETURNED│ │
│  ├────────┼──────────┼────────┼──────────┼──────────┼──────────┼────────┤ │
│  │☐       │ ORD-0042 │Ahmed M.│ 290 MAD  │ Coliix   │ CLX-1234 │02/10/26│ │
│  │☐       │ ORD-0039 │Sara K. │ 190 MAD  │ Coliix   │ CLX-1198 │02/10/26│ │
│  └────────┴──────────┴────────┴──────────┴──────────┴──────────┴────────┘ │
│                                                                             │
│  ACTIONS per row:                                                          │
│  [✅ Verify] [👁️ View Order] [📝 Add Note]                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### QR Code Scanner for Returns

```
When admin/warehouse staff clicks "📱 Scan QR Code":

┌─────────────────────────────────────────┐
│  📱 Scan Return Package                 │
│                                          │
│  ┌──────────────────────────────┐       │
│  │                              │       │
│  │      📷 Camera Feed          │       │
│  │      (browser camera API)    │       │
│  │                              │       │
│  └──────────────────────────────┘       │
│                                          │
│  Point camera at delivery package       │
│  QR/barcode to auto-find order          │
│                                          │
│  OR enter tracking number manually:     │
│  [CLX-____________]    [🔍 Find]        │
│                                          │
└─────────────────────────────────────────┘

→ Scans barcode/QR on package
→ Matches tracking_number in orders table
→ Opens order details → one-click "Verify Return"
```

### Return Verification Flow

> **Important context**: Returns happen when the **client refuses to accept delivery** (not home, changed mind, etc.). This is NOT a post-delivery return — the product was never received by the customer. The delivery company brings the undelivered package back to your warehouse.

```
1. Client refuses delivery → courier marks as "returned"
2. Delivery company brings undelivered package back to warehouse
3. Warehouse staff either:
   a. Scans QR/barcode on package → auto-finds order
   b. Manually searches by tracking number
4. Staff inspects the package:
   - ✅ "Verify — Product OK" → stock restored to inventory
   - ⚠️ "Verify — Damaged" → stock NOT restored, mark as damaged
   - ❌ "Reject — Wrong Package" → flag for investigation
5. Verified returns move to "Verified" tab
6. Stock is restored automatically for OK returns
```

### Commission & Returns Rule

| Scenario | Commission Impact |
|---|---|
| Order confirmed but **not delivered** (returned) | ❌ No commission — agent only earns on **delivered** orders |
| Order confirmed and **delivered** | ✅ Commission earned |
| Order confirmed, delivered, then **returned** | N/A — this doesn't happen (returns = refused delivery) |

> **Rule**: Commission is calculated **only** on orders with `shipping_status = 'delivered'`. Since returned orders were never delivered, the agent never earned commission on them — so there's **nothing to deduct**.

---

# 31. YOUCAN INTEGRATION SETTINGS PAGE

> **Inspired by reference**: Step-by-step onboarding, field mapping UI, sync dashboard.

## Integration Onboarding Flow (First Time Setup)

```
┌─────────────────────────────────────────────────────────────────┐
│  🔗 Connect Your YouCan Store                                   │
│  Seamlessly integrate your store to manage orders               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📋 What happens next:                                          │
│                                                                  │
│  ❶ ─── Secure OAuth Authorization                              │
│  │     A popup will open to authorize with your YouCan account  │
│  │                                                               │
│  ❷ ─── Select Your Store                                       │
│  │     Choose which YouCan store to connect                     │
│  │     (you have: khayalee, anaqatokiiii)                       │
│  │                                                               │
│  ❸ ─── Map Checkout Fields                                     │
│  │     Connect your checkout fields to CRM fields               │
│  │                                                               │
│  ❹ ─── Start Syncing                                           │
│        Products and orders sync automatically                   │
│                                                                  │
│  ┌───────────────────┐  ┌───────────────────┐                   │
│  │ 🛒 Auto Order     │  │ 📦 Product Sync   │                   │
│  │ Import             │  │ Keep inventory    │                   │
│  │ New orders sync    │  │ up to date        │                   │
│  │ automatically      │  │                   │                   │
│  └───────────────────┘  └───────────────────┘                   │
│  ┌───────────────────┐  ┌───────────────────┐                   │
│  │ 📋 Custom Fields  │  │ 🔄 Real-time      │                   │
│  │ Map checkout       │  │ Updates           │                   │
│  │ fields easily     │  │ Stay synced 24/7  │                   │
│  └───────────────────┘  └───────────────────┘                   │
│                                                                  │
│  🔒 Secure & Safe                                               │
│  We use OAuth 2.0 authentication. Your YouCan credentials       │
│  are never stored. You can revoke access anytime.               │
│                                                                  │
│                                        [🔗 Connect YouCan Store] │
└─────────────────────────────────────────────────────────────────┘
```

## Store Selection Step

```
┌─────────────────────────────────────────────────────────────────┐
│  🏪 Choose Your YouCan Store                                    │
│  Select the store you want to connect                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ✅ Authorized ──────── ❷ Select Store                          │
│                                                                  │
│  Integration Name *                                             │
│  [YouCan Integration          ]                                 │
│                                                                  │
│  ┌───────────────────────────────────────────┐                  │
│  │ 🏠 khayalee                               │                  │
│  │    ● Active  ● Verified                   │                  │
│  └───────────────────────────────────────────┘                  │
│  ┌───────────────────────────────────────────┐                  │
│  │ 🏠 anaqatokiiii                           │                  │
│  │    ● Active  ● Verified                   │                  │
│  └───────────────────────────────────────────┘                  │
│                                                                  │
│  Sync Settings                                                  │
│  Sync Interval: [Every 5 minutes ▼]                             │
│  Sync Type:     [Both (Products & Orders) ▼]                    │
│                                                                  │
│                           [Cancel]  [Continue →]                │
└─────────────────────────────────────────────────────────────────┘
```

## Field Mapping Step

```
┌─────────────────────────────────────────────────────────────────┐
│  🔄 Map Your Checkout Fields                                    │
│  Connect YouCan custom fields to CRM fields                    │
│  Fields marked "Ignore" won't be imported.                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Nom Complet  [Required]                        text     │    │
│  │ Map to: [▼ Customer Full Name    ]                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Téléphone  [Required]                          text     │    │
│  │ Map to: [▼ Customer Phone        ]                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Ville  [Required]                              text     │    │
│  │ Map to: [▼ Customer City          ]                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Adresse  [Required]                            text     │    │
│  │ Map to: [▼ Customer Address       ]                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  💡 Tip: Map fields important for order fulfillment. Unmapped  │
│  fields will be stored as raw data but not used for customer    │
│  creation.                                                      │
│                                                                  │
│  Dropdown options for each mapping:                             │
│  - Customer Full Name                                           │
│  - Customer Phone                                               │
│  - Customer City                                                │
│  - Customer Address                                             │
│  - Customer Email                                               │
│  - Order Notes                                                  │
│  - Ignore (Don't Map)                                           │
│                                                                  │
│                           [← Back]  [Save & Continue →]         │
└─────────────────────────────────────────────────────────────────┘
```

## Initial Sync Dialog (User Chooses)

```
┌─────────────────────────────────────────────────┐
│  🔄 Initial YouCan Sync                         │
│  This is your first sync. Choose what to        │
│  synchronize:                                    │
├─────────────────────────────────────────────────┤
│                                                  │
│  📦 Products (always synced)                    │
│  Every product from your YouCan store will be   │
│  synchronized, including variants, prices,      │
│  and images.                                    │
│                                                  │
│  🛒 Order Import — Choose:                      │
│  ┌─────────────────────────────────────────┐    │
│  │ ○ All Orders                            │    │
│  │   Import ALL existing orders from your  │    │
│  │   YouCan store (may take a few minutes) │    │
│  │                                         │    │
│  │ ● Orders from Today Only                │    │
│  │   Only orders created from today        │    │
│  │   onwards. Historical orders will not   │    │
│  │   be imported.                          │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  ℹ️ First Sync Only                             │
│  These rules apply only to this initial sync.   │
│  After completion, automatic syncs will update  │
│  products and sync new orders normally.         │
│                                                  │
│             [Cancel]    [🔄 Start Sync]          │
└─────────────────────────────────────────────────┘
```

> **Default** = "Orders from Today Only" (pre-selected). User can switch to "All Orders" if they want historical data imported.

## Integration Performance Dashboard (After Setup)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔗 Integration Performance                                               │
│  Track sync status and performance metrics for all connected integrations  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┬────────┬──────────┬────────┬────────────┬──────┬────────┐│
│  │ Integration │ Status │ Products │ Orders │Success Rate│ Last │Actions ││
│  │             │        │          │        │            │ Sync │        ││
│  ├─────────────┼────────┼──────────┼────────┼────────────┼──────┼────────┤│
│  │🟡 anaqato-  │🟢Active│  📦 116  │ 🛒 54  │   100%     │ 5min │🔄⚙️🗑️││
│  │  kiiii      │ [ON/OF]│          │        │   📈       │ ago  │        ││
│  │  YouCan     │        │          │        │            │      │        ││
│  ├─────────────┼────────┼──────────┼────────┼────────────┼──────┼────────┤│
│  │🟡 khayalee  │🟢Active│  📦 82   │ 🛒 28  │    98%     │ 5min │🔄⚙️🗑️││
│  │  YouCan     │ [ON/OF]│          │        │   📈       │ ago  │        ││
│  └─────────────┴────────┴──────────┴────────┴────────────┴──────┴────────┘│
│                                                                             │
│  Actions: 🔄 = Manual sync  ⚙️ = Settings modal  🗑️ = Delete integration │
│  [+ Add New Integration]                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Settings Modal (⚙️ — 3 Tabs)

```
┌─────────────────────────────────────────────────────────────────┐
│  anaqatokiiii — Integration Settings             [Active] [✕]  │
├──────────┬──────────┬──────────┐                                │
│ ⚙️ Setti │ 🔄 Sync │ 📋 Logs │                                │
│   ngs    │          │          │                                │
├──────────┴──────────┴──────────┘                                │
│                                                                  │
│  TAB: Sync                                                      │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐      │
│  │   📦 116       │ │   🛒 54        │ │   📈 100%      │      │
│  │ Products       │ │ Orders         │ │ Success        │      │
│  │ Synced         │ │ Imported       │ │ Rate           │      │
│  └────────────────┘ └────────────────┘ └────────────────┘      │
│                                                                  │
│  ── SYNC SETTINGS ──                                            │
│  Sync Frequency:  [Every 5 minutes ▼]                           │
│  Sync Direction:  [YouCan → CRM (one-way) ▼]                   │
│  Sync Type:       [Both (Products & Orders) ▼]                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │ ⏱️ Last Sync                                        │       │
│  │ 2/12/2026, 9:15:21 PM                               │       │
│  │ Frequency: Every 5 min                               │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│                     [Close]       [💾 Save Changes]              │
└─────────────────────────────────────────────────────────────────┘
```

## Multi-Store Support

> You can connect **one store or multiple stores** simultaneously.

| Scenario | How It Works |
|---|---|
| **Single store** | Connect one YouCan store → all orders/products flow into CRM |
| **Multiple stores** | Click "+ Add New Integration" → repeat OAuth + store selection for each store |
| **Store identification** | Each order/product has a `store_id` field → filter by store anywhere in the CRM |
| **Dashboard** | Global filter pill: `🏪 [All Stores ▼]` to filter by store |
| **Analytics** | Can compare performance across stores |

### Multi-Store Schema Addition

```sql
-- Migration 034: Add stores table
CREATE TABLE stores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,       -- e.g. "anaqatokiiii"
  platform      VARCHAR(50) DEFAULT 'youcan', -- future: shopify, etc.
  api_token     TEXT,                         -- encrypted OAuth token
  is_active     BOOLEAN DEFAULT true,
  sync_interval INTEGER DEFAULT 5,            -- minutes
  sync_type     VARCHAR(20) DEFAULT 'both',   -- 'products', 'orders', 'both'
  field_mapping JSONB,                        -- checkout field mappings
  last_sync_at  TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Add store_id to orders and products
ALTER TABLE orders ADD COLUMN store_id UUID REFERENCES stores(id);
ALTER TABLE products ADD COLUMN store_id UUID REFERENCES stores(id);
```

## Sync Strategy: Webhooks + Polling Fallback

> **Primary**: Webhooks (instant). **Fallback**: Polling (catches missed events).

```
┌──────────────────────────────────────────────────────────────┐
│                     SYNC ARCHITECTURE                        │
│                                                              │
│  ┌─────────────┐     Webhook (instant)    ┌──────────────┐  │
│  │             │ ──────────────────────▶  │              │  │
│  │   YouCan    │                          │     CRM      │  │
│  │   Store     │ ◀────── Poll (fallback)  │   Database   │  │
│  │             │     every 5 min          │              │  │
│  └─────────────┘                          └──────────────┘  │
│                                                              │
│  HOW IT WORKS:                                               │
│  1. Webhooks fire instantly for new orders/product changes  │
│  2. Every X minutes, CRM polls YouCan API as safety net     │
│  3. Polling compares last_sync_at timestamp → fetches only  │
│     orders/products modified after that timestamp           │
│  4. Deduplication by youcan_id prevents double imports      │
│  5. Sync log records each event (webhook vs poll source)    │
└──────────────────────────────────────────────────────────────┘
```

### Sync Frequency Options (for polling fallback)

| Option | Use Case |
|---|---|
| Every 5 minutes *(default)* | Most stores — good balance |
| Every 10 minutes | Lower API usage |
| Every 15 minutes | Very low volume stores |
| Every 30 minutes | Minimal check |
| Manual only | Disable polling — webhooks only |

---

# 32. GLOBAL SEARCH BAR

> **Inspired by reference**: Universal search across the top of every page.

## Search Bar

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ☰  🔍 [Search orders, customers, products...]    🏪 anaqa (MAD) ●  🔔 👤│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Search Behavior

| What You Type | Results Shown |
|---|---|
| `ORD-0042` | Matching order → click to open |
| `0612345678` | Customer with that phone → click to open profile |
| `Ahmed` | Customers named Ahmed + orders with Ahmed |
| `T-Shirt` | Products matching "T-Shirt" |
| `Casablanca` | Orders/customers from Casablanca |

### Implementation
- **Debounced** (300ms delay before searching)
- Searches across: `orders.reference`, `customers.full_name`, `customers.phone`, `products.name`, `customers.city`
- Results shown in a **dropdown** grouped by type:
  ```
  🛒 Orders
    ORD-0042 — Ahmed M. — 290 MAD
    ORD-0039 — Ahmed K. — 190 MAD
  
  👤 Customers
    Ahmed Mansouri — 0612345678 — Casablanca
  
  📦 Products
    (no results)
  ```
- **Keyboard navigation**: Arrow keys to navigate, Enter to select
- Max 5 results per category

---

# 33. COLOR-CODED STATUS PILL SYSTEM

> **Consistent visual language across all pages.**

## Confirmation Status Pills

| Status | Color | Pill |
|---|---|---|
| Pending | 🟡 Yellow/Amber | `[Pending]` yellow bg |
| Confirmed | 🟢 Green | `[Confirmed]` green bg |
| Cancelled | 🔴 Red | `[Cancelled]` red bg |
| Reported | 🔵 Blue | `[Reported]` blue bg |
| Unreachable | 🟠 Orange | `[Unreachable]` orange bg |
| Fake | ⚫ Dark grey | `[Fake]` dark bg |
| Out of Stock | 🟣 Purple | `[Out of Stock]` purple bg |
| Merged | ⚪ Light grey | `[Merged]` grey bg |

## Shipping Status Pills

| Status | Color | Pill |
|---|---|---|
| Not Shipped | ⚪ Grey | `[Not Shipped]` grey bg |
| Shipped | 🔵 Blue | `[Shipped]` blue bg |
| In Transit | 🟡 Yellow | `[In Transit]` yellow bg |
| Delivered | 🟢 Green | `[Delivered]` green bg |
| Returned | 🔴 Red | `[Returned]` red bg |
| Partially Delivered | 🟠 Orange | `[Partial]` orange bg |

## CSS Implementation

```css
/* Status pills — consistent across all pages */
.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
}

.status-pill--pending     { background: #FEF3C7; color: #92400E; }
.status-pill--confirmed   { background: #D1FAE5; color: #065F46; }
.status-pill--cancelled   { background: #FEE2E2; color: #991B1B; }
.status-pill--reported    { background: #DBEAFE; color: #1E40AF; }
.status-pill--unreachable { background: #FFEDD5; color: #9A3412; }
.status-pill--fake        { background: #E5E7EB; color: #374151; }
.status-pill--out-of-stock{ background: #EDE9FE; color: #5B21B6; }
.status-pill--merged      { background: #F3F4F6; color: #6B7280; }

/* Shipping pills use the same pattern */
.status-pill--not-shipped { background: #F3F4F6; color: #6B7280; }
.status-pill--shipped     { background: #DBEAFE; color: #1E40AF; }
.status-pill--in-transit  { background: #FEF3C7; color: #92400E; }
.status-pill--delivered   { background: #D1FAE5; color: #065F46; }
.status-pill--returned    { background: #FEE2E2; color: #991B1B; }
```

---

# 34. COMPLETE DOCUMENT MAP (Final)

Your CRM is now defined across **4 documents**:

| # | Document | What it covers |
|---|---|---|
| 1 | `CRM_System_ORGANIZED.md` | Core business logic, modules, DB schema, API integrations, roadmap |
| 2 | `CRM_System_FINAL_ADDENDUM.md` | Tech decisions, schema fixes, API routes, permissions, missing tables |
| 3 | `CRM_BUILD_PLAN.md` | Missing logic (transitions, algorithms, events), project structure, env vars, build schedule |
| 4 | `CRM_FINAL_SPECS.md` *(this file)* | Branding, UI/UX, all page layouts, filters, integration setup, status pills, analytics |

### Total Sections: 34
### Total Database Tables: 45+
### Total API Endpoints: 70+
### Total Migrations: 33
### Total Pages/Views: 18+

### Status: ✅ 100% READY TO BUILD

---

# END OF FINAL SPECIFICATIONS

