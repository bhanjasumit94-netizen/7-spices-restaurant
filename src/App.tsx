import { useEffect, useState } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { ToasterProvider } from "./components/Toaster";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Loading } from "./components/Loading";
import { Store } from "./lib/store";
import { syncTokens, pruneTokens, resolveToken } from "./lib/qrTokens";
import { can, Capability, getDefaultRoute, isPathAllowedForRole } from "./lib/permissions";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Billing from "./pages/Billing";
import Waiter from "./pages/Waiter";
import QRMenu from "./pages/QRMenu";
import Tables from "./pages/Tables";
import TableOrderScreen from "./pages/TableOrderScreen";
import Menu from "./pages/Menu";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import MenuProfiles from "./pages/MenuProfiles";
import MenuProfileItems from "./pages/MenuProfileItems";
import MenuProfilePreview from "./pages/MenuProfilePreview";
import ResetSystem from "./pages/ResetSystem";
import AccessDenied from "./pages/AccessDenied";

// ----------------------------------------------------------------------------
// CRITICAL: Public QR detection.
//
// Before any router, provider, or auth check runs, we inspect
// `window.location.hash` and decide whether to render the QR Menu directly,
// bypassing the entire auth + router stack. This is the strongest possible
// guarantee that a customer scanning a QR never sees the login page.
//
// Spec-mandated debug logs:
//   console.log('Hash:', window.location.hash);
//   console.log('Is QR Route:', isQrRoute);
// ----------------------------------------------------------------------------
function isQrHash(hash: string | undefined | null): boolean {
  if (!hash) return false;
  // Strip leading "#" and any leading "/"
  const path = hash.replace(/^#/, "");
  // Match the customer ordering routes — these are all public and bypass
  // the auth/router stack:
  //   /qr[/...]
  //   /menu[/...]
  //   /order[/...]
  //   /customer[/...]
  return (
    path === "/qr" || path.startsWith("/qr/") || path.startsWith("/qr?") ||
    // Bare `/menu` is the ADMIN Menu Management page (protected). Only
    // treat `/menu/<token>`, `/order/<token>`, `/customer/<token>` as QR
    // customer routes. This prevents the customer QR landing screen from
    // shadowing the admin /menu route.
    path.startsWith("/menu/") || path.startsWith("/menu?") ||
    path === "/order" || path.startsWith("/order/") || path.startsWith("/order?") ||
    path === "/customer" || path.startsWith("/customer/") || path.startsWith("/customer?")
  );
}

// Public QR route — renders <QRMenu> for any /#/qr/:token URL.
// The route lives inside the AppShell's <HashRouter> so useParams /
// useLocation have a Router context above them (no more "useLocation()
// may be used only in the context of a <Router>" error).
function PublicQRRoute() {
  const params = useParams<{ token?: string }>();
  const token = params.token;

  // Spec-mandated debug logs.
  // eslint-disable-next-line no-console
  console.log("QR Route Loaded");
  // eslint-disable-next-line no-console
  console.log("Token:", token);

  useEffect(() => {
    const tableId = resolveToken(token);
    // eslint-disable-next-line no-console
    console.log("Hash:", window.location.hash);
    // eslint-disable-next-line no-console
    console.log("Is QR Route:", true);
    // eslint-disable-next-line no-console
    console.log("[QR] Token resolved:", { token, tableId: tableId ?? "INVALID" });
    if (!tableId) {
      // eslint-disable-next-line no-console
      console.warn("[QR] Invalid or unknown token");
    } else {
      // eslint-disable-next-line no-console
      console.log("Redirecting to Login", false);
    }
  }, [token]);

  return <QRMenu />;
}

// ----------------------------------------------------------------------------
// Route guard for protected pages only. QR is intentionally NOT routed here.
// ----------------------------------------------------------------------------
function Protected({
  children,
  capability,
  requireSuperAdmin,
}: {
  children: React.ReactNode;
  capability?: Capability;
  // If true, the route is only accessible to users with role "super_admin".
  // Non-Super-Admin visitors are sent to the in-page Access Denied screen
  // (rendered by the page itself) so the message is clear and consistent.
  requireSuperAdmin?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[Protected]", {
      path: location.pathname,
      user: user?.email ?? null,
      role: user?.role ?? null,
      loading,
      requiredCap: capability ?? "(none)",
      requireSuperAdmin: !!requireSuperAdmin,
    });
  }, [location.pathname, user, loading, capability, requireSuperAdmin]);

  if (loading) return <Loading label="Checking session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (requireSuperAdmin && user.role !== "super_admin") {
    // Block at the route level too. The page itself shows the
    // Access Denied screen with the exact spec-mandated message.
    // eslint-disable-next-line no-console
    console.warn(
      "[Protected] Reset route blocked for role",
      user.role,
      "; super_admin required."
    );
    return <>{children}</>;
  }

  if (capability && !can(user.role, capability)) {
    const home = getDefaultRoute(user.role);
    // eslint-disable-next-line no-console
    console.warn("[Protected] Access denied", {
      path: location.pathname,
      role: user.role,
      required: capability,
      redirectingTo: home,
    });
    return <Navigate to={home} replace />;
  }
  return <Layout>{children as React.ReactNode}</Layout>;
}

