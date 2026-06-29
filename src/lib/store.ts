// Firestore-backed data store with a synchronous in-memory cache so the
// existing page components (which were written for localStorage) keep
// working unchanged.
//
// How it works:
//   • On boot we hydrate the cache from localStorage for an instant first
//     paint, then attach `onSnapshot` listeners that mirror each Firestore
//     collection into the cache. Each snapshot dispatches the same
//     `spices:update` event the original store used, so `useStore()` keeps
//     re-rendering.
//   • All reads (`Store.listOrders()` etc.) return the cached array
//     synchronously.
//   • All writes update the cache + dispatch the event immediately, then
//     diff against the previous snapshot and apply add/set/delete to
//     Firestore in the background using batched writes.
//   • Offline support: Firestore IndexedDB persistence (see
//     `./firebase.ts`) plus a localStorage mirror as a second layer.
//   • Seeding: if all primary collections are empty after Firestore
//     hydrates we write the default data (admin user, categories, items,
//     tables, inventory, suppliers, settings) exactly once.

import {
  User,
  MenuCategory,
  MenuItem,
  MenuProfile,
  RestaurantTable,
  Order,
  OrderItem,
  InventoryItem,
  Supplier,
  Expense,
  Payment,
  RestaurantSettings,
  AuditLog,
  Notification,
} from "./types";
import { DEFAULT_CATEGORIES, DEFAULT_ITEMS } from "./menuData";
import { hashPassword, generateRandomPassword } from "./crypto";
import { db } from "./firebase";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";

// ---------- Keys / collection map ----------

const KEYS = {
  users: "spices_users",
  categories: "spices_categories",
  items: "spices_items",
  tables: "spices_tables",
  orders: "spices_orders",
  inventory: "spices_inventory",
  suppliers: "spices_suppliers",
  expenses: "spices_expenses",
  payments: "spices_payments",
  settings: "spices_settings",
  audit: "spices_audit",
  notifications: "spices_notifications",
  menuProfiles: "spices_menu_profiles",
  session: "spices_session",
  seeded: "spices_seeded_v3",
};

// Map localStorage-style keys to Firestore collection names.
const COLLECTIONS: Record<string, string> = {
  [KEYS.users]: "users",
  [KEYS.categories]: "categories",
  [KEYS.items]: "items",
  [KEYS.tables]: "tables",
  [KEYS.orders]: "orders",
  [KEYS.inventory]: "inventory",
  [KEYS.suppliers]: "suppliers",
  [KEYS.expenses]: "expenses",
  [KEYS.payments]: "payments",
  [KEYS.audit]: "audit",
  [KEYS.notifications]: "notifications",
  [KEYS.menuProfiles]: "menuProfiles",
};

export const LOGO_KEY = "restaurantLogo";

export const DEFAULT_SETTINGS: RestaurantSettings = {
  name: "7 Spices Restaurant",
  address:
    "Ujjainee, Indrakanan, GT Road, Beside Deewakar Shristi, Burdwan-713103",
  phone: "9339905367",
  gstin: "",
  gstEnabled: false,
  defaultGstPercent: 5,
  printerSize: "80mm",
  kotSize: "xlarge",
  waiterMode: true,
  currency: "₹",
  thankYouMessage: "Thank you for dining with us! Visit again.",
  autoPrintKOT: true,
  autoPrintBill: true,
  printCustomerCopy: true,
  printMerchantCopy: false,
  printDuplicateKOT: false,
  printLogo: true,
  printGstNumber: true,
  printQrCode: false,
};

const uid = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// ---------- Cache ----------

type AnyDoc = { id: string };

const cache = new Map<string, unknown>();

function dispatchUpdate(key: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("spices:update", { detail: { key } }));
}

function lsRead<T>(key: string, fallback: T): T {
  try {
    const raw =
      typeof window === "undefined" ? null : localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsWrite<T>(key: string, value: T) {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    /* quota / private-mode */
  }
}

function read<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  // Lazy hydrate from localStorage on first access (covers the brief gap
  // before the Firestore listener fires).
  const v = lsRead<T>(key, fallback);
  cache.set(key, v);
  return v;
}

