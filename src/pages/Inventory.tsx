import { useMemo, useState } from "react";
import { Plus, Edit2, Trash2, Search, AlertTriangle, Truck, Package } from "lucide-react";
import { Card, Button, Input, Modal, Badge, Empty, Select, StatCard } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore } from "../lib/store";
import { InventoryItem, Expense } from "../lib/types";
import { inr } from "../lib/money";

export default function Inventory() {
  const inventory = useStore("inv", Store.listInventory);
  const suppliers = useStore("sups", Store.listSuppliers);
  const toast = useToast();

  const [tab, setTab] = useState<"stock" | "suppliers" | "expenses" | "alerts">("stock");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "",
    quantity: "",
    unit: "kg",
    minStock: "",
    purchasePrice: "",
    supplierId: "",
    expiryDate: "",
    notes: "",
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return inventory.filter((i) => !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
  }, [inventory, search]);

  const lowStock = inventory.filter((i) => i.quantity <= i.minStock);
  const expiringSoon = inventory.filter((i) => i.expiryDate && i.expiryDate - Date.now() < 7 * 24 * 60 * 60 * 1000);
  const totalValue = inventory.reduce((s, i) => s + i.quantity * i.purchasePrice, 0);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", category: "", quantity: "", unit: "kg", minStock: "", purchasePrice: "", supplierId: "", expiryDate: "", notes: "" });
    setOpen(true);
  };

  const openEdit = (it: InventoryItem) => {
    setEditing(it);
    setForm({
      name: it.name,
      category: it.category,
      quantity: String(it.quantity),
      unit: it.unit,
      minStock: String(it.minStock),
      purchasePrice: String(it.purchasePrice),
      supplierId: it.supplierId || "",
      expiryDate: it.expiryDate ? new Date(it.expiryDate).toISOString().slice(0, 10) : "",
      notes: it.notes || "",
    });
    setOpen(true);
  };

  const save = () => {
    const quantity = parseFloat(form.quantity);
    const minStock = parseFloat(form.minStock) || 0;
    const purchasePrice = parseFloat(form.purchasePrice) || 0;
    if (!form.name.trim() || isNaN(quantity)) return toast.push("Name and quantity required", "error");
    const supplier = suppliers.find((s) => s.id === form.supplierId);
    const data = {
      name: form.name.trim(),
      category: form.category.trim() || "General",
      quantity,
      unit: form.unit,
      minStock,
      purchasePrice,
      supplierId: form.supplierId || undefined,
      supplierName: supplier?.name,
      expiryDate: form.expiryDate ? new Date(form.expiryDate).getTime() : undefined,
      notes: form.notes || undefined,
    };
    if (editing) Store.updateInventoryItem(editing.id, data);
    else Store.addInventoryItem(data);
    toast.push(editing ? "Item updated" : "Item added", "success");
    setOpen(false);
  };

  const remove = (it: InventoryItem) => {
    if (!confirm(`Delete "${it.name}"?`)) return;
    Store.deleteInventoryItem(it.id);
    toast.push("Item deleted", "info");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Inventory Management</h2>
          <p className="text-sm text-neutral-500">{inventory.length} items • Value {inr(totalValue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Items" value={inventory.length} icon={<Package className="h-5 w-5" />} tone="blue" />
        <StatCard label="Low Stock" value={lowStock.length} icon={<AlertTriangle className="h-5 w-5" />} tone="red" />
        <StatCard label="Suppliers" value={suppliers.length} icon={<Truck className="h-5 w-5" />} tone="gold" />
        <StatCard label="Inventory Value" value={inr(totalValue)} icon={<Package className="h-5 w-5" />} tone="green" />
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {[
          { v: "stock", l: "Stock" },
          { v: "suppliers", l: "Suppliers" },
          { v: "expenses", l: "Expenses" },
          { v: "alerts", l: `Alerts (${lowStock.length + expiringSoon.length})` },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v as typeof tab)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${
              tab === t.v ? "bg-gold-gradient text-white" : "bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <Card>
          <div className="flex flex-wrap gap-2 mb-4 items-center justify-between">
            <div className="flex-1 min-w-[200px] max-w-sm">
              <Input value={search} onChange={setSearch} placeholder="Search inventory…" prefix={<Search className="h-4 w-4" />} />
            </div>
            <Button variant="primary" onClick={openNew}><Plus className="h-4 w-4" /> Add Item</Button>
          </div>
          {filtered.length === 0 ? (
            <Empty message="No inventory items" />
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Item</th><th>Category</th><th>Qty</th><th>Min</th><th>Value</th><th>Supplier</th><th>Expiry</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => {
                    const low = i.quantity <= i.minStock;
                    return (
                      <tr key={i.id} className={low ? "bg-rose-50/40 dark:bg-rose-500/5" : ""}>
                        <td className="font-medium">{i.name}</td>
                        <td><Badge>{i.category}</Badge></td>
                        <td className={`font-semibold ${low ? "text-rose-600" : ""}`}>{i.quantity} {i.unit}</td>
                        <td>{i.minStock} {i.unit}</td>
                        <td className="font-semibold text-gold-600">{inr(i.quantity * i.purchasePrice)}</td>
                        <td className="text-xs">{i.supplierName || "—"}</td>
                        <td className="text-xs">{i.expiryDate ? new Date(i.expiryDate).toLocaleDateString() : "—"}</td>
                        <td>
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(i)} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"><Edit2 className="h-3.5 w-3.5" /></button>
                            <button onClick={() => remove(i)} className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "suppliers" && <SuppliersTab />}
      {tab === "expenses" && <ExpensesTab />}
      {tab === "alerts" && (
        <Card>
          <h3 className="font-semibold mb-3">⚠️ Low Stock Alerts</h3>
          {lowStock.length === 0 ? (
            <p className="text-sm text-neutral-500">All items are sufficiently stocked.</p>
          ) : (
            <ul className="space-y-1 mb-5">
              {lowStock.map((i) => (
                <li key={i.id} className="flex justify-between border-b border-neutral-200 dark:border-neutral-800 py-2 text-sm">
                  <span>{i.name}</span>
                  <span className="text-rose-600 font-semibold">{i.quantity} {i.unit} (min: {i.minStock})</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="font-semibold mb-3">📅 Expiring Soon (7 days)</h3>
          {expiringSoon.length === 0 ? (
            <p className="text-sm text-neutral-500">No items expiring soon.</p>
          ) : (
            <ul className="space-y-1">
              {expiringSoon.map((i) => (
                <li key={i.id} className="flex justify-between border-b border-neutral-200 dark:border-neutral-800 py-2 text-sm">
                  <span>{i.name}</span>
                  <span className="text-amber-600 font-semibold">
                    {i.expiryDate ? new Date(i.expiryDate).toLocaleDateString() : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Item" : "Add Inventory Item"} size="lg">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Item Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} className="col-span-2" />
          <Input label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} placeholder="e.g. Vegetables" />
          <Input label="Unit" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} placeholder="kg, L, pcs" />
          <Input label="Quantity" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} type="number" />
          <Input label="Min Stock" value={form.minStock} onChange={(v) => setForm({ ...form, minStock: v })} type="number" />
          <Input label="Purchase Price" value={form.purchasePrice} onChange={(v) => setForm({ ...form, purchasePrice: v })} type="number" prefix="₹" className="col-span-2" />
          <Select
            label="Supplier"
            value={form.supplierId}
            onChange={(v) => setForm({ ...form, supplierId: v })}
            options={[{ value: "", label: "Select supplier…" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
            className="col-span-2"
          />
          <Input label="Expiry Date" value={form.expiryDate} onChange={(v) => setForm({ ...form, expiryDate: v })} type="date" className="col-span-2" />
          <label className="col-span-2">
            <span className="block mb-1 text-xs font-medium">Notes</span>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={save}>{editing ? "Update" : "Add"} Item</Button>
        </div>
      </Modal>
    </div>
  );
}

function SuppliersTab() {
  const suppliers = useStore("sups", Store.listSuppliers);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", gstin: "" });
  const toast = useToast();
  const save = () => {
    if (!form.name) return toast.push("Name required", "error");
    Store.addSupplier(form);
    toast.push("Supplier added", "success");
    setOpen(false);
    setForm({ name: "", phone: "", address: "", gstin: "" });
  };
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">Suppliers</h3>
        <Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Supplier</Button>
      </div>
      {suppliers.length === 0 ? (
        <Empty message="No suppliers" />
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Phone</th><th>Address</th><th>GSTIN</th><th></th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td>{s.phone}</td>
                  <td className="text-sm">{s.address}</td>
                  <td className="text-xs">{s.gstin || "—"}</td>
                  <td>
                    <button onClick={() => { if (confirm("Delete?")) { Store.deleteSupplier(s.id); toast.push("Deleted", "info"); } }} className="p-1 text-rose-600 rounded hover:bg-rose-100 dark:hover:bg-rose-500/20">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add Supplier" size="md">
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Input label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Input label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
          <Input label="GSTIN" value={form.gstin} onChange={(v) => setForm({ ...form, gstin: v })} />
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>Save</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function ExpensesTab() {
  const expenses = useStore("exps", Store.listExpenses);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<Expense, "id">>({ category: "", description: "", amount: 0, date: Date.now(), notes: "" });
  const toast = useToast();
  const save = () => {
    if (!form.description || !form.amount) return toast.push("Fill description and amount", "error");
    Store.addExpense(form);
    toast.push("Expense added", "success");
    setOpen(false);
    setForm({ category: "", description: "", amount: 0, date: Date.now(), notes: "" });
  };
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-semibold">Expenses</h3>
          <p className="text-xs text-neutral-500">Total: {inr(total)}</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Expense</Button>
      </div>
      {expenses.length === 0 ? (
        <Empty message="No expenses yet" />
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="text-right">Amount</th><th></th></tr></thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="text-xs">{new Date(e.date).toLocaleDateString()}</td>
                  <td><Badge>{e.category || "General"}</Badge></td>
                  <td>{e.description}</td>
                  <td className="text-right font-semibold text-rose-600">{inr(e.amount)}</td>
                  <td>
                    <button onClick={() => { if (confirm("Delete?")) { Store.deleteExpense(e.id); toast.push("Deleted", "info"); } }} className="p-1 text-rose-600 rounded hover:bg-rose-100 dark:hover:bg-rose-500/20">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add Expense" size="md">
        <div className="space-y-3">
          <Input label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} placeholder="e.g. Rent, Salary" />
          <Input label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
          <Input label="Amount" value={String(form.amount)} onChange={(v) => setForm({ ...form, amount: parseFloat(v) || 0 })} type="number" prefix="₹" />
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>Save</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
