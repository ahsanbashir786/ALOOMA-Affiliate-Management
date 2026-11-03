--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)


--
-- Name: action_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.action_status AS ENUM (
    'open',
    'in_progress',
    'sent',
    'done',
    'dismissed'
);


--
-- Name: role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role AS ENUM (
    'admin',
    'manager',
    'viewer'
);


--
-- Name: upload_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.upload_kind AS ENUM (
    'affiliate_orders',
    'all_orders',
    'creator_list',
    'creator_transactions',
    'video_list',
    'sample_analysis',
    'product_list',
    'sku_catalog',
    'staff_sheet',
    'contact_list'
);




--
-- Name: actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.actions (
    id integer NOT NULL,
    username text NOT NULL,
    type text NOT NULL,
    priority integer DEFAULT 50 NOT NULL,
    title text NOT NULL,
    reason text NOT NULL,
    instruction text NOT NULL,
    instruction_ms text,
    expected_uplift double precision DEFAULT 0 NOT NULL,
    baseline_gmv double precision DEFAULT 0 NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status public.action_status DEFAULT 'open'::public.action_status NOT NULL,
    assignee_id uuid,
    note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone
);


--
-- Name: actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.actions_id_seq OWNED BY public.actions.id;


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
    sample_ids integer[] DEFAULT '{}'::integer[] NOT NULL,
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
    sample_id integer,
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
-- Name: content_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_items (
    content_id text NOT NULL,
    creator text NOT NULL,
    kind text NOT NULL,
    product_ids text[] DEFAULT '{}'::text[] NOT NULL,
    posted_at timestamp without time zone,
    first_observed_on date,
    link text,
    views integer DEFAULT 0 NOT NULL,
    source text NOT NULL
);


--
-- Name: creator_list_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_list_snapshots (
    upload_id integer NOT NULL,
    username text NOT NULL,
    gmv double precision DEFAULT 0 NOT NULL,
    live_gmv double precision DEFAULT 0 NOT NULL,
    video_gmv double precision DEFAULT 0 NOT NULL,
    card_gmv double precision DEFAULT 0 NOT NULL,
    products_sold integer DEFAULT 0 NOT NULL,
    items_sold integer DEFAULT 0 NOT NULL,
    commission double precision DEFAULT 0 NOT NULL,
    aov double precision DEFAULT 0 NOT NULL,
    orders integer DEFAULT 0 NOT NULL,
    ctr double precision,
    impressions integer DEFAULT 0 NOT NULL,
    customers double precision DEFAULT 0 NOT NULL,
    live_streams integer DEFAULT 0 NOT NULL,
    videos integer DEFAULT 0 NOT NULL,
    target_gmv double precision DEFAULT 0 NOT NULL,
    target_commission double precision DEFAULT 0 NOT NULL,
    open_gmv double precision DEFAULT 0 NOT NULL,
    open_commission double precision DEFAULT 0 NOT NULL,
    refunded_gmv double precision DEFAULT 0 NOT NULL,
    items_refunded integer DEFAULT 0 NOT NULL,
    followers integer DEFAULT 0 NOT NULL
);


