import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { Download, FileText, Wallet, Smartphone } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { Card, Button, Badge, Empty } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore } from "../lib/store";
import { inr } from "../lib/money";
import type { Order, Payment } from "../lib/types";

const PIE_COLORS = ["#d4a017", "#b8860b", "#8b6508", "#ffc31a", "#16a34a", "#dc2626", "#0ea5e9", "#a855f7"];
const CASH_COLOR = "#16a34a";
const UPI_COLOR = "#0ea5e9";

type PaymentFilter = "all" | "cash" | "upi";

// Split a paid/billed order into cash & upi amounts using its payment records,
// falling back to lastPaymentMode/grandTotal for legacy orders.
function splitPaymentFor(o: Order, paymentsByOrder: Map<string, Payment[]>): { cash: number; upi: number } {
  const recs = paymentsByOrder.get(o.id);
  if (recs && recs.length) {
    let cash = 0, upi = 0;
    recs.forEach((p) => {
      if (typeof p.cashAmount === "number" || typeof p.upiAmount === "number") {
        cash += p.cashAmount || 0;
        upi += p.upiAmount || 0;
      } else if (p.paymentMode === "upi") {
        upi += p.amount || 0;
      } else {
        cash += p.amount || 0;
      }
    });
    if (cash + upi > 0) return { cash, upi };
  }
  if (o.lastPaymentMode === "upi") return { cash: 0, upi: o.grandTotal };
  return { cash: o.grandTotal, upi: 0 };
}


