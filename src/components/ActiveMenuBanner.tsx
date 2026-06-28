import { useEffect, useState } from "react";
import { CalendarClock, PartyPopper, UtensilsCrossed } from "lucide-react";
import { Store, useStore } from "../lib/store";
import { MenuProfile } from "../lib/types";

export type ProfileStatus = "active" | "scheduled" | "expired" | "archived" | "draft" | "regular";

export function profileStatus(p: MenuProfile | null | undefined): ProfileStatus {
  if (!p) return "regular";
  if (p.archived) return "archived";
  if (p.isActive) return "active";
  const now = Date.now();
  if (p.startDate && p.startDate > now) return "scheduled";
  if (p.endDate && p.endDate < now) return "expired";
  return "draft";
}

// Tailwind-safe class map. Regular = blue, Active festival = orange,
// Scheduled = purple, Expired/Archived = gray, Draft = neutral.
export const STATUS_STYLES: Record<
  ProfileStatus,
  { badge: string; ring: string; soft: string; label: string }
> = {
  active: {
    badge: "bg-orange-500 text-white",
    ring: "border-orange-500 ring-orange-500/40",
    soft: "bg-orange-50 dark:bg-orange-500/10",
    label: "Active",
  },
  scheduled: {
    badge: "bg-purple-500 text-white",
    ring: "border-purple-500 ring-purple-500/40",
    soft: "bg-purple-50 dark:bg-purple-500/10",
    label: "Scheduled",
  },
  expired: {
    badge: "bg-neutral-400 text-white",
    ring: "border-neutral-300",
    soft: "bg-neutral-50 dark:bg-neutral-800/40",
    label: "Expired",
  },
  archived: {
    badge: "bg-neutral-500 text-white",
    ring: "border-neutral-400",
    soft: "bg-neutral-50 dark:bg-neutral-800/40",
    label: "Archived",
  },
  draft: {
    badge: "bg-neutral-400 text-white",
    ring: "border-neutral-300",
    soft: "bg-neutral-50 dark:bg-neutral-800/40",
    label: "Draft",
  },
  regular: {
    badge: "bg-blue-500 text-white",
    ring: "border-blue-300",
    soft: "bg-blue-50 dark:bg-blue-500/10",
    label: "Regular",
  },
};

function pickUpcoming(profiles: MenuProfile[]): MenuProfile | null {
  const now = Date.now();
  return (
    profiles
      .filter((p) => !p.archived && !p.isActive && p.startDate && p.startDate > now)
      .sort((a, b) => (a.startDate ?? 0) - (b.startDate ?? 0))[0] ?? null
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "ending soon";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function ActiveMenuBanner({ compact = false }: { compact?: boolean }) {
  const active = useStore("mp_active", () => Store.getActiveMenuProfile());
  const profiles = useStore("mp", Store.listMenuProfiles);
  const upcoming = !active ? pickUpcoming(profiles) : null;

  // Tick once a minute so the countdown stays fresh.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const status: ProfileStatus = active
    ? "active"
    : upcoming
    ? "scheduled"
    : "regular";
  const style = STATUS_STYLES[status];
  const profile = active ?? upcoming;

  let title = "Regular Menu";
  let sub = "Standard pricing and items";
  let icon = <UtensilsCrossed className="h-4 w-4" />;

  if (active) {
    title = active.name;
    icon = <PartyPopper className="h-4 w-4" />;
    const end = active.endDate;
    sub = end
      ? `🎉 Festival ends in ${formatCountdown(end - Date.now())} · ${new Date(end).toLocaleDateString()}`
      : "Festival menu active";
  } else if (upcoming) {
    title = upcoming.name;
    icon = <CalendarClock className="h-4 w-4" />;
    sub = `Starts in ${formatCountdown((upcoming.startDate ?? 0) - Date.now())} · ${new Date(upcoming.startDate!).toLocaleDateString()}`;
  }

  return (
    <div
      className={`panel border-l-4 flex items-center gap-3 ${style.ring} ${style.soft} ${
        compact ? "px-3 py-2" : "p-3"
      }`}
    >
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${style.badge}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">
            {active ? "Festival Menu Active" : upcoming ? "Upcoming Menu" : "Active Menu"}
          </p>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${style.badge}`}>
            {style.label}
          </span>
        </div>
        <p className="font-semibold text-sm truncate">
          {active ? `🎉 FESTIVAL MENU ACTIVE – ${title}` : title}
        </p>
        {!compact && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{sub}</p>
        )}
      </div>
      {profile && !compact && profile.endDate && active && (
        <div className="hidden sm:block text-right">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Ends</p>
          <p className="text-xs font-semibold">
            {new Date(profile.endDate).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}
