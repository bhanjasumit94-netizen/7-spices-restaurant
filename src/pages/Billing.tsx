import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Minus,
  Trash2,
  Search,
  ShoppingBag,
  Printer,
  Save,
  X,
  Receipt as ReceiptIcon,
  History,
  Edit,
  Percent,
  Tag,
  Bell,
} from "lucide-react";
import { Card, Button, Input, Modal, Badge, Empty } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore } from "../lib/store";
import { useAuth } from "../lib/auth";
import { Order, OrderItem } from "../lib/types";
import { inr } from "../lib/money";
import { printBill, printAdditionalKot, printFinalKot } from "../lib/printer";
import { playNotificationSound } from "../lib/notify";
import { ActiveMenuBanner } from "../components/ActiveMenuBanner";
import { MenuCategorySidebar } from "../components/MenuCategorySidebar";

// Merge two item lists by menuItemId — duplicate items have their
// quantity summed. Used by the POS "Save" flow so that pressing Save
// multiple times accumulates items on the same order document instead
// of replacing them.
function mergeItems(a: OrderItem[], b: OrderItem[]): OrderItem[] {
  const out: OrderItem[] = a.slice();
  b.forEach((ni) => {
    const existingIdx = out.findIndex(
      (x) =>
        x.menuItemId === ni.menuItemId &&
        x.kotPrinted !== true &&
        x.printed !== true
    );
    if (existingIdx >= 0) {
      out[existingIdx] = {
        ...out[existingIdx],
        quantity: out[existingIdx].quantity + ni.quantity,
      };
    } else {
      out.push({
        ...ni,
        kotPrinted: ni.kotPrinted === true,
        printed: ni.printed === true,
        addedAt: ni.addedAt ?? Date.now(),
      });
    }
  });
  return out;
}

interface DraftItem extends OrderItem {}

const isKotPrinted = (item: OrderItem) =>
  item.kotPrinted === true || item.printed === true;

const markKotPrinted = <T extends OrderItem>(item: T): T => ({
  ...item,
  kotPrinted: true,
  printed: true,
});

