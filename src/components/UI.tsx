import { ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../utils/cn";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("panel p-5", className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "gold",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "gold" | "green" | "red" | "blue" | "purple";
}) {
  const toneMap: Record<string, string> = {
    gold: "from-gold-400/30 to-gold-700/10 text-gold-700 dark:text-gold-300",
    green: "from-emerald-400/30 to-emerald-700/10 text-emerald-700 dark:text-emerald-300",
    red: "from-rose-400/30 to-rose-700/10 text-rose-700 dark:text-rose-300",
    blue: "from-sky-400/30 to-sky-700/10 text-sky-700 dark:text-sky-300",
    purple: "from-violet-400/30 to-violet-700/10 text-violet-700 dark:text-violet-300",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="stat-tile"
    >
      <div className="flex items-start justify-between gap-2 relative z-10">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            {label}
          </p>
          <p className="mt-1 text-2xl md:text-3xl font-bold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
        </div>
        {icon && (
          <div
            className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br",
              toneMap[tone]
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className,
  size = "md",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "outline" | "secondary";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  title?: string;
}) {
  const variants: Record<string, string> = {
    primary:
      "btn-gold shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-gold-500/50",
    ghost:
      "bg-transparent text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/60",
    secondary:
      "bg-neutral-900 text-white dark:bg-gold-500 dark:text-black hover:bg-neutral-800 dark:hover:bg-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-500/50",
    danger:
      "bg-rose-600 text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-400/40",
    outline:
      "border border-gold-400/40 text-gold-700 dark:text-gold-300 hover:bg-gold-50 dark:hover:bg-gold-500/10",
  };
  const sizes: Record<string, string> = {
    sm: "text-xs px-3 py-1.5 rounded-md",
    md: "text-sm px-4 py-2 rounded-lg",
    lg: "text-base px-5 py-2.5 rounded-xl",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  className,
  prefix,
  suffix,
}: {
  label?: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="block mb-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {label}
        </span>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-neutral-500 dark:text-neutral-400 text-sm">{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500",
            prefix && "pl-8",
            suffix && "pr-8"
          )}
        />
        {suffix && (
          <span className="absolute right-3 text-neutral-500 dark:text-neutral-400 text-sm">{suffix}</span>
        )}
      </div>
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="block mb-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sizeClass: Record<string, string> = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 30, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", duration: 0.3 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "w-full bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-gold-400/20 max-h-[92vh] overflow-hidden flex flex-col",
              sizeClass[size]
            )}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-gradient-to-r from-gold-50/60 to-transparent dark:from-gold-500/10">
              <h3 className="font-semibold text-lg">{title}</h3>
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 overflow-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "gold";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
    danger: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
    info: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
    gold: "bg-gold-100 text-gold-800 dark:bg-gold-500/20 dark:text-gold-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function Empty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-500">
      <div className="h-14 w-14 rounded-full bg-gold-50 dark:bg-gold-500/10 flex items-center justify-center mb-3">
        <svg viewBox="0 0 24 24" className="h-7 w-7 text-gold-500" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 12h6M12 9v6" strokeLinecap="round" />
        </svg>
      </div>
      <p className="font-medium text-neutral-700 dark:text-neutral-300">{message}</p>
      {hint && <p className="text-xs mt-1">{hint}</p>}
    </div>
  );
}

export function Toast({ message, type = "info" }: { message: string; type?: "success" | "error" | "info" }) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -20, opacity: 0 }}
      className={cn(
        "fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-xl text-white text-sm font-medium",
        type === "success" && "bg-emerald-600",
        type === "error" && "bg-rose-600",
        type === "info" && "bg-neutral-900"
      )}
    >
      {message}
    </motion.div>
  );
}
