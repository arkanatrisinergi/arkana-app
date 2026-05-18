# Arkana App — Changelog

---

## v1.4.0 — PRD-01.1 Price History
**Files:** `config.js`, `supplier-tracker.html`

- feat: `latestPricePerSupplier(productId)` — deduplicates PriceEntries to one active price per supplier (newest updatedAt wins); used as canonical price source across all views
- feat: `priceHistoryForSupplier(productId, supplierId)` — returns full price history for a supplier+product pair, sorted newest-first
- feat: `getTrend(history)` — computes trend direction (up/down/stable) from two most recent entries
- feat: `renderTrendBadge(trend)` — renders ↑↓→ colored badge; reusable by future modules
- feat: `renderHistoryTimeline(...)` — renders collapsible history panel per supplier row (only shown if 2+ entries exist)
- feat: `toggleHistory(panelId, toggleId)` — expand/collapse handler with live label update
- feat: Trend badge shown on best price in Produk and Jasa card list
- feat: Trend badge shown per supplier row in Produk detail, Jasa detail, and Komparasi tab
- feat: History expand/collapse toggle ("▼ N riwayat") per supplier row in Produk and Jasa detail screens
- feat: History timeline shows all past prices newest-first with date, updatedBy, and delete button (latest entry protected from deletion)
- fix: Produk and Jasa detail screens now show one card per supplier (active price only) instead of raw all-entry list
- fix: Komparasi tab now uses deduplicated active prices — best price and ranking are accurate
- fix: Supplier detail screen now shows one row per product (latest price only, no duplicate history rows)
- fix: `confirmDeletePrice` now accepts productId and refreshes the correct detail screen (Produk or Jasa) — previously always refreshed Produk screen

---

## v1.2.0 — PRD-01.2 Produk vs Jasa Entry Typing
**Files:** `config.js`, `supplier-tracker.html`, `apps-script.js`

- feat: Jasa tab added as 4th tab (Supplier · Produk · Jasa · Compare)
- feat: Jasa entries grouped by service name A-Z with rate comparison per service
- feat: Add Jasa entry form — namaJasa, rate, unit rate, catatan
- feat: Supplier detail shows grouped 📦 Produk and 🔧 Jasa sections
- feat: Add Jasa entry from supplier detail or Jasa tab FAB
- feat: Best rate highlighted per service group (purple)
- feat: Apps Script addPrice stores type and namaJasa fields
- feat: PriceEntries headers updated with type and namaJasa columns
- fix: All tab labels now in Bahasa (Supplier · Produk · Jasa · Compare)
- fix: Compare tab now Produk entries only

---

## v1.1.7 — Jasa Level Quick Fix
**Files:** `config.js`, `supplier-tracker.html`

- feat: "Jasa" added as level option in supplier form and filter chips
- feat: Jasa badge (purple) shown instead of L1–L4 for service providers
- fix: Authorized badge hidden for Jasa level suppliers
- fix: Supplier detail shows "🔧 Jasa / Service Provider" for Jasa level

---

## v1.1.6 — Add Supplier Phone Fix & Detail Refresh
**Files:** `config.js`, `supplier-tracker.html`, `apps-script.js`

- fix: New supplier phone leading zero stripped — set entire column C to text format BEFORE appendRow (idempotent, covers all future rows)
- fix: Supplier detail screen not refreshing after edit — now calls openSupplierDetail() after successful save

---

## v1.1.5 — Edit Supplier Fix & Filter Improvement
**Files:** `config.js`, `supplier-tracker.html`, `apps-script.js`

- fix: Edit supplier not saving — setNumberFormat was applied before setValues, preventing write; now applied after
- fix: addSupplier same issue — appendRow first, then fix kontak cell format
- fix: saveSupplier now preserves original createdBy & createdAt on edit (was overwriting with current user/time)
- fix: updateSupplier error message now includes supplier id for easier debugging
- fix: City chip count now based on active level + unit bisnis filters (not total all suppliers)

---

