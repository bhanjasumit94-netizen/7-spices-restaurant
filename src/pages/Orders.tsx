import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  Printer,
  Check,
  X,
  RefreshCcw,
  Eye,
  EyeOff,
  History,
  IndianRupee,
  CreditCard,
  Wallet,
  Edit2,
  Plus,
  Minus,
  Trash2,
} from "lucide-react";
import { Button, Input, Modal, Badge, Empty, Select, StatCard } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore } from "../lib/store";
import { Order, RestaurantTable } from "../lib/types";
import { inr } from "../lib/money";
import { printBill } from "../lib/printer";
import { useAuth } from "../lib/auth";
import { cn } from "../utils/cn";

type SortKey = "newest" | "oldest" | "table_asc" | "table_desc" | "status";
type TabKey = "active" | "paid" | "completed" | "cancelled";

// --- Status metadata (badge colors per spec) -------------------------------
const STATUS_BADGE: Record<
  string,
  { tone: "neutral" | "success" | "warning" | "danger" | "info" | "gold"; label: string; icon: string; bg: string; text: string }
> = {
  draft: {
    tone: "warning",
    label: "Saved",
    icon: "📝",
    bg: "bg-amber-100 dark:bg-amber-500/20",
    text: "text-amber-700 dark:text-amber-300",
  },
  saved: {
    tone: "warning",
    label: "Saved",
    icon: "📝",
    bg: "bg-amber-100 dark:bg-amber-500/20",
    text: "text-amber-700 dark:text-amber-300",
  },
  pending_print: {
    tone: "warning",
    label: "Pending Print",
    icon: "🟡",
    bg: "bg-amber-100 dark:bg-amber-500/20",
    text: "text-amber-700 dark:text-amber-300",
  },
  open: {
    tone: "info",
    label: "Open",
    icon: "📋",
    bg: "bg-sky-100 dark:bg-sky-500/20",
    text: "text-sky-700 dark:text-sky-300",
  },
  confirmed: {
    tone: "info",
    label: "Confirmed",
    icon: "🟦",
    bg: "bg-sky-100 dark:bg-sky-500/20",
    text: "text-sky-700 dark:text-sky-300",
  },
  preparing: {
    tone: "warning",
    label: "Preparing",
    icon: "🟠",
    bg: "bg-orange-100 dark:bg-orange-500/20",
    text: "text-orange-700 dark:text-orange-300",
  },
  ready: {
    tone: "success",
    label: "Ready",
    icon: "🟢",
    bg: "bg-emerald-100 dark:bg-emerald-500/20",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  served: {
    tone: "success",
    label: "Served",
    icon: "🟢",
    bg: "bg-emerald-100 dark:bg-emerald-500/20",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  completed: {
    tone: "neutral",
    label: "Completed",
    icon: "⚫",
    bg: "bg-neutral-200 dark:bg-neutral-700",
    text: "text-neutral-700 dark:text-neutral-200",
  },
  billed: {
    tone: "info",
    label: "Billed",
    icon: "🧾",
    bg: "bg-sky-100 dark:bg-sky-500/20",
    text: "text-sky-700 dark:text-sky-300",
  },
  paid: {
    tone: "success",
    label: "Paid",
    icon: "💵",
    bg: "bg-emerald-100 dark:bg-emerald-500/20",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  cancelled: {
    tone: "danger",
    label: "Cancelled",
    icon: "🔴",
    bg: "bg-rose-100 dark:bg-rose-500/20",
    text: "text-rose-700 dark:text-rose-300",
  },
  sent_to_kitchen: {
    tone: "info",
    label: "Sent to Kitchen",
    icon: "🟦",
    bg: "bg-sky-100 dark:bg-sky-500/20",
    text: "text-sky-700 dark:text-sky-300",
  },
};

// Render a human-friendly table number that respects split sections and
// merged groups. "T1A" instead of "T101", "T2+3" for a merge.
function displayTableNumber(o: Order, tablesList: RestaurantTable[]): string {
  if (!o.tableId) return o.tableNumber != null ? `T${o.tableNumber}` : "—";
  const t = tablesList.find((x) => x.id === o.tableId);
  if (!t) return o.tableNumber != null ? `T${o.tableNumber}` : "—";
  if (t.parentTableId && t.sectionLabel) {
    const parent = tablesList.find((p) => p.id === t.parentTableId);
    if (parent) return `T${parent.number}${t.sectionLabel}`;
    return `T${t.sectionLabel}`;
  }
  if (t.mergedWith && t.mergedWith.length > 0) {
    const others = t.mergedWith
      .map((id) => tablesList.find((p) => p.id === id)?.number)
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
    return [t.number, ...others].sort((a, b) => a - b).join("+");
  }
  return `T${t.number}`;
}

// Status sets used for the tab logic
// "Active" = every order that hasn't been archived (paid / completed / cancelled).
// Includes `open` and `billed` so newly saved POS / QR / Waiter orders
// appear immediately in the Active Orders tab until the workflow finishes.
const ACTIVE_STATUSES = [
  "open",
  "draft",
  "saved",
  "pending_print",
  "sent_to_kitchen",
  "confirmed",
  "preparing",
  "ready",
  "served",
  "billed",
];
const PAID_STATUSES = ["paid"];
const COMPLETED_STATUSES = ["completed"];
const CANCELLED_STATUSES = ["cancelled"];
const ARCHIVED_STATUSES = ["paid", "completed", "cancelled"];

// --- Table badge colors (matches spec for visual identification) -----------
function tableBadgeTone(status: Order["status"]): { bg: string; ring: string } {
  switch (status) {
    case "ready":
    case "served":
      return { bg: "bg-emerald-500", ring: "ring-emerald-300 dark:ring-emerald-700" };
    case "completed":
      return { bg: "bg-neutral-700", ring: "ring-neutral-400 dark:ring-neutral-600" };
    case "cancelled":
      return { bg: "bg-rose-500", ring: "ring-rose-300 dark:ring-rose-700" };
    case "paid":
      return { bg: "bg-emerald-600", ring: "ring-emerald-300 dark:ring-emerald-700" };
    case "preparing":
      return { bg: "bg-orange-500", ring: "ring-orange-300 dark:ring-orange-700" };
    case "confirmed":
      return { bg: "bg-sky-500", ring: "ring-sky-300 dark:ring-sky-700" };
    case "pending_print":
    case "draft":
    case "saved":
      return { bg: "bg-amber-500", ring: "ring-amber-300 dark:ring-amber-700" };
    default:
      return { bg: "bg-gold-gradient", ring: "ring-gold-300 dark:ring-gold-700" };
  }
}

export default function Orders() {
  const orders = useStore("orders", Store.listOrders);
  const tables = useStore("tables", Store.listTables);
  const settings = useStore("settings", Store.getSettings);
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [tab, setTab] = useState<TabKey>("active");
  const [showArchived, setShowArchived] = useState(false);

  // ── Payment section state ─────────────────────────────────────────────
  // Payment modes supported by the manual (no-gateway) payment form.
  type PaymentMode = "cash" | "upi" | "part_payment";
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [cashAmount, setCashAmount] = useState<string>("");
  const [upiAmount, setUpiAmount] = useState<string>("");
  const [paymentRef, setPaymentRef] = useState<string>("");

  // ── Edit Order state ───────────────────────────────────────────────────
  const [editingOrder, setEditingOrder] = useState(false);
  const [editDiscountType, setEditDiscountType] = useState<"flat" | "percent">("flat");
  const [editDiscountVal, setEditDiscountVal] = useState<string>("0");

  // ── Add Item picker (inside Edit Order) ────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCat, setPickerCat] = useState<string>("all");
  const [pickerSearch, setPickerSearch] = useState("");

  // Live menu data so the picker can search across categories.
  const allCategories = useStore("cats", Store.listCategories);
  const allItems = useStore("items", Store.listItems);

  // Open a focused order via ?focus=ID from the notification center.
  useEffect(() => {
    const focusId = params.get("focus");
    if (focusId) {
      const o = orders.find((x) => x.id === focusId);
      if (o) {
        setDetailOrder(o);
        resetPaymentForm(o);
        const newParams = new URLSearchParams(params);
        newParams.delete("focus");
        setParams(newParams, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, orders, setParams]);

  // Whenever a different order opens in the modal, reset the payment form
  // and the edit-order state so the fields never bleed between orders.
  useEffect(() => {
    if (detailOrder) {
      resetPaymentForm(detailOrder);
      setEditingOrder(false);
      setEditDiscountType(detailOrder.discountType || "flat");
      const dv = detailOrder.discountType === "percent"
        ? detailOrder.subtotal > 0
          ? Math.round((detailOrder.discount / detailOrder.subtotal) * 100)
          : 0
        : detailOrder.discount;
      setEditDiscountVal(String(dv));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOrder?.id]);

  // PAYMENT-CALC FIX: whenever the grand total changes while the payment
  // section is visible (e.g. after applying a discount in the Edit Order
  // popup), recompute Cash / UPI / Part Payment defaults from the NEW
  // grand total — always. The default amount is the remaining balance
  // (grandTotal - amountPaid). This ensures the displayed "Cash Amount"
  // reflects the post-discount total, not the pre-discount subtotal.
  useEffect(() => {
    if (!detailOrder) return;
    const remaining = Math.max(
      0,
      detailOrder.grandTotal - (detailOrder.amountPaid ?? 0)
    );
    const remainingStr = remaining > 0 ? remaining.toFixed(2) : "";

    // Always keep the Cash field in sync with the latest remaining balance
    // when the user hasn't manually entered a value, OR when the entered
    // value matches the previous auto-filled default. If the user has
    // typed a custom value we leave it alone so they can override.
    if (cashAmount === "" || Number(cashAmount) === 0) {
      setCashAmount(remainingStr);
    }
    // For UPI / part-payment: refresh only if the field is empty.
    if (upiAmount === "" || Number(upiAmount) === 0) {
      if (paymentMode === "upi") setUpiAmount(remainingStr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOrder?.grandTotal, detailOrder?.amountPaid]);

  // Counters for the dashboard
  const counters = useMemo(() => {
    const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
    const paid = orders.filter((o) => o.status === "paid").length;
    const completed = orders.filter((o) => o.status === "completed").length;
    const cancelled = orders.filter((o) => o.status === "cancelled").length;
    return { active, paid, completed, cancelled, total: orders.length };
  }, [orders]);

  // Apply tab logic to determine which orders to display.
  const tabOrders = useMemo(() => {
    let list: Order[];
    switch (tab) {
      case "active":
        list = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
        break;
      case "paid":
        list = orders.filter((o) => PAID_STATUSES.includes(o.status));
        break;
      case "completed":
        list = orders.filter((o) => COMPLETED_STATUSES.includes(o.status));
        break;
      case "cancelled":
        list = orders.filter((o) => CANCELLED_STATUSES.includes(o.status));
        break;
    }
    // When "Show Archived" is ON inside Active tab, also include archived ones.
    if (tab === "active" && showArchived) {
      list = orders;
    }
    return list;
  }, [orders, tab, showArchived]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = tabOrders.filter((o) => {
      if (sourceFilter !== "all" && o.source !== sourceFilter) return false;
      if (
        q &&
        !o.billNumber.toLowerCase().includes(q) &&
        !(o.customerName?.toLowerCase().includes(q) ?? false) &&
        !(o.customerMobile?.includes(q) ?? false) &&
        !(o.waiterName?.toLowerCase().includes(q) ?? false)
      )
        return false;
      return true;
    });
    return list.sort((a, b) => {
      switch (sortKey) {
        case "newest":
          return b.createdAt - a.createdAt;
        case "oldest":
          return a.createdAt - b.createdAt;
        case "table_asc":
          return (a.tableNumber ?? 9999) - (b.tableNumber ?? 9999);
        case "table_desc":
          return (b.tableNumber ?? -1) - (a.tableNumber ?? -1);
        case "status":
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });
  }, [tabOrders, search, sourceFilter, sortKey]);

  // --- Status transitions ---------------------------------------------------
  // Centralised workflow so that every entry point (Waiter/QR/POS) behaves the same.
  const setStatus = (o: Order, status: Order["status"], auditDetails?: string) => {
    Store.updateOrder(o.id, { status });
    if (["paid", "cancelled", "completed"].includes(status) && o.tableId) {
      Store.updateTable(o.tableId, { status: "available", currentOrderId: undefined });
    }
    if (user)
      Store.addAudit({
        userId: user.id,
        userName: user.name,
        action: "STATUS_CHANGE",
        details: auditDetails || `${o.billNumber} → ${status}`,
      });
    Store.removeNotificationsForOrder(o.id);
    if (detailOrder?.id === o.id) setDetailOrder({ ...o, status });
  };

  // Print Pending KOT — auto-confirms so the workflow continues.
  // Also books the table if it isn't already booked (safety net for legacy/edge cases).
  const printPendingKOT = (o: Order) => {
    printBill(o, settings, "kot");
    Store.updateOrder(o.id, { kotPrinted: true, status: "confirmed" });
    // Book the table when we promote an order to Confirmed (catches any order that
    // was saved without occupying the table — legacy data, race conditions, etc.).
    if (o.tableId) {
      const t = Store.listTables().find((x) => x.id === o.tableId);
      if (!t || t.status !== "occupied") {
        Store.updateTable(o.tableId, { status: "occupied", currentOrderId: o.id });
        toast.push(`Table ${t?.number ?? ""} booked`, "success");
      }
    }
    Store.removeNotificationsForOrder(o.id);
    toast.push(`KOT printed for ${o.billNumber} → Confirmed`, "success");
    if (detailOrder?.id === o.id) setDetailOrder({ ...o, kotPrinted: true, status: "confirmed" });
    if (user)
      Store.addAudit({
        userId: user.id,
        userName: user.name,
        action: "PRINT_PENDING_KOT",
        details: `${o.billNumber} • Pending Print → Confirmed`,
      });
  };

  const startPreparing = (o: Order) => {
    setStatus(o, "preparing", `${o.billNumber} • Confirmed → Preparing`);
    toast.push(`Order ${o.billNumber} is being prepared`, "info");
  };

  const markReady = (o: Order) => {
    setStatus(o, "ready", `${o.billNumber} • Preparing → Ready`);
    toast.push(`Order ${o.billNumber} is ready to serve`, "success");
  };

  const markServed = (o: Order) => {
    setStatus(o, "served", `${o.billNumber} • Ready → Served`);
    toast.push(`Order ${o.billNumber} served`, "success");
  };

  const completeOrder = (o: Order) => {
    setStatus(o, "completed", `${o.billNumber} • Served → Completed`);
    toast.push(`Order ${o.billNumber} completed`, "success");
    // Close modal if it's open
    if (detailOrder?.id === o.id) {
      setDetailOrder(null);
      // Switch to the Completed tab so user sees the result
      setTab("completed");
    }
  };

  const markPaid = (o: Order) => {
    if (!user) return;
    Store.addPayment({
      id: Store.uid("pay"),
      orderId: o.id,
      billNumber: o.billNumber,
      amount: o.grandTotal,
      paymentMode: "cash",
      cashAmount: o.grandTotal,
      upiAmount: 0,
      totalPaid: o.grandTotal,
      balanceDue: 0,
      method: "cash",
      receivedBy: user.name,
      createdAt: Date.now(),
    });
    Store.updateOrder(o.id, { status: "paid" });
    if (o.tableId) Store.updateTable(o.tableId, { status: "available", currentOrderId: undefined });
    Store.removeNotificationsForOrder(o.id);
    Store.addAudit({
      userId: user.id,
      userName: user.name,
      action: "PAYMENT",
      details: `${o.billNumber} • ${inr(o.grandTotal)} • Cash`,
    });
    toast.push(`Payment received: ${inr(o.grandTotal)}`, "success");
    if (detailOrder?.id === o.id) setDetailOrder({ ...o, status: "paid" });
    // Auto switch to Paid tab so user can see it moved out of active
    setTab("paid");
  };

  const cancelOrder = (o: Order) => {
    if (!confirm(`Cancel order ${o.billNumber}? This cannot be undone.`)) return;
    setStatus(o, "cancelled", `${o.billNumber} • Cancelled`);
    toast.push(`Order ${o.billNumber} cancelled`, "info");
    if (detailOrder?.id === o.id) {
      setDetailOrder(null);
      setTab("cancelled");
    }
  };

  // ── PAYMENT HELPERS ──────────────────────────────────────────────────────
  // All payment modes are manual entry only. There is no gateway
  // integration (no Razorpay / PhonePe / Paytm / Google Pay).
  const parseMoney = (v: string): number => {
    const n = parseFloat(v);
    return isNaN(n) || n < 0 ? 0 : n;
  };

  // Compute totals for the currently-edited order in real time.
  // BUG 3 FIX: uses the same hardened discount rules as Billing.tsx so
  // the math is identical across the app:
  //   Percent: grandTotal = subtotal - (subtotal × discountPercent / 100)
  //   Flat:    grandTotal = subtotal - discountAmount
  // Never produces negative totals, discount > subtotal, or NaN.
  // Accepts the discount value/type as parameters so callers can pass the
  // exact values they intend to persist — avoids any stale-closure risk.
  const recomputeEditedTotals = (
    o: Order,
    dvOverride?: string,
    dtOverride?: "flat" | "percent"
  ) => {
    const subtotal = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const rawStr = dvOverride !== undefined ? dvOverride : editDiscountVal;
    const dt = dtOverride !== undefined ? dtOverride : editDiscountType;
    const raw = parseFloat(rawStr);
    const dv = isNaN(raw) ? 0 : raw;
    let discount: number;
    if (dt === "percent") {
      // Clamp percent to [0, 100] before applying.
      const pct = Math.max(0, Math.min(100, dv));
      discount = (subtotal * pct) / 100;
    } else {
      // Clamp flat discount to [0, subtotal].
      discount = Math.max(0, Math.min(subtotal, dv));
    }
    const afterDiscount = Math.max(0, subtotal - discount);
    const cgst = o.gstPercent > 0 ? (afterDiscount * (o.gstPercent / 2)) / 100 : 0;
    const sgst = o.gstPercent > 0 ? (afterDiscount * (o.gstPercent / 2)) / 100 : 0;
    const grandTotal = afterDiscount + cgst + sgst;
    return { subtotal, discount, cgst, sgst, grandTotal };
  };

  // Edit Order: update items/discount/totals and persist to the store.
  // Always passes the current discount value/type explicitly so the math
  // is computed from the exact values the user just typed — never from a
  // stale closure.
  const saveEditedOrder = () => {
    if (!detailOrder || !user) return;
    const totals = recomputeEditedTotals(detailOrder, editDiscountVal, editDiscountType);
    const updated: Order = {
      ...detailOrder,
      subtotal: totals.subtotal,
      discount: totals.discount,
      discountType: editDiscountType,
      cgst: totals.cgst,
      sgst: totals.sgst,
      grandTotal: totals.grandTotal,
      updatedAt: Date.now(),
    };
    // Recompute amountPaid / balanceDue if any payments exist.
    const payments = Store.listPayments().filter((p) => p.orderId === updated.id);
    const amountPaid = payments.reduce((s, p) => s + (p.amount ?? p.cashAmount ?? p.upiAmount ?? 0), 0);
    updated.amountPaid = amountPaid;
    updated.balanceDue = Math.max(0, totals.grandTotal - amountPaid);
    Store.updateOrder(updated.id, updated);
    Store.addAudit({
      userId: user.id,
      userName: user.name,
      action: "EDIT_ORDER",
      details: `${updated.billNumber} • items=${updated.items.length} • subtotal=${inr(updated.subtotal)} • discount=${inr(updated.discount)} • total=${inr(updated.grandTotal)}`,
    });
    setDetailOrder(updated);
    setEditingOrder(false);
    // After saving the edit, the grand total has changed (e.g. after a
    // discount) — refresh the payment form so Cash / UPI / Part Payment
    // fields automatically reflect the NEW grand total, not the old one.
    // Always force the cash / upi defaults to the new remaining balance,
    // never keep stale values.
    setPaymentMode("cash");
    const remaining = Math.max(0, updated.grandTotal - (updated.amountPaid ?? 0));
    setCashAmount(remaining > 0 ? remaining.toFixed(2) : "");
    setUpiAmount("");
    setPaymentRef("");
    toast.push(
      `Order ${updated.billNumber} updated • New total ${inr(updated.grandTotal)}`,
      "success"
    );
  };

  const editIncQty = (itemId: string) => {
    if (!detailOrder) return;
    setDetailOrder({
      ...detailOrder,
      items: detailOrder.items.map((i) =>
        i.id === itemId ? { ...i, quantity: i.quantity + 1 } : i
      ),
    });
  };
  const editDecQty = (itemId: string) => {
    if (!detailOrder) return;
    setDetailOrder({
      ...detailOrder,
      items: detailOrder.items
        .map((i) =>
          i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i
        )
        .filter((i) => i.quantity > 0),
    });
  };
  const editRemove = (itemId: string) => {
    if (!detailOrder) return;
    setDetailOrder({
      ...detailOrder,
      items: detailOrder.items.filter((i) => i.id !== itemId),
    });
  };

  // ── Add Item picker handlers ───────────────────────────────────────────
  // Add (or increment the quantity of) a menu item from the restaurant's
  // menu into the order that's currently being edited.
  const addMenuItemToOrder = (menuItemId: string) => {
    if (!detailOrder) return;
    const menuItem = allItems.find((m) => m.id === menuItemId);
    if (!menuItem) return;
    const existing = detailOrder.items.find(
      (i) => i.menuItemId === menuItemId || i.id === menuItemId
    );
    let nextItems;
    if (existing) {
      nextItems = detailOrder.items.map((i) =>
        i.menuItemId === menuItemId || i.id === menuItemId
          ? { ...i, quantity: i.quantity + 1 }
          : i
      );
    } else {
      // Build a fresh OrderItem that follows the existing schema.
      nextItems = [
        ...detailOrder.items,
        {
          id: Store.uid("oi"),
          menuItemId: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: 1,
          source: detailOrder.source,
        },
      ];
    }
    setDetailOrder({
      ...detailOrder,
      items: nextItems,
    });
    toast.push(
      existing
        ? `Increased quantity of ${menuItem.name}`
        : `Added ${menuItem.name}`,
      "success"
    );
  };

  // ── Filter / search the picker ────────────────────────────────────────
  const pickerItems = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return allItems.filter((m) => {
      if (!m.available) return false;
      if (pickerCat !== "all" && m.categoryId !== pickerCat) return false;
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allItems, pickerCat, pickerSearch]);

  // Reset payment form when the modal opens / when the order changes.
  const resetPaymentForm = (order: Order | null) => {
    if (!order) return;
    setPaymentMode("cash");
    const remaining = Math.max(0, order.grandTotal - (order.amountPaid ?? 0));
    setCashAmount(remaining > 0 ? remaining.toFixed(2) : "");
    setUpiAmount("");
    setPaymentRef("");
  };

  // Save payment for the currently displayed order.
  const savePayment = () => {
    if (!detailOrder || !user) return;
    const order = detailOrder;
    const grandTotal = order.grandTotal;
    const alreadyPaid = order.amountPaid ?? 0;
    const remaining = Math.max(0, grandTotal - alreadyPaid);
    if (remaining <= 0) {
      toast.push("This order is already fully paid", "info");
      return;
    }

    let cash = 0;
    let upi = 0;
    if (paymentMode === "cash") {
      cash = Math.min(parseMoney(cashAmount), remaining);
      if (cash <= 0) return toast.push("Enter a cash amount greater than 0", "error");
    } else if (paymentMode === "upi") {
      upi = Math.min(parseMoney(upiAmount), remaining);
      if (upi <= 0) return toast.push("Enter a UPI amount greater than 0", "error");
    } else {
      // Part payment: cash + upi combined
      cash = parseMoney(cashAmount);
      upi = parseMoney(upiAmount);
      const sum = cash + upi;
      if (sum <= 0) return toast.push("Enter at least one amount", "error");
      if (sum > remaining) {
        return toast.push(
          `Total paid (${inr(sum)}) exceeds balance (${inr(remaining)})`,
          "error"
        );
      }
    }
    const totalPaidNow = cash + upi;
    const newTotalPaid = alreadyPaid + totalPaidNow;
    const newBalance = Math.max(0, grandTotal - newTotalPaid);

    const mode: "cash" | "upi" | "part_payment" =
      paymentMode === "cash"
        ? "cash"
        : paymentMode === "upi"
        ? "upi"
        : cash > 0 && upi > 0
        ? "part_payment"
        : cash > 0
        ? "cash"
        : "upi";

    Store.addPayment({
      id: Store.uid("pay"),
      orderId: order.id,
      billNumber: order.billNumber,
      amount: totalPaidNow,
      paymentMode: mode,
      cashAmount: cash,
      upiAmount: upi,
      totalPaid: newTotalPaid,
      balanceDue: newBalance,
      receivedBy: user.name,
      createdAt: Date.now(),
      reference: paymentRef.trim() || undefined,
    });
    Store.updateOrder(order.id, {
      amountPaid: newTotalPaid,
      balanceDue: newBalance,
      lastPaymentMode: mode,
    });
    if (newBalance === 0) {
      // Fully paid — promote to "paid" and free the table.
      Store.updateOrder(order.id, { status: "paid" });
      if (order.tableId) Store.updateTable(order.tableId, { status: "available", currentOrderId: undefined });
    }
    Store.removeNotificationsForOrder(order.id);
    Store.addAudit({
      userId: user.id,
      userName: user.name,
      action: "PAYMENT",
      details:
        `${order.billNumber} • ${mode} • Cash ${inr(cash)} • UPI ${inr(upi)} • ` +
        `Paid ${inr(newTotalPaid)} • Balance ${inr(newBalance)}`,
    });
    toast.push(
      `Payment saved: ${inr(totalPaidNow)} via ${mode.toUpperCase()}` +
        (newBalance > 0 ? ` • Balance ${inr(newBalance)}` : " • Fully paid"),
      "success"
    );
    // Refresh the displayed order object with new totals.
    setDetailOrder({
      ...order,
      amountPaid: newTotalPaid,
      balanceDue: newBalance,
      lastPaymentMode: mode,
      status: newBalance === 0 ? "paid" : order.status,
    });
    if (newBalance === 0) setTab("paid");
    resetPaymentForm({
      ...order,
      amountPaid: newTotalPaid,
      balanceDue: newBalance,
    });
  };

  // --- Tab configuration ----------------------------------------------------
  const tabs: { key: TabKey; label: string; count: number; tone: "gold" | "green" | "neutral" | "red" }[] = [
    { key: "active", label: "Active Orders", count: counters.active, tone: "gold" },
    { key: "paid", label: "Paid Orders", count: counters.paid, tone: "green" },
    { key: "completed", label: "Completed Orders", count: counters.completed, tone: "neutral" },
    { key: "cancelled", label: "Cancelled Orders", count: counters.cancelled, tone: "red" },
  ];

  const tabAccent: Record<typeof tabs[number]["tone"], string> = {
    gold: "from-gold-400/30 to-gold-700/10 text-gold-600 dark:text-gold-300",
    green: "from-emerald-400/30 to-emerald-700/10 text-emerald-600 dark:text-emerald-300",
    neutral: "from-neutral-300/30 to-neutral-500/10 text-neutral-600 dark:text-neutral-300",
    red: "from-rose-400/30 to-rose-700/10 text-rose-600 dark:text-rose-300",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Orders</h2>
          <p className="text-sm text-neutral-500">
            {counters.total} total • real-time updates from POS, Waiter &amp; QR
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Show Archived toggle — only meaningful on the Active tab */}
          <button
            onClick={() => setShowArchived((p) => !p)}
            className={cn(
              "px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 border transition",
              showArchived
                ? "bg-gold-500/15 border-gold-500 text-gold-700 dark:text-gold-300"
                : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300"
            )}
            title="When ON, shows Paid, Completed and Cancelled orders inside Active view"
          >
            {showArchived ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            Show Archived {showArchived ? "ON" : "OFF"}
          </button>
          <Select
            value={sortKey}
            onChange={(v) => setSortKey(v as SortKey)}
            options={[
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "table_asc", label: "Table ↑" },
              { value: "table_desc", label: "Table ↓" },
              { value: "status", label: "By status" },
            ]}
          />
        </div>
      </div>

      {/* Dashboard counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active Orders" value={counters.active} icon={<History className="h-5 w-5" />} tone="gold" />
        <StatCard label="Paid Orders" value={counters.paid} icon={<Check className="h-5 w-5" />} tone="green" />
        <StatCard label="Completed" value={counters.completed} icon={<Check className="h-5 w-5" />} tone="blue" />
        <StatCard label="Cancelled" value={counters.cancelled} icon={<X className="h-5 w-5" />} tone="red" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "shrink-0 px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 border",
                isActive
                  ? "bg-gold-gradient text-white shadow border-transparent"
                  : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-gold-400"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-extrabold",
                  isActive ? "bg-white/25 text-white" : "bg-neutral-100 dark:bg-neutral-800"
                )}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + Source filter */}
      <div className="panel p-3 flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[200px]">
          <Input
            value={search}
            onChange={setSearch}
            placeholder="Search bill, customer, mobile, waiter…"
            prefix={<Search className="h-4 w-4" />}
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        >
          <option value="all">All Sources</option>
          <option value="pos">POS</option>
          <option value="waiter">Waiter</option>
          <option value="qr">QR</option>
        </select>
      </div>

      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center bg-gradient-to-br", tabAccent[tabs.find((t) => t.key === tab)?.tone || "neutral"])}>
          <History className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">
            {tabs.find((t) => t.key === tab)?.label}
          </h3>
          <p className="text-xs text-neutral-500">
            {filtered.length} order{filtered.length === 1 ? "" : "s"}
            {showArchived && tab === "active" ? " (incl. archived)" : ""}
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty
          message={`No ${tabs.find((t) => t.key === tab)?.label.toLowerCase()}`}
          hint={tab === "active" ? "New orders from waiters and QR will appear here instantly." : "Try switching tabs or adjusting filters."}
        />
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, 200).map((o) => {
            const badgeTone = tableBadgeTone(o.status);
            const statusMeta = STATUS_BADGE[o.status] || STATUS_BADGE.open;
            const isArchived = ARCHIVED_STATUSES.includes(o.status);
            return (
              <button
                key={o.id}
                onClick={() => setDetailOrder(o)}
                className={cn(
                  "w-full text-left panel hover:shadow-md transition cursor-pointer flex items-stretch overflow-hidden",
                  "ring-1 ring-transparent hover:ring-gold-400",
                  isArchived && "opacity-90"
                )}
              >
                {/* Big table number badge */}
                <div
                  className={cn(
                    "flex flex-col items-center justify-center px-4 sm:px-5 py-3 sm:py-4 shrink-0",
                    "min-w-[88px] sm:min-w-[110px]",
                    badgeTone.bg,
                    "ring-2",
                    badgeTone.ring
                  )}
                >
                  {o.tableNumber ? (
                    <>
                      <span className="text-[10px] sm:text-xs uppercase tracking-wider opacity-80 font-bold text-white">
                        Table
                      </span>
                      <span className="text-3xl sm:text-4xl font-extrabold text-white leading-none mt-0.5">
                        {displayTableNumber(o, tables)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] sm:text-xs uppercase tracking-wider opacity-80 font-bold text-white">
                        {o.orderType.replace("_", " ")}
                      </span>
                      <span className="text-base font-bold text-white mt-1">
                        {o.orderType === "takeaway" ? "T/A" : o.orderType === "delivery" ? "DEL" : "—"}
                      </span>
                    </>
                  )}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0 p-3 sm:p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm">{o.billNumber}</span>
                      <Badge tone="gold">{o.source}</Badge>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
                          statusMeta.bg,
                          statusMeta.text
                        )}
                      >
                        <span>{statusMeta.icon}</span>
                        {statusMeta.label}
                      </span>
                      {o.waiterName && <Badge tone="info">👤 {o.waiterName}</Badge>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gold-600 dark:text-gold-400 text-lg">
                        {inr(o.grandTotal)}
                      </p>
                      <PaymentBadge order={o} />
                    </div>
                  </div>

                  <p className="text-sm text-neutral-700 dark:text-neutral-300 line-clamp-2">
                    {o.items
                      .slice(0, 5)
                      .map((i) => `${i.quantity}× ${i.name}`)
                      .join(" · ")}
                    {o.items.length > 5 && ` +${o.items.length - 5} more`}
                  </p>

                  <div className="flex items-center justify-between mt-2 text-xs text-neutral-500">
                    <span>
                      {new Date(o.createdAt).toLocaleString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                    <span>{o.items.reduce((s, i) => s + i.quantity, 0)} items</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Modal open={!!detailOrder} onClose={() => setDetailOrder(null)} title={`Order ${detailOrder?.billNumber || ""}`} size="lg">
        {detailOrder && (
          <div className="space-y-4">
            {/* Big header */}
            <div className="flex items-center gap-3 -mt-2">
              {detailOrder.tableNumber ? (
                <div
                  className={cn(
                    "h-16 w-16 rounded-2xl flex flex-col items-center justify-center text-white shrink-0 ring-2",
                    tableBadgeTone(detailOrder.status).bg,
                    tableBadgeTone(detailOrder.status).ring
                  )}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-90">Table</span>
                  <span className="text-2xl font-extrabold leading-none">T{detailOrder.tableNumber}</span>
                </div>
              ) : null}
              <div className="flex-1">
                <p className="font-mono text-sm text-neutral-500">{detailOrder.billNumber}</p>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <Badge tone="gold">{detailOrder.source}</Badge>
                  <Badge>{detailOrder.orderType.replace("_", " ")}</Badge>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
                      (STATUS_BADGE[detailOrder.status] || STATUS_BADGE.open).bg,
                      (STATUS_BADGE[detailOrder.status] || STATUS_BADGE.open).text
                    )}
                  >
                    {(STATUS_BADGE[detailOrder.status] || STATUS_BADGE.open).icon}
                    {(STATUS_BADGE[detailOrder.status] || STATUS_BADGE.open).label}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-2xl text-gold-600 dark:text-gold-400">{inr(detailOrder.grandTotal)}</p>
                <p className="text-xs text-neutral-500">{new Date(detailOrder.createdAt).toLocaleString()}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm border-t border-b border-neutral-200 dark:border-neutral-800 py-3">
              {detailOrder.waiterName && (
                <div>
                  <p className="text-xs text-neutral-500">Waiter</p>
                  <p className="font-medium">{detailOrder.waiterName}</p>
                </div>
              )}
              {detailOrder.customerName && (
                <div>
                  <p className="text-xs text-neutral-500">Customer</p>
                  <p className="font-medium">{detailOrder.customerName}</p>
                </div>
              )}
              {detailOrder.customerMobile && (
                <div>
                  <p className="text-xs text-neutral-500">Mobile</p>
                  <p className="font-medium">{detailOrder.customerMobile}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-neutral-500">Source</p>
                <p className="font-medium uppercase">{detailOrder.source}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Items</p>
                <p className="font-medium">{detailOrder.items.length}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Last update</p>
                <p className="font-medium">{new Date(detailOrder.updatedAt).toLocaleTimeString()}</p>
              </div>
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detailOrder.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {i.name}
                        {i.notes && <p className="text-xs text-neutral-500">↳ {i.notes}</p>}
                      </td>
                      <td>{i.quantity}</td>
                      <td className="text-right">{inr(i.price)}</td>
                      <td className="text-right font-semibold">{inr(i.price * i.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1 text-sm border-t border-dashed pt-2">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{inr(detailOrder.subtotal)}</span>
              </div>
              {detailOrder.discount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Discount</span>
                  <span>-{inr(detailOrder.discount)}</span>
                </div>
              )}
              {detailOrder.gstPercent > 0 && (
                <>
                  <div className="flex justify-between text-xs">
                    <span>CGST ({detailOrder.gstPercent / 2}%)</span>
                    <span>{inr(detailOrder.cgst)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>SGST ({detailOrder.gstPercent / 2}%)</span>
                    <span>{inr(detailOrder.sgst)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-dashed">
                <span className="font-bold">Grand Total</span>
                <span className="text-xl font-bold text-gold-600">{inr(detailOrder.grandTotal)}</span>
              </div>
              {/* Payment summary — populated as soon as any payment record exists */}
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Amount Paid</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {inr(detailOrder.amountPaid ?? 0)}
                  {detailOrder.lastPaymentMode && (
                    <span className="ml-1 text-[10px] uppercase tracking-wider text-neutral-500">
                      ({detailOrder.lastPaymentMode.replace("_", " ")})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Balance Due</span>
                <span
                  className={cn(
                    "font-semibold",
                    (detailOrder.balanceDue ?? 0) > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-neutral-500"
                  )}
                >
                  {inr(detailOrder.balanceDue ?? detailOrder.grandTotal)}
                </span>
              </div>
            </div>

            {/* ── EDIT ORDER SECTION ────────────────────────────────────────
                Allows adding/removing items, changing quantity, and
                applying a discount. The bill recalculates automatically
                when saved. */}
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 bg-neutral-50/50 dark:bg-neutral-900/40">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm flex items-center gap-1">
                  <Edit2 className="h-4 w-4 text-gold-500" /> Edit Order
                </h4>
                {!editingOrder ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingOrder(true);
                      setEditDiscountType(detailOrder.discountType || "flat");
                      setEditDiscountVal(
                        String(detailOrder.discountType === "percent"
                          ? (detailOrder.subtotal > 0
                              ? Math.round((detailOrder.discount / detailOrder.subtotal) * 100)
                              : 0)
                          : detailOrder.discount)
                      );
                    }}
                    disabled={
                      ["cancelled", "paid"].includes(detailOrder.status)
                    }
                  >
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingOrder(false);
                        // Revert the in-memory edits by reloading from store
                        const fresh = orders.find((o) => o.id === detailOrder.id);
                        if (fresh) setDetailOrder(fresh);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" onClick={saveEditedOrder}>
                      <Check className="h-3.5 w-3.5" /> Save
                    </Button>
                  </div>
                )}
              </div>

              {editingOrder && (
                <div className="space-y-2 mt-2">
                  {/* Items list with qty +/- and remove */}
                  <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden bg-white dark:bg-neutral-950">
                    {detailOrder.items.length === 0 ? (
                      <div className="p-3 text-center">
                        <p className="text-xs text-neutral-500 mb-2">
                          No items in this order yet.
                        </p>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setPickerSearch("");
                            setPickerCat("all");
                            setPickerOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4" /> Add Item
                        </Button>
                      </div>
                    ) : (
                      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 max-h-48 overflow-y-auto">
                        {detailOrder.items.map((it) => (
                          <li key={it.id} className="p-2 flex items-center gap-2 text-sm">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{it.name}</p>
                              <p className="text-xs text-neutral-500">
                                {inr(it.price)} × {it.quantity}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => editDecQty(it.id)}
                                className="h-6 w-6 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-5 text-center font-semibold">{it.quantity}</span>
                              <button
                                onClick={() => editIncQty(it.id)}
                                className="h-6 w-6 rounded bg-gold-gradient text-white flex items-center justify-center"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => editRemove(it.id)}
                                className="text-rose-500 p-1"
                                title="Remove item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Add a new menu item to the order being edited. */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPickerSearch("");
                      setPickerCat("all");
                      setPickerOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Add Item
                  </Button>

                  {/* Discount */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Input
                        label="Discount"
                        value={editDiscountVal}
                        onChange={setEditDiscountVal}
                        type="number"
                        prefix={editDiscountType === "flat" ? "₹" : "%"}
                      />
                    </div>
                    <div>
                      <span className="block mb-1 text-xs font-medium">Type</span>
                      <div className="flex">
                        <button
                          onClick={() => setEditDiscountType("flat")}
                          className={`flex-1 px-2 py-2 text-xs rounded-l-lg ${
                            editDiscountType === "flat"
                              ? "bg-gold-gradient text-white"
                              : "bg-neutral-100 dark:bg-neutral-800"
                          }`}
                        >
                          ₹
                        </button>
                        <button
                          onClick={() => setEditDiscountType("percent")}
                          className={`flex-1 px-2 py-2 text-xs rounded-r-lg ${
                            editDiscountType === "percent"
                              ? "bg-gold-gradient text-white"
                              : "bg-neutral-100 dark:bg-neutral-800"
                          }`}
                        >
                          %
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Live preview */}
                  {(() => {
                    const t = recomputeEditedTotals(detailOrder);
                    return (
                      <div className="text-xs space-y-0.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded p-2">
                        <div className="flex justify-between">
                          <span>Subtotal</span>
                          <span>{inr(t.subtotal)}</span>
                        </div>
                        {t.discount > 0 && (
                          <div className="flex justify-between text-rose-600">
                            <span>Discount</span>
                            <span>-{inr(t.discount)}</span>
                          </div>
                        )}
                        {detailOrder.gstPercent > 0 && (
                          <>
                            <div className="flex justify-between">
                              <span>CGST ({detailOrder.gstPercent / 2}%)</span>
                              <span>{inr(t.cgst)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>SGST ({detailOrder.gstPercent / 2}%)</span>
                              <span>{inr(t.sgst)}</span>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between pt-1 mt-1 border-t border-dashed font-bold">
                          <span>New Grand Total</span>
                          <span className="text-gold-600">{inr(t.grandTotal)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* ── PAYMENT SECTION ───────────────────────────────────────────
                Manual entry only — Cash / UPI / Part Payment.
                No gateway, no Razorpay / PhonePe / Paytm / Google Pay. */}
            {detailOrder.status !== "cancelled" && (detailOrder.balanceDue ?? detailOrder.grandTotal) > 0 && (
              <div className="border border-emerald-200 dark:border-emerald-700/50 rounded-lg p-3 bg-emerald-50/40 dark:bg-emerald-500/5">
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  <IndianRupee className="h-4 w-4" /> Receive Payment
                </h4>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {(["cash", "upi", "part_payment"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setPaymentMode(m);
                        if (m === "cash") {
                          const remaining = Math.max(0, detailOrder.grandTotal - (detailOrder.amountPaid ?? 0));
                          setCashAmount(remaining.toFixed(2));
                          setUpiAmount("");
                        } else if (m === "upi") {
                          const remaining = Math.max(0, detailOrder.grandTotal - (detailOrder.amountPaid ?? 0));
                          setCashAmount("");
                          setUpiAmount(remaining.toFixed(2));
                        } else {
                          const remaining = Math.max(0, detailOrder.grandTotal - (detailOrder.amountPaid ?? 0));
                          // Default to a 50/50 split
                          const half = (remaining / 2).toFixed(2);
                          setCashAmount(half);
                          setUpiAmount(half);
                        }
                      }}
                      className={cn(
                        "px-2 py-2 rounded-lg text-xs font-semibold border transition flex flex-col items-center gap-1",
                        paymentMode === m
                          ? "bg-gold-gradient text-white border-transparent shadow"
                          : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-gold-400"
                      )}
                    >
                      {m === "cash" && <Wallet className="h-4 w-4" />}
                      {m === "upi" && <CreditCard className="h-4 w-4" />}
                      {m === "part_payment" && <CreditCard className="h-4 w-4" />}
                      <span>{m === "part_payment" ? "Part Payment" : m.toUpperCase()}</span>
                    </button>
                  ))}
                </div>

                {paymentMode === "cash" && (
                  <Input
                    label="Cash Amount"
                    type="number"
                    value={cashAmount}
                    onChange={setCashAmount}
                    prefix="₹"
                  />
                )}
                {paymentMode === "upi" && (
                  <>
                    <Input
                      label="UPI Amount"
                      type="number"
                      value={upiAmount}
                      onChange={setUpiAmount}
                      prefix="₹"
                    />
                    <Input
                      label="UPI Reference / Txn ID (optional)"
                      value={paymentRef}
                      onChange={setPaymentRef}
                      placeholder="e.g. UPI/1234/5678"
                    />
                  </>
                )}
                {paymentMode === "part_payment" && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label="Cash"
                        type="number"
                        value={cashAmount}
                        onChange={setCashAmount}
                        prefix="₹"
                      />
                      <Input
                        label="UPI"
                        type="number"
                        value={upiAmount}
                        onChange={setUpiAmount}
                        prefix="₹"
                      />
                    </div>
                    <div className="flex justify-between text-xs mt-2 px-1">
                      <span className="text-neutral-500">
                        Entered: {inr(parseMoney(cashAmount) + parseMoney(upiAmount))}
                      </span>
                      <span className="text-neutral-500">
                        Balance: {inr(
                          Math.max(0, detailOrder.grandTotal - (detailOrder.amountPaid ?? 0) -
                            (parseMoney(cashAmount) + parseMoney(upiAmount)))
                        )}
                      </span>
                    </div>
                    <Input
                      label="UPI Reference (optional)"
                      value={paymentRef}
                      onChange={setPaymentRef}
                      placeholder="e.g. UPI/1234/5678"
                    />
                  </>
                )}

                <Button
                  variant="primary"
                  className="w-full mt-3"
                  onClick={savePayment}
                  disabled={!user}
                >
                  Save Payment
                </Button>
              </div>
            )}

            {/* Existing payment history for this order */}
            <PaymentHistory orderId={detailOrder.id} />

            {/* Workflow buttons — work for every entry point (POS / Waiter / QR) */}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {/* Print Pending KOT — pending_print → confirmed */}
              {detailOrder.status === "pending_print" && (
                <Button size="sm" variant="primary" onClick={() => printPendingKOT(detailOrder)}>
                  <Printer className="h-4 w-4" /> Print Pending KOT
                </Button>
              )}

              {/* Draft / Saved → confirm + print KOT */}
              {(detailOrder.status === "draft" || detailOrder.status === "saved") && (
                <Button size="sm" variant="primary" onClick={() => printPendingKOT(detailOrder)}>
                  <Printer className="h-4 w-4" /> Print KOT &amp; Confirm
                </Button>
              )}

              {/* Confirmed → Start Preparing */}
              {detailOrder.status === "confirmed" && (
                <Button size="sm" variant="primary" onClick={() => startPreparing(detailOrder)}>
                  <RefreshCcw className="h-4 w-4" /> Start Preparing
                </Button>
              )}

              {/* Preparing → Ready */}
              {detailOrder.status === "preparing" && (
                <Button size="sm" variant="primary" onClick={() => markReady(detailOrder)}>
                  <Check className="h-4 w-4" /> Ready
                </Button>
              )}

              {/* Ready → Served */}
              {detailOrder.status === "ready" && (
                <Button size="sm" variant="primary" onClick={() => markServed(detailOrder)}>
                  <Check className="h-4 w-4" /> Served
                </Button>
              )}

              {/* Served → Completed */}
              {detailOrder.status === "served" && (
                <Button size="sm" variant="primary" onClick={() => completeOrder(detailOrder)}>
                  <Check className="h-4 w-4" /> Complete
                </Button>
              )}

              {/* Mark Paid (cash) — for served / ready orders */}
              {(detailOrder.status === "served" ||
                detailOrder.status === "ready" ||
                detailOrder.status === "confirmed") && (
                <Button size="sm" variant="secondary" onClick={() => markPaid(detailOrder)}>
                  💵 Mark Paid (Cash)
                </Button>
              )}

              {/* Direct paid shortcut for completed orders */}
              {detailOrder.status === "completed" && (
                <Button size="sm" variant="secondary" onClick={() => markPaid(detailOrder)}>
                  💵 Mark Paid (Cash)
                </Button>
              )}

              {/* Always-available: print KOT, print bill */}
              <Button size="sm" variant="outline" onClick={() => printBill(detailOrder, settings, "kot")}>
                <Printer className="h-4 w-4" /> Reprint KOT
              </Button>
              <Button size="sm" variant="outline" onClick={() => printBill(detailOrder, settings, "bill")}>
                <Printer className="h-4 w-4" /> Print Bill
              </Button>

              {/* Cancel — only when not yet archived */}
              {!["cancelled", "paid", "completed"].includes(detailOrder.status) && (
                <Button size="sm" variant="danger" onClick={() => cancelOrder(detailOrder)}>
                  <X className="h-4 w-4" /> Cancel
                </Button>
              )}
            </div>

            {/* Workflow progress indicator */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Workflow</p>
              <div className="flex items-center gap-1 text-[10px] overflow-x-auto pb-1">
                {[
                  { k: "draft", l: "Saved" },
                  { k: "pending_print", l: "Pending Print" },
                  { k: "confirmed", l: "Confirmed" },
                  { k: "preparing", l: "Preparing" },
                  { k: "ready", l: "Ready" },
                  { k: "served", l: "Served" },
                  { k: "completed", l: "Completed" },
                ].map((s, idx, arr) => {
                  const order = ["draft", "pending_print", "confirmed", "preparing", "ready", "served", "completed"];
                  const cur = order.indexOf(
                    ["draft", "saved"].includes(detailOrder.status)
                      ? "draft"
                      : detailOrder.status === "paid"
                      ? "completed"
                      : detailOrder.status
                  );
                  const myIdx = order.indexOf(s.k);
                  const passed = cur >= myIdx;
                  const isCurrent = cur === myIdx;
                  return (
                    <div key={s.k} className="flex items-center gap-1">
                      <div
                        className={cn(
                          "px-2 py-1 rounded-full font-bold whitespace-nowrap",
                          passed
                            ? "bg-gold-gradient text-white"
                            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
                        )}
                      >
                        {isCurrent && "● "}
                        {s.l}
                      </div>
                      {idx < arr.length - 1 && (
                        <span className={cn("text-neutral-400", passed && "text-gold-500")}>→</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Add Item picker (inside Edit Order) ─────────────────────────
          Searchable modal that lets the cashier add any menu item to the
          currently edited order. Selecting an item increases the existing
          line's quantity if it's already on the bill, otherwise a new
          OrderItem is appended with quantity 1. The saveEditedOrder()
          call then persists the updated items + recalculated totals. */}
      <Modal
        open={pickerOpen && editingOrder && !!detailOrder}
        onClose={() => setPickerOpen(false)}
        title="Add Menu Item"
        size="lg"
      >
        <div className="space-y-3">
          <Input
            value={pickerSearch}
            onChange={setPickerSearch}
            placeholder="Search dishes…"
            prefix={<Search className="h-4 w-4" />}
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setPickerCat("all")}
              className={cn(
                "shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold transition",
                pickerCat === "all"
                  ? "bg-gold-gradient text-white"
                  : "bg-neutral-100 dark:bg-neutral-800"
              )}
            >
              All
            </button>
            {allCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => setPickerCat(c.id)}
                className={cn(
                  "shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold transition",
                  pickerCat === c.id ? "bg-gold-gradient text-white" : "bg-neutral-100 dark:bg-neutral-800"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

          {pickerItems.length === 0 ? (
            <Empty message="No items match your search" />
          ) : (
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {pickerItems.map((m) => {
                  const existing = detailOrder?.items.find(
                    (i) => i.menuItemId === m.id || i.id === m.id
                  );
                  return (
                    <li key={m.id} className="p-2.5 flex items-center gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                      <span
                        className={cn(
                          "mt-1 h-3 w-3 rounded-sm border-2 shrink-0 flex items-center justify-center",
                          m.veg ? "border-emerald-600" : "border-rose-600"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            m.veg ? "bg-emerald-600" : "bg-rose-600"
                          )}
                        />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{m.name}</p>
                        <p className="text-xs text-neutral-500">
                          {allCategories.find((c) => c.id === m.categoryId)?.name ?? "—"} •{" "}
                          {inr(m.price)}
                          {existing ? (
                            <span className="ml-2 text-emerald-600">
                              • already {existing.quantity}× in order
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={existing ? "outline" : "primary"}
                        onClick={() => addMenuItemToOrder(m.id)}
                      >
                        <Plus className="h-4 w-4" /> {existing ? "Add 1 more" : "Add"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PaymentBadge — tiny label that shows whether an order has been paid,
// partially paid, or is still outstanding. Used on the order cards in the
// list view so the cashier can scan for "needs payment" instantly.
// ────────────────────────────────────────────────────────────────────────────
function PaymentBadge({ order }: { order: Order }) {
  const paid = order.amountPaid ?? 0;
  const balance = Math.max(0, order.grandTotal - paid);
  if (paid <= 0) {
    return (
      <Badge tone="danger">
        <IndianRupee className="h-3 w-3" /> Unpaid
      </Badge>
    );
  }
  if (balance <= 0) {
    return (
      <Badge tone="success">
        <Check className="h-3 w-3" /> Paid
      </Badge>
    );
  }
  return (
    <Badge tone="warning">
      <IndianRupee className="h-3 w-3" /> Partial {inr(paid)}
    </Badge>
  );
}

// PaymentHistory — small helper component that lists every payment record
// attached to the currently displayed order. Used inside the order modal so
// the cashier can see the full payment history (cash + UPI + part payments)
// without leaving the page.
// ────────────────────────────────────────────────────────────────────────────
function PaymentHistory({ orderId }: { orderId: string }) {
  const payments = useStore("payments", Store.listPayments).filter(
    (p) => p.orderId === orderId
  );
  if (payments.length === 0) return null;
  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 bg-white dark:bg-neutral-950">
      <h4 className="font-semibold text-sm mb-2 flex items-center gap-1">
        <IndianRupee className="h-4 w-4 text-gold-500" /> Payment History
      </h4>
      <div className="space-y-1.5">
        {payments
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((p) => {
            const mode =
              p.paymentMode ||
              (p.cashAmount && p.upiAmount
                ? "part_payment"
                : p.method === "cash"
                ? "cash"
                : "upi");
            const cash = p.cashAmount ?? 0;
            const upi = p.upiAmount ?? 0;
            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-neutral-100 dark:border-neutral-800 pb-1.5 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-semibold capitalize">
                    {mode.replace("_", " ")}
                  </p>
                  <p className="text-neutral-500">
                    {new Date(p.createdAt).toLocaleString()} • by {p.receivedBy}
                  </p>
                  {p.reference && (
                    <p className="text-neutral-500 truncate">Ref: {p.reference}</p>
                  )}
                </div>
                <div className="text-right text-xs">
                  {cash > 0 && <p>Cash: {inr(cash)}</p>}
                  {upi > 0 && <p>UPI: {inr(upi)}</p>}
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">
                    {inr(p.amount)}
                  </p>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
