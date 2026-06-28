import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Billing from "./Billing";
import { Button } from "../components/UI";
import { Store, useStore } from "../lib/store";

// Dedicated per-table order screen. Reuses the full POS/Billing UI
// (menu sidebar + item grid + cart drawer + KOT + Bill) but locks the
// order to the selected table. Reached from Tables → click table card.
export default function TableOrderScreen() {
  const { tableId = "" } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const tables = useStore("tables", Store.listTables);
  const table = tables.find((t) => t.id === tableId);

  useEffect(() => {
    if (!table && tables.length > 0) {
      // Invalid id — bounce back to tables list.
      navigate("/tables", { replace: true });
    }
  }, [table, tables.length, navigate]);

  if (!table) return null;

  const displayNo = (() => {
    if (table.parentTableId && table.sectionLabel) {
      const parent = tables.find((p) => p.id === table.parentTableId);
      return parent ? `${parent.number}${table.sectionLabel}` : table.sectionLabel;
    }
    if (table.mergedWith && table.mergedWith.length > 0) {
      const others = table.mergedWith
        .map((id) => tables.find((p) => p.id === id)?.number)
        .filter((n): n is number => typeof n === "number");
      return [table.number, ...others].sort((a, b) => a - b).join("+");
    }
    return String(table.number);
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/tables")}>
            <ArrowLeft className="h-4 w-4" /> Tables
          </Button>
          <div>
            <h1 className="text-xl font-bold">Table {displayNo} — Order</h1>
            <p className="text-xs text-neutral-500">
              Dine-in order screen • Status:{" "}
              <span className="uppercase font-semibold">{table.status}</span>
            </p>
          </div>
        </div>
      </div>
      <Billing initialTableId={tableId} />
    </div>
  );
}