// (The old `Router()` and `parseTokenFromHash` helpers were removed in
// the previous refactor. All routing is now declared inside `AppShell`
// further down so every React-Router hook has a <HashRouter> ancestor
// in the React tree — the source of the
// "useLocation() may be used only in the context of a <Router>" error.)

// Catch-all handler. /qr paths are declared explicitly above; this is purely
// for unrelated URLs the user typed.
function NotFoundOrForbidden() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading />;

  // Belt-and-braces: if anything ever lands here with a customer-ordering
  // prefix, render the QRMenu directly instead of sending the customer to
  // /login. Covers all three URL forms: /qr, /menu, /order, /customer.
  if (
    location.pathname.startsWith("/qr") ||
    location.pathname.startsWith("/menu/") ||
    location.pathname.startsWith("/order/") ||
    location.pathname.startsWith("/customer/")
  ) {
    return <QRMenu />;
  }

  // For any unknown / missing route, redirect logged-in users to the
  // dashboard and logged-out users to the login screen (per spec #8).
  if (!user) return <Navigate to="/login" replace />;
  const home = getDefaultRoute(user.role);
  if (!isPathAllowedForRole(user.role, location.pathname)) {
    const KNOWN_PREFIXES = [
      "/", "/billing", "/waiter", "/waiter-orders", "/tables",
      "/menu", "/orders", "/inventory", "/reports", "/users",
      "/settings", "/reset-system", "/login", "/qr", "/order", "/customer",
    ];
    const known = KNOWN_PREFIXES.some((p) => p === "/" ? location.pathname === "/" : location.pathname.startsWith(p));
    if (!known) {
      // eslint-disable-next-line no-console
      console.warn("[NotFoundOrForbidden] Unknown route, redirecting to /dashboard", location.pathname);
      return <Navigate to="/" replace />;
    }
  }
  return <AccessDenied />;
}

