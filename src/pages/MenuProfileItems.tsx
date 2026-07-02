import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  IndianRupee,
  Search,
  BookOpen,
  FolderPlus,
  Percent,
  ChevronUp,
  ChevronDown,

  PackagePlus,
  CheckSquare,
  Square,
  Wand2,
} from "lucide-react";
import {
  Button,
  Card,
  Input,
  Modal,
  Badge,
  Empty,
  Select,
} from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore } from "../lib/store";
import { MenuCategory, MenuItem } from "../lib/types";
import { inr } from "../lib/money";
import { useAuth } from "../lib/auth";
import { can } from "../lib/permissions";
import AccessDenied from "./AccessDenied";

type BulkMode = "increase" | "decrease" | "round5" | "round10";

export default function MenuProfileItems() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const profiles = useStore("mp", Store.listMenuProfiles);
  const profile = useMemo(
    () => profiles.find((p) => p.id === id) ?? null,
    [profiles, id]
  );

  const canEdit = can(user?.role, "edit_menu_profiles");
  const canCreate = can(user?.role, "create_menu_profiles");
  const canDelete = can(user?.role, "delete_menu_profiles");

  if (!can(user?.role, "view_menu_profiles")) return <AccessDenied />;

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceItem, setPriceItem] = useState<MenuItem | null>(null);
  const [priceValue, setPriceValue] = useState("");

  // Category modals
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catEditing, setCatEditing] = useState<MenuCategory | null>(null);
  const [catName, setCatName] = useState("");

  // Bulk price modal
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<BulkMode>("increase");
  const [bulkPct, setBulkPct] = useState("10");
  const [bulkCat, setBulkCat] = useState<string>("all");

  // Import dialog
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySearch, setCopySearch] = useState(""); // item search (right pane)
  const [copyCatSearch, setCopyCatSearch] = useState(""); // category search (left pane)
  const [copyActiveCat, setCopyActiveCat] = useState<string>("");
  const [copySelected, setCopySelected] = useState<Set<string>>(new Set());


  const [form, setForm] = useState<{
    name: string;
    price: string;
    categoryId: string;
    veg: boolean;
    available: boolean;
  }>({ name: "", price: "", categoryId: "", veg: true, available: true });

  if (!profile) {
    return (
      <Card>
        <Empty
          message="Profile not found"
          hint="It may have been deleted. Return to the Menu Profiles page."
        />
        <div className="flex justify-center mt-3">
          <Button variant="primary" onClick={() => navigate("/menu-profiles")}>
            <ArrowLeft className="h-4 w-4" /> Back to Profiles
          </Button>
        </div>
      </Card>
    );
  }

  const items = profile.items ?? [];
  const categories = useMemo(
    () =>
      [...(profile.categories ?? [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      ),
    [profile.categories]
  );
  const baseItems = Store.getBaseItems();
  const baseCategories = useMemo(() => {
    const raw = [...Store.getBaseCategories()].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
    // Deduplicate by id first, then by normalized name. The UI must show
    // each category once even if Firestore still has stale duplicates.
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const out: MenuCategory[] = [];
    for (const c of raw) {
      const nameKey = c.name.trim().toLowerCase();
      if (seenIds.has(c.id) || seenNames.has(nameKey)) {
        console.warn("Duplicate category detected:", c.name);
        continue;
      }
      seenIds.add(c.id);
      seenNames.add(nameKey);
      out.push(c);
    }
    return out;
  }, []);


  // Pick a default visible category once one exists
  if (activeCat !== "all" && !categories.find((c) => c.id === activeCat)) {
    // category was deleted — fall back
    setActiveCat(categories[0]?.id ?? "all");
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((i) => {
      if (activeCat !== "all" && i.categoryId !== activeCat) return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, activeCat]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      name: "",
      price: "",
      categoryId: activeCat !== "all" ? activeCat : categories[0]?.id ?? "",
      veg: true,
      available: true,
    });
    setEditOpen(true);
  };
  const openEdit = (it: MenuItem) => {
    setEditing(it);
    setForm({
      name: it.name,
      price: String(it.price),
      categoryId: it.categoryId,
      veg: it.veg,
      available: it.available,
    });
    setEditOpen(true);
  };
  const save = () => {
    const price = parseFloat(form.price);
    if (!form.name.trim() || !form.categoryId || isNaN(price) || price <= 0) {
      toast.push("Please fill all fields with valid values", "error");
      return;
    }
    if (editing) {
      Store.updateItemInProfile(profile.id, editing.id, {
        name: form.name.trim(),
        price,
        categoryId: form.categoryId,
        veg: form.veg,
        available: form.available,
      });
      toast.push("Item updated", "success");
    } else {
      Store.addItemToProfile(profile.id, {
        name: form.name.trim(),
        price,
        categoryId: form.categoryId,
        veg: form.veg,
        available: form.available,
      });
      toast.push("Festival item added", "success");
    }
    setEditOpen(false);
  };

  const openPrice = (it: MenuItem) => {
    setPriceItem(it);
    setPriceValue(String(it.price));
    setPriceOpen(true);
  };
  const savePrice = () => {
    if (!priceItem) return;
    const v = parseFloat(priceValue);
    if (isNaN(v) || v <= 0) {
      toast.push("Enter a valid price", "error");
      return;
    }
    Store.updateItemInProfile(profile.id, priceItem.id, { price: v });
    toast.push("Price updated", "success");
    setPriceOpen(false);
  };

  const toggleHide = (it: MenuItem) => {
    Store.updateItemInProfile(profile.id, it.id, { available: !it.available });
    toast.push(it.available ? "Item hidden" : "Item visible", "info");
  };
  const duplicate = (it: MenuItem) => {
    Store.duplicateItemInProfile(profile.id, it.id);
    toast.push("Item duplicated", "success");
  };
  const remove = (it: MenuItem) => {
    if (!confirm(`Delete "${it.name}" from this profile?`)) return;
    Store.deleteItemFromProfile(profile.id, it.id);
    toast.push("Item deleted", "info");
  };

  // ── Categories ──
  const openAddCat = () => {
    setCatEditing(null);
    setCatName("");
    setCatModalOpen(true);
  };
  const openEditCat = (c: MenuCategory) => {
    setCatEditing(c);
    setCatName(c.name);
    setCatModalOpen(true);
  };
  const saveCat = () => {
    const name = catName.trim();
    if (!name) return toast.push("Enter a category name", "error");
    if (catEditing) {
      Store.renameCategoryInProfile(profile.id, catEditing.id, name);
      toast.push("Category renamed", "success");
    } else {
      Store.addCategoryToProfile(profile.id, name);
      toast.push("Category added", "success");
    }
    setCatModalOpen(false);
  };
  const deleteCat = (c: MenuCategory) => {
    const inCat = items.filter((i) => i.categoryId === c.id).length;
    if (
      !confirm(
        `Delete category "${c.name}"?${
          inCat > 0 ? ` This will also remove ${inCat} item(s) in it.` : ""
        }`
      )
    )
      return;
    Store.deleteCategoryFromProfile(profile.id, c.id);
    if (activeCat === c.id) setActiveCat("all");
    toast.push("Category deleted", "info");
  };
  const moveCat = (c: MenuCategory, dir: -1 | 1) => {
    Store.reorderCategoryInProfile(profile.id, c.id, dir);
  };
  const toggleHideCat = (c: MenuCategory) => {
    Store.setCategoryHiddenInProfile(profile.id, c.id, !c.hidden);
    toast.push(c.hidden ? "Category visible" : "Category hidden", "info");
  };
  const removeDuplicateCategories = () => {
    const res = Store.dedupeProfileCategories(profile.id);
    if (res.mergedCategories === 0 && res.mergedItems === 0) {
      toast.push("No duplicate categories found", "info");
      return;
    }
    const parts: string[] = [];
    if (res.mergedCategories)
      parts.push(
        `${res.mergedCategories} duplicate categor${res.mergedCategories === 1 ? "y" : "ies"} merged`
      );
    if (res.mergedItems)
      parts.push(
        `${res.mergedItems} duplicate item${res.mergedItems === 1 ? "" : "s"} removed`
      );
    toast.push(parts.join(", "), "success");
  };

  // ── Bulk price ──
  const runBulk = () => {
    const pct =
      bulkMode === "increase" || bulkMode === "decrease"
        ? parseFloat(bulkPct)
        : 0;
    if (
      (bulkMode === "increase" || bulkMode === "decrease") &&
      (isNaN(pct) || pct <= 0)
    ) {
      return toast.push("Enter a valid percent", "error");
    }
    Store.bulkPriceUpdateProfile(
      profile.id,
      bulkMode,
      pct,
      bulkCat === "all" ? undefined : bulkCat
    );
    toast.push("Bulk price update applied", "success");
    setBulkOpen(false);
  };

  // ── Import dialog ──
  const existingNames = useMemo(
    () => new Set(items.map((i) => i.name.trim().toLowerCase())),
    [items]
  );

  // For each base category, the list of items NOT yet imported into this
  // profile. Used by both panels of the import dialog.
  const importByCat = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const cat of baseCategories) {
      const available = baseItems.filter(
        (i) =>
          i.categoryId === cat.id &&
          !existingNames.has(i.name.trim().toLowerCase())
      );
      map.set(cat.id, available);
    }
    return map;
  }, [baseCategories, baseItems, existingNames]);

  // Categories filtered by the left-panel search.
  const filteredCats = useMemo(() => {
    const q = copyCatSearch.toLowerCase().trim();
    if (!q) return baseCategories;
    return baseCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [baseCategories, copyCatSearch]);

  // Items in the currently-active category, filtered by the right-panel search.
  const activeCatItems = useMemo(() => {
    const list = importByCat.get(copyActiveCat) ?? [];
    const q = copySearch.toLowerCase().trim();
    if (!q) return list;
    return list.filter((i) => i.name.toLowerCase().includes(q));
  }, [importByCat, copyActiveCat, copySearch]);

  const openCopyModal = () => {
    setCopySelected(new Set());
    setCopySearch("");
    setCopyCatSearch("");
    // Pick the first category that still has items to import, otherwise the
    // first base category overall.
    const firstWithItems = baseCategories.find(
      (c) => (importByCat.get(c.id)?.length ?? 0) > 0
    );
    setCopyActiveCat(firstWithItems?.id ?? baseCategories[0]?.id ?? "");
    setCopyOpen(true);
  };

  const toggleItem = (iid: string) => {
    setCopySelected((prev) => {
      const next = new Set(prev);
      if (next.has(iid)) next.delete(iid);
      else next.add(iid);
      return next;
    });
  };
  const selectAllInActive = () => {
    setCopySelected((prev) => {
      const next = new Set(prev);
      activeCatItems.forEach((i) => next.add(i.id));
      return next;
    });
  };
  const clearActiveSelection = () => {
    setCopySelected((prev) => {
      const next = new Set(prev);
      activeCatItems.forEach((i) => next.delete(i.id));
      return next;
    });
  };
  const clearSelection = () => setCopySelected(new Set());

  const importSelected = () => {
    if (copySelected.size === 0) {
      toast.push("Select at least one item to import", "error");
      return;
    }
    const ids = Array.from(copySelected);
    const n = Store.copyBaseItemsToProfile(profile.id, ids);
    toast.push(`Imported ${n} item${n === 1 ? "" : "s"}`, "success");
    // Drop the just-imported ids from the selection; keep modal open so the
    // user can import from another category.
    setCopySelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };
  const importEntireCategory = () => {
    if (!copyActiveCat) return;
    const n = Store.copyBaseCategoryToProfile(profile.id, copyActiveCat);
    toast.push(`Imported ${n} item${n === 1 ? "" : "s"} from category`, "success");
    // Stay open so the user can pick the next category on the left.
  };
  const importEntireMenu = () => {
    if (!confirm("Import all items from the regular menu into this profile?")) return;
    const n = Store.copyAllBaseItemsToProfile(profile.id);
    toast.push(`Imported ${n} item${n === 1 ? "" : "s"}`, "success");
    // Stay open per request.
  };


  const totalCatItemCount = (cid: string) =>
    items.filter((i) => i.categoryId === cid).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/menu-profiles"
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Back to Menu Profiles"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold truncate flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-gold-500" />
              {profile.name}
              {profile.isActive && <Badge tone="success">Active</Badge>}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {items.length} items • {categories.length} categories • changes
              affect only this profile
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to={`/menu-profiles/${profile.id}/preview`}>
            <Button variant="outline">
              <Eye className="h-4 w-4" /> Preview
            </Button>
          </Link>
          {canEdit && (
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Percent className="h-4 w-4" /> Bulk Prices
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" onClick={removeDuplicateCategories}>
              <Wand2 className="h-4 w-4" /> Remove Duplicates
            </Button>
          )}
          {canCreate && (
            <Button variant="outline" onClick={openCopyModal}>
              <Copy className="h-4 w-4" /> Import From Regular Menu
            </Button>
          )}
          {canEdit && (
            <Button variant="primary" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add Item
            </Button>
          )}
        </div>
      </div>

      {/* Two-pane POS-style layout: categories on the left, items on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3">
        {/* ── Left: categories ── */}
        <Card className="!p-3 lg:sticky lg:top-3 self-start">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wider text-neutral-500">
              Categories
            </p>
            {canEdit && (
              <Button size="sm" variant="primary" onClick={openAddCat}>
                <FolderPlus className="h-3 w-3" /> Add New
              </Button>
            )}
          </div>

          <button
            onClick={() => setActiveCat("all")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium mb-1 ${
              activeCat === "all"
                ? "bg-gold-gradient text-white"
                : "bg-neutral-100 dark:bg-neutral-800"
            }`}
          >
            All Items ({items.length})
          </button>

          {categories.length === 0 ? (
            <p className="text-xs text-neutral-500 px-1 py-2">
              No categories yet. Click <b>Add New</b> to create one.
            </p>
          ) : (
            <div className="space-y-1">
              {categories.map((c, idx) => {
                const n = totalCatItemCount(c.id);
                const active = activeCat === c.id;
                return (
                  <div
                    key={c.id}
                    className={`rounded-lg ${
                      active
                        ? "bg-gold-gradient text-white"
                        : "bg-neutral-100 dark:bg-neutral-800"
                    } ${c.hidden ? "opacity-60" : ""}`}
                  >
                    <button
                      onClick={() => setActiveCat(c.id)}
                      className="w-full text-left px-3 py-2 text-sm font-medium flex items-center justify-between"
                    >
                      <span className="truncate">
                        {c.name} {c.hidden && "(hidden)"}
                      </span>
                      <span
                        className={`text-xs ${
                          active ? "text-white/80" : "text-neutral-500"
                        }`}
                      >
                        {n}
                      </span>
                    </button>
                    {active && (canEdit || canDelete) && (
                      <div className="flex items-center justify-between gap-1 px-2 pb-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => moveCat(c, -1)}
                            disabled={idx === 0}
                            title="Move up"
                            className="p-1 rounded bg-white/15 hover:bg-white/25 disabled:opacity-30"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => moveCat(c, 1)}
                            disabled={idx === categories.length - 1}
                            title="Move down"
                            className="p-1 rounded bg-white/15 hover:bg-white/25 disabled:opacity-30"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => openEditCat(c)}
                              title="Rename"
                              className="p-1 rounded bg-white/15 hover:bg-white/25"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => toggleHideCat(c)}
                              title={c.hidden ? "Show" : "Hide"}
                              className="p-1 rounded bg-white/15 hover:bg-white/25"
                            >
                              {c.hidden ? (
                                <Eye className="h-3 w-3" />
                              ) : (
                                <EyeOff className="h-3 w-3" />
                              )}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => deleteCat(c)}
                              title="Delete"
                              className="p-1 rounded bg-white/15 hover:bg-rose-500/40"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Right: items ── */}
        <div className="space-y-3 min-w-0">
          <Card className="!p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <Input
                  value={search}
                  onChange={setSearch}
                  placeholder="Search items in this profile…"
                  prefix={<Search className="h-4 w-4" />}
                />
              </div>
              {canEdit && (
                <Button variant="outline" onClick={openAdd}>
                  <Plus className="h-4 w-4" /> Add Item
                </Button>
              )}
              {canCreate && (
                <Button variant="ghost" onClick={openCopyModal}>
                  <PackagePlus className="h-4 w-4" /> Import
                </Button>
              )}
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <Empty
                message={
                  items.length === 0
                    ? "No items in this profile yet"
                    : "No items match this view"
                }
                hint={
                  items.length === 0
                    ? "Add items manually or import them from the regular menu."
                    : "Try a different category or clear the search."
                }
              />
              <div className="flex flex-wrap justify-center gap-2 mt-3">
                {canEdit && (
                  <Button variant="primary" onClick={openAdd}>
                    <Plus className="h-4 w-4" /> Add Item
                  </Button>
                )}
                {canCreate && (
                  <Button variant="outline" onClick={openCopyModal}>
                    <Copy className="h-4 w-4" /> Import From Regular Menu
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((it) => {
                const cat = categories.find((c) => c.id === it.categoryId);
                return (
                  <div key={it.id} className="menu-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span
                            className={`h-3 w-3 rounded-sm border-2 ${
                              it.veg ? "border-emerald-600" : "border-rose-600"
                            } flex items-center justify-center`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                it.veg ? "bg-emerald-600" : "bg-rose-600"
                              }`}
                            />
                          </span>
                          <Badge tone="gold">{cat?.name || "—"}</Badge>
                          {!it.available && <Badge tone="danger">Hidden</Badge>}
                        </div>
                        <p className="font-semibold text-sm leading-tight">
                          {it.name}
                        </p>
                        <p className="text-gold-600 dark:text-gold-400 font-bold mt-1">
                          {inr(it.price)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {canEdit && (
                        <Button size="sm" variant="ghost" onClick={() => openPrice(it)}>
                          <IndianRupee className="h-3 w-3" /> Price
                        </Button>
                      )}
                      {canEdit && (
                        <Button size="sm" variant="ghost" onClick={() => openEdit(it)}>
                          <Edit2 className="h-3 w-3" /> Edit
                        </Button>
                      )}
                      {canEdit && (
                        <Button size="sm" variant="ghost" onClick={() => toggleHide(it)}>
                          {it.available ? (
                            <>
                              <EyeOff className="h-3 w-3" /> Hide
                            </>
                          ) : (
                            <>
                              <Eye className="h-3 w-3" /> Show
                            </>
                          )}
                        </Button>
                      )}
                      {canCreate && (
                        <Button size="sm" variant="ghost" onClick={() => duplicate(it)}>
                          <Copy className="h-3 w-3" /> Duplicate
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="danger" onClick={() => remove(it)}>
                          <Trash2 className="h-3 w-3" /> Delete
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit item modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editing ? "Edit Item" : "Add Festival-Only Item"}
        size="md"
      >
        <div className="space-y-3">
          <Input
            label="Item Name"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="e.g. Durga Puja Thali"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Price (₹)"
              value={form.price}
              onChange={(v) => setForm({ ...form, price: v })}
              type="number"
            />
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
          {!editing && categories.length === 0 && (
            <p className="text-xs text-rose-500">
              This profile has no categories yet. Add a category first.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              <Plus className="h-4 w-4" /> Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Quick price edit */}
      <Modal
        open={priceOpen}
        onClose={() => setPriceOpen(false)}
        title={priceItem ? `Edit price — ${priceItem.name}` : "Edit price"}
        size="sm"
      >
        <div className="space-y-3">
          <Input label="Price (₹)" value={priceValue} onChange={setPriceValue} type="number" />
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" onClick={() => setPriceOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={savePrice}>
              <IndianRupee className="h-4 w-4" /> Update Price
            </Button>
          </div>
        </div>
      </Modal>

      {/* Category add/rename */}
      <Modal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title={catEditing ? "Rename Category" : "Add Category"}
        size="sm"
      >
        <div className="space-y-3">
          <Input
            label="Category Name"
            value={catName}
            onChange={setCatName}
            placeholder="e.g. Festival Specials"
          />
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" onClick={() => setCatModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveCat}>
              <Plus className="h-4 w-4" /> Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk price */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Price Update" size="md">
        <div className="space-y-3">
          <Select
            label="Operation"
            value={bulkMode}
            onChange={(v) => setBulkMode(v as BulkMode)}
            options={[
              { value: "increase", label: "Increase prices by %" },
              { value: "decrease", label: "Decrease prices by %" },
              { value: "round5", label: "Round prices to nearest ₹5" },
              { value: "round10", label: "Round prices to nearest ₹10" },
            ]}
          />
          {(bulkMode === "increase" || bulkMode === "decrease") && (
            <Input
              label="Percent (%)"
              type="number"
              value={bulkPct}
              onChange={setBulkPct}
              placeholder="10"
            />
          )}
          <Select
            label="Scope"
            value={bulkCat}
            onChange={setBulkCat}
            options={[
              { value: "all", label: "All categories in this profile" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <p className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-800/40 rounded p-2">
            This only changes prices inside <b>{profile.name}</b>. The Regular Menu is never modified.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={runBulk}>
              <Percent className="h-4 w-4" /> Apply
            </Button>
          </div>
        </div>
      </Modal>

      {/* Import from regular menu — two-panel POS-style layout */}
      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="Import Items From Regular Menu"
        size="xl"
      >
        {baseCategories.length === 0 ? (
          <Empty
            message="The regular menu has no categories yet"
            hint="Add categories on the Menu page first."
          />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3">
              {/* ── Left: categories ── */}
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg flex flex-col min-h-0">
                <div className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                  <Input
                    value={copyCatSearch}
                    onChange={setCopyCatSearch}
                    placeholder="Search categories…"
                    prefix={<Search className="h-4 w-4" />}
                  />
                </div>
                <div className="overflow-y-auto max-h-[55vh] p-1.5 space-y-1">
                  {filteredCats.length === 0 ? (
                    <p className="text-xs text-neutral-500 px-2 py-3">
                      No categories match this search.
                    </p>
                  ) : (
                    filteredCats.map((c) => {
                      const available = importByCat.get(c.id)?.length ?? 0;
                      const selectedInCat =
                        importByCat
                          .get(c.id)
                          ?.filter((i) => copySelected.has(i.id)).length ?? 0;
                      const active = c.id === copyActiveCat;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCopyActiveCat(c.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between gap-2 ${
                            active
                              ? "bg-gold-gradient text-white"
                              : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          }`}
                        >
                          <span className="truncate font-medium">{c.name}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            {selectedInCat > 0 && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                  active
                                    ? "bg-white/25 text-white"
                                    : "bg-gold-500/20 text-gold-700 dark:text-gold-300"
                                }`}
                              >
                                {selectedInCat}
                              </span>
                            )}
                            <span
                              className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                                active
                                  ? "bg-white/20 text-white"
                                  : "bg-neutral-200 dark:bg-neutral-700"
                              }`}
                            >
                              {available}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ── Right: items in active category ── */}
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg flex flex-col min-h-0">
                <div className="p-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <Input
                      value={copySearch}
                      onChange={setCopySearch}
                      placeholder="Search items in this category…"
                      prefix={<Search className="h-4 w-4" />}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={selectAllInActive}
                    disabled={activeCatItems.length === 0}
                  >
                    <CheckSquare className="h-3 w-3" /> Select All
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearActiveSelection}
                    disabled={activeCatItems.length === 0}
                  >
                    <Square className="h-3 w-3" /> Clear
                  </Button>
                </div>
                <div className="overflow-y-auto max-h-[55vh] divide-y divide-neutral-100 dark:divide-neutral-800/60">
                  {!copyActiveCat ? (
                    <p className="text-xs text-neutral-500 px-4 py-3">
                      Select a category on the left.
                    </p>
                  ) : activeCatItems.length === 0 ? (
                    <p className="text-xs text-neutral-500 px-4 py-3">
                      {(importByCat.get(copyActiveCat)?.length ?? 0) === 0
                        ? "All items in this category are already imported."
                        : "No items match this search."}
                    </p>
                  ) : (
                    activeCatItems.map((bi) => {
                      const checked = copySelected.has(bi.id);
                      return (
                        <label
                          key={bi.id}
                          className="px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(bi.id)}
                            className="h-4 w-4 accent-gold-500"
                          />
                          <span
                            className={`h-3 w-3 rounded-sm border-2 ${
                              bi.veg ? "border-emerald-600" : "border-rose-600"
                            } flex items-center justify-center shrink-0`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                bi.veg ? "bg-emerald-600" : "bg-rose-600"
                              }`}
                            />
                          </span>
                          <span className="flex-1 text-sm">{bi.name}</span>
                          <span className="text-sm font-semibold text-gold-600 dark:text-gold-400">
                            {inr(bi.price)}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* ── Bottom action bar ── */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-200 dark:border-neutral-800">
              <div className="text-xs text-neutral-500 pt-2">
                <Badge tone="gold">{copySelected.size} selected</Badge>{" "}
                {copySelected.size > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="ml-1 underline hover:text-neutral-700 dark:hover:text-neutral-300"
                  >
                    clear all
                  </button>
                )}
              </div>
              <div className="flex gap-2 flex-wrap pt-2">
                <Button variant="outline" onClick={() => setCopyOpen(false)}>
                  Close
                </Button>
                <Button
                  variant="outline"
                  onClick={importEntireMenu}
                >
                  <PackagePlus className="h-4 w-4" /> Import Entire Menu
                </Button>
                <Button
                  variant="outline"
                  onClick={importEntireCategory}
                  disabled={
                    !copyActiveCat ||
                    (importByCat.get(copyActiveCat)?.length ?? 0) === 0
                  }
                >
                  <PackagePlus className="h-4 w-4" /> Import Entire Category
                </Button>
                <Button
                  variant="primary"
                  onClick={importSelected}
                  disabled={copySelected.size === 0}
                >
                  <Copy className="h-4 w-4" /> Import Selected ({copySelected.size})
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
