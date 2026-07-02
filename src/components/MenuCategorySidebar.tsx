import { useMemo, useState } from "react";
import { Search, X, LayoutGrid } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../utils/cn";
import type { MenuCategory, MenuItem } from "../lib/types";

export interface MenuCategorySidebarProps {
  categories: MenuCategory[];
  items: MenuItem[];
  selectedCategory: string | null;
  onSelect: (id: string) => void;
  /** Render a "Categories" button on small screens that opens a drawer. */
  mobileDrawer?: boolean;
  className?: string;
  title?: string;
  /** Show categories with 0 items (useful in Menu Management). */
  includeEmpty?: boolean;
  /** Count unavailable items too (useful in Menu Management). */
  includeUnavailable?: boolean;
  /** Show a leading "All" entry that selects no specific category. */
  showAll?: boolean;
  /** Value used for the "All" entry. */
  allValue?: string;
  /** Label for the "All" entry. */
  allLabel?: string;
}

/**
 * Reusable left sidebar listing menu categories (Petpooja/Restroworks style).
 * Hides categories with 0 visible items. Supports search and a mobile drawer.
 */
export function MenuCategorySidebar({
  categories,
  items,
  selectedCategory,
  onSelect,
  mobileDrawer = true,
  className,
  title = "Categories",
  includeEmpty = false,
  includeUnavailable = false,
  showAll = false,
  allValue = "all",
  allLabel = "All",
}: MenuCategorySidebarProps) {
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of items) {
      if (!includeUnavailable && !it.available) continue;
      m[it.categoryId] = (m[it.categoryId] || 0) + 1;
    }
    return m;
  }, [items, includeUnavailable]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .filter((c) => (includeEmpty ? true : (counts[c.id] || 0) > 0))
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true));
  }, [categories, counts, query, includeEmpty]);

  const handleSelect = (id: string) => {
    onSelect(id);
    setDrawerOpen(false);
  };

  const list = (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 pb-2 flex items-center gap-2">
        <LayoutGrid className="h-4 w-4 text-gold-500" />
        <h3 className="font-semibold text-sm flex-1">{title}</h3>
        <span className="text-[10px] font-semibold text-neutral-500">
          {visible.length}
        </span>
      </div>
      <div className="px-3 pb-2">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories…"
            className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gold-500/40"
          />
        </div>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-0.5">
        {showAll && (
          <button
            onClick={() => handleSelect(allValue)}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-left text-sm transition-all",
              selectedCategory === allValue
                ? "bg-gold-gradient text-white shadow font-semibold"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
            )}
          >
            <span className="truncate">{allLabel}</span>
            <span
              className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
                selectedCategory === allValue
                  ? "bg-white/25 text-white"
                  : "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
              )}
            >
              {items.filter((i) => includeUnavailable || i.available).length}
            </span>
          </button>
        )}
        {visible.map((c) => {
          const active = c.id === selectedCategory;
          return (
            <button
              key={c.id}
              onClick={() => handleSelect(c.id)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-left text-sm transition-all",
                active
                  ? "bg-gold-gradient text-white shadow font-semibold"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
              )}
            >
              <span className="truncate">{c.name}</span>
              <span
                className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
                  active
                    ? "bg-white/25 text-white"
                    : "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                )}
              >
                {counts[c.id] || 0}
              </span>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="text-xs text-neutral-500 text-center py-6">
            No categories
          </p>
        )}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile trigger */}
      {mobileDrawer && (
        <button
          onClick={() => setDrawerOpen(true)}
          className="lg:hidden inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-semibold shadow-sm"
        >
          <LayoutGrid className="h-4 w-4 text-gold-500" />
          Categories
          {selectedCategory && (
            <span className="text-xs text-neutral-500 truncate max-w-[120px]">
              · {categories.find((c) => c.id === selectedCategory)?.name}
            </span>
          )}
        </button>
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col w-[240px] shrink-0 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 sticky top-20 self-start max-h-[calc(100vh-6rem)]",
          className
        )}
      >
        {list}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/40 z-40"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.2 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-[260px] z-50 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 shadow-xl flex flex-col"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
                <span className="font-semibold text-sm">{title}</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">{list}</div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default MenuCategorySidebar;
