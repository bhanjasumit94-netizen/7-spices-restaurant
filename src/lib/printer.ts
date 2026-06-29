// Professional thermal / A4 receipt printing for bills and KOTs.
// Renders against a hidden iframe so the user can pick their printer
// from the system print dialog. Supports 58mm, 80mm thermal and A4.

import { Order, OrderItem, RestaurantSettings, KotSize, PrinterPaper } from "./types";

type PrintType = "bill" | "kot" | "reprint";

// ─── Print scale / font scale (persisted in localStorage) ─────────
export type PrintScale = "small" | "medium" | "large";
const PRINT_SCALE_KEY = "printScale";
const PRINT_FONT_SCALE_KEY = "printFontScale"; // legacy combined value
const BILL_FONT_SCALE_KEY = "customerBillFontScale";
const LEGACY_BILL_FONT_SCALE_KEY = "billFontScale";
const KOT_FONT_SCALE_KEY = "kotFontScale";
const PRINT_PREVIEW_BILL_KEY = "printPreviewBill";
const PRINT_PREVIEW_KOT_KEY = "printPreviewKot";
const FONT_MIN = 0;
const FONT_MAX = 1.5;
const FONT_STEP = 0.05;
const FONT_RENDER_MIN = 0.1;

function clampFont(n: number) {
  return Math.min(FONT_MAX, Math.max(FONT_MIN, +n.toFixed(2)));
}
export function effectiveFontScale(n: number) {
  return Math.max(FONT_RENDER_MIN, clampFont(n));
}

export function getPrintScale(): PrintScale {
  try {
    const v = localStorage.getItem(PRINT_SCALE_KEY);
    if (v === "small" || v === "large" || v === "medium") return v;
  } catch { /* ignore */ }
  return "medium";
}
export function setPrintScale(v: PrintScale) {
  try { localStorage.setItem(PRINT_SCALE_KEY, v); } catch { /* ignore */ }
}
export function printScaleValue(s: PrintScale): number {
  return s === "small" ? 0.9 : s === "large" ? 1.1 : 1;
}

// Legacy combined font scale (kept for backward compat / migration source).
export function getPrintFontScale(): number {
  try {
    const raw = localStorage.getItem(PRINT_FONT_SCALE_KEY);
    if (raw) {
      const n = parseFloat(raw);
      if (!isNaN(n)) return clampFont(n);
    }
  } catch { /* ignore */ }
  return 1;
}
export function setPrintFontScale(v: number) {
  try { localStorage.setItem(PRINT_FONT_SCALE_KEY, String(clampFont(v))); } catch { /* ignore */ }
}

function readFontKey(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const n = parseFloat(raw);
      if (!isNaN(n)) return clampFont(n);
    }
  } catch { /* ignore */ }
  // Migration: fall back to legacy combined scale once.
  return getPrintFontScale();
}
function writeFontKey(key: string, v: number) {
  try { localStorage.setItem(key, String(clampFont(v))); } catch { /* ignore */ }
}

export function getBillFontScale(): number {
  try {
    const raw = localStorage.getItem(BILL_FONT_SCALE_KEY) ?? localStorage.getItem(LEGACY_BILL_FONT_SCALE_KEY);
    if (raw) {
      const n = parseFloat(raw);
      if (!isNaN(n)) return clampFont(n);
    }
  } catch { /* ignore */ }
  return getPrintFontScale();
}
export function setBillFontScale(v: number) { writeFontKey(BILL_FONT_SCALE_KEY, v); }
export function getKotFontScale(): number { return readFontKey(KOT_FONT_SCALE_KEY); }
export function setKotFontScale(v: number) { writeFontKey(KOT_FONT_SCALE_KEY, v); }

function readBool(key: string, dflt: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return dflt;
    return raw === "true" || raw === "1";
  } catch { return dflt; }
}
function writeBool(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? "true" : "false"); } catch { /* ignore */ }
}

export function getPrintPreviewBill(): boolean { return readBool(PRINT_PREVIEW_BILL_KEY, true); }
export function setPrintPreviewBill(v: boolean) { writeBool(PRINT_PREVIEW_BILL_KEY, v); }
export function getPrintPreviewKot(): boolean { return readBool(PRINT_PREVIEW_KOT_KEY, true); }
export function setPrintPreviewKot(v: boolean) { writeBool(PRINT_PREVIEW_KOT_KEY, v); }

