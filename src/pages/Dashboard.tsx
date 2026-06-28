import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  IndianRupee,
  ClipboardList,
  ShoppingBag,
  Boxes,
  AlertTriangle,
  TableProperties,
  TrendingUp,
  Receipt,
  ChefHat,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, StatCard, Badge, Button } from "../components/UI";
import { Store, useStore } from "../lib/store";
import { inr, shortNum } from "../lib/money";
import { ActiveMenuBanner } from "../components/ActiveMenuBanner";

export default function Dashboard() {
  const orders = useStore("orders", Store.listOrders);
  const tables = useStore("tables", Store.listTables);
  const inventory = useStore("inv", Store.listInventory);

  const stats = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const todayOrders = orders.filter((o) => o.createdAt >= startOfDay && o.status !== "cancelled");
    const todaySales = todayOrders
      .filter((o) => o.status === "paid" || o.status === "billed")
      .reduce((s, o) => s + o.grandTotal, 0);
    const pendingOrders = orders.filter((o) =>
      ["open", "confirmed", "preparing", "ready"].includes(o.status)
    ).length;
    const totalOrders = orders.length;
    const occupiedTables = tables.filter((t) => t.status === "occupied").length;
    const monthlySales = orders
      .filter((o) => o.createdAt >= startOfMonth && (o.status === "paid" || o.status === "billed"))
      .reduce((s, o) => s + o.grandTotal, 0);
    const gstCollection = todayOrders
      .filter((o) => o.status === "paid" || o.status === "billed")
      .reduce((s, o) => s + o.cgst + o.sgst, 0);
    const inventoryValue = inventory.reduce((s, i) => s + i.quantity * i.purchasePrice, 0);
    const lowStock = inventory.filter((i) => i.quantity <= i.minStock).length;

    return {
      todaySales,
      pendingOrders,
      totalOrders,
      occupiedTables,
      monthlySales,
      gstCollection,
      inventoryValue,
      lowStock,
    };
  }, [orders, tables, inventory]);

  const recentOrders = useMemo(() => orders.slice(0, 6), [orders]);

  const itemSales = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    orders
      .filter((o) => o.status !== "cancelled")
      .forEach((o) =>
        o.items.forEach((i) => {
          const cur = map.get(i.name) || { name: i.name, qty: 0, revenue: 0 };
          cur.qty += i.quantity;
          cur.revenue += i.quantity * i.price;
          map.set(i.name, cur);
        })
      );
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [orders]);

  return (
    <div className="space-y-6">
      <ActiveMenuBanner />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-3"
      >
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/billing">
            <Button variant="primary" size="md">
              <Receipt className="h-4 w-4" /> New Bill
            </Button>
          </Link>
          <Link to="/waiter">
            <Button variant="outline" size="md">
              <ChefHat className="h-4 w-4" /> Waiter
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
        <StatCard
          label="Today's Sales"
          value={inr(stats.todaySales)}
          hint={`${stats.todaySales > 0 ? "Great going!" : "Start your day"}`}
          icon={<IndianRupee className="h-5 w-5" />}
          tone="gold"
        />
        <StatCard
          label="Pending Orders"
          value={stats.pendingOrders}
          hint="Open + preparing"
          icon={<ClipboardList className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          label="Total Orders"
          value={shortNum(stats.totalOrders)}
          hint="All time"
          icon={<ShoppingBag className="h-5 w-5" />}
          tone="purple"
        />
        <StatCard
          label="Inventory Value"
          value={inr(stats.inventoryValue)}
          hint={`${inventory.length} items`}
          icon={<Boxes className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          label="Low Stock"
          value={stats.lowStock}
          hint="Need restock"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="red"
        />
        <StatCard
          label="Tables Occupied"
          value={`${stats.occupiedTables} / ${tables.length}`}
          hint={`${tables.length - stats.occupiedTables} available`}
          icon={<TableProperties className="h-5 w-5" />}
          tone="gold"
        />
        <StatCard
          label="Monthly Sales"
          value={inr(stats.monthlySales)}
          hint={new Date().toLocaleDateString("en-IN", { month: "long" })}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          label="GST Collection"
          value={inr(stats.gstCollection)}
          hint="Today"
          icon={<IndianRupee className="h-5 w-5" />}
          tone="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">Recent Orders</h3>
            <Link to="/orders" className="text-sm text-gold-600 hover:text-gold-700">View all →</Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-center py-10 text-neutral-500">No orders yet. Start by creating a bill.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Bill #</th>
                    <th>Type</th>
                    <th>Items</th>
                    <th className="text-right">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td className="font-mono text-xs">{o.billNumber}</td>
                      <td className="capitalize">{o.orderType.replace("_", " ")}</td>
                      <td>{o.items.length}</td>
                      <td className="text-right font-semibold">{inr(o.grandTotal)}</td>
                      <td>
                        <Badge
                          tone={
                            o.status === "paid" || o.status === "billed"
                              ? "success"
                              : o.status === "cancelled"
                              ? "danger"
                              : o.status === "ready"
                              ? "info"
                              : "warning"
                          }
                        >
                          {o.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-lg mb-4">Top Selling Items</h3>
          {itemSales.length === 0 ? (
            <p className="text-center py-10 text-neutral-500">No sales yet</p>
          ) : (
            <div className="space-y-3">
              {itemSales.map((it, idx) => {
                const max = itemSales[0].revenue;
                const pct = (it.revenue / max) * 100;
                return (
                  <div key={it.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium truncate pr-2">
                        <span className="inline-block w-5 text-gold-600 font-bold">#{idx + 1}</span>
                        {it.name}
                      </span>
                      <span className="text-neutral-500 text-xs">{it.qty}x · {inr(it.revenue)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full bg-gold-gradient rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