## v1.1.4 — Feature Update & Bug Fix Batch 3
**Files:** `config.js`, `index.html`, `supplier-tracker.html`, `apps-script.js`

- fix: Phone number leading zero now preserved — Apps Script uses setNumberFormat('@') + setValues on correct row
- fix: Phone displayed as string in supplier list and detail view
- feat: Supplier list sorted A-Z by name
- feat: Filter supplier by unit bisnis (dynamic from DB)
- feat: Filter supplier by city with count per city
- feat: Stats bar — total supplier, filtered count, total cities
- feat: Dynamic versioning — APP_VERSION defined once in config.js, referenced everywhere
- fix: Version v1.0.0 on home strip updated (now synced from config.js)

---

## v1.1.3 — Bug Fix Batch 2
**Files:** `index.html`, `supplier-tracker.html`, `apps-script.js`

- fix: PIN validation now done server-side via Google Sheet (not localStorage)
- fix: Old PIN accepted after change on another device — now impossible since Sheet is source of truth
- fix: Phone number leading zero stripped — force text format on Suppliers sheet column C
- fix: PIN leading zero stripped (e.g. 0000 saved as 0) — padStart + cell text format fix
- fix: Version string v1.0.0 still showing on home screen — updated to v1.1.3
- fix: Login activity logged every time returning to home — now only logged on actual PIN entry
- fix: Accidental text selection on tap — user-select none applied globally
- feat: Phone number input now uses numpad keyboard (type=tel)
- feat: validatePin action added to Apps Script for server-side PIN checking

---

## v1.1.2 — Config & Architecture Fix
**Files:** `config.js`, `index.html`, `supplier-tracker.html`

- feat: config.js created as single source of truth for Apps Script URL
- fix: Script URL hardcoded per file removed — all files now reference config.js
- fix: Apps Script URL localStorage approach removed (required setup on every device)

---

## v1.1.1 — Bug Fix Batch 1
**Files:** `index.html`, `apps-script.js`

- fix: URLSearchParams not defined error in Apps Script (browser API used in server context)
- fix: API action parameter now read via e.parameter.action (correct Apps Script method)
- fix: Default PIN stored as SHA1 hash — changed to plain text 1234
- fix: Duplicate activity log entries — removed internal addLog calls from supplier/product operations
- fix: PIN sync blocking — login screen now waits for Sheet PIN before rendering
- fix: Activity log userId mapping incorrect — fixed name-to-id lookup from Sheet logs
- feat: getLogs action added to Apps Script
- feat: getAll now returns settings including PINs in response

---

## v1.1.0 — PRD-01 Supplier & Price Tracker
**Files:** `supplier-tracker.html`, `apps-script.js`, `index.html`

- feat: Supplier & Price Tracker module launched
- feat: CRUD suppliers — add, view detail, edit, delete
- feat: CRUD products with specs/notes field
- feat: Price entries per supplier per product with MOQ
- feat: Compare tab — all suppliers for one product, best price highlighted
- feat: L1–L4 level badges color-coded
- feat: Authorized/SPD flag on suppliers
- feat: Unit bisnis dynamic from Google Sheet Settings tab
- feat: Search and filter by level on suppliers tab
- feat: Activity log synced to Google Sheet ActivityLog tab
- feat: PIN sync via Google Sheet Settings tab
- feat: Google Apps Script backend with 5 sheet tabs
- feat: Offline read from localStorage cache
- fix: Supplier card on home page now links to supplier-tracker.html

---

## v1.0.0 — PRD-00 Login & Home Page
**Files:** `index.html`, `manifest.json`

- feat: Login screen with user selection (Arie / Ajin)
- feat: PIN-based authentication (4 digit)
- feat: Session persistence via localStorage
- feat: Home screen with feature hub (Coming Soon cards)
- feat: Aktivitas tab — activity log
- feat: Setting tab — change PIN, change avatar
- feat: Avatar upload from gallery (per device)
- feat: PWA manifest — installable on mobile
- feat: Dark navy theme, Plus Jakarta Sans typography
- feat: Bottom navigation (Home, Aktivitas, Setting)