export const FONT_SCALE_BOUNDS = { min: FONT_MIN, max: FONT_MAX, step: FONT_STEP };

function fmt(n: number) {
  return n.toFixed(2);
}

function fmtTimeOnly(ts: number) {
  const d = new Date(ts);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Paper geometry ───────────────────────────────────────────────
function paperDims(size: PrinterPaper) {
  if (size === "58mm") return { paper: "58mm", inner: "54mm", page: "58mm auto" };
  if (size === "a4") return { paper: "190mm", inner: "190mm", page: "A4" };
  return { paper: "80mm", inner: "76mm", page: "80mm auto" };
}

// KOT font scale by selected kotSize.
function kotScale(size: KotSize | undefined) {
  if (size === "xlarge") {
    return { name: 28, header: 24, label: 20, table: 30, item: 28, qty: 36, spacing: 18 };
  }
  if (size === "large") {
    return { name: 24, header: 22, label: 18, table: 26, item: 24, qty: 30, spacing: 12 };
  }
  return { name: 22, header: 20, label: 18, table: 24, item: 22, qty: 28, spacing: 8 };
}

// ─── BILL ─────────────────────────────────────────────────────────
function renderBillBody(
  order: Order,
  settings: RestaurantSettings,
  copyLabel: string,
  type: PrintType,
) {
  const showLogo = settings.printLogo !== false && !!settings.logoDataUrl;
  const showGst = settings.printGstNumber !== false && !!settings.gstin;
  const paid = order.amountPaid ?? 0;
  const balance = Math.max(0, order.grandTotal - paid);
  const lastMode = (order.lastPaymentMode || "").toUpperCase().replace("_", " ");

  // Watermark: 7 Spices logo centered, opacity 0.05
  const wmType = settings.watermarkType ?? (settings.logoDataUrl ? "logo" : "text");
  let watermark = "";
  if (wmType === "logo" && settings.logoDataUrl) {
    watermark = `<div class="bill-watermark watermark-logo"><img src="${escapeHtml(settings.logoDataUrl)}" alt=""/></div>`;
  } else if (wmType === "text") {
    watermark = `<div class="bill-watermark watermark-text">${escapeHtml(settings.name || "7 Spices Restaurant")}</div>`;
  }

  const d = new Date(order.createdAt);
  const pad = (x: number) => String(x).padStart(2, "0");
  const dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const tableStr = order.tableNumber
    ? `Dine In: T${order.tableNumber}`
    : (order.orderType || "").replace("_", " ").toUpperCase();

  // Computed totals
  const svcPct = settings.serviceChargePercent || 0;
  const gstAmt = (order.cgst || 0) + (order.sgst || 0);
  const svcAmt = svcPct > 0 ? +((order.subtotal - order.discount) * svcPct / 100).toFixed(2) : 0;
  const taxedTotal = order.subtotal - order.discount + gstAmt + svcAmt;
  const roundOff = +(order.grandTotal - taxedTotal).toFixed(2);
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);

  // Header — centered logo + name + address + phone + GSTIN
  const header = `
    <div class="bill-header">
      ${showLogo ? `<div class="logo-wrap"><img src="${escapeHtml(settings.logoDataUrl!)}" alt="logo"/></div>` : ""}
      <div class="brand-name">${escapeHtml(settings.name)}</div>
      <div class="brand-addr">${escapeHtml(settings.address)}</div>
      <div class="brand-phone">M: ${escapeHtml(settings.phone)}</div>
      ${showGst ? `<div class="brand-gst">GSTIN- ${escapeHtml(settings.gstin!)}</div>` : ""}
    </div>`;

  const nameRow = `
    <div class="name-row">Name: ${escapeHtml(order.customerName || "")}</div>
  `;

  const infoBlock = `
    <div class="info-grid">
      <div class="info-left">
        <div>Date: ${dateStr}</div>
        <div>${timeStr}</div>
        ${order.waiterName ? `<div>Cashier: ${escapeHtml(order.waiterName)}</div>` : ""}
      </div>
      <div class="info-right">
        <div class="bold">${escapeHtml(tableStr)}</div>
        <div>Bill No.: ${escapeHtml(order.billNumber)}</div>
        ${lastMode ? `<div>Pay: ${escapeHtml(lastMode)}</div>` : ""}
      </div>
    </div>`;

  const tagline = settings.tagline ?? "Flavours without Borders, Love without Limits.";

  return `
    <div class="page bill">
      ${watermark}
      <div class="receipt-content">
        ${header}
        <div class="dline"></div>
        ${nameRow}
        <div class="dline"></div>
        ${infoBlock}
        ${copyLabel ? `<div class="center copy-tag">${escapeHtml(copyLabel)}</div>` : ""}
        <div class="dline"></div>

        <table class="items">
          <thead>
            <tr>
              <th class="left">No.Item</th>
              <th class="center">Qty.</th>
              <th class="right">Price</th>
              <th class="right">Amount</th>
            </tr>
          </thead>
          <tbody>
          ${order.items.map((i, idx) => `
            <tr>
              <td class="left item-name">${idx + 1} ${escapeHtml(i.name)}</td>
              <td class="center">${i.quantity}</td>
              <td class="right">${fmt(i.price)}</td>
              <td class="right">${fmt(i.price * i.quantity)}</td>
            </tr>
            ${i.notes ? `<tr><td colspan="4" class="item-notes">↳ ${escapeHtml(i.notes)}</td></tr>` : ""}
          `).join("")}
          </tbody>
        </table>

        <div class="dline"></div>

        <div class="sub-row">
          <span>Total Qty: ${totalQty}</span>
          <span class="sub-total"><span class="sub-label">Sub<br/>Total</span><b>${fmt(order.subtotal)}</b></span>
        </div>

        ${order.discount > 0 ? `<div class="kv tot"><span>Discount</span><b>${fmt(order.discount)}</b></div>` : ""}
        ${settings.gstEnabled && order.gstPercent > 0 ? `
          <div class="kv tot"><span>${fmt(order.subtotal - order.discount)}@ CGST@${(order.gstPercent / 2).toFixed(1)}</span><b>${(order.gstPercent / 2).toFixed(1)}%&nbsp;&nbsp;${fmt(gstAmt / 2)}</b></div>
          <div class="kv tot"><span>${fmt(order.subtotal - order.discount)}@ SGST@${(order.gstPercent / 2).toFixed(1)}</span><b>${(order.gstPercent / 2).toFixed(1)}%&nbsp;&nbsp;${fmt(gstAmt / 2)}</b></div>
        ` : ""}
        ${svcPct > 0 ? `<div class="kv tot"><span>Service Charge ${svcPct}%</span><b>${fmt(svcAmt)}</b></div>` : ""}
        ${Math.abs(roundOff) >= 0.01 ? `<div class="kv tot"><span>Round Off</span><b>${roundOff > 0 ? "+" : ""}${fmt(roundOff)}</b></div>` : ""}

        <div class="dline"></div>
        <div class="grand-total">Grand Total ₹ ${fmt(order.grandTotal)}</div>
        <div class="dline"></div>

        ${paid > 0 ? `
          <div class="kv paid"><span>Amount Paid</span><b>₹${fmt(paid)}</b></div>
          ${balance > 0 ? `<div class="kv paid"><span>Balance Due</span><b>₹${fmt(balance)}</b></div>` : ""}
          <div class="dline"></div>
        ` : ""}

        <div class="center thanks">${escapeHtml(settings.thankYouMessage || "Thank You For Dining With Us")}</div>
        <div class="center visit">Please Visit Again</div>
        <div class="center tagline">${escapeHtml(tagline)}</div>

        ${type === "reprint" ? `<div class="center copy-tag">*** REPRINT ***</div>` : ""}
      </div>
    </div>
  `;
}

