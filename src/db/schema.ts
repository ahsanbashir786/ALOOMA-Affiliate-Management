import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "manager", "viewer"]);

export const uploadKindEnum = pgEnum("upload_kind", [
  "affiliate_orders",
  "all_orders",
  "creator_list",
  "creator_transactions",
  "video_list",
  "sample_analysis",
  "product_list",
]);

export const actionStatusEnum = pgEnum("action_status", [
  "open",
  "in_progress",
  "sent",
  "done",
  "dismissed",
]);

// ───────── Users & sessions ─────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("viewer"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ───────── Uploads (one per imported file) ─────────
export const uploads = pgTable(
  "uploads",
  {
    id: serial("id").primaryKey(),
    kind: uploadKindEnum("kind").notNull(),
    filename: text("filename").notNull(),
    periodStart: date("period_start", { mode: "string" }),
    periodEnd: date("period_end", { mode: "string" }),
    rowCount: integer("row_count").notNull().default(0),
    summary: jsonb("summary"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("uploads_kind_idx").on(t.kind, t.periodStart, t.periodEnd)],
);

// ───────── Master entities ─────────
export const creators = pgTable("creators", {
  username: text("username").primaryKey(),
  notes: text("notes"),
  tags: text("tags").array().notNull().default([]),
  doNotContact: boolean("do_not_contact").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const products = pgTable("products", {
  productId: text("product_id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const videos = pgTable(
  "videos",
  {
    videoId: text("video_id").primaryKey(),
    creator: text("creator").notNull(),
    postedAt: timestamp("posted_at"),
    link: text("link"),
    title: text("title"),
    productIds: text("product_ids").array().notNull().default([]),
  },
  (t) => [index("videos_creator_idx").on(t.creator), index("videos_posted_idx").on(t.postedAt)],
);

// ───────── Order lines (transactional, upserted) ─────────
export const orderLines = pgTable(
  "order_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").notNull(),
    skuId: text("sku_id").notNull(),
    productId: text("product_id").notNull(),
    skuName: text("sku_name"),
    sellerSku: text("seller_sku"),
    price: doublePrecision("price").notNull().default(0),
    paymentAmount: doublePrecision("payment_amount").notNull().default(0),
    quantity: integer("quantity").notNull().default(1),
    fullyRefunded: boolean("fully_refunded").notNull().default(false),
    cod: boolean("cod").notNull().default(false),
    status: text("status").notNull(),
    creator: text("creator").notNull(),
    contentType: text("content_type").notNull(),
    contentId: text("content_id"),
    commissionModel: text("commission_model"),
    commissionRate: text("commission_rate"),
    estCommission: doublePrecision("est_commission").notNull().default(0),
    actualCommission: doublePrecision("actual_commission").notNull().default(0),
    estAdsCommission: doublePrecision("est_ads_commission").notNull().default(0),
    actualAdsCommission: doublePrecision("actual_ads_commission").notNull().default(0),
    createdAt: timestamp("created_at").notNull(),
    paidAt: timestamp("paid_at"),
    deliveredAt: timestamp("delivered_at"),
    commissionPaidAt: timestamp("commission_paid_at"),
    uploadId: integer("upload_id").references(() => uploads.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("order_lines_uq").on(t.orderId, t.skuId),
    index("order_lines_creator_idx").on(t.creator, t.createdAt),
    index("order_lines_created_idx").on(t.createdAt),
    index("order_lines_content_idx").on(t.contentId),
    index("order_lines_product_idx").on(t.productId),
  ],
);

/** Shop-wide order lines (all channels). Used for affiliate share, geography, cancellations, payments. */
export const shopOrderLines = pgTable(
  "shop_order_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").notNull(),
    skuId: text("sku_id").notNull(),
    status: text("status").notNull(),
    substatus: text("substatus"),
    cancelType: text("cancel_type"),
    cancelBy: text("cancel_by"),
    cancelReason: text("cancel_reason"),
    preorder: boolean("preorder").notNull().default(false),
    productName: text("product_name"),
    variation: text("variation"),
    sellerSku: text("seller_sku"),
    quantity: integer("quantity").notNull().default(1),
    returnQty: integer("return_qty").notNull().default(0),
    unitPrice: doublePrecision("unit_price").notNull().default(0),
    subtotalBefore: doublePrecision("subtotal_before").notNull().default(0),
    platformDiscount: doublePrecision("platform_discount").notNull().default(0),
    sellerDiscount: doublePrecision("seller_discount").notNull().default(0),
    subtotalAfter: doublePrecision("subtotal_after").notNull().default(0),
    shippingFee: doublePrecision("shipping_fee").notNull().default(0),
    orderAmount: doublePrecision("order_amount").notNull().default(0),
    refundAmount: doublePrecision("refund_amount").notNull().default(0),
    createdAt: timestamp("created_at").notNull(),
    paidAt: timestamp("paid_at"),
    shippedAt: timestamp("shipped_at"),
    deliveredAt: timestamp("delivered_at"),
    cancelledAt: timestamp("cancelled_at"),
    deliveryOption: text("delivery_option"),
    shippingProvider: text("shipping_provider"),
    paymentMethod: text("payment_method"),
    state: text("state"),
    category: text("category"),
    orderChannel: text("order_channel"),
    creator: text("creator"),
    uploadId: integer("upload_id").references(() => uploads.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("shop_order_lines_uq").on(t.orderId, t.skuId),
    index("shop_order_lines_created_idx").on(t.createdAt),
    index("shop_order_lines_creator_idx").on(t.creator),
  ],
);

// ───────── Period snapshots (tied to an upload) ─────────
export const creatorListSnapshots = pgTable(
  "creator_list_snapshots",
  {
    uploadId: integer("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    gmv: doublePrecision("gmv").notNull().default(0),
    liveGmv: doublePrecision("live_gmv").notNull().default(0),
    videoGmv: doublePrecision("video_gmv").notNull().default(0),
    cardGmv: doublePrecision("card_gmv").notNull().default(0),
    productsSold: integer("products_sold").notNull().default(0),
    itemsSold: integer("items_sold").notNull().default(0),
    commission: doublePrecision("commission").notNull().default(0),
    aov: doublePrecision("aov").notNull().default(0),
    orders: integer("orders").notNull().default(0),
    ctr: doublePrecision("ctr"),
    impressions: integer("impressions").notNull().default(0),
    customers: doublePrecision("customers").notNull().default(0),
    liveStreams: integer("live_streams").notNull().default(0),
    videos: integer("videos").notNull().default(0),
    targetGmv: doublePrecision("target_gmv").notNull().default(0),
    targetCommission: doublePrecision("target_commission").notNull().default(0),
    openGmv: doublePrecision("open_gmv").notNull().default(0),
    openCommission: doublePrecision("open_commission").notNull().default(0),
    refundedGmv: doublePrecision("refunded_gmv").notNull().default(0),
    itemsRefunded: integer("items_refunded").notNull().default(0),
    followers: integer("followers").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.username] }), index("cls_user_idx").on(t.username)],
);

export const creatorTxnSnapshots = pgTable(
  "creator_txn_snapshots",
  {
    uploadId: integer("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    gmv: doublePrecision("gmv").notNull().default(0),
    liveGmv: doublePrecision("live_gmv").notNull().default(0),
    videoGmv: doublePrecision("video_gmv").notNull().default(0),
    cardGmv: doublePrecision("card_gmv").notNull().default(0),
    refunds: doublePrecision("refunds").notNull().default(0),
    orders: integer("orders").notNull().default(0),
    itemsSold: integer("items_sold").notNull().default(0),
    itemsRefunded: integer("items_refunded").notNull().default(0),
    aov: doublePrecision("aov").notNull().default(0),
    ctor: doublePrecision("ctor"),
    liveStreams: integer("live_streams").notNull().default(0),
    videos: integer("videos").notNull().default(0),
    sampleContent: integer("sample_content").notNull().default(0),
    samplesShipped: integer("samples_shipped").notNull().default(0),
    ctr: doublePrecision("ctr"),
    impressions: integer("impressions").notNull().default(0),
    views: integer("views").notNull().default(0),
    customers: doublePrecision("customers"),
    productsSold: doublePrecision("products_sold"),
    commission: doublePrecision("commission").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.username] }), index("cts_user_idx").on(t.username)],
);

