import { useState } from "react";
import { useNavigate, Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Logo } from "../components/Logo";
import { useTheme } from "../lib/theme";
import { Button } from "../components/UI";
import { Moon, Sun } from "lucide-react";
import { getDefaultRoute, isPathAllowedForRole } from "../lib/permissions";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already signed in, route to the correct page for the role.
  if (user) {
    // Honour the original target if it is allowed for this role.
    const intended = (location.state as { from?: string } | null)?.from;
    const allowed =
      intended &&
      intended !== "/login" &&
      intended !== location.pathname &&
      isPathAllowedForRole(user.role, intended);
    const dest = allowed ? intended! : getDefaultRoute(user.role);
    return <Navigate to={dest} replace />;
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setTimeout(async () => {
      try {
        const r = await login(email, password);
        if (r.ok && r.user) {
          const intended = (location.state as { from?: string } | null)?.from;
          const allowed =
            intended &&
            intended !== "/login" &&
            intended !== location.pathname &&
            isPathAllowedForRole(r.user.role, intended);
          const dest = allowed ? intended! : getDefaultRoute(r.user.role);
          // eslint-disable-next-line no-console
          console.log("[Login] success →", { email, role: r.user.role, dest });
          navigate(dest);
        } else {
          setError(r.error || "Login failed");
        }
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  return (
    <div className="min-h-screen bg-premium relative overflow-hidden flex items-center justify-center p-4">
      {/* Decorative orbs */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-gold-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-gold-700/20 blur-3xl" />

      <button
        onClick={toggle}
        className="absolute top-4 right-4 p-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="card-glass rounded-3xl p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-6">
            <Logo size="lg" />
            <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
              Sign in to access your POS & ERP
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500"
                  placeholder="you@spices.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type={show ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShow((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" size="lg" className="w-full">
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </div>
        <p className="text-center text-xs text-neutral-500 mt-4">
          © {new Date().getFullYear()} 7 Spices Restaurant · Ujjainee, Indrakanan, Burdwan-713103
        </p>
      </motion.div>
    </div>
  );
}