// ─── KOT ──────────────────────────────────────────────────────────
function renderKotBody(
  order: Order,
  settings: RestaurantSettings,
  copyLabel: string,
) {
  const s = kotScale(settings.kotSize);
  const tableDisplay = order.tableNumber ? `T${order.tableNumber}` : order.orderType.toUpperCase();

  return `
    <div class="page kot" style="
      --kot-name:${s.name}px;
      --kot-header:${s.header}px;
      --kot-label:${s.label}px;
      --kot-table:${s.table}px;
      --kot-item:${s.item}px;
      --kot-qty:${s.qty}px;
      --kot-gap:${s.spacing}px;
    ">
      <div class="center kot-name">${escapeHtml(settings.name)}</div>
      <div class="center kot-header">KITCHEN ORDER TICKET</div>
      ${copyLabel ? `<div class="center copy-tag">${escapeHtml(copyLabel)}</div>` : ""}
      <div class="dline"></div>

      <div class="kv kot-row"><span>KOT</span><b>${escapeHtml(order.billNumber)}</b></div>
      <div class="kv kot-table"><span>TABLE</span><b>${escapeHtml(tableDisplay)}</b></div>
      ${order.waiterName ? `<div class="kv kot-row"><span>Waiter</span><b>${escapeHtml(order.waiterName)}</b></div>` : ""}
      <div class="kv kot-row"><span>Time</span><b>${fmtTimeOnly(order.createdAt)}</b></div>
      ${order.customerName ? `<div class="kv kot-row"><span>Customer</span><b>${escapeHtml(order.customerName)}</b></div>` : ""}

      <div class="dline"></div>

      <div class="kot-items">
        ${order.items.map((i) => `
          <div class="kot-line">
            <div class="kot-item-name">${escapeHtml(i.name)}</div>
            <div class="kot-qty">x${i.quantity}</div>
          </div>
          ${i.notes ? `<div class="kot-notes">↳ ${escapeHtml(i.notes)}</div>` : ""}
        `).join("")}
      </div>

      ${order.notes ? `
        <div class="dline"></div>
        <div class="kot-instructions-title">SPECIAL INSTRUCTIONS</div>
        <div class="kot-instructions">${escapeHtml(order.notes)}</div>
      ` : ""}

      <div class="dline"></div>
      <div class="center kot-footer">*** KOT ***</div>
    </div>
  `;
}

