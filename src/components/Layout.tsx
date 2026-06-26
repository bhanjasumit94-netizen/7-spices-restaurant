import { ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  UtensilsCrossed,
  Boxes,
  TableProperties,
  ClipboardList,
  BarChart3,
  Settings,
  Users,
  LogOut,
  Sun,
  Moon,
  Menu as MenuIcon,
  X,
  Bell,
  ChefHat,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { Logo } from "./Logo";
import { Store, useLogo } from "../lib/store";
import { useNotifications, useNotificationCounts } from "../lib/notifications";
import { cn } from "../utils/cn";
import { NotificationCenter } from "./NotificationCenter";
import { can, Capability } from "../lib/permissions";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  cap: Capability;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" />, cap: "view_dashboard" },
  { to: "/billing", label: "Billing / POS", icon: <Receipt className="h-5 w-5" />, cap: "manage_billing" },
  { to: "/waiter", label: "Waiter Orders", icon: <ChefHat className="h-5 w-5" />, cap: "view_waiter_orders" },
  // QR Menu intentionally hidden from the sidebar — customers access it
  // directly via the QR code on their table. The page, route, token system,
  // and database still work unchanged.
  { to: "/tables", label: "Tables", icon: <TableProperties className="h-5 w-5" />, cap: "manage_tables" },
  { to: "/menu", label: "Menu", icon: <UtensilsCrossed className="h-5 w-5" />, cap: "manage_menu" },
  { to: "/orders", label: "Orders", icon: <ClipboardList className="h-5 w-5" />, cap: "view_orders" },
  { to: "/inventory", label: "Inventory", icon: <Boxes className="h-5 w-5" />, cap: "manage_inventory" },
  { to: "/reports", label: "Reports", icon: <BarChart3 className="h-5 w-5" />, cap: "view_reports" },
  { to: "/users", label: "Users", icon: <Users className="h-5 w-5" />, cap: "manage_users" },
  { to: "/settings", label: "Settings", icon: <Settings className="h-5 w-5" />, cap: "manage_settings" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const logo = useLogo();
  const notifications = useNotifications();
  const counts = useNotificationCounts();

  if (!user) return <>{children}</>;
  const items = NAV.filter((n) => can(user.role, n.cap));

  return (
    <div className="min-h-screen bg-premium flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static z-40 inset-y-0 left-0 w-72 lg:w-64 bg-neutral-950 text-neutral-200 transform transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="px-5 py-5 border-b border-neutral-800/80">
            <div className="flex items-center justify-between">
              <Logo size="md" logoUrl={logo} />
              <button
                onClick={() => setOpen(false)}
                className="lg:hidden p-2 rounded-md text-neutral-400 hover:bg-neutral-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === "/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-gradient-to-r from-gold-500/20 to-gold-700/5 text-gold-300 ring-1 ring-gold-500/30"
                      : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-100"
                  )
                }
              >
                {it.icon}
                <span>{it.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="px-3 py-3 border-t border-neutral-800/80">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-neutral-900/60">
              <div className="h-9 w-9 rounded-full bg-gold-gradient flex items-center justify-center text-white font-bold">
                {user.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-100 truncate">{user.name}</p>
                <p className="text-xs text-gold-300 capitalize">
                  {user.role.replace("_", " ")}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="mt-2 w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-neutral-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <div onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/50 lg:hidden" />
      )}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-neutral-950/80 backdrop-blur border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between px-4 lg:px-6 h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOpen(true)}
                className="lg:hidden p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2 lg:hidden">
                {logo ? (
                  <img src={logo} alt="Logo" className="h-8 w-8 rounded-md object-cover bg-white" />
                ) : null}
                <h1 className="text-base font-semibold leading-tight">7 Spices</h1>
              </div>
              <div className="hidden lg:block">
                <h1 className="text-base lg:text-lg font-semibold leading-tight">
                  7 Spices Restaurant
                </h1>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  POS • Billing • QR Orders • Inventory
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="relative">
                <button
                  onClick={() => {
                    setBellOpen((p) => !p);
                  }}
                  className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 relative"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {counts.total > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-neutral-950">
                      {counts.total > 99 ? "99+" : counts.total}
                    </span>
                  )}
                </button>
                {bellOpen && (
                  <NotificationCenter
                    notifications={notifications}
                    onClose={() => setBellOpen(false)}
                    onSelect={(n: import("../lib/types").Notification) => {
                      // Mark this notification as read
                      Store.addNotification({
                        type: n.type,
                        message: n.message,
                        orderId: n.orderId,
                      });
                      setBellOpen(false);
                    }}
                  />
                )}
              </div>
              <button
                onClick={toggle}
                className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                title="Toggle theme"
              >
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
