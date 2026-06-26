import { Role } from "./types";

// Centralized permission rules for the entire app.
// Returns true when the user has the given capability.

export type Capability =
  | "view_dashboard"
  | "manage_billing"
  | "view_waiter_orders"
  | "view_qr_menu"
  | "manage_tables"
  | "manage_menu"
  | "view_orders"
  | "manage_inventory"
  | "view_reports"
  | "manage_users"
  | "manage_settings"
  | "manage_waiter_orders" // can act on orders (mark preparing/ready etc.)
  | "process_payments";

// Mapping of roles to capabilities. Higher-tier roles include lower-tier ones.
const ROLE_CAPS: Record<Role, Capability[]> = {
  super_admin: [
    "view_dashboard",
    "manage_billing",
    "view_waiter_orders",
    "view_qr_menu",
    "manage_tables",
    "manage_menu",
    "view_orders",
    "manage_inventory",
    "view_reports",
    "manage_users",
    "manage_settings",
    "manage_waiter_orders",
    "process_payments",
  ],
  admin: [
    "view_dashboard",
    "manage_billing",
    "view_waiter_orders",
    "view_qr_menu",
    "manage_tables",
    "manage_menu",
    "view_orders",
    "manage_inventory",
    "view_reports",
    "manage_users",
    "manage_settings",
    "manage_waiter_orders",
    "process_payments",
  ],
  manager: [
    "view_dashboard",
    "manage_billing",
    "view_waiter_orders",
    "view_qr_menu",
    "manage_tables",
    "manage_menu",
    "view_orders",
    "manage_inventory",
    "view_reports",
    "manage_settings",
    "manage_waiter_orders",
    "process_payments",
  ],
  staff: [
    "view_dashboard",
    "manage_billing",
    "view_qr_menu",
    "manage_tables",
    "view_orders",
    "process_payments",
  ],
  waiter: ["view_waiter_orders", "manage_waiter_orders"],
};

export function can(role: Role | undefined | null, cap: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPS[role]?.includes(cap) ?? false;
}

// Which sidebar items each role can see.
export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
  waiter: "Waiter",
};

// Whether the current user can manage a target user.
export function canManageUser(currentRole: Role | undefined, targetRole: Role): boolean {
  if (!currentRole) return false;
  // Only Super Admin can touch another Super Admin account.
  if (targetRole === "super_admin" && currentRole !== "super_admin") return false;
  // Admin and Super Admin can manage everyone else.
  if (currentRole === "super_admin" || currentRole === "admin") return true;
  // Other roles cannot manage users at all.
  return false;
}

export function canEditUser(currentRole: Role | undefined, targetRole: Role): boolean {
  if (!currentRole) return false;
  if (targetRole === "super_admin" && currentRole !== "super_admin") return false;
  return currentRole === "super_admin" || currentRole === "admin";
}

export function canDeleteUser(currentRole: Role | undefined, targetRole: Role): boolean {
  // Cannot delete yourself; cannot delete Super Admin unless you are Super Admin.
  return canEditUser(currentRole, targetRole);
}

export function canResetPassword(currentRole: Role | undefined, targetRole: Role): boolean {
  return canEditUser(currentRole, targetRole);
}

export function isSuperAdmin(role: Role | undefined): boolean {
  return role === "super_admin";
}

// The default landing route for each role. Used after login and after
// access-denied redirects so users never get sent to a forbidden page.
export function getDefaultRoute(role: Role | undefined | null): string {
  switch (role) {
    case "waiter":
      return "/waiter";
    case "staff":
      return "/billing"; // staff primary job is billing
    case "manager":
    case "admin":
    case "super_admin":
    default:
      return "/";
  }
}

// Convenience: paths a role is allowed to visit unaided.
export function isPathAllowedForRole(role: Role | undefined, path: string): boolean {
  if (!role) return false;
  // Public paths everyone (including unauthenticated visitors) can hit.
  // The customer ordering routes are 100% public so QR scans never redirect
  // to /login.
  if (
    path === "/login" ||
    path.startsWith("/qr") ||
    path.startsWith("/menu") ||
    path.startsWith("/order") ||
    path.startsWith("/customer")
  ) {
    return true;
  }

  // Map of path → required capability
  const PATH_CAPS: { pattern: RegExp; cap: Capability }[] = [
    { pattern: /^\/$/, cap: "view_dashboard" },
    { pattern: /^\/billing/, cap: "manage_billing" },
    { pattern: /^\/waiter/, cap: "view_waiter_orders" },
    { pattern: /^\/qr/, cap: "view_qr_menu" },
    { pattern: /^\/tables/, cap: "manage_tables" },
    { pattern: /^\/menu/, cap: "manage_menu" },
    { pattern: /^\/orders/, cap: "view_orders" },
    { pattern: /^\/inventory/, cap: "manage_inventory" },
    { pattern: /^\/reports/, cap: "view_reports" },
    { pattern: /^\/users/, cap: "manage_users" },
    { pattern: /^\/settings/, cap: "manage_settings" },
  ];

  // Find the first matching pattern
  const match = PATH_CAPS.find((p) => p.pattern.test(path));
  if (!match) return true; // unknown paths fall through to the catch-all Navigate
  return can(role, match.cap);
}
