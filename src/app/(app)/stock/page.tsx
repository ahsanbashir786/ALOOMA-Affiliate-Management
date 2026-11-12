import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Boxes, CalendarClock, Layers, PackageOpen, Search, Upload, Wallet } from "lucide-react";
import { gate } from "@/lib/gate";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Td, Th, buttonClasses } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { TabLinks } from "@/components/ui/tab-links";
import { ImportBoard, type ImportCardInfo } from "@/components/stock/import-board";
import { RemoveOrder } from "@/components/stock/remove-order";
import { bundleList, stockOverview, type Overview } from "@/lib/stock/overview";
import { fmtInt, fmtRM } from "@/lib/utils";
import { fmtDayLabel } from "@/lib/time";
import { href, one, type SP } from "@/lib/url";

export const metadata: Metadata = { title: "Stock And Costing" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "stock", label: "Stock On Hand", icon: Boxes },
  { key: "orders", label: "Stock-In Orders", icon: PackageOpen },
  { key: "bundles", label: "Bundles", icon: Layers },
  { key: "import", label: "Import Files", icon: Upload },
] as const;
type Tab = (typeof TABS)[number]["key"];

const money = (n: number | null) => (n == null ? "–" : fmtRM(n, 2));

export default async function StockPage({ searchParams }: PageProps<"/stock">) {
  const { denied } = await gate("stock", "Stock And Costing");
  if (denied) return denied;
  const sp = (await searchParams) as SP;
  const tab: Tab = TABS.some((t) => t.key === one(sp.tab)) ? (one(sp.tab) as Tab) : "stock";
  const ov = await stockOverview();
  const empty = ov.counts.orders === 0;
  const q = (one(sp.q) ?? "").trim();
  const family = one(sp.family) ?? "";

  return (
    <div className="space-y-5">
      <PageHeader title="Stock And Costing" description="Every stock-in order, the real cost of each piece, and the stock left after sales. Cost is worked out First In, First Out." />
      <TabLinks label="Stock sections" items={TABS.map((t) => ({ href: href("/stock", { tab: t.key === "stock" ? undefined : t.key }), label: t.label, icon: t.icon, active: tab === t.key, testId: `stock-tab-${t.key}` }))} />

      {tab !== "import" && !empty && <Tiles ov={ov} />}
      {tab === "stock" && (empty ? <Empty /> : <StockTable ov={ov} q={q} family={family} />)}
      {tab === "orders" && (empty ? <Empty /> : <OrdersTable ov={ov} />)}
      {tab === "bundles" && <Bundles q={q} />}
      {tab === "import" && <ImportBoard cards={importCards(ov)} nextOrder={String(Math.max(30, ...ov.orders.map((o) => parseInt(o.orderNo, 10)).filter((n) => Number.isFinite(n))) + 1)} />}
    </div>
  );
}

function Empty() {
  return (
    <Card>
      <EmptyState icon={<Upload className="size-5" />} title="No stock imported yet" description="Import your SKU list, bundles, order costing, dates and opening stock. It takes a minute." action={<Link href="/stock?tab=import" className={buttonClasses({ variant: "primary" })}>Import Files</Link>} />
    </Card>
  );
}

function Tiles({ ov }: { ov: Overview }) {
  const t = ov.tiles;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="stock-tiles">
      <StatTile icon={Boxes} label="Pieces In Stock" value={fmtInt(t.onHand)} note="After TikTok sales only" />
      <StatTile icon={Wallet} label="Stock Value" value={fmtRM(t.value)} note="At real cost per piece" tone="good" />
      <StatTile icon={PackageOpen} label="Stock-In Orders" value={fmtInt(t.orders)} note={`Landed cost ${fmtRM(t.landed)}`} tone="neutral" />
      <StatTile icon={t.shortPieces ? AlertTriangle : CalendarClock} label={t.shortPieces ? "Sold With No Stock Found" : "Estimated Arrival Dates"} value={fmtInt(t.shortPieces || t.estimated)} note={t.shortPieces ? "Pieces costed at the nearest known cost" : "Only the month is known"} tone={t.shortPieces ? "warn" : "neutral"} />
    </div>
  );
}

