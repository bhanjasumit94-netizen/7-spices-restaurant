import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit2,
  Trash2,
  Users,
  QrCode,
  ArrowRightLeft,
  Combine,
  CheckCircle2,
  Clock,
  XCircle,
  Download,
  Printer,
  RefreshCcw,
  ExternalLink,
  Copy,
  Check,
  Split,
  GitMerge,
} from "lucide-react";
import QRCode from "qrcode";
import { Button, Input, Modal } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore } from "../lib/store";
import { RestaurantTable } from "../lib/types";
import { cn } from "../utils/cn";
import {
  ensureTokenForTable,
  generateTokenForTable,
  qrUrlForToken,
  syncTokens,
  pruneTokens,
} from "../lib/qrTokens";

type FilterKey = "all" | "available" | "reserved" | "occupied" | "split" | "merged";

// Status palette per the spec
const STATUS_STYLE: Record<
  RestaurantTable["status"],
  {
    bg: string; // full card background
    border: string;
    badgeBg: string;
    badgeText: string;
    glow: string;
    icon: typeof CheckCircle2;
    label: string;
    ring: string;
    textOnCard: string;
    subText: string;
    dot: string;
  }
> = {
  available: {
    bg: "bg-[#0F3D2E]",
    border: "border-emerald-500/40",
    badgeBg: "bg-emerald-500",
    badgeText: "text-white",
    glow: "shadow-[0_0_22px_-4px_rgba(16,185,129,0.55)]",
    icon: CheckCircle2,
    label: "FREE",
    ring: "ring-emerald-400/30",
    textOnCard: "text-emerald-50",
    subText: "text-emerald-200/80",
    dot: "bg-emerald-400",
  },
  reserved: {
    bg: "bg-[#4A3419]",
    border: "border-amber-500/40",
    badgeBg: "bg-amber-500",
    badgeText: "text-white",
    glow: "shadow-[0_0_22px_-4px_rgba(245,158,11,0.55)]",
    icon: Clock,
    label: "RESERVED",
    ring: "ring-amber-400/30",
    textOnCard: "text-amber-50",
    subText: "text-amber-200/80",
    dot: "bg-amber-400",
  },
  occupied: {
    bg: "bg-[#4C1D1D]",
    border: "border-rose-500/40",
    badgeBg: "bg-rose-500",
    badgeText: "text-white",
    glow: "shadow-[0_0_22px_-4px_rgba(239,68,68,0.55)]",
    icon: XCircle,
    label: "BUSY",
    ring: "ring-rose-400/30",
    textOnCard: "text-rose-50",
    subText: "text-rose-200/80",
    dot: "bg-rose-400",
  },
  split: {
    // Purple — table is broken into sections that each act as their own
    // order/bill.
    bg: "bg-[#3B1F66]",
    border: "border-violet-500/40",
    badgeBg: "bg-violet-500",
    badgeText: "text-white",
    glow: "shadow-[0_0_22px_-4px_rgba(139,92,246,0.55)]",
    icon: Split as unknown as typeof CheckCircle2,
    label: "SPLIT",
    ring: "ring-violet-400/30",
    textOnCard: "text-violet-50",
    subText: "text-violet-200/80",
    dot: "bg-violet-400",
  },
  merged: {
    // Blue — multiple tables combined into a single order/bill.
    bg: "bg-[#0E3A5C]",
    border: "border-sky-500/40",
    badgeBg: "bg-sky-500",
    badgeText: "text-white",
    glow: "shadow-[0_0_22px_-4px_rgba(14,165,233,0.55)]",
    icon: GitMerge as unknown as typeof CheckCircle2,
    label: "MERGED",
    ring: "ring-sky-400/30",
    textOnCard: "text-sky-50",
    subText: "text-sky-200/80",
    dot: "bg-sky-400",
  },
};

