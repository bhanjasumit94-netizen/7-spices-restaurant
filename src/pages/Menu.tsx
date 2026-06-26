import { useState, useMemo, useEffect } from "react";
import { Plus, Edit2, Trash2, Search, Tag, RefreshCw } from "lucide-react";
import { Button, Input, Modal, Badge, Empty, Select } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore, seedIfNeeded } from "../lib/store";
import { MenuItem } from "../lib/types";
import { inr } from "../lib/money";

export default function Menu() {
  // eslint-disable-next-line no-console
  console.log("Menu route loaded");
  // eslint-disable-next-line no-console
  console.log("Menu component mounted");
  const categories = useStore("cats", Store.listCategories);
  const items = useStore("items", Store.listItems);
  // eslint-disable-next-line no-console
  console.log("Menu items:", items.length, "categories:", categories.length);
  const toast = useToast();
  const [activeCat, setActiveCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<{ name: string; price: string; categoryId: string; veg: boolean; available: boolean }>({
    name: "",
    price: "",
    categoryId: "",
    veg: true,
    available: true,
  });

  // BUG 1 FIX: If categories or items are missing (e.g. the user cleared
  // localStorage manually or the very first paint landed before the seed
  // ran), re-seed automatically so the Menu page never appears blank.
  useEffect(() => {
    if (categories.length === 0 || items.length === 0) {
      try {
        seedIfNeeded();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[Menu] seed failed", err);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((i) => {
      if (activeCat !== "all" && i.categoryId !== activeCat) return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, activeCat, search]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", price: "", categoryId: categories[0]?.id || "", veg: true, available: true });
    setOpen(true);
  };

  const openEdit = (it: MenuItem) => {
    setEditing(it);
    setForm({ name: it.name, price: String(it.price), categoryId: it.categoryId, veg: it.veg, available: it.available });
    setOpen(true);
  };

  const save = () => {
    const price = parseFloat(form.price);
    if (!form.name.trim() || !form.categoryId || isNaN(price) || price <= 0) {
      return toast.push("Please fill all fields with valid values", "error");
    }
    if (editing) {
      Store.updateItem(editing.id, { name: form.name.trim(), price, categoryId: form.categoryId, veg: form.veg, available: form.available });
      toast.push("Item updated", "success");
    } else {
      Store.addItem({ name: form.name.trim(), price, categoryId: form.categoryId, veg: form.veg, available: form.available });
      toast.push("Item added", "success");
    }
    setOpen(false);
  };

  const remove = (it: MenuItem) => {
    if (!confirm(`Delete "${it.name}"?`)) return;
    Store.deleteItem(it.id);
    toast.push("Item deleted", "info");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Menu Management</h2>
          <p className="text-sm text-neutral-500">{items.length} items in {categories.length} categories</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              // Re-run the seed routine. If categories or items are
              // missing they'll be recreated from the canonical menu
              // definitions; everything else (orders, tables, etc.) is
              // preserved untouched.
              try {
                seedIfNeeded();
                toast.push("Menu refreshed", "success");
              } catch (err) {
                toast.push("Refresh failed", "error");
              }
            }}
            title="Reload the menu from storage and re-create any missing items"
          >
            <RefreshCw className="h-4 w-4" /> Refresh Menu
          </Button>
          <Button variant="primary" onClick={openNew}>
            <Plus className="h-4 w-4" /> Add Item
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setActiveCat("all")} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${activeCat === "all" ? "bg-gold-gradient text-white" : "bg-neutral-100 dark:bg-neutral-800"}`}>
          All
        </button>
        {categories.map((c) => (
          <button key={c.id} onClick={() => setActiveCat(c.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${activeCat === c.id ? "bg-gold-gradient text-white" : "bg-neutral-100 dark:bg-neutral-800"}`}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="max-w-sm">
        <Input value={search} onChange={setSearch} placeholder="Search items…" prefix={<Search className="h-4 w-4" />} />
      </div>

      {filtered.length === 0 ? (
        <Empty message="No menu items found" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((it) => {
            const cat = categories.find((c) => c.id === it.categoryId);
            return (
              <div key={it.id} className="menu-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`h-3 w-3 rounded-sm border-2 ${it.veg ? "border-emerald-600" : "border-rose-600"} flex items-center justify-center`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${it.veg ? "bg-emerald-600" : "bg-rose-600"}`} />
                      </span>
                      <Badge tone="gold">{cat?.name || "—"}</Badge>
                      {!it.available && <Badge tone="danger">Hidden</Badge>}
                    </div>
                    <p className="font-semibold text-sm leading-tight">{it.name}</p>
                    <p className="text-gold-600 dark:text-gold-400 font-bold mt-1">{inr(it.price)}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => openEdit(it)} className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(it)} className="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Item" : "Add Item"} size="md">
        <div className="space-y-3">
          <Input label="Item Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Paneer Butter Masala" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Price (₹)" value={form.price} onChange={(v) => setForm({ ...form, price: v })} type="number" />
            <Select
              label="Category"
              value={form.categoryId}
              onChange={(v) => setForm({ ...form, categoryId: v })}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.veg}
                onChange={(e) => setForm({ ...form, veg: e.target.checked })}
                className="h-4 w-4 rounded accent-gold-500"
              />
              <span className="text-sm">Vegetarian</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.available}
                onChange={(e) => setForm({ ...form, available: e.target.checked })}
                className="h-4 w-4 rounded accent-gold-500"
              />
              <span className="text-sm">Available</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}><Tag className="h-4 w-4" /> Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
