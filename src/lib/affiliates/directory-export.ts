import "server-only";
import ExcelJS from "exceljs";
import type { DirRow } from "@/lib/workflow/directory";
import { ACTION_HINT } from "./status";

const MONEY = "#,##0.00";

/** One row per creator × sampled product – the same lines, status and action as the Affiliate Data Management table. */
export async function buildDirectoryWorkbook(items: DirRow[], dataEnd: string | null): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Affiliate HQ";
  const ws = wb.addWorksheet("Affiliate data", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  const cols = [
    { header: "Username", key: "u", width: 24 }, { header: "TikTok profile", key: "link", width: 34 }, { header: "WhatsApp", key: "phone", width: 17 },
    { header: "Type", key: "type", width: 13 }, { header: "Last contacted", key: "lc", width: 14 }, { header: "Promise overdue", key: "od", width: 10 },
    { header: "Sample product", key: "p", width: 40 }, { header: "SKU", key: "sku", width: 30 },
    { header: "Orders", key: "o", width: 9 }, { header: "Orders – video", key: "ov", width: 10 }, { header: "Orders – LIVE", key: "ol", width: 10 },
    { header: "GMV (RM)", key: "g", width: 13, money: true }, { header: "GMV – video (RM)", key: "gv", width: 15, money: true }, { header: "GMV – LIVE (RM)", key: "gl", width: 15, money: true },
    { header: "Videos", key: "v", width: 8 }, { header: "Videos, last 28 days", key: "v28", width: 11 }, { header: "Last video", key: "lv", width: 13 },
    { header: "Status", key: "st", width: 11 }, { header: "Why", key: "why", width: 44 }, { header: "Action", key: "ac", width: 10 }, { header: "What to do", key: "hint", width: 26 },
    { header: "Total GMV (RM)", key: "t", width: 15, money: true },
  ];
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.money ? { numFmt: MONEY } : {} }));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F6" } };
  head.alignment = { vertical: "middle", wrapText: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  for (const r of items) {
    for (const l of r.lines) {
      ws.addRow({
        u: r.username, link: { text: `tiktok.com/@${r.username}`, hyperlink: `https://www.tiktok.com/@${r.username}` }, phone: r.phone ?? "", type: r.type ?? "",
        lc: r.lastContactedOn ?? "", od: r.overdue ? "Yes" : "", p: l.noSample ? "" : l.name, sku: l.skus.join(", "),
        o: l.orders, ov: l.ordersVideo, ol: l.ordersLive, g: l.gmv, gv: l.gmvVideo, gl: l.gmvLive,
        v: l.videos, v28: l.videos28, lv: l.lastVideoOn ?? "", st: l.status, why: l.reason, ac: l.action, hint: ACTION_HINT[l.action], t: r.gmvAll,
      });
    }
  }
  const note = wb.addWorksheet("About");
  note.addRows([
    ["Valid orders only (cancelled and returned are excluded)."],
    ["Orders, GMV and videos are per product (all its sizes together). V = from videos, L = from LIVE."],
    [`“Lately” = the latest 28 days of orders held${dataEnd ? `, ending ${dataEnd}` : ""}.`],
    ["Status and Action are worked out for each product line separately."],
  ]);
  note.getColumn(1).width = 100;
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