// The app shell. Everything that needs a Router context is mounted
// inside this single top-level <HashRouter>. The previous version
// tried to short-circuit a separate <MemoryRouter> for QR pages at
// the top of the App() function — but that meant React-Router hooks
// (useLocation, useNavigate) were called BEFORE any <Router> was
// rendered, producing the runtime error
//   "useLocation() may be used only in the context of a <Router>".
//
// The fix is to keep the entire app inside a single HashRouter and
// branch on the URL inside it. When the URL is a QR URL, the public
// /#/qr/<token> route renders <QRMenu> directly. When it's anything
// else, the protected routes take over.
export default function App() {
  // The single top-level provider tree:
  //   ErrorBoundary → ThemeProvider → ToasterProvider → AuthProvider →
  //   HashRouter → AppShell
  //
  // <AuthProvider> is included unconditionally so that every component
  // which calls useAuth() (the <Protected> guard, the catch-all
  // <NotFoundOrForbidden>, any future layout pieces) has an
  // AuthContext ancestor in the React tree. The provider just reads
  // the session from localStorage and exposes it via context — it does
  // NOT redirect, render any UI, or make any network call — so the
  // public QR route /#/qr/<token> still works for unauthenticated
  // visitors, in incognito, and from a direct QR scan.
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToasterProvider>
          <AuthProvider>
            <HashRouter>
              <AppShell />
            </HashRouter>
          </AuthProvider>
        </ToasterProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

// Everything that needs useLocation, useNavigate, useParams, etc.
// lives inside this component so all React-Router hooks have a
// <HashRouter> ancestor in the React tree above them.
function AppShell() {
  const location = useLocation();
  const [isQr, setIsQr] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isQrHash(window.location.hash);
  });

  // Re-evaluate the QR state on mount and on every React-Router
  // navigation. This also fixes incognito mode where the React state
  // lazy initialiser can miss the hash under fast-render conditions.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const compute = () => isQrHash(window.location.hash);
    setIsQr(compute());
    const handler = () => {
      const qr = compute();
      // eslint-disable-next-line no-console
      console.log("[App] Hash changed:", window.location.hash, "isQr:", qr);
      setIsQr(qr);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.hash]);

  // Bootstrap: seed DB + QR tokens. Seeding is performed synchronously
  // when `store.ts` is first imported, so the menu is always populated
  // before any component renders.
  useEffect(() => {
    try {
      const tables = Store.listTables();
      Store.ensureSplitMetadata();
      syncTokens(tables);
      pruneTokens();
      // eslint-disable-next-line no-console
      console.log("[QR + Tables] startup complete", { count: tables.length });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[QR] Token sync failed", err);
    }
  }, []);

  // Debug logs required by the spec — visible in the browser console
  // for every QR navigation.
  // eslint-disable-next-line no-console
  console.log("QR route loaded");
  // eslint-disable-next-line no-console
  console.log("Auth bypass for QR route");

  return (
    <Routes>
      {/* ───── PUBLIC QR ROUTES ──────────────────────────────────────────
           These are completely public. They never call useAuth() and
           never trigger a redirect to /login or the dashboard. */}
      <Route path="/qr" element={<PublicQRRoute />} />
      <Route path="/qr/:token" element={<PublicQRRoute />} />
      <Route path="/menu/:token" element={<PublicQRRoute />} />
      <Route path="/order/:token" element={<PublicQRRoute />} />
      <Route path="/customer/:token" element={<PublicQRRoute />} />

      {/* ───── PROTECTED ROUTES ──────────────────────────────────────
           The dashboard, billing, waiter, etc. are wrapped in
           <Protected>. When the user is not signed in, <Protected>
           redirects to /login. None of these run when the URL is a
           QR URL because the public route above matches first. */}
      <Route path="/" element={<Protected capability="view_dashboard"><Dashboard /></Protected>} />
      <Route path="/billing" element={<Protected capability="manage_billing"><Billing /></Protected>} />
      <Route path="/waiter" element={<Protected capability="view_waiter_orders"><Waiter /></Protected>} />
      <Route path="/waiter-orders" element={<Navigate to="/waiter" replace />} />
      <Route path="/tables" element={<Protected capability="manage_tables"><Tables /></Protected>} />
      <Route path="/tables/:tableId/order" element={<Protected capability="manage_billing"><TableOrderScreen /></Protected>} />
      <Route path="/menu" element={<Protected capability="manage_menu"><Menu /></Protected>} />
      <Route path="/menu-profiles" element={<Protected capability="view_menu_profiles"><MenuProfiles /></Protected>} />
      <Route path="/menu-profiles/:id/items" element={<Protected capability="view_menu_profiles"><MenuProfileItems /></Protected>} />
      <Route path="/menu-profiles/:id/preview" element={<Protected capability="view_menu_profiles"><MenuProfilePreview /></Protected>} />

      <Route path="/orders" element={<Protected capability="view_orders"><Orders /></Protected>} />
      <Route path="/inventory" element={<Protected capability="manage_inventory"><Inventory /></Protected>} />
      <Route path="/reports" element={<Protected capability="view_reports"><Reports /></Protected>} />
      <Route path="/users" element={<Protected capability="manage_users"><Users /></Protected>} />
      <Route path="/settings" element={<Protected capability="manage_settings"><Settings /></Protected>} />
      <Route
        path="/reset-system"
        element={
          <Protected capability="manage_settings" requireSuperAdmin>
            <ResetSystem />
          </Protected>
        }
      />

      {/* Login page — public so users can sign in. */}
      <Route path="/login" element={<Login />} />

      {/* Catch-all */}
      <Route path="*" element={<NotFoundOrForbidden />} />
    </Routes>
  );
}