export default function Tables() {
  const tables = useStore("tables", Store.listTables);
  const orders = useStore("orders", Store.listOrders);
  const settings = useStore("settings", Store.getSettings);
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [number, setNumber] = useState("");
  const [capacity, setCapacity] = useState("4");
  // Manual display-order override. Defaults to "" (auto: derived from
  // `number` for standalone tables, parent + section index for split
  // sections). Saving a value here pins the table to that exact slot in
  // every dropdown and on the Tables grid.
  const [sortOrder, setSortOrder] = useState<string>("");
  const [qrOpen, setQrOpen] = useState<RestaurantTable | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [bulkPrintOpen, setBulkPrintOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  // ── Split / Merge state ────────────────────────────────────────────────
  // The split modal now contains an explicit table-selector dropdown. The
  // user can choose any table to split, or click a per-card Split
  // button to pre-select the table.
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitTableId, setSplitTableId] = useState<string>("");
  const [splitPartCount, setSplitPartCount] = useState<number>(2);

  // The table object derived from the dropdown id. We re-read the
  // store on every render so a freshly created split section is
  // visible immediately.
  const splitTable = useMemo(
    () => tables.find((t) => t.id === splitTableId) ?? null,
    [tables, splitTableId]
  );

  const [mergeModeOpen, setMergeModeOpen] = useState(false);
  const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);

  // In-app confirmation modal for the un-split action. We can't use
  // window.confirm() because some browsers / sandboxed iframes block it
  // silently, which was the source of the "UN-SPLIT does nothing" bug.
  const [unsplitConfirm, setUnsplitConfirm] = useState<RestaurantTable | null>(null);

  // For a section: derive its display number, e.g. T1A from parent table #1
  // and label "A".
  const displayNumber = (t: RestaurantTable): string => {
    if (t.parentTableId && t.sectionLabel) {
      const parent = tables.find((p) => p.id === t.parentTableId);
      if (parent) return `${parent.number}${t.sectionLabel}`;
      return `${t.sectionLabel}`;
    }
    if (t.mergedWith && t.mergedWith.length > 0) {
      const others = t.mergedWith
        .map((id) => tables.find((p) => p.id === id)?.number)
        .filter((n): n is number => typeof n === "number")
        .sort((a, b) => a - b);
      return [t.number, ...others].sort((a, b) => a - b).join("+");
    }
    return String(t.number);
  };

  // Children of a parent table (split sections OR merged siblings).
  const childrenOf = (t: RestaurantTable): RestaurantTable[] =>
    tables
      .filter((c) => c.parentTableId === t.id)
      .sort((a, b) =>
        (a.sectionLabel || "").localeCompare(b.sectionLabel || "")
      );

  // SPLIT: turn a normal table into N sections (default 2).
  // Each section is a new RestaurantTable record with status="split",
  // its own QR token, its own capacity = parent.capacity / N.
  // The parent keeps status="split" and gets a compositionNote.
  // Returns the list of new section labels so the caller can show a
  // tailored success toast.
  const splitTableAction = (): string[] | null => {
    if (!splitTable) {
      toast.push("Please select a table to split", "error");
      return null;
    }
    const parent = tables.find((t) => t.id === splitTable.id);
    if (!parent) return null;
    if (parent.status === "split" || parent.status === "merged") {
      toast.push("Cannot split an already split or merged table", "error");
      return null;
    }
    // If the parent has an active order, refuse — split before billing.
    const activeOrder = orders.find(
      (o) =>
        o.tableId === parent.id &&
        !["paid", "cancelled", "completed"].includes(o.status)
    );
    if (activeOrder) {
      toast.push(
        "Complete the active bill before splitting the table",
        "error"
      );
      return null;
    }
    const n = Math.max(2, Math.min(6, Math.floor(splitPartCount || 2)));
    const perSection = Math.max(1, Math.floor(parent.capacity / n));
    const labels = ["A", "B", "C", "D", "E", "F"];
    const siblingLabels: string[] = [];
    // Generate IDs that include the section label so they're easy to
    // recognise in the localStorage dump ("T1A", "T1B"). The numeric
    // number is still set to a unique value (parent * 100 + idx) for
    // any code that needs to compare table records by integer.
    for (let i = 0; i < n; i++) {
      const label = labels[i];
      const newTable: RestaurantTable = {
        id: `T${parent.number}${label}`,
        number: parent.number * 100 + (i + 1),
        capacity: i === n - 1 ? parent.capacity - perSection * (n - 1) : perSection,
        status: "available",
        parentTableId: parent.id,
        sectionLabel: label,
        sectionCapacity: i === n - 1 ? parent.capacity - perSection * (n - 1) : perSection,
      };
      Store.addTableRaw(newTable);
      siblingLabels.push(label);
    }
    // Mark the parent as split and add a composition note.
    Store.updateTable(parent.id, {
      status: "split",
      compositionNote: `Split into ${siblingLabels.join(" and ")}`,
    });
    // Generate tokens for the new sections.
    syncTokens(Store.listTables());
    return siblingLabels;
  };

  // Un-split handler — accepts a table id (the per-card button passes
  // the parent's id directly) and performs the atomic batch restore.
  // The flow is:
  //   1. resolve the table from the id,
  //   2. validate,
  //   3. delete the child sections in order,
  //   4. restore the parent to status: "available",
  //   5. emit a success toast and refresh the grid in real time.
  // If any operation throws, every section we just removed is re-added
  // and the parent is left untouched.
  const handleUnsplit = (tableId: string) => {
    // eslint-disable-next-line no-console
    console.log("handleUnsplit called", tableId);

    let parentTable = tables.find((t) => t.id === tableId);
    if (!parentTable) {
      // eslint-disable-next-line no-console
      console.warn("[Un-Split] parent table not found for id:", tableId);
      toast.push("Table not found", "error");
      return;
    }
    // eslint-disable-next-line no-console
    console.log("Parent table (pre-repair):", parentTable);

    // — Spec #3 — automatically rebuild missing split metadata. A
    // parent whose status is no longer "split" but which still has
    // child records linked to it (or whose child ids are recorded in
    // its `childTables` field) is repaired in place.
    parentTable = repairSplitMetadata(parentTable);
    // eslint-disable-next-line no-console
    console.log("Parent table (post-repair):", parentTable);
    // eslint-disable-next-line no-console
    console.log("isSplit:", (parentTable as unknown as { isSplit?: boolean }).isSplit);
    // eslint-disable-next-line no-console
    console.log("childTables:", (parentTable as unknown as { childTables?: string[] }).childTables);

    // Locate child tables — try `parentTable.childTables` first
    // (forward-compat), then fall back to the standard `parentTableId`
    // filter, then fall back to a name-pattern lookup. The name-pattern
    // fallback covers cases where the child was created in a build that
    // didn't write the `parentTableId` field correctly.
    const childTables = (() => {
      const explicit = Array.isArray(
        (parentTable as unknown as { childTables?: string[] }).childTables
      )
        ? (parentTable as unknown as { childTables: string[] }).childTables
        : [];
      if (explicit.length > 0) {
        return tables.filter((c) => explicit.includes(c.id));
      }
      const linked = tables.filter(
        (c) => c.parentTableId === parentTable.id
      );
      if (linked.length > 0) return linked;
      // Last-resort — name pattern. The parent has number N; a section
      // "NA" or "NB" would have a name / id like "TNA" / "TNB".
      return tables.filter(
        (c) =>
          c.id.toUpperCase().startsWith(`T${parentTable.number}A`) ||
          c.id.toUpperCase().startsWith(`T${parentTable.number}B`) ||
          c.id.toUpperCase().startsWith(`T${parentTable.number}C`) ||
          c.id.toUpperCase().startsWith(`T${parentTable.number}D`)
      );
    })();
    // eslint-disable-next-line no-console
    console.log("Child tables found:", childTables);

    // Spec #3 — no children at all.
    if (childTables.length === 0) {
      // Recover automatically: clear the split state and refresh.
      // eslint-disable-next-line no-console
      console.warn(
        "[Un-Split] no child sections found for parent",
        parentTable.id,
        "— clearing split state automatically."
      );
      Store.updateTable(parentTable.id, {
        status: "available",
        compositionNote: undefined,
      });
      pruneTokens();
      toast.push("No split sections found for this table.", "info");
      return;
    }

    // Spec #1 — every section must be FREE and have no active order.
    const nonFree = childTables.find((c) => c.status !== "available");
    if (nonFree) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Un-Split] section ${displayNumber(nonFree)} is not FREE (status=${nonFree.status})`
      );
      toast.push(
        `Cannot un-split Table ${parentTable.number}. Complete or transfer all section orders first.`,
        "error"
      );
      return;
    }
    const busy = childTables.find((c) =>
      orders.some(
        (o) =>
          o.tableId === c.id &&
          !["paid", "cancelled", "completed"].includes(o.status)
      )
    );
    if (busy) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Un-Split] section ${displayNumber(busy)} has an active / unpaid order.`
      );
      toast.push(
        `Cannot un-split Table ${parentTable.number}. Complete or transfer all section orders first.`,
        "error"
      );
      return;
    }

    // — Spec #6 — atomic batch. Snapshot every section before deleting
    // so we can re-add them if any operation throws. The store fires
    // "spices:update" after each write, so the floor plan and the
    // counter cards re-render in real time.
    const snapshot: RestaurantTable[] = [];
    const deletedIds: string[] = [];
    try {
      for (const c of childTables) {
        snapshot.push(c);
        // eslint-disable-next-line no-console
        console.log(
          `[Un-Split] Firestore delete: child section id=${c.id} (${displayNumber(c)})`
        );
        Store.deleteTable(c.id);
        deletedIds.push(c.id);
      }
      // eslint-disable-next-line no-console
      console.log(
        `[Un-Split] all child deletes succeeded (${deletedIds.length}). Updating parent Table ${parentTable.number}.`
      );
      Store.updateTable(parentTable.id, {
        status: "available",
        compositionNote: undefined,
        // isSplit / childTables / splitSections are implicit in the
        // absence of parentTableId on the children and the absence of
        // status === "split" on the parent. No explicit field is
        // required — the schema is unchanged.
      });
      pruneTokens();
      // — Success (spec #8) —
      const labels = childTables
        .map((c) => displayNumber(c))
        .join(" and ");
      // eslint-disable-next-line no-console
      console.log(
        `[Un-Split] SUCCESS — Table ${parentTable.number} restored (merged ${labels}).`
      );
      // Spec #6 — use the exact wording the user wants.
      toast.push(
        `Table ${parentTable.number} restored successfully${
          labels ? ` (merged ${labels})` : ""
        }.`,
        "success"
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[Un-Split] transaction failed, rolling back ${deletedIds.length} delete(s):`,
        err
      );
      for (const s of snapshot) {
        if (deletedIds.includes(s.id)) Store.addTableRaw(s);
      }
      toast.push(
        `Could not un-split Table ${parentTable.number}. Changes were rolled back.`,
        "error"
      );
    }
  };

  // A table is a "split parent" if EITHER:
  //   1. It has child tables linked via parentTableId, OR
  //   2. It has child tables recorded in the explicit childTables field
  //      (forward-compat with the spec's `isSplit` / `childTables` shape),
  //   3. Its `sectionLabel`-bearing child records exist that look like
  //      "1A", "1B" (legacy detection).
  // The "is a split parent" check no longer rejects a parent that just
  // happens to have `parentTableId` empty (which is the *normal* case
  // for a parent). The previous code threw
  //   "This table is not a split parent."
  // when a user clicked UN-SPLIT on a real parent whose
  // `parentTableId` field is correctly empty.
  const sectionsForParent = (t: RestaurantTable): RestaurantTable[] => {
    const explicitIds = Array.isArray(
      (t as unknown as { childTables?: string[] }).childTables
    )
      ? (t as unknown as { childTables: string[] }).childTables
      : [];
    if (explicitIds.length > 0) {
      return tables.filter((c) => explicitIds.includes(c.id));
    }
    return tables.filter((c) => c.parentTableId === t.id);
  };

  // Per spec — automatically rebuild the split metadata if it is missing
  // or inconsistent. We do this every time the parent record is read.
  const repairSplitMetadata = (parent: RestaurantTable): RestaurantTable => {
    const children = sectionsForParent(parent);
    if (
      children.length > 0 &&
      (parent.status !== "split" ||
        (parent as unknown as { isSplit?: boolean }).isSplit === false)
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        "[Tables] repairing split metadata for parent",
        parent.id
      );
      Store.updateTable(parent.id, {
        status: "split",
        compositionNote:
          parent.compositionNote ??
          `Split into ${children.map((c) => c.sectionLabel).join(" and ")}`,
      });
      return { ...parent, status: "split" };
    }
    return parent;
  };

  // Open the in-app confirmation modal for the un-split action.
  // We don't use window.confirm() because some embedded iframes block
  // it silently — that was the source of the "UN-SPLIT does nothing"
  // bug. Instead the per-card button opens a real Modal below.
  const askUnsplit = (t: RestaurantTable) => {
    // Repair any missing split metadata first so the helper below can
    // find the child sections reliably.
    const repaired = repairSplitMetadata(t);
    // A table is a split parent if it is either marked as `status: "split"`
    // OR has at least one child section linked to it.
    const isParent =
      repaired.status === "split" || sectionsForParent(repaired).length > 0;
    if (!isParent) {
      toast.push("This table is not a split parent", "error");
      return;
    }
    const sections = sectionsForParent(repaired);
    if (sections.length === 0) {
      // Edge case: parent is split but has no children in storage.
      // Recover automatically without bothering the user with a modal.
      handleUnsplit(repaired.id);
      return;
    }
    setUnsplitConfirm(repaired);
  };
  const performUnsplitConfirm = () => {
    if (!unsplitConfirm) return;
    const t = unsplitConfirm;
    setUnsplitConfirm(null);
    handleUnsplit(t.id);
  };

  // MERGE: combine N tables into a single "primary" table.
  // Implementation strategy: pick the lowest-numbered table as primary.
  // Mark the others with status="merged" and put their ids in primary.mergedWith.
  // The primary keeps its own number; the merged siblings keep their records
  // but reference the primary via mergedWith (on the primary) for display.
  const mergeSelected = () => {
    if (mergeSelectedIds.length < 2) {
      return toast.push("Select at least 2 tables to merge", "error");
    }
    const targets = mergeSelectedIds
      .map((id) => tables.find((t) => t.id === id))
      .filter((t): t is RestaurantTable => !!t);
    if (targets.some((t) => t.status === "split" || t.status === "merged")) {
      return toast.push(
        "Cannot merge tables that are split or already merged",
        "error"
      );
    }
    if (
      targets.some((t) =>
        orders.some(
          (o) =>
            o.tableId === t.id &&
            !["paid", "cancelled", "completed"].includes(o.status)
        )
      )
    ) {
      return toast.push(
        "Complete all active bills before merging tables",
        "error"
      );
    }
    targets.sort((a, b) => a.number - b.number);
    const primary = targets[0];
    const siblings = targets.slice(1);
    const labels = siblings.map((s) => `T${s.number}`).join(", ");
    Store.updateTable(primary.id, {
      status: "merged",
      capacity: targets.reduce((sum, t) => sum + t.capacity, 0),
      mergedWith: siblings.map((s) => s.id),
      compositionNote: `Merged with ${labels}`,
    });
    siblings.forEach((s) => {
      Store.updateTable(s.id, { status: "merged" });
    });
    toast.push(`Tables ${targets.map((t) => t.number).join("+")} merged`, "success");
    setMergeSelectedIds([]);
    setMergeModeOpen(false);
  };

  // Un-merge: split the primary back into individual tables.
  const unmergeTable = (t: RestaurantTable) => {
    if (t.status !== "merged") return;
    if (!confirm(`Un-merge Tables ${displayNumber(t)}? This separates them again.`)) return;
    const siblingIds = t.mergedWith ?? [];
    Store.updateTable(t.id, {
      status: "available",
      mergedWith: undefined,
      capacity: t.capacity, // keep the original (we'll recompute below)
      compositionNote: undefined,
    });
    siblingIds.forEach((id) => {
      Store.updateTable(id, { status: "available" });
    });
    toast.push(`Tables un-merged`, "success");
  };

  // MERGE BILLS — combine the open orders of every active section of a
  // split table into a single invoice on the parent's section. Used by
  // a cashier when a group that was split across sections wants one bill.
  // The other sections are freed; their in-progress orders are marked
  // cancelled and their tables set back to "available".
  const mergeSplitBills = (parent: RestaurantTable) => {
    if (parent.status !== "split") {
      return toast.push("Only split tables can have their bills merged", "error");
    }
    const sections = childrenOf(parent);
    if (sections.length < 2) {
      return toast.push("Need at least 2 sections to merge bills", "error");
    }
    const ordersForSections = sections
      .map((s) => orders.find(
        (o) =>
          o.tableId === s.id &&
          !["paid", "cancelled", "completed"].includes(o.status)
      ))
      .filter((o): o is NonNullable<typeof o> => !!o);
    if (ordersForSections.length < 2) {
      return toast.push(
        "Need at least 2 active orders to merge bills",
        "error"
      );
    }
    const keep = ordersForSections[0];
    const merged = ordersForSections.slice(1);
    // Concatenate items, recompute totals.
    const mergedItems = keep.items.concat(...merged.map((o) => o.items));
    const subtotal = mergedItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const discount = keep.discount;
    const afterDiscount = Math.max(0, subtotal - discount);
    const cgst = keep.gstPercent > 0 ? (afterDiscount * (keep.gstPercent / 2)) / 100 : 0;
    const sgst = keep.gstPercent > 0 ? (afterDiscount * (keep.gstPercent / 2)) / 100 : 0;
    const grandTotal = afterDiscount + cgst + sgst;
    const newBillNumber = Store.getNextBillNumber();
    Store.updateOrder(keep.id, {
      items: mergedItems,
      subtotal,
      cgst,
      sgst,
      grandTotal,
      billNumber: newBillNumber,
      updatedAt: Date.now(),
    });
    // Cancel the merged-away orders + free their tables.
    merged.forEach((o) => {
      Store.updateOrder(o.id, { status: "cancelled", updatedAt: Date.now() });
      const section = sections.find((s) => s.id === o.tableId);
      if (section) {
        Store.updateTable(section.id, { status: "available", currentOrderId: undefined });
      }
    });
    toast.push(
      `Merged ${ordersForSections.length} bills into one invoice`,
      "success"
    );
  };

  // Statistics
  const stats = useMemo(() => {
    // When counting the dashboard totals, we only count the PARENT tables
    // so that a single split table isn't double-counted (each split also
    // creates 2+ section records in the store).
    const parentTables = tables.filter((t) => !t.parentTableId);
    const free = parentTables.filter((t) => t.status === "available").length;
    const reserved = parentTables.filter((t) => t.status === "reserved").length;
    const busy = parentTables.filter((t) => t.status === "occupied").length;
    const split = parentTables.filter((t) => t.status === "split").length;
    const merged = parentTables.filter((t) => t.status === "merged").length;
    return { free, reserved, busy, split, merged, total: parentTables.length };
  }, [tables]);

  // Compose a sorted list where every split section is placed directly
  // under its parent. This makes the on-screen layout mirror the spec:
  //
  //   Table 1
  //   ├── 1A (Occupied)
  //   └── 1B (Available)
  //
  // The filter is applied to the parents only (sections inherit the
  // filter from their parent), so when the user selects "Free" they
  // see the parent T1 card with T1A's status reflected inside it.
  // Sort key for a record. Falls back to the integer `number` so legacy
  // records (created before the sortOrder field existed) still place
  // themselves in the correct numeric slot.
  const sortKeyOf = (t: { number: number; sortOrder?: number }) =>
    t.sortOrder ?? t.number;

  const sortedForDisplay = useMemo(() => {
    const parentTables = tables
      .filter((t) => !t.parentTableId)
      .sort((a, b) => sortKeyOf(a) - sortKeyOf(b));
    const sectionsByParent = new Map<string, typeof tables>();
    tables.forEach((t) => {
      if (t.parentTableId) {
        const arr = sectionsByParent.get(t.parentTableId) ?? [];
        arr.push(t);
        sectionsByParent.set(t.parentTableId, arr);
      }
    });
    const result: typeof tables = [];
    parentTables.forEach((parent) => {
      result.push(parent);
      const sections = sectionsByParent.get(parent.id) ?? [];
      // sort sections by their sortOrder (1.1, 1.2, 2.1, 2.2 …)
      // so they always appear under their parent in numeric order.
      sections.sort((a, b) => sortKeyOf(a) - sortKeyOf(b));
      result.push(...sections);
    });
    return result;
  }, [tables]);

  const filtered = useMemo(() => {
    // Apply the current filter pill to the sorted list. Sections inherit
    // the filter from their parent so the on-screen layout always groups
    // sections under their parent.
    if (filter === "all") return sortedForDisplay;
    return sortedForDisplay.filter((t) => {
      // Sections follow their parent's status for filter purposes.
      if (t.parentTableId) {
        const parent = tables.find((p) => p.id === t.parentTableId);
        if (!parent) return false;
        return parent.status === filter;
      }
      return t.status === filter;
    });
  }, [sortedForDisplay, filter, tables]);

  const addOrUpdate = () => {
    const n = parseInt(number);
    const c = parseInt(capacity) || 4;
    if (!n || n < 1) return toast.push("Enter a valid table number", "error");

    // Resolve the manual sortOrder. If the user typed one, parse and use
    // it. Otherwise fall back to the store's auto-compute (which keeps
    // deleted-number → re-create ordering intact).
    const manualSort = parseFloat(sortOrder);
    const finalSort = Number.isFinite(manualSort)
      ? manualSort
      : undefined;

    if (editing) {
      const patch: Partial<RestaurantTable> = { number: n, capacity: c };
      if (finalSort !== undefined) patch.sortOrder = finalSort;
      Store.updateTable(editing.id, patch);
      toast.push(`Table ${n} updated`, "success");
    } else {
      if (tables.some((t) => t.number === n))
        return toast.push("Table number already exists", "error");
      const newTable: RestaurantTable = {
        id: Store.uid("tbl"),
        number: n,
        capacity: c,
        status: "available",
        // When the user supplies a Display Order, respect it; otherwise
        // let addTable compute the next free slot automatically.
        ...(finalSort !== undefined ? { sortOrder: finalSort } : {}),
      };
      Store.addTableRaw(newTable);
      toast.push(`Table ${n} added — QR token auto-generated`, "success");
    }
    // Re-sync tokens so the new table has one immediately.
    syncTokens(Store.listTables());
    setOpen(false);
    setEditing(null);
    setNumber("");
    setCapacity("4");
    setSortOrder("");
  };

  const remove = (t: RestaurantTable) => {
    if (!confirm(`Delete Table ${t.number}? This also invalidates its QR token.`)) return;
    Store.deleteTable(t.id);
    pruneTokens();
    toast.push(`Table ${t.number} deleted`, "info");
  };

  const setStatus = (t: RestaurantTable, status: RestaurantTable["status"]) => {
    Store.updateTable(t.id, { status });
    toast.push(`Table ${t.number} → ${status.toUpperCase()}`, "info");
  };

  const transferTable = (fromId: string, toId: string) => {
    const from = tables.find((t) => t.id === fromId);
    const to = tables.find((t) => t.id === toId);
    if (!from || !to) return;
    const order = orders.find(
      (o) =>
        o.tableId === fromId &&
        o.status !== "paid" &&
        o.status !== "cancelled" &&
        o.status !== "completed"
    );
    if (!order) return toast.push("No active order on source table", "error");
    Store.updateOrder(order.id, { tableId: to.id, tableNumber: to.number });
    Store.updateTable(fromId, { status: "available", currentOrderId: undefined });
    Store.updateTable(toId, { status: "occupied", currentOrderId: order.id });
    toast.push(`Transferred to Table ${to.number}`, "success");
    setMergeOpen(false);
  };

  return (
    <div className="space-y-4 lg:space-y-5 w-full overflow-x-hidden">
      {/* Header — title on top, action buttons wrap to a new line and themselves
          wrap when there isn't enough horizontal space. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold">Table Management</h2>
          <p className="text-xs sm:text-sm text-neutral-500">Live status · color-coded by availability</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMergeOpen(true)}
            className="flex-1 sm:flex-none"
          >
            <Combine className="h-4 w-4" />
            <span className="hidden sm:inline">Merge / Transfer</span>
            <span className="sm:hidden">Merge</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMergeModeOpen(true)}
            className="flex-1 sm:flex-none"
            title="Merge two or more tables into a single bill"
          >
            <GitMerge className="h-4 w-4" />
            <span className="hidden sm:inline">Merge Tables</span>
            <span className="sm:hidden">Merge</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // Open split modal without pre-selecting a table. The modal
              // now contains a table-selector dropdown so the user
              // chooses which table to split.
              setSplitTableId("");
              setSplitPartCount(2);
              setSplitOpen(true);
            }}
            className="flex-1 sm:flex-none"
            title="Split a table into multiple sections"
          >
            <Split className="h-4 w-4" />
            <span className="hidden sm:inline">Split Table</span>
            <span className="sm:hidden">Split</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBulkPrintOpen(true)}
            className="flex-1 sm:flex-none"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print All QR</span>
            <span className="sm:hidden">Print QR</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (
                !confirm(
                  `Regenerate QR tokens for ALL ${tables.length} tables? All previous QRs will stop working.`
                )
              )
                return;
              syncTokens(tables, { regenerate: true });
              toast.push("All QR tokens regenerated", "success");
            }}
            className="flex-1 sm:flex-none"
          >
            <RefreshCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Regenerate All</span>
            <span className="sm:hidden">Regen</span>
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setEditing(null);
              setNumber("");
              setCapacity("4");
              setOpen(true);
            }}
            className="flex-1 sm:flex-none"
          >
            <Plus className="h-4 w-4" /> Add Table
          </Button>
        </div>
      </div>

      {/* Statistics cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 lg:gap-3">
        <StatCard
          label="Free Tables"
          count={stats.free}
          tone="emerald"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          label="Reserved"
          count={stats.reserved}
          tone="amber"
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Busy"
          count={stats.busy}
          tone="rose"
          icon={<XCircle className="h-5 w-5" />}
        />
        <StatCard
          label="Total Tables"
          count={stats.total}
          tone="neutral"
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      {/* Filters — wrap to the next line on narrow screens. */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full">
        {[
          { v: "all", label: `All (${stats.total})` },
          { v: "available", label: `🟢 Free (${stats.free})` },
          { v: "reserved", label: `🟡 Reserved (${stats.reserved})` },
          { v: "occupied", label: `🔴 Busy (${stats.busy})` },
          { v: "split", label: `🟣 Split (${stats.split})` },
          { v: "merged", label: `🔵 Merged (${stats.merged})` },
        ].map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v as FilterKey)}
            className={cn(
              "shrink-0 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold transition whitespace-nowrap",
              filter === f.v
                ? "bg-gold-gradient text-white shadow"
                : "bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-gold-400"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tables grid — uses auto-fit + minmax so columns resize with the viewport.
          No horizontal scrollbar. Cards never get cut off. */}
      <div
        className="grid gap-2.5 lg:gap-3 w-full"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
      >
        <AnimatePresence>
          {filtered.map((t) => {
            const s = STATUS_STYLE[t.status];
            const Icon = s.icon;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25 }}
                className={cn(
                  "relative rounded-2xl p-3 sm:p-4 border-2 transition-all duration-300 w-full overflow-hidden",
                  s.bg,
                  s.border,
                  s.glow,
                  "hover:scale-[1.02]"
                )}
              >
                {/* Top row: number + badge */}
                <div className="flex items-start justify-between gap-1 mb-2 sm:mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn("h-3 w-3 rounded-full animate-pulse shrink-0", s.dot)} />
                    <span className={cn("text-xs uppercase tracking-wider font-bold truncate", s.subText)}>
                      Table
                    </span>
                  </div>
                  <span
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider",
                      s.badgeBg,
                      s.badgeText
                    )}
                  >
                    {s.label}
                  </span>
                </div>

                {/* Big number */}
                <div className="flex items-end justify-between gap-1 mb-2 sm:mb-3">
                  <p className={cn("text-3xl sm:text-4xl font-extrabold leading-none truncate", s.textOnCard)}>
                    {displayNumber(t)}
                  </p>
                  <Icon className={cn("h-6 w-6 sm:h-7 sm:w-7 opacity-70 shrink-0", s.textOnCard)} />
                </div>

                {/* For split sections, show sibling badges so the cashier
                    can see which section is which at a glance. */}
                {t.parentTableId && (() => {
                  const parent = tables.find((p) => p.id === t.parentTableId);
                  if (!parent) return null;
                  const siblings = childrenOf(parent);
                  return (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {siblings.map((s) => (
                        <span
                          key={s.id}
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded font-bold border",
                            s.id === t.id
                              ? "bg-white text-violet-900 border-white"
                              : "bg-white/10 text-white border-white/20"
                          )}
                        >
                          {displayNumber(s)}
                        </span>
                      ))}
                    </div>
                  );
                })()}

                {/* Composition note — Split / Merged summary */}
                {(t.status === "split" || t.status === "merged") && (() => {
                  // For a SPLIT parent, show how many sections are currently
                  // active (occupied) so the cashier can see at a glance.
                  let liveNote = t.compositionNote;
                  if (t.status === "split" && !t.parentTableId) {
                    const sections = childrenOf(t);
                    const occupied = sections.filter(
                      (s) => s.status === "occupied"
                    ).length;
                    liveNote = `Split: ${occupied}/${sections.length} active`;
                  } else if (t.status === "split") {
                    liveNote = "Split section";
                  }
                  return (
                    <div
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider mb-2 px-1.5 py-1 rounded border border-white/10",
                        t.status === "split"
                          ? "bg-violet-500/20 text-violet-100"
                          : "bg-sky-500/20 text-sky-100"
                      )}
                    >
                      {liveNote ||
                        (t.status === "split"
                          ? "Split into sections"
                          : "Merged with other tables")}
                    </div>
                  );
                })()}

                <div className={cn("flex items-center gap-1 text-[10px] sm:text-xs mb-2 sm:mb-3", s.subText)}>
                  <Users className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {t.parentTableId
                      ? `Section · ${t.sectionCapacity ?? t.capacity} seats`
                      : t.mergedWith && t.mergedWith.length > 0
                      ? `${t.capacity} seats combined`
                      : `Cap: ${t.capacity}`}
                  </span>
                </div>

                {/* Actions — small text labels below each icon. Wraps onto a
                    second row on very narrow cards so nothing is clipped. */}
                <div className="flex flex-wrap items-start justify-between gap-x-1 gap-y-2 border-t border-white/10 pt-2">
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setQrOpen(t)}
                      title="QR Code"
                      className="flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded hover:bg-white/10 text-white/80 hover:text-white"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                        QR
                      </span>
                    </button>
                     <button
                      onClick={() => {
                        setEditing(t);
                        setNumber(String(t.number));
                        setCapacity(String(t.capacity));
                        setSortOrder(
                          t.sortOrder !== undefined
                            ? String(t.sortOrder)
                            : ""
                        );
                        setOpen(true);
                      }}
                      title="Edit"
                      className="flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded hover:bg-white/10 text-white/80 hover:text-white"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                        Edit
                      </span>
                    </button>
                     <button
                      onClick={() => remove(t)}
                      title="Delete"
                      className="flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded hover:bg-white/10 text-white/80 hover:text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                        Delete
                      </span>
                    </button>
                    {/* Spec #5 — per-card Split button. Visible only on
                        standalone (non-split, non-merged) tables. The
                        hover title names the specific table number so
                        staff never have to remember which one they
                        clicked. */}
                    {!t.parentTableId &&
                      t.status !== "merged" &&
                      t.status !== "split" && (
                        <button
                          onClick={() => {
                            setSplitTableId(t.id);
                            setSplitPartCount(2);
                            setSplitOpen(true);
                          }}
                          title={`Split Table ${t.number}`}
                          className="flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded hover:bg-white/10 text-white/80 hover:text-white"
                        >
                          <Split className="h-3.5 w-3.5" />
                          <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                            Split
                          </span>
                        </button>
                      )}
                    {/* Un-split — only on the PARENT table that was split.
                        Opens an in-app confirmation modal so the action
                        works in sandboxed iframes where window.confirm()
                        is blocked. The handler is wrapped with explicit
                        preventDefault / stopPropagation and a debug log so
                        any click that doesn't reach the handler is
                        immediately visible in the browser console. */}
                    {t.status === "split" && !t.parentTableId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          // eslint-disable-next-line no-console
                          console.log(
                            "UNSPLIT BUTTON CLICKED",
                            t
                          );
                          askUnsplit(t);
                        }}
                        title="Un-split this table"
                        aria-label={`Un-split Table ${t.number}`}
                        className="relative z-10 flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded hover:bg-white/10 text-white/80 hover:text-white cursor-pointer"
                      >
                        <GitMerge className="h-3.5 w-3.5 pointer-events-none" />
                        <span className="text-[9px] font-semibold uppercase tracking-wide leading-none pointer-events-none">
                          Un-Split
                        </span>
                      </button>
                    )}
                    {/* Merge Bills — combine every active section's open
                        order into a single invoice on the first section. */}
                    {t.status === "split" && !t.parentTableId && (
                      <button
                        onClick={() => {
                          if (
                            !confirm(
                              `Merge all active section bills into one invoice for Table ${t.number}?`
                            )
                          )
                            return;
                          mergeSplitBills(t);
                        }}
                        title="Combine every active section's bill into one"
                        className="flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded hover:bg-white/10 text-white/80 hover:text-white"
                      >
                        <Combine className="h-3.5 w-3.5" />
                        <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                          Merge Bills
                        </span>
                      </button>
                    )}
                    {/* Un-merge — only on the PRIMARY table of a merge. */}
                    {t.status === "merged" && (!t.mergedWith || t.mergedWith.length === 0) && (
                      <button
                        onClick={() => unmergeTable(t)}
                        title="Un-merge this table"
                        className="flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded hover:bg-white/10 text-white/80 hover:text-white"
                      >
                        <Split className="h-3.5 w-3.5" />
                        <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                          Un-Merge
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setStatus(t, "available")}
                      title="Set Free"
                      className={cn(
                        "flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded",
                        t.status === "available"
                          ? "bg-white text-emerald-700"
                          : "bg-white/10 hover:bg-white/20 text-white"
                      )}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                        Free
                      </span>
                    </button>
                    <button
                      onClick={() => setStatus(t, "reserved")}
                      title="Set Reserved"
                      className={cn(
                        "flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded",
                        t.status === "reserved"
                          ? "bg-white text-amber-700"
                          : "bg-white/10 hover:bg-white/20 text-white"
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                        Reserve
                      </span>
                    </button>
                    <button
                      onClick={() => setStatus(t, "occupied")}
                      title="Set Busy"
                      className={cn(
                        "flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded",
                        t.status === "occupied"
                          ? "bg-white text-rose-700"
                          : "bg-white/10 hover:bg-white/20 text-white"
                      )}
                    >
                      <XCircle className="h-3 w-3" />
                      <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                        Busy
                      </span>
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-sm text-neutral-500 py-10">
          No tables match the selected filter.
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Table" : "Add Table"} size="sm">
        <div className="space-y-3">
          <Input label="Table Number" value={number} onChange={setNumber} type="number" />
          <Input label="Capacity" value={capacity} onChange={setCapacity} type="number" />
          <Input
            label="Display Order"
            value={sortOrder}
            onChange={setSortOrder}
            type="number"
            placeholder="Auto"
          />
          <p className="text-[10px] text-neutral-500 -mt-1">
            Leave blank to auto-place this table at the end. Use decimal
            values (e.g. <code>1.1</code>, <code>2.5</code>) to slot it between
            existing tables. The same value is used everywhere — Tables
            page, POS / Waiter dropdowns and QR ordering.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={addOrUpdate}>
              {editing ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </Modal>

      <QRModal
        table={qrOpen}
        settingsName={settings.name}
        onClose={() => setQrOpen(null)}
      />

      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title="Merge / Transfer Table" size="md">
        <MergeTransfer tables={tables} orders={orders} onTransfer={transferTable} />
      </Modal>

      {/* ── Split modal ───────────────────────────────────────────────
          Improved UX per the latest spec: the popup prominently
          displays the table number, capacity and current status, plus
          a large "table card" mock-up showing what the new sections
          will be called (e.g. "4A and 4B"). The user never has to
          remember which table is being split — it's right there. */}
      <Modal
        open={splitOpen}
        onClose={() => {
          setSplitOpen(false);
          setSplitTableId("");
        }}
        title={
          splitTable
            ? `Splitting: TABLE ${splitTable.number}`
            : "Split a Table"
        }
        size="md"
      >
        {(() => {
          // Build the candidate list — every standalone (non-split,
          // non-merged) table is eligible.
          const candidates = tables
            .filter(
              (t) =>
                t.status !== "split" &&
                t.status !== "merged" &&
                !t.parentTableId
            )
            .sort(
              (a, b) =>
                (a.sortOrder ?? a.number) - (b.sortOrder ?? b.number)
            );

          // If the user has already chosen a table, compute the labels /
          // capacity preview. If not, prompt them to pick one.
          const n = Math.max(
            2,
            Math.min(6, Math.floor(splitPartCount || 2))
          );
          const labels = ["A", "B", "C", "D", "E", "F"].slice(0, n);
          const capacityPerSection = splitTable
            ? Math.max(1, Math.floor(splitTable.capacity / n))
            : 0;

          // Refuse to split when the chosen table is split / merged.
          // (We never auto-select one in the dropdown.)
          const chosen = splitTable;
          const blockedReason = chosen
            ? chosen.status === "split" || chosen.status === "merged"
              ? "Cannot split an already split or merged table."
              : ""
            : "";

          return (
            <div className="space-y-3">
              {/* Spec #1 — table selector dropdown. This is the primary
                  input: the user must choose a table to split. */}
              <div>
                <label className="block">
                  <span className="block mb-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Select Table
                  </span>
                  <select
                    value={splitTableId}
                    onChange={(e) => {
                      setSplitTableId(e.target.value);
                      setSplitPartCount(2);
                    }}
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                  >
                    <option value="">— Choose a table —</option>
                    {candidates.map((t) => (
                      <option key={t.id} value={t.id}>
                        Table {t.number} • {t.capacity} seats •{" "}
                        {t.status === "occupied"
                          ? "Busy"
                          : t.status === "reserved"
                          ? "Reserved"
                          : "Free"}
                      </option>
                    ))}
                  </select>
                </label>
                {candidates.length === 0 && (
                  <p className="text-[10px] text-rose-600 mt-1">
                    No eligible tables — every table is already split or
                    merged.
                  </p>
                )}
              </div>

              {/* Spec #3 — large preview card. Only renders when a table
                  is selected so the user can never see a stale card. */}
              {chosen && (
                <div className="space-y-3">
                  <div
                    className={cn(
                      "rounded-2xl p-4 border-2 shadow-md",
                      chosen.status === "available"
                        ? "bg-[#0F3D2E] border-emerald-500/40 text-emerald-50"
                        : chosen.status === "reserved"
                        ? "bg-[#4A3419] border-amber-500/40 text-amber-50"
                        : "bg-[#4C1D1D] border-rose-500/40 text-rose-50"
                    )}
                  >
                    <p className="text-2xl font-extrabold leading-none text-center tracking-tight">
                      TABLE {chosen.number}
                    </p>
                    <p className="text-center text-xs uppercase tracking-wider opacity-80 mt-1">
                      Capacity: {chosen.capacity} Seats
                    </p>
                    <p className="text-xs text-center mt-3 opacity-90">
                      Will create:
                    </p>
                    <p className="text-center font-bold text-sm mt-1">
                      {labels.map((l) => `${chosen.number}${l}`).join(" and ")}
                    </p>
                    <div className="flex flex-wrap gap-1 justify-center mt-3">
                      {labels.map((l) => (
                        <span
                          key={l}
                          className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/20 text-white border border-white/30"
                        >
                          {chosen.number}
                          {l} • {capacityPerSection} seats
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Input
                      label="Number of Sections"
                      type="number"
                      value={String(splitPartCount)}
                      onChange={(v) => setSplitPartCount(parseInt(v) || 2)}
                    />
                    <p className="text-[10px] text-neutral-500 -mt-1">
                      Total capacity {chosen.capacity} seats split evenly
                      across {n} section(s) (~{capacityPerSection} seats each).
                    </p>
                  </div>

                  <p className="text-xs text-neutral-700 dark:text-neutral-300 text-center">
                    Are you sure you want to split{" "}
                    <span className="font-bold">Table {chosen.number}</span>{" "}
                    into <span className="font-bold">{n} sections</span>?
                  </p>

                  {blockedReason && (
                    <p className="text-[10px] text-rose-600 text-center">
                      {blockedReason}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSplitOpen(false);
                    setSplitTableId("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={!chosen || !!blockedReason}
                  onClick={() => {
                    const labels = splitTableAction();
                    if (labels && splitTable) {
                      toast.push(
                        `Table ${splitTable.number} has been split into ${labels
                          .map((l) => `${splitTable.number}${l}`)
                          .join(" and ")}.`,
                        "success"
                      );
                    }
                    setSplitOpen(false);
                    setSplitTableId("");
                  }}
                >
                  <Split className="h-4 w-4" />{" "}
                  {chosen
                    ? `Split Table ${chosen.number}`
                    : "Split Table"}
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Un-Split confirmation modal ──────────────────────────────
          Replaces window.confirm() which is blocked in some embedded
          iframes. Shows the parent table number, the section names
          and the count of sections that will be merged back. */}
      <Modal
        open={!!unsplitConfirm}
        onClose={() => setUnsplitConfirm(null)}
        title="Confirm Un-Split"
        size="sm"
      >
        {unsplitConfirm && (() => {
          const sections = childrenOf(unsplitConfirm);
          const labels = sections
            .map((s) => displayNumber(s))
            .join(" and ");
          const busy = sections.find((s) =>
            orders.some(
              (o) =>
                o.tableId === s.id &&
                !["paid", "cancelled", "completed"].includes(o.status)
            )
          );
          return (
            <div className="space-y-3">
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 p-3">
                <p className="text-xs uppercase tracking-wider text-neutral-500 font-semibold flex items-center gap-1">
                  🔀 Un-Splitting
                </p>
                <p className="text-xl font-extrabold tracking-tight">
                  TABLE {unsplitConfirm.number}
                </p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  Sections to merge: <span className="font-bold">{labels || "—"}</span>
                </p>
              </div>

              <p className="text-sm text-neutral-700 dark:text-neutral-300 text-center">
                Merge sections{" "}
                <span className="font-bold">{labels || "—"}</span> back into{" "}
                <span className="font-bold">Table {unsplitConfirm.number}</span>?
              </p>

              {busy && (
                <p className="text-[10px] text-rose-600 text-center">
                  Cannot un-split. Complete or transfer all section orders
                  first ({displayNumber(busy)} still busy).
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setUnsplitConfirm(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={performUnsplitConfirm}
                  disabled={!!busy || sections.length === 0}
                >
                  <GitMerge className="h-4 w-4" /> Merge Sections Back
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Merge-Tables selection modal ────────────────────────────── */}
      <Modal
        open={mergeModeOpen}
        onClose={() => {
          setMergeModeOpen(false);
          setMergeSelectedIds([]);
        }}
        title="Merge Multiple Tables"
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Select 2 or more tables to merge into a single bill. Only one
            order and one bill will exist for the merged group.
          </p>
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
            {tables
              .filter(
                (t) =>
                  t.status !== "split" &&
                  t.status !== "merged" &&
                  !t.parentTableId
              )
              .map((t) => {
                const checked = mergeSelectedIds.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 cursor-pointer text-sm border-b border-neutral-100 dark:border-neutral-800 last:border-b-0",
                      checked
                        ? "bg-gold-50 dark:bg-gold-500/10"
                        : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-gold-500"
                      checked={checked}
                      onChange={(e) => {
                        setMergeSelectedIds((prev) =>
                          e.target.checked
                            ? [...prev, t.id]
                            : prev.filter((x) => x !== t.id)
                        );
                      }}
                    />
                    <span className="font-medium">T{t.number}</span>
                    <span className="text-xs text-neutral-500">{t.capacity} seats</span>
                    <span className="ml-auto text-xs uppercase tracking-wider text-neutral-500">
                      {t.status}
                    </span>
                  </label>
                );
              })}
          </div>
          <p className="text-xs text-neutral-500">
            {mergeSelectedIds.length} selected
          </p>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setMergeModeOpen(false);
                setMergeSelectedIds([]);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={mergeSelected}
              disabled={mergeSelectedIds.length < 2}
            >
              <GitMerge className="h-4 w-4" /> Merge Selected
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={bulkPrintOpen} onClose={() => setBulkPrintOpen(false)} title="Print All QR Codes" size="lg">
        <BulkQrPrint
          tables={tables}
          settingsName={settings.name}
          onClose={() => setBulkPrintOpen(false)}
        />
      </Modal>
    </div>
  );
}

function StatCard({
  label,
  count,
  tone,
  icon,
}: {
  label: string;
  count: number;
  tone: "emerald" | "amber" | "rose" | "neutral";
  icon: React.ReactNode;
}) {
  const map: Record<string, string> = {
    emerald: "from-emerald-500/30 to-emerald-700/10 text-emerald-600 dark:text-emerald-300",
    amber: "from-amber-500/30 to-amber-700/10 text-amber-600 dark:text-amber-300",
    rose: "from-rose-500/30 to-rose-700/10 text-rose-600 dark:text-rose-300",
    neutral: "from-gold-400/30 to-gold-700/10 text-gold-600 dark:text-gold-300",
  };
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="stat-tile"
    >
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            {label}
          </p>
          <p className="mt-1 text-2xl md:text-3xl font-bold tracking-tight">{count}</p>
        </div>
        <div
          className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br",
            map[tone]
          )}
        >
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

// Modal that displays the QR code for a single table.
// Uses the secure token-based URL so the table number is never exposed.
function QRModal({
  table,
  settingsName,
  onClose,
}: {
  table: RestaurantTable | null;
  settingsName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [token, setToken] = useState<string>("");
  const [qrUrl, setQrUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Make sure a token exists for this table, then render the QR code.
  useEffect(() => {
    if (!table) return;
    const t = ensureTokenForTable(table.id);
    setToken(t);
    const url = qrUrlForToken(t);
    QRCode.toDataURL(url, {
      width: 600,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
  }, [table]);

  if (!table) return null;

  const fullUrl = qrUrlForToken(token);

  const handleDownload = () => {
    if (!qrUrl) return;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `table-${table.number}-qr.png`;
    a.click();
  };

  const handlePrint = () => {
    if (!qrUrl) return;
    const w = window.open("", "_blank", "width=600,height=750");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>QR Table ${table.number}</title>
      <style>
        @page { size: auto; margin: 12mm; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; text-align: center; padding: 24px; color: #111; }
        h1 { margin: 0 0 4px; font-size: 22px; }
        p { margin: 4px 0; color: #555; font-size: 13px; }
        img { width: 320px; height: 320px; margin-top: 16px; }
        .table { font-size: 38px; font-weight: 800; margin-top: 8px; color: #b8860b; }
      </style>
      </head><body>
      <h1>${escapeHtml(settingsName)}</h1>
      <div class="table">Table ${table.number}</div>
      <p>Scan to view the menu & place your order</p>
      <img src="${qrUrl}" alt="QR" />
      <p style="margin-top:16px">Powered by 7 Spices POS</p>
      <script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
      </body></html>`);
    w.document.close();
  };

  const handleRegenerate = () => {
    if (!confirm(`Regenerate QR token for Table ${table.number}? The existing QR will stop working.`)) return;
    const newToken = generateTokenForTable(table.id);
    setToken(newToken);
    const url = qrUrlForToken(newToken);
    QRCode.toDataURL(url, {
      width: 600,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
    toast.push(`QR regenerated for Table ${table.number}`, "success");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.push("Link copied to clipboard", "info");
    } catch {
      toast.push("Could not copy link", "error");
    }
  };

  return (
    <Modal open={!!table} onClose={onClose} title={`Table ${table.number} — QR Code`} size="sm">
      <div className="text-center space-y-3">
        <p className="text-sm text-neutral-500">
          Customers scan this QR to open the menu directly — no login required.
        </p>
        <div className="flex justify-center">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt={`QR for Table ${table.number}`}
              className="h-64 w-64 rounded-lg border border-neutral-200 p-2 bg-white"
            />
          ) : (
            <div className="h-64 w-64 rounded-lg bg-neutral-100 animate-pulse" />
          )}
        </div>
        <p className="text-xs text-neutral-500">{settingsName}</p>

        {/* Token shown in small print for staff reference only */}
        <p className="text-[10px] font-mono text-neutral-400 break-all">token: {token}</p>

        {/* Action buttons: View / Download / Print / Regenerate */}
        <div className="grid grid-cols-2 gap-2">
          {qrUrl && (
            <Button variant="outline" onClick={() => window.open(fullUrl, "_blank")}>
              <ExternalLink className="h-4 w-4" /> View
            </Button>
          )}
          {qrUrl && (
            <Button variant="primary" onClick={handleDownload}>
              <Download className="h-4 w-4" /> Download
            </Button>
          )}
          {qrUrl && (
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          )}
          <Button variant="ghost" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy Link"}
          </Button>
        </div>
        <div className="pt-2 border-t">
          <Button variant="danger" size="sm" onClick={handleRegenerate} className="w-full">
            <RefreshCcw className="h-4 w-4" /> Regenerate QR Token
          </Button>
          <p className="text-[10px] text-neutral-500 mt-2">
            Regenerating makes the previous QR unusable. Use if you suspect the token was leaked.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Bulk QR print — generates a printable HTML page with one QR per table.
