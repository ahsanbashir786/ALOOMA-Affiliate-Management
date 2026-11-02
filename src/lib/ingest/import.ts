import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  creatorListSnapshots,
  creatorTxnSnapshots,
  orderLines,
  productSnapshots,
  products,
  sampleSnapshots,
  shopOrderLines,
  uploads,
  videoSnapshots,
  videos,
} from "@/db/schema";
import type { Kind } from "./kinds";
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
import type { Cell } from "./read-xlsx";

export type ImportInput = {
  kind: Kind;
  filename: string;
  header: string[];
  rows: Cell[][];
  periodStart: string | null;
  periodEnd: string | null;
  userId?: string | null;
};

export type ImportResult = {
  uploadId: number;
  imported: number;
  skipped: number;
  replacedUploads: number;
  notes: string[];
};

const PARAM_LIMIT = 60_000;
const chunkSizeFor = (cols: number) => Math.max(1, Math.floor(PARAM_LIMIT / cols));

/** Drops the help-text row TikTok puts under the headers. */
function dataRows(rows: Cell[][]): Cell[][] {
  return rows.length && isDescriptionRow(rows[0]) ? rows.slice(1) : rows;
}

/** A snapshot for the same kind + period replaces the previous one. */
async function replaceExisting(kind: Kind, start: string, end: string): Promise<number> {
  const res = await db
    .delete(uploads)
    .where(and(eq(uploads.kind, kind), eq(uploads.periodStart, start), eq(uploads.periodEnd, end)))
    .returning({ id: uploads.id });
  return res.length;
}

async function createUpload(input: ImportInput, rowCount: number, summary: object) {
  const [u] = await db
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

export async function importFile(input: ImportInput): Promise<ImportResult> {
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
  }
}

function requirePeriod(input: ImportInput): { start: string; end: string } {
  if (!input.periodStart || !input.periodEnd) throw new Error("A reporting period is required for this file type.");
  if (input.periodStart > input.periodEnd) throw new Error("Period start must be on or before the end date.");
  return { start: input.periodStart, end: input.periodEnd };
}

// ───────────────────────── Affiliate orders ─────────────────────────
async function importAffiliateOrders(input: ImportInput): Promise<ImportResult> {
  const objs = toObjects(input.header, input.rows);
  const notes: string[] = [];
  type Line = typeof orderLines.$inferInsert;
  const lines = new Map<string, Line>();
  const productNames = new Map<string, string>();
  let skipped = 0;
  let minT: Date | null = null;
  let maxT: Date | null = null;

  for (const r of objs) {
    const orderId = idStr(r["Order ID"]);
    const skuId = idStr(r["SKU ID"]) ?? "";
    const productId = idStr(r["Product ID"]);
    const creator = str(r["Creator Username"]);
    const createdAt = parseDMY(r["Time Created"]);
    // The row under the header is a definition, not an order.
    if (!orderId || !/^\d+$/.test(orderId) || !productId || !createdAt) {
      skipped++;
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
  }
  if (!lines.size) throw new Error("No valid order lines found in this file.");

  const start = input.periodStart ?? minT!.toISOString().slice(0, 10);
  const end = input.periodEnd ?? maxT!.toISOString().slice(0, 10);
  const uploadId = await createUpload({ ...input, periodStart: start, periodEnd: end }, lines.size, {
    skipped,
    products: productNames.size,
  });

  // Products seen in orders (names also come from the product list).
  const brand = commonBrand([...productNames.values()]);
  if (productNames.size) {
    await db
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

  const rows = [...lines.values()].map((l) => ({ ...l, uploadId }));
  const size = chunkSizeFor(26);
  for (const part of chunk(rows, size)) {
    await db
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
          uploadId: sql`excluded.upload_id`,
        },
      });
  }
  notes.push(`Orders from ${start} to ${end}. Existing lines were updated in place (status, commission).`);
  return { uploadId, imported: lines.size, skipped, replacedUploads: 0, notes };
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
  let skipped = 0;
  let minT: Date | null = null;
  let maxT: Date | null = null;
  for (const r of objs) {
    const orderId = idStr(r["Order ID"]);
    const createdAt = parseDMY(r["Created Time"]);
    // Row under the header is a definition, not an order.
    if (!orderId || !/^\d+$/.test(orderId) || !createdAt) {
      skipped++;
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
    });
  }
  if (!lines.size) throw new Error("No valid order lines found in this file.");
  const start = input.periodStart ?? minT!.toISOString().slice(0, 10);
  const end = input.periodEnd ?? maxT!.toISOString().slice(0, 10);
  const uploadId = await createUpload({ ...input, periodStart: start, periodEnd: end }, lines.size, { skipped });
  const rows = [...lines.values()].map((l) => ({ ...l, uploadId }));
  for (const part of chunk(rows, chunkSizeFor(33))) {
    await db
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
          uploadId: sql`excluded.upload_id`,
        },
      });
  }
  return {
    uploadId,
    imported: lines.size,
    skipped,
    replacedUploads: 0,
    notes: [`Shop orders from ${start} to ${end}. Existing lines were updated in place.`],
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
    await db.insert(creatorListSnapshots).values(part);
  }
  await db.update(uploads).set({ rowCount: byUser.size, summary: { skipped } }).where(eq(uploads.id, uploadId));
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
    await db.insert(creatorTxnSnapshots).values(part);
  }
  await db.update(uploads).set({ rowCount: byUser.size, summary: { skipped } }).where(eq(uploads.id, uploadId));
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
    await db
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
    await db.insert(videoSnapshots).values(part);
  }
  await db.update(uploads).set({ rowCount: snaps.size, summary: { skipped } }).where(eq(uploads.id, uploadId));
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
    await db.insert(sampleSnapshots).values(part);
  }
  await db.update(uploads).set({ rowCount: byUser.size, summary: { skipped } }).where(eq(uploads.id, uploadId));
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
    await db
      .insert(products)
      .values([...names].map(([productId, name]) => ({ productId, name, shortName: shortProductName(name, brand) })))
      .onConflictDoUpdate({
        target: products.productId,
        set: { name: sql`excluded.name`, shortName: sql`excluded.short_name`, updatedAt: sql`now()` },
      });
  }
  for (const part of chunk([...rows.values()], chunkSizeFor(11))) {
    await db.insert(productSnapshots).values(part);
  }
  await db.update(uploads).set({ rowCount: rows.size, summary: { skipped } }).where(eq(uploads.id, uploadId));
  return { uploadId, imported: rows.size, skipped, replacedUploads: replaced, notes: [] };
}

export type { RowObj };
