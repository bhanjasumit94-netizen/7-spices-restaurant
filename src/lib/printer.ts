// Thermal bill / KOT printing utilities.
// Uses the browser's window.print() against a hidden iframe so the user
// can pick their thermal printer from the system print dialog.

import { Order, RestaurantSettings } from "./types";

function fmt(n: number) {
  return n.toFixed(2);
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function settingsForPrint(settings: RestaurantSettings) {
  const width = settings.printerSize === "58mm" ? "58mm" : "80mm";
  const fontSize = settings.printerSize === "58mm" ? "11px" : "13px";
  return { width, fontSize };
}

export function printBill(order: Order, settings: RestaurantSettings, type: "bill" | "kot" | "reprint" = "bill") {
  const { width, fontSize } = settingsForPrint(settings);

  let body = "";
  if (type === "kot") {
    body = `
      <div class="center">
        <h2>${escapeHtml(settings.name)}</h2>
        <p><b>KITCHEN ORDER TICKET</b></p>
      </div>
      <hr/>
      <div class="row"><span>Order:</span><b>${escapeHtml(order.billNumber)}</b></div>
      <div class="row"><span>Table:</span><b>${order.tableNumber ? "T" + order.tableNumber : order.orderType.toUpperCase()}</b></div>
      <div class="row"><span>Waiter:</span><b>${escapeHtml(order.waiterName || "—")}</b></div>
      <div class="row"><span>Time:</span><b>${fmtDate(order.createdAt)}</b></div>
      ${order.notes ? `<div>Notes: ${escapeHtml(order.notes)}</div>` : ""}
      <hr/>
      <table>
        <thead><tr><th>Item</th><th>Qty</th></tr></thead>
        <tbody>
        ${order.items
          .map(
            (i) => `
          <tr>
            <td>${escapeHtml(i.name)}${i.notes ? `<br/><small>${escapeHtml(i.notes)}</small>` : ""}</td>
            <td class="right"><b>${i.quantity}</b></td>
          </tr>`
          )
          .join("")}
        </tbody>
      </table>
      <hr/>
      <div class="center">*** KOT ***</div>
    `;
  } else {
    body = `
      <div class="center">
        <h2>${escapeHtml(settings.name)}</h2>
        <p>${escapeHtml(settings.address)}</p>
        <p>Ph: ${escapeHtml(settings.phone)}${settings.gstin ? ` | GSTIN: ${escapeHtml(settings.gstin)}` : ""}</p>
      </div>
      <hr/>
      <div class="row"><span>Bill No:</span><b>${escapeHtml(order.billNumber)}</b></div>
      <div class="row"><span>Date:</span><b>${fmtDate(order.createdAt)}</b></div>
      <div class="row"><span>Type:</span><b>${order.orderType.replace("_", " ").toUpperCase()}</b></div>
      ${order.tableNumber ? `<div class="row"><span>Table:</span><b>${order.tableNumber}</b></div>` : ""}
      ${order.customerName ? `<div class="row"><span>Customer:</span><b>${escapeHtml(order.customerName)}</b></div>` : ""}
      ${order.waiterName ? `<div class="row"><span>Waiter:</span><b>${escapeHtml(order.waiterName)}</b></div>` : ""}
      ${order.notes ? `<div>Notes: ${escapeHtml(order.notes)}</div>` : ""}
      <hr/>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead>
        <tbody>
        ${order.items
          .map(
            (i) => `
          <tr>
            <td>${escapeHtml(i.name)}</td>
            <td class="center">${i.quantity}</td>
            <td class="right">${fmt(i.price)}</td>
            <td class="right">${fmt(i.price * i.quantity)}</td>
          </tr>`
          )
          .join("")}
        </tbody>
      </table>
      <hr/>
      <div class="row"><span>Subtotal</span><b>${fmt(order.subtotal)}</b></div>
      ${
        order.discount > 0
          ? `<div class="row"><span>Discount</span><b>-${fmt(order.discount)}</b></div>`
          : ""
      }
      ${
        settings.gstEnabled && order.gstPercent > 0
          ? `<div class="row"><span>CGST (${order.gstPercent / 2}%)</span><b>${fmt(order.cgst)}</b></div>
             <div class="row"><span>SGST (${order.gstPercent / 2}%)</span><b>${fmt(order.sgst)}</b></div>`
          : ""
      }
      <div class="row big"><span>GRAND TOTAL</span><b>${fmt(order.grandTotal)}</b></div>
      ${renderPaymentSummary(order)}
      <hr/>
      <div class="center">${escapeHtml(settings.thankYouMessage)}</div>
      ${type === "reprint" ? `<div class="center small">*** REPRINT ***</div>` : ""}
    `;
  }

// Render a small payment summary so the printed bill shows exactly what
// was paid (cash vs UPI) and how much is still owed.
function renderPaymentSummary(order: Order): string {
  const paid = order.amountPaid ?? 0;
  const balance = Math.max(0, order.grandTotal - paid);
  if (paid <= 0) {
    return `<div class="row small"><span>AMOUNT PAID</span><b>${fmt(0)}</b></div>
            <div class="row small"><span>BALANCE DUE</span><b>${fmt(order.grandTotal)}</b></div>`;
  }
  return `
    <div class="row small"><span>AMOUNT PAID</span><b>${fmt(paid)}</b></div>
    ${order.lastPaymentMode ? `<div class="row small"><span>MODE</span><b>${order.lastPaymentMode.replace("_", " ").toUpperCase()}</b></div>` : ""}
    <div class="row small"><span>BALANCE DUE</span><b>${fmt(balance)}</b></div>
  `;
}

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Print</title>
  <style>
    @page { size: ${width} auto; margin: 4mm; }
    body { font-family: 'Courier New', monospace; font-size: ${fontSize}; width: ${width}; margin: 0; padding: 0; color: #000; }
    .center { text-align: center; }
    .right { text-align: right; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .big { font-size: 1.25em; font-weight: bold; padding: 4px 0; }
    .small { font-size: 10px; }
    hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 2px 4px; vertical-align: top; }
    th { border-bottom: 1px solid #000; text-align: left; }
    h2 { margin: 0; font-size: 1.3em; }
    p { margin: 2px 0; }
  </style></head><body>${body}</body></html>`;

  printHtml(html);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }, 1500);
  }, 200);
}
