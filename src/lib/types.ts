// Core types for the 7 Spices Restaurant ERP System

export type Role = "super_admin" | "admin" | "manager" | "staff" | "waiter";

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  phone?: string;
  active: boolean;
  createdAt: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  order: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  description?: string;
  veg: boolean;
  available: boolean;
  isBengali?: boolean;
}

export interface RestaurantTable {
  id: string;
  number: number;
  capacity: number;
  status: "available" | "occupied" | "reserved" | "split" | "merged";
  currentOrderId?: string;
  qrCode?: string;
  // ── Display order ───────────────────────────────────────────
  // Numeric sort key. The Tables page, POS / Waiter dropdowns and
  // QR ordering all sort by this ASC. Split sections use decimal
  // values (e.g. 1.1, 1.2) so they always appear under their parent
  // table in numeric order. Defaults to the integer `number` when
  // the field is missing (legacy records).
  sortOrder?: number;
  // ── Split / Merge ────────────────────────────────────────────
  // id of the parent table when this is a split section.
  // E.g. Table 1A → parentId = Table 1's id.
  parentTableId?: string;
  // letter suffix shown after the parent number, e.g. "A", "B"
  // (only meaningful for split sections).
  sectionLabel?: string;
  // capacity for THIS split section (split between siblings so they
  // sum to the parent table's capacity).
  sectionCapacity?: number;
  // merged table composition. When this table is the "primary" of a
  // merge, `mergedWith` lists the other tables that share the same
  // physical space. Only the primary shows the merged bill / order.
  mergedWith?: string[];
  // when status === "merged" or "split", the human-readable summary
  // displayed on the parent card. E.g. "Split into 1A and 1B" or
  // "Merged with Table 3".
  compositionNote?: string;
  // ── Split metadata (forward-compat with the latest spec) ─────
  // These fields are explicitly written when a split is created, and
  // are rebuilt automatically on app startup and after every table
  // update by the Store.repairSplitMetadata() helper.
  isSplit?: boolean;            // true on the parent, false elsewhere
  childTables?: string[];        // parent only — ids of its sections
  splitSections?: number;        // parent only — count of sections
  isSplitSection?: boolean;     // true on every child section
}

// One logical section of a split table — e.g. "1A", "1B". Stored
// internally as regular RestaurantTable records with parentTableId
// pointing back to the original. They have their own QR code, their own
// order, their own bill, and their own customer details.
export interface TableSectionRef {
  tableId: string;
  label: string;          // "A", "B", ...
  capacity: number;       // seats for this section
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  source: "waiter" | "qr" | "pos";
  printed?: boolean;
  // ISO timestamp of when the item was added to the order. Used by the
  // Orders page to group items as "original" vs "newly added" when a
  // waiter clicks "Add Order" on an already-occupied table.
  addedAt?: number;
}

// One entry in an order's activity log — used by the Orders page timeline
// (created / items added / KOT printed / payment received / etc.).
export interface OrderEvent {
  id: string;
  ts: number;
  kind: "created" | "items_added" | "kot_printed" | "payment" | "status" | "cancelled";
  message: string;
  addedItemIds?: string[];   // when kind === "items_added"
  addedItemCount?: number;
  paymentAmount?: number;     // when kind === "payment"
  paymentMode?: "cash" | "upi" | "part_payment";
}

export interface Order {
  id: string;
  billNumber: string;
  tableId?: string;
  tableNumber?: number;
  customerName?: string;
  customerMobile?: string;
  waiterId?: string;
  waiterName?: string;
  source: "waiter" | "qr" | "pos";
  orderType: "dine_in" | "takeaway" | "delivery";
  items: OrderItem[];
  subtotal: number;
  discount: number;
  discountType: "flat" | "percent";
  gstPercent: number;
  cgst: number;
  sgst: number;
  grandTotal: number;
  // ── Payment summary (optional, populated when any payment is recorded) ──
  amountPaid?: number;       // total received across all payment records
  balanceDue?: number;       // grandTotal - amountPaid
  lastPaymentMode?: "cash" | "upi" | "part_payment";
  notes?: string;
  // ── Add-Order workflow ──────────────────────────────────────────
  // Append new items to the same bill instead of creating a second
  // order document. `eventLog` lists every change to the order so the
  // Orders page can render a timeline.
  eventLog?: OrderEvent[];
  status:
    | "draft" // saved by waiter, not yet sent
    | "saved" // legacy alias for draft
    | "pending_print" // sent without printing KOT
    | "open" // generic open
    | "sent_to_kitchen" // printed KOT, in queue
    | "confirmed"
    | "preparing"
    | "ready"
    | "served"
    | "completed"
    | "billed"
    | "paid"
    | "cancelled";
  kotPrinted: boolean;
  billPrinted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minStock: number;
  purchasePrice: number;
  supplierId?: string;
  supplierName?: string;
  expiryDate?: number;
  notes?: string;
  updatedAt: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address?: string;
  gstin?: string;
}

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: number;
  notes?: string;
}

export interface Payment {
  id: string;
  orderId: string;
  billNumber: string;
  // Total amount captured in this payment record.
  amount: number;
  // Payment mode breakdown. `cash` and `upi` are the only modes currently
  // supported. Both may be present in a single "part payment" record.
  // All numeric fields default to 0 so older / legacy records still
  // satisfy the type when read back.
  paymentMode?: "cash" | "upi" | "part_payment";
  cashAmount?: number;
  upiAmount?: number;
  totalPaid?: number;
  balanceDue?: number;
  // Legacy single-mode support — kept so older records keep loading.
  method?: "cash";
  receivedBy: string;
  createdAt: number;
  // Optional free-form reference (UPI txn id, customer note, etc.)
  reference?: string;
}

export interface RestaurantSettings {
  name: string;
  address: string;
  phone: string;
  gstin?: string;
  gstEnabled: boolean;
  defaultGstPercent: number;
  printerSize: "58mm" | "80mm";
  waiterMode: boolean;
  currency: string;
  logoDataUrl?: string;
  thankYouMessage: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: number;
}

export interface Notification {
  id: string;
  type:
    | "new_order"
    | "saved_order"
    | "pending_print"
    | "sent_to_kitchen"
    | "low_stock"
    | "info";
  message: string;
  orderId?: string;
  read: boolean;
  timestamp: number;
}