export default function Billing({ initialTableId }: { initialTableId?: string } = {}) {
  const { user } = useAuth();
  const toast = useToast();
  const categories = useStore("cats", Store.listCategories);
  const items = useStore("items", Store.listItems);
  const tables = useStore("tables", Store.listTables);
  const orders = useStore("orders", Store.listOrders);

  // DEBUG: log the table count whenever the POS tables list changes.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("POS Tables Count:", tables.length);
    // eslint-disable-next-line no-console
    console.log(
      "POS Tables:",
      tables.map((t) => `T${t.number}${t.sectionLabel ?? ""}`).join(", ")
    );
    // eslint-disable-next-line no-console
    console.log(
      "POS Dropdown Options:",
      Store.buildTableOptions().map((o) => o.label).join(", ")
    );
  }, [tables]);
  const settings = useStore("settings", Store.getSettings);

  const [activeCat, setActiveCat] = useState<string>("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "delivery">("dine_in");
  const [tableId, setTableId] = useState<string>(initialTableId ?? "");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [discountType, setDiscountType] = useState<"flat" | "percent">("flat");
  const [discountVal, setDiscountVal] = useState<string>("0");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [billModal, setBillModal] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reprintOrder, setReprintOrder] = useState<Order | null>(null);

  // Per-table-order mode: lock to provided table & dine_in. When the
  // table already has an active (non-paid/cancelled/completed) order,
  // pre-load every existing item into the cart marked `kotPrinted: true`
  // so the waiter can SEE the running tab. Newly added items are tagged
  // with `kotPrinted: false` + a fresh `addedAt` so the "KOT" button only
  // prints the additions (Additional KOT) — old items are never reprinted.
  useEffect(() => {
    const selectedTableId = initialTableId ?? tableId;
    if (!selectedTableId) return;
    if (initialTableId) setTableId(initialTableId);
    setOrderType("dine_in");
    const existing = Store.findActiveOrderForTable(selectedTableId);
    if (!existing) return;
    if (editingId === existing.id) return;
    if (draft.some((d) => d.kotPrinted !== true)) return;
    setCustomerName(existing.customerName || "");
    setCustomerMobile(existing.customerMobile || "");
    setOrderNotes(existing.notes || "");
    setEditingId(existing.id);
    setDraft(existing.items.map((i) => markKotPrinted(i)));
    const tNum = tables.find((t) => t.id === selectedTableId)?.number;
    toast.push(
      `Table T${tNum ?? ""} already has an active order. Items will be added to the existing order.`,
      "info"
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTableId, tableId, orders.length]);


  useEffect(() => {
    if (!activeCat && categories.length) setActiveCat(categories[0].id);
  }, [categories, activeCat]);

  // Listen for new orders (waiter/QR) to notify cashier
  const lastOrderCount = useRef(orders.length);
  useEffect(() => {
    if (orders.length > lastOrderCount.current) {
      const newest = orders[0];
      // Play sound + create notification for any non-POS order that needs attention.
      if (
        newest &&
        newest.source !== "pos" &&
        ["open", "draft", "pending_print", "sent_to_kitchen", "confirmed"].includes(newest.status)
      ) {
        playNotificationSound();
        Store.addNotification({
          type: "new_order",
          message: `New ${newest.source.toUpperCase()} order — Table ${
            newest.tableNumber ?? "—"
          } • ${newest.items.length} items • ${newest.status.replace(/_/g, " ")}`,
        });
      }
    }
    lastOrderCount.current = orders.length;
  }, [orders]);

  const visibleItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((it) => {
      if (!it.available) return false;
      if (q) return it.name.toLowerCase().includes(q);
      return activeCat ? it.categoryId === activeCat : true;
    });
  }, [items, activeCat, search]);

  const subtotal = useMemo(
    () => draft.reduce((s, i) => s + i.price * i.quantity, 0),
    [draft]
  );
  // BUG 3 FIX: discount calculation.
  //
  // Percent:  grandTotal = subtotal - (subtotal × discountPercent / 100)
  // Flat:     grandTotal = subtotal - discountAmount
  //
  // Guarantees (per spec):
  //   • The discount is always clamped to a non-negative number.
  //   • The discount can never exceed the subtotal.
  //   • A NaN or empty input is treated as 0 (no discount).
  //   • Negative inputs are clamped to 0 (never grow the total).
  const discountAmount = useMemo(() => {
    const raw = parseFloat(discountVal);
    const v = isNaN(raw) ? 0 : raw;
    let computed: number;
    if (discountType === "percent") {
      // Clamp percent to a sane range [0, 100] before applying.
      const pct = Math.max(0, Math.min(100, v));
      computed = (subtotal * pct) / 100;
    } else {
      // Clamp flat amount to a non-negative value not exceeding the subtotal.
      computed = Math.max(0, Math.min(subtotal, v));
    }
    return computed;
  }, [discountVal, discountType, subtotal]);
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const gstPercent = settings.gstEnabled ? settings.defaultGstPercent : 0;
  const cgst = settings.gstEnabled ? (afterDiscount * (gstPercent / 2)) / 100 : 0;
  const sgst = settings.gstEnabled ? (afterDiscount * (gstPercent / 2)) / 100 : 0;
  const grandTotal = afterDiscount + cgst + sgst;

  const addItem = (it: { id: string; name: string; price: number }) => {
    setDraft((p) => {
      // For existing items that have ALREADY been printed (loaded from
      // the active order), we keep them frozen and ADD a separate new
      // line so the additional-KOT print only includes the new qty.
      const existing = p.find((d) => d.menuItemId === it.id && d.kotPrinted !== true);
      if (existing) {
        return p.map((d) => (d.id === existing.id ? { ...d, quantity: d.quantity + 1 } : d));
      }
      return [
        ...p,
        {
          id: Store.uid("oi"),
          menuItemId: it.id,
          name: it.name,
          price: it.price,
          quantity: 1,
          source: "pos",
          kotPrinted: false,
          printed: false,
          addedAt: Date.now(),
        },
      ];
    });
  };


  const incQty = (id: string) =>
    setDraft((p) => p.map((d) => (d.id === id ? { ...d, quantity: d.quantity + 1 } : d)));
  const decQty = (id: string) =>
    setDraft((p) =>
      p
        .map((d) => (d.id === id ? { ...d, quantity: d.quantity - 1 } : d))
        .filter((d) => d.quantity > 0)
    );
  const removeItem = (id: string) => setDraft((p) => p.filter((d) => d.id !== id));
  const editNote = (id: string, note: string) =>
    setDraft((p) => p.map((d) => (d.id === id ? { ...d, notes: note } : d)));

  const resetDraft = () => {
    setDraft([]);
    setOrderType(initialTableId ? "dine_in" : "dine_in");
    setTableId(initialTableId ?? "");
    setCustomerName("");
    setCustomerMobile("");
    setOrderNotes("");
    setDiscountType("flat");
    setDiscountVal("0");
    setEditingId(null);
  };

  const saveDraft = (
    status: Order["status"],
    printKot = false,
    markPaid = false,
    itemsOverride?: DraftItem[]
  ): Order | null => {
    if (!user) return null;
    const workingDraft = itemsOverride ?? draft;
    if (workingDraft.length === 0) {
      toast.push("Add items to the bill", "error");
      return null;
    }
    if (orderType === "dine_in" && !tableId) {
      toast.push("Please select a table", "error");
      return null;
    }
    const table = tables.find((t) => t.id === tableId);

    // REUSE the existing active order document for this table instead of
    // creating a duplicate. This keeps the bill number stable across
    // multiple Save / KOT presses and avoids generating a new bill when
    // a busy table receives additional items.
    let activeOrderId = editingId || "";
    let existingCreatedAt: number | undefined;
    let existingBillNumber: string | undefined;
    let existingItems: typeof draft = [];
    let existingOrder: Order | undefined;
    if (!activeOrderId && tableId) {
      const existing = Store.findActiveOrderForTable(tableId);
      if (existing) {
        activeOrderId = existing.id;
        existingCreatedAt = existing.createdAt;
        existingBillNumber = existing.billNumber;
        existingItems = existing.items;
        existingOrder = existing;
      }
    } else if (activeOrderId) {
      existingOrder = orders.find((o) => o.id === activeOrderId);
      existingCreatedAt = existingOrder?.createdAt;
      existingBillNumber = existingOrder?.billNumber;
      existingItems = existingOrder?.items ?? [];
    }

    const billNumber =
      existingBillNumber ||
      (editingId
        ? orders.find((o) => o.id === editingId)?.billNumber
        : undefined) ||
      Store.getNextBillNumber();

    // When the cart was hydrated from an existing order (initialTableId
    // mode), `draft` already contains every existing item — so we use
    // draft as the source of truth and skip the legacy merge. Otherwise
    // we still merge new draft items into the existing items list.
    const hydratedFromExisting = draft.some(isKotPrinted);
    const mergedItems = hydratedFromExisting ? workingDraft.slice() : mergeItems(existingItems, workingDraft);

    const order: Order = {
      id: activeOrderId || Store.uid("ord"),
      billNumber,
      tableId: orderType === "dine_in" ? tableId : undefined,
      tableNumber: table?.number,
      customerName: customerName || undefined,
      customerMobile: customerMobile || undefined,
      waiterName: existingOrder?.waiterName,
      source: "pos",
      orderType,
      items: mergedItems,
      subtotal: mergedItems.reduce((s, i) => s + i.price * i.quantity, 0),
      discount: discountAmount,
      discountType,
      gstPercent,
      cgst,
      sgst,
      grandTotal,
      notes: orderNotes || undefined,
      status,
      kotPrinted: printKot || !!existingOrder?.kotPrinted,
      billPrinted: status === "billed" || status === "paid",
      createdAt: existingCreatedAt || Date.now(),
      updatedAt: Date.now(),
      kotHistory: existingOrder?.kotHistory ?? [],
      eventLog: existingOrder?.eventLog ?? [],
    };

    if (editingId || activeOrderId) {
      Store.updateOrder(order.id, order);
    } else {
      Store.addOrder(order);
    }
    if (orderType === "dine_in" && tableId) {
      Store.updateTable(tableId, { status: "occupied", currentOrderId: order.id });
    }
    if (markPaid) {
      Store.addPayment({
        id: Store.uid("pay"),
        orderId: order.id,
        billNumber,
        amount: grandTotal,
        paymentMode: "cash",
        cashAmount: grandTotal,
        upiAmount: 0,
        totalPaid: grandTotal,
        balanceDue: 0,
        method: "cash",
        receivedBy: user.name,
        createdAt: Date.now(),
      });
      Store.updateOrder(order.id, { status: "paid" });
      if (orderType === "dine_in" && tableId) {
        Store.updateTable(tableId, { status: "available", currentOrderId: undefined });
      }
    }
    Store.addAudit({
      userId: user.id,
      userName: user.name,
      action: editingId ? "EDIT_BILL" : "CREATE_BILL",
      details: `Bill ${billNumber} • ${workingDraft.length} items • ${inr(grandTotal)} • ${status}`,
    });
    return order;
  };

  // "KOT" — print KOT + confirm the order.
  //   • New order: print the full KOT (initial).
  //   • Busy/active order with new items: print ONLY the new items as an
  //     "Additional KOT". Old items are NOT reprinted.
  //   • All printed items get marked `kotPrinted: true` and the run is
  //     appended to `order.kotHistory`.
  const handleConfirmAndKOT = () => {
    const newItems = draft.filter((d) => d.kotPrinted !== true);
    const hasPrinted = draft.some(isKotPrinted);
    const activeExistingOrder =
      editingId ? orders.find((o) => o.id === editingId) : tableId ? Store.findActiveOrderForTable(tableId) : undefined;
    const isAdditional = (hasPrinted || !!activeExistingOrder) && newItems.length > 0;

    if (hasPrinted && newItems.length === 0) {
      toast.push("No new items to send to kitchen.", "info");
      return;
    }

    // Mark new items as printed in the draft BEFORE save so the stored
    // order reflects the print state.
    const stamped = draft.map((d) => markKotPrinted(d));
    setDraft(stamped);

    // Save (status stays "confirmed").
    const o = saveDraft("confirmed", true, false, stamped);
    if (!o) return;

    const kotRecord = {
      id: Store.uid("kot"),
      ts: Date.now(),
      kind: (isAdditional ? "additional" : "initial") as "additional" | "initial",
      itemIds: (isAdditional ? newItems : draft).map((d) => d.id),
      waiterId: user?.id,
      waiterName: user?.name,
      acknowledged: false,
    };
    const nextHistory = [...(o.kotHistory ?? []), kotRecord];
    Store.updateOrder(o.id, {
      items: o.items.map((item) => markKotPrinted(item)),
      kotHistory: nextHistory,
    });

    if (settings.autoPrintKOT !== false) {
      if (isAdditional) {
        printAdditionalKot(o, newItems, settings);
        toast.push(`Additional KOT printed for ${o.billNumber}`, "success");
        Store.addNotification({
          type: "new_order",
          message: `New items added to Table T${o.tableNumber ?? "—"}.`,
          orderId: o.id,
        });
      } else {
        printBill({ ...o, items: draft }, settings, "kot");
        toast.push(`KOT printed for ${o.billNumber} → Confirmed`, "success");
      }
    } else {
      toast.push(`${o.billNumber} confirmed (auto-print KOT off)`, "success");
    }

    // In per-table mode keep the cart populated (now all items printed)
    // so the user can keep adding items. Otherwise reset.
    if (initialTableId) {
      setDraft(stamped.map((d) => markKotPrinted(d)));
      setEditingId(o.id);
    } else {
      resetDraft();
    }
  };

  // Print Final KOT — full verification print of every item on the bill.
  const handlePrintFinalKot = () => {
    const o = saveDraft("confirmed", false);
    if (!o) return;
    const finalRecord = {
      id: Store.uid("kot"),
      ts: Date.now(),
      kind: "final" as const,
      itemIds: o.items.map((i) => i.id),
      waiterId: user?.id,
      waiterName: user?.name,
    };
    Store.updateOrder(o.id, { kotHistory: [...(o.kotHistory ?? []), finalRecord] });
    printFinalKot(o, settings);
    toast.push(`Final KOT printed for ${o.billNumber}`, "success");
  };

  // Reprint the most recent Additional KOT for the active order.
  const handleReprintLastAdditional = () => {
    const orderId = editingId || (tableId ? Store.findActiveOrderForTable(tableId)?.id : null);
    if (!orderId) {
      toast.push("No active order to reprint.", "error");
      return;
    }
    const o = orders.find((x) => x.id === orderId);
    if (!o) return;
    const lastAdditional = [...(o.kotHistory ?? [])].reverse().find((k) => k.kind === "additional");
    if (!lastAdditional) {
      toast.push("No additional KOT to reprint yet.", "info");
      return;
    }
    const subset = o.items.filter((i) => lastAdditional.itemIds.includes(i.id));
    if (subset.length === 0) {
      toast.push("Additional KOT items no longer in this order.", "error");
      return;
    }
    printAdditionalKot(o, subset, settings);
    toast.push(`Reprinted last Additional KOT for ${o.billNumber}`, "success");
  };




  // "Generate Bill & Print" — save the bill at status="billed" and
  // print the customer-facing invoice.
  const handleGenerateBill = () => {
    const o = saveDraft("billed", true);
    if (!o) return;
    if (settings.autoPrintBill !== false) printBill(o, settings, "bill");
    toast.push(`Bill ${o.billNumber} generated`, "success");
    setBillModal(true);
    setReprintOrder(o);
  };

  // "Save" — create / update the order with status="confirmed" so it
  // appears in the Orders tab as an actionable Confirmed / Open order
  // (per spec rule #2). Re-pressing Save updates the same order
  // document — no duplicates are created.
  // Save — when the cart was hydrated from an existing busy-table order
  // and the user added new items, we automatically fire an Additional KOT
  // (per spec: "When new items are saved: Automatically generate a NEW
  // KOT" with only the newly added items). Otherwise behaves as a plain
  // save with no print side-effect.
  const handleSaveOnly = () => {
    const newItems = draft.filter((d) => d.kotPrinted !== true);
    const hasPrinted = draft.some(isKotPrinted);
    const activeExistingOrder =
      editingId ? orders.find((o) => o.id === editingId) : tableId ? Store.findActiveOrderForTable(tableId) : undefined;
    const isAdditional = (hasPrinted || !!activeExistingOrder) && newItems.length > 0;

    if (isAdditional) {
      // Delegate to the KOT handler so the print + history + notification
      // path stays in one place. This guarantees Save and KOT behave
      // identically when adding to a busy table.
      handleConfirmAndKOT();
      return;
    }

    const o = saveDraft("confirmed", false);
    if (!o) return;
    toast.push(`Order ${o.billNumber} saved → Confirmed`, "success");
  };

  const editOrder = (o: Order) => {
    setEditingId(o.id);
    setDraft(o.items);
    setOrderType(o.orderType);
    setTableId(o.tableId || "");
    setCustomerName(o.customerName || "");
    setCustomerMobile(o.customerMobile || "");
    setOrderNotes(o.notes || "");
    setDiscountType(o.discountType);
    setDiscountVal(String(o.discountType === "percent" ? Math.round((o.discount / Math.max(1, o.subtotal)) * 100) : o.discount));
    setHistoryOpen(false);
    toast.push(`Editing ${o.billNumber}`, "info");
  };

  const cancelBill = (id: string) => {
    if (!confirm("Cancel this bill? This cannot be undone.")) return;
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    Store.updateOrder(id, { status: "cancelled" });
    if (o.tableId) {
      Store.updateTable(o.tableId, { status: "available", currentOrderId: undefined });
    }
    if (user) {
      Store.addAudit({
        userId: user.id,
        userName: user.name,
        action: "CANCEL_BILL",
        details: `Bill ${o.billNumber} cancelled`,
      });
    }
    toast.push(`Bill ${o.billNumber} cancelled`, "info");
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
    Store.addAudit({ userId: user.id, userName: user.name, action: "PAYMENT", details: `${o.billNumber} paid in cash • ${inr(o.grandTotal)}` });
    toast.push(`Payment received for ${o.billNumber}`, "success");
    setBillModal(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveOnly();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        if (draft.length) handleGenerateBill();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, tableId, subtotal, grandTotal]);

  const incomingOrders = orders.filter((o) =>
    ["open", "confirmed", "preparing"].includes(o.status) && o.source !== "pos"
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
      {/* LEFT: Menu */}
      <div className="lg:col-span-8 xl:col-span-8 flex flex-col lg:flex-row gap-4 min-w-0">
        <MenuCategorySidebar
          categories={categories}
          items={items}
          selectedCategory={activeCat}
          onSelect={(id) => { setActiveCat(id); setSearch(""); }}
        />
        <div className="flex-1 min-w-0 space-y-4">
        <ActiveMenuBanner />
        {/* Incoming orders alert */}
        {incomingOrders.length > 0 && (
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="panel p-4 border-l-4 border-l-gold-500 bg-gradient-to-r from-gold-50 to-transparent dark:from-gold-500/10 flex items-start gap-3"
          >
            <div className="h-10 w-10 rounded-full bg-gold-500 text-white flex items-center justify-center animate-pulse-gold">
              <Bell className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">New Order{incomingOrders.length > 1 ? "s" : ""} Received</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {incomingOrders.length} pending order(s) from{" "}
                {Array.from(new Set(incomingOrders.map((o) => o.source))).join(" & ").toUpperCase()}
              </p>
            </div>
            <Button size="sm" variant="primary" onClick={() => setHistoryOpen(true)}>
              View
            </Button>
          </motion.div>
        )}

        {/* Search */}
        <Card className="!p-3">
          <Input
            value={search}
            onChange={setSearch}
            placeholder="Search menu items…"
            prefix={<Search className="h-4 w-4" />}
          />
        </Card>

        {/* Items */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {visibleItems.map((it) => (
            <motion.button
              key={it.id}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => addItem(it)}
              className="menu-card text-left relative"
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1 h-3 w-3 rounded-sm border-2 ${it.veg ? "border-emerald-600" : "border-rose-600"} flex items-center justify-center`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${it.veg ? "bg-emerald-600" : "bg-rose-600"}`} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight break-words">{it.name}</p>
                  <p className="text-gold-600 dark:text-gold-400 font-bold text-sm mt-1">{inr(it.price)}</p>
                </div>
                <Plus className="h-4 w-4 text-gold-500 opacity-60 group-hover:opacity-100" />
              </div>
            </motion.button>
          ))}
          {visibleItems.length === 0 && (
            <div className="col-span-full">
              <Empty message="No items match your search" />
            </div>
          )}
        </div>
        </div>
      </div>

      {/* RIGHT: Cart */}
      <div className="lg:col-span-4 xl:col-span-4 space-y-4">
        <Card className="sticky top-20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-gold-500" />
                {editingId ? "Edit Bill" : "New Bill"}
              </h3>
              <p className="text-xs text-neutral-500">
                {editingId ? "Editing existing bill" : "Cash only • Print KOT & Bill"}
              </p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} title="Bill History">
                <History className="h-4 w-4" />
              </Button>
              {editingId && (
                <Button size="sm" variant="ghost" onClick={resetDraft} title="Cancel Edit">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Order Type */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {(["dine_in", "takeaway", "delivery"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={`px-2 py-2 rounded-lg text-xs font-semibold transition ${
                  orderType === t
                    ? "bg-gold-gradient text-white"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                }`}
              >
                {t.replace("_", " ").toUpperCase()}
              </button>
            ))}
          </div>

          {orderType === "dine_in" && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <label className="block">
                <span className="block mb-1 text-xs font-medium">Table</span>
                <select
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                >
                  <option value="">Select table…</option>
                  {/* Single source of truth: Store.buildTableOptions applies the
                      same filter + label rules as the Waiter and Tables
                      screens so the POS and Waiter dropdowns ALWAYS match. */}
                  {Store.buildTableOptions().map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <Input label="Customer Mobile" value={customerMobile} onChange={setCustomerMobile} placeholder="Optional" />
              <Input label="Customer Name" value={customerName} onChange={setCustomerName} placeholder="Optional" className="col-span-2" />
            </div>
          )}
          {orderType === "takeaway" && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <Input label="Customer Name" value={customerName} onChange={setCustomerName} />
              <Input label="Customer Mobile" value={customerMobile} onChange={setCustomerMobile} />
            </div>
          )}
          {orderType === "delivery" && (
            <div className="grid grid-cols-1 gap-2 mb-3">
              <Input label="Customer Name" value={customerName} onChange={setCustomerName} />
              <Input label="Customer Mobile" value={customerMobile} onChange={setCustomerMobile} />
              <label className="block">
                <span className="block mb-1 text-xs font-medium">Delivery Address</span>
                <textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                  rows={2}
                />
              </label>
            </div>
          )}

          {/* Cart Items */}
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
            {draft.length === 0 ? (
              <div className="p-6 text-center text-sm text-neutral-500">
                Cart is empty. Click menu items to add.
              </div>
            ) : (
              <ul className="max-h-72 overflow-y-auto divide-y divide-neutral-200 dark:divide-neutral-800">
                {draft.map((d) => (
                  <li key={d.id} className="p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{d.name}</p>
                        <p className="text-xs text-neutral-500">{inr(d.price)} × {d.quantity} = <b>{inr(d.price * d.quantity)}</b></p>
                        <input
                          placeholder="Add note (e.g. less spicy)…"
                          value={d.notes || ""}
                          onChange={(e) => editNote(d.id, e.target.value)}
                          className="mt-1 w-full text-xs bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1 border border-transparent focus:border-gold-500 outline-none"
                        />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <button onClick={() => decQty(d.id)} className="h-6 w-6 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold">{d.quantity}</span>
                          <button onClick={() => incQty(d.id)} className="h-6 w-6 rounded bg-gold-gradient text-white flex items-center justify-center">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <button onClick={() => removeItem(d.id)} className="text-rose-500 hover:text-rose-600 p-1">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Discount */}
          {draft.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Input
                  value={discountVal}
                  onChange={setDiscountVal}
                  type="number"
                  label="Discount"
                  prefix={discountType === "flat" ? <Tag className="h-3 w-3" /> : <Percent className="h-3 w-3" />}
                />
              </div>
              <div>
                <span className="block mb-1 text-xs font-medium">Type</span>
                <div className="flex">
                  <button
                    onClick={() => setDiscountType("flat")}
                    className={`flex-1 px-2 py-2 text-xs rounded-l-lg ${
                      discountType === "flat"
                        ? "bg-gold-gradient text-white"
                        : "bg-neutral-100 dark:bg-neutral-800"
                    }`}
                  >
                    ₹
                  </button>
                  <button
                    onClick={() => setDiscountType("percent")}
                    className={`flex-1 px-2 py-2 text-xs rounded-r-lg ${
                      discountType === "percent"
                        ? "bg-gold-gradient text-white"
                        : "bg-neutral-100 dark:bg-neutral-800"
                    }`}
                  >
                    %
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Totals */}
          {draft.length > 0 && (
            <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Subtotal</span>
                <span className="font-medium">{inr(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Discount</span>
                  <span>-{inr(discountAmount)}</span>
                </div>
              )}
              {settings.gstEnabled && gstPercent > 0 && (
                <>
                  <div className="flex justify-between text-xs text-neutral-500">
                    <span>CGST ({gstPercent / 2}%)</span>
                    <span>{inr(cgst)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-neutral-500">
                    <span>SGST ({gstPercent / 2}%)</span>
                    <span>{inr(sgst)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-dashed border-neutral-300 dark:border-neutral-700">
                <span className="font-bold">Grand Total</span>
                <span className="text-xl font-bold text-gold-600 dark:text-gold-400">{inr(grandTotal)}</span>
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 text-center mt-1">
                💵 Payment: CASH ONLY
              </p>
            </div>
          )}

          {/* Actions */}
          {draft.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleSaveOnly} size="sm">
                <Save className="h-4 w-4" /> Save
              </Button>
              <Button variant="secondary" onClick={handleConfirmAndKOT} size="sm">
                <Printer className="h-4 w-4" /> KOT
              </Button>
              {(editingId || draft.some(isKotPrinted)) && (
                <>
                  <Button variant="outline" onClick={handlePrintFinalKot} size="sm">
                    <Printer className="h-4 w-4" /> Final KOT
                  </Button>
                  <Button variant="outline" onClick={handleReprintLastAdditional} size="sm">
                    <Printer className="h-4 w-4" /> Reprint Last KOT
                  </Button>
                </>
              )}
              <Button variant="primary" onClick={handleGenerateBill} size="sm" className="col-span-2">
                <ReceiptIcon className="h-4 w-4" /> Generate Bill & Print
              </Button>
            </div>
          )}

        </Card>
      </div>

      {/* Bill History Modal */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Bill History" size="xl">
        <div className="space-y-3">
          <p className="text-sm text-neutral-500">Search, edit, reprint or cancel bills.</p>
          <BillHistoryList onEdit={editOrder} onCancel={cancelBill} onReprint={(o) => { printBill(o, settings, "reprint"); toast.push(`Reprinted ${o.billNumber}`, "success"); }} />
        </div>
      </Modal>

      {/* Reprint & Pay modal after generating */}
      <Modal open={billModal} onClose={() => setBillModal(false)} title="Bill Generated" size="md">
        {reprintOrder && (
          <div className="space-y-3">
            <div className="text-center py-4">
              <p className="text-sm text-neutral-500">Bill Number</p>
              <p className="text-2xl font-bold font-mono">{reprintOrder.billNumber}</p>
              <p className="text-3xl font-bold text-gold-600 mt-2">{inr(reprintOrder.grandTotal)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => printBill(reprintOrder, settings, "reprint")}>
                <Printer className="h-4 w-4" /> Reprint
              </Button>
              <Button variant="primary" onClick={() => markPaid(reprintOrder)}>
                💵 Mark Paid (Cash)
              </Button>
            </div>
            <Button variant="ghost" onClick={() => { setBillModal(false); resetDraft(); }} className="w-full">
              Close
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function BillHistoryList({
  onEdit,
  onCancel,
  onReprint,
}: {
  onEdit: (o: Order) => void;
  onCancel: (id: string) => void;
  onReprint: (o: Order) => void;
}) {
  const orders = useStore("orders", Store.listOrders);
  const [q, setQ] = useState("");
  const filtered = orders.filter(
    (o) =>
      !q ||
      o.billNumber.toLowerCase().includes(q.toLowerCase()) ||
      o.customerName?.toLowerCase().includes(q.toLowerCase()) ||
      o.customerMobile?.includes(q)
  );
  if (filtered.length === 0) return <Empty message="No bills yet" />;
  return (
    <div className="space-y-2">
      <Input value={q} onChange={setQ} placeholder="Search by bill #, customer, mobile…" prefix={<Search className="h-4 w-4" />} />
      <div className="max-h-96 overflow-y-auto space-y-2">
        {filtered.slice(0, 80).map((o) => (
          <div key={o.id} className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-semibold">{o.billNumber}</span>
                <Badge
                  tone={
                    o.status === "paid"
                      ? "success"
                      : o.status === "cancelled"
                      ? "danger"
                      : o.status === "billed"
                      ? "info"
                      : "warning"
                  }
                >
                  {o.status}
                </Badge>
                <Badge tone="gold">{o.source}</Badge>
                <Badge>{o.orderType.replace("_", " ")}</Badge>
                {o.tableNumber && <Badge>T{o.tableNumber}</Badge>}
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                {new Date(o.createdAt).toLocaleString()} • {o.items.length} items • {o.customerName || "Walk-in"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold text-gold-600 dark:text-gold-400">{inr(o.grandTotal)}</p>
              <div className="flex gap-1 mt-1">
                <button onClick={() => onReprint(o)} title="Reprint" className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <Printer className="h-3.5 w-3.5" />
                </button>
                {o.status !== "paid" && o.status !== "cancelled" && (
                  <>
                    <button onClick={() => onEdit(o)} title="Edit" className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800">
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => onCancel(o.id)} title="Cancel" className="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
