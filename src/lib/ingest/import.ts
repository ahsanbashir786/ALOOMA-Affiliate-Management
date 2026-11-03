import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  creatorListSnapshots,
  creatorTxnSnapshots,
  orderLines,
  productSnapshots,
  products,
  samples,
  sampleSnapshots,
  skuBom,
  skuItems,
  creators,
  shopOrderLines,
  uploads,
  videoSnapshots,
  videos,
} from "@/db/schema";
import { SNAPSHOT_KINDS, type Kind } from "./kinds";
import {
  chunk,
  idStr,
  int,
  isDescriptionRow,
  num,
  numOrNull,
  parseDMY,
  parseMDY,
  pct,
  pick,
  shortProductName,
  str,
  toObjects,
  type RowObj,
} from "./parse-utils";
import type { Cell, RawTab } from "./read-xlsx";
import { parseSkuWorkbook } from "@/lib/samples/sku";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** The database transaction of the import in progress – importers write through it so a failed import changes nothing. */
const txStore = new AsyncLocalStorage<Tx>();
const D = () => (txStore.getStore() ?? db) as typeof db;

export type ImportInput = {
  kind: Kind;
  filename: string;
  header: string[];
  rows: Cell[][];
  periodStart: string | null;
  periodEnd: string | null;
  userId?: string | null;
  /** Every tab of the workbook – only for multi-tab kinds (SKU lists, staff sheet). */
  tabs?: RawTab[];
};

export type ImportResult = {
  uploadId: number;
  /** added + updated */
  imported: number;
  /** rows not used: rejected (invalid) rows plus rows older than what is already known */
  skipped: number;
  replacedUploads: number;
  notes: string[];
  added?: number;
  updated?: number;
  /** rows ignored because the file is older than the data already loaded for them */
  skippedOlder?: number;
  /** invalid rows, by reason */
  rejected?: Record<string, number>;
  warnings?: string[];
  coverage?: { start: string | null; end: string | null };
};

const sumOf = (r: Record<string, number> | undefined) => Object.values(r ?? {}).reduce((a, b) => a + b, 0);

const PARAM_LIMIT = 60_000;
const chunkSizeFor = (cols: number) => Math.max(1, Math.floor(PARAM_LIMIT / cols));

/** Drops the help-text row TikTok puts under the headers. */
function dataRows(rows: Cell[][]): Cell[][] {
  return rows.length && isDescriptionRow(rows[0]) ? rows.slice(1) : rows;
}

/** A snapshot for the same kind + period replaces the previous one. */
async function replaceExisting(kind: Kind, start: string, end: string): Promise<number> {
  const res = await D()
    .delete(uploads)
    .where(and(eq(uploads.kind, kind), eq(uploads.periodStart, start), eq(uploads.periodEnd, end)))
    .returning({ id: uploads.id });
  return res.length;
}

async function createUpload(input: ImportInput, rowCount: number, summary: object) {
  const [u] = await D()
    .insert(uploads)
    .values({
      kind: input.kind,
      filename: input.filename,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      rowCount,
      summary,
      uploadedBy: input.userId ?? null,
    })
    .returning({ id: uploads.id });
  return u.id;
}

/**
 * Imports one file as a single all-or-nothing transaction: if anything fails, nothing is changed
 * (including the replacement of an earlier snapshot of the same period).
 */
export async function importFile(input: ImportInput): Promise<ImportResult> {
  return db.transaction(async (tx) =>
    txStore.run(tx as unknown as Tx, async () => {
      const res = await runImporter(input);
      const warnings = [...(res.warnings ?? [])];
      if (res.replacedUploads > 0) {
        warnings.push(`Replaced ${res.replacedUploads} earlier upload${res.replacedUploads === 1 ? "" : "s"} of the same report and period (the most recent file wins).`);
      }
      if (SNAPSHOT_KINDS.includes(input.kind) && input.periodStart && input.periodEnd) {
        const overlaps = (await D().execute(sql`
          select to_char(period_start, 'YYYY-MM-DD') as s, to_char(period_end, 'YYYY-MM-DD') as e from uploads
          where kind = ${input.kind} and id <> ${res.uploadId} and period_start <= ${input.periodEnd}::date and period_end >= ${input.periodStart}::date
            and not (period_start = ${input.periodStart}::date and period_end = ${input.periodEnd}::date)`)) as unknown as { s: string; e: string }[];
        if (overlaps.length) {
          warnings.push(`This period overlaps ${overlaps.map((o) => `${o.s} – ${o.e}`).join(", ")} from earlier uploads of the same report. Reports use the best-matching file and never add overlapping reports together.`);
        }
      }
      const result: ImportResult = {
        ...res,
        added: res.added ?? res.imported,
        updated: res.updated ?? 0,
        skippedOlder: res.skippedOlder ?? 0,
        rejected: res.rejected ?? (res.skipped ? { "rows without the required fields": res.skipped } : {}),
        warnings,
        coverage: res.coverage ?? { start: input.periodStart, end: input.periodEnd },
      };
      await D()
        .update(uploads)
        .set({
          summary: {
            added: result.added,
            updated: result.updated,
            skippedOlder: result.skippedOlder,
            rejected: result.rejected,
            warnings: result.warnings,
          },
        })
        .where(eq(uploads.id, result.uploadId));
      return result;
    }),
  );
}

