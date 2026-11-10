import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";




// ───────── Roles, users & sessions ─────────
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** The owner role: always has every permission and cannot be edited or deleted. */
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permission: text("permission").notNull(),
}, (t) => [primaryKey({ columns: [t.roleId, t.permission] })]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
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
  /** The platform of this account. Only TikTok today; the column lets other platforms attach without a rebuild. */
  platform: text("platform").notNull().default("tiktok"),
  /** "import" (seen in an export) or "manual" (added by staff to start outreach). */
  source: text("source").notNull().default("import"),
  addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
  addedAt: timestamp("added_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});














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
    /** Free text typed by staff. Kept for reading only – never parsed for quantities or products. */
    details: text("details"),
    /** Structured deliverable: "video" | "live" | null (not specified). */
    contentType: text("content_type"),
    /** Required number of distinct qualifying content pieces; null = not specified (one piece is enough). */
    quantity: integer("quantity"),
    /** The product this promise is about (a product key), if staff chose one. */
    productId: text("product_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("commitments_event_uq").on(t.eventId), index("commitments_user_idx").on(t.username)],
);


/** Staff decisions on content: verified (with a link or id) or rejected. Never rebuilt, so they survive imports. */
export const contentDecisions = pgTable(
  "content_decisions",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    commitmentId: integer("commitment_id").references(() => commitments.id, { onDelete: "cascade" }),
    contentId: text("content_id"),
    link: text("link"),
    decision: text("decision").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
    /** Deliberate "this content also counts for this commitment even though another one uses it". */
    shared: boolean("shared").notNull().default(false),
    synthetic: boolean("synthetic").notNull().default(false),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    revertedBy: uuid("reverted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("content_decisions_user_idx").on(t.username)],
);



/** A deadline change for a commitment. The original deadline stays on `commitments`; the current one is the latest non-undone change. */
export const commitmentChanges = pgTable(
  "commitment_changes",
  {
    id: serial("id").primaryKey(),
    commitmentId: integer("commitment_id").notNull().references(() => commitments.id, { onDelete: "cascade" }),
    /** The "rescheduled" staff event; undoing that event removes the change from the current state. */
    eventId: integer("event_id").notNull().references(() => staffEvents.id, { onDelete: "cascade" }),
    fromOn: date("from_on", { mode: "string" }).notNull(),
    toOn: date("to_on", { mode: "string" }).notNull(),
  },
  (t) => [uniqueIndex("commitment_changes_event_uq").on(t.eventId), index("commitment_changes_commitment_idx").on(t.commitmentId)],
);

/** Derived, rebuilt on every refresh: how far each commitment is. Staff data is never stored here. */
export const commitmentStatus = pgTable("commitment_status", {
  commitmentId: integer("commitment_id").primaryKey().references(() => commitments.id, { onDelete: "cascade" }),
  /** open | partial | review | fulfilled */
  state: text("state").notNull(),
  needed: integer("needed").notNull().default(1),
  done: integer("done").notNull().default(0),
  originalOn: date("original_on", { mode: "string" }).notNull(),
  /** The current deadline – the only one that drives reminders and sample deadlines. */
  dueOn: date("due_on", { mode: "string" }).notNull(),
  /** Posting date of the piece that completed it (null while unknown or incomplete). */
  completedOn: date("completed_on", { mode: "string" }),
  /** on_time | late | unknown – unknown when a verified piece has no known posting date. */
  timing: text("timing"),
  contentIds: text("content_ids").array().notNull().default([]),
  candidateIds: text("candidate_ids").array().notNull().default([]),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});




/** Written by `npm run db:migrate`. Declared here so `drizzle-kit push` never offers to drop it. */
export const schemaMigrations = pgTable("schema_migrations", {
  name: text("name").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

// ───────── TikTok API sync (Data Sync module). TikTok data only; nothing here is typed by staff. Mirrors migrations/0006_tiktok_sync.sql ─────────
const tz = (n: string) => timestamp(n, { withTimezone: true });

export const ttSyncRuns = pgTable(
  "tt_sync_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    dataset: text("dataset").notNull(),
    startedAt: tz("started_at").notNull().defaultNow(),
    finishedAt: tz("finished_at"),
    status: text("status").notNull().default("running"),
    trigger: text("trigger").notNull().default("manual"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    pages: integer("pages").notNull().default(0),
    rowsSeen: integer("rows_seen").notNull().default(0),
    rowsChanged: integer("rows_changed").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("tt_sync_runs_dataset_started").on(t.dataset, t.startedAt)],
);

export const ttSyncState = pgTable("tt_sync_state", {
  dataset: text("dataset").primaryKey(),
  watermark: tz("watermark"),
  lastSuccessAt: tz("last_success_at"),
  lastError: text("last_error"),
  lastErrorAt: tz("last_error_at"),
  records: integer("records").notNull().default(0),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const ttAffiliateOrderLines = pgTable(
  "tt_affiliate_order_lines",
  {
    orderId: text("order_id").notNull(),
    skuId: text("sku_id").notNull(),
    createdAt: tz("created_at"),
    deliveryAt: tz("delivery_at"),
    creator: text("creator"),
    contentId: text("content_id"),
    contentType: text("content_type"),
    productId: text("product_id"),
    sellerSku: text("seller_sku"),
    skuName: text("sku_name"),
    quantity: integer("quantity"),
    price: numeric("price", { precision: 14, scale: 2 }),
    currency: text("currency"),
    commissionRate: numeric("commission_rate", { precision: 12, scale: 4 }),
    estCommission: numeric("est_commission", { precision: 14, scale: 2 }),
    paidCommission: numeric("paid_commission", { precision: 14, scale: 2 }),
    settlementStatus: text("settlement_status"),
    fullyReturn: boolean("fully_return"),
    openCollabId: text("open_collab_id"),
    targetCollabId: text("target_collab_id"),
    campaignId: text("campaign_id"),
    h: text("h"),
    syncedAt: tz("synced_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.skuId] }), index("tt_aol_creator").on(t.creator), index("tt_aol_created").on(t.createdAt), index("tt_aol_product").on(t.productId, t.createdAt), index("tt_aol_content").on(t.contentId)],
);

export const ttVideos = pgTable(
  "tt_videos",
  {
    videoId: text("video_id").primaryKey(),
    creator: text("creator"),
    title: text("title"),
    postedAt: tz("posted_at"),
    views: bigint("views", { mode: "number" }),
    gmv: numeric("gmv", { precision: 14, scale: 2 }),
    unitsSold: integer("units_sold"),
    clickThroughRate: numeric("click_through_rate", { precision: 12, scale: 6 }),
    products: jsonb("products"),
    windowStart: date("window_start"),
    windowEnd: date("window_end"),
    h: text("h"),
    firstSeenAt: tz("first_seen_at").notNull().defaultNow(),
    syncedAt: tz("synced_at").notNull().defaultNow(),
  },
  (t) => [index("tt_videos_creator").on(t.creator), index("tt_videos_posted").on(t.postedAt)],
);

export const ttLives = pgTable(
  "tt_lives",
  {
    liveId: text("live_id").primaryKey(),
    creator: text("creator"),
    title: text("title"),
    startedAt: tz("started_at"),
    endedAt: tz("ended_at"),
    gmv: numeric("gmv", { precision: 14, scale: 2 }),
    itemsSold: integer("items_sold"),
    skuOrders: integer("sku_orders"),
    customers: integer("customers"),
    viewers: bigint("viewers", { mode: "number" }),
    views: bigint("views", { mode: "number" }),
    avgViewingSeconds: numeric("avg_viewing_seconds", { precision: 12, scale: 2 }),
    newFollowers: integer("new_followers"),
    likes: integer("likes"),
    comments: integer("comments"),
    shares: integer("shares"),
    productClicks: integer("product_clicks"),
    clickThroughRate: numeric("click_through_rate", { precision: 12, scale: 6 }),
    clickToOrderRate: numeric("click_to_order_rate", { precision: 12, scale: 6 }),
    h: text("h"),
    firstSeenAt: tz("first_seen_at").notNull().defaultNow(),
    syncedAt: tz("synced_at").notNull().defaultNow(),
  },
  (t) => [index("tt_lives_creator").on(t.creator), index("tt_lives_started").on(t.startedAt)],
);

export const ttSampleRequests = pgTable(
  "tt_sample_requests",
  {
    id: text("id").primaryKey(),
    status: text("status"),
    creatorId: text("creator_id"),
    creator: text("creator"),
    nickname: text("nickname"),
    followers: bigint("followers", { mode: "number" }),
    creatorGmv: numeric("creator_gmv", { precision: 14, scale: 2 }),
    creatorVideos: integer("creator_videos"),
    creatorVideoViews: bigint("creator_video_views", { mode: "number" }),
    fulfilmentPct: numeric("fulfilment_pct", { precision: 8, scale: 2 }),
    productId: text("product_id"),
    skuId: text("sku_id"),
    productTitle: text("product_title"),
    skuName: text("sku_name"),
    commissionRate: numeric("commission_rate", { precision: 12, scale: 4 }),
    orderId: text("order_id"),
    isApprovable: boolean("is_approvable"),
    expiresAt: tz("expires_at"),
    availableQuantity: integer("available_quantity"),
    h: text("h"),
    firstSeenAt: tz("first_seen_at").notNull().defaultNow(),
    syncedAt: tz("synced_at").notNull().defaultNow(),
  },
  (t) => [index("tt_samples_creator").on(t.creator)],
);

export const ttSkus = pgTable("tt_skus", {
  skuId: text("sku_id").primaryKey(),
  productId: text("product_id"),
  productTitle: text("product_title"),
  sellerSku: text("seller_sku"),
  price: numeric("price", { precision: 14, scale: 2 }),
  currency: text("currency"),
  stock: integer("stock"),
  productStatus: text("product_status"),
  updatedAt: tz("updated_at"),
  h: text("h"),
  syncedAt: tz("synced_at").notNull().defaultNow(),
});

export const ttReturns = pgTable("tt_returns", {
  returnId: text("return_id").primaryKey(),
  orderId: text("order_id"),
  status: text("status"),
  returnType: text("return_type"),
  reason: text("reason"),
  refundAmount: numeric("refund_amount", { precision: 14, scale: 2 }),
  currency: text("currency"),
  skus: jsonb("skus"),
  createdAt: tz("created_at"),
  updatedAt: tz("updated_at"),
  h: text("h"),
  syncedAt: tz("synced_at").notNull().defaultNow(),
});

export const ttCancellations = pgTable("tt_cancellations", {
  cancelId: text("cancel_id").primaryKey(),
  orderId: text("order_id"),
  status: text("status"),
  cancelType: text("cancel_type"),
  reason: text("reason"),
  skus: jsonb("skus"),
  createdAt: tz("created_at"),
  updatedAt: tz("updated_at"),
  h: text("h"),
  syncedAt: tz("synced_at").notNull().defaultNow(),
});

export const ttShopDaily = pgTable("tt_shop_daily", {
  day: date("day").primaryKey(),
  gmv: numeric("gmv", { precision: 14, scale: 2 }),
  orders: integer("orders"),
  buyers: integer("buyers"),
  unitsSold: integer("units_sold"),
  refunds: numeric("refunds", { precision: 14, scale: 2 }),
  returnsCancellations: integer("returns_cancellations"),
  pageViews: bigint("page_views", { mode: "number" }),
  impressions: bigint("impressions", { mode: "number" }),
  avgOrderValue: numeric("avg_order_value", { precision: 14, scale: 2 }),
  h: text("h"),
  syncedAt: tz("synced_at").notNull().defaultNow(),
});

// Data Sync additions. Mirrors migrations/0007_sync_orders_collabs.sql
export const ttOrders = pgTable("tt_orders", {
  orderId: text("order_id").primaryKey(),
  status: text("status"),
  isSample: boolean("is_sample"),
  createdAt: tz("created_at"),
  paidAt: tz("paid_at"),
  updatedAt: tz("updated_at"),
  deliveredAt: tz("delivered_at"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }),
  currency: text("currency"),
  trackingNumber: text("tracking_number"),
  shippingProvider: text("shipping_provider"),
  lines: jsonb("lines"),
  isFinal: boolean("is_final").notNull().default(false),
  h: text("h"),
  syncedAt: tz("synced_at").notNull().defaultNow(),
});

export const ttOpenCollabs = pgTable("tt_open_collabs", {
  id: text("id").primaryKey(),
  productId: text("product_id"),
  title: text("title"),
  status: text("status"),
  commissionRate: numeric("commission_rate", { precision: 12, scale: 4 }),
  commissionStart: tz("commission_start"),
  commissionEnd: tz("commission_end"),
  creators: integer("creators"),
  showcasing: integer("showcasing"),
  needsApproval: boolean("needs_approval"),
  stock: integer("stock"),
  priceMin: numeric("price_min", { precision: 14, scale: 2 }),
  priceMax: numeric("price_max", { precision: 14, scale: 2 }),
  h: text("h"),
  syncedAt: tz("synced_at").notNull().defaultNow(),
});

// Mirrors migrations/0008_video_windows.sql
export const ttVideoWindows = pgTable(
  "tt_video_windows",
  {
    videoId: text("video_id").notNull(),
    windowStart: date("window_start").notNull(),
    windowEnd: date("window_end").notNull(),
    views: bigint("views", { mode: "number" }),
    gmv: numeric("gmv", { precision: 14, scale: 2 }),
    unitsSold: integer("units_sold"),
    clickThroughRate: numeric("click_through_rate", { precision: 12, scale: 6 }),
    h: text("h"),
    syncedAt: tz("synced_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.windowStart] }), index("tt_video_windows_video").on(t.videoId)],
);

// Mirrors migrations/0009_creator_owners.sql
export const creatorOwners = pgTable(
  "creator_owners",
  {
    username: text("username").primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    assignedAt: tz("assigned_at").notNull().defaultNow(),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("creator_owners_user").on(t.userId)],
);

// Mirrors migrations/0010_creator_daily_counts.sql
export const creatorDailyCounts = pgTable("creator_daily_counts", {
  day: date("day").primaryKey(),
  creators: integer("creators").notNull(),
  sellers: integer("sellers").notNull(),
  todo: integer("todo").notNull(),
  unowned: integer("unowned").notNull(),
  recordedAt: tz("recorded_at").notNull().defaultNow(),
});

// Mirrors migrations/0011 + 0013: the automatic answer of which of the 13 products a TikTok listing is
export const productMap = pgTable("product_map", {
  productId: text("product_id").primaryKey(),
  productKey: text("product_key").notNull(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

// Mirrors migrations/0014: the Execution Plan (tasks written from the product analysis)
export const epTasks = pgTable("ep_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  fingerprint: text("fingerprint").notNull(),
  productKey: text("product_key").notNull(),
  category: text("category").notNull(),
  kind: text("kind").notNull(),
  priority: integer("priority").notNull().default(2),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  steps: jsonb("steps").notNull().default(sql`'[]'::jsonb`),
  stepsDone: jsonb("steps_done").notNull().default(sql`'[]'::jsonb`),
  creators: jsonb("creators").notNull().default(sql`'[]'::jsonb`),
  evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
  impactRm: numeric("impact_rm").notNull().default("0"),
  status: text("status").notNull().default("not_started"),
  dueOn: date("due_on", { mode: "string" }),
  closedReason: text("closed_reason"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  completedAt: tz("completed_at"),
}, (t) => [uniqueIndex("ep_tasks_open_fingerprint").on(t.fingerprint).where(sql`status in ('not_started', 'pending')`), index("ep_tasks_product").on(t.productKey, t.status), index("ep_tasks_status").on(t.status, t.updatedAt)]);
export const epTaskAssignees = pgTable("ep_task_assignees", {
  taskId: uuid("task_id").notNull().references(() => epTasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
  assignedAt: tz("assigned_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.taskId, t.userId] })]);
export const epEvents = pgTable("ep_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  taskId: uuid("task_id").notNull().references(() => epTasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  text: text("text"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

// Mirrors migrations/0015: every creator an Execution Plan action is about, and whether they were contacted
export const epTaskCreators = pgTable("ep_task_creators", {
  taskId: uuid("task_id").notNull().references(() => epTasks.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  rank: integer("rank").notNull().default(0),
  note: text("note").notNull().default(""),
  value: numeric("value").notNull().default("0"),
  data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
  contactedAt: tz("contacted_at"),
  contactedBy: uuid("contacted_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => [primaryKey({ columns: [t.taskId, t.username] }), index("ep_task_creators_rank").on(t.taskId, t.rank), index("ep_task_creators_user").on(t.username)]);

// ───────── TikTok Ads (Business API) sync for GMV Max. Mirrors migrations/0020_ads_sync.sql ─────────
export const adsSyncRuns = pgTable(
  "ads_sync_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    dataset: text("dataset").notNull(),
    startedAt: tz("started_at").notNull().defaultNow(),
    finishedAt: tz("finished_at"),
    status: text("status").notNull().default("running"),
    trigger: text("trigger").notNull().default("manual"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    pages: integer("pages").notNull().default(0),
    rowsSeen: integer("rows_seen").notNull().default(0),
    rowsChanged: integer("rows_changed").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("ads_sync_runs_dataset_started").on(t.dataset, t.startedAt)],
);

export const adsSyncState = pgTable("ads_sync_state", {
  dataset: text("dataset").primaryKey(),
  watermark: tz("watermark"),
  lastSuccessAt: tz("last_success_at"),
  lastError: text("last_error"),
  lastErrorAt: tz("last_error_at"),
  records: integer("records").notNull().default(0),
  sample: jsonb("sample"),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const adsAdvertisers = pgTable("ads_advertisers", {
  advertiserId: text("advertiser_id").primaryKey(),
  name: text("name"),
  currency: text("currency"),
  timezone: text("timezone"),
  status: text("status"),
  raw: jsonb("raw"),
  h: text("h"),
  syncedAt: tz("synced_at").notNull().defaultNow(),
});

export const adsStores = pgTable("ads_stores", {
  advertiserId: text("advertiser_id").notNull(),
  storeId: text("store_id").notNull(),
  storeName: text("store_name"),
  storeCode: text("store_code"),
  bcId: text("bc_id"),
  available: boolean("available"),
  raw: jsonb("raw"),
  h: text("h"),
  syncedAt: tz("synced_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.advertiserId, t.storeId] })]);

export const adsCampaigns = pgTable("ads_campaigns", {
  advertiserId: text("advertiser_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  storeId: text("store_id"),
  name: text("name"),
  status: text("status"),
  promotionType: text("promotion_type"),
  budget: numeric("budget", { precision: 14, scale: 2 }),
  roasTarget: numeric("roas_target", { precision: 12, scale: 4 }),
  createdAt: tz("created_at"),
  modifiedAt: tz("modified_at"),
  raw: jsonb("raw"),
  h: text("h"),
  syncedAt: tz("synced_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.advertiserId, t.campaignId] }), index("ads_campaigns_status").on(t.status)]);

export const adsCampaignDaily = pgTable("ads_campaign_daily", {
  advertiserId: text("advertiser_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  day: date("day").notNull(),
  cost: numeric("cost", { precision: 14, scale: 2 }),
  netCost: numeric("net_cost", { precision: 14, scale: 2 }),
  orders: integer("orders"),
  grossRevenue: numeric("gross_revenue", { precision: 14, scale: 2 }),
  roi: numeric("roi", { precision: 14, scale: 4 }),
  costPerOrder: numeric("cost_per_order", { precision: 14, scale: 2 }),
  raw: jsonb("raw"),
  h: text("h"),
  syncedAt: tz("synced_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.advertiserId, t.campaignId, t.day] }), index("ads_campaign_daily_day").on(t.day)]);

export const adsCreativeDaily = pgTable("ads_creative_daily", {
  advertiserId: text("advertiser_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  creativeId: text("creative_id").notNull(),
  day: date("day").notNull(),
  title: text("title"),
  accountName: text("account_name"),
  contentType: text("content_type"),
  cost: numeric("cost", { precision: 14, scale: 2 }),
  orders: integer("orders"),
  grossRevenue: numeric("gross_revenue", { precision: 14, scale: 2 }),
  roi: numeric("roi", { precision: 14, scale: 4 }),
  views: bigint("views", { mode: "number" }),
  raw: jsonb("raw"),
  h: text("h"),
  syncedAt: tz("synced_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.advertiserId, t.campaignId, t.creativeId, t.day] }), index("ads_creative_daily_day").on(t.day), index("ads_creative_daily_creative").on(t.creativeId)]);

export const adsProductDaily = pgTable("ads_product_daily", {
  advertiserId: text("advertiser_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  productId: text("product_id").notNull(),
  day: date("day").notNull(),
  title: text("title"),
  cost: numeric("cost", { precision: 14, scale: 2 }),
  orders: integer("orders"),
  grossRevenue: numeric("gross_revenue", { precision: 14, scale: 2 }),
  roi: numeric("roi", { precision: 14, scale: 4 }),
  raw: jsonb("raw"),
  h: text("h"),
  syncedAt: tz("synced_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.advertiserId, t.campaignId, t.productId, t.day] }), index("ads_product_daily_day").on(t.day)]);
