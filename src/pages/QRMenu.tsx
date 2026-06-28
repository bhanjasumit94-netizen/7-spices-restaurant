import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Search,
  Hash,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Card, Button, Input, Modal } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore, isCollectionLoaded } from "../lib/store";
import { OrderItem } from "../lib/types";
import { inr } from "../lib/money";
import { Logo } from "../components/Logo";
import { cn } from "../utils/cn";
import { resolveToken } from "../lib/qrTokens";
import { ActiveMenuBanner } from "../components/ActiveMenuBanner";
import { Loading } from "../components/Loading";
import { MenuCategorySidebar } from "../components/MenuCategorySidebar";


type Stage = "menu" | "review" | "placed";

export default function QRMenu() {
  const tables = useStore("tables", Store.listTables);
  const categories = useStore("cats", Store.listCategories);
  const items = useStore("items", Store.listItems);
  const settings = useStore("settings", Store.getSettings);
  const toast = useToast();
  const { token } = useParams<{ token?: string }>();

  // Wait for the first Firestore snapshot of `tables` before deciding the
  // token is invalid — otherwise an empty-cache first paint would briefly
  // flash "Invalid QR" before the real data arrives.
  const tablesLoaded = useStore("tables", () => isCollectionLoaded("spices_tables")) ||
    tables.length > 0;
  const tableId = useMemo(
    () => (tablesLoaded ? resolveToken(token) : null),
    [token, tables, tablesLoaded]
  );
  const table = useMemo(() => tables.find((t) => t.id === tableId), [tables, tableId]);
  const isLoading = !!token && !tablesLoaded;
  const invalid = !!token && tablesLoaded && !tableId;


  // Debug logs required by the spec.
  // eslint-disable-next-line no-console
  console.log("QR Route Loaded");
  // eslint-disable-next-line no-console
  console.log("Token:", token);
  // eslint-disable-next-line no-console
  console.log("[QR] Token received:", token ?? "(none)");
  // eslint-disable-next-line no-console
  console.log(
    "[QR] Table found:",
    tableId ? `YES (Table ${table?.number})` : "NO"
  );
  // eslint-disable-next-line no-console
  console.log(
    "[QR] Menu items loaded:",
    items.length,
    "categories:",
    categories.length
  );
  // eslint-disable-next-line no-console
  console.log("[QR] Resolved", { token: token ?? "(none)", tableId: tableId ?? null, invalid });

  const [customerName, setCustomerName] = useState("");
  const [activeCat, setActiveCat] = useState<string>("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<OrderItem[]>([]);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placed, setPlaced] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("menu");

  // Pick the first category once data arrives
  useEffect(() => {
    if (!activeCat && categories.length) setActiveCat(categories[0].id);
  }, [categories, activeCat]);

  // If the token is invalid, don't proceed to any UI that implies a table.
  useEffect(() => {
    if (invalid) {
      // eslint-disable-next-line no-console
      console.warn("[QR] Invalid or expired token", { token });
    }
  }, [invalid, token]);

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
      if (existing)
        return p.map((d) => (d.menuItemId === it.id ? { ...d, quantity: d.quantity + 1 } : d));
      return [
        ...p,
        { id: Store.uid("oi"), menuItemId: it.id, name: it.name, price: it.price, quantity: 1, source: "qr" },
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

  const total = draft.reduce((s, i) => s + i.price * i.quantity, 0);
  const itemCount = draft.reduce((s, i) => s + i.quantity, 0);

  const placeOrder = () => {
    if (!tableId) {
      toast.push("Table information missing. Please re-scan your QR code.", "error");
      return;
    }
    if (draft.length === 0) {
      toast.push("Please add at least one item", "error");
      return;
    }
    const billNumber = Store.getNextBillNumber();
    const order = {
      id: Store.uid("ord"),
      billNumber,
      tableId,
      tableNumber: table?.number,
      customerName: customerName || undefined,
      source: "qr" as const,
      orderType: "dine_in" as const,
      items: draft,
      subtotal: total,
      discount: 0,
      discountType: "flat" as const,
      gstPercent: 0,
      cgst: 0,
      sgst: 0,
      grandTotal: total,
      notes: notes || undefined,
      status: "pending_print" as const,
      kotPrinted: false,
      billPrinted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    Store.addOrder(order);
    Store.updateTable(tableId, { status: "occupied", currentOrderId: order.id });
    Store.addNotification({
      type: "new_order",
      orderId: order.id,
      message: `New QR order from ${table ? "T" + table.number : "—"} (${draft.length} items) — needs cashier approval`,
    });
    Store.addAudit({
      userId: "qr-customer",
      userName: customerName || "QR Customer",
      action: "QR_ORDER",
      details: `Bill ${billNumber} • Table ${table?.number} • ${draft.length} items`,
    });
    toast.push("Order placed! Please pay cash at the counter.", "success");
    setPlaced(billNumber);
    setStage("placed");
    setConfirmOpen(false);
    setDraft([]);
    setNotes("");
    setCustomerName("");
  };

  // ─── Loading state — wait for Firestore tables snapshot ──────────────
  if (isLoading) {
    return <Loading label="Loading menu…" />;
  }

  // ─── Invalid QR screen ────────────────────────────────────────────────
  if (invalid) {

    return (
      <div className="min-h-screen bg-premium -m-4 lg:-m-6 p-4 lg:p-6 flex items-center justify-center">
        <Card className="max-w-md w-full text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-rose-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Invalid QR Code</h2>
          <p className="text-sm text-neutral-500 mb-1">
            The QR code you scanned is invalid or has expired.
          </p>
          <p className="text-xs text-neutral-500 mb-6">
            Please ask a staff member to regenerate the QR for your table.
          </p>
          <div className="grid grid-cols-1 gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Order placed success screen ──────────────────────────────────────
  if (stage === "placed" && placed) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Card className="text-center max-w-md">
          <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-500/20 mx-auto flex items-center justify-center mb-4">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </motion.div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Your order has been placed successfully.</h2>
          <p className="text-neutral-500 mb-1">Your bill number is</p>
          <p className="text-3xl font-bold font-mono text-gold-600 mb-4">{placed}</p>
          <p className="text-sm text-neutral-500 mb-4">
            Your order has been sent to the kitchen. Please pay at the counter in cash when ready.
          </p>
          <Button onClick={() => { setPlaced(null); setStage("menu"); }} variant="primary">
            Place Another Order
          </Button>
        </Card>
      </div>
    );
  }

  // ─── No token in URL at all — show a helpful landing screen ───────────
  if (!token) {
    return (
      <div className="min-h-screen bg-premium -m-4 lg:-m-6 p-4 lg:p-6 flex items-center justify-center">
        <Card className="max-w-md w-full text-center">
          <div className="flex flex-col items-center gap-3 mb-4">
            <Logo size="lg" />
            <p className="text-sm text-neutral-500">
              Welcome! Please scan the QR code on your table to view the menu.
            </p>
          </div>
          <p className="text-xs text-neutral-500">
            Each table has a unique QR code. After scanning you'll be able to
            browse the menu and place an order directly from your phone.
          </p>
        </Card>
      </div>
    );
  }

  // ─── Main menu screen ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-premium -m-4 lg:-m-6 p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-2">
          <Logo size="lg" />
          <p className="text-xs text-neutral-500">{settings.name} • Scan. Order. Enjoy.</p>
        </div>

        <ActiveMenuBanner />

        {/* Table info card — shows the resolved table (NO selector) */}
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gold-gradient text-white flex items-center justify-center font-extrabold text-lg">
                T{table?.number}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-neutral-500">You are at</p>
                <p className="font-semibold text-lg">Table {table?.number}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-full font-semibold">
              <CheckCircle2 className="h-4 w-4" /> Verified QR
            </div>
          </div>

          {/* Optional customer name (informational only) */}
          <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <Input
              label="Your name (optional)"
              value={customerName}
              onChange={setCustomerName}
              placeholder="e.g. Mr. Sharma"
            />
          </div>
        </Card>

        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <MenuCategorySidebar
            categories={categories}
            items={items}
            selectedCategory={activeCat}
            onSelect={(id) => { setActiveCat(id); setSearch(""); }}
          />
          <div className="flex-1 min-w-0 w-full space-y-4">
            <Card className="!p-3">
              <Input
                value={search}
                onChange={setSearch}
                placeholder="Search dishes…"
                prefix={<Search className="h-4 w-4" />}
              />
            </Card>

            {/* Menu items */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {visibleItems.map((it) => {
                const inCart = draft.find((d) => d.menuItemId === it.id);
                const qty = inCart?.quantity || 0;
                return (
                  <motion.button
                    key={it.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => addItem(it)}
                    className={cn(
                      "menu-card text-left relative",
                      qty > 0 && "ring-2 ring-gold-400 border-gold-400"
                    )}
                  >
                    {qty > 0 && (
                      <span className="absolute -top-2 -right-2 h-6 min-w-6 px-1.5 rounded-full bg-gold-gradient text-white text-xs font-bold flex items-center justify-center shadow-lg">
                        {qty}
                      </span>
                    )}
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
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                            {it.available ? "Available" : "Out"}
                      </span>
                    </div>
                    <p className="font-semibold text-sm leading-tight line-clamp-2">{it.name}</p>
                    <p className="text-gold-600 dark:text-gold-400 font-bold text-sm mt-1">
                      {inr(it.price)}
                    </p>
                  </div>
                  <Plus className="h-4 w-4 text-gold-500" />
                </div>
              </motion.button>
            );
          })}
          {visibleItems.length === 0 && (
            <p className="col-span-full text-center text-sm text-neutral-500 py-6">
              No items match your search.
            </p>
          )}
        </div>
          </div>
        </div>



        {/* Sticky cart — matches the design with cart icon on the left,
            item count + total in the middle, "Review & Place Order" on the right. */}
        <div className="sticky bottom-4 z-20">
          <Card className="!p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-11 w-11 shrink-0 rounded-full bg-gold-gradient text-white flex items-center justify-center shadow-md">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {itemCount} {itemCount === 1 ? "item" : "items"}
                  </p>
                  <p className="font-bold text-lg leading-tight">{inr(total)}</p>
                </div>
              </div>
              <Button
                variant="primary"
                size="lg"
                onClick={() => setConfirmOpen(true)}
                disabled={draft.length === 0}
                className="shrink-0"
              >
                Review &amp; Place Order
              </Button>
            </div>
          </Card>
        </div>

        {/* Review modal */}
        <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Your Order" size="lg">
          <div className="space-y-3">
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {draft.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-2 border border-neutral-200 dark:border-neutral-800 rounded-lg p-2"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{d.name}</p>
                    <p className="text-xs text-neutral-500">{inr(d.price)} each</p>
                    <input
                      placeholder="Note (e.g. less spicy)"
                      value={d.notes || ""}
                      onChange={(e) => editNote(d.id, e.target.value)}
                      className="mt-1 w-full text-xs bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1">
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
                    <button
                      onClick={() => removeItem(d.id)}
                      className="text-rose-500 p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <label className="block">
              <span className="block mb-1 text-xs font-medium">Additional Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-between items-center pt-2 border-t border-dashed">
              <span className="font-bold">Total</span>
              <span className="text-2xl font-bold text-gold-600">{inr(total)}</span>
            </div>
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3 text-sm">
              💵 Payment Method: <b>Cash only</b> — please pay at the counter when the bill is generated.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Back
              </Button>
              <Button variant="primary" onClick={placeOrder}>
                <Hash className="h-4 w-4" /> Place Order
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