async function runImporter(input: ImportInput): Promise<ImportResult> {
  switch (input.kind) {
    case "affiliate_orders":
      return importAffiliateOrders(input);
    case "all_orders":
      return importAllOrders(input);
    case "creator_list":
      return importCreatorList(input);
    case "creator_transactions":
      return importCreatorTransactions(input);
    case "video_list":
      return importVideoList(input);
    case "sample_analysis":
      return importSampleAnalysis(input);
    case "product_list":
      return importProductList(input);
    case "sku_catalog":
      return importSkuCatalog(input);
    case "staff_sheet":
      return importStaffSheet(input);
    case "contact_list":
      return importContactList(input);
  }
}

function requirePeriod(input: ImportInput): { start: string; end: string } {
  if (!input.periodStart || !input.periodEnd) throw new Error("A reporting period is required for this file type.");
  if (input.periodStart > input.periodEnd) throw new Error("Period start must be on or before the end date.");
  return { start: input.periodStart, end: input.periodEnd };
}

// ───────────────────────── Affiliate orders ─────────────────────────
async function importAffiliateOrders(input: ImportInput): Promise<ImportResult> {
  const objs = toObjects(input.header, dataRows(input.rows));
  const notes: string[] = [];
  const warnings: string[] = [];
  const rejected: Record<string, number> = {};
  const reject = (why: string) => { rejected[why] = (rejected[why] ?? 0) + 1; };
  let asof: Date | null = null;
  type Line = typeof orderLines.$inferInsert;
  const lines = new Map<string, Line>();
  const productNames = new Map<string, string>();
  let minT: Date | null = null;
  let maxT: Date | null = null;

  for (const r of objs) {
    const orderId = idStr(r["Order ID"]);
    const skuId = idStr(r["SKU ID"]) ?? "";
    const productId = idStr(r["Product ID"]);
    const creator = str(r["Creator Username"]);
    const createdAt = parseDMY(r["Time Created"]);
    if (!orderId || !/^\d+$/.test(orderId)) {
      reject("missing or invalid order ID");
      continue;
    }
    if (!productId) {
      reject("missing product ID");
      continue;
    }
    if (!createdAt) {
      reject("unreadable order date");
      continue;
    }
    if (!minT || createdAt < minT) minT = createdAt;
    if (!maxT || createdAt > maxT) maxT = createdAt;
    const pname = str(r["Product Name"]);
    if (pname && !productNames.has(productId)) productNames.set(productId, pname);

    lines.set(`${orderId}|${skuId}`, {
      orderId,
      skuId,
      productId,
      skuName: str(r["SKU name"]),
      sellerSku: str(r["Seller SKU"]),
      price: num(r["Price"]),
      paymentAmount: num(r["Payment Amount"]),
      quantity: Math.max(1, int(r["Quantity"])),
      fullyRefunded: /^y/i.test(str(r["Fully returned or refunded"]) ?? ""),
      cod: /^cash on delivery$/i.test(str(r["Payment method"]) ?? ""),
      status: str(r["Order Status"]) ?? "Unknown",
      creator: creator ?? "(unknown)",
      contentType: str(r["Content Type"]) ?? "Unknown",
      contentId: idStr(r["Content ID"]),
      commissionModel: str(r["commission model"]),
      commissionRate: str(r["Standard commission rate"]),
      estCommission: num(r["Est. standard commission payment"]),
      actualCommission: num(r["Actual Commission Payment"]),
      estAdsCommission: num(r["Est. Shop Ads commission payment"]),
      actualAdsCommission: num(r["Actual Shop Ads commission payment"]),
      createdAt,
      paidAt: parseDMY(r["Payment time"]),
      deliveredAt: parseDMY(r["Order Delivery Time"]),
      commissionPaidAt: parseDMY(r["Time Commission Paid"]),
    });
    for (const t of [createdAt, parseDMY(r["Payment time"]), parseDMY(r["Order Delivery Time"]), parseDMY(r["Time Commission Paid"])]) {
      if (t && (!asof || t > asof)) asof = t;
    }
  }
  if (!lines.size) {
    const why = Object.entries(rejected).map(([k, v]) => `${v} × ${k}`).join(", ");
    throw new Error(`No valid order lines found in this file${why ? ` (${why})` : ""}. Nothing was imported.`);
  }

  const start = input.periodStart ?? minT!.toISOString().slice(0, 10);
  const end = input.periodEnd ?? maxT!.toISOString().slice(0, 10);
  const uploadId = await createUpload({ ...input, periodStart: start, periodEnd: end }, lines.size, {
    rejected,
    products: productNames.size,
  });
  // Is this file older than what is already loaded?
  const [known] = (await D().execute(sql`select max(asof) as latest from order_lines`)) as unknown as { latest: Date | string | null }[];
  if (known?.latest && asof && new Date(known.latest) > asof) {
    warnings.push(
      `This file looks older than the orders already loaded (its latest activity is ${asof.toISOString().slice(0, 10)}, the loaded data goes to ${new Date(known.latest).toISOString().slice(0, 10)}). Lines that already have newer information were left unchanged.`,
    );
  }

  // Products seen in orders (names also come from the product list).
  const brand = commonBrand([...productNames.values()]);
  if (productNames.size) {
    await D()
      .insert(products)
      .values(
        [...productNames].map(([productId, name]) => ({
          productId,
          name,
          shortName: shortProductName(name, brand),
        })),
      )
      .onConflictDoUpdate({
        target: products.productId,
        set: { name: sql`excluded.name`, updatedAt: sql`now()` },
      });
  }

  const rows = [...lines.values()].map((l) => ({ ...l, uploadId, asof }));
  let added = 0;
  let updated = 0;
  let skippedOlder = 0;
  const size = chunkSizeFor(30);
  for (const part of chunk(rows, size)) {
    const res = await D()
      .insert(orderLines)
      .values(part)
      .onConflictDoUpdate({
        target: [orderLines.orderId, orderLines.skuId],
        set: {
          productId: sql`excluded.product_id`,
          price: sql`excluded.price`,
          paymentAmount: sql`excluded.payment_amount`,
          quantity: sql`excluded.quantity`,
          fullyRefunded: sql`excluded.fully_refunded`,
          cod: sql`excluded.cod`,
          status: sql`excluded.status`,
          creator: sql`excluded.creator`,
          contentType: sql`excluded.content_type`,
          contentId: sql`excluded.content_id`,
          commissionModel: sql`excluded.commission_model`,
          commissionRate: sql`excluded.commission_rate`,
          estCommission: sql`excluded.est_commission`,
          actualCommission: sql`excluded.actual_commission`,
          estAdsCommission: sql`excluded.est_ads_commission`,
          actualAdsCommission: sql`excluded.actual_ads_commission`,
          paidAt: sql`excluded.paid_at`,
          deliveredAt: sql`excluded.delivered_at`,
          commissionPaidAt: sql`excluded.commission_paid_at`,
          asof: sql`excluded.asof`,
          uploadId: sql`excluded.upload_id`,
        },
        // never let an older export overwrite newer information
        setWhere: sql`${orderLines.asof} is null or excluded.asof >= ${orderLines.asof}`,
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    const ins = res.filter((r) => r.inserted).length;
    added += ins;
    updated += res.length - ins;
    skippedOlder += part.length - res.length;
  }
  notes.push(`Orders from ${start} to ${end}. Existing lines are updated in place (status, commission).`);
  const rej = sumOf(rejected);
  return {
    uploadId,
    imported: added + updated,
    skipped: rej + skippedOlder,
    replacedUploads: 0,
    notes,
    added,
    updated,
    skippedOlder,
    rejected,
    warnings,
    coverage: { start, end },
  };
}

function commonBrand(names: string[]): string | null {
  if (names.length < 3) return null;
  const counts = new Map<string, number>();
  for (const n of names) {
    const w = n.replace(/^\{exclusive\}\s*/i, "").split(/\s+/)[0];
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const [word, c] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return c / names.length >= 0.8 ? word : null;
}

// ───────────────────────── All shop orders ─────────────────────────
async function importAllOrders(input: ImportInput): Promise<ImportResult> {
  const objs = toObjects(input.header, dataRows(input.rows));
  type Line = typeof shopOrderLines.$inferInsert;
  const lines = new Map<string, Line>();
  const warnings: string[] = [];
  const rejected: Record<string, number> = {};
  const reject = (why: string) => { rejected[why] = (rejected[why] ?? 0) + 1; };
  let asof: Date | null = null;
  let minT: Date | null = null;
  let maxT: Date | null = null;
  for (const r of objs) {
    const orderId = idStr(r["Order ID"]);
    const createdAt = parseDMY(r["Created Time"]);
    if (!orderId || !/^\d+$/.test(orderId)) {
      reject("missing or invalid order ID");
      continue;
    }
    if (!createdAt) {
      reject("unreadable order date");
      continue;
    }
    const skuId = idStr(r["SKU ID"]) ?? "";
    if (!minT || createdAt < minT) minT = createdAt;
    if (!maxT || createdAt > maxT) maxT = createdAt;
    lines.set(`${orderId}|${skuId}`, {
      orderId,
      skuId,
      status: str(r["Order Status"]) ?? "Unknown",
      substatus: str(r["Order Substatus"]),
      cancelType: str(r["Cancelation/Return Type"]),
      cancelBy: str(r["Cancel By"]),
      cancelReason: str(r["Cancel Reason"]),
      preorder: /pre/i.test(str(r["Normal or Pre-order"]) ?? ""),
      productName: str(r["Product Name"]),
      variation: str(r["Variation"]),
      sellerSku: str(r["Seller SKU"]),
      quantity: Math.max(1, int(r["Quantity"])),
      returnQty: int(r["Sku Quantity of return"]),
      unitPrice: num(r["SKU Unit Original Price"]),
      subtotalBefore: num(r["SKU Subtotal Before Discount"]),
      platformDiscount: num(r["SKU Platform Discount"]),
      sellerDiscount: num(r["SKU Seller Discount"]),
      subtotalAfter: num(r["SKU Subtotal After Discount"]),
      shippingFee: num(r["Shipping Fee After Discount"]),
      orderAmount: num(r["Order Amount"]),
      refundAmount: num(r["Order Refund Amount"]),
      createdAt,
      paidAt: parseDMY(r["Paid Time"]),
      shippedAt: parseDMY(r["Shipped Time"]),
      deliveredAt: parseDMY(r["Delivered Time"]),
      cancelledAt: parseDMY(r["Cancelled Time"]),
      deliveryOption: str(r["Delivery Option"]),
      shippingProvider: str(r["Shipping Provider Name"]),
      paymentMethod: str(r["Payment Method"]),
      state: str(r["State"]),
      category: str(r["Product Category"]),
      orderChannel: str(r["Order Channel"]),
      creator: str(r["Creator Handle"]),
      buyerUsername: str(r["Buyer Username"]),
      trackingId: str(r["Tracking ID"]),
      rtsAt: parseDMY(r["RTS Time"]),
      isSample: isSampleLine(r),
    });
    for (const k of ["Created Time", "Paid Time", "Shipped Time", "Delivered Time", "Cancelled Time"]) {
      const t = parseDMY(r[k]);
      if (t && (!asof || t > asof)) asof = t;
    }
  }
  if (!lines.size) {
    const why = Object.entries(rejected).map(([k, v]) => `${v} × ${k}`).join(", ");
    throw new Error(`No valid order lines found in this file${why ? ` (${why})` : ""}. Nothing was imported.`);
  }
  const start = input.periodStart ?? minT!.toISOString().slice(0, 10);
  const end = input.periodEnd ?? maxT!.toISOString().slice(0, 10);
  const uploadId = await createUpload({ ...input, periodStart: start, periodEnd: end }, lines.size, { rejected });
  const [known] = (await D().execute(sql`select max(asof) as latest from shop_order_lines`)) as unknown as { latest: Date | string | null }[];
  if (known?.latest && asof && new Date(known.latest) > asof) {
    warnings.push(
      `This file looks older than the shop orders already loaded (its latest activity is ${asof.toISOString().slice(0, 10)}, the loaded data goes to ${new Date(known.latest).toISOString().slice(0, 10)}). Lines that already have newer statuses were left unchanged.`,
    );
  }
  const rows = [...lines.values()].map((l) => ({ ...l, uploadId, asof }));
  let added = 0;
  let updated = 0;
  let skippedOlder = 0;
  const written = new Set<string>();
  for (const part of chunk(rows, chunkSizeFor(41))) {
    const res = await D()
      .insert(shopOrderLines)
      .values(part)
      .onConflictDoUpdate({
        target: [shopOrderLines.orderId, shopOrderLines.skuId],
        set: {
          status: sql`excluded.status`,
          substatus: sql`excluded.substatus`,
          cancelType: sql`excluded.cancel_type`,
          cancelBy: sql`excluded.cancel_by`,
          cancelReason: sql`excluded.cancel_reason`,
          returnQty: sql`excluded.return_qty`,
          subtotalAfter: sql`excluded.subtotal_after`,
          platformDiscount: sql`excluded.platform_discount`,
          sellerDiscount: sql`excluded.seller_discount`,
          orderAmount: sql`excluded.order_amount`,
          refundAmount: sql`excluded.refund_amount`,
          paidAt: sql`excluded.paid_at`,
          shippedAt: sql`excluded.shipped_at`,
          deliveredAt: sql`excluded.delivered_at`,
          cancelledAt: sql`excluded.cancelled_at`,
          shippingProvider: sql`excluded.shipping_provider`,
          paymentMethod: sql`excluded.payment_method`,
          orderChannel: sql`excluded.order_channel`,
          creator: sql`excluded.creator`,
          buyerUsername: sql`excluded.buyer_username`,
          trackingId: sql`excluded.tracking_id`,
          rtsAt: sql`excluded.rts_at`,
          isSample: sql`excluded.is_sample`,
          asof: sql`excluded.asof`,
          uploadId: sql`excluded.upload_id`,
        },
        // never let an older export overwrite a newer status
        setWhere: sql`${shopOrderLines.asof} is null or excluded.asof >= ${shopOrderLines.asof}`,
      })
      .returning({ orderId: shopOrderLines.orderId, skuId: shopOrderLines.skuId, inserted: sql<boolean>`(xmax = 0)` });
    const ins = res.filter((r) => r.inserted).length;
    added += ins;
    updated += res.length - ins;
    skippedOlder += part.length - res.length;
    for (const r of res) written.add(`${r.orderId}|${r.skuId}`);
  }
  const sampleCount = await upsertSampleOrders([...lines.values()].filter((l) => l.isSample && written.has(`${l.orderId}|${l.skuId}`)), uploadId);
  const rej = sumOf(rejected);
  return {
    uploadId,
    imported: added + updated,
    skipped: rej + skippedOlder,
    replacedUploads: 0,
    notes: [
      `Shop orders from ${start} to ${end}. Existing lines are updated in place.`,
      ...(sampleCount ? [`${sampleCount} free-sample line${sampleCount === 1 ? "" : "s"} in the sample tracker were added or updated.`] : []),
    ],
    added,
    updated,
    skippedOlder,
    rejected,
    warnings,
    coverage: { start, end },
  };
}

// ───────────────────────── Creator list ─────────────────────────
async function importCreatorList(input: ImportInput): Promise<ImportResult> {
  const { start, end } = requirePeriod(input);
  const objs = toObjects(input.header, dataRows(input.rows));
  const byUser = new Map<string, typeof creatorListSnapshots.$inferInsert>();
  let skipped = 0;
  const replaced = await replaceExisting(input.kind, start, end);
  const uploadId = await createUpload(input, 0, {});
  for (const r of objs) {
    const username = str(r["Creator username"]);
    if (!username) {
      skipped++;
      continue;
    }
    byUser.set(username, {
      uploadId,
      username,
      gmv: num(r["Affiliate GMV"]),
      liveGmv: num(r["Affiliate LIVE GMV"]),
      videoGmv: num(r["Affiliate shoppable video GMV"]),
      cardGmv: num(r["Affiliate product card GMV"]),
      productsSold: int(r["Affiliate products sold"]),
      itemsSold: int(r["Items sold"]),
      commission: num(r["Est. commission"]),
      aov: num(r["Avg. order value"]),
      orders: int(r["Affiliate orders"]),
      ctr: pct(r["CTR"]),
      impressions: int(r["Product impressions"]),
      customers: num(r["Avg. affiliate customers"]),
      liveStreams: int(r["Affiliate LIVE streams"]),
      videos: int(r["Affiliate shoppable videos"]),
      targetGmv: num(r["Target collaboration GMV"]),
      targetCommission: num(r["Target collaboration est. commission"]),
      openGmv: num(r["Open collaboration GMV"]),
      openCommission: num(r["Open collaboration est. commission"]),
      refundedGmv: num(r["Affiliate refunded GMV"]),
      itemsRefunded: int(r["Affiliate items refunded"]),
      followers: int(r["Affiliate followers"]),
    });
  }
  for (const part of chunk([...byUser.values()], chunkSizeFor(23))) {
    await D().insert(creatorListSnapshots).values(part);
  }
  await D().update(uploads).set({ rowCount: byUser.size, summary: { skipped } }).where(eq(uploads.id, uploadId));
  return { uploadId, imported: byUser.size, skipped, replacedUploads: replaced, notes: [] };
}

// ───────────────────────── Transaction analysis ─────────────────────────
async function importCreatorTransactions(input: ImportInput): Promise<ImportResult> {
  const { start, end } = requirePeriod(input);
  const objs = toObjects(input.header, dataRows(input.rows));
  const byUser = new Map<string, typeof creatorTxnSnapshots.$inferInsert>();
  let skipped = 0;
  const replaced = await replaceExisting(input.kind, start, end);
  const uploadId = await createUpload(input, 0, {});
  for (const r of objs) {
    const username = str(r["Creator name"]);
    if (!username) {
      skipped++;
      continue;
    }
    byUser.set(username, {
      uploadId,
      username,
      gmv: num(r["Creator-attributed GMV"]),
      liveGmv: num(r["Creator LIVE-attributed GMV"]),
      videoGmv: num(r["Creator video-attributed GMV"]),
      cardGmv: num(r["Affiliate product card-attributed GMV"]),
      refunds: num(r["Refunds"]),
      orders: int(r["Attributed orders"]),
      itemsSold: int(r["Creator-attributed items sold"]),
      itemsRefunded: int(r["Items refunded"]),
      aov: num(r["AOV"]),
      ctor: pct(r["CTOR"]),
      liveStreams: int(r["LIVE streams"]),
      videos: int(r["Videos"]),
      sampleContent: int(r["Total sample content"]),
      samplesShipped: int(r["Samples shipped"]),
      ctr: pct(r["CTR"]),
      impressions: int(r["Product impressions"]),
      views: int(r["Video views"]),
      customers: numOrNull(pick(r, "Customers", "Avg. daily customers")),
      productsSold: numOrNull(pick(r, "Products sold", "Avg. daily products sold")),
      commission: num(r["Est. commission"]),
    });
  }
  for (const part of chunk([...byUser.values()], chunkSizeFor(22))) {
    await D().insert(creatorTxnSnapshots).values(part);
  }
  await D().update(uploads).set({ rowCount: byUser.size, summary: { skipped } }).where(eq(uploads.id, uploadId));
  return { uploadId, imported: byUser.size, skipped, replacedUploads: replaced, notes: [] };
}

// ───────────────────────── Video list ─────────────────────────
async function importVideoList(input: ImportInput): Promise<ImportResult> {
  const { start, end } = requirePeriod(input);
  const objs = toObjects(input.header, dataRows(input.rows));
  const master = new Map<string, typeof videos.$inferInsert>();
  const snaps = new Map<string, typeof videoSnapshots.$inferInsert>();
  let skipped = 0;
  const replaced = await replaceExisting(input.kind, start, end);
  const uploadId = await createUpload(input, 0, {});

  for (const r of objs) {
    const videoId = idStr(r["Video ID"]);
    const creator = str(r["Creator name"]);
    if (!videoId || !/^\d+$/.test(videoId) || !creator) {
      skipped++;
      continue;
    }
    const pids = (str(r["Product ID"]) ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => /^\d+$/.test(x));
    master.set(videoId, {
      videoId,
      creator,
      postedAt: parseMDY(r["Post date"]),
      link: str(r["Video link"]),
      title: str(r["Video title"]),
      productIds: pids,
    });
    snaps.set(videoId, {
      uploadId,
      videoId,
      gmv: num(r["Creator video-attributed GMV"]),
      orders: int(r["Video-attributed orders"]),
      aov: num(r["AOV"]),
      itemsSold: int(r["Video-attributed items sold"]),
      refunds: num(r["Refunds"]),
      itemsRefunded: int(r["Items refunded"]),
      likes: int(r["Likes"]),
      comments: int(r["Comments"]),
      shares: int(r["Shares"]),
      impressions: int(r["Video product impressions"]),
      clicks: int(r["Video product clicks"]),
      completionRate: pct(r["Completion rate"]),
      views: int(r["Video views"]),
      ctr: pct(pick(r, "CTR", "Avg. daily video product CTR")),
      gpm: numOrNull(pick(r, "Video GPM", "Avg. daily GPM")),
      engagement: pct(pick(r, "Engagement", "Avg. daily engagement")),
      gmvPerCustomer: numOrNull(r["Avg. GMV per customer"]),
      commission: num(r["Est. commission"]),
    });
  }

  for (const part of chunk([...master.values()], chunkSizeFor(6))) {
    await D()
      .insert(videos)
      .values(part)
      .onConflictDoUpdate({
        target: videos.videoId,
        set: {
          creator: sql`excluded.creator`,
          postedAt: sql`coalesce(excluded.posted_at, ${videos.postedAt})`,
          link: sql`coalesce(excluded.link, ${videos.link})`,
          title: sql`coalesce(excluded.title, ${videos.title})`,
          productIds: sql`excluded.product_ids`,
        },
      });
  }
  for (const part of chunk([...snaps.values()], chunkSizeFor(19))) {
    await D().insert(videoSnapshots).values(part);
  }
  await D().update(uploads).set({ rowCount: snaps.size, summary: { skipped } }).where(eq(uploads.id, uploadId));
  return { uploadId, imported: snaps.size, skipped, replacedUploads: replaced, notes: [] };
}

// ───────────────────────── Sample analysis ─────────────────────────
async function importSampleAnalysis(input: ImportInput): Promise<ImportResult> {
  const { start, end } = requirePeriod(input);
  const objs = toObjects(input.header, dataRows(input.rows));
  const byUser = new Map<string, typeof sampleSnapshots.$inferInsert>();
  let skipped = 0;
  const replaced = await replaceExisting(input.kind, start, end);
  const uploadId = await createUpload(input, 0, {});
  for (const r of objs) {
    const username = str(r["Creator name"]);
    if (!username) {
      skipped++;
      continue;
    }
    byUser.set(username, {
      uploadId,
      username,
      contentGmv: num(r["Content GMV"]),
      requested: int(r["Samples requested"]),
      shipped: int(r["Samples shipped"]),
      postingRate: num(r["Posting rate"]),
      videosWithSamples: int(r["Videos with samples"]),
      liveWithSamples: int(r["LIVE streams with samples"]),
      roi45: num(r["45-day ROI"]),
      roi90: num(r["90-day ROI"]),
    });
  }
  for (const part of chunk([...byUser.values()], chunkSizeFor(10))) {
    await D().insert(sampleSnapshots).values(part);
  }
  await D().update(uploads).set({ rowCount: byUser.size, summary: { skipped } }).where(eq(uploads.id, uploadId));
  return { uploadId, imported: byUser.size, skipped, replacedUploads: replaced, notes: [] };
}

// ───────────────────────── Product list ─────────────────────────
async function importProductList(input: ImportInput): Promise<ImportResult> {
  const { start, end } = requirePeriod(input);
  const objs = toObjects(input.header, dataRows(input.rows));
  const rows = new Map<string, typeof productSnapshots.$inferInsert>();
  const names = new Map<string, string>();
  let skipped = 0;
  const replaced = await replaceExisting(input.kind, start, end);
  const uploadId = await createUpload(input, 0, {});
  for (const r of objs) {
    const productId = idStr(r["Product ID"]);
    if (!productId || !/^\d+$/.test(productId)) {
      skipped++;
      continue;
    }
    const name = str(r["Product name"]);
    if (name) names.set(productId, name);
    rows.set(productId, {
      uploadId,
      productId,
      gmv: num(r["GMV"]),
      itemsSold: int(r["Items sold"]),
      commission: num(r["Est. commission"]),
      samples: int(r["Samples"]),
      salesCreators: int(r["Sales creator"]),
      liveStreams: int(r["LIVE streams"]),
      videos: int(r["Videos"]),
      refundedGmv: num(r["Refunded GMV"]),
      refundedItems: int(r["Refunded items sold"]),
    });
  }
  const brand = commonBrand([...names.values()]);
  if (names.size) {
    await D()
      .insert(products)
      .values([...names].map(([productId, name]) => ({ productId, name, shortName: shortProductName(name, brand) })))
      .onConflictDoUpdate({
        target: products.productId,
        set: { name: sql`excluded.name`, shortName: sql`excluded.short_name`, updatedAt: sql`now()` },
      });
  }
  for (const part of chunk([...rows.values()], chunkSizeFor(11))) {
    await D().insert(productSnapshots).values(part);
  }
  await D().update(uploads).set({ rowCount: rows.size, summary: { skipped } }).where(eq(uploads.id, uploadId));
  return { uploadId, imported: rows.size, skipped, replacedUploads: replaced, notes: [] };
}

// ───────────────────────── Free samples (from all orders) ─────────────────────────

/** TikTok writes free samples as RM 0 orders with no payment method. */
function isSampleLine(r: RowObj): boolean {
  return (
    num(r["Order Amount"]) === 0 &&
    num(r["SKU Subtotal Before Discount"]) === 0 &&
    !str(r["Payment Method"])
  );
}

async function upsertSampleOrders(lines: (typeof shopOrderLines.$inferInsert)[], uploadId: number): Promise<number> {
  if (!lines.length) return 0;
  const rows = lines.map((l) => ({
    source: "orders",
    orderId: l.orderId,
    skuId: l.skuId,
    sellerSku: l.sellerSku ?? null,
    productName: l.productName ?? null,
    variation: l.variation ?? null,
    quantity: l.quantity ?? 1,
    buyerMasked: l.buyerUsername ?? null,
    orderStatus: l.status,
    orderSubstatus: l.substatus ?? null,
    approvedAt: l.createdAt,
    shippedAt: l.shippedAt ?? null,
    deliveredAt: l.deliveredAt ?? null,
    cancelledAt: l.cancelledAt ?? null,
    trackingId: l.trackingId ?? null,
    shippingProvider: l.shippingProvider ?? null,
    uploadId,
  }));
  for (const part of chunk(rows, chunkSizeFor(25))) {
    await D()
      .insert(samples)
      .values(part)
      .onConflictDoUpdate({
        target: [samples.orderId, samples.skuId],
        set: {
          sellerSku: sql`excluded.seller_sku`,
          productName: sql`excluded.product_name`,
          variation: sql`excluded.variation`,
          quantity: sql`excluded.quantity`,
          buyerMasked: sql`excluded.buyer_masked`,
          orderStatus: sql`excluded.order_status`,
          orderSubstatus: sql`excluded.order_substatus`,
          approvedAt: sql`excluded.approved_at`,
          shippedAt: sql`excluded.shipped_at`,
          deliveredAt: sql`excluded.delivered_at`,
          cancelledAt: sql`excluded.cancelled_at`,
          trackingId: sql`excluded.tracking_id`,
          shippingProvider: sql`excluded.shipping_provider`,
          uploadId: sql`excluded.upload_id`,
          updatedAt: sql`now()`,
        },
      });
  }
  return rows.length;
}

// ───────────────────────── SKU catalogue ─────────────────────────
async function importSkuCatalog(input: ImportInput): Promise<ImportResult> {
  const { items, bom } = parseSkuWorkbook(input.tabs ?? [{ name: "Sheet", rows: [input.header, ...input.rows] }]);
  if (!items.length) throw new Error("No SKUs found. Expected columns such as “Variation Name” and “SKU” or “Set SKU”.");
  const uploadId = await createUpload(input, items.length, { sets: items.filter((i) => i.isSet).length, bomLines: bom.length });
  await D().transaction(async (tx) => {
    for (const part of chunk(items, 1000)) {
      await tx
        .insert(skuItems)
        .values(part)
        .onConflictDoUpdate({
          target: skuItems.sku,
          set: { family: sql`excluded.family`, name: sql`excluded.name`, isSet: sql`excluded.is_set`, updatedAt: sql`now()` },
        });
    }
    // A set's contents are replaced as a whole so removed components disappear.
    const sets = [...new Set(bom.map((b) => b.setSku))];
    for (const part of chunk(sets, 1000)) {
      await tx.delete(skuBom).where(sql`${skuBom.setSku} in (${sql.join(part.map((x) => sql`${x}`), sql`, `)})`);
    }
    for (const part of chunk(bom, 1000)) await tx.insert(skuBom).values(part);
  });
  const sets = items.filter((i) => i.isSet).length;
  return {
    uploadId,
    imported: items.length,
    skipped: 0,
    replacedUploads: 0,
    notes: [`${items.length - sets} single SKUs and ${sets} bundle SKUs (${bom.length} bundle lines).`],
  };
}

// ───────────────────────── Staff affiliate sheet ─────────────────────────

/** "6.019602194E10" / 60196021940 / "012-345 6789" → "+60196021940" */
export function normalisePhone(v: Cell | undefined): string | null {
  if (v == null || v === "") return null;
  let digits: string;
  if (typeof v === "number" || /^[\d.]+e\+?\d+$/i.test(String(v).trim())) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    digits = BigInt(Math.round(n)).toString();
  } else {
    // Letter O typed instead of zero is a common slip in the sheet.
    digits = String(v).replace(/[oO]/g, "0").replace(/\D/g, "");
  }
  if (digits.startsWith("0")) digits = "6" + digits;
  else if (/^1\d{8,9}$/.test(digits)) digits = "60" + digits;
  return digits.length >= 10 && digits.length <= 13 ? `+${digits}` : null;
}

const cleanUser = (v: Cell | undefined) => {
  const s = v == null ? "" : String(v).replace(/[\n\r]+/g, " ").trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{2,40}$/.test(s) ? s : null;
};

const NOTE_COLS = /^(comment|comments for bs|other comment|for other sample)/i;

/**
 * The staff sheet is only used for contact details: WhatsApp number, LIVE/video
 * approach and notes. Samples themselves come from the all-orders export.
 */
async function importStaffSheet(input: ImportInput): Promise<ImportResult> {
  const tabs = input.tabs ?? [];
  type Person = { phones: Map<string, number>; approach: Set<string>; notes: Set<string> };
  const people = new Map<string, Person>();
  let skipped = 0;
  const get = (u: string) => {
    let p = people.get(u);
    if (!p) people.set(u, (p = { phones: new Map(), approach: new Set(), notes: new Set() }));
    return p;
  };

  for (const tab of tabs) {
    // Shopee affiliates, sold-quantity lookups and the video list aren't TikTok contact records.
    if (/shopee|sold|^videos$/i.test(tab.name)) continue;
    const header = tab.rows[0].map((c) => (c == null ? "" : String(c).trim()));
    const phoneCol = header.findIndex((h) => /^whatsapp$/i.test(h));
    if (phoneCol < 0) continue; // lookup tabs (e.g. "Data Verification") have no contact details
    let userCol = header.findIndex((h) => /^username$/i.test(h));
    const headerless = userCol < 0 && phoneCol === 1; // the "ALL" tab has a username where the header should be
    if (headerless) userCol = 0;
    if (userCol < 0) continue;
    const approachCol = header.findIndex((h) => /live \/ sample approach/i.test(h));
    const noteCols = header.map((h, i) => (NOTE_COLS.test(h) || (h === "" && i > userCol + 1) ? i : -1)).filter((i) => i >= 0);

    for (const r of headerless ? tab.rows : tab.rows.slice(1)) {
      const u = cleanUser(r[userCol]);
      if (!u) {
        if (r.some((c) => c != null)) skipped++;
        continue;
      }
      const p = get(u);
      const phone = normalisePhone(r[phoneCol]);
      if (phone) p.phones.set(phone, (p.phones.get(phone) ?? 0) + 1);
      if (approachCol >= 0 && r[approachCol] != null) {
        const a = String(r[approachCol]).toLowerCase();
        if (a.includes("live")) p.approach.add("live");
        if (a.includes("sample")) p.approach.add("video");
      }
      for (const c of noteCols) {
        const v = r[c];
        if (v != null && String(v).trim() && !/^\d+(\.\d+)?$/.test(String(v).trim())) p.notes.add(`${header[c] || tab.name}: ${String(v).trim()}`);
      }
    }
  }
  if (!people.size) throw new Error("No creators found. Expected tabs with “Username” and “WhatsApp” columns.");

  const uploadId = await createUpload(input, people.size, { skipped });
  await D().transaction(async (tx) => {
    const contactRows = [...people].map(([username, p]) => {
      const approach = p.approach.size === 2 ? "both" : p.approach.size === 1 ? [...p.approach][0] : null;
      // The number written most often across tabs wins.
      const phone = [...p.phones].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return { username, phone, approach, notes: [...p.notes].join("\n").slice(0, 4000) || null };
    });
    for (const part of chunk(contactRows, 2000)) {
      await tx
        .insert(creators)
        .values(part)
        .onConflictDoUpdate({
          target: creators.username,
          set: {
            // Fill empty numbers only – numbers already saved are kept.
            phone: sql`coalesce(${creators.phone}, excluded.phone)`,
            approach: sql`case when ${creators.contactEdited} then ${creators.approach} else coalesce(excluded.approach, ${creators.approach}) end`,
            notes: sql`coalesce(${creators.notes}, excluded.notes)`,
            updatedAt: sql`now()`,
          },
        });
    }
    // Earlier versions imported sample history from this sheet – samples now come from orders only.
    await tx.delete(samples).where(sql`${samples.source} <> 'orders'`);
  });
  const withPhone = [...people.values()].filter((p) => p.phones.size).length;
  return {
    uploadId,
    imported: people.size,
    skipped,
    replacedUploads: 0,
    notes: [`${people.size} creators read, ${withPhone} with a WhatsApp number. Samples are not taken from this sheet.`],
  };
}

// ───────────────────────── WhatsApp number list ─────────────────────────

/** A two-column file (username, WhatsApp). Only affiliates without a number are filled; saved numbers are kept. */
async function importContactList(input: ImportInput): Promise<ImportResult> {
  const h = input.header.map((x) => x.toLowerCase().trim());
  const uCol = h.findIndex((x) => ["username", "tiktok username", "creator username", "creator name", "affiliate"].includes(x));
  const pCol = h.findIndex((x) => ["whatsapp", "whatsapp number", "phone", "phone number", "mobile", "contact number"].includes(x));
  if (uCol < 0 || pCol < 0) throw new Error("Expected a “Username” column and a “WhatsApp” column.");

  const wanted = new Map<string, string>();
  let invalid = 0;
  let blank = 0;
  for (const r of input.rows) {
    const u = cleanUser(r[uCol]);
    const raw = r[pCol];
    if (!u) continue;
    if (raw == null || String(raw).trim() === "") {
      blank++; // the download template has empty numbers to fill in – not an error
      continue;
    }
    const phone = normalisePhone(raw);
    if (!phone) invalid++;
    else wanted.set(u, phone);
  }
  const names = [...wanted.keys()];
  const have = new Set<string>();
  for (const part of chunk(names, 2000)) {
    const found = await D()
      .select({ u: creators.username })
      .from(creators)
      .where(sql`${creators.username} in (${sql.join(part.map((x) => sql`${x}`), sql`, `)}) and ${creators.phone} is not null`);
    for (const f of found) have.add(f.u);
  }
  const toAdd = names.filter((u) => !have.has(u));
  const uploadId = await createUpload(input, input.rows.length, { added: toAdd.length, kept: have.size, invalid, blank });
  for (const part of chunk(toAdd, 2000)) {
    await D()
      .insert(creators)
      .values(part.map((username) => ({ username, phone: wanted.get(username)! })))
      .onConflictDoUpdate({
        target: creators.username,
        set: { phone: sql`coalesce(${creators.phone}, excluded.phone)`, updatedAt: sql`now()` },
      });
  }
  return {
    uploadId,
    imported: toAdd.length,
    skipped: invalid,
    replacedUploads: 0,
    notes: [
      `${toAdd.length} number${toAdd.length === 1 ? "" : "s"} added. ${have.size} affiliate${have.size === 1 ? "" : "s"} already had a number (kept as is).` +
        (invalid ? ` ${invalid} row${invalid === 1 ? "" : "s"} had a number that couldn't be read.` : "") +
        (blank ? ` ${blank} row${blank === 1 ? "" : "s"} had no number.` : ""),
    ],
  };
}

export type { RowObj };
