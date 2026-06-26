import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from "recharts";
import { Download, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { Card, Button, Badge, Empty } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore } from "../lib/store";
import { inr } from "../lib/money";

const PIE_COLORS = ["#d4a017", "#b8860b", "#8b6508", "#ffc31a", "#16a34a", "#dc2626", "#0ea5e9", "#a855f7"];

export default function Reports() {
  const orders = useStore("orders", Store.listOrders);
  const items = useStore("items", Store.listItems);
  const categories = useStore("cats", Store.listCategories);
  const expenses = useStore("exps", Store.listExpenses);
  const inventory = useStore("inv", Store.listInventory);
  const settings = useStore("settings", Store.getSettings);
  const toast = useToast();

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const filteredOrders = useMemo(() => {
    const f = new Date(from).getTime();
    const t = new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1;
    return orders.filter((o) => o.createdAt >= f && o.createdAt <= t && o.status !== "cancelled");
  }, [orders, from, to]);

  const totals = useMemo(() => {
    const sales = filteredOrders.filter((o) => o.status === "paid" || o.status === "billed").reduce((s, o) => s + o.grandTotal, 0);
    const gst = filteredOrders.filter((o) => o.status === "paid" || o.status === "billed").reduce((s, o) => s + o.cgst + o.sgst, 0);
    const ordersCount = filteredOrders.length;
    const avgBill = ordersCount ? sales / ordersCount : 0;
    return { sales, gst, ordersCount, avgBill };
  }, [filteredOrders]);

  const itemWise = useMemo(() => {
    const m = new Map<string, { qty: number; revenue: number }>();
    filteredOrders.forEach((o) => o.items.forEach((i) => {
      const c = m.get(i.name) || { qty: 0, revenue: 0 };
      c.qty += i.quantity;
      c.revenue += i.quantity * i.price;
      m.set(i.name, c);
    }));
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders]);

  const categoryWise = useMemo(() => {
    const m = new Map<string, number>();
    filteredOrders.forEach((o) => o.items.forEach((i) => {
      const it = items.find((x) => x.id === i.menuItemId);
      const cat = it ? categories.find((c) => c.id === it.categoryId)?.name || "Other" : "Other";
      m.set(cat, (m.get(cat) || 0) + i.quantity * i.price);
    }));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredOrders, items, categories]);

  const waiterWise = useMemo(() => {
    const m = new Map<string, { orders: number; revenue: number }>();
    filteredOrders.forEach((o) => {
      if (!o.waiterName) return;
      const c = m.get(o.waiterName) || { orders: 0, revenue: 0 };
      c.orders += 1;
      c.revenue += o.grandTotal;
      m.set(o.waiterName, c);
    });
    return Array.from(m.entries()).map(([name, v]) => ({ name, ...v }));
  }, [filteredOrders]);

  const dailySeries = useMemo(() => {
    const m = new Map<string, number>();
    filteredOrders.forEach((o) => {
      const d = new Date(o.createdAt).toISOString().slice(0, 10);
      if (o.status === "paid" || o.status === "billed") m.set(d, (m.get(d) || 0) + o.grandTotal);
    });
    return Array.from(m.entries()).map(([date, sales]) => ({ date, sales })).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredOrders]);

  const totalExpenses = expenses.filter((e) => e.date >= new Date(from).getTime() && e.date <= new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1).reduce((s, e) => s + e.amount, 0);
  const profit = totals.sales - totalExpenses;

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(180, 134, 11);
    doc.text(settings.name, 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(`Sales Report: ${from} → ${to}`, 14, 26);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 32);
    autoTable(doc, {
      startY: 38,
      head: [["Metric", "Value"]],
      body: [
        ["Total Sales", inr(totals.sales)],
        ["Total Orders", String(totals.ordersCount)],
        ["Average Bill", inr(totals.avgBill)],
        ["GST Collected", inr(totals.gst)],
        ["Total Expenses", inr(totalExpenses)],
        ["Net Profit", inr(profit)],
      ],
    });
    autoTable(doc, {
      head: [["Item", "Qty", "Revenue"]],
      body: itemWise.slice(0, 30).map((i) => [i.name, String(i.qty), inr(i.revenue)]),
    });
    doc.save(`sales-report-${from}-to-${to}.pdf`);
    toast.push("PDF downloaded", "success");
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const summary = [
      ["7 Spices Restaurant – Sales Report"],
      [`Period: ${from} to ${to}`],
      [],
      ["Metric", "Value"],
      ["Total Sales", totals.sales],
      ["Total Orders", totals.ordersCount],
      ["Average Bill", totals.avgBill],
      ["GST Collected", totals.gst],
      ["Total Expenses", totalExpenses],
      ["Net Profit", profit],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemWise), "Items");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(categoryWise), "Categories");
    if (waiterWise.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(waiterWise), "Waiters");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailySeries), "Daily");
    XLSX.writeFile(wb, `sales-report-${from}-to-${to}.xlsx`);
    toast.push("Excel downloaded", "success");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Reports & Analytics</h2>
          <p className="text-sm text-neutral-500">Sales, items, categories & expenses</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs">
            <span className="block mb-1 font-medium">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block mb-1 font-medium">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm" />
          </label>
          <Button variant="outline" onClick={exportPDF}><FileText className="h-4 w-4" /> PDF</Button>
          <Button variant="primary" onClick={exportExcel}><Download className="h-4 w-4" /> Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SmallStat label="Total Sales" value={inr(totals.sales)} />
        <SmallStat label="Orders" value={totals.ordersCount} />
        <SmallStat label="Avg Bill" value={inr(totals.avgBill)} />
        <SmallStat label="GST" value={inr(totals.gst)} />
        <SmallStat label="Expenses" value={inr(totalExpenses)} tone="red" />
        <SmallStat label="Net Profit" value={inr(profit)} tone={profit >= 0 ? "green" : "red"} />
        <SmallStat label="Inventory Value" value={inr(inventory.reduce((s, i) => s + i.quantity * i.purchasePrice, 0))} />
        <SmallStat label="Menu Items" value={items.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <h3 className="font-semibold mb-3">Daily Sales Trend</h3>
          {dailySeries.length === 0 ? (
            <Empty message="No data for this period" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,160,23,0.1)" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip contentStyle={{ background: "rgba(0,0,0,0.85)", border: "none", borderRadius: 8, color: "#fff" }} />
                  <Line type="monotone" dataKey="sales" stroke="#d4a017" strokeWidth={3} dot={{ fill: "#d4a017" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">Category Distribution</h3>
          {categoryWise.length === 0 ? (
            <Empty message="No data" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={categoryWise} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85}>
                    {categoryWise.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "rgba(0,0,0,0.85)", border: "none", borderRadius: 8, color: "#fff" }} formatter={(v) => inr(Number(v) || 0)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold mb-3">Top Selling Items</h3>
        {itemWise.length === 0 ? <Empty message="No data" /> : (
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={itemWise.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,160,23,0.1)" />
                <XAxis dataKey="name" fontSize={10} angle={-25} textAnchor="end" height={70} interval={0} />
                <YAxis fontSize={11} />
                <Tooltip contentStyle={{ background: "rgba(0,0,0,0.85)", border: "none", borderRadius: 8, color: "#fff" }} />
                <Bar dataKey="revenue" fill="#d4a017" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-semibold mb-3">Item-wise Sales</h3>
          <div className="overflow-x-auto -mx-5 px-5 max-h-72 overflow-y-auto">
            <table className="tbl">
              <thead><tr><th>Item</th><th>Qty</th><th className="text-right">Revenue</th></tr></thead>
              <tbody>
                {itemWise.slice(0, 30).map((i) => (
                  <tr key={i.name}>
                    <td>{i.name}</td>
                    <td>{i.qty}</td>
                    <td className="text-right font-semibold text-gold-600">{inr(i.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">Waiter Performance</h3>
          {waiterWise.length === 0 ? <Empty message="No waiter orders" /> : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="tbl">
                <thead><tr><th>Waiter</th><th>Orders</th><th className="text-right">Revenue</th></tr></thead>
                <tbody>
                  {waiterWise.map((w) => (
                    <tr key={w.name}>
                      <td className="font-medium">{w.name}</td>
                      <td><Badge tone="gold">{w.orders}</Badge></td>
                      <td className="text-right font-semibold text-gold-600">{inr(w.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SmallStat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "green" | "red" }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="panel p-4">
      <p className="text-xs text-neutral-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${tone === "red" ? "text-rose-600" : tone === "green" ? "text-emerald-600" : "text-gold-600"}`}>{value}</p>
    </motion.div>
  );
}
