import "server-only";
import ExcelJS from "exceljs";
import type { Affiliate } from "./service";
import { CONTENT_TYPE_LABEL } from "@/lib/samples/analysis";
import { LINE_STATES } from "@/lib/samples/states";

const profile = (u: string) => `https://www.tiktok.com/@${u}`;
const MONEY = "#,##0.00";

function sheet(wb: ExcelJS.Workbook, name: string, cols: { header: string; key: string; width: number; money?: boolean }[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.money ? { numFmt: MONEY } : {} }));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F6" } };
  head.alignment = { vertical: "middle", wrapText: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

/** SKUs an affiliate sold and/or received as samples, merged (case-insensitive). */
export function mergedSkuRows(a: Affiliate) {
  const sampled = new Map<string, { qty: number; name: string }>();
  for (const l of a.lines) {
    if (!l.sku) continue;
    const k = l.sku.toUpperCase();
    sampled.set(k, { qty: (sampled.get(k)?.qty ?? 0) + l.quantity, name: l.name ?? l.variation ?? l.sku });
  }
  const rows = a.skus.map((s) => ({ sku: s.sku, name: s.name, sampled: sampled.get(s.key)?.qty ?? 0, orders: s.orders, qty: s.qty, gmv: s.gmv, video: s.videoGmv, live: s.liveGmv }));
  const have = new Set(a.skus.map((s) => s.key));
  for (const [k, v] of sampled) if (!have.has(k)) rows.push({ sku: k, name: v.name, sampled: v.qty, orders: 0, qty: 0, gmv: 0, video: 0, live: 0 });
  return rows;
}

/** Workbook with three sheets: affiliates, sales by SKU and samples. */
export async function buildAffiliateWorkbook(items: Affiliate[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Affiliate HQ";

  const a = sheet(wb, "Affiliates", [
    { header: "Username", key: "u", width: 24 },
    { header: "TikTok profile", key: "link", width: 34 },
    { header: "WhatsApp", key: "phone", width: 17 },
    { header: "Type", key: "type", width: 13 },
    { header: "Orders", key: "orders", width: 9 },
    { header: "GMV (RM)", key: "gmv", width: 13, money: true },
    { header: "Video GMV (RM)", key: "v", width: 15, money: true },
    { header: "LIVE GMV (RM)", key: "l", width: 15, money: true },
    { header: "Samples received", key: "n", width: 11 },
    { header: "Sample items", key: "items", width: 46 },
    { header: "GMV from samples (RM)", key: "fs", width: 16, money: true },
    { header: "Orders from samples", key: "fso", width: 11 },
    { header: "Recommended action", key: "act", width: 32 },
    { header: "Action details", key: "actd", width: 60 },
    { header: "Samples to offer (not received or sold in loaded data)", key: "sug", width: 50 },
  ]);
  const s = sheet(wb, "Sales by SKU", [
    { header: "Username", key: "u", width: 24 },
    { header: "SKU", key: "sku", width: 28 },
    { header: "Product", key: "name", width: 46 },
    { header: "Sample qty received", key: "sampled", width: 12 },
    { header: "Orders", key: "orders", width: 9 },
    { header: "Items sold", key: "qty", width: 10 },
    { header: "GMV (RM)", key: "gmv", width: 13, money: true },
    { header: "Video GMV (RM)", key: "v", width: 15, money: true },
    { header: "LIVE GMV (RM)", key: "l", width: 15, money: true },
  ]);
  const m = sheet(wb, "Samples", [
    { header: "Username", key: "u", width: 24 },
    { header: "SKU", key: "sku", width: 28 },
    { header: "Product", key: "name", width: 40 },
    { header: "Bundle contains", key: "parts", width: 50 },
    { header: "Qty", key: "qty", width: 6 },
    { header: "Approved", key: "appr", width: 12 },
    { header: "Shipped", key: "ship", width: 12 },
    { header: "Delivered", key: "deliv", width: 12 },
    { header: "Post by", key: "due", width: 12 },
    { header: "Status", key: "status", width: 24 },
    { header: "Videos with this product", key: "vids", width: 11 },
    { header: "Views", key: "views", width: 10 },
    { header: "GMV from sample content (RM)", key: "gmv", width: 16, money: true },
    { header: "Orders from sample content", key: "ord", width: 11 },
    { header: "Video links", key: "links", width: 60 },
  ]);

  for (const x of items) {
    a.addRow({
      u: x.username,
      link: { text: profile(x.username), hyperlink: profile(x.username) },
      phone: x.phone ?? "",
      type: x.type ? CONTENT_TYPE_LABEL[x.type] : "",
      orders: x.orders,
      gmv: x.gmv,
      v: x.videoGmv,
      l: x.liveGmv,
      n: x.samples,
      items: x.lines.map((l) => `${l.name ?? l.variation ?? l.sku} ×${l.quantity}`).join("; "),
      fs: x.samples ? x.fromSamplesGmv : "",
      fso: x.samples ? x.fromSamplesOrders : "",
      act: x.action?.label ?? "",
      actd: x.action?.text ?? "",
      sug: x.suggest.join(", "),
    });
    for (const r of mergedSkuRows(x)) s.addRow({ u: x.username, sku: r.sku, name: r.name, sampled: r.sampled || "", orders: r.orders, qty: r.qty, gmv: r.gmv, v: r.video, l: r.live });
    for (const l of x.lines) {
      const mine = l.videos.filter((v) => v.product);
      const shown = mine.length ? mine : l.videos;
      m.addRow({
        u: x.username,
        sku: l.sku ?? "",
        name: l.name ?? l.variation ?? "",
        parts: l.parts.map((p) => `${p.qty}× ${p.name}`).join(", "),
        qty: l.quantity,
        appr: l.approvedAt ?? "",
        ship: l.shippedAt ?? "",
        deliv: l.deliveredAt ?? "",
        due: l.dueAt ?? "",
        status: LINE_STATES[l.state].label,
        vids: mine.length || l.videoCount,
        views: l.contentViews,
        gmv: l.contentGmv,
        ord: l.contentOrders,
        links: shown.map((v) => v.link).filter(Boolean).join("\n"),
      });
    }
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** One empty "WhatsApp" column for staff to fill in and upload back in the Data hub. */
export async function buildMissingContactsWorkbook(
  list: { username: string; samples: number; gmv: number; orders: number }[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = sheet(wb, "WhatsApp numbers", [
    { header: "Username", key: "u", width: 28 },
    { header: "WhatsApp", key: "phone", width: 20 },
    { header: "TikTok profile", key: "link", width: 36 },
    { header: "Samples", key: "samples", width: 10 },
    { header: "GMV (RM)", key: "gmv", width: 14, money: true },
  ]);
  for (const r of list) ws.addRow({ u: r.username, phone: "", link: { text: profile(r.username), hyperlink: profile(r.username) }, samples: r.samples, gmv: r.gmv });
  // WhatsApp numbers must stay text so leading zeros / country codes are not lost
  ws.getColumn("phone").numFmt = "@";
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
