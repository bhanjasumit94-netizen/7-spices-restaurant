// Business-day helpers. A "business day" is the trading period between
// `openTime` on one calendar date and `closeTime` on the next (e.g.
// 11:00 → 02:00). All Dashboard/Reports "today" counters key off this
// window instead of the raw calendar date, so the daily numbers reset
// automatically when the day auto-closes.

import { useEffect, useState } from "react";
import { RestaurantSettings } from "./types";

export const DEFAULT_OPEN_TIME = "11:00";
export const DEFAULT_CLOSE_TIME = "02:00";

function parseHM(s: string | undefined, fallback: string): { h: number; m: number } {
  const raw = (s && /^\d{1,2}:\d{2}$/.test(s) ? s : fallback).split(":");
  const h = Math.max(0, Math.min(23, parseInt(raw[0], 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(raw[1], 10) || 0));
  return { h, m };
}

export function getBusinessHours(settings: RestaurantSettings | null | undefined) {
  const open = parseHM(settings?.businessOpenTime, DEFAULT_OPEN_TIME);
  const close = parseHM(settings?.businessCloseTime, DEFAULT_CLOSE_TIME);
  return { open, close };
}

// Timestamp for the start of the business day that contains `at`.
// Rule: if the current time-of-day is before openTime, the active
// business day started on the previous calendar date at openTime.
export function getBusinessDayStart(
  at: number,
  settings: RestaurantSettings | null | undefined
): number {
  const { open, close } = getBusinessHours(settings);
  const d = new Date(at);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  const openToday = midnight + (open.h * 60 + open.m) * 60_000;
  const closeToday = midnight + (close.h * 60 + close.m) * 60_000;
  const closeCrosses = close.h * 60 + close.m <= open.h * 60 + open.m;

  let start: number;
  if (!closeCrosses) {
    if (at >= openToday && at < closeToday) start = openToday;
    else if (at >= closeToday) start = closeToday;   // idle after close
    else start = closeToday - DAY;                    // before open → idle since yesterday's close
  } else {
    if (at >= openToday) start = openToday;           // inside period (evening)
    else if (at < closeToday) start = openToday - DAY;// inside period (early AM before close)
    else start = closeToday;                          // idle window between close and next open
  }

  // Manual "Close Business Day Now" floor overrides the natural start.
  try {
    const manual = Number(localStorage.getItem("spices_manual_day_close") || 0);
    if (manual > start && manual <= at) start = manual;
  } catch {
    /* ignore */
  }
  return start;
}

// Timestamp for the next auto-close event on/after `at`.
export function getNextCloseAt(
  at: number,
  settings: RestaurantSettings | null | undefined
): number {
  const { close } = getBusinessHours(settings);
  const d = new Date(at);
  const closeToday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), close.h, close.m, 0, 0);
  if (at < closeToday.getTime()) return closeToday.getTime();
  return closeToday.getTime() + 24 * 60 * 60 * 1000;
}

// Human label like "01 Jul – 02 Jul (11:00 → 02:00)"
export function formatBusinessDayRange(
  at: number,
  settings: RestaurantSettings | null | undefined
): string {
  const start = getBusinessDayStart(at, settings);
  const { open, close } = getBusinessHours(settings);
  const startD = new Date(start);
  const endD = new Date(start + 24 * 60 * 60 * 1000);
  const fmt = (x: Date) => x.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  const hm = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return `${fmt(startD)} ${hm(open.h, open.m)} → ${fmt(endD)} ${hm(close.h, close.m)}`;
}

// React hook: returns the current business-day start timestamp and updates
// automatically when the close boundary is crossed (checked every 20s).
// Also listens to the global store update event so a manual/auto day-close
// dispatch immediately refreshes all consumers.
export function useBusinessDayStart(
  settings: RestaurantSettings | null | undefined
): number {
  const [start, setStart] = useState<number>(() =>
    getBusinessDayStart(Date.now(), settings)
  );
  useEffect(() => {
    const tick = () => {
      const next = getBusinessDayStart(Date.now(), settings);
      setStart((prev) => (prev === next ? prev : next));
    };
    tick();
    const id = window.setInterval(tick, 20_000);
    window.addEventListener("spices:update", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("spices:update", tick);
    };
  }, [settings?.businessOpenTime, settings?.businessCloseTime]);
  return start;
}
