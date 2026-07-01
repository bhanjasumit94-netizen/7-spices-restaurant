import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, QrCode, ChefHat, Monitor, Power, CheckCircle2 } from "lucide-react";
import { Button, Card, Badge, Empty } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore } from "../lib/store";
import { MenuCategory, MenuItem } from "../lib/types";
import { inr } from "../lib/money";
import { useAuth } from "../lib/auth";
import { can } from "../lib/permissions";
import AccessDenied from "./AccessDenied";

type Tab = "qr" | "pos" | "waiter";

function VegDot({ veg }: { veg: boolean }) {
  return (
    <span
      className={`h-3 w-3 rounded-sm border-2 ${veg ? "border-emerald-600" : "border-rose-600"} flex items-center justify-center`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${veg ? "bg-emerald-600" : "bg-rose-600"}`} />
    </span>
  );
}

function QRPreview({ cats, items }: { cats: MenuCategory[]; items: MenuItem[] }) {
  return (
    <div className="space-y-4">
      {cats.map((c) => {
        const list = items.filter((i) => i.categoryId === c.id && i.available);
        if (!list.length) return null;
        return (
          <div key={c.id}>
            <h4 className="font-bold mb-2 text-gold-600 dark:text-gold-400">{c.name}</h4>
            <div className="grid gap-2">
              {list.map((it) => (
                <div key={it.id} className="flex items-center justify-between border rounded-lg p-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <VegDot veg={it.veg} />
                    <span className="truncate">{it.name}</span>
                  </div>
                  <span className="font-semibold">{inr(it.price)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function POSPreview({ cats, items }: { cats: MenuCategory[]; items: MenuItem[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
      {items
        .filter((i) => i.available)
        .map((it) => {
          const cat = cats.find((c) => c.id === it.categoryId);
          return (
            <div key={it.id} className="menu-card">
              <div className="flex items-center gap-2 mb-1">
                <VegDot veg={it.veg} />
                <Badge tone="gold">{cat?.name ?? "—"}</Badge>
              </div>
              <p className="font-semibold text-sm">{it.name}</p>
              <p className="text-gold-600 dark:text-gold-400 font-bold">{inr(it.price)}</p>
            </div>
          );
        })}
    </div>
  );
}

function WaiterPreview({ cats, items }: { cats: MenuCategory[]; items: MenuItem[] }) {
  return (
    <div className="space-y-3">
      {cats.map((c) => {
        const list = items.filter((i) => i.categoryId === c.id && i.available);
        if (!list.length) return null;
        return (
          <div key={c.id} className="border rounded-lg p-3">
            <p className="font-bold mb-2">{c.name}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
              {list.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <VegDot veg={it.veg} />
                    <span className="truncate">{it.name}</span>
                  </div>
                  <span className="font-semibold">{inr(it.price)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MenuProfilePreview() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const profiles = useStore("mp", Store.listMenuProfiles);
  const profile = useMemo(() => profiles.find((p) => p.id === id) ?? null, [profiles, id]);
  const canActivate = can(user?.role, "activate_menu_profiles");
  const [tab, setTab] = useState<Tab>("qr");

  if (!can(user?.role, "view_menu_profiles")) return <AccessDenied />;

  if (!profile) {
    return (
      <Card>
        <Empty message="Profile not found" hint="It may have been deleted." />
        <div className="flex justify-center mt-3">
          <Button variant="primary" onClick={() => navigate("/menu-profiles")}>
            <ArrowLeft className="h-4 w-4" /> Back to Profiles
          </Button>
        </div>
      </Card>
    );
  }

  const visibleItems = (profile.items ?? []).filter((i) => i.available);
  const cats = profile.categories ?? [];

  const setActive = () => {
    Store.activateMenuProfile(profile.id);
    toast.push(`${profile.name} is now the active menu`, "success");
    navigate("/menu-profiles");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/menu-profiles"
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold flex items-center gap-2 truncate">
              Preview: {profile.name}
              {profile.isActive && <Badge tone="success">Active</Badge>}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Read-only preview · {visibleItems.length} visible items · hidden items removed
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to={`/menu-profiles/${profile.id}/items`}>
            <Button variant="outline">Edit Items</Button>
          </Link>
          {canActivate && !profile.isActive && (
            <Button variant="primary" onClick={setActive}>
              <Power className="h-4 w-4" /> Set as Current Menu
            </Button>
          )}
          {profile.isActive && (
            <Badge tone="success">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Currently Active
            </Badge>
          )}
        </div>
      </div>

      <Card>
        <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 mb-4 overflow-x-auto">
          {([
            { id: "qr", label: "QR Menu Preview", icon: QrCode },
            { id: "pos", label: "POS Preview", icon: Monitor },
            { id: "waiter", label: "Waiter App Preview", icon: ChefHat },
          ] as { id: Tab; label: string; icon: typeof QrCode }[]).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${
                  tab === t.id
                    ? "border-gold-500 text-gold-600"
                    : "border-transparent text-neutral-500 hover:text-neutral-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {visibleItems.length === 0 ? (
          <Empty
            message="No visible items"
            hint="Add items in Manage Items to see the preview."
          />
        ) : tab === "qr" ? (
          <QRPreview cats={cats} items={visibleItems} />
        ) : tab === "pos" ? (
          <POSPreview cats={cats} items={visibleItems} />
        ) : (
          <WaiterPreview cats={cats} items={visibleItems} />
        )}
      </Card>
    </div>
  );
}