// ─── Styles ───────────────────────────────────────────────────────
function buildStyles(size: PrinterPaper, printScale: PrintScale, fontScale: number) {
  fontScale = effectiveFontScale(fontScale);
  const { paper, inner, page } = paperDims(size);
  const isA4 = size === "a4";
  const is80 = size === "80mm";
  const is58 = size === "58mm";
  // Combine paper-size preset and per-user font scaler into a single
  // font multiplier — we intentionally avoid CSS transform/zoom on the
  // print container so the browser actually sends the job to the
  // thermal printer at the correct 80mm width.
  const combined = printScaleValue(printScale) * fontScale;
  const fs = (n: number) => +(n * combined).toFixed(2);

  return `
    @page { size: ${page}; margin: 0; }
    @media print {
      html, body { width: ${paper}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    html, body { margin: 0; padding: 0; background: white; color: black; width: ${paper}; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #000; }

    .page {
      width: ${paper};
      box-sizing: border-box;
      padding: 0;
      margin: 0 auto;
      background: white;
      position: relative;
    }
    .receipt-content {
      width: ${inner};
      margin: 0 auto;
      padding: ${is80 ? "2mm" : is58 ? "2mm" : "12mm"};
      box-sizing: border-box;
      position: relative;
      z-index: 1;
    }

    /* Watermark */
    .bill-watermark {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 0;
      opacity: 0.05;
      text-align: center;
      width: ${is80 ? "60mm" : is58 ? "45mm" : "120mm"};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .bill-watermark.watermark-text {
      font-size: ${is58 ? 26 : isA4 ? 100 : 38}px;
      font-weight: 900;
      letter-spacing: 2px;
      text-transform: uppercase;
      line-height: 1.1;
    }
    .bill-watermark.watermark-logo img {
      width: 100%;
      height: auto;
      filter: grayscale(100%);
    }

    .center { text-align: center; }
    .left { text-align: left; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .dline { border-top: 1px dashed #000; margin: 6px 0; }

    /* BILL */
    .bill .bill-header { text-align: center; }
    .bill .logo-wrap {
      width: ${is58 ? "30mm" : is80 ? "38mm" : "50mm"};
      margin: 0 auto 4px;
    }
    .bill .logo-wrap img { width: 100%; height: auto; display: block; }
    .bill .brand-name {
      font-size: ${fs(is58 ? 16 : isA4 ? 28 : 20)}px;
      font-weight: 800;
      line-height: 1.2;
      margin-top: 4px;
    }
    .bill .brand-addr {
      font-size: ${fs(is58 ? 10 : 11)}px;
      line-height: 1.35;
      margin-top: 2px;
    }
    .bill .brand-phone {
      font-size: ${fs(12)}px;
      font-weight: 600;
      line-height: 1.4;
      margin-top: 2px;
    }
    .bill .brand-gst {
      font-size: ${fs(12)}px;
      font-weight: 600;
      line-height: 1.4;
      margin-top: 2px;
    }

    .bill .name-row {
      font-size: ${fs(13)}px;
      font-weight: 600;
      padding: 2px 0;
    }

    .bill .info-grid {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: ${fs(13)}px;
      line-height: 1.45;
    }
    .bill .info-grid .info-right { text-align: left; }
    .bill .info-grid .info-right .bold { font-weight: 800; }

    .bill .copy-tag { font-size: ${fs(12)}px; font-weight: 700; letter-spacing: 1px; margin-top: 2px; }

    .bill table.items { width: 100%; border-collapse: collapse; margin: 2px 0; }
    .bill table.items th {
      font-size: ${fs(13)}px;
      font-weight: 700;
      padding: 4px 1px;
      border-bottom: 1px solid #000;
    }
    .bill table.items td {
      font-size: ${fs(13)}px;
      padding: 3px 1px;
      vertical-align: top;
      line-height: 1.35;
    }
    .bill table.items td.item-name { font-weight: 600; }
    .bill table.items td.item-notes { font-size: ${fs(11)}px; font-style: italic; padding-left: 8px; }

    .bill .sub-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: ${fs(13)}px;
      font-weight: 600;
      gap: 8px;
      padding: 2px 0;
    }
    .bill .sub-total { display: inline-flex; align-items: flex-end; gap: 6px; }
    .bill .sub-total .sub-label { font-size: ${fs(11)}px; line-height: 1; text-align: right; }
    .bill .sub-total b { font-size: ${fs(14)}px; }

    .bill .kv { display: flex; justify-content: space-between; gap: 8px; font-size: ${fs(12)}px; line-height: 1.4; padding: 1px 0; }
    .bill .kv.tot { font-size: ${fs(12)}px; }
    .bill .kv.paid { font-size: ${fs(13)}px; font-weight: 600; }

    .bill .grand-total {
      text-align: center;
      font-size: ${fs(isA4 ? 26 : 22)}px;
      font-weight: 800;
      padding: 4px 0;
      letter-spacing: 0.5px;
    }

    .bill .thanks { font-size: ${fs(14)}px; font-weight: 700; margin-top: 6px; }
    .bill .visit { font-size: ${fs(12)}px; margin-top: 2px; }
    .bill .tagline { font-size: ${fs(11)}px; font-style: italic; margin-top: 4px; line-height: 1.4; }

    /* KOT — uses per-element CSS vars set inline, multiplied by font scale */
    .kot .kot-name { font-size: calc(var(--kot-name) * ${combined}); font-weight: 800; }
    .kot .kot-header { font-size: calc(var(--kot-header) * ${combined}); font-weight: 800; letter-spacing: 1px; margin-top: 2px; }
    .kot .copy-tag { font-size: ${fs(14)}px; font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
    .kot .kot-row { font-size: calc(var(--kot-label) * ${combined}); font-weight: 600; line-height: 1.4; }
    .kot .kot-table { font-size: calc(var(--kot-table) * ${combined}); font-weight: 800; line-height: 1.3; padding: 4px 0; }
    .kot .kv { display: flex; justify-content: space-between; gap: 10px; }
    .kot .kot-items { display: flex; flex-direction: column; gap: var(--kot-gap); margin: 6px 0; }
    .kot .kot-line { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; border-bottom: 1px dotted #000; padding-bottom: 4px; }
    .kot .kot-item-name { font-size: calc(var(--kot-item) * ${combined}); font-weight: 800; flex: 1; text-transform: uppercase; }
    .kot .kot-qty { font-size: calc(var(--kot-qty) * ${combined}); font-weight: 900; }
    .kot .kot-notes { font-size: ${fs(14)}px; font-style: italic; margin-top: -2px; }
    .kot .kot-instructions-title { font-size: ${fs(16)}px; font-weight: 800; letter-spacing: 1px; }
    .kot .kot-instructions { font-size: ${fs(18)}px; font-weight: 700; }
    .kot .kot-footer { font-size: ${fs(18)}px; font-weight: 800; letter-spacing: 2px; margin-top: 6px; }
  `;
}

