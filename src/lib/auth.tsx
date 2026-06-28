import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { User } from "./types";
import { Store } from "./store";
import { verifyPassword, hashPassword, isHashed, stripPassword, SafeUser } from "./crypto";

type SessionUser = SafeUser<User>;

interface AuthContextType {
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string; user?: SessionUser }>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize synchronously from localStorage so we don't have a loading flash.
  const [user, setUser] = useState<SessionUser | null>(() => {
    try {
      return Store.getSession();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Auth] Failed to read session", err);
      return null;
    }
  });
  const lastSessionRef = useRef<string | null>(
    (() => {
      try {
        return localStorage.getItem("spices_session");
      } catch {
        return null;
      }
    })()
  );

  useEffect(() => {
    const refresh = () => {
      try {
        const raw = localStorage.getItem("spices_session");
        if (raw === lastSessionRef.current) return; // avoid pointless re-renders
        lastSessionRef.current = raw;
        const u = Store.getSession();
        setUser(u);
        // eslint-disable-next-line no-console
        console.log("[Auth] session refreshed", { user: u?.email ?? null, role: u?.role ?? null });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[Auth] refresh failed", err);
      }
    };
    window.addEventListener("spices:update", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("spices:update", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const u = Store.findUserByEmail(email.trim());
    if (!u) return { ok: false as const, error: "User not found" };
    if (!u.active) return { ok: false as const, error: "Account is disabled" };
    const ok = await verifyPassword(password, u.password);
    if (!ok) return { ok: false as const, error: "Incorrect password" };
    // Opportunistically upgrade legacy plaintext records to a hashed value.
    if (!isHashed(u.password)) {
      try {
        const newHash = await hashPassword(password);
        Store.updateUser(u.id, { password: newHash });
      } catch (e) {
        console.warn("[Auth] password upgrade failed", e);
      }
    }
    const safe = stripPassword(u);
    Store.setSession(safe);
    lastSessionRef.current = localStorage.getItem("spices_session");
    setUser(safe);
    Store.addAudit({ userId: u.id, userName: u.name, action: "LOGIN", details: `${u.email} signed in` });
    // eslint-disable-next-line no-console
    console.log("[Auth] login", { email: u.email, role: u.role });
    return { ok: true as const, user: safe };
  };

  const logout = () => {
    if (user) {
      Store.addAudit({ userId: user.id, userName: user.name, action: "LOGOUT", details: `${user.email} signed out` });
    }
    Store.clearSession();
    lastSessionRef.current = null;
    setUser(null);
    // eslint-disable-next-line no-console
    console.log("[Auth] logout");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading: false }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