// Diff-based collection write. For settings (non-collection) we use a
// single Firestore doc.
async function pushCollectionDiff<T extends AnyDoc>(
  key: string,
  prev: T[],
  next: T[]
) {
  const collName = COLLECTIONS[key];
  if (!collName) return;
  try {
    const prevMap = new Map(prev.map((d) => [d.id, d]));
    const nextMap = new Map(next.map((d) => [d.id, d]));
    const batch = writeBatch(db);
    let ops = 0;
    // Adds + updates
    for (const [id, value] of nextMap) {
      const before = prevMap.get(id);
      if (!before || JSON.stringify(before) !== JSON.stringify(value)) {
        batch.set(doc(db, collName, id), value as Record<string, unknown>);
        ops++;
      }
      // Firestore caps a single batch at 500 ops.
      if (ops >= 450) {
        await batch.commit();
        // Start a fresh batch for the rest
        return pushCollectionDiff(key, [...prev, ...next.slice(0, 0)], next);
      }
    }
    // Deletions
    for (const id of prevMap.keys()) {
      if (!nextMap.has(id)) {
        batch.delete(doc(db, collName, id));
        ops++;
      }
    }
    if (ops > 0) await batch.commit();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[Store] Firestore sync failed for ${key}`, err);
  }
}

function write<T>(key: string, value: T) {
  const prev = cache.get(key);
  cache.set(key, value);
  lsWrite(key, value);
  dispatchUpdate(key);

  if (key === KEYS.settings) {
    // Single document
    setDoc(doc(db, "meta", "settings"), value as Record<string, unknown>).catch(
      (e) => console.error("[Store] settings write failed", e)
    );
    return;
  }
  if (COLLECTIONS[key]) {
    void pushCollectionDiff(
      key,
      (prev as AnyDoc[] | undefined) ?? [],
      value as unknown as AnyDoc[]
    );
  }
}

// ---------- Firestore listeners ----------

let listenersStarted = false;
let seedAttempted = false;
const loadedKeys = new Set<string>();

export function isCollectionLoaded(key: string): boolean {
  return loadedKeys.has(key);
}

function startListeners() {
  if (listenersStarted || typeof window === "undefined") return;
  listenersStarted = true;

  for (const [lsKey, collName] of Object.entries(COLLECTIONS)) {
    onSnapshot(
      collection(db, collName),
      (snap) => {
        const arr: AnyDoc[] = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as object) }) as AnyDoc
        );
        cache.set(lsKey, arr);
        lsWrite(lsKey, arr);
        loadedKeys.add(lsKey);
        dispatchUpdate(lsKey);
        if (lsKey === KEYS.menuProfiles) {
          applyMenuProfileSchedule();
          autoDedupeMenuProfiles();
        }
        if (lsKey === KEYS.categories) {
          autoDedupeBaseCategories();
        }
        if (!seedAttempted) maybeSeed();

      },
      (err) => {
        console.error(`[Store] snapshot error ${collName}`, err);
      }
    );
  }

  // Settings doc
  onSnapshot(
    doc(db, "meta", "settings"),
    (snap) => {
      if (snap.exists()) {
        const value = snap.data() as RestaurantSettings;
        cache.set(KEYS.settings, value);
        lsWrite(KEYS.settings, value);
        dispatchUpdate(KEYS.settings);
      }
    },
    (err) => console.error("[Store] settings snapshot error", err)
  );
}

async function maybeSeed() {
  if (seedAttempted) return;
  seedAttempted = true;

  // Only seed when every primary collection is currently empty in cache.
  const primaries = [KEYS.users, KEYS.categories, KEYS.items, KEYS.tables];
  const allEmpty = primaries.every((k) => {
    const v = cache.get(k) as unknown[] | undefined;
    return !v || v.length === 0;
  });
  if (!allEmpty) return;

  try {
    await seedDefaults();
  } catch (e) {
    console.error("[Store] seed failed", e);
    seedAttempted = false; // allow retry next snapshot tick
  }
}

async function seedDefaults() {
  // Generate a strong random password for the initial Super Admin account.
  // It is shown ONCE in the browser console — the admin must capture it on
  // first boot and rotate it from the Users page after login.
  const initialPassword = generateRandomPassword(16);
  const hashed = await hashPassword(initialPassword);
  // eslint-disable-next-line no-console
  console.warn(
    `\n========================================\n` +
      `[7 Spices] Initial Super Admin credentials\n` +
      `  email:    bhanja.sumit94.sb@gmail.com\n` +
      `  password: ${initialPassword}\n` +
      `Change this password immediately after first login.\n` +
      `========================================\n`
  );
  const superAdmin: User = {
    id: uid("user"),
    name: "Sumit Bhanja",
    email: "bhanja.sumit94.sb@gmail.com",
    password: hashed,
    role: "super_admin",
    active: true,
    createdAt: Date.now(),
  };

  const categories: MenuCategory[] = DEFAULT_CATEGORIES.map((c, i) => ({
    id: uid("cat"),
    name: c.name,
    order: i,
  }));

  const catByName: Record<string, string> = {};
  categories.forEach((c) => (catByName[c.name.toLowerCase()] = c.id));
  const items: MenuItem[] = DEFAULT_ITEMS.map((it) => {
    const next: MenuItem = {
      ...it,
      id: uid("item"),
      categoryId: categories[0]?.id || "",
    };
    const lname = next.name.toLowerCase();
    if (next.isBengali) {
      next.categoryId = catByName["bengali"] || next.categoryId;
      return next;
    }
    if (/soup/i.test(lname)) next.categoryId = catByName["soup sensation"];
    else if (
      /paneer butter|kadhai paneer|shahi paneer|mushroom masala|mushroom do pyaza|korma|mix veg|dal makhani|dal tadka|palak paneer|aloo gobi|aloo matar|chana masala/i.test(
        lname
      )
    )
      next.categoryId = catByName["veggie paradise"];
    else if (
      /manchurian|schezwan|stir fried|sweet.*sour|black bean/i.test(lname) &&
      /chicken/i.test(lname)
    )
      next.categoryId = catByName["chinese non-veg side dish"];
    else if (/manchurian|schezwan|stir fried/i.test(lname))
      next.categoryId = catByName["chinese veg side dish"];
    else if (
      /butter chicken|kadhai|chicken curry|chicken masala|rogan|do pyaza|handi|changezi|hyderabadi/i.test(
        lname
      ) &&
      !/tikka/i.test(lname) &&
      !/lollipop/i.test(lname)
    )
      next.categoryId = catByName["chicken corner"];
    else if (/mutton/i.test(lname)) next.categoryId = catByName["mutton paradise"];
    else if (/prawn/i.test(lname)) next.categoryId = catByName["prawns"];
    else if (/fish/i.test(lname)) next.categoryId = catByName["fish"];
    else if (
      /paneer|mushroom|veg |baby corn|corn|french fries|aloo 65|gobi|spring roll|honey chilli potato/i.test(
        lname
      ) &&
      !/biryani|rice|noodle/i.test(lname)
    )
      next.categoryId = catByName["veg starter"];
    else if (
      /chicken tikka|chicken tandoori|chicken chilli|chicken manchurian|chicken 65|chicken lollipop|dragon chicken|honey chilli chicken|chicken crispy|salt.*pepper/i.test(
        lname
      )
    )
      next.categoryId = catByName["non-veg starter"];
    else if (/grilled/i.test(lname)) next.categoryId = catByName["grill garden"];
    else if (/sizzler/i.test(lname)) next.categoryId = catByName["sizzler"];
    else if (/roti|naan|paratha|missi/i.test(lname))
      next.categoryId = catByName["indian breads"];
    else if (/pulao|steam rice|jeera rice/i.test(lname))
      next.categoryId = catByName["indian rice"];
    else if (/biryani/i.test(lname)) next.categoryId = catByName["biryani"];
    else if (/fried rice/i.test(lname)) next.categoryId = catByName["chinese rice"];
    else if (/noodle/i.test(lname)) next.categoryId = catByName["noodles"];
    else if (/salad/i.test(lname)) next.categoryId = catByName["salad"];
    else if (/combo/i.test(lname)) next.categoryId = catByName["combo"];
    else if (/mojito|lagoon|fizz|punch|smoothie|shake|coffee|soda|juice/i.test(lname))
      next.categoryId = catByName["mocktail"];
    else if (/gulab|rasgulla|ice cream|brownie|gajar|halwa|mishti doi|sandesh/i.test(lname))
      next.categoryId = catByName["dessert"];
    else if (/thali/i.test(lname)) next.categoryId = catByName["thali junction"];
    return next;
  });

  const tables: RestaurantTable[] = Array.from({ length: 20 }, (_, i) => ({
    id: uid("tbl"),
    number: i + 1,
    capacity: i % 5 === 0 ? 6 : 4,
    status: "available" as const,
    sortOrder: i + 1,
  }));

  const suppliers: Supplier[] = [
    { id: uid("sup"), name: "Fresh Farm Produce", phone: "9876543210", address: "Burdwan" },
    { id: uid("sup"), name: "Spice Traders Co.", phone: "9123456780", address: "Kolkata" },
  ];

  const inventory: InventoryItem[] = [
    { id: uid("inv"), name: "Basmati Rice", category: "Grains", quantity: 50, unit: "kg", minStock: 10, purchasePrice: 90, supplierId: suppliers[0].id, supplierName: suppliers[0].name, updatedAt: Date.now() },
    { id: uid("inv"), name: "Chicken", category: "Meat", quantity: 25, unit: "kg", minStock: 5, purchasePrice: 220, supplierId: suppliers[1].id, supplierName: suppliers[1].name, updatedAt: Date.now() },
    { id: uid("inv"), name: "Paneer", category: "Dairy", quantity: 8, unit: "kg", minStock: 5, purchasePrice: 280, supplierId: suppliers[0].id, supplierName: suppliers[0].name, updatedAt: Date.now() },
    { id: uid("inv"), name: "Onion", category: "Vegetables", quantity: 30, unit: "kg", minStock: 10, purchasePrice: 30, supplierId: suppliers[0].id, supplierName: suppliers[0].name, updatedAt: Date.now() },
    { id: uid("inv"), name: "Refined Oil", category: "Oil", quantity: 15, unit: "L", minStock: 5, purchasePrice: 160, supplierId: suppliers[1].id, supplierName: suppliers[1].name, updatedAt: Date.now() },
    { id: uid("inv"), name: "Tomato", category: "Vegetables", quantity: 12, unit: "kg", minStock: 5, purchasePrice: 40, supplierId: suppliers[0].id, supplierName: suppliers[0].name, updatedAt: Date.now() },
    { id: uid("inv"), name: "Cream", category: "Dairy", quantity: 4, unit: "L", minStock: 3, purchasePrice: 220, supplierId: suppliers[0].id, supplierName: suppliers[0].name, updatedAt: Date.now() },
    { id: uid("inv"), name: "Garam Masala", category: "Spices", quantity: 3, unit: "kg", minStock: 1, purchasePrice: 600, supplierId: suppliers[1].id, supplierName: suppliers[1].name, updatedAt: Date.now() },
  ];

  const batch = writeBatch(db);
  batch.set(doc(db, "users", superAdmin.id), superAdmin as unknown as Record<string, unknown>);
  categories.forEach((c) => batch.set(doc(db, "categories", c.id), c as unknown as Record<string, unknown>));
  tables.forEach((t) => batch.set(doc(db, "tables", t.id), t as unknown as Record<string, unknown>));
  suppliers.forEach((s) => batch.set(doc(db, "suppliers", s.id), s as unknown as Record<string, unknown>));
  inventory.forEach((i) => batch.set(doc(db, "inventory", i.id), i as unknown as Record<string, unknown>));
  batch.set(doc(db, "meta", "settings"), DEFAULT_SETTINGS as unknown as Record<string, unknown>);
  await batch.commit();

  // Items can blow past 500 ops on their own – split into chunks.
  for (let i = 0; i < items.length; i += 400) {
    const b = writeBatch(db);
    items.slice(i, i + 400).forEach((it) =>
      b.set(doc(db, "items", it.id), it as unknown as Record<string, unknown>)
    );
    await b.commit();
  }
}

// Kick off listeners immediately on module load.
if (typeof window !== "undefined") {
  try {
    startListeners();
  } catch (e) {
    console.error("[Store] failed to start listeners", e);
  }
}

// Public no-op kept for backwards compatibility with original callers.
export function seedIfNeeded() {
  // Seeding is now driven from the Firestore snapshot listener; the
  // first time every primary collection is empty we write defaults.
  startListeners();
}

// ---------- Active Menu Profile helpers + scheduler ----------

function getActiveProfile(): MenuProfile | null {
  const list = (cache.get(KEYS.menuProfiles) as MenuProfile[] | undefined) ??
    lsRead<MenuProfile[]>(KEYS.menuProfiles, []);
  return list.find((p) => p.isActive) ?? null;
}

// Evaluate scheduled windows and flip isActive flags accordingly.
// Runs on every snapshot update for menuProfiles and on a 60s tick.
let scheduleTickRunning = false;
function applyMenuProfileSchedule() {
  if (scheduleTickRunning) return;
  scheduleTickRunning = true;
  try {
    const list = (cache.get(KEYS.menuProfiles) as MenuProfile[] | undefined) ?? [];
    if (list.length === 0) return;
    const now = Date.now();
    let changed = false;
    const next = list.map((p) => {
      if (p.archived) {
        if (p.isActive) {
          changed = true;
          return { ...p, isActive: false, updatedAt: now };
        }
        return p;
      }
      // Auto-deactivate if endDate has passed (autoRevert defaults to true).
      if (p.isActive && p.endDate && p.endDate < now && p.autoRevert !== false) {
        changed = true;
        return { ...p, isActive: false, updatedAt: now };
      }
      // Auto-activate ONLY when autoActivate is explicitly enabled.
      if (
        !p.isActive &&
        p.autoActivate &&
        p.startDate &&
        p.startDate <= now &&
        (!p.endDate || p.endDate > now)
      ) {
        changed = true;
        return { ...p, isActive: true, updatedAt: now };
      }
      return p;
    });
    if (!changed) return;
    const newlyActive = next.find((p, i) => p.isActive && !list[i].isActive);
    if (newlyActive) {
      for (let i = 0; i < next.length; i++) {
        if (next[i].id !== newlyActive.id && next[i].isActive) {
          next[i] = { ...next[i], isActive: false, updatedAt: now };
        }
      }
    }
    write(KEYS.menuProfiles, next);
  } finally {
    scheduleTickRunning = false;
  }
}

// One-shot auto-cleanup: when the menuProfiles snapshot arrives, sweep
// each profile for duplicate categories (case-insensitive name match)
// and merge them. Tracked per profile id so we only attempt cleanup
// once per session even if the snapshot fires many times.
const dedupedOnce = new Set<string>();
function autoDedupeMenuProfiles() {
  const list =
    (cache.get(KEYS.menuProfiles) as MenuProfile[] | undefined) ?? [];
  for (const p of list) {
    if (dedupedOnce.has(p.id)) continue;
    dedupedOnce.add(p.id);
    const cats = p.categories ?? [];
    const seen = new Set<string>();
    let hasDupe = false;
    for (const c of cats) {
      const k = c.name.trim().toLowerCase();
      if (seen.has(k)) {
        hasDupe = true;
        break;
      }
      seen.add(k);
    }
    if (hasDupe) {
      try {
        Store.dedupeProfileCategories(p.id);
      } catch (e) {
        console.error("[Store] autoDedupe failed", e);
      }
    }
  }
}

// One-shot auto-cleanup for the base `categories` collection. Runs the
// first time the snapshot reveals duplicate category names so legacy data
// heals itself without admin action.
let baseDedupeDone = false;
function autoDedupeBaseCategories() {
  if (baseDedupeDone) return;
  const cats =
    (cache.get(KEYS.categories) as MenuCategory[] | undefined) ?? [];
  if (cats.length === 0) return;
  const seen = new Set<string>();
  let dupe = false;
  for (const c of cats) {
    const k = c.name.trim().toLowerCase();
    if (seen.has(k)) {
      console.warn("Duplicate category detected:", c.name);
      dupe = true;
    } else {
      seen.add(k);
    }
  }
  if (!dupe) {
    baseDedupeDone = true;
    return;
  }
  baseDedupeDone = true;
  try {
    Store.dedupeBaseCategories();
  } catch (e) {
    console.error("[Store] autoDedupeBaseCategories failed", e);
  }
}


if (typeof window !== "undefined") {
  // Recheck schedules every minute.
  setInterval(applyMenuProfileSchedule, 60_000);
}

// ---------- Store API (synchronous, cache-backed) ----------

export const Store = {
  uid,
  KEYS,

  // Users
  listUsers: (): User[] => read(KEYS.users, []),
  saveUsers: (users: User[]) => write(KEYS.users, users),
  findUserByEmail: (email: string): User | undefined =>
    read<User[]>(KEYS.users, []).find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    ),
  addUser: (u: User) => {
    const list = Store.listUsers();
    Store.saveUsers([...list, u]);
  },
  updateUser: (id: string, patch: Partial<User>) => {
    Store.saveUsers(
      Store.listUsers().map((u) => (u.id === id ? { ...u, ...patch } : u))
    );
  },
  deleteUser: (id: string) => {
    Store.saveUsers(Store.listUsers().filter((u) => u.id !== id));
  },

  // Session (device-local). NEVER stores the password field.
  getSession: (): Omit<User, "password"> | null =>
    lsRead<Omit<User, "password"> | null>(KEYS.session, null),
  setSession: (user: Omit<User, "password"> | User | null) => {
    if (user && "password" in user) {
      const { password: _pw, ...rest } = user as User;
      void _pw;
      lsWrite(KEYS.session, rest);
    } else {
      lsWrite(KEYS.session, user);
    }
    dispatchUpdate(KEYS.session);
  },
  clearSession: () => {
    try {
      localStorage.removeItem(KEYS.session);
    } catch {
      /* ignore */
    }
    dispatchUpdate(KEYS.session);
  },

  // ── Categories / Items ──
  // When a Menu Profile is active, reads/writes are routed to its
  // embedded categories/items so the entire POS / Billing / QR / KOT
  // surface switches in one shot. When no profile is active, the
  // base `categories` / `items` collections are used.
  listCategories: (): MenuCategory[] => {
    const ap = getActiveProfile();
    if (ap) {
      const items = ap.items ?? [];
      // Only festival categories that are not hidden AND have at least
      // one item. Regular-menu categories that aren't in the festival
      // profile must NOT leak through.
      return (ap.categories ?? []).filter(
        (c) => !c.hidden && items.some((i) => i.categoryId === c.id)
      );
    }
    return read(KEYS.categories, []);
  },
  saveCategories: (cats: MenuCategory[]) => {
    const ap = getActiveProfile();
    if (ap) {
      Store.updateMenuProfile(ap.id, { categories: cats });
      return;
    }
    write(KEYS.categories, cats);
  },
  addCategory: (name: string) => {
    const list = Store.listCategories();
    const cat: MenuCategory = { id: uid("cat"), name, order: list.length };
    Store.saveCategories([...list, cat]);
  },
  deleteCategory: (id: string) => {
    Store.saveCategories(Store.listCategories().filter((c) => c.id !== id));
    Store.saveItems(Store.listItems().filter((i) => i.categoryId !== id));
  },

  // Items
  listItems: (): MenuItem[] => {
    const ap = getActiveProfile();
    if (ap) {
      const visibleCats = new Set(
        (ap.categories ?? []).filter((c) => !c.hidden).map((c) => c.id)
      );
      return (ap.items ?? []).filter((i) => visibleCats.has(i.categoryId));
    }
    return read(KEYS.items, []);
  },
  saveItems: (items: MenuItem[]) => {
    const ap = getActiveProfile();
    if (ap) {
      Store.updateMenuProfile(ap.id, { items });
      return;
    }
    write(KEYS.items, items);
  },
  addItem: (it: Omit<MenuItem, "id">) => {
    Store.saveItems([...Store.listItems(), { ...it, id: uid("item") }]);
  },
  updateItem: (id: string, patch: Partial<MenuItem>) => {
    Store.saveItems(
      Store.listItems().map((i) => (i.id === id ? { ...i, ...patch } : i))
    );
  },
  deleteItem: (id: string) => {
    Store.saveItems(Store.listItems().filter((i) => i.id !== id));
  },

  // ── Menu Profiles ──
  listMenuProfiles: (): MenuProfile[] => read(KEYS.menuProfiles, []),
  getActiveMenuProfile: (): MenuProfile | null => getActiveProfile(),
  getBaseCategories: (): MenuCategory[] => read(KEYS.categories, []),
  getBaseItems: (): MenuItem[] => read(KEYS.items, []),
  addMenuProfile: (p: Omit<MenuProfile, "id" | "createdAt">): MenuProfile => {
    const entry: MenuProfile = {
      ...p,
      id: uid("mp"),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    write(KEYS.menuProfiles, [...Store.listMenuProfiles(), entry]);
    return entry;
  },
  updateMenuProfile: (id: string, patch: Partial<MenuProfile>) => {
    write(
      KEYS.menuProfiles,
      Store.listMenuProfiles().map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
      )
    );
  },
  deleteMenuProfile: (id: string) => {
    write(
      KEYS.menuProfiles,
      Store.listMenuProfiles().filter((p) => p.id !== id)
    );
  },
  activateMenuProfile: (id: string | null) => {
    const list = Store.listMenuProfiles();
    // Refuse to activate archived profiles.
    if (id && list.find((p) => p.id === id)?.archived) return;
    const next = list.map((p) => ({
      ...p,
      isActive: p.id === id,
      updatedAt: Date.now(),
    }));
    write(KEYS.menuProfiles, next);
  },
  archiveMenuProfile: (id: string, archived = true) => {
    const list = Store.listMenuProfiles();
    const next = list.map((p) =>
      p.id === id
        ? { ...p, archived, isActive: archived ? false : p.isActive, updatedAt: Date.now() }
        : p
    );
    write(KEYS.menuProfiles, next);
  },
  duplicateCurrentMenuAsProfile: (
    name: string,
    opts: {
      description?: string;
      startDate?: number;
      endDate?: number;
      createdBy: string;
      createdByName?: string;
    }
  ): MenuProfile => {
    // Always duplicate the CURRENTLY VISIBLE menu (which may itself be
    // the active profile or the base menu).
    const cats = Store.listCategories().map((c) => ({ ...c }));
    const items = Store.listItems().map((i) => ({ ...i }));
    return Store.addMenuProfile({
      name,
      description: opts.description,
      isActive: false,
      startDate: opts.startDate,
      endDate: opts.endDate,
      createdBy: opts.createdBy,
      createdByName: opts.createdByName,
      categories: cats,
      items,
    });
  },

  // ── Profile-scoped item helpers ───────────────────────────────
  // These mutate a SPECIFIC profile's embedded items array. They
  // never touch the base menu, never touch any other profile, and
  // never depend on which profile is currently active.
  listProfileItems: (profileId: string): MenuItem[] => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    return p?.items ?? [];
  },
  listProfileCategories: (profileId: string): MenuCategory[] => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    return p?.categories ?? [];
  },
  addItemToProfile: (
    profileId: string,
    item: Omit<MenuItem, "id">
  ): MenuItem | null => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return null;
    // Update-in-place if an item with the same name already exists in
    // the same category (case-insensitive). Prevents duplicates from
    // "Add Item" re-clicks or repeated imports.
    const key = item.name.trim().toLowerCase();
    const existing = (p.items ?? []).find(
      (i) =>
        i.categoryId === item.categoryId &&
        i.name.trim().toLowerCase() === key
    );
    if (existing) {
      Store.updateMenuProfile(profileId, {
        items: (p.items ?? []).map((i) =>
          i.id === existing.id ? { ...i, ...item, id: existing.id } : i
        ),
      });
      return { ...existing, ...item, id: existing.id };
    }
    const entry: MenuItem = { ...item, id: uid("item") };
    Store.updateMenuProfile(profileId, { items: [...(p.items ?? []), entry] });
    return entry;
  },
  updateItemInProfile: (
    profileId: string,
    itemId: string,
    patch: Partial<MenuItem>
  ) => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return;
    Store.updateMenuProfile(profileId, {
      items: (p.items ?? []).map((i) =>
        i.id === itemId ? { ...i, ...patch } : i
      ),
    });
  },
  deleteItemFromProfile: (profileId: string, itemId: string) => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return;
    Store.updateMenuProfile(profileId, {
      items: (p.items ?? []).filter((i) => i.id !== itemId),
    });
  },
  duplicateItemInProfile: (
    profileId: string,
    itemId: string
  ): MenuItem | null => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return null;
    const src = (p.items ?? []).find((i) => i.id === itemId);
    if (!src) return null;
    const copy: MenuItem = {
      ...src,
      id: uid("item"),
      name: `${src.name} (Copy)`,
    };
    Store.updateMenuProfile(profileId, { items: [...(p.items ?? []), copy] });
    return copy;
  },
  // Copy an item from the BASE (regular) menu into a profile. Brings
  // the item's category over — creating a matching category inside
  // the profile if one with the same name doesn't already exist.
  copyBaseItemToProfile: (
    profileId: string,
    baseItemId: string
  ): MenuItem | null => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return null;
    const baseItem = Store.getBaseItems().find((i) => i.id === baseItemId);
    if (!baseItem) return null;
    const dup = (p.items ?? []).find(
      (i) =>
        i.name.trim().toLowerCase() === baseItem.name.trim().toLowerCase()
    );
    if (dup) return dup;
    let categories = [...(p.categories ?? [])];
    let categoryId = categories.find((c) => c.id === baseItem.categoryId)?.id;
    if (!categoryId) {
      const baseCat = Store.getBaseCategories().find(
        (c) => c.id === baseItem.categoryId
      );
      if (baseCat) {
        const match = categories.find(
          (c) =>
            c.name.trim().toLowerCase() === baseCat.name.trim().toLowerCase()
        );
        if (match) {
          categoryId = match.id;
        } else {
          const newCat: MenuCategory = {
            id: uid("cat"),
            name: baseCat.name,
            order: categories.length,
          };
          categories = [...categories, newCat];
          categoryId = newCat.id;
        }
      } else {
        categoryId = categories[0]?.id ?? "";
      }
    }
    const copy: MenuItem = { ...baseItem, id: uid("item"), categoryId };
    Store.updateMenuProfile(profileId, {
      categories,
      items: [...(p.items ?? []), copy],
    });
    return copy;
  },

  // Profile category helpers — only mutate the named profile's snapshot.
  // Enforces case-insensitive name uniqueness: if a category with the
  // same name already exists, returns it instead of creating a duplicate.
  addCategoryToProfile: (profileId: string, name: string): MenuCategory | null => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return null;
    const cats = p.categories ?? [];
    const key = name.trim().toLowerCase();
    const existing = cats.find((c) => c.name.trim().toLowerCase() === key);
    if (existing) return existing;
    const cat: MenuCategory = { id: uid("cat"), name: name.trim(), order: cats.length };
    Store.updateMenuProfile(profileId, { categories: [...cats, cat] });
    return cat;
  },
  // Merge duplicate categories (case-insensitive name match) inside a
  // profile. Items are moved into the FIRST occurrence of the category,
  // duplicate items (same name within the same category) are collapsed
  // into one, and empty duplicate category records are removed. Returns
  // a summary of what was cleaned up.
  dedupeProfileCategories: (
    profileId: string
  ): { mergedCategories: number; mergedItems: number } => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return { mergedCategories: 0, mergedItems: 0 };
    const cats = [...(p.categories ?? [])];
    const items = [...(p.items ?? [])];
    // First occurrence per lowercased name wins; build id remap.
    const firstByName = new Map<string, MenuCategory>();
    const remap = new Map<string, string>(); // duplicateId -> primaryId
    for (const c of cats) {
      const key = c.name.trim().toLowerCase();
      const first = firstByName.get(key);
      if (!first) {
        firstByName.set(key, c);
      } else {
        remap.set(c.id, first.id);
      }
    }
    const mergedCategories = remap.size;
    // Reassign item.categoryId for any items pointing at a duplicate.
    const remappedItems = items.map((i) =>
      remap.has(i.categoryId)
        ? { ...i, categoryId: remap.get(i.categoryId) as string }
        : i
    );
    // Collapse duplicate items (same name within the same category).
    const itemKey = (i: MenuItem) =>
      `${i.categoryId}::${i.name.trim().toLowerCase()}`;
    const seenItems = new Map<string, MenuItem>();
    let mergedItems = 0;
    for (const it of remappedItems) {
      const k = itemKey(it);
      if (seenItems.has(k)) {
        mergedItems++;
        continue;
      }
      seenItems.set(k, it);
    }
    // Drop the duplicate category records and renumber order.
    const dedupedCats = cats
      .filter((c) => !remap.has(c.id))
      .map((c, i) => ({ ...c, order: i }));
    if (mergedCategories === 0 && mergedItems === 0) {
      return { mergedCategories: 0, mergedItems: 0 };
    }
    Store.updateMenuProfile(profileId, {
      categories: dedupedCats,
      items: Array.from(seenItems.values()),
    });
    return { mergedCategories, mergedItems };
  },

  // Merge duplicate categories in the BASE `categories` collection
  // (case-insensitive name match). Items in duplicate categories are
  // reassigned to the kept (first) category and duplicate category
  // records are deleted. Writes through `write()` so Firestore mirrors
  // the change.
  dedupeBaseCategories: (): { mergedCategories: number; movedItems: number } => {
    const cats = [...read<MenuCategory[]>(KEYS.categories, [])];
    if (cats.length === 0) return { mergedCategories: 0, movedItems: 0 };
    // Stable sort by `order` then name so the "oldest"/first category wins.
    cats.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const firstByName = new Map<string, MenuCategory>();
    const remap = new Map<string, string>();
    for (const c of cats) {
      const k = c.name.trim().toLowerCase();
      const first = firstByName.get(k);
      if (!first) firstByName.set(k, c);
      else {
        console.warn("Duplicate category detected:", c.name);
        remap.set(c.id, first.id);
      }
    }
    const mergedCategories = remap.size;
    if (mergedCategories === 0) return { mergedCategories: 0, movedItems: 0 };
    const items = read<MenuItem[]>(KEYS.items, []);
    let movedItems = 0;
    const nextItems = items.map((i) => {
      if (remap.has(i.categoryId)) {
        movedItems++;
        return { ...i, categoryId: remap.get(i.categoryId) as string };
      }
      return i;
    });
    const nextCats = cats
      .filter((c) => !remap.has(c.id))
      .map((c, i) => ({ ...c, order: i }));
    write(KEYS.categories, nextCats);
    if (movedItems > 0) write(KEYS.items, nextItems);
    return { mergedCategories, movedItems };
  },

  renameCategoryInProfile: (profileId: string, catId: string, name: string) => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return;
    Store.updateMenuProfile(profileId, {
      categories: (p.categories ?? []).map((c) =>
        c.id === catId ? { ...c, name: name.trim() } : c
      ),
    });
  },
  deleteCategoryFromProfile: (profileId: string, catId: string) => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return;
    Store.updateMenuProfile(profileId, {
      categories: (p.categories ?? []).filter((c) => c.id !== catId),
      items: (p.items ?? []).filter((i) => i.categoryId !== catId),
    });
  },
  reorderCategoryInProfile: (
    profileId: string,
    catId: string,
    direction: -1 | 1
  ) => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return;
    const cats = [...(p.categories ?? [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
    const idx = cats.findIndex((c) => c.id === catId);
    if (idx < 0) return;
    const swap = idx + direction;
    if (swap < 0 || swap >= cats.length) return;
    [cats[idx], cats[swap]] = [cats[swap], cats[idx]];
    const renumbered = cats.map((c, i) => ({ ...c, order: i }));
    Store.updateMenuProfile(profileId, { categories: renumbered });
  },
  setCategoryHiddenInProfile: (
    profileId: string,
    catId: string,
    hidden: boolean
  ) => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return;
    Store.updateMenuProfile(profileId, {
      categories: (p.categories ?? []).map((c) =>
        c.id === catId ? { ...c, hidden } : c
      ),
    });
  },
  // Batch import items from the base menu into a profile. Creates any
  // missing categories (matched by name) in one write. Returns count.
  copyBaseItemsToProfile: (
    profileId: string,
    baseItemIds: string[]
  ): number => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return 0;
    const baseItems = Store.getBaseItems();
    const baseCats = Store.getBaseCategories();
    let categories = [...(p.categories ?? [])];
    const items = [...(p.items ?? [])];
    const existingNames = new Set(
      items.map((i) => i.name.trim().toLowerCase())
    );
    let added = 0;
    for (const bid of baseItemIds) {
      const bi = baseItems.find((i) => i.id === bid);
      if (!bi) continue;
      const key = bi.name.trim().toLowerCase();
      if (existingNames.has(key)) continue;
      let categoryId = categories.find((c) => c.id === bi.categoryId)?.id;
      if (!categoryId) {
        const baseCat = baseCats.find((c) => c.id === bi.categoryId);
        if (baseCat) {
          const match = categories.find(
            (c) =>
              c.name.trim().toLowerCase() ===
              baseCat.name.trim().toLowerCase()
          );
          if (match) categoryId = match.id;
          else {
            const newCat: MenuCategory = {
              id: uid("cat"),
              name: baseCat.name,
              order: categories.length,
            };
            categories = [...categories, newCat];
            categoryId = newCat.id;
          }
        } else {
          categoryId = categories[0]?.id ?? "";
        }
      }
      items.push({ ...bi, id: uid("item"), categoryId });
      existingNames.add(key);
      added++;
    }
    Store.updateMenuProfile(profileId, { categories, items });
    return added;
  },
  // Import every base item in a single category into the profile.
  copyBaseCategoryToProfile: (
    profileId: string,
    baseCategoryId: string
  ): number => {
    const ids = Store.getBaseItems()
      .filter((i) => i.categoryId === baseCategoryId)
      .map((i) => i.id);
    return Store.copyBaseItemsToProfile(profileId, ids);
  },
  // Import the entire regular menu into the profile.
  copyAllBaseItemsToProfile: (profileId: string): number => {
    const ids = Store.getBaseItems().map((i) => i.id);
    return Store.copyBaseItemsToProfile(profileId, ids);
  },
  bulkPriceUpdateProfile: (
    profileId: string,
    mode: "increase" | "decrease" | "round5" | "round10",
    percent = 0,
    categoryId?: string
  ) => {
    const p = Store.listMenuProfiles().find((x) => x.id === profileId);
    if (!p) return;
    const factor =
      mode === "increase" ? 1 + percent / 100 :
      mode === "decrease" ? 1 - percent / 100 : 1;
    const roundTo = mode === "round5" ? 5 : mode === "round10" ? 10 : 0;
    const items = (p.items ?? []).map((i) => {
      if (categoryId && i.categoryId !== categoryId) return i;
      let np = i.price * factor;
      if (roundTo > 0) np = Math.round(np / roundTo) * roundTo;
      np = Math.max(0, Math.round(np * 100) / 100);
      return { ...i, price: np };
    });
    Store.updateMenuProfile(profileId, { items });
  },

  listTables: (): RestaurantTable[] => read(KEYS.tables, []),
  saveTables: (tables: RestaurantTable[]) => {
    write(KEYS.tables, Store.repairSplitMetadataFor(tables));
  },
  computeNextSortOrder: (number: number): number => {
    const list = Store.listTables();
    const sameNumber = list.filter(
      (t) => t.number === number && !t.sectionLabel
    );
    if (sameNumber.length > 0) {
      return Math.max(...sameNumber.map((t) => t.sortOrder ?? t.number));
    }
    const allSortOrders = list
      .map((t) => t.sortOrder ?? t.number)
      .filter((n) => Number.isFinite(n));
    const max = allSortOrders.length ? Math.max(...allSortOrders) : 0;
    return Math.max(max + 1, number);
  },
  addTable: (number: number, capacity: number) => {
    const list = Store.listTables();
    const sortOrder = Store.computeNextSortOrder(number);
    const t: RestaurantTable = {
      id: uid("tbl"),
      number,
      capacity,
      status: "available",
      sortOrder,
    };
    write(KEYS.tables, Store.repairSplitMetadataFor([...list, t]));
  },
  addTableRaw: (table: RestaurantTable) => {
    const list = Store.listTables();
    if (table.sortOrder === undefined) {
      if (table.parentTableId && table.sectionLabel) {
        const parent = list.find((t) => t.id === table.parentTableId);
        const base = parent?.sortOrder ?? parent?.number ?? table.number;
        const sectionIndex =
          table.sectionLabel.charCodeAt(0) - "A".charCodeAt(0);
        table.sortOrder = base + (sectionIndex + 1) * 0.1;
      } else {
        table.sortOrder = table.number;
      }
    }
    write(KEYS.tables, Store.repairSplitMetadataFor([...list, table]));
  },
  repairSplitMetadataFor: (tables: RestaurantTable[]): RestaurantTable[] => {
    const childrenByParent = new Map<string, RestaurantTable[]>();
    tables.forEach((t) => {
      if (t.parentTableId) {
        const arr = childrenByParent.get(t.parentTableId) ?? [];
        arr.push(t);
        childrenByParent.set(t.parentTableId, arr);
      }
    });
    return tables.map((t) => {
      if (t.parentTableId) {
        return { ...t, isSplitSection: true };
      }
      const kids = childrenByParent.get(t.id) ?? [];
      if (kids.length === 0) {
        if (
          t.isSplit === undefined &&
          t.childTables === undefined &&
          t.splitSections === undefined &&
          t.compositionNote === undefined
        ) {
          return t;
        }
        return {
          ...t,
          isSplit: false,
          childTables: [],
          splitSections: 0,
          compositionNote: undefined,
          status: t.status === "split" ? "available" : t.status,
        };
      }
      const childIds = kids.map((k) => k.id);
      const labels = kids
        .map((k) => k.sectionLabel)
        .filter((s): s is string => !!s)
        .join(" and ");
      const expectedNote = `Split into ${
        labels || kids.map((k) => k.id).join(" and ")
      }`;
      return {
        ...t,
        isSplit: true,
        childTables: childIds,
        splitSections: kids.length,
        compositionNote:
          t.compositionNote && t.compositionNote.length > expectedNote.length
            ? t.compositionNote
            : expectedNote,
        status: "split",
      };
    });
  },
  ensureSplitMetadata: () => {
    const current = read<RestaurantTable[]>(KEYS.tables, []);
    const repaired = Store.repairSplitMetadataFor(current);
    const changed = current.some(
      (c, i) => JSON.stringify(c) !== JSON.stringify(repaired[i])
    );
    if (changed) write(KEYS.tables, repaired);
  },
  repairSplitMetadata: () => Store.ensureSplitMetadata(),
  updateTable: (id: string, patch: Partial<RestaurantTable>) => {
    const next = Store.listTables().map((t) =>
      t.id === id ? { ...t, ...patch } : t
    );
    write(KEYS.tables, Store.repairSplitMetadataFor(next));
  },
  deleteTable: (id: string) => {
    write(
      KEYS.tables,
      Store.repairSplitMetadataFor(
        Store.listTables().filter((t) => t.id !== id)
      )
    );
  },

  // Orders
  listOrders: (): Order[] => read(KEYS.orders, []),
  saveOrders: (orders: Order[]) => write(KEYS.orders, orders),
  addOrder: (o: Order) => {
    Store.saveOrders([o, ...Store.listOrders()]);
  },
  findActiveOrderForTable: (tableId: string): Order | null => {
    const list = Store.listOrders();
    const candidates = list
      .filter((o) => o.tableId === tableId)
      .filter((o) => !["paid", "cancelled", "completed"].includes(o.status))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return candidates[0] ?? null;
  },
  appendItemsToOrder: (
    orderId: string,
    newItems: OrderItem[]
  ): Order | null => {
    const all = Store.listOrders();
    const idx = all.findIndex((o) => o.id === orderId);
    if (idx === -1) return null;
    const order = all[idx];
    const merged: OrderItem[] = order.items.slice();
    newItems.forEach((ni) => {
      const existingIdx = merged.findIndex(
        (m) => m.menuItemId === ni.menuItemId
      );
      if (existingIdx >= 0) {
        merged[existingIdx] = {
          ...merged[existingIdx],
          quantity: merged[existingIdx].quantity + ni.quantity,
        };
      } else {
        merged.push(ni);
      }
    });
    const subtotal = merged.reduce((s, i) => s + i.price * i.quantity, 0);
    const afterDiscount = Math.max(0, subtotal - (order.discount || 0));
    const cgst =
      order.gstPercent > 0 ? (afterDiscount * (order.gstPercent / 2)) / 100 : 0;
    const sgst =
      order.gstPercent > 0 ? (afterDiscount * (order.gstPercent / 2)) / 100 : 0;
    const grandTotal = afterDiscount + cgst + sgst;
    const alreadyPaid = order.amountPaid ?? 0;
    const balanceDue = Math.max(0, grandTotal - alreadyPaid);
    const next: Order = {
      ...order,
      items: merged,
      subtotal,
      cgst,
      sgst,
      grandTotal,
      balanceDue,
      updatedAt: Date.now(),
    };
    all[idx] = next;
    Store.saveOrders(all);
    return next;
  },
  updateOrder: (id: string, patch: Partial<Order>) => {
    Store.saveOrders(
      Store.listOrders().map((o) =>
        o.id === id ? { ...o, ...patch, updatedAt: Date.now() } : o
      )
    );
  },
  getNextBillNumber: (): string => {
    const list = Store.listOrders();
    const year = new Date().getFullYear();
    const yearPrefix = `B${year}-`;
    const seq = list.length + 1;
    return `${yearPrefix}${String(seq).padStart(5, "0")}`;
  },

  // Inventory
  listInventory: (): InventoryItem[] => read(KEYS.inventory, []),
  saveInventory: (items: InventoryItem[]) => write(KEYS.inventory, items),
  addInventoryItem: (it: Omit<InventoryItem, "id" | "updatedAt">) => {
    Store.saveInventory([
      ...Store.listInventory(),
      { ...it, id: uid("inv"), updatedAt: Date.now() },
    ]);
  },
  updateInventoryItem: (id: string, patch: Partial<InventoryItem>) => {
    Store.saveInventory(
      Store.listInventory().map((i) =>
        i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i
      )
    );
  },
  deleteInventoryItem: (id: string) => {
    Store.saveInventory(Store.listInventory().filter((i) => i.id !== id));
  },

  // Suppliers
  listSuppliers: (): Supplier[] => read(KEYS.suppliers, []),
  saveSuppliers: (s: Supplier[]) => write(KEYS.suppliers, s),
  addSupplier: (s: Omit<Supplier, "id">) => {
    Store.saveSuppliers([...Store.listSuppliers(), { ...s, id: uid("sup") }]);
  },
  deleteSupplier: (id: string) => {
    Store.saveSuppliers(Store.listSuppliers().filter((s) => s.id !== id));
  },

  // Expenses
  listExpenses: (): Expense[] => read(KEYS.expenses, []),
  saveExpenses: (e: Expense[]) => write(KEYS.expenses, e),
  addExpense: (e: Omit<Expense, "id">) => {
    Store.saveExpenses([...Store.listExpenses(), { ...e, id: uid("exp") }]);
  },
  deleteExpense: (id: string) => {
    Store.saveExpenses(Store.listExpenses().filter((e) => e.id !== id));
  },

  // Payments
  listPayments: (): Payment[] => read(KEYS.payments, []),
  addPayment: (p: Payment) => {
    write(KEYS.payments, [...Store.listPayments(), p]);
  },

  // Settings
  getSettings: (): RestaurantSettings =>
    read(KEYS.settings, DEFAULT_SETTINGS),
  saveSettings: (s: RestaurantSettings) => write(KEYS.settings, s),

  // Audit
  listAudit: (): AuditLog[] => read(KEYS.audit, []),
  addAudit: (a: Omit<AuditLog, "id" | "timestamp">) => {
    const entry: AuditLog = {
      ...a,
      id: uid("log"),
      timestamp: Date.now(),
    } as AuditLog;
    const list = [entry, ...Store.listAudit()].slice(0, 500);
    write(KEYS.audit, list);
  },

  // Notifications
  listNotifications: (): Notification[] => read(KEYS.notifications, []),
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => {
    const entry: Notification = {
      ...n,
      id: uid("not"),
      timestamp: Date.now(),
      read: false,
    } as Notification;
    const list = [entry, ...Store.listNotifications()].slice(0, 50);
    write(KEYS.notifications, list);
  },
  markNotificationsRead: () => {
    write(
      KEYS.notifications,
      Store.listNotifications().map((n) => ({ ...n, read: true }))
    );
  },
  removeNotificationsForOrder: (orderId: string) => {
    write(
      KEYS.notifications,
      Store.listNotifications().filter((n) => n.orderId !== orderId)
    );
  },

  // Logo (device-local)
  getLogo: (): string | null => {
    try {
      return localStorage.getItem(LOGO_KEY);
    } catch {
      return null;
    }
  },
  setLogo: (dataUrl: string) => {
    try {
      localStorage.setItem(LOGO_KEY, dataUrl);
    } catch {
      /* ignore quota */
    }
    dispatchUpdate(LOGO_KEY);
  },
  removeLogo: () => {
    try {
      localStorage.removeItem(LOGO_KEY);
    } catch {
      /* ignore */
    }
    dispatchUpdate(LOGO_KEY);
  },

  // Backup / restore
  exportAll: (): string => {
    const dump: Record<string, unknown> = {};
    Object.values(KEYS).forEach((k) => {
      const v = cache.get(k);
      if (v !== undefined) dump[k] = v;
    });
    const logo =
      typeof window !== "undefined" ? localStorage.getItem(LOGO_KEY) : null;
    if (logo) dump[LOGO_KEY] = logo;
    return JSON.stringify(dump, null, 2);
  },
  importAll: (json: string) => {
    const dump = JSON.parse(json) as Record<string, unknown>;
    Object.entries(dump).forEach(([k, v]) => {
      if (k === LOGO_KEY && typeof v === "string") {
        try {
          localStorage.setItem(LOGO_KEY, v);
        } catch {
          /* ignore */
        }
        dispatchUpdate(LOGO_KEY);
      } else {
        write(k, v);
      }
    });
  },

  resetBusinessData: async () => {
    write(KEYS.orders, []);
    write(KEYS.payments, []);
    write(KEYS.expenses, []);
    write(KEYS.audit, []);
    write(KEYS.notifications, []);
    const tables = read<RestaurantTable[]>(KEYS.tables, []);
    write(
      KEYS.tables,
      tables.map((t) => ({
        ...t,
        status: "available",
        currentOrderId: undefined,
        mergedWith: undefined,
        sectionLabel: undefined,
        sectionCapacity: undefined,
        parentTableId: undefined,
        compositionNote: undefined,
      }))
    );
    dispatchUpdate("all");
  },

  factoryReset: async () => {
    // Wipe every Firestore collection and the settings doc, then re-seed.
    try {
      for (const collName of Object.values(COLLECTIONS)) {
        const arr = (cache.get(
          Object.keys(COLLECTIONS).find((k) => COLLECTIONS[k] === collName)!
        ) as AnyDoc[] | undefined) ?? [];
        for (let i = 0; i < arr.length; i += 400) {
          const b = writeBatch(db);
          arr.slice(i, i + 400).forEach((d) =>
            b.delete(doc(db, collName, d.id))
          );
          await b.commit();
        }
      }
      await deleteDoc(doc(db, "meta", "settings")).catch(() => {});
    } catch (e) {
      console.error("[Store] factoryReset firestore wipe failed", e);
    }
    // Clear local state too.
    Object.values(KEYS).forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
      cache.delete(k);
    });
    try {
      localStorage.removeItem(LOGO_KEY);
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem("spices_qr_tokens");
      localStorage.removeItem("spices_qr_tokens_version");
    } catch {
      /* ignore */
    }
    seedAttempted = false;
    // Re-seed defaults so the next page load lands at login with the
    // default super admin available.
    try {
      await seedDefaults();
    } catch (e) {
      console.error("[Store] re-seed after factory reset failed", e);
    }
    dispatchUpdate("all");
  },

  // ── Table options for POS / Waiter / QR ──────────────────────────
  buildTableOptions: (): {
    value: string;
    label: string;
    status: string;
    sortKey: number;
  }[] => {
    const list = Store.listTables();
    const filtered = list.filter((t) => {
      if (t.status === "split" && !t.parentTableId) return false;
      if (
        t.status === "merged" &&
        t.mergedWith &&
        t.mergedWith.length > 0
      ) {
        return false;
      }
      return true;
    });
    const statusBadge = (t: { status: string }) => {
      if (t.status === "occupied") return "🔴 Occupied";
      if (t.status === "reserved") return "🟡 Reserved";
      if (t.status === "split") return "🟣 Split";
      if (t.status === "merged") return "🔵 Merged";
      return "🟢 Free";
    };
    const sortKey = (t: { status: string }) => {
      if (t.status === "occupied") return 0;
      if (t.status === "reserved") return 1;
      return 2;
    };
    const items = filtered.map((t) => {
      let baseLabel: string;
      if (t.parentTableId && t.sectionLabel) {
        const parent = list.find((p) => p.id === t.parentTableId);
        const base = parent ? `${parent.number}` : `${t.sectionLabel}`;
        baseLabel = `Table ${base}${t.sectionLabel} (${t.sectionCapacity ?? t.capacity} seats)`;
      } else if (t.mergedWith && t.mergedWith.length > 0) {
        const others = t.mergedWith
          .map((id) => list.find((p) => p.id === id)?.number)
          .filter((n): n is number => typeof n === "number")
          .sort((a, b) => a - b);
        const all = [t.number, ...others].sort((a, b) => a - b).join("+");
        baseLabel = `Table ${all} (${t.capacity} seats)`;
      } else {
        baseLabel = `Table ${t.number} (${t.capacity} seats)`;
      }
      return {
        value: t.id,
        label: `${baseLabel} - ${statusBadge(t)}`,
        status: t.status,
        sortKey: sortKey(t),
        sortOrder: t.sortOrder ?? t.number,
      };
    });
    return items.sort((a, b) => {
      if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      return a.sortOrder - b.sortOrder;
    });
  },
};

// ---------- React hooks ----------

import { useEffect, useState } from "react";

export function useStore<T>(key: string, getter: () => T): T {
  const [val, setVal] = useState<T>(getter());
  useEffect(() => {
    const refresh = () => setVal(getter());
    window.addEventListener("spices:update", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("spices:update", refresh);
      window.removeEventListener("storage", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return val;
}

export function useLogo(): string | null {
  const [logo, setLogo] = useState<string | null>(() => Store.getLogo());
  useEffect(() => {
    const refresh = () => setLogo(Store.getLogo());
    window.addEventListener("spices:update", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("spices:update", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return logo;
}
