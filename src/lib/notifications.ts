import { useEffect, useState, useMemo } from "react";
import { Store } from "./store";
import { Notification } from "./types";

// Real-time notification subscription that picks up new items instantly.
export function useNotifications(): Notification[] {
  const [items, setItems] = useState<Notification[]>(() => Store.listNotifications());
  useEffect(() => {
    const refresh = () => setItems(Store.listNotifications());
    window.addEventListener("spices:update", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("spices:update", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return items;
}

// Compute counts per notification type (used for badges in the bell icon).
export function useNotificationCounts() {
  const items = useNotifications();
  return useMemo(() => {
    const unread = items.filter((n) => !n.read);
    return {
      total: unread.length,
      saved: unread.filter((n) => n.type === "saved_order").length,
      pendingPrint: unread.filter((n) => n.type === "pending_print").length,
      sentToKitchen: unread.filter((n) => n.type === "sent_to_kitchen").length,
      newOrder: unread.filter((n) => n.type === "new_order").length,
      lowStock: unread.filter((n) => n.type === "low_stock").length,
    };
  }, [items]);
}
