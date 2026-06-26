import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Minus,
  Trash2,
  ChefHat,
  Send,
  Save,
  Check,
  Search,
  X,
  Printer,
  Bell,
  ShoppingCart,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Card, Button, Input, Select, Modal, Badge, Empty } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore } from "../lib/store";
import { useAuth } from "../lib/auth";
import { Order, OrderItem } from "../lib/types";
import { inr } from "../lib/money";
import { printBill } from "../lib/printer";
import { cn } from "../utils/cn";
import { useNavigate } from "react-router-dom";

type Stage = "composing" | "confirm_send" | "after_send";

export default function Waiter() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const settings = useStore("settings", Store.getSettings);
  const categories = useStore("cats", Store.listCategories);
  const items = useStore("items", Store.listItems);
  const tables = useStore("tables", Store.listTables);
  const orders = useStore("orders", Store.listOrders);

  // DEBUG: log the table count whenever the Waiter tables list changes.
  // POS and Waiter read the same localStorage key, so their counts
  // must match exactly. If they don't, the missing list below helps
  // identify the divergence.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("Waiter Tables Count:", tables.length);
    // eslint-disable-next-line no-console
    console.log(
      "Waiter Tables:",
      tables.map((t) => `T${t.number}${t.sectionLabel ?? ""}`).join(", ")
    );
    // eslint-disable-next-line no-console
    console.log(
      "Waiter Dropdown Options:",
      Store.buildTableOptions().map((o) => o.label).join(", ")
    );
    // Cross-check against POS: list any tables that exist in the
    // store but somehow didn't make it into the dropdown.
    const dropdownIds = new Set(
      Store.buildTableOptions().map((o) => o.value)
    );
    const missing = tables.filter((t) => !dropdownIds.has(t.id));
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.warn("Missing Tables:", missing.map((t) => t.id).join(", "));
    }
  }, [tables]);

  const [activeCat, setActiveCat] = useState<string>("");
  const [search, setSearch] = useState("");
  const [tableId, setTableId] = useState<string>("");
  const [draft, setDraft] = useState<OrderItem[]>([]);
  const [notes, setNotes] = useState("");
  const [stage, setStage] = useState<Stage>("composing");
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
  // Mobile bottom-sheet state for the Current Order panel.
  const [cartOpen, setCartOpen] = useState(false);

  // When a table is selected and it already has an ACTIVE (non-archived)
  // order, we surface it as `activeOrder`. The waiter can then add more
  // items to the same bill — the existing order document is updated,
  // not duplicated. The live `orders` listener keeps `activeOrder` fresh
  // the moment the table status changes (e.g. a payment fires from
  // the Orders page and the table is freed).
  const activeOrder = useMemo(() => {
    if (!tableId) return null;
    return (
      orders
        .filter(
          (o) =>
            o.tableId === tableId &&
            !["paid", "cancelled", "completed"].includes(o.status)
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
    );
  }, [orders, tableId]);

  // When the waiter opens an occupied table, we pre-fill the draft with
  // the existing items + notes so they can keep editing without retyping.
  const [autoLoadedFor, setAutoLoadedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!activeOrder) return;
    if (autoLoadedFor === activeOrder.id) return;
    if (draft.length > 0) return; // don't clobber a draft the user is composing
    setDraft(activeOrder.items);
    setNotes(activeOrder.notes ?? "");
    setAutoLoadedFor(activeOrder.id);
    toast.push(
      `Loaded existing order ${activeOrder.billNumber} — add more items`,
      "info"
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrder?.id]);

  // Auto-open the cart sheet on desktop so the existing right-rail layout
  // is unaffected but mobile users can drive everything from one tap.
  // (We don't auto-open by default; cart opens only when the user taps
  // "View Cart".)

  const visibleItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((it) => {
      if (!it.available) return false;
      if (q) return it.name.toLowerCase().includes(q);
      return activeCat ? it.categoryId === activeCat : true;
    });
  }, [items, activeCat, search]);

  const addItem = (it: { id: string; name: string; price: number }) => {
    setDraft((p) => {
      const existing = p.find((d) => d.menuItemId === it.id);
      if (existing) return p.map((d) => (d.menuItemId === it.id ? { ...d, quantity: d.quantity + 1 } : d));
      return [
        ...p,
        { id: Store.uid("oi"), menuItemId: it.id, name: it.name, price: it.price, quantity: 1, source: "waiter" },
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
  const editNote = (id: string, n: string) =>
    setDraft((p) => p.map((d) => (d.id === id ? { ...d, notes: n } : d)));

  const total = useMemo(
    () => draft.reduce((s, i) => s + i.price * i.quantity, 0),
    [draft]
  );

  const validate = (requireTable = true) => {
    if (draft.length === 0) {
      toast.push("Add items first", "error");
      return false;
    }
    if (requireTable && settings.waiterMode && !tableId) {
      toast.push("Please select a table", "error");
      return false;
    }
    return true;
  };

  // ─── Helpers used by the three action buttons below ──────────────────
  // When the selected table already has an active order, every action
  // (Save / Print KOT / Save Without Print) updates the SAME order
  // document via Store.appendItemsToOrder. We never duplicate an order
  // and we never reset the existing bill number.
  const upsertItems = (
    nextStatus: "draft" | "confirmed" | "pending_print",
    auditAction: string
  ): Order | null => {
    if (!tableId) {
      toast.push("Please select a table", "error");
      return null;
    }
    if (draft.length === 0) {
      toast.push("Add items first", "error");
      return null;
    }
    const table = tables.find((t) => t.id === tableId);
    const billNumber = activeOrder?.billNumber ?? Store.getNextBillNumber();

    // Build a fresh OrderItem list for the new portion (with timestamps).
    const now = Date.now();
    const newItems: OrderItem[] = draft.map((d) => ({
      ...d,
      id: d.id || Store.uid("oi"),
      source: "waiter" as const,
      addedAt: now,
    }));

    // Two paths: append to the active order, or create a brand new one.
    // The bill number is reused when appending so the customer keeps the
    // same bill reference.
    let resultOrder: Order;
    if (activeOrder) {
      // APPEND to the existing order document — never create a new one.
      const updated = Store.appendItemsToOrder(activeOrder.id, newItems);
      if (!updated) {
        toast.push("Could not update the existing order", "error");
        return null;
      }
      // Promote status to the chosen workflow state if the existing one
      // is earlier in the lifecycle.
      if (
        nextStatus === "confirmed" &&
        ["draft", "pending_print", "saved"].includes(updated.status)
      ) {
        Store.updateOrder(updated.id, { status: "confirmed", updatedAt: now });
      } else if (
        nextStatus === "pending_print" &&
        ["draft", "saved"].includes(updated.status)
      ) {
        Store.updateOrder(updated.id, { status: "pending_print", updatedAt: now });
      }
      resultOrder = { ...updated, status: nextStatus };
      toast.push(
        `Items added to existing order ${updated.billNumber}`,
        "success"
      );
    } else {
      // No active order — create a brand new one.
      resultOrder = {
        id: Store.uid("ord"),
        billNumber,
        tableId: tableId || undefined,
        tableNumber: table?.number,
        customerName: undefined,
        customerMobile: undefined,
        waiterId: user?.id,
        waiterName: user?.name,
        source: "waiter" as const,
        orderType: "dine_in" as const,
        items: newItems,
        subtotal: newItems.reduce((s, i) => s + i.price * i.quantity, 0),
        discount: 0,
        discountType: "flat" as const,
        gstPercent: 0,
        cgst: 0,
        sgst: 0,
        grandTotal: newItems.reduce((s, i) => s + i.price * i.quantity, 0),
        notes: notes || undefined,
        status: nextStatus,
        kotPrinted: nextStatus === "confirmed",
        billPrinted: false,
        createdAt: now,
        updatedAt: now,
      };
      Store.addOrder(resultOrder);
      toast.push(`Order ${resultOrder.billNumber} saved (${nextStatus})`, "success");
    }

    // Book the table — it's now occupied (or was already).
    Store.updateTable(tableId, {
      status: "occupied",
      currentOrderId: resultOrder.id,
    });

    // Notify the rest of the system.
    if (nextStatus === "draft") {
      Store.addNotification({
        type: "saved_order",
        orderId: resultOrder.id,
        message: `Saved order from Table ${table?.number ?? "—"} (${newItems.length} items)`,
      });
    } else if (nextStatus === "confirmed") {
      Store.addNotification({
        type: "sent_to_kitchen",
        orderId: resultOrder.id,
        message: `Order sent to kitchen - Table ${table?.number ?? "—"} (${resultOrder.billNumber})`,
      });
    } else {
      Store.addNotification({
        type: "pending_print",
        orderId: resultOrder.id,
        message: `Pending print order from Table ${table?.number ?? "—"} (${resultOrder.billNumber})`,
      });
    }
    if (user) {
      Store.addAudit({
        userId: user.id,
        userName: user.name,
        action: auditAction,
        details: `Bill ${resultOrder.billNumber} • Table ${table?.number ?? "—"} • ${newItems.length} items`,
      });
    }
    return resultOrder;
  };

  // SAVE ORDER — saves the draft without printing. Updates the same
  // order document if the table is already occupied.
  const handleSaveOrder = () => {
    if (!validate()) return;
    const order = upsertItems("draft", "WAITER_SAVE_DRAFT");
    if (!order) return;
    resetDraft();
  };

  // SEND TO KITCHEN flow — confirmation popup, then print/save choice.
  const handleSendClick = () => {
    if (!validate()) return;
    setStage("confirm_send");
  };

  const confirmSend = () => {
    setStage("after_send");
  };

  const doPrintKOT = () => {
    const order = upsertItems("confirmed", "WAITER_KOT_PRINT");
    if (!order) return;
    printBill(order, settings, "kot");
    toast.push(`KOT printed for ${order.billNumber}`, "success");
    setSavedOrderId(order.id);
    resetDraft(true);
  };

  const doSaveWithoutPrint = () => {
    const order = upsertItems("pending_print", "WAITER_PENDING_PRINT");
    if (!order) return;
    toast.push(`Saved without printing (${order.billNumber})`, "info");
    setSavedOrderId(order.id);
    resetDraft(true);
  };

  const resetDraft = (keepStage = false) => {
    setDraft([]);
    setNotes("");
    setTableId("");
    if (!keepStage) {
      setStage("composing");
      setSavedOrderId(null);
    }
  };

  const startNewOrder = () => {
    setStage("composing");
    setSavedOrderId(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-7 space-y-4">
        <Card className="!p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-gold-500" />
              <h2 className="font-semibold">Waiter Order Taking</h2>
            </div>
            <Badge tone="gold">Hello, {user?.name}</Badge>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveCat(c.id);
                  setSearch("");
                }}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition",
                  activeCat === c.id ? "bg-gold-gradient text-white" : "bg-neutral-100 dark:bg-neutral-800"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <Input
              value={search}
              onChange={setSearch}
              placeholder="Search…"
              prefix={<Search className="h-4 w-4" />}
            />
          </div>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {visibleItems.map((it) => (
            <motion.button
              key={it.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => addItem(it)}
              className="menu-card text-left"
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1 h-3 w-3 rounded-sm border-2 ${
                    it.veg ? "border-emerald-600" : "border-rose-600"
                  } flex items-center justify-center`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      it.veg ? "bg-emerald-600" : "bg-rose-600"
                    }`}
                  />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight line-clamp-2">{it.name}</p>
                  <p className="text-gold-600 dark:text-gold-400 font-bold text-sm mt-1">{inr(it.price)}</p>
                </div>
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

      <div className="lg:col-span-5">
        <Card className="sticky top-20 space-y-3">
          <h3 className="font-semibold">Current Order</h3>
          <Select
            label="Table"
            value={tableId}
            onChange={(v) => {
              setTableId(v);
              setAutoLoadedFor(null); // re-trigger auto-load when the table changes
            }}
            options={[
              { value: "", label: "Select table…" },
              // Single source of truth — same helper used by Billing/POS.
              ...Store.buildTableOptions(),
            ]}
          />
          {activeOrder && (
            <div className="flex items-center gap-2 rounded-lg border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200 text-xs font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="truncate">
                Table Occupied • Existing Order{" "}
                <span className="font-mono text-amber-900 dark:text-amber-100">
                  #{activeOrder.billNumber}
                </span>
                {" "}— {activeOrder.items.length} item
                {activeOrder.items.length === 1 ? "" : "s"} • Add more
                items below
              </span>
            </div>
          )}
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
            {draft.length === 0 ? (
              <Empty message="Tap items to add" />
            ) : (
              <ul className="max-h-72 overflow-y-auto divide-y divide-neutral-200 dark:divide-neutral-800">
                {draft.map((d) => (
                  <li key={d.id} className="p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{d.name}</p>
                        <p className="text-xs text-neutral-500">
                          {inr(d.price)} × {d.quantity}
                        </p>
                        <input
                          placeholder="Note…"
                          value={d.notes || ""}
                          onChange={(e) => editNote(d.id, e.target.value)}
                          className="mt-1 w-full text-xs bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1 outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => decQty(d.id)}
                          className="h-6 w-6 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{d.quantity}</span>
                        <button
                          onClick={() => incQty(d.id)}
                          className="h-6 w-6 rounded bg-gold-gradient text-white flex items-center justify-center"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button onClick={() => removeItem(d.id)} className="text-rose-500 p-1">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="block">
            <span className="block mb-1 text-xs font-medium">Order Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
              placeholder="e.g. Less spicy, allergen info…"
            />
          </label>
          <div className="flex justify-between items-center pt-2 border-t border-dashed">
            <span className="font-bold">Total</span>
            <span className="text-xl font-bold text-gold-600">{inr(total)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleSaveOrder} disabled={draft.length === 0}>
              <Save className="h-4 w-4" /> Save Order
            </Button>
            <Button variant="primary" onClick={handleSendClick} disabled={draft.length === 0}>
              <Send className="h-4 w-4" /> Send to Kitchen
            </Button>
          </div>
        </Card>
      </div>

      {/* STEP 1 — Confirm sending */}
      <Modal open={stage === "confirm_send"} onClose={() => setStage("composing")} title="Send order to kitchen?" size="sm">
        <p className="text-sm">
          Send {draft.length} items for Table {tables.find((t) => t.id === tableId)?.number ?? "—"} to the kitchen?
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setStage("composing")}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button variant="primary" onClick={confirmSend}>
            <Check className="h-4 w-4" /> Confirm
          </Button>
        </div>
      </Modal>

      {/* STEP 2 — Print or save */}
      <Modal open={stage === "after_send"} onClose={() => setStage("composing")} title="What would you like to do?" size="sm">
        <p className="text-sm mb-4">Choose how to handle this order:</p>
        <div className="space-y-2">
          <Button variant="primary" className="w-full" onClick={doPrintKOT}>
            <Printer className="h-4 w-4" /> Print KOT
          </Button>
          <Button variant="outline" className="w-full" onClick={doSaveWithoutPrint}>
            <Save className="h-4 w-4" /> Save Without Printing
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setStage("composing")}>
            Back
          </Button>
        </div>
      </Modal>

      {/* Success — go to orders */}
      <Modal
        open={!!savedOrderId}
        onClose={() => {
          setSavedOrderId(null);
          setStage("composing");
        }}
        title="Order Submitted"
        size="sm"
      >
        <div className="text-center space-y-3">
          <div className="h-14 w-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <p className="text-sm">Order has been processed successfully.</p>
          <div className="grid grid-cols-1 gap-2 pt-2">
            <Button variant="primary" onClick={() => navigate("/orders")}>
              <Bell className="h-4 w-4" /> View in Orders
            </Button>
            <Button variant="outline" onClick={startNewOrder}>
              New Order
            </Button>
          </div>
        </div>
      </Modal>

      {/* ───── MOBILE-ONLY FLOATING ORDER SUMMARY ─────
          Sticks to the bottom of the viewport on small screens. Tapping
          "View Cart" opens the same Current Order panel as a bottom sheet
          with Save / Send buttons pinned at the bottom (no scrolling). */}
      {draft.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30 lg:hidden border-t border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950/95 backdrop-blur shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.25)]"
        >
          <div className="mx-auto max-w-3xl px-3 py-2.5 flex items-center justify-between gap-3">
            <button
              onClick={() => setCartOpen(true)}
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left active:scale-[0.98] transition"
              aria-label="View cart"
            >
              <span className="relative h-11 w-11 shrink-0 rounded-full bg-gold-gradient text-white flex items-center justify-center shadow-md">
                <ShoppingCart className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-extrabold flex items-center justify-center ring-2 ring-white dark:ring-neutral-950">
                  {draft.reduce((s, d) => s + d.quantity, 0)}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-semibold">
                  {draft.reduce((s, d) => s + d.quantity, 0)} items
                </span>
                <span className="block font-bold text-lg leading-tight truncate">
                  {inr(total)}
                </span>
              </span>
            </button>
            <Button
              variant="primary"
              size="md"
              onClick={() => setCartOpen(true)}
              className="shrink-0"
            >
              View Cart
            </Button>
          </div>
        </div>
      )}

      {/* Bottom sheet cart — only used on mobile. Save Order and Send to
          Kitchen are pinned at the bottom (no scrolling required). */}
      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="Current Order"
        size="lg"
      >
        <div className="space-y-3">
          <Select
            label="Table"
            value={tableId}
            onChange={(v) => setTableId(v)}
            options={[
              { value: "", label: "Select table…" },
              // Single source of truth — same helper used by Billing/POS.
              ...Store.buildTableOptions(),
            ]}
           />
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
            {draft.length === 0 ? (
              activeOrder ? (
                <div className="p-4 text-center">
                  <CheckCircle2 className="h-7 w-7 mx-auto text-emerald-500 mb-1" />
                  <p className="text-sm font-semibold">
                    Existing order loaded — add more items
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Tap any menu item on the left to add it to the same bill
                    (#{activeOrder.billNumber}).
                  </p>
                </div>
              ) : (
                <Empty message="Tap items to add" />
              )
            ) : (
              <ul className="max-h-72 overflow-y-auto divide-y divide-neutral-200 dark:divide-neutral-800">
                {draft.map((d) => (
                  <li key={d.id} className="p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{d.name}</p>
                        <p className="text-xs text-neutral-500">
                          {inr(d.price)} × {d.quantity}
                        </p>
                        <input
                          placeholder="Note…"
                          value={d.notes || ""}
                          onChange={(e) => editNote(d.id, e.target.value)}
                          className="mt-1 w-full text-xs bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1 outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => decQty(d.id)}
                          className="h-7 w-7 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center font-semibold">{d.quantity}</span>
                        <button
                          onClick={() => incQty(d.id)}
                          className="h-7 w-7 rounded bg-gold-gradient text-white flex items-center justify-center"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button onClick={() => removeItem(d.id)} className="text-rose-500 p-1">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="block">
            <span className="block mb-1 text-xs font-medium">Order Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
              placeholder="e.g. Less spicy, allergen info…"
            />
          </label>
          <div className="flex justify-between items-center pt-1 border-t border-dashed">
            <span className="font-bold">Total</span>
            <span className="text-xl font-bold text-gold-600">{inr(total)}</span>
          </div>
          {/* Pinned action row — Save Order + Send to Kitchen are always
              visible without scrolling because the modal body has a max
              height and the modal content scrolls independently above. */}
          <div className="grid grid-cols-2 gap-2 pt-2 sticky bottom-0 bg-white dark:bg-neutral-900 -mx-5 px-5 pb-1 border-t border-neutral-200 dark:border-neutral-800 mt-2">
            <Button
              variant="outline"
              onClick={() => { handleSaveOrder(); setCartOpen(false); }}
              disabled={draft.length === 0}
            >
              <Save className="h-4 w-4" /> Save Order
            </Button>
            <Button
              variant="primary"
              onClick={() => { setCartOpen(false); handleSendClick(); }}
              disabled={draft.length === 0}
            >
              <Send className="h-4 w-4" /> Send to Kitchen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
