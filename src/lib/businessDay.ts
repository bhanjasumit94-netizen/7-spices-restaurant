// Business-day helpers. A "business day" is the trading period between
// `openTime` on one calendar date and `closeTime` on the next (e.g.
// 11:00 → 02:00). All Dashboard/Reports "today" counters key off this
// window instead of the raw calendar date, so the daily numbers reset
// automatically when the day auto-closes.

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
  const { open } = getBusinessHours(settings);
  const d = new Date(at);
  const startToday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), open.h, open.m, 0, 0);
  if (at >= startToday.getTime()) return startToday.getTime();
  // Roll back one day
  const yesterday = new Date(startToday.getTime() - 24 * 60 * 60 * 1000);
  return yesterday.getTime();
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
