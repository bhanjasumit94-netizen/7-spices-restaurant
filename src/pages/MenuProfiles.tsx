import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Copy,
  Trash2,
  Edit2,
  PartyPopper,
  CheckCircle2,
  Calendar,
  Power,
  PowerOff,
  ListChecks,
  Eye,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Input, Modal, Badge, Empty, Select } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore } from "../lib/store";
import { MenuProfile, MenuCategory, MenuItem } from "../lib/types";
import { useAuth } from "../lib/auth";
import { can } from "../lib/permissions";
import { profileStatus, STATUS_STYLES } from "../components/ActiveMenuBanner";

const FESTIVAL_PRESETS = [
  "Durga Puja",
  "Christmas",
  "New Year",
  "Valentine's Day",
  "Eid",
  "Diwali",
  "IPL Menu",
  "Custom Festival",
];

type CreateMode = "festival" | "duplicate";
type CreateSource = "empty" | "duplicate";

function toDateInput(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromDateInput(v: string): number | undefined {
  if (!v) return undefined;
  return new Date(v + "T00:00:00").getTime();
}

export default function MenuProfiles() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const profiles = useStore("mp", Store.listMenuProfiles);
  const activeProfile = useStore("mp_active", () => Store.getActiveMenuProfile());

  const canCreate = can(user?.role, "create_menu_profiles");
  const canActivate = can(user?.role, "activate_menu_profiles");
  const canEdit = can(user?.role, "edit_menu_profiles");
  const canDelete = can(user?.role, "delete_menu_profiles");

  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CreateMode>("festival");
  const [editing, setEditing] = useState<MenuProfile | null>(null);
  const [festivalChoice, setFestivalChoice] = useState<string>(FESTIVAL_PRESETS[0]);
  const [customName, setCustomName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [autoActivate, setAutoActivate] = useState(false);
  const [autoRevert, setAutoRevert] = useState(true);
  const [source, setSource] = useState<CreateSource>("empty");

  const sorted = useMemo(
    () =>
      [...profiles]
        .filter((p) => (showArchived ? true : !p.archived))
        .sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.createdAt - a.createdAt),
    [profiles, showArchived]
  );

  const resetForm = () => {
    setMode("festival");
    setEditing(null);
    setFestivalChoice(FESTIVAL_PRESETS[0]);
    setCustomName("");
    setDescription("");
    setStartDate("");
    setEndDate("");
    setAutoActivate(false);
    setAutoRevert(true);
    setSource("empty");
  };

  const openCreate = (m: CreateMode) => {
    resetForm();
    setMode(m);
    setSource(m === "duplicate" ? "duplicate" : "empty");
    setOpen(true);
  };

  const openEdit = (p: MenuProfile) => {
    setEditing(p);
    setMode("duplicate");
    setCustomName(p.name);
    setFestivalChoice("Custom Festival");
    setDescription(p.description ?? "");
    setStartDate(toDateInput(p.startDate));
    setEndDate(toDateInput(p.endDate));
    setAutoActivate(!!p.autoActivate);
    setAutoRevert(p.autoRevert !== false);
    setOpen(true);
  };

  const submit = () => {
    const name =
      mode === "festival" && festivalChoice !== "Custom Festival"
        ? festivalChoice
        : customName.trim();
    if (!name) {
      toast.push("Please enter a profile name", "error");
      return;
    }
    const sd = fromDateInput(startDate);
    const ed = fromDateInput(endDate);
    if (sd && ed && ed < sd) {
      toast.push("End date must be after start date", "error");
      return;
    }

    if (editing) {
      Store.updateMenuProfile(editing.id, {
        name,
        description,
        startDate: sd,
        endDate: ed,
        autoActivate,
        autoRevert,
      });
      toast.push("Menu profile updated", "success");
      setOpen(false);
      return;
    }

    const created =
      source === "empty"
        ? Store.addMenuProfile({
            name,
            description: description || `${name} festival menu`,
            isActive: false,
            startDate: sd,
            endDate: ed,
            // Seed with copies of all existing regular-menu categories so
            // the profile starts with the same structure but zero items.
            // Items can be imported or added manually.
            categories: Store.getBaseCategories().map((c) => ({
              ...c,
              hidden: false,
            })) as MenuCategory[],
            items: [] as MenuItem[],
            createdBy: user?.id ?? "system",
            createdByName: user?.name,
          })
        : Store.duplicateCurrentMenuAsProfile(name, {
            description: description || `${name} festival menu`,
            startDate: sd,
            endDate: ed,
            createdBy: user?.id ?? "system",
            createdByName: user?.name,
          });
    Store.updateMenuProfile(created.id, { autoActivate, autoRevert });
    toast.push(`${name} created — manage items next`, "success");
    setOpen(false);
    // Workflow: Create → Manage Items → Preview → Set as Current.
    navigate(`/menu-profiles/${created.id}/items`);
  };

  const activate = (p: MenuProfile) => {
    Store.activateMenuProfile(p.id);
    toast.push(`${p.name} is now the active menu`, "success");
  };
  const deactivate = () => {
    Store.activateMenuProfile(null);
    toast.push("Reverted to Regular menu", "info");
  };
  const remove = (p: MenuProfile) => {
    if (!confirm(`Delete menu profile "${p.name}"? This cannot be undone.`)) return;
    Store.deleteMenuProfile(p.id);
    toast.push("Profile deleted", "info");
  };
  const duplicate = (p: MenuProfile) => {
    Store.addMenuProfile({
      name: `${p.name} (Copy)`,
      description: p.description,
      isActive: false,
      categories: p.categories.map((c) => ({ ...c })),
      items: p.items.map((i) => ({ ...i })),
      createdBy: user?.id ?? "system",
      createdByName: user?.name,
    });
    toast.push("Profile duplicated", "success");
  };
  const archive = (p: MenuProfile) => {
    Store.archiveMenuProfile(p.id, !p.archived);
    toast.push(p.archived ? "Profile restored" : "Profile archived", "info");
  };

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-3"
      >
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold tracking-tight">Menu Profiles</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Seasonal & festival menus — Create → Manage Items → Preview → Set as Current.
            Only one profile is active at a time.
          </p>
        </div>
        {canCreate && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="primary" onClick={() => openCreate("festival")}>
              <PartyPopper className="h-4 w-4" /> Create Festival Menu
            </Button>
            <Button variant="outline" onClick={() => openCreate("duplicate")}>
              <Copy className="h-4 w-4" /> Create from Existing Menu
            </Button>
          </div>
        )}
      </motion.div>

      {/* Current active banner */}
      <Card
        className={
          activeProfile
            ? `border-l-4 ${STATUS_STYLES.active.ring} ${STATUS_STYLES.active.soft}`
            : `border-l-4 ${STATUS_STYLES.regular.ring} ${STATUS_STYLES.regular.soft}`
        }
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Current Active Menu</p>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  activeProfile ? STATUS_STYLES.active.badge : STATUS_STYLES.regular.badge
                }`}
              >
                {activeProfile ? "Festival" : "Regular"}
              </span>
            </div>
            <p className="text-lg font-semibold mt-1">
              {activeProfile ? `🎉 ${activeProfile.name}` : "Regular Menu"}
            </p>
            {activeProfile?.endDate && (
              <p className="text-xs text-neutral-500 mt-1">
                Ends on {new Date(activeProfile.endDate).toLocaleDateString()}
              </p>
            )}
          </div>
          {activeProfile && canActivate && (
            <Button variant="outline" onClick={deactivate}>
              <PowerOff className="h-4 w-4" /> Revert to Regular Menu
            </Button>
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {sorted.length === 0 ? (
        <Card>
          <Empty
            message="No menu profiles yet"
            hint="Create your first festival or seasonal menu to get started."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sorted.map((p) => {
            const status = profileStatus(p);
            const style = STATUS_STYLES[status];
            return (
              <div
                key={p.id}
                className={`panel p-4 border-l-4 ${style.ring} ${
                  p.isActive ? `${style.soft} ring-2 ring-offset-2 ring-offset-transparent ${style.ring}` : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-bold text-lg truncate">{p.name}</h3>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${style.badge}`}
                      >
                        {style.label}
                      </span>
                      {p.isActive && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-600 text-white">
                          Current Menu
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-neutral-500">{p.description}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                  <div>
                    <p className="uppercase tracking-wider text-neutral-500">Categories</p>
                    <p className="font-semibold">{p.categories.length}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider text-neutral-500">Items</p>
                    <p className="font-semibold">{p.items.length}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider text-neutral-500">Start</p>
                    <p className="font-semibold">
                      {p.startDate ? new Date(p.startDate).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider text-neutral-500">End</p>
                    <p className="font-semibold">
                      {p.endDate ? new Date(p.endDate).toLocaleDateString() : "—"}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-neutral-500 mt-2">
                  Created by {p.createdByName ?? "—"} ·{" "}
                  {new Date(p.createdAt).toLocaleDateString()}
                </p>

                <div className="mt-3 flex flex-wrap gap-1">
                  <Link to={`/menu-profiles/${p.id}/items`}>
                    <Button size="sm" variant="outline">
                      <ListChecks className="h-3 w-3" /> Manage Items
                    </Button>
                  </Link>
                  <Link to={`/menu-profiles/${p.id}/preview`}>
                    <Button size="sm" variant="outline">
                      <Eye className="h-3 w-3" /> Preview
                    </Button>
                  </Link>
                  {canActivate && !p.isActive && !p.archived && (
                    <Button size="sm" variant="primary" onClick={() => activate(p)}>
                      <Power className="h-3 w-3" /> Activate
                    </Button>
                  )}
                  {canActivate && p.isActive && (
                    <Button size="sm" variant="ghost" onClick={deactivate}>
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                      <Edit2 className="h-3 w-3" /> Edit
                    </Button>
                  )}
                  {canCreate && (
                    <Button size="sm" variant="ghost" onClick={() => duplicate(p)}>
                      <Copy className="h-3 w-3" /> Duplicate
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => archive(p)}>
                      {p.archived ? (
                        <>
                          <ArchiveRestore className="h-3 w-3" /> Restore
                        </>
                      ) : (
                        <>
                          <Archive className="h-3 w-3" /> Archive
                        </>
                      )}
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="danger" onClick={() => remove(p)}>
                      <Trash2 className="h-3 w-3" /> Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          editing
            ? `Edit "${editing.name}"`
            : mode === "festival"
            ? "Create Festival Menu"
            : "Create from Existing Menu"
        }
        size="lg"
      >
        <div className="space-y-4">
          {!editing && (
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
                Starting point
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(["empty", "duplicate"] as CreateSource[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSource(s)}
                    className={`text-left rounded-lg border p-3 transition ${
                      source === s
                        ? "border-gold-500 bg-gold-50 dark:bg-gold-500/10"
                        : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-400"
                    }`}
                  >
                    <p className="font-semibold text-sm">
                      {s === "empty" ? "Create Empty Menu" : "Create From Existing Menu"}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      {s === "empty"
                        ? "Starts with all existing categories but zero items — add or import items per category."
                        : "Copy all categories and items from the regular menu, then customise."}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!editing && mode === "festival" && (
            <>
              <Select
                label="Festival"
                value={festivalChoice}
                onChange={setFestivalChoice}
                options={FESTIVAL_PRESETS.map((f) => ({ value: f, label: f }))}
              />
              {festivalChoice === "Custom Festival" && (
                <Input
                  label="Custom festival name"
                  value={customName}
                  onChange={setCustomName}
                  placeholder="e.g. Holi Special"
                />
              )}
            </>
          )}

          {(editing || mode === "duplicate") && (
            <Input
              label="Profile name"
              value={customName}
              onChange={setCustomName}
              placeholder="e.g. Summer Menu 2026"
            />
          )}

          <Input
            label="Description (optional)"
            value={description}
            onChange={setDescription}
            placeholder="Short description shown on the profiles page"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Start date (optional)" type="date" value={startDate} onChange={setStartDate} />
            <Input label="End date (optional)" type="date" value={endDate} onChange={setEndDate} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoActivate}
                onChange={(e) => setAutoActivate(e.target.checked)}
              />
              Auto-activate on start date
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRevert}
                onChange={(e) => setAutoRevert(e.target.checked)}
              />
              Auto-revert on end date
            </label>
          </div>

          {(startDate || endDate) && (
            <p className="text-xs text-neutral-500 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              The system runs the schedule every minute.
            </p>
          )}

          {!editing && (
            <div className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg p-3">
              {source === "empty"
                ? "The new profile starts with all regular-menu categories and zero items. You'll be taken to Manage Items to add items or import them from the regular menu."
                : "The new profile starts as a copy of the current menu. You'll be taken to Manage Items to edit prices, then Preview, then \"Set as Current\"."}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit}>
              <Plus className="h-4 w-4" /> {editing ? "Save Changes" : "Create & Manage Items"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