export const videoSnapshots = pgTable(
  "video_snapshots",
  {
    uploadId: integer("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(),
    gmv: doublePrecision("gmv").notNull().default(0),
    orders: integer("orders").notNull().default(0),
    aov: doublePrecision("aov").notNull().default(0),
    itemsSold: integer("items_sold").notNull().default(0),
    refunds: doublePrecision("refunds").notNull().default(0),
    itemsRefunded: integer("items_refunded").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    completionRate: doublePrecision("completion_rate"),
    views: integer("views").notNull().default(0),
    ctr: doublePrecision("ctr"),
    gpm: doublePrecision("gpm"),
    engagement: doublePrecision("engagement"),
    gmvPerCustomer: doublePrecision("gmv_per_customer"),
    commission: doublePrecision("commission").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.videoId] }), index("vs_video_idx").on(t.videoId)],
);

export const sampleSnapshots = pgTable(
  "sample_snapshots",
  {
    uploadId: integer("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    contentGmv: doublePrecision("content_gmv").notNull().default(0),
    requested: integer("requested").notNull().default(0),
    shipped: integer("shipped").notNull().default(0),
    postingRate: doublePrecision("posting_rate").notNull().default(0),
    videosWithSamples: integer("videos_with_samples").notNull().default(0),
    liveWithSamples: integer("live_with_samples").notNull().default(0),
    roi45: doublePrecision("roi45").notNull().default(0),
    roi90: doublePrecision("roi90").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.username] }), index("ss_user_idx").on(t.username)],
);

export const productSnapshots = pgTable(
  "product_snapshots",
  {
    uploadId: integer("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    gmv: doublePrecision("gmv").notNull().default(0),
    itemsSold: integer("items_sold").notNull().default(0),
    commission: doublePrecision("commission").notNull().default(0),
    samples: integer("samples").notNull().default(0),
    salesCreators: integer("sales_creators").notNull().default(0),
    liveStreams: integer("live_streams").notNull().default(0),
    videos: integer("videos").notNull().default(0),
    refundedGmv: doublePrecision("refunded_gmv").notNull().default(0),
    refundedItems: integer("refunded_items").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.productId] })],
);

// ───────── Action centre ─────────
export const actions = pgTable(
  "actions",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    type: text("type").notNull(),
    priority: integer("priority").notNull().default(50),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    instruction: text("instruction").notNull(),
    expectedUplift: doublePrecision("expected_uplift").notNull().default(0),
    baselineGmv: doublePrecision("baseline_gmv").notNull().default(0),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    status: actionStatusEnum("status").notNull().default("open"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [
    uniqueIndex("actions_uq").on(t.username, t.type, t.periodEnd),
    index("actions_status_idx").on(t.status),
  ],
);