--
-- Name: creator_txn_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_txn_snapshots (
    upload_id integer NOT NULL,
    username text NOT NULL,
    gmv double precision DEFAULT 0 NOT NULL,
    live_gmv double precision DEFAULT 0 NOT NULL,
    video_gmv double precision DEFAULT 0 NOT NULL,
    card_gmv double precision DEFAULT 0 NOT NULL,
    refunds double precision DEFAULT 0 NOT NULL,
    orders integer DEFAULT 0 NOT NULL,
    items_sold integer DEFAULT 0 NOT NULL,
    items_refunded integer DEFAULT 0 NOT NULL,
    aov double precision DEFAULT 0 NOT NULL,
    ctor double precision,
    live_streams integer DEFAULT 0 NOT NULL,
    videos integer DEFAULT 0 NOT NULL,
    sample_content integer DEFAULT 0 NOT NULL,
    samples_shipped integer DEFAULT 0 NOT NULL,
    ctr double precision,
    impressions integer DEFAULT 0 NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    customers double precision,
    products_sold double precision,
    commission double precision DEFAULT 0 NOT NULL
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
-- Name: import_conflicts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_conflicts (
    id integer NOT NULL,
    kind text NOT NULL,
    order_id text NOT NULL,
    sku_id text NOT NULL,
    upload_id integer,
    reason text NOT NULL,
    stored jsonb NOT NULL,
    incoming jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid
);


--
-- Name: import_conflicts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.import_conflicts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: import_conflicts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.import_conflicts_id_seq OWNED BY public.import_conflicts.id;


--
-- Name: order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_lines (
    id bigint NOT NULL,
    order_id text NOT NULL,
    sku_id text NOT NULL,
    product_id text NOT NULL,
    sku_name text,
    seller_sku text,
    price double precision DEFAULT 0 NOT NULL,
    payment_amount double precision DEFAULT 0 NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    fully_refunded boolean DEFAULT false NOT NULL,
    cod boolean DEFAULT false NOT NULL,
    status text NOT NULL,
    creator text NOT NULL,
    content_type text NOT NULL,
    content_id text,
    commission_model text,
    commission_rate text,
    est_commission double precision DEFAULT 0 NOT NULL,
    actual_commission double precision DEFAULT 0 NOT NULL,
    est_ads_commission double precision DEFAULT 0 NOT NULL,
    actual_ads_commission double precision DEFAULT 0 NOT NULL,
    created_at timestamp without time zone NOT NULL,
    paid_at timestamp without time zone,
    delivered_at timestamp without time zone,
    commission_paid_at timestamp without time zone,
    asof timestamp without time zone,
    upload_id integer
);


--
-- Name: order_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_lines_id_seq OWNED BY public.order_lines.id;


--
-- Name: product_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_snapshots (
    upload_id integer NOT NULL,
    product_id text NOT NULL,
    gmv double precision DEFAULT 0 NOT NULL,
    items_sold integer DEFAULT 0 NOT NULL,
    commission double precision DEFAULT 0 NOT NULL,
    samples integer DEFAULT 0 NOT NULL,
    sales_creators integer DEFAULT 0 NOT NULL,
    live_streams integer DEFAULT 0 NOT NULL,
    videos integer DEFAULT 0 NOT NULL,
    refunded_gmv double precision DEFAULT 0 NOT NULL,
    refunded_items integer DEFAULT 0 NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    product_id text NOT NULL,
    name text NOT NULL,
    short_name text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendations (
    id integer NOT NULL,
    username text NOT NULL,
    type text NOT NULL,
    priority integer DEFAULT 50 NOT NULL,
    title text NOT NULL,
    reason text NOT NULL,
    instruction text NOT NULL,
    instruction_ms text,
    scenario_value double precision DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone
);


--
-- Name: recommendations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recommendations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recommendations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recommendations_id_seq OWNED BY public.recommendations.id;


--
-- Name: sample_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sample_content (
    sample_id integer NOT NULL,
    content_id text NOT NULL,
    kind text NOT NULL,
    link text,
    posted_at timestamp without time zone,
    views integer DEFAULT 0 NOT NULL,
    confidence text NOT NULL,
    reason text NOT NULL
);


--
-- Name: sample_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sample_sales (
    order_id text NOT NULL,
    sku_id text NOT NULL,
    sample_id integer NOT NULL,
    creator text NOT NULL,
    product_id text NOT NULL,
    content_id text,
    basis text NOT NULL,
    pay double precision NOT NULL
);


--
-- Name: sample_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sample_snapshots (
    upload_id integer NOT NULL,
    username text NOT NULL,
    content_gmv double precision DEFAULT 0 NOT NULL,
    requested integer DEFAULT 0 NOT NULL,
    shipped integer DEFAULT 0 NOT NULL,
    posting_rate double precision DEFAULT 0 NOT NULL,
    videos_with_samples integer DEFAULT 0 NOT NULL,
    live_with_samples integer DEFAULT 0 NOT NULL,
    roi45 double precision DEFAULT 0 NOT NULL,
    roi90 double precision DEFAULT 0 NOT NULL
);


--
-- Name: samples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.samples (
    id integer NOT NULL,
    source text DEFAULT 'orders'::text NOT NULL,
    order_id text,
    sku_id text,
    seller_sku text,
    product_name text,
    variation text,
    quantity integer DEFAULT 1 NOT NULL,
    buyer_masked text,
    creator text,
    creator_match text,
    order_status text,
    order_substatus text,
    raw_code text,
    requested_at date,
    approved_at timestamp without time zone,
    shipped_at timestamp without time zone,
    delivered_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    tracking_id text,
    shipping_provider text,
    result text,
    posted_at timestamp without time zone,
    post_video_id text,
    post_link text,
    product_id text,
    video_count integer DEFAULT 0 NOT NULL,
    other_video_count integer DEFAULT 0 NOT NULL,
    content_views integer DEFAULT 0 NOT NULL,
    post_by date,
    post_by_source text,
    content_gmv double precision DEFAULT 0 NOT NULL,
    content_orders integer DEFAULT 0 NOT NULL,
    observed_gmv double precision DEFAULT 0 NOT NULL,
    observed_orders integer DEFAULT 0 NOT NULL,
    checked_at timestamp without time zone,
    result_override text,
    owner_id uuid,
    follow_up_at date,
    note text,
    upload_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: samples_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.samples_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: samples_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.samples_id_seq OWNED BY public.samples.id;


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
-- Name: shop_order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_order_lines (
    id bigint NOT NULL,
    order_id text NOT NULL,
    sku_id text NOT NULL,
    status text NOT NULL,
    substatus text,
    cancel_type text,
    cancel_by text,
    cancel_reason text,
    preorder boolean DEFAULT false NOT NULL,
    product_name text,
    variation text,
    seller_sku text,
    quantity integer DEFAULT 1 NOT NULL,
    return_qty integer DEFAULT 0 NOT NULL,
    unit_price double precision DEFAULT 0 NOT NULL,
    subtotal_before double precision DEFAULT 0 NOT NULL,
    platform_discount double precision DEFAULT 0 NOT NULL,
    seller_discount double precision DEFAULT 0 NOT NULL,
    subtotal_after double precision DEFAULT 0 NOT NULL,
    shipping_fee double precision DEFAULT 0 NOT NULL,
    order_amount double precision DEFAULT 0 NOT NULL,
    refund_amount double precision DEFAULT 0 NOT NULL,
    created_at timestamp without time zone NOT NULL,
    paid_at timestamp without time zone,
    shipped_at timestamp without time zone,
    delivered_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    delivery_option text,
    shipping_provider text,
    payment_method text,
    state text,
    category text,
    order_channel text,
    creator text,
    buyer_username text,
    tracking_id text,
    rts_at timestamp without time zone,
    is_sample boolean DEFAULT false NOT NULL,
    asof timestamp without time zone,
    upload_id integer
);


--
-- Name: shop_order_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shop_order_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shop_order_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shop_order_lines_id_seq OWNED BY public.shop_order_lines.id;


--
-- Name: sku_bom; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sku_bom (
    set_sku text NOT NULL,
    component_sku text NOT NULL,
    qty integer DEFAULT 1 NOT NULL
);


--
-- Name: sku_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sku_items (
    sku text NOT NULL,
    family text,
    name text NOT NULL,
    is_set boolean DEFAULT false NOT NULL,
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
-- Name: uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uploads (
    id integer NOT NULL,
    kind public.upload_kind NOT NULL,
    filename text NOT NULL,
    period_start date,
    period_end date,
    row_count integer DEFAULT 0 NOT NULL,
    summary jsonb,
    uploaded_by uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: uploads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uploads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uploads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uploads_id_seq OWNED BY public.uploads.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    password_hash text NOT NULL,
    role public.role DEFAULT 'viewer'::public.role NOT NULL,
    active boolean DEFAULT true NOT NULL,
    can_edit_contacts boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: video_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_snapshots (
    upload_id integer NOT NULL,
    video_id text NOT NULL,
    gmv double precision DEFAULT 0 NOT NULL,
    orders integer DEFAULT 0 NOT NULL,
    aov double precision DEFAULT 0 NOT NULL,
    items_sold integer DEFAULT 0 NOT NULL,
    refunds double precision DEFAULT 0 NOT NULL,
    items_refunded integer DEFAULT 0 NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    comments integer DEFAULT 0 NOT NULL,
    shares integer DEFAULT 0 NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    completion_rate double precision,
    views integer DEFAULT 0 NOT NULL,
    ctr double precision,
    gpm double precision,
    engagement double precision,
    gmv_per_customer double precision,
    commission double precision DEFAULT 0 NOT NULL
);


--
-- Name: videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.videos (
    video_id text NOT NULL,
    creator text NOT NULL,
    posted_at timestamp without time zone,
    link text,
    title text,
    product_ids text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actions ALTER COLUMN id SET DEFAULT nextval('public.actions_id_seq'::regclass);


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
-- Name: import_conflicts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_conflicts ALTER COLUMN id SET DEFAULT nextval('public.import_conflicts_id_seq'::regclass);


--
-- Name: order_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_lines ALTER COLUMN id SET DEFAULT nextval('public.order_lines_id_seq'::regclass);


--
-- Name: recommendations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations ALTER COLUMN id SET DEFAULT nextval('public.recommendations_id_seq'::regclass);


--
-- Name: samples id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.samples ALTER COLUMN id SET DEFAULT nextval('public.samples_id_seq'::regclass);


--
-- Name: shop_order_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_order_lines ALTER COLUMN id SET DEFAULT nextval('public.shop_order_lines_id_seq'::regclass);


--
-- Name: staff_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_events ALTER COLUMN id SET DEFAULT nextval('public.staff_events_id_seq'::regclass);


--
-- Name: uploads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads ALTER COLUMN id SET DEFAULT nextval('public.uploads_id_seq'::regclass);


--
-- Name: actions actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actions
    ADD CONSTRAINT actions_pkey PRIMARY KEY (id);


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
-- Name: content_items content_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_items
    ADD CONSTRAINT content_items_pkey PRIMARY KEY (content_id);


--
-- Name: creator_list_snapshots creator_list_snapshots_upload_id_username_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_list_snapshots
    ADD CONSTRAINT creator_list_snapshots_upload_id_username_pk PRIMARY KEY (upload_id, username);


--
-- Name: creator_txn_snapshots creator_txn_snapshots_upload_id_username_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_txn_snapshots
    ADD CONSTRAINT creator_txn_snapshots_upload_id_username_pk PRIMARY KEY (upload_id, username);


--
-- Name: creators creators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creators
    ADD CONSTRAINT creators_pkey PRIMARY KEY (username);


--
-- Name: import_conflicts import_conflicts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_conflicts
    ADD CONSTRAINT import_conflicts_pkey PRIMARY KEY (id);


--
-- Name: order_lines order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_lines
    ADD CONSTRAINT order_lines_pkey PRIMARY KEY (id);


--
-- Name: product_snapshots product_snapshots_upload_id_product_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_snapshots
    ADD CONSTRAINT product_snapshots_upload_id_product_id_pk PRIMARY KEY (upload_id, product_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (product_id);


--
-- Name: recommendations recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);


--
-- Name: sample_content sample_content_sample_id_content_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_content
    ADD CONSTRAINT sample_content_sample_id_content_id_pk PRIMARY KEY (sample_id, content_id);


--
-- Name: sample_sales sample_sales_order_id_sku_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_sales
    ADD CONSTRAINT sample_sales_order_id_sku_id_pk PRIMARY KEY (order_id, sku_id);


--
-- Name: sample_snapshots sample_snapshots_upload_id_username_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_snapshots
    ADD CONSTRAINT sample_snapshots_upload_id_username_pk PRIMARY KEY (upload_id, username);


--
-- Name: samples samples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_pkey PRIMARY KEY (id);


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
-- Name: shop_order_lines shop_order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_order_lines
    ADD CONSTRAINT shop_order_lines_pkey PRIMARY KEY (id);


--
-- Name: sku_bom sku_bom_set_sku_component_sku_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sku_bom
    ADD CONSTRAINT sku_bom_set_sku_component_sku_pk PRIMARY KEY (set_sku, component_sku);


--
-- Name: sku_items sku_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sku_items
    ADD CONSTRAINT sku_items_pkey PRIMARY KEY (sku);


--
-- Name: staff_events staff_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_events
    ADD CONSTRAINT staff_events_pkey PRIMARY KEY (id);


--
-- Name: uploads uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_pkey PRIMARY KEY (id);


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
-- Name: video_snapshots video_snapshots_upload_id_video_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_snapshots
    ADD CONSTRAINT video_snapshots_upload_id_video_id_pk PRIMARY KEY (upload_id, video_id);


--
-- Name: videos videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_pkey PRIMARY KEY (video_id);


--
-- Name: actions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX actions_status_idx ON public.actions USING btree (status);


--
-- Name: actions_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX actions_uq ON public.actions USING btree (username, type, period_end);


--
-- Name: cls_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cls_user_idx ON public.creator_list_snapshots USING btree (username);


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
-- Name: content_items_creator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_items_creator_idx ON public.content_items USING btree (creator);


--
-- Name: cts_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cts_user_idx ON public.creator_txn_snapshots USING btree (username);


--
-- Name: import_conflicts_pending_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX import_conflicts_pending_uq ON public.import_conflicts USING btree (kind, order_id, sku_id) WHERE (status = 'pending'::text);


--
-- Name: import_conflicts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_conflicts_status_idx ON public.import_conflicts USING btree (status);


--
-- Name: order_lines_content_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_lines_content_idx ON public.order_lines USING btree (content_id);


--
-- Name: order_lines_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_lines_created_idx ON public.order_lines USING btree (created_at);


--
-- Name: order_lines_creator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_lines_creator_idx ON public.order_lines USING btree (creator, created_at);


--
-- Name: order_lines_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_lines_product_idx ON public.order_lines USING btree (product_id);


--
-- Name: order_lines_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX order_lines_uq ON public.order_lines USING btree (order_id, sku_id);


--
-- Name: recommendations_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recommendations_active_idx ON public.recommendations USING btree (active);


--
-- Name: recommendations_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX recommendations_uq ON public.recommendations USING btree (username, type);


--
-- Name: sample_sales_sample_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sample_sales_sample_idx ON public.sample_sales USING btree (sample_id);


--
-- Name: samples_creator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX samples_creator_idx ON public.samples USING btree (creator);


--
-- Name: samples_order_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX samples_order_uq ON public.samples USING btree (order_id, sku_id);


--
-- Name: samples_result_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX samples_result_idx ON public.samples USING btree (result);


--
-- Name: shop_order_lines_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_order_lines_created_idx ON public.shop_order_lines USING btree (created_at);


--
-- Name: shop_order_lines_creator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_order_lines_creator_idx ON public.shop_order_lines USING btree (creator);


--
-- Name: shop_order_lines_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shop_order_lines_uq ON public.shop_order_lines USING btree (order_id, sku_id);


--
-- Name: ss_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ss_user_idx ON public.sample_snapshots USING btree (username);


--
-- Name: staff_events_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_events_kind_idx ON public.staff_events USING btree (kind, at);


--
-- Name: staff_events_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_events_user_idx ON public.staff_events USING btree (username, at);


--
-- Name: uploads_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uploads_kind_idx ON public.uploads USING btree (kind, period_start, period_end);


--
-- Name: videos_creator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_creator_idx ON public.videos USING btree (creator);


--
-- Name: videos_posted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_posted_idx ON public.videos USING btree (posted_at);


--
-- Name: vs_video_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vs_video_idx ON public.video_snapshots USING btree (video_id);


--
-- Name: actions actions_assignee_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actions
    ADD CONSTRAINT actions_assignee_id_users_id_fk FOREIGN KEY (assignee_id) REFERENCES public.users(id) ON DELETE SET NULL;


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
-- Name: content_decisions content_decisions_sample_id_samples_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_decisions
    ADD CONSTRAINT content_decisions_sample_id_samples_id_fk FOREIGN KEY (sample_id) REFERENCES public.samples(id) ON DELETE CASCADE;


--
-- Name: content_decisions content_decisions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_decisions
    ADD CONSTRAINT content_decisions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: creator_list_snapshots creator_list_snapshots_upload_id_uploads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_list_snapshots
    ADD CONSTRAINT creator_list_snapshots_upload_id_uploads_id_fk FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;


--
-- Name: creator_txn_snapshots creator_txn_snapshots_upload_id_uploads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_txn_snapshots
    ADD CONSTRAINT creator_txn_snapshots_upload_id_uploads_id_fk FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;


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
-- Name: import_conflicts import_conflicts_resolved_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_conflicts
    ADD CONSTRAINT import_conflicts_resolved_by_users_id_fk FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: import_conflicts import_conflicts_upload_id_uploads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_conflicts
    ADD CONSTRAINT import_conflicts_upload_id_uploads_id_fk FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE SET NULL;


--
-- Name: order_lines order_lines_upload_id_uploads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_lines
    ADD CONSTRAINT order_lines_upload_id_uploads_id_fk FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE SET NULL;


--
-- Name: product_snapshots product_snapshots_upload_id_uploads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_snapshots
    ADD CONSTRAINT product_snapshots_upload_id_uploads_id_fk FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;


--
-- Name: sample_content sample_content_sample_id_samples_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_content
    ADD CONSTRAINT sample_content_sample_id_samples_id_fk FOREIGN KEY (sample_id) REFERENCES public.samples(id) ON DELETE CASCADE;


--
-- Name: sample_sales sample_sales_sample_id_samples_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_sales
    ADD CONSTRAINT sample_sales_sample_id_samples_id_fk FOREIGN KEY (sample_id) REFERENCES public.samples(id) ON DELETE CASCADE;


--
-- Name: sample_snapshots sample_snapshots_upload_id_uploads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_snapshots
    ADD CONSTRAINT sample_snapshots_upload_id_uploads_id_fk FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;


--
-- Name: samples samples_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: samples samples_upload_id_uploads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_upload_id_uploads_id_fk FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: shop_order_lines shop_order_lines_upload_id_uploads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_order_lines
    ADD CONSTRAINT shop_order_lines_upload_id_uploads_id_fk FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE SET NULL;


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
-- Name: uploads uploads_uploaded_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_uploaded_by_users_id_fk FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: video_snapshots video_snapshots_upload_id_uploads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_snapshots
    ADD CONSTRAINT video_snapshots_upload_id_uploads_id_fk FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


