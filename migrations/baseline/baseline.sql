--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ads_advertisers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ads_advertisers (
    advertiser_id text NOT NULL,
    name text,
    currency text,
    timezone text,
    status text,
    raw jsonb,
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ads_campaign_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ads_campaign_daily (
    advertiser_id text NOT NULL,
    campaign_id text NOT NULL,
    day date NOT NULL,
    cost numeric(14,2),
    net_cost numeric(14,2),
    orders integer,
    gross_revenue numeric(14,2),
    roi numeric(14,4),
    cost_per_order numeric(14,2),
    raw jsonb,
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ads_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ads_campaigns (
    advertiser_id text NOT NULL,
    campaign_id text NOT NULL,
    store_id text,
    name text,
    status text,
    promotion_type text,
    budget numeric(14,2),
    roas_target numeric(12,4),
    created_at timestamp with time zone,
    modified_at timestamp with time zone,
    raw jsonb,
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ads_creative_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ads_creative_daily (
    advertiser_id text NOT NULL,
    campaign_id text NOT NULL,
    product_id text NOT NULL,
    creative_id text NOT NULL,
    day date NOT NULL,
    title text,
    account_name text,
    content_type text,
    cost numeric(14,2),
    orders integer,
    gross_revenue numeric(14,2),
    roi numeric(14,4),
    cost_per_order numeric(14,2),
    impressions bigint,
    clicks bigint,
    click_rate numeric(12,6),
    conversion_rate numeric(12,6),
    view_rate_2s numeric(12,6),
    view_rate_6s numeric(12,6),
    raw jsonb,
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ads_product_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ads_product_daily (
    advertiser_id text NOT NULL,
    campaign_id text NOT NULL,
    product_id text NOT NULL,
    day date NOT NULL,
    title text,
    cost numeric(14,2),
    orders integer,
    gross_revenue numeric(14,2),
    roi numeric(14,4),
    cost_per_order numeric(14,2),
    impressions bigint,
    clicks bigint,
    click_rate numeric(12,6),
    conversion_rate numeric(12,6),
    raw jsonb,
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ads_stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ads_stores (
    advertiser_id text NOT NULL,
    store_id text NOT NULL,
    store_name text,
    store_code text,
    bc_id text,
    available boolean,
    raw jsonb,
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ads_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ads_sync_runs (
    id bigint NOT NULL,
    dataset text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    trigger text DEFAULT 'manual'::text NOT NULL,
    user_id uuid,
    pages integer DEFAULT 0 NOT NULL,
    rows_seen integer DEFAULT 0 NOT NULL,
    rows_changed integer DEFAULT 0 NOT NULL,
    error text
);


--
-- Name: ads_sync_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ads_sync_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ads_sync_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ads_sync_runs_id_seq OWNED BY public.ads_sync_runs.id;


--
-- Name: ads_sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ads_sync_state (
    dataset text NOT NULL,
    watermark timestamp with time zone,
    last_success_at timestamp with time zone,
    last_error text,
    last_error_at timestamp with time zone,
    records integer DEFAULT 0 NOT NULL,
    sample jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: commitment_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commitment_changes (
    id integer NOT NULL,
    commitment_id integer NOT NULL,
    event_id integer NOT NULL,
    from_on date NOT NULL,
    to_on date NOT NULL
);


--
-- Name: commitment_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.commitment_changes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: commitment_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.commitment_changes_id_seq OWNED BY public.commitment_changes.id;


--
-- Name: commitment_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commitment_status (
    commitment_id integer NOT NULL,
    state text NOT NULL,
    needed integer DEFAULT 1 NOT NULL,
    done integer DEFAULT 0 NOT NULL,
    original_on date NOT NULL,
    due_on date NOT NULL,
    completed_on date,
    timing text,
    content_ids text[] DEFAULT '{}'::text[] NOT NULL,
    candidate_ids text[] DEFAULT '{}'::text[] NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: commitments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commitments (
    id integer NOT NULL,
    username text NOT NULL,
    event_id integer NOT NULL,
    promised_on date NOT NULL,
    details text,
    content_type text,
    quantity integer,
    product_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: commitments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.commitments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: commitments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.commitments_id_seq OWNED BY public.commitments.id;


--
-- Name: content_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_decisions (
    id integer NOT NULL,
    username text NOT NULL,
    commitment_id integer,
    content_id text,
    link text,
    decision text NOT NULL,
    user_id uuid,
    at timestamp with time zone DEFAULT now() NOT NULL,
    note text,
    shared boolean DEFAULT false NOT NULL,
    synthetic boolean DEFAULT false NOT NULL,
    reverted_at timestamp with time zone,
    reverted_by uuid
);


--
-- Name: content_decisions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.content_decisions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: content_decisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.content_decisions_id_seq OWNED BY public.content_decisions.id;


--
-- Name: product_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_map (
    product_id text NOT NULL,
    product_key text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tt_lives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_lives (
    live_id text NOT NULL,
    creator text,
    title text,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    gmv numeric(14,2),
    items_sold integer,
    sku_orders integer,
    customers integer,
    viewers bigint,
    views bigint,
    avg_viewing_seconds numeric(12,2),
    new_followers integer,
    likes integer,
    comments integer,
    shares integer,
    product_clicks integer,
    click_through_rate numeric(12,6),
    click_to_order_rate numeric(12,6),
    h text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tt_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_videos (
    video_id text NOT NULL,
    creator text,
    title text,
    posted_at timestamp with time zone,
    views bigint,
    gmv numeric(14,2),
    units_sold integer,
    click_through_rate numeric(12,6),
    products jsonb,
    window_start date,
    window_end date,
    h text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: content_items; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.content_items AS
 SELECT v.video_id AS content_id,
    v.creator,
    'video'::text AS kind,
    COALESCE(( SELECT array_agg(DISTINCT pm.product_key) AS array_agg
           FROM (jsonb_array_elements(COALESCE(v.products, '[]'::jsonb)) p(value)
             JOIN public.product_map pm ON ((pm.product_id = (p.value ->> 'id'::text))))
          WHERE (pm.product_key <> 'excluded'::text)), '{}'::text[]) AS product_ids,
    (v.posted_at AT TIME ZONE 'Asia/Kuala_Lumpur'::text) AS posted_at,
    ((COALESCE(v.posted_at, v.first_seen_at) AT TIME ZONE 'Asia/Kuala_Lumpur'::text))::date AS first_observed_on,
    ((('https://www.tiktok.com/@'::text || v.creator) || '/video/'::text) || v.video_id) AS link,
    COALESCE(v.views, (0)::bigint) AS views,
    'tiktok'::text AS source
   FROM public.tt_videos v
  WHERE (v.creator IS NOT NULL)
UNION ALL
 SELECT ('live:'::text || l.live_id) AS content_id,
    l.creator,
    'live'::text AS kind,
    '{}'::text[] AS product_ids,
    (l.started_at AT TIME ZONE 'Asia/Kuala_Lumpur'::text) AS posted_at,
    ((COALESCE(l.started_at, l.first_seen_at) AT TIME ZONE 'Asia/Kuala_Lumpur'::text))::date AS first_observed_on,
    NULL::text AS link,
    COALESCE(l.views, (0)::bigint) AS views,
    'tiktok'::text AS source
   FROM public.tt_lives l
  WHERE (l.creator IS NOT NULL);


--
-- Name: creator_daily_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_daily_counts (
    day date NOT NULL,
    creators integer NOT NULL,
    sellers integer NOT NULL,
    todo integer NOT NULL,
    unowned integer NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: creator_owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_owners (
    username text NOT NULL,
    user_id uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by uuid
);


--
-- Name: creators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creators (
    username text NOT NULL,
    notes text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    do_not_contact boolean DEFAULT false NOT NULL,
    phone text,
    approach text,
    owner_id uuid,
    contact_edited boolean DEFAULT false NOT NULL,
    platform text DEFAULT 'tiktok'::text NOT NULL,
    source text DEFAULT 'import'::text NOT NULL,
    added_by uuid,
    added_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ep_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ep_events (
    id bigint NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid,
    kind text NOT NULL,
    text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ep_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ep_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ep_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ep_events_id_seq OWNED BY public.ep_events.id;


--
-- Name: ep_task_assignees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ep_task_assignees (
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ep_task_creators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ep_task_creators (
    task_id uuid NOT NULL,
    username text NOT NULL,
    rank integer DEFAULT 0 NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    value numeric DEFAULT 0 NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    contacted_at timestamp with time zone,
    contacted_by uuid
);


--
-- Name: ep_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ep_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fingerprint text NOT NULL,
    product_key text NOT NULL,
    category text NOT NULL,
    kind text NOT NULL,
    priority smallint DEFAULT 2 NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    steps_done jsonb DEFAULT '[]'::jsonb NOT NULL,
    creators jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    impact_rm numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    due_on date,
    closed_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission text NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    token_hash text NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_events (
    id integer NOT NULL,
    username text NOT NULL,
    kind text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    details jsonb,
    batch_id text,
    synthetic boolean DEFAULT false NOT NULL,
    reverted_at timestamp with time zone,
    reverted_by uuid
);


--
-- Name: staff_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_events_id_seq OWNED BY public.staff_events.id;


--
-- Name: tt_affiliate_order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_affiliate_order_lines (
    order_id text NOT NULL,
    sku_id text NOT NULL,
    created_at timestamp with time zone,
    delivery_at timestamp with time zone,
    creator text,
    content_id text,
    content_type text,
    product_id text,
    seller_sku text,
    sku_name text,
    quantity integer,
    price numeric(14,2),
    currency text,
    commission_rate numeric(12,4),
    est_commission numeric(14,2),
    paid_commission numeric(14,2),
    settlement_status text,
    fully_return boolean,
    open_collab_id text,
    target_collab_id text,
    campaign_id text,
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tt_cancellations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_cancellations (
    cancel_id text NOT NULL,
    order_id text,
    status text,
    cancel_type text,
    reason text,
    skus jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tt_open_collabs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_open_collabs (
    id text NOT NULL,
    product_id text,
    title text,
    status text,
    commission_rate numeric(12,4),
    commission_start timestamp with time zone,
    commission_end timestamp with time zone,
    creators integer,
    showcasing integer,
    needs_approval boolean,
    stock integer,
    price_min numeric(14,2),
    price_max numeric(14,2),
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tt_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_orders (
    order_id text NOT NULL,
    status text,
    is_sample boolean,
    created_at timestamp with time zone,
    paid_at timestamp with time zone,
    updated_at timestamp with time zone,
    delivered_at timestamp with time zone,
    total_amount numeric(14,2),
    currency text,
    tracking_number text,
    shipping_provider text,
    lines jsonb,
    is_final boolean DEFAULT false NOT NULL,
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tt_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_returns (
    return_id text NOT NULL,
    order_id text,
    status text,
    return_type text,
    reason text,
    refund_amount numeric(14,2),
    currency text,
    skus jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tt_sample_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_sample_requests (
    id text NOT NULL,
    status text,
    creator_id text,
    creator text,
    nickname text,
    followers bigint,
    creator_gmv numeric(14,2),
    creator_videos integer,
    creator_video_views bigint,
    fulfilment_pct numeric(8,2),
    product_id text,
    sku_id text,
    product_title text,
    sku_name text,
    commission_rate numeric(12,4),
    order_id text,
    is_approvable boolean,
    expires_at timestamp with time zone,
    available_quantity integer,
    h text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tt_shop_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_shop_daily (
    day date NOT NULL,
    gmv numeric(14,2),
    orders integer,
    buyers integer,
    units_sold integer,
    refunds numeric(14,2),
    returns_cancellations integer,
    page_views bigint,
    impressions bigint,
    avg_order_value numeric(14,2),
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tt_skus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_skus (
    sku_id text NOT NULL,
    product_id text,
    product_title text,
    seller_sku text,
    price numeric(14,2),
    currency text,
    stock integer,
    product_status text,
    updated_at timestamp with time zone,
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tt_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_sync_runs (
    id bigint NOT NULL,
    dataset text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    trigger text DEFAULT 'manual'::text NOT NULL,
    user_id uuid,
    pages integer DEFAULT 0 NOT NULL,
    rows_seen integer DEFAULT 0 NOT NULL,
    rows_changed integer DEFAULT 0 NOT NULL,
    error text
);


--
-- Name: tt_sync_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tt_sync_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tt_sync_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tt_sync_runs_id_seq OWNED BY public.tt_sync_runs.id;


--
-- Name: tt_sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_sync_state (
    dataset text NOT NULL,
    watermark timestamp with time zone,
    last_success_at timestamp with time zone,
    last_error text,
    last_error_at timestamp with time zone,
    records integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tt_video_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_video_windows (
    video_id text NOT NULL,
    window_start date NOT NULL,
    window_end date NOT NULL,
    views bigint,
    gmv numeric(14,2),
    units_sold integer,
    click_through_rate numeric(12,6),
    h text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    password_hash text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    role_id uuid NOT NULL,
    last_login_at timestamp without time zone
);


--
-- Name: ads_sync_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_sync_runs ALTER COLUMN id SET DEFAULT nextval('public.ads_sync_runs_id_seq'::regclass);


--
-- Name: commitment_changes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commitment_changes ALTER COLUMN id SET DEFAULT nextval('public.commitment_changes_id_seq'::regclass);


--
-- Name: commitments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commitments ALTER COLUMN id SET DEFAULT nextval('public.commitments_id_seq'::regclass);


--
-- Name: content_decisions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_decisions ALTER COLUMN id SET DEFAULT nextval('public.content_decisions_id_seq'::regclass);


--
-- Name: ep_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ep_events ALTER COLUMN id SET DEFAULT nextval('public.ep_events_id_seq'::regclass);


--
-- Name: staff_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_events ALTER COLUMN id SET DEFAULT nextval('public.staff_events_id_seq'::regclass);


--
-- Name: tt_sync_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_sync_runs ALTER COLUMN id SET DEFAULT nextval('public.tt_sync_runs_id_seq'::regclass);


--
-- Name: ads_advertisers ads_advertisers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_advertisers
    ADD CONSTRAINT ads_advertisers_pkey PRIMARY KEY (advertiser_id);


--
-- Name: ads_campaign_daily ads_campaign_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_campaign_daily
    ADD CONSTRAINT ads_campaign_daily_pkey PRIMARY KEY (advertiser_id, campaign_id, day);


--
-- Name: ads_campaigns ads_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_campaigns
    ADD CONSTRAINT ads_campaigns_pkey PRIMARY KEY (advertiser_id, campaign_id);


--
-- Name: ads_creative_daily ads_creative_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_creative_daily
    ADD CONSTRAINT ads_creative_daily_pkey PRIMARY KEY (advertiser_id, campaign_id, product_id, creative_id, day);


--
-- Name: ads_product_daily ads_product_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_product_daily
    ADD CONSTRAINT ads_product_daily_pkey PRIMARY KEY (advertiser_id, campaign_id, product_id, day);


--
-- Name: ads_stores ads_stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_stores
    ADD CONSTRAINT ads_stores_pkey PRIMARY KEY (advertiser_id, store_id);


--
-- Name: ads_sync_runs ads_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_sync_runs
    ADD CONSTRAINT ads_sync_runs_pkey PRIMARY KEY (id);


--
-- Name: ads_sync_state ads_sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_sync_state
    ADD CONSTRAINT ads_sync_state_pkey PRIMARY KEY (dataset);


--
-- Name: commitment_changes commitment_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commitment_changes
    ADD CONSTRAINT commitment_changes_pkey PRIMARY KEY (id);


--
-- Name: commitment_status commitment_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commitment_status
    ADD CONSTRAINT commitment_status_pkey PRIMARY KEY (commitment_id);


--
-- Name: commitments commitments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commitments
    ADD CONSTRAINT commitments_pkey PRIMARY KEY (id);


--
-- Name: content_decisions content_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_decisions
    ADD CONSTRAINT content_decisions_pkey PRIMARY KEY (id);


--
-- Name: creator_daily_counts creator_daily_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_daily_counts
    ADD CONSTRAINT creator_daily_counts_pkey PRIMARY KEY (day);


--
-- Name: creator_owners creator_owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_owners
    ADD CONSTRAINT creator_owners_pkey PRIMARY KEY (username);


--
-- Name: creators creators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creators
    ADD CONSTRAINT creators_pkey PRIMARY KEY (username);


--
-- Name: ep_events ep_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ep_events
    ADD CONSTRAINT ep_events_pkey PRIMARY KEY (id);


--
-- Name: ep_task_assignees ep_task_assignees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ep_task_assignees
    ADD CONSTRAINT ep_task_assignees_pkey PRIMARY KEY (task_id, user_id);


--
-- Name: ep_task_creators ep_task_creators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ep_task_creators
    ADD CONSTRAINT ep_task_creators_pkey PRIMARY KEY (task_id, username);


--
-- Name: ep_tasks ep_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ep_tasks
    ADD CONSTRAINT ep_tasks_pkey PRIMARY KEY (id);


--
-- Name: product_map product_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_map
    ADD CONSTRAINT product_map_pkey PRIMARY KEY (product_id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission);


--
-- Name: roles roles_key_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_key_uq UNIQUE (key);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (name);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token_hash);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: staff_events staff_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_events
    ADD CONSTRAINT staff_events_pkey PRIMARY KEY (id);


--
-- Name: tt_affiliate_order_lines tt_affiliate_order_lines_order_id_sku_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_affiliate_order_lines
    ADD CONSTRAINT tt_affiliate_order_lines_order_id_sku_id_pk PRIMARY KEY (order_id, sku_id);


--
-- Name: tt_cancellations tt_cancellations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_cancellations
    ADD CONSTRAINT tt_cancellations_pkey PRIMARY KEY (cancel_id);


--
-- Name: tt_lives tt_lives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_lives
    ADD CONSTRAINT tt_lives_pkey PRIMARY KEY (live_id);


--
-- Name: tt_open_collabs tt_open_collabs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_open_collabs
    ADD CONSTRAINT tt_open_collabs_pkey PRIMARY KEY (id);


--
-- Name: tt_orders tt_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_orders
    ADD CONSTRAINT tt_orders_pkey PRIMARY KEY (order_id);


--
-- Name: tt_returns tt_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_returns
    ADD CONSTRAINT tt_returns_pkey PRIMARY KEY (return_id);


--
-- Name: tt_sample_requests tt_sample_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_sample_requests
    ADD CONSTRAINT tt_sample_requests_pkey PRIMARY KEY (id);


--
-- Name: tt_shop_daily tt_shop_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_shop_daily
    ADD CONSTRAINT tt_shop_daily_pkey PRIMARY KEY (day);


--
-- Name: tt_skus tt_skus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_skus
    ADD CONSTRAINT tt_skus_pkey PRIMARY KEY (sku_id);


--
-- Name: tt_sync_runs tt_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_sync_runs
    ADD CONSTRAINT tt_sync_runs_pkey PRIMARY KEY (id);


--
-- Name: tt_sync_state tt_sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_sync_state
    ADD CONSTRAINT tt_sync_state_pkey PRIMARY KEY (dataset);


--
-- Name: tt_video_windows tt_video_windows_video_id_window_start_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_video_windows
    ADD CONSTRAINT tt_video_windows_video_id_window_start_pk PRIMARY KEY (video_id, window_start);


--
-- Name: tt_videos tt_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_videos
    ADD CONSTRAINT tt_videos_pkey PRIMARY KEY (video_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: ads_campaign_daily_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ads_campaign_daily_day ON public.ads_campaign_daily USING btree (day);


--
-- Name: ads_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ads_campaigns_status ON public.ads_campaigns USING btree (status);


--
-- Name: ads_creative_daily_creative; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ads_creative_daily_creative ON public.ads_creative_daily USING btree (creative_id);


--
-- Name: ads_creative_daily_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ads_creative_daily_day ON public.ads_creative_daily USING btree (day);


--
-- Name: ads_product_daily_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ads_product_daily_day ON public.ads_product_daily USING btree (day);


--
-- Name: ads_sync_runs_dataset_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ads_sync_runs_dataset_started ON public.ads_sync_runs USING btree (dataset, started_at DESC);


--
-- Name: commitment_changes_commitment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commitment_changes_commitment_idx ON public.commitment_changes USING btree (commitment_id);


--
-- Name: commitment_changes_event_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX commitment_changes_event_uq ON public.commitment_changes USING btree (event_id);


--
-- Name: commitments_event_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX commitments_event_uq ON public.commitments USING btree (event_id);


--
-- Name: commitments_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commitments_user_idx ON public.commitments USING btree (username);


--
-- Name: content_decisions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_decisions_user_idx ON public.content_decisions USING btree (username);


--
-- Name: creator_owners_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_owners_user ON public.creator_owners USING btree (user_id);


--
-- Name: ep_events_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ep_events_task ON public.ep_events USING btree (task_id, created_at);


--
-- Name: ep_task_creators_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ep_task_creators_rank ON public.ep_task_creators USING btree (task_id, rank);


--
-- Name: ep_task_creators_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ep_task_creators_user ON public.ep_task_creators USING btree (username);


--
-- Name: ep_tasks_open_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ep_tasks_open_fingerprint ON public.ep_tasks USING btree (fingerprint) WHERE (status = ANY (ARRAY['not_started'::text, 'pending'::text]));


--
-- Name: ep_tasks_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ep_tasks_product ON public.ep_tasks USING btree (product_key, status);


--
-- Name: ep_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ep_tasks_status ON public.ep_tasks USING btree (status, updated_at);


--
-- Name: staff_events_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_events_kind_idx ON public.staff_events USING btree (kind, at);


--
-- Name: staff_events_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_events_user_idx ON public.staff_events USING btree (username, at);


--
-- Name: tt_aol_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_aol_content ON public.tt_affiliate_order_lines USING btree (content_id);


--
-- Name: tt_aol_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_aol_created ON public.tt_affiliate_order_lines USING btree (created_at);


--
-- Name: tt_aol_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_aol_creator ON public.tt_affiliate_order_lines USING btree (creator);


--
-- Name: tt_aol_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_aol_product ON public.tt_affiliate_order_lines USING btree (product_id, created_at);


--
-- Name: tt_lives_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_lives_creator ON public.tt_lives USING btree (creator);


--
-- Name: tt_lives_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_lives_started ON public.tt_lives USING btree (started_at);


--
-- Name: tt_samples_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_samples_creator ON public.tt_sample_requests USING btree (creator);


--
-- Name: tt_sync_runs_dataset_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_sync_runs_dataset_started ON public.tt_sync_runs USING btree (dataset, started_at);


--
-- Name: tt_video_windows_video; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_video_windows_video ON public.tt_video_windows USING btree (video_id);


--
-- Name: tt_videos_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_videos_creator ON public.tt_videos USING btree (creator);


--
-- Name: tt_videos_posted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tt_videos_posted ON public.tt_videos USING btree (posted_at);


--
-- Name: ads_sync_runs ads_sync_runs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_sync_runs
    ADD CONSTRAINT ads_sync_runs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: commitment_changes commitment_changes_commitment_id_commitments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commitment_changes
    ADD CONSTRAINT commitment_changes_commitment_id_commitments_id_fk FOREIGN KEY (commitment_id) REFERENCES public.commitments(id) ON DELETE CASCADE;


--
-- Name: commitment_changes commitment_changes_event_id_staff_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commitment_changes
    ADD CONSTRAINT commitment_changes_event_id_staff_events_id_fk FOREIGN KEY (event_id) REFERENCES public.staff_events(id) ON DELETE CASCADE;


--
-- Name: commitment_status commitment_status_commitment_id_commitments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commitment_status
    ADD CONSTRAINT commitment_status_commitment_id_commitments_id_fk FOREIGN KEY (commitment_id) REFERENCES public.commitments(id) ON DELETE CASCADE;


--
-- Name: commitments commitments_event_id_staff_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commitments
    ADD CONSTRAINT commitments_event_id_staff_events_id_fk FOREIGN KEY (event_id) REFERENCES public.staff_events(id) ON DELETE CASCADE;


--
-- Name: content_decisions content_decisions_commitment_id_commitments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_decisions
    ADD CONSTRAINT content_decisions_commitment_id_commitments_id_fk FOREIGN KEY (commitment_id) REFERENCES public.commitments(id) ON DELETE CASCADE;


--
-- Name: content_decisions content_decisions_reverted_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_decisions
    ADD CONSTRAINT content_decisions_reverted_by_users_id_fk FOREIGN KEY (reverted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: content_decisions content_decisions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_decisions
    ADD CONSTRAINT content_decisions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: creator_owners creator_owners_assigned_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_owners
    ADD CONSTRAINT creator_owners_assigned_by_users_id_fk FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: creator_owners creator_owners_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_owners
    ADD CONSTRAINT creator_owners_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: creators creators_added_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creators
    ADD CONSTRAINT creators_added_by_users_id_fk FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: creators creators_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creators
    ADD CONSTRAINT creators_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ep_events ep_events_task_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ep_events
    ADD CONSTRAINT ep_events_task_id_fk FOREIGN KEY (task_id) REFERENCES public.ep_tasks(id) ON DELETE CASCADE;


--
-- Name: ep_events ep_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ep_events
    ADD CONSTRAINT ep_events_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ep_task_assignees ep_task_assignees_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ep_task_assignees
    ADD CONSTRAINT ep_task_assignees_by_users_id_fk FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ep_task_assignees ep_task_assignees_task_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ep_task_assignees
    ADD CONSTRAINT ep_task_assignees_task_id_fk FOREIGN KEY (task_id) REFERENCES public.ep_tasks(id) ON DELETE CASCADE;


--
-- Name: ep_task_assignees ep_task_assignees_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ep_task_assignees
    ADD CONSTRAINT ep_task_assignees_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ep_task_creators ep_task_creators_contacted_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ep_task_creators
    ADD CONSTRAINT ep_task_creators_contacted_by_users_id_fk FOREIGN KEY (contacted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ep_task_creators ep_task_creators_task_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ep_task_creators
    ADD CONSTRAINT ep_task_creators_task_id_fk FOREIGN KEY (task_id) REFERENCES public.ep_tasks(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fk FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: staff_events staff_events_reverted_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_events
    ADD CONSTRAINT staff_events_reverted_by_users_id_fk FOREIGN KEY (reverted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: staff_events staff_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_events
    ADD CONSTRAINT staff_events_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tt_sync_runs tt_sync_runs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_sync_runs
    ADD CONSTRAINT tt_sync_runs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: users users_role_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fk FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- PostgreSQL database dump complete
--

SET search_path TO public;

-- The only built-in role: Admin, with every screen. All other roles are created in the app.
insert into roles (key, name, description, is_admin) values
  ('admin', 'Admin', 'The owner. Can open every screen, always.', true);

insert into role_permissions (role_id, permission)
select r.id, p from roles r, unnest(array['execution','creators','products','sync','users','settings']) p where r.is_admin;
