import { useNavigate } from "react-router-dom";
import { Bell, Save, Printer, ChefHat, Package, Info, Check, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Notification } from "../lib/types";
import { Store } from "../lib/store";
import { cn } from "../utils/cn";

const TYPE_META: Record<
  Notification["type"],
  { icon: typeof Save; label: string; tone: string }
> = {
  saved_order: {
    icon: Save,
    label: "Saved Order",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  },
  pending_print: {
    icon: Printer,
    label: "Pending Print",
    tone: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  },
  sent_to_kitchen: {
    icon: ChefHat,
    label: "Sent to Kitchen",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  new_order: {
    icon: Bell,
    label: "New Order",
    tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  },
  low_stock: {
    icon: Package,
    label: "Low Stock",
    tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  },
  info: {
    icon: Info,
    label: "Info",
    tone: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
};

export function NotificationCenter({
  notifications,
  onClose,
  onSelect,
}: {
  notifications: Notification[];
  onClose: () => void;
  onSelect: (n: Notification) => void;
}) {
  const navigate = useNavigate();

  const grouped = {
    unread: notifications.filter((n) => !n.read),
    read: notifications.filter((n) => n.read).slice(0, 20),
  };

  const markAllRead = () => {
    Store.markNotificationsRead();
  };

  const handleClick = (n: Notification) => {
    onSelect(n);
    if (n.orderId) {
      navigate("/orders?focus=" + n.orderId);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-1rem)] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl overflow-hidden z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-gradient-to-r from-gold-50/40 to-transparent dark:from-gold-500/10">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-gold-600" />
            <h3 className="font-semibold text-sm">Notifications</h3>
            {grouped.unread.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500 text-white font-bold">
                {grouped.unread.length} new
              </span>
            )}
          </div>
          {grouped.unread.length > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-gold-600 hover:text-gold-700 font-medium flex items-center gap-1"
            >
              <Check className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[28rem] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No notifications yet
            </div>
          ) : (
            <>
              {grouped.unread.length > 0 && (
                <>
                  <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider font-bold text-rose-500 bg-rose-50/50 dark:bg-rose-500/5">
                    New
                  </div>
                  {grouped.unread.map((n) => (
                    <NotificationItem key={n.id} n={n} onClick={handleClick} />
                  ))}
                </>
              )}
              {grouped.read.length > 0 && (
                <>
                  <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider font-bold text-neutral-400 bg-neutral-50/50 dark:bg-neutral-800/30">
                    Earlier
                  </div>
                  {grouped.read.map((n) => (
                    <NotificationItem key={n.id} n={n} onClick={handleClick} />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-2 border-t border-neutral-200 dark:border-neutral-800 text-center">
          <button
            onClick={() => {
              navigate("/orders");
              onClose();
            }}
            className="text-xs text-gold-600 hover:text-gold-700 font-medium"
          >
            View all orders →
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function NotificationItem({
  n,
  onClick,
}: {
  n: Notification;
  onClick: (n: Notification) => void;
}) {
  const meta = TYPE_META[n.type];
  const Icon = meta.icon;
  return (
    <button
      onClick={() => onClick(n)}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition flex items-start gap-3 group",
        !n.read && "bg-rose-50/30 dark:bg-rose-500/5"
      )}
    >
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", meta.tone)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{n.message}</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          {meta.label} • {new Date(n.timestamp).toLocaleTimeString()}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-neutral-300 group-hover:text-gold-500 mt-1.5 shrink-0" />
    </button>
  );
}