// ─── Print pipeline ───────────────────────────────────────────────
function buildDocument(
  order: Order,
  settings: RestaurantSettings,
  type: PrintType,
  opts?: { printScale?: PrintScale; fontScale?: number },
) {
  const size: PrinterPaper = (settings.printerSize as PrinterPaper) || "80mm";
  const printScale = opts?.printScale ?? getPrintScale();
  const defaultFont = type === "kot" ? getKotFontScale() : getBillFontScale();
  const fontScale = opts?.fontScale ?? defaultFont;

  const styles = buildStyles(size, printScale, fontScale);

  const bodies: string[] = [];

  if (type === "kot") {
    const showDup = settings.printDuplicateKOT === true;
    bodies.push(renderKotBody(order, settings, showDup ? "KITCHEN COPY" : ""));
    if (showDup) bodies.push(renderKotBody(order, settings, "DUPLICATE COPY"));
  } else {
    const wantCustomer = settings.printCustomerCopy !== false;
    const wantMerchant = settings.printMerchantCopy === true;
    if (wantCustomer) bodies.push(renderBillBody(order, settings, wantMerchant ? "CUSTOMER COPY" : "", type));
    if (wantMerchant) bodies.push(renderBillBody(order, settings, "MERCHANT COPY", type));
    if (bodies.length === 0) bodies.push(renderBillBody(order, settings, "", type));
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>Print ${escapeHtml(order.billNumber)}</title>
    <style>${styles}
      .page + .page { page-break-before: always; }
    </style></head><body>${bodies.join("")}</body></html>`;
}

export function printBill(
  order: Order,
  settings: RestaurantSettings,
  type: PrintType = "bill",
) {
  printHtml(buildDocument(order, settings, type));
}

// Build an HTML document for live preview (does not trigger print).
export function buildPreviewHtml(
  settings: RestaurantSettings,
  type: PrintType = "bill",
  opts?: { printScale?: PrintScale; fontScale?: number; order?: Order },
) {
  const order = opts?.order ?? sampleOrder(settings);
  return buildDocument(order, settings, type, opts);
}

function sampleOrder(settings: RestaurantSettings): Order {
  const gst = settings.gstEnabled ? settings.defaultGstPercent || 5 : 0;
  const rawItems = [
    { id: "s1", menuItemId: "s1", name: "Steamed Rice", price: 110, quantity: 2 },
    { id: "s2", menuItemId: "s2", name: "Yellow Dal Fry", price: 150, quantity: 1 },
    { id: "s3", menuItemId: "s3", name: "Mix Veg", price: 260, quantity: 1 },
  ];
  const items: OrderItem[] = rawItems.map((i) => ({
    ...i,
    source: "pos",
  }));
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const gstAmt = +((subtotal * gst) / 100).toFixed(2);
  const grand = Math.round(subtotal + gstAmt);
  return {
    id: "preview",
    billNumber: "PREVIEW",
    source: "pos",
    orderType: "dine_in",
    tableNumber: 1,
    waiterName: "Demo",
    customerName: "",
    items,
    subtotal,
    discount: 0,
    discountType: "flat",
    gstPercent: gst,
    cgst: +(gstAmt / 2).toFixed(2),
    sgst: +(gstAmt / 2).toFixed(2),
    grandTotal: grand,
    amountPaid: 0,
    status: "completed",
    kotPrinted: false,
    billPrinted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    notes: "",
  } as Order;
}

function printHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "-10000px";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch { /* ignore */ }

    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch { /* ignore */ }
    }, 1500);
  }, 200);
}