export default function Reports() {
  const orders = useStore("orders", Store.listOrders);
  const payments = useStore("payments", Store.listPayments);
  const items = useStore("items", Store.listItems);
  const categories = useStore("cats", Store.listCategories);
  const expenses = useStore("exps", Store.listExpenses);
  const inventory = useStore("inv", Store.listInventory);
  const settings = useStore("settings", Store.getSettings);
  const toast = useToast();

  const paymentsByOrder = useMemo(() => {
    const m = new Map<string, Payment[]>();
    payments.forEach((p) => {
      const list = m.get(p.orderId) || [];
      list.push(p);
      m.set(p.orderId, list);
    });
    return m;
  }, [payments]);

  const splitPayment = (o: Order) => splitPaymentFor(o, paymentsByOrder);


  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [payFilter, setPayFilter] = useState<PaymentFilter>("all");

  const filteredOrders = useMemo(() => {
    const f = new Date(from).getTime();
    const t = new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1;
    return orders.filter((o) => o.createdAt >= f && o.createdAt <= t && o.status !== "cancelled");
  }, [orders, from, to]);

  const paidOrders = useMemo(
    () => filteredOrders.filter((o) => o.status === "paid" || o.status === "billed"),
    [filteredOrders]
  );

  // Payment-filter aware revenue weight per order.
  const orderRevenue = (o: Order): number => {
    if (o.status !== "paid" && o.status !== "billed") return 0;
    const { cash, upi } = splitPayment(o);
    if (payFilter === "cash") return cash;
    if (payFilter === "upi") return upi;
    return cash + upi;
  };

  const orderMatchesFilter = (o: Order): boolean => {
    if (payFilter === "all") return true;
    const { cash, upi } = splitPayment(o);
    return payFilter === "cash" ? cash > 0 : upi > 0;
  };

  const paymentStats = useMemo(() => {
    let cashSales = 0, cashOrders = 0, upiSales = 0, upiOrders = 0;
    paidOrders.forEach((o) => {
      const { cash, upi } = splitPayment(o);
      if (cash > 0) { cashSales += cash; cashOrders += 1; }
      if (upi > 0) { upiSales += upi; upiOrders += 1; }
    });
    return { cashSales, cashOrders, upiSales, upiOrders };
  }, [paidOrders]);

  const totals = useMemo(() => {
    const sales = paidOrders.reduce((s, o) => s + orderRevenue(o), 0);
    const filtered = filteredOrders.filter(orderMatchesFilter);
    const gst = filtered
      .filter((o) => o.status === "paid" || o.status === "billed")
      .reduce((s, o) => s + o.cgst + o.sgst, 0);
    const ordersCount = filtered.length;
    const avgBill = ordersCount ? sales / ordersCount : 0;
    return { sales, gst, ordersCount, avgBill };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidOrders, filteredOrders, payFilter]);

  const itemWise = useMemo(() => {
    const m = new Map<string, { qty: number; revenue: number }>();
    filteredOrders.filter(orderMatchesFilter).forEach((o) => {
      const weight =
        payFilter === "all" || o.status === "open" || o.status === "confirmed"
          ? 1
          : (() => {
              const { cash, upi } = splitPayment(o);
              const tot = cash + upi;
              if (!tot) return 1;
              return (payFilter === "cash" ? cash : upi) / tot;
            })();
      o.items.forEach((i) => {
        const c = m.get(i.name) || { qty: 0, revenue: 0 };
        c.qty += i.quantity;
        c.revenue += i.quantity * i.price * weight;
        m.set(i.name, c);
      });
    });
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
      .sort((a, b) => b.revenue - a.revenue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOrders, payFilter]);

  const categoryWise = useMemo(() => {
    const m = new Map<string, number>();
    filteredOrders.filter(orderMatchesFilter).forEach((o) => o.items.forEach((i) => {
      const it = items.find((x) => x.id === i.menuItemId);
      const cat = it ? categories.find((c) => c.id === it.categoryId)?.name || "Other" : "Other";
      m.set(cat, (m.get(cat) || 0) + i.quantity * i.price);
    }));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOrders, items, categories, payFilter]);

  const waiterWise = useMemo(() => {
    const m = new Map<string, { orders: number; revenue: number }>();
    filteredOrders.filter(orderMatchesFilter).forEach((o) => {
      if (!o.waiterName) return;
      const c = m.get(o.waiterName) || { orders: 0, revenue: 0 };
      c.orders += 1;
      c.revenue += orderRevenue(o) || o.grandTotal;
      m.set(o.waiterName, c);
    });
    return Array.from(m.entries()).map(([name, v]) => ({ name, ...v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOrders, payFilter]);

  const dailySeries = useMemo(() => {
    const m = new Map<string, number>();
    paidOrders.forEach((o) => {
      const rev = orderRevenue(o);
      if (!rev) return;
      const d = new Date(o.createdAt).toISOString().slice(0, 10);
      m.set(d, (m.get(d) || 0) + rev);
    });
    return Array.from(m.entries()).map(([date, sales]) => ({ date, sales })).sort((a, b) => a.date.localeCompare(b.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidOrders, payFilter]);

  const dailyPaymentSeries = useMemo(() => {
    const m = new Map<string, { cash: number; upi: number }>();
    paidOrders.forEach((o) => {
      const { cash, upi } = splitPayment(o);
      const d = new Date(o.createdAt).toISOString().slice(0, 10);
      const c = m.get(d) || { cash: 0, upi: 0 };
      c.cash += cash;
      c.upi += upi;
      m.set(d, c);
    });
    return Array.from(m.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [paidOrders]);

  const paymentDistribution = useMemo(() => {
    const data = [
      { name: "Cash", value: paymentStats.cashSales },
      { name: "UPI", value: paymentStats.upiSales },
    ].filter((d) => d.value > 0);
    return data;
  }, [paymentStats]);

  const paymentSummary = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startWeek = startToday - ((now.getDay() + 6) % 7) * 86400000; // Monday
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const buckets = {
      today: { cash: 0, upi: 0 },
      week: { cash: 0, upi: 0 },
      month: { cash: 0, upi: 0 },
    };
    orders
      .filter((o) => o.status === "paid" || o.status === "billed")
      .forEach((o) => {
        const { cash, upi } = splitPayment(o);
        if (o.createdAt >= startMonth) { buckets.month.cash += cash; buckets.month.upi += upi; }
        if (o.createdAt >= startWeek) { buckets.week.cash += cash; buckets.week.upi += upi; }
        if (o.createdAt >= startToday) { buckets.today.cash += cash; buckets.today.upi += upi; }
      });
    return buckets;
  }, [orders]);

  const totalExpenses = expenses.filter((e) => e.date >= new Date(from).getTime() && e.date <= new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1).reduce((s, e) => s + e.amount, 0);
  const profit = totals.sales - totalExpenses;

  const filterSuffix = payFilter === "all" ? "" : ` (${payFilter.toUpperCase()})`;

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(180, 134, 11);
    doc.text(settings.name, 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(`Sales Report${filterSuffix}: ${from} → ${to}`, 14, 26);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 32);
    autoTable(doc, {
      startY: 38,
      head: [["Metric", "Value"]],
      body: [
        ["Total Sales", inr(totals.sales)],
        ["Cash Sales", `${inr(paymentStats.cashSales)} (${paymentStats.cashOrders} orders)`],
        ["UPI Sales", `${inr(paymentStats.upiSales)} (${paymentStats.upiOrders} orders)`],
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
    doc.save(`sales-report${filterSuffix}-${from}-to-${to}.pdf`);
    toast.push("PDF downloaded", "success");
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const summary = [
      [`${settings.name} – Sales Report${filterSuffix}`],
      [`Period: ${from} to ${to}`],
      [],
      ["Metric", "Value"],
      ["Total Sales", totals.sales],
      ["Cash Sales", paymentStats.cashSales],
      ["Cash Orders", paymentStats.cashOrders],
      ["UPI Sales", paymentStats.upiSales],
      ["UPI Orders", paymentStats.upiOrders],
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyPaymentSeries), "DailyPayments");
    XLSX.writeFile(wb, `sales-report${filterSuffix}-${from}-to-${to}.xlsx`);
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
        <PaymentStat
          label="Cash Sales"
          icon={<Wallet className="h-4 w-4" />}
          amount={paymentStats.cashSales}
          count={paymentStats.cashOrders}
          tone="green"
        />
        <PaymentStat
          label="UPI Sales"
          icon={<Smartphone className="h-4 w-4" />}
          amount={paymentStats.upiSales}
          count={paymentStats.upiOrders}
          tone="blue"
        />
        <SmallStat label="Orders" value={totals.ordersCount} />
        <SmallStat label="Avg Bill" value={inr(totals.avgBill)} />
        <SmallStat label="GST" value={inr(totals.gst)} />
        <SmallStat label="Expenses" value={inr(totalExpenses)} tone="red" />
        <SmallStat label="Net Profit" value={inr(profit)} tone={profit >= 0 ? "green" : "red"} />
        <SmallStat label="Inventory Value" value={inr(inventory.reduce((s, i) => s + i.quantity * i.purchasePrice, 0))} />
        <SmallStat label="Menu Items" value={items.length} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Payment Method Filter</h3>
            <p className="text-xs text-neutral-500">Applies to charts, tables and exports below</p>
          </div>
          <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            {(["all", "cash", "upi"] as PaymentFilter[]).map((p) => (
              <button
                key={p}
                onClick={() => setPayFilter(p)}
                className={`px-4 py-2 text-sm capitalize transition-colors ${
                  payFilter === p
                    ? "bg-gold-gradient text-white font-semibold"
                    : "bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                }`}
              >
                {p === "all" ? "All" : p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <h3 className="font-semibold mb-3">
            Daily Sales Trend{filterSuffix && <span className="text-xs text-neutral-500 ml-2">{filterSuffix.trim()}</span>}
          </h3>
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
          <h3 className="font-semibold mb-3">Payment Distribution</h3>
          {paymentDistribution.length === 0 ? (
            <Empty message="No payments yet" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={paymentDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} label={(d) => `${d.name} ${((d.percent || 0) * 100).toFixed(0)}%`}>
                    {paymentDistribution.map((d, i) => (
                      <Cell key={i} fill={d.name === "Cash" ? CASH_COLOR : UPI_COLOR} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "rgba(0,0,0,0.85)", border: "none", borderRadius: 8, color: "#fff" }} formatter={(v) => inr(Number(v) || 0)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <h3 className="font-semibold mb-3">Daily Payment Trend</h3>
          {dailyPaymentSeries.length === 0 ? (
            <Empty message="No payments yet" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={dailyPaymentSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,160,23,0.1)" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip contentStyle={{ background: "rgba(0,0,0,0.85)", border: "none", borderRadius: 8, color: "#fff" }} formatter={(v) => inr(Number(v) || 0)} />
                  <Legend />
                  <Bar dataKey="cash" name="Cash" fill={CASH_COLOR} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="upi" name="UPI" fill={UPI_COLOR} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">Payment Summary</h3>
          <div className="space-y-4">
            <SummaryBlock title="Today" cash={paymentSummary.today.cash} upi={paymentSummary.today.upi} />
            <SummaryBlock title="This Week" cash={paymentSummary.week.cash} upi={paymentSummary.week.upi} />
            <SummaryBlock title="This Month" cash={paymentSummary.month.cash} upi={paymentSummary.month.upi} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-semibold mb-3">Item-wise Sales{filterSuffix}</h3>
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
          <h3 className="font-semibold mb-3">Waiter Performance{filterSuffix}</h3>
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

function PaymentStat({
  label, icon, amount, count, tone,
}: { label: string; icon: React.ReactNode; amount: number; count: number; tone: "green" | "blue" }) {
  const color = tone === "green" ? "text-emerald-600" : "text-sky-600";
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="panel p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500 uppercase tracking-wide">{label}</p>
        <span className={color}>{icon}</span>
      </div>
      <p className={`text-xl font-bold mt-1 ${color}`}>{inr(amount)}</p>
      <p className="text-xs text-neutral-500 mt-0.5">{count} {count === 1 ? "Order" : "Orders"}</p>
    </motion.div>
  );
}

function SummaryBlock({ title, cash, upi }: { title: string; cash: number; upi: number }) {
  const total = cash + upi;
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">{title}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-emerald-600">Cash</span><span className="font-semibold">{inr(cash)}</span></div>
        <div className="flex justify-between"><span className="text-sky-600">UPI</span><span className="font-semibold">{inr(upi)}</span></div>
        <div className="flex justify-between pt-1 border-t border-neutral-200 dark:border-neutral-700"><span className="font-semibold">Total</span><span className="font-bold text-gold-600">{inr(total)}</span></div>
      </div>
    </div>
  );
}
