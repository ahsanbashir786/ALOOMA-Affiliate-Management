import ExcelJS from "exceljs";
import { can, getCurrentUser } from "@/lib/auth";
import { loadProfit } from "@/lib/profit/data";
import { inPeriod, resolvePeriod } from "@/lib/profit/period";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (!can(user, "profit")) return new Response("Your role cannot open this", { status: 403 });
  const u = new URL(req.url);
  const period = resolvePeriod(u.searchParams.get("range") ?? undefined, u.searchParams.get("from") ?? undefined, u.searchParams.get("to") ?? undefined);
  const data = await loadProfit();
  const rows = data.rows.filter((r) => inPeriod(r.day, period));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Order Profit", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  const cols: [string, string, number, boolean][] = [
    ["Order", "orderId", 24, false], ["Day Sold", "day", 12, false], ["Month Sold", "month", 11, false], ["Status", "status", 16, false], ["Sample", "sample", 8, false], ["SKUs", "skus", 40, false], ["Pieces", "pieces", 8, false],
    ["Money", "money", 22, false], ["Paid On", "paidAt", 12, false], ["Sales", "sales", 12, true], ["Commission", "commission", 12, true], ["Affiliate Commission", "affiliate", 12, true], ["Ads Top-Up", "adFee", 12, true],
    ["Shipping Deducted", "shipping", 12, true], ["Other Fees", "otherFees", 12, true], ["Reimbursements", "reimbursement", 12, true], ["Deductions", "deduction", 12, true], ["Settlement", "settlement", 13, true],
    ["Product Cost", "cost", 12, true], ["Fulfilment", "fulfilment", 12, true], ["Profit Before Ads", "profit", 14, true],
  ];
  ws.columns = cols.map(([header, key, width, money]) => ({ header, key, width, style: money ? { numFmt: "#,##0.00" } : {} }));
  const head = ws.getRow(1);
  head.font = { bold: true }; head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F6" } };
  const MONEY: Record<string, string> = { paid: "Paid", processing: "Settled, Not Paid Yet", estimate: "Estimate", none: "No Money Data Yet" };
  for (const r of rows) ws.addRow({ ...r, sample: r.isSample ? "Yes" : "", money: MONEY[r.money], paidAt: r.paidAt ? r.paidAt.slice(0, 10) : "", profit: r.profitBeforeAds });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="order-profit-${period.from ?? "all"}-${period.to ?? "today"}.xlsx"` } });
}
