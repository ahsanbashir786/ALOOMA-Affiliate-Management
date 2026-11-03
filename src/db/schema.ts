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
  "sku_catalog",
  "staff_sheet",
  "contact_list",
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
  /** May edit and upload WhatsApp numbers. Admins always may. */
  canEditContacts: boolean("can_edit_contacts").notNull().default(false),
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
  /** WhatsApp number in international format, e.g. +60123456789 */
  phone: text("phone"),
  /** How the team works with this creator: "video", "live" or "both" (from the staff sheet or set by hand). */
  approach: text("approach"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  /** True once phone/approach were edited in the app – the staff sheet import then leaves them alone. */
  contactEdited: boolean("contact_edited").notNull().default(false),
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
    /** Latest event time in the export that last wrote this line – older exports never overwrite newer data. */
    asof: timestamp("asof"),
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
    /** Masked buyer handle from the export, e.g. "p***ha_love". */
    buyerUsername: text("buyer_username"),
    trackingId: text("tracking_id"),
    rtsAt: timestamp("rts_at"),
    /** Free sample order (RM 0, no payment). Excluded from sales and order-health figures. */
    isSample: boolean("is_sample").notNull().default(false),
    /** Latest event time in the export that last wrote this line – older exports never overwrite newer data. */
    asof: timestamp("asof"),
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
    /** The same message in Bahasa Melayu. */
    instructionMs: text("instruction_ms"),
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

// ───────── SKU catalogue (single items + bundle bill of materials) ─────────
export const skuItems = pgTable("sku_items", {
  sku: text("sku").primaryKey(),
  /** Product family, e.g. "Quilt Cover Rosewood" or "Set Bedsheets White". */
  family: text("family"),
  name: text("name").notNull(),
  isSet: boolean("is_set").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** What a bundle SKU contains. A component listed twice has qty 2. */
export const skuBom = pgTable(
  "sku_bom",
  {
    setSku: text("set_sku").notNull(),
    componentSku: text("component_sku").notNull(),
    qty: integer("qty").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.setSku, t.componentSku] })],
);

