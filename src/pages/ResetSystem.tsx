import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toaster";
import { Store } from "../lib/store";
import { isSuperAdmin } from "../lib/permissions";
import { Button, Card, Input, Modal, Badge } from "../components/UI";
import { AlertTriangle, RotateCcw, ShieldOff, Trash2, Check } from "lucide-react";

type ResetType = "business" | "factory" | null;

const ACCESS_DENIED = "Access Denied. Only Super Admin can reset system data.";

export default function ResetSystem() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const myRole = user?.role;

  const [openType, setOpenType] = useState<ResetType>(null);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isSuperAdmin(myRole)) {
    // Friendly Access-Denied screen for non-Super-Admin users. This is the
    // single source of truth — no other page lets non-Super-Admin trigger
    // resets.
    // eslint-disable-next-line no-console
    console.warn(
      "[ResetSystem] Access denied: user role =",
      myRole,
      "; only super_admin can use reset functions."
    );
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="max-w-md w-full text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center mb-4">
            <ShieldOff className="h-8 w-8 text-rose-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-sm text-neutral-500 mb-1">{ACCESS_DENIED}</p>
          <p className="text-xs text-neutral-500 mb-4">
            Your role:{" "}
            <span className="font-semibold capitalize">
              {myRole ? myRole.replace("_", " ") : "guest"}
            </span>
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>
              Go Home
            </Button>
            <Button onClick={() => navigate("/login")}>Sign In</Button>
          </div>
        </Card>
      </div>
    );
  }

  const performReset = async () => {
    if (!user) return;
    if (confirmText !== "RESET") {
      toast.push('Type "RESET" exactly to confirm', "error");
      return;
    }
    if (!password.trim()) {
      toast.push("Enter your Super Admin password to confirm", "error");
      return;
    }
    // Verify the entered password against the (hashed) stored value.
    const { verifyPassword } = await import("../lib/crypto");
    const allUsers = Store.listUsers();
    const me = allUsers.find((u) => u.id === user.id);
    const ok = me ? await verifyPassword(password, me.password) : false;
    if (!ok) {
      toast.push("Password is incorrect", "error");
      return;
    }


    setSubmitting(true);
    try {
      const now = new Date();
      const device = navigator.userAgent.split(") ")[0] || "Unknown device";
      const summary =
        openType === "business"
          ? "Business Reset"
          : "Factory Reset";

      // 1. Save the audit log FIRST (so the action is recorded even
      //    if the reset wipes the audit log itself).
      Store.addAudit({
        userId: user.id,
        userName: user.name,
        action: openType === "business" ? "BUSINESS_RESET" : "FACTORY_RESET",
        details: `Super Admin ${user.name} performed ${summary} on ${now
          .toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })} at ${now.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })}. Device: ${device}`,
      });

      // 2. Perform the actual reset.
      if (openType === "business") {
        Store.resetBusinessData();
        toast.push("Business data reset complete", "success");
        // Close modal, redirect to dashboard.
        setOpenType(null);
        setConfirmText("");
        setPassword("");
        // Notify any open tabs / live listeners.
        setTimeout(() => {
          // Force a reload so every screen starts from clean state.
          window.location.assign("/#/");
        }, 600);
      } else {
        // Factory reset — logs the user out, redirects to /login.
        Store.factoryReset();
        toast.push("Factory reset complete", "success");
        setOpenType(null);
        setConfirmText("");
        setPassword("");
        // Force a hard reload so every screen re-mounts from scratch.
        setTimeout(() => {
          window.location.assign("/#/login");
        }, 600);
      }
    } catch (err) {
      console.error(err);
      toast.push(
        "Reset failed: " + (err instanceof Error ? err.message : "Unknown error"),
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Red warning banner — visible to Super Admin only because the page
          already redirects non-Super-Admin users to the Access Denied screen. */}
      <div className="rounded-lg border-2 border-rose-500/50 bg-rose-50 dark:bg-rose-500/10 p-4 flex items-start gap-3">
        <AlertTriangle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-rose-700 dark:text-rose-300">
            ⚠️ Reset operations are restricted to Super Admin only and cannot
            be undone.
          </p>
          <p className="text-sm text-rose-600/90 dark:text-rose-300/80 mt-1">
            Business Reset wipes every transaction but preserves the restaurant
            configuration. Factory Reset wipes everything and logs you out —
            the system rebuilds itself with the default Super Admin account.
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <RotateCcw className="h-6 w-6 text-gold-500" /> Reset System
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Logged in as <span className="font-semibold">{user?.name}</span> ·
          <span className="ml-1 text-gold-600 dark:text-gold-300 capitalize">
            {myRole?.replace("_", " ")}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BUSINESS RESET */}
        <Card className="border-amber-300 dark:border-amber-500/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600">
              <RotateCcw className="h-5 w-5" />
            </span>
            <h3 className="font-bold text-lg">🟡 Reset Business Data</h3>
          </div>
          <p className="text-sm text-neutral-500 mb-3">
            Clears every transaction made today. The restaurant configuration
            is preserved.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs mb-4">
            <div>
              <p className="font-semibold text-rose-600 mb-1">DELETES:</p>
              <ul className="space-y-0.5 text-neutral-600 dark:text-neutral-300">
                <li>• Orders</li>
                <li>• Table status</li>
                <li>• Inventory transactions</li>
                <li>• Payments</li>
                <li>• Expenses</li>
                <li>• Reports</li>
                <li>• Notifications</li>
                <li>• Audit logs</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-emerald-600 mb-1">KEEPS:</p>
              <ul className="space-y-0.5 text-neutral-600 dark:text-neutral-300">
                <li>• Super Admin account</li>
                <li>• Users</li>
                <li>• Login session</li>
                <li>• Menu</li>
                <li>• Tables configuration</li>
                <li>• QR codes</li>
                <li>• Settings / Logo</li>
                <li>• Restaurant info</li>
              </ul>
            </div>
          </div>
          <div className="text-xs text-neutral-500 mb-3">
            After this reset you stay logged in and are redirected to the
            dashboard.
          </div>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              setOpenType("business");
              setConfirmText("");
              setPassword("");
            }}
          >
            <RotateCcw className="h-4 w-4" /> Reset Business Data
          </Button>
        </Card>

        {/* FACTORY RESET */}
        <Card className="border-rose-500/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-9 w-9 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center text-rose-600">
              <Trash2 className="h-5 w-5" />
            </span>
            <h3 className="font-bold text-lg">🔴 Factory Reset</h3>
          </div>
          <p className="text-sm text-neutral-500 mb-3">
            Wipes everything and rebuilds the system with default
            configuration. You will be logged out.
          </p>
          <div className="text-xs mb-4">
            <p className="font-semibold text-rose-600 mb-1">DELETES EVERYTHING, then rebuilds:</p>
            <ul className="space-y-0.5 text-neutral-600 dark:text-neutral-300">
              <li>• Default Super Admin account (rebuilt)</li>
              <li>• Default application settings (rebuilt)</li>
              <li>• Default routes and configuration (rebuilt)</li>
              <li>• All orders, payments, tables, menu, inventory…</li>
            </ul>
          </div>
          <div className="text-xs text-neutral-500 mb-3">
            After this reset you are logged out and redirected to the login
            screen.
          </div>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              setOpenType("factory");
              setConfirmText("");
              setPassword("");
            }}
          >
            <Trash2 className="h-4 w-4" /> Factory Reset
          </Button>
        </Card>
      </div>

      {/* Confirmation modal — requires typing "RESET" + Super Admin password. */}
      <Modal
        open={openType !== null}
        onClose={() => {
          if (!submitting) {
            setOpenType(null);
            setConfirmText("");
            setPassword("");
          }
        }}
        title={openType === "business" ? "🟡 Confirm Business Reset" : "🔴 Confirm Factory Reset"}
        size="md"
      >
        {openType && (
          <div className="space-y-3">
            <div className="rounded-lg border-2 border-rose-500/50 bg-rose-50 dark:bg-rose-500/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-700 dark:text-rose-300 text-sm">
                  ⚠️ This action cannot be undone.
                </p>
                <p className="text-xs text-rose-600/90 dark:text-rose-300/80 mt-1">
                  {openType === "business"
                    ? "All orders, payments, expenses, audit logs and notifications will be erased. Every table returns to Available. You stay logged in and are redirected to the dashboard."
                    : "Everything in local storage is wiped. The default Super Admin account and restaurant configuration are re-seeded automatically. You will be logged out."}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Type <code className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-mono">RESET</code> to confirm:
              </p>
              <Input
                value={confirmText}
                onChange={setConfirmText}
                placeholder="Type RESET in capital letters"
              />
              {confirmText && confirmText !== "RESET" && (
                <p className="text-[10px] text-rose-500 mt-1">
                  Must be exactly "RESET" (case sensitive)
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Enter your Super Admin password to authorize this action:
              </p>
              <Input
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="Super Admin password"
              />
            </div>

            <div className="text-[11px] text-neutral-500 bg-neutral-50 dark:bg-neutral-900/40 rounded p-2 border border-neutral-200 dark:border-neutral-800">
              <Badge tone="warning">Audit</Badge>{" "}
              An audit log entry will be created:
              <span className="block mt-1 italic">
                "Super Admin {user?.name} performed{" "}
                {openType === "business" ? "Business" : "Factory"} Reset on{" "}
                {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })} at{" "}
                {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}."
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setOpenType(null);
                  setConfirmText("");
                  setPassword("");
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={performReset}
                disabled={submitting || confirmText !== "RESET" || !password}
              >
                {submitting ? (
                  "Working…"
                ) : (
                  <>
                    <Check className="h-4 w-4" /> Confirm {openType === "business" ? "Business" : "Factory"} Reset
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
