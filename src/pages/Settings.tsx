import { useState, useRef, useMemo, useEffect } from "react";
import { Wand2, Minus, Plus } from "lucide-react";

import { Save, Upload, Download, UploadCloud, RotateCcw, Image as ImageIcon, Trash2, ImagePlus } from "lucide-react";
import { Card, Button, Input, Select, Badge } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore, useLogo, seedIfNeeded, LOGO_KEY } from "../lib/store";
import { useAuth } from "../lib/auth";
import { isSuperAdmin } from "../lib/permissions";
import { Logo } from "../components/Logo";
import {
  getPrintScale, setPrintScale,
  getBillFontScale, setBillFontScale, getKotFontScale, setKotFontScale,
  getPrintPreviewBill, setPrintPreviewBill, getPrintPreviewKot, setPrintPreviewKot,
  FONT_SCALE_BOUNDS, buildPreviewHtml, type PrintScale,
} from "../lib/printer";


const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const ACCEPTED_EXT = ".png,.jpg,.jpeg,.webp";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export default function Settings() {
  const settings = useStore("settings", Store.getSettings);
  const audit = useStore("audit", Store.listAudit);
  const toast = useToast();
  const { user } = useAuth();
  const logo = useLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(settings);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [printScale, setPrintScaleState] = useState<PrintScale>(() => getPrintScale());
  const [billFont, setBillFontState] = useState<number>(() => getBillFontScale());
  const [kotFont, setKotFontState] = useState<number>(() => getKotFontScale());
  const [previewBill, setPreviewBillState] = useState<boolean>(() => getPrintPreviewBill());
  const [previewKot, setPreviewKotState] = useState<boolean>(() => getPrintPreviewKot());
  const [previewType, setPreviewType] = useState<"bill" | "kot">("bill");

  // Persist immediately on change.
  useEffect(() => { setPrintScale(printScale); }, [printScale]);
  useEffect(() => { setBillFontScale(billFont); }, [billFont]);
  useEffect(() => { setKotFontScale(kotFont); }, [kotFont]);
  useEffect(() => { setPrintPreviewBill(previewBill); }, [previewBill]);
  useEffect(() => { setPrintPreviewKot(previewKot); }, [previewKot]);

  const previewFont = previewType === "kot" ? kotFont : billFont;
  const previewHtml = useMemo(
    () => buildPreviewHtml(form, previewType, { printScale, fontScale: previewFont }),
    [form, previewType, printScale, previewFont],
  );

  const clampFont = (v: number) =>
    Math.min(FONT_SCALE_BOUNDS.max, Math.max(FONT_SCALE_BOUNDS.min, +v.toFixed(2)));
  const bumpBill = (delta: number) => setBillFontState((v) => clampFont(v + delta));
  const bumpKot = (delta: number) => setKotFontState((v) => clampFont(v + delta));


  const logoSizeKB = useMemo(() => {
    if (!logo) return 0;
    // Approximate storage footprint (base64 inflation ≈ 4/3)
    return Math.round((logo.length * 0.75) / 1024);
  }, [logo]);

  const save = () => {
    Store.saveSettings(form);
    if (user) Store.addAudit({ userId: user.id, userName: user.name, action: "SETTINGS_UPDATE", details: "Restaurant settings updated" });
    toast.push("Settings saved", "success");
  };

  // Validate and read the selected image as a Base64 data URL.
  const readImageAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return reject(new Error("Unsupported file type. Use PNG, JPG, JPEG, or WEBP."));
      }
      if (file.size > MAX_BYTES) {
        return reject(new Error("Logo file must be smaller than 5 MB."));
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.readAsDataURL(file);
    });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPreviewError(null);
      const dataUrl = await readImageAsDataUrl(file);
      Store.setLogo(dataUrl);
      if (user) Store.addAudit({ userId: user.id, userName: user.name, action: "LOGO_UPLOAD", details: `Uploaded logo (${Math.round(file.size / 1024)} KB)` });
      toast.push("Logo uploaded successfully", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to upload logo";
      setPreviewError(msg);
      toast.push(msg, "error");
    }
  };

  const handleRemove = () => {
    if (!confirm("Remove the current logo and restore the default placeholder?")) return;
    Store.removeLogo();
    if (user) Store.addAudit({ userId: user.id, userName: user.name, action: "LOGO_REMOVE", details: "Logo removed" });
    toast.push("Logo removed", "info");
  };

  const exportBackup = () => {
    const json = Store.exportAll();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `7spices-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.push("Backup downloaded", "success");
  };

  const importBackup = () => fileRef.current?.click();
  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        Store.importAll(reader.result as string);
        toast.push("Backup restored! Reloading…", "success");
        setTimeout(() => window.location.reload(), 800);
      } catch {
        toast.push("Invalid backup file", "error");
      }
    };
    reader.readAsText(f);
  };

  const reset = () => {
    if (!confirm("This will erase ALL data and reseed defaults. Continue?")) return;
    Object.values(Store.KEYS).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(LOGO_KEY);
    try { localStorage.removeItem("spices_qr_tokens"); } catch { /* ignore */ }
    try { localStorage.removeItem("spices_qr_tokens_version"); } catch { /* ignore */ }
    seedIfNeeded();
    toast.push("System reset to defaults", "info");
    setTimeout(() => window.location.reload(), 800);
  };

  // The full Business / Factory reset is now handled by the dedicated
  // /reset-system page (Super Admin only). The button on this Settings
  // page simply navigates to that page — it never triggers the reset
  // directly. This keeps the reset workflow centralised.

  return (
    <div className="space-y-5 max-w-5xl">
      <h2 className="text-2xl font-bold">Settings</h2>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Restaurant Information</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Restaurant Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Input label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <label className="md:col-span-2">
            <span className="block mb-1 text-xs font-medium">Address</span>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
            />
          </label>
          <Input label="GSTIN" value={form.gstin || ""} onChange={(v) => setForm({ ...form, gstin: v })} />
          <Input
            label="Thank You Message"
            value={form.thankYouMessage}
            onChange={(v) => setForm({ ...form, thankYouMessage: v })}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
          <div>
            <p className="text-xs font-medium mb-2">Preview</p>
            <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg inline-flex">
              <Logo size="md" logoUrl={logo} />
            </div>
          </div>
        </div>
      </Card>

      {/* Business Hours — controls the auto day-close window */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold">Business Hours</h3>
          <Badge tone={form.autoDayCloseEnabled === false ? "neutral" : "success"}>
            {form.autoDayCloseEnabled === false ? "Auto-close OFF" : "Auto-close ON"}
          </Badge>
        </div>
        <p className="text-xs text-neutral-500 mb-3">
          Daily sales counters (Dashboard & Reports "today") reset at Close time.
          Close time after midnight is treated as the next day. Unpaid bills
          carry forward — no data is deleted.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label>
            <span className="block mb-1 text-xs font-medium">Open Time</span>
            <input
              type="time"
              value={form.businessOpenTime || "11:00"}
              onChange={(e) => setForm({ ...form, businessOpenTime: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
            />
          </label>
          <label>
            <span className="block mb-1 text-xs font-medium">Close Time (next day)</span>
            <input
              type="time"
              value={form.businessCloseTime || "02:00"}
              onChange={(e) => setForm({ ...form, businessCloseTime: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={form.autoDayCloseEnabled !== false}
              onChange={(e) => setForm({ ...form, autoDayCloseEnabled: e.target.checked })}
            />
            <span className="text-sm">Enable automatic day-close</span>
          </label>
        </div>
      </Card>

      {/* Dedicated Logo Upload Card */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-gold-500" /> Restaurant Logo
          </h3>
          {logo ? <Badge tone="success">Custom Logo</Badge> : <Badge tone="neutral">Default Placeholder</Badge>}
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Upload your restaurant logo. It will be saved to your browser's Local Storage as Base64 and shown on
          every page until you remove or replace it.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-5 items-center">
          {/* Logo Preview */}
          <div className="flex items-center justify-center">
            <div className="relative">
              {logo ? (
                <div className="h-32 w-32 rounded-2xl border-2 border-gold-400/40 bg-white flex items-center justify-center overflow-hidden shadow-lg">
                  <img
                    src={logo}
                    alt="Restaurant logo"
                    className="max-h-full max-w-full object-contain"
                    onError={() => setPreviewError("Could not display this logo.")}
                  />
                </div>
              ) : (
                <div className="h-32 w-32 rounded-2xl border-2 border-dashed border-gold-400/40 bg-gradient-to-br from-gold-50 to-gold-100 dark:from-gold-500/10 dark:to-gold-700/5 flex flex-col items-center justify-center text-gold-700 dark:text-gold-300">
                  <ImageIcon className="h-10 w-10 opacity-50 mb-1" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">Placeholder</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions + Info */}
          <div className="space-y-3">
            <div className="text-sm">
              <p className="font-medium">Storage</p>
              <p className="text-xs text-neutral-500">
                {logo ? (
                  <>
                    Saved in browser Local Storage under{" "}
                    <code className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-[11px]">
                      {LOGO_KEY}
                    </code>{" "}
                    (~{logoSizeKB} KB)
                  </>
                ) : (
                  <>No logo uploaded yet. Use the buttons below to add one.</>
                )}
              </p>
            </div>

            {previewError && (
              <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded px-2 py-1.5">
                {previewError}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {/* Upload (only when no logo yet) */}
              {!logo && (
                <label className="btn-gold cursor-pointer inline-flex items-center gap-2 text-sm">
                  <Upload className="h-4 w-4" /> Upload Logo
                  <input
                    type="file"
                    accept={ACCEPTED_EXT}
                    className="hidden"
                    onChange={handleUpload}
                  />
                </label>
              )}

              {/* Replace (when a logo exists) */}
              {logo && (
                <>
                  <label className="btn-gold cursor-pointer inline-flex items-center gap-2 text-sm">
                    <ImagePlus className="h-4 w-4" /> Replace Logo
                    <input
                      ref={replaceRef}
                      type="file"
                      accept={ACCEPTED_EXT}
                      className="hidden"
                      onChange={handleUpload}
                    />
                  </label>
                  <Button variant="outline" size="md" onClick={handleRemove}>
                    <Trash2 className="h-4 w-4" /> Remove Logo
                  </Button>
                </>
              )}
            </div>

            <div className="text-[11px] text-neutral-500 border-t border-neutral-200 dark:border-neutral-800 pt-3">
              <p className="font-semibold mb-1">Supported formats & limits:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>PNG, JPG, JPEG, WEBP</li>
                <li>Maximum file size: 5 MB</li>
                <li>Recommended: square image, transparent background, 512×512 or larger</li>
                <li>Stored locally in your browser only — never sent to any server</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold mb-4">GST & Tax</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.gstEnabled}
              onChange={(e) => setForm({ ...form, gstEnabled: e.target.checked })}
              className="h-4 w-4 rounded accent-gold-500"
            />
            <span className="text-sm font-medium">Enable GST on bills</span>
            {form.gstEnabled ? <Badge tone="success">ON</Badge> : <Badge tone="neutral">OFF</Badge>}
          </label>
          <Select
            label="Default GST %"
            value={String(form.defaultGstPercent)}
            onChange={(v) => setForm({ ...form, defaultGstPercent: parseFloat(v) })}
            options={[
              { value: "5", label: "5% (CGST 2.5% + SGST 2.5%)" },
              { value: "12", label: "12% (CGST 6% + SGST 6%)" },
              { value: "18", label: "18% (CGST 9% + SGST 9%)" },
            ]}
          />
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold mb-4">Printing</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            label="Printer Type"
            value={form.printerSize}
            onChange={(v) => setForm({ ...form, printerSize: v as "58mm" | "80mm" | "a4" })}
            options={[
              { value: "58mm", label: "58mm Thermal" },
              { value: "80mm", label: "80mm Thermal (default)" },
              { value: "a4", label: "A4 Paper" },
            ]}
          />
          <Select
            label="Kitchen KOT Size"
            value={form.kotSize || "xlarge"}
            onChange={(v) => setForm({ ...form, kotSize: v as "normal" | "large" | "xlarge" })}
            options={[
              { value: "normal", label: "Normal" },
              { value: "large", label: "Large" },
              { value: "xlarge", label: "Extra Large (default)" },
            ]}
          />
          <Select
            label="Bill Watermark"
            value={form.watermarkType || "text"}
            onChange={(v) => setForm({ ...form, watermarkType: v as "text" | "logo" | "none" })}
            options={[
              { value: "text", label: "Text Watermark (restaurant name)" },
              { value: "logo", label: "Logo Watermark (if logo set)" },
              { value: "none", label: "No Watermark" },
            ]}
          />
          <label className="flex items-center gap-3 cursor-pointer mt-2">
            <input
              type="checkbox"
              checked={form.waiterMode}
              onChange={(e) => setForm({ ...form, waiterMode: e.target.checked })}
              className="h-4 w-4 rounded accent-gold-500"
            />
            <span className="text-sm font-medium">Waiter Mode (require waiter on orders)</span>
          </label>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Print Behaviour</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {([
              ["autoPrintKOT", "Auto Print KOT after Save Order", true],
              ["autoPrintBill", "Auto Print Bill after Payment", true],
              ["printCustomerCopy", "Print Customer Copy", true],
              ["printMerchantCopy", "Print Merchant Copy", false],
              ["printDuplicateKOT", "Print Duplicate KOT", false],
              ["printLogo", "Print Logo", true],
              ["printGstNumber", "Print GST Number", true],
              ["printQrCode", "Print QR Code", false],
            ] as const).map(([k, label, defaultOn]) => {
              const v = form[k as keyof typeof form];
              const checked = typeof v === "boolean" ? v : defaultOn;
              return (
                <label key={k} className="flex items-center gap-3 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setForm({ ...form, [k]: e.target.checked })}
                    className="h-4 w-4 rounded accent-gold-500"
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-6 border-t border-neutral-200 dark:border-neutral-800 pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
            Print Size & Font Scale
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Print Size</label>
                <div className="flex gap-2">
                  {([
                    { v: "small", label: "Small", pct: "90%" },
                    { v: "medium", label: "Medium", pct: "100%" },
                    { v: "large", label: "Large", pct: "110%" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setPrintScaleState(opt.v)}
                      className={
                        "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition " +
                        (printScale === opt.v
                          ? "border-gold-500 bg-gold-500/10 text-gold-700 dark:text-gold-300"
                          : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800")
                      }
                    >
                      <div>{opt.label}</div>
                      <div className="text-xs opacity-70">{opt.pct}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-2">
                  Scales receipt content only. Paper width stays 80mm.
                </p>
              </div>

              {([
                { label: "Customer Bill Font Size", value: billFont, bump: bumpBill, reset: () => setBillFontState(1),
                  hint: "Affects Customer Bill, Merchant Copy, Reprint Bill, and Bill Preview only." },
                { label: "Kitchen KOT Font Size", value: kotFont, bump: bumpKot, reset: () => setKotFontState(1),
                  hint: "Affects Kitchen Order Ticket, Duplicate KOT, and KOT Preview only." },
              ] as const).map((row) => (
                <div key={row.label}>
                  <label className="block text-sm font-medium mb-2">{row.label}</label>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={() => row.bump(-FONT_SCALE_BOUNDS.step)}
                      disabled={row.value <= FONT_SCALE_BOUNDS.min} aria-label="Decrease">
                      <Minus className="h-4 w-4" />
                    </Button>
                    <div className="flex-1 text-center px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 font-mono text-sm">
                      {Math.round(row.value * 100)}%
                    </div>
                    <Button variant="secondary" onClick={() => row.bump(FONT_SCALE_BOUNDS.step)}
                      disabled={row.value >= FONT_SCALE_BOUNDS.max} aria-label="Increase">
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" onClick={row.reset}>Reset</Button>
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">{row.hint}</p>
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium mb-2">Print Preview</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={previewBill}
                      onChange={(e) => setPreviewBillState(e.target.checked)}
                      className="h-4 w-4 rounded accent-gold-500" />
                    <span>Enable Bill Print Preview</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={previewKot}
                      onChange={(e) => setPreviewKotState(e.target.checked)}
                      className="h-4 w-4 rounded accent-gold-500" />
                    <span>Enable KOT Print Preview</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Preview</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPreviewType("bill")}
                    className={"flex-1 px-3 py-2 rounded-lg border text-sm font-medium " +
                      (previewType === "bill" ? "border-gold-500 bg-gold-500/10"
                        : "border-neutral-200 dark:border-neutral-700")}>
                    Customer Bill
                  </button>
                  <button type="button" onClick={() => setPreviewType("kot")}
                    className={"flex-1 px-3 py-2 rounded-lg border text-sm font-medium " +
                      (previewType === "kot" ? "border-gold-500 bg-gold-500/10"
                        : "border-neutral-200 dark:border-neutral-700")}>
                    KOT
                  </button>
                </div>
              </div>
            </div>


            <div>
              <label className="block text-sm font-medium mb-2">Live Preview</label>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 p-3 flex justify-center overflow-auto">
                <iframe
                  title="Print preview"
                  srcDoc={previewHtml}
                  className="bg-white shadow-sm"
                  style={{
                    width: form.printerSize === "a4" ? "210mm" : form.printerSize === "58mm" ? "58mm" : "80mm",
                    height: "520px",
                    border: 0,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>




      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="lg" onClick={save}>
          <Save className="h-4 w-4" /> Save Settings
        </Button>
      </div>

      <Card>
        <h3 className="font-semibold mb-4">Backup & Restore</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Export all data (including your logo) to a JSON file or restore from a previous backup.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportBackup}>
            <Download className="h-4 w-4" /> Export Backup
          </Button>
          <Button variant="outline" onClick={importBackup}>
            <UploadCloud className="h-4 w-4" /> Import Backup
          </Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onImport} />
          <Button variant="danger" onClick={reset}>
            <RotateCcw className="h-4 w-4" /> Reset &amp; Reseed
          </Button>
          {isSuperAdmin(user?.role) && (
            <Button
              variant="danger"
              onClick={() => (window.location.hash = "#/reset-system")}
              title="Open the dedicated Reset System page (Super Admin only)"
            >
              <Trash2 className="h-4 w-4" /> Reset System
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold mb-1">Database Tools</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Maintenance utilities that fix legacy data in the cloud database.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const res = Store.dedupeBaseCategories();
              if (res.mergedCategories === 0) {
                toast.push("No duplicate categories found", "info");
                return;
              }
              if (user)
                Store.addAudit({
                  userId: user.id,
                  userName: user.name,
                  action: "DEDUPE_CATEGORIES",
                  details: `Merged ${res.mergedCategories} duplicate categor${res.mergedCategories === 1 ? "y" : "ies"}; moved ${res.movedItems} item(s)`,
                });
              toast.push(
                `Merged ${res.mergedCategories} duplicate categor${res.mergedCategories === 1 ? "y" : "ies"}, moved ${res.movedItems} item(s)`,
                "success"
              );
            }}
          >
            <Wand2 className="h-4 w-4" /> Remove Duplicate Categories
          </Button>
        </div>
      </Card>



      <Card>
        <h3 className="font-semibold mb-4">Audit Log</h3>
        <p className="text-xs text-neutral-500 mb-3">Last 50 actions</p>
        <div className="max-h-96 overflow-y-auto -mx-5 px-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.slice(0, 50).map((a) => (
                <tr key={a.id}>
                  <td className="text-xs whitespace-nowrap">{new Date(a.timestamp).toLocaleString()}</td>
                  <td className="text-xs">{a.userName}</td>
                  <td>
                    <Badge tone="gold">{a.action}</Badge>
                  </td>
                  <td className="text-xs">{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