function StockTable({ ov, q, family }: { ov: Overview; q: string; family: string }) {
  const families = [...new Set(ov.skus.map((s) => s.family).filter((f): f is string => !!f))].sort();
  const needle = q.toLowerCase();
  const rows = ov.skus.filter((r) => (!family || r.family === family) && (!needle || r.sku.toLowerCase().includes(needle) || (r.name ?? "").toLowerCase().includes(needle)));
  return (
    <Card>
      <CardHeader title="Stock By SKU" description="Received, sold on TikTok, and what is left. Shopee and FBS sales are not counted yet." action={
        <form className="flex flex-wrap items-center gap-2" action="/stock">
          <div className="relative"><Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-ink-3" /><input name="q" defaultValue={q} placeholder="Search SKU or name" className="h-9 w-56 rounded-md border border-line-strong bg-surface pl-8 text-[14px] placeholder:text-ink-3 focus:border-brand" /></div>
          <select name="family" defaultValue={family} className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-[14px]"><option value="">All Products</option>{families.map((f) => <option key={f}>{f}</option>)}</select>
          <button className={buttonClasses({ variant: "secondary" })}>Filter</button>
        </form>
      } />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse" data-testid="stock-table">
          <thead><tr><Th>SKU</Th><Th>Product</Th><Th align="right">Received</Th><Th align="right">Sold</Th><Th className="w-44">Left In Stock</Th><Th align="right">Cost Per Piece</Th><Th align="right">Stock Value</Th><Th>Oldest Order Left</Th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.received ? Math.max(0, Math.min(1, r.onHand / r.received)) : 0;
              return (
                <tr key={r.sku} className="hover:bg-surface-2/60">
                  <Td><Link href={`/stock/${encodeURIComponent(r.sku)}`} className="font-medium text-brand hover:underline">{r.sku}</Link></Td>
                  <Td className="text-ink-2">{r.name ?? "–"}</Td>
                  <Td align="right">{fmtInt(r.received)}</Td>
                  <Td align="right">{fmtInt(r.sold)}{r.short > 0 && <Badge tone="warn" className="ml-1.5">{fmtInt(r.short)} Short</Badge>}</Td>
                  <Td><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand" style={{ width: `${pct * 100}%` }} /></div><span className="tnum text-[13px] text-ink-2">{fmtInt(r.onHand)}</span></div></Td>
                  <Td align="right">{money(r.avgCost)}</Td>
                  <Td align="right">{fmtRM(r.value)}</Td>
                  <Td className="text-ink-2">{r.oldestOrder ? (r.oldestOrder === "OPENING" ? "Opening Stock" : `Order ${r.oldestOrder}`) : "–"}</Td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8}><EmptyState title="No SKU matches" description="Try a different search." /></td></tr>}
          </tbody>
        </table>
      </div>
      {ov.unknown.length > 0 && (
        <div className="border-t border-line p-4" data-testid="stock-unknown">
          <p className="text-[13.5px] font-medium text-ink">TikTok SKUs That Are Not In Your Stock List</p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">These sold pieces have no cost until the SKU is added to the SKU list or a bundle.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{ov.unknown.map((u) => <Badge key={u.sku} tone="warn">{u.sku} · {fmtInt(u.pieces)}</Badge>)}</div>
        </div>
      )}
    </Card>
  );
}