// Useful for laminating or printing a sheet of QRs at table setup time.
function BulkQrPrint({
  tables,
  settingsName,
  onClose,
}: {
  tables: RestaurantTable[];
  settingsName: string;
  onClose: () => void;
}) {
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, string> = {};
      for (const t of tables) {
        const token = ensureTokenForTable(t.id);
        const url = qrUrlForToken(token);
        try {
          out[t.id] = await QRCode.toDataURL(url, {
            width: 240,
            margin: 1,
            color: { dark: "#000000", light: "#FFFFFF" },
          });
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) {
        setQrCodes(out);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tables]);

  const handlePrint = () => {
    const cards = tables
      .map((t) => {
        const dataUrl = qrCodes[t.id];
        if (!dataUrl) return "";
        return `
          <div class="card">
            <div class="name">${escapeHtml(settingsName)}</div>
            <div class="table">Table ${t.number}</div>
            <img src="${dataUrl}" alt="QR Table ${t.number}" />
            <div class="foot">Scan to view the menu &amp; order</div>
          </div>
        `;
      })
      .join("");
    const html = `<!doctype html><html><head><title>QR Codes — ${escapeHtml(settingsName)}</title>
      <style>
        @page { size: A4; margin: 10mm; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; color: #111; margin: 0; padding: 16px; }
        h1 { text-align: center; margin: 0 0 16px; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .card { border: 2px solid #b8860b; border-radius: 12px; padding: 16px; text-align: center; break-inside: avoid; }
        .name { font-size: 14px; font-weight: 700; color: #b8860b; }
        .table { font-size: 24px; font-weight: 800; margin: 4px 0 12px; }
        img { width: 200px; height: 200px; }
        .foot { font-size: 11px; color: #555; margin-top: 8px; }
      </style></head><body>
      <h1>${escapeHtml(settingsName)} — Table QR Codes</h1>
      <div class="grid">${cards}</div>
      <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
      </body></html>`;
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">
        Print a single A4 sheet containing every table's QR. Each QR encodes a
        unique, unguessable token so customers cannot switch tables by editing
        the URL.
      </p>
      {!ready ? (
        <div className="text-center py-10 text-sm text-neutral-500">
          Generating QR codes for {tables.length} tables…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-y-auto p-2 border border-neutral-200 dark:border-neutral-800 rounded-lg">
            {tables.map((t) => (
              <div
                key={t.id}
                className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-2 text-center"
              >
                <div className="text-xs font-bold text-gold-700 dark:text-gold-300">
                  Table {t.number}
                </div>
                {qrCodes[t.id] ? (
                  <img src={qrCodes[t.id]} alt={`QR T${t.number}`} className="w-full h-24 object-contain" />
                ) : (
                  <div className="h-24 bg-neutral-100 animate-pulse" />
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" onClick={handlePrint}>
              <Printer className="h-4 w-4" /> Print Sheet
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function MergeTransfer({
  tables,
  orders,
  onTransfer,
}: {
  tables: RestaurantTable[];
  orders: ReturnType<typeof Store.listOrders>;
  onTransfer: (fromId: string, toId: string) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">Move an active order from one table to another.</p>
      <label className="block">
        <span className="block mb-1 text-xs font-medium">From Table</span>
        <select
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        >
          <option value="">Select…</option>
          {tables
            .filter((t) =>
              orders.some(
                (o) =>
                  o.tableId === t.id &&
                  o.status !== "paid" &&
                  o.status !== "cancelled" &&
                  o.status !== "completed"
              )
            )
            .map((t) => (
              <option key={t.id} value={t.id}>
                Table {t.number} (occupied)
              </option>
            ))}
        </select>
      </label>
      <label className="block">
        <span className="block mb-1 text-xs font-medium">To Table</span>
        <select
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        >
          <option value="">Select…</option>
          {tables
            .filter((t) => t.id !== from)
            .map((t) => (
              <option key={t.id} value={t.id}>
                Table {t.number}
              </option>
            ))}
        </select>
      </label>
      <Button variant="primary" className="w-full" onClick={() => onTransfer(from, to)}>
        <ArrowRightLeft className="h-4 w-4" /> Transfer
      </Button>
    </div>
  );
}