// ───────── Samples (one row per sample line) ─────────
export const samples = pgTable(
  "samples",
  {
    id: serial("id").primaryKey(),
    /** Always "orders": samples come only from free-sample orders in the all-orders export. */
    source: text("source").notNull().default("orders"),
    orderId: text("order_id"),
    skuId: text("sku_id"),
    sellerSku: text("seller_sku"),
    productName: text("product_name"),
    variation: text("variation"),
    quantity: integer("quantity").notNull().default(1),
    buyerMasked: text("buyer_masked"),
    creator: text("creator"),
    /** "auto" (matched from the masked buyer), "manual" (set by staff) or "sheet". */
    creatorMatch: text("creator_match"),
    orderStatus: text("order_status"),
    orderSubstatus: text("order_substatus"),
    /** Deprecated and unused (hand-logged samples were removed). Kept so upgrading never needs a destructive migration. */
    rawCode: text("raw_code"),
    /** Deprecated and unused, see rawCode. */
    requestedAt: date("requested_at", { mode: "string" }),
    /** Order created = sample approved in Seller Center. */
    approvedAt: timestamp("approved_at"),
    shippedAt: timestamp("shipped_at"),
    deliveredAt: timestamp("delivered_at"),
    cancelledAt: timestamp("cancelled_at"),
    trackingId: text("tracking_id"),
    shippingProvider: text("shipping_provider"),
    // ── posting check (recomputed after every import) ──
    /** in_transit | in_window | posted_video | did_live | posted_other | not_posted | cancelled | no_creator */
    result: text("result"),
    postedAt: timestamp("posted_at"),
    postVideoId: text("post_video_id"),
    postLink: text("post_link"),
    /** TikTok product the sample belongs to (sizes of one product share it) – used to count sales once per product. */
    productId: text("product_id"),
    /** Videos the creator posted after delivery that feature the sampled product (Video analysis + new videos seen in orders). */
    videoCount: integer("video_count").notNull().default(0),
    /** Videos posted after delivery that feature other products. */
    otherVideoCount: integer("other_video_count").notNull().default(0),
    /** Views of those product videos (best reporting window per video). */
    contentViews: integer("content_views").notNull().default(0),
    /** Posting deadline (inclusive): the agreed date from a promise if there is one, otherwise delivery + the default days. */
    postBy: date("post_by", { mode: "string" }),
    /** "agreed" (a promised date overrides the default) or "default". */
    postBySource: text("post_by_source"),
    /** Valid GMV / orders the creator made from the sampled product after delivery. */
    contentGmv: doublePrecision("content_gmv").notNull().default(0),
    contentOrders: integer("content_orders").notNull().default(0),
    checkedAt: timestamp("checked_at"),
    // ── staff work ──
    /** Manual result that overrides the automatic check (posted_video | did_live | not_posted). */
    resultOverride: text("result_override"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    followUpAt: date("follow_up_at", { mode: "string" }),
    note: text("note"),
    uploadId: integer("upload_id").references(() => uploads.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("samples_order_uq").on(t.orderId, t.skuId),
    index("samples_creator_idx").on(t.creator),
    index("samples_result_idx").on(t.result),
  ],
);

// ───────── Staff work (never rebuilt by imports or recommendation refreshes) ─────────

/**
 * Everything staff do, in order: contacted, promised, needs_help, paused, resumed, note.
 * Events are never deleted – "undo" marks them reverted so the history stays auditable.
 * The creator's current state (next follow-up, paused, unanswered attempts…) is replayed from these rows.
 */
export const staffEvents = pgTable(
  "staff_events",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    kind: text("kind").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    details: jsonb("details"),
    /** Bulk "Contacted" actions share a batch id so the whole batch can be undone. */
    batchId: text("batch_id"),
    /** Labelled test records – never created by the application itself. */
    synthetic: boolean("synthetic").notNull().default(false),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    revertedBy: uuid("reverted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("staff_events_user_idx").on(t.username, t.at), index("staff_events_kind_idx").on(t.kind, t.at)],
);

/** A promise made by a creator (collaboration commitment). Fulfilment is derived from verified content, not typed in. */
export const commitments = pgTable(
  "commitments",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    /** The "promised" event that created it; if that event is undone the commitment is cancelled. */
    eventId: integer("event_id").notNull().references(() => staffEvents.id, { onDelete: "cascade" }),
    promisedOn: date("promised_on", { mode: "string" }).notNull(),
    /** Optional deliverable details typed by staff. */
    details: text("details"),
    /** Sample lines this promise is about (the open samples of the creator when it was recorded). */
    sampleIds: integer("sample_ids").array().notNull().default([]),
    productId: text("product_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("commitments_event_uq").on(t.eventId), index("commitments_user_idx").on(t.username)],
);

/** Content the system found for a sample (rebuilt on every check). Confirmed = same creator, product and dates; uncertain needs review. */
export const sampleContent = pgTable(
  "sample_content",
  {
    sampleId: integer("sample_id").notNull().references(() => samples.id, { onDelete: "cascade" }),
    contentId: text("content_id").notNull(),
    kind: text("kind").notNull(),
    link: text("link"),
    postedAt: timestamp("posted_at"),
    views: integer("views").notNull().default(0),
    confidence: text("confidence").notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sampleId, t.contentId] })],
);

/** Staff decisions on content: verified (with a link or id) or rejected. Never rebuilt, so they survive imports. */
export const contentDecisions = pgTable(
  "content_decisions",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    sampleId: integer("sample_id").references(() => samples.id, { onDelete: "cascade" }),
    commitmentId: integer("commitment_id").references(() => commitments.id, { onDelete: "cascade" }),
    contentId: text("content_id"),
    link: text("link"),
    decision: text("decision").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
    synthetic: boolean("synthetic").notNull().default(false),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    revertedBy: uuid("reverted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("content_decisions_user_idx").on(t.username)],
);

/** System recommendations. Refreshed freely; carries no staff state. */
export const recommendations = pgTable(
  "recommendations",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    type: text("type").notNull(),
    priority: integer("priority").notNull().default(50),
    title: text("title").notNull(),
    /** Evidence in plain words (numbers from the data). */
    reason: text("reason").notNull(),
    instruction: text("instruction").notNull(),
    instructionMs: text("instruction_ms"),
    /** Assumption-based scenario value – shown only in the secondary Analysis area. */
    scenarioValue: doublePrecision("scenario_value").notNull().default(0),
    active: boolean("active").notNull().default(true),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("recommendations_uq").on(t.username, t.type), index("recommendations_active_idx").on(t.active)],
);