function OrdersTable({ ov }: { ov: Overview }) {
  return (
    <Card>
      <CardHeader title="Stock-In Orders" description="Oldest first. The landed cost is the product price plus freight, counted on paid pieces only. Free pieces cost nothing." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse" data-testid="orders-table">
          <thead><tr><Th>Order</Th><Th>Purchased</Th><Th>Arrived</Th><Th align="right">Paid</Th><Th align="right">Free</Th><Th align="right">Product Cost</Th><Th align="right">Freight</Th><Th align="right">Landed Cost</Th><Th align="right">Per Piece</Th><Th align="right">Left In Stock</Th><Th /></tr></thead>
          <tbody>
            {ov.orders.map((o) => (
              <tr key={o.orderNo} className="hover:bg-surface-2/60">
                <Td className="font-medium">{o.kind === "opening" ? "Opening Stock" : `Order ${o.orderNo}`}<span className="ml-2 text-[12px] font-normal text-ink-3">{o.skuCount} SKUs</span></Td>
                <Td className="text-ink-2">{o.purchaseDate ? fmtDayLabel(o.purchaseDate) + " " + o.purchaseDate.slice(0, 4) : "–"}</Td>
                <Td>{o.arrival ? <span className="inline-flex items-center gap-1.5">{fmtDayLabel(o.arrival)} {o.arrival.slice(0, 4)}{o.kind === "order" && <Badge tone={o.exact ? "good" : "warn"} className="ml-0.5">{o.exact ? "Exact" : "Estimated"}</Badge>}</span> : <Badge tone="critical">No Date</Badge>}</Td>
                <Td align="right">{fmtInt(o.paid)}</Td>
                <Td align="right">{fmtInt(o.free)}</Td>
                <Td align="right">{o.kind === "opening" ? "–" : fmtRM(o.productRm)}</Td>
                <Td align="right">{o.kind === "opening" ? "–" : fmtRM(o.freightRm)}</Td>
                <Td align="right">{fmtRM(o.landed)}</Td>
                <Td align="right">{money(o.perPiece)}</Td>
                <Td align="right">{fmtInt(o.left)}</Td>
                <Td align="right">{o.source === "app" && <RemoveOrder orderNo={o.orderNo} />}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function Bundles({ q }: { q: string }) {
  const all = await bundleList();
  const needle = q.toLowerCase();
  const list = all.filter((b) => !needle || b.setSku.toLowerCase().includes(needle) || (b.name ?? "").toLowerCase().includes(needle));
  if (!all.length) return <Card><EmptyState icon={<Layers className="size-5" />} title="No bundles imported yet" description="Import the Set SKU lists so a bundle can take stock from each of its parts." action={<Link href="/stock?tab=import" className={buttonClasses({ variant: "primary" })}>Import Files</Link>} /></Card>;
  return (
    <Card>
      <CardHeader title="Bundles" description="A bundle sells as one order. Stock is taken from each part. The Shopee FBS code of a bundle uses the same parts." action={
        <form action="/stock" className="flex items-center gap-2"><input type="hidden" name="tab" value="bundles" /><div className="relative"><Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-ink-3" /><input name="q" defaultValue={q} placeholder="Search bundle" className="h-9 w-56 rounded-md border border-line-strong bg-surface pl-8 text-[14px] placeholder:text-ink-3 focus:border-brand" /></div><button className={buttonClasses({ variant: "secondary" })}>Search</button></form>
      } />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse" data-testid="bundles-table">
          <thead><tr><Th>Bundle SKU</Th><Th>Name</Th><Th>Parts Taken From Stock</Th></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.setSku} className="hover:bg-surface-2/60">
                <Td className="font-medium whitespace-nowrap">{b.setSku}{b.fbsSku && <span className="ml-2 text-[12px] font-normal text-ink-3">FBS: {b.fbsSku}</span>}</Td>
                <Td className="text-ink-2">{b.name ?? "–"}</Td>
                <Td><div className="flex flex-wrap gap-1.5">{b.parts.map((p) => <Badge key={p.sku} tone="brand">{p.qty} × {p.sku}</Badge>)}</div></Td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={3}><EmptyState title="No bundle matches" /></td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function importCards(ov: Overview): ImportCardInfo[] {
  const c = ov.counts;
  const xlsx = ".xlsx";
  return [
    { kind: "skus", step: 1, title: "SKU List", help: "The list of single items (A. List of SKU Single Items). Gives every SKU its name. You can choose several files at once.", accept: xlsx, multiple: true, status: c.skus ? `${c.skus} ${c.skus === 1 ? "SKU" : "SKUs"}` : null },
    { kind: "bundles", step: 2, title: "Bundle Lists", help: "The three Set SKU / BOM files together (Other Products, NWP Bedsheets, WP Bedsheets). Choose all of them at once.", accept: xlsx, multiple: true, status: c.bundles ? `${c.bundles} ${c.bundles === 1 ? "bundle" : "bundles"}` : null },
    { kind: "costing", step: 3, title: "Order Costing", help: "ALOOMA All Order Costing. Gives every order's pieces and landed cost per piece.", accept: xlsx, status: c.orders ? `${c.orders} ${c.orders === 1 ? "order" : "orders"}` : null },
    { kind: "dates", step: 4, title: "Order Dates", help: "Order Inbound and Purchase Dates. Gives the purchase date and the arrival date of every order.", accept: xlsx, status: ov.orders.some((o) => o.arrival) ? "Dates added" : null },
    { kind: "opening", step: 5, title: "Opening Stock", help: "The warehouse inventory report for the last month before the first costed order arrived (May 2025). Costed like order 1B. You can choose several files at once; they are added together.", accept: xlsx, multiple: true, status: c.opening ? `${fmtInt(c.opening)} pieces` : null },
  ];
}
