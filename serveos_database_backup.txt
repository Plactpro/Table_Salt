--
-- PostgreSQL database dump
--

\restrict 4a2qH7etUMCNLZcAs891lCgij9yxqGpbTifR0VZF840kpq7EhmbFd5Cz8SP7cuA

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

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

--
-- Name: order_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.order_status AS ENUM (
    'new',
    'sent_to_kitchen',
    'in_progress',
    'ready',
    'served',
    'paid',
    'cancelled',
    'voided'
);


ALTER TYPE public.order_status OWNER TO postgres;

--
-- Name: order_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.order_type AS ENUM (
    'dine_in',
    'takeaway',
    'delivery'
);


ALTER TYPE public.order_type OWNER TO postgres;

--
-- Name: reservation_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.reservation_status AS ENUM (
    'requested',
    'confirmed',
    'seated',
    'completed',
    'no_show'
);


ALTER TYPE public.reservation_status OWNER TO postgres;

--
-- Name: table_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.table_status AS ENUM (
    'free',
    'occupied',
    'reserved',
    'cleaning',
    'blocked'
);


ALTER TYPE public.table_status OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'owner',
    'manager',
    'waiter',
    'kitchen',
    'accountant',
    'customer'
);


ALTER TYPE public.user_role OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customers (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(36) NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    notes text,
    loyalty_points integer DEFAULT 0,
    total_spent numeric(10,2) DEFAULT '0'::numeric
);


ALTER TABLE public.customers OWNER TO postgres;

--
-- Name: feedback; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feedback (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(36) NOT NULL,
    order_id character varying(36),
    customer_id character varying(36),
    rating integer NOT NULL,
    comment text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.feedback OWNER TO postgres;

--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_items (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(36) NOT NULL,
    name text NOT NULL,
    sku text,
    category text,
    unit text DEFAULT 'pcs'::text,
    current_stock numeric(10,2) DEFAULT '0'::numeric,
    reorder_level numeric(10,2) DEFAULT '10'::numeric,
    cost_price numeric(10,2) DEFAULT '0'::numeric,
    supplier text
);


ALTER TABLE public.inventory_items OWNER TO postgres;

--
-- Name: menu_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.menu_categories (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(36) NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0,
    active boolean DEFAULT true
);


ALTER TABLE public.menu_categories OWNER TO postgres;

--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.menu_items (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(36) NOT NULL,
    category_id character varying(36),
    name text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    image text,
    is_veg boolean DEFAULT false,
    spicy_level integer DEFAULT 0,
    available boolean DEFAULT true,
    tags text
);


ALTER TABLE public.menu_items OWNER TO postgres;

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    order_id character varying(36) NOT NULL,
    menu_item_id character varying(36),
    name text NOT NULL,
    quantity integer DEFAULT 1,
    price numeric(10,2) NOT NULL,
    notes text,
    status text DEFAULT 'pending'::text
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(36) NOT NULL,
    outlet_id character varying(36),
    table_id character varying(36),
    waiter_id character varying(36),
    customer_id character varying(36),
    order_type public.order_type DEFAULT 'dine_in'::public.order_type,
    status public.order_status DEFAULT 'new'::public.order_status,
    subtotal numeric(10,2) DEFAULT '0'::numeric,
    tax numeric(10,2) DEFAULT '0'::numeric,
    discount numeric(10,2) DEFAULT '0'::numeric,
    total numeric(10,2) DEFAULT '0'::numeric,
    payment_method text,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: outlets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.outlets (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(36) NOT NULL,
    name text NOT NULL,
    address text,
    opening_hours text,
    active boolean DEFAULT true
);


ALTER TABLE public.outlets OWNER TO postgres;

--
-- Name: reservations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reservations (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(36) NOT NULL,
    table_id character varying(36),
    customer_name text NOT NULL,
    customer_phone text,
    guests integer DEFAULT 2,
    date_time timestamp without time zone NOT NULL,
    notes text,
    status public.reservation_status DEFAULT 'requested'::public.reservation_status
);


ALTER TABLE public.reservations OWNER TO postgres;

--
-- Name: session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO postgres;

--
-- Name: staff_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_schedules (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    outlet_id character varying(36),
    date timestamp without time zone NOT NULL,
    start_time text NOT NULL,
    end_time text NOT NULL,
    role text
);


ALTER TABLE public.staff_schedules OWNER TO postgres;

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_movements (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(36) NOT NULL,
    item_id character varying(36) NOT NULL,
    type text NOT NULL,
    quantity numeric(10,2) NOT NULL,
    reason text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.stock_movements OWNER TO postgres;

--
-- Name: tables; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tables (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(36) NOT NULL,
    outlet_id character varying(36),
    number integer NOT NULL,
    capacity integer DEFAULT 4,
    zone text DEFAULT 'Main'::text,
    status public.table_status DEFAULT 'free'::public.table_status
);


ALTER TABLE public.tables OWNER TO postgres;

--
-- Name: tenants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tenants (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo text,
    address text,
    timezone text DEFAULT 'UTC'::text,
    currency text DEFAULT 'USD'::text,
    tax_rate numeric(5,2) DEFAULT '0'::numeric,
    service_charge numeric(5,2) DEFAULT '0'::numeric,
    plan text DEFAULT 'basic'::text,
    active boolean DEFAULT true,
    business_type text DEFAULT 'casual_dining'::text
);


ALTER TABLE public.tenants OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(36) NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    role public.user_role DEFAULT 'waiter'::public.user_role NOT NULL,
    active boolean DEFAULT true
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customers (id, tenant_id, name, phone, email, notes, loyalty_points, total_spent) FROM stdin;
126b3267-eea8-491e-a8f6-b874b9088ab9	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Sarah Johnson	555-0101	sarah@email.com	\N	240	480.00
36559ebf-3462-4f5b-8aa6-1f35958c9f53	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Mike Thompson	555-0102	mike@email.com	\N	180	360.00
774281ed-03f6-4020-88b0-2b3b5a01c43e	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Emily Davis	555-0103	emily@email.com	\N	520	1040.00
2a2a74a7-d701-4dea-84b4-552e44cf226a	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	David Wilson	555-0104	david@email.com	\N	90	180.00
6d1291b9-7302-4098-96ff-fc5d49d8e1fc	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Lisa Anderson	555-0105	lisa@email.com	\N	340	680.00
\.


--
-- Data for Name: feedback; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.feedback (id, tenant_id, order_id, customer_id, rating, comment, created_at) FROM stdin;
\.


--
-- Data for Name: inventory_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_items (id, tenant_id, name, sku, category, unit, current_stock, reorder_level, cost_price, supplier) FROM stdin;
e7d6c2a1-bc47-4ec4-86f1-a72e61451751	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Chicken Breast	CHK-001	Protein	kg	25.00	10.00	8.50	Metro Foods
b4525606-24cd-4d46-a361-4627072f10b8	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Salmon Fillet	SAL-001	Protein	kg	8.00	5.00	18.00	Ocean Fresh
53ce34b2-6784-4898-9d71-297fe93ea636	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Lamb Rack	LMB-001	Protein	kg	4.00	5.00	22.00	Metro Foods
5d4af0d7-b1ac-403d-af08-41a245de37c4	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Olive Oil	OIL-001	Pantry	liters	12.00	5.00	6.50	Italian Imports
eb953977-e61d-46a9-87d6-129f48b34b72	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	All Purpose Flour	FLR-001	Pantry	kg	30.00	15.00	1.20	Baker Supply
530a6165-ae56-4095-a5d7-58b69b2cf9c5	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Tomatoes	TOM-001	Produce	kg	15.00	10.00	2.50	Farm Direct
45a6e79f-da17-4e4e-88bb-ab0e5575b900	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Mushrooms	MSH-001	Produce	kg	3.00	5.00	6.00	Farm Direct
0f1b6104-09a7-4bb2-b49d-e2a1726ba343	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Heavy Cream	CRM-001	Dairy	liters	8.00	5.00	3.50	Dairy Fresh
15eb6a19-7783-49b6-b183-46a52cae06fe	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Parmesan	PRM-001	Dairy	kg	2.00	3.00	18.00	Italian Imports
394b53cf-d700-4609-8636-20865a8e0e48	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Bourbon	BRB-001	Bar	bottles	6.00	3.00	28.00	Spirit Co
6c6016c6-a563-4e5b-9381-024c997f02ff	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	White Rum	RUM-001	Bar	bottles	8.00	4.00	15.00	Spirit Co
747273bf-d2a3-4bfd-875e-c8d72eb01aad	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Espresso Beans	COF-001	Beverages	kg	5.00	3.00	12.00	Bean Roasters
667b5038-166c-4fcb-9517-34944e58128f	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Spaghetti Pasta	PAS-001	Pantry	kg	20.00	10.00	1.80	Italian Imports
3ca5f051-c1f7-4311-892d-a96b2e2f23d6	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Arborio Rice	RIC-001	Pantry	kg	10.00	5.00	3.50	Italian Imports
2c033a5b-1b0a-4924-99b0-2bd44839dcdd	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Fresh Mint	MNT-001	Produce	bunches	10.00	5.00	1.50	Farm Direct
\.


--
-- Data for Name: menu_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.menu_categories (id, tenant_id, name, sort_order, active) FROM stdin;
fd74ba6d-dff9-4fe3-8b2b-7044aece95a0	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Starters	1	t
aa361501-ca87-4e6b-aa7e-b91dfd58b1e3	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Soups	2	t
ac3ece2b-252c-481f-8ba5-21ca47b6d4b8	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Main Course	3	t
bfe501f4-c6df-4984-b857-9dc07279c1c5	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Pasta & Noodles	4	t
0bc5026e-dd61-425c-b62e-f7ce6ab67796	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Grills	5	t
25d14406-2119-4742-8ffc-d575686fc606	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Desserts	6	t
8be085d1-e7dd-48fd-aaf2-158b86b94a58	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Beverages	7	t
0898a3ff-ffff-47ad-8c60-a986a7c202d0	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Cocktails	8	t
\.


--
-- Data for Name: menu_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.menu_items (id, tenant_id, category_id, name, description, price, image, is_veg, spicy_level, available, tags) FROM stdin;
1b39b84d-bc8c-454f-93e2-a0f69e01a827	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	fd74ba6d-dff9-4fe3-8b2b-7044aece95a0	Bruschetta	Toasted bread with tomato, basil, and olive oil	8.99	\N	t	0	t	\N
fdd4ffe5-1cd9-4a61-aacb-84b9fd9a4ac6	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	fd74ba6d-dff9-4fe3-8b2b-7044aece95a0	Chicken Wings	Crispy wings with buffalo sauce	12.99	\N	f	2	t	\N
ba63668a-fccd-4fc7-a772-a654619a85f4	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	fd74ba6d-dff9-4fe3-8b2b-7044aece95a0	Spring Rolls	Crispy veggie spring rolls with sweet chili	7.99	\N	t	0	t	\N
013732c7-7d5c-4609-b54b-31587de864c9	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	fd74ba6d-dff9-4fe3-8b2b-7044aece95a0	Calamari Fritti	Fried squid rings with tartar sauce	11.99	\N	f	0	t	\N
332e6288-7d80-4a7e-95d6-2da9fecff0a8	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	aa361501-ca87-4e6b-aa7e-b91dfd58b1e3	Tomato Basil Soup	Classic creamy tomato soup	6.99	\N	t	0	t	\N
2e08ce01-f9da-430d-8e37-86b7025987b9	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	aa361501-ca87-4e6b-aa7e-b91dfd58b1e3	French Onion Soup	Caramelized onion soup with gruyere crouton	8.99	\N	t	0	t	\N
b880ca21-b009-4c21-b0cb-86b7a267b56c	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ac3ece2b-252c-481f-8ba5-21ca47b6d4b8	Grilled Salmon	Atlantic salmon with lemon butter sauce	24.99	\N	f	0	t	\N
40745101-7833-46c0-b93a-dd84b456c654	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ac3ece2b-252c-481f-8ba5-21ca47b6d4b8	Chicken Tikka Masala	Creamy spiced chicken curry	18.99	\N	f	2	t	\N
f6221c34-6c02-41c9-89ea-20250e5f4757	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ac3ece2b-252c-481f-8ba5-21ca47b6d4b8	Lamb Rack	Herb-crusted lamb with rosemary jus	32.99	\N	f	0	t	\N
0bdce1cf-6146-43f4-9175-f9c711906307	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ac3ece2b-252c-481f-8ba5-21ca47b6d4b8	Mushroom Risotto	Creamy arborio rice with wild mushrooms	16.99	\N	t	0	t	\N
3b5b37d6-30e7-4b4a-b103-2d43686ad42a	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ac3ece2b-252c-481f-8ba5-21ca47b6d4b8	Beef Tenderloin	8oz tenderloin with red wine reduction	34.99	\N	f	0	t	\N
f87e3ba5-6b44-4baf-90d8-45eba373d640	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	bfe501f4-c6df-4984-b857-9dc07279c1c5	Spaghetti Carbonara	Classic Roman pasta with pancetta	14.99	\N	f	0	t	\N
c5ef9c20-288e-4198-93e7-19b19b03a9d3	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	bfe501f4-c6df-4984-b857-9dc07279c1c5	Penne Arrabbiata	Spicy tomato sauce pasta	12.99	\N	t	2	t	\N
0f9ea493-4722-4bf5-b497-986a1023b2e7	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	bfe501f4-c6df-4984-b857-9dc07279c1c5	Pad Thai	Thai stir-fried rice noodles with shrimp	15.99	\N	f	0	t	\N
b45ad7bf-2ff8-4efb-9077-461e1db92bf2	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	0bc5026e-dd61-425c-b62e-f7ce6ab67796	Ribeye Steak	12oz USDA prime ribeye, chargrilled	38.99	\N	f	0	t	\N
0ae446fc-10fb-4192-bbd9-c628527f80e1	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	0bc5026e-dd61-425c-b62e-f7ce6ab67796	BBQ Chicken	Half chicken with smoky BBQ glaze	19.99	\N	f	0	t	\N
4368bd56-b18e-4f96-b0b4-d38100a91981	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	0bc5026e-dd61-425c-b62e-f7ce6ab67796	Grilled Vegetable Platter	Seasonal veggies with herb oil	14.99	\N	t	0	t	\N
0bc2de6d-e473-47aa-ac68-59972ee4873e	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	25d14406-2119-4742-8ffc-d575686fc606	Tiramisu	Classic Italian coffee-flavored dessert	9.99	\N	t	0	t	\N
9374b4c6-2de8-4fd6-8793-6fdfc7c2d5cf	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	25d14406-2119-4742-8ffc-d575686fc606	Chocolate Lava Cake	Warm chocolate cake with molten center	11.99	\N	t	0	t	\N
042ca7c4-e8b2-4fea-93b2-540377ca8245	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	25d14406-2119-4742-8ffc-d575686fc606	Crème Brûlée	French vanilla custard with caramelized top	8.99	\N	t	0	t	\N
aca65719-4274-43a2-bb1b-0edf3264ed2b	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	8be085d1-e7dd-48fd-aaf2-158b86b94a58	Espresso	Double-shot Italian espresso	3.99	\N	t	0	t	\N
08104e7b-ad81-45e1-bf10-9fd333cea473	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	8be085d1-e7dd-48fd-aaf2-158b86b94a58	Fresh Orange Juice	Freshly squeezed orange juice	5.99	\N	t	0	t	\N
00e0686b-e580-4575-9517-f26a3ea14984	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	8be085d1-e7dd-48fd-aaf2-158b86b94a58	Sparkling Water	San Pellegrino 500ml	2.99	\N	t	0	t	\N
52437bb8-0495-4f10-ae7a-c4fc7b321210	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	0898a3ff-ffff-47ad-8c60-a986a7c202d0	Classic Mojito	Rum, mint, lime, soda	12.99	\N	t	0	t	\N
d16464ba-c1f7-4640-a811-8f6946205182	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	0898a3ff-ffff-47ad-8c60-a986a7c202d0	Old Fashioned	Bourbon, bitters, sugar, orange peel	14.99	\N	t	0	t	\N
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, menu_item_id, name, quantity, price, notes, status) FROM stdin;
028153da-4668-475d-9ca4-ea9049531cbe	d877ad8a-85b6-4538-ba56-e84fe539b2e5	1b39b84d-bc8c-454f-93e2-a0f69e01a827	Bruschetta	1	8.99	\N	pending
e7512419-baa4-41a2-bc7c-74bffd8c3cc1	d877ad8a-85b6-4538-ba56-e84fe539b2e5	fdd4ffe5-1cd9-4a61-aacb-84b9fd9a4ac6	Chicken Wings	1	12.99	\N	pending
38f4f3c3-8bee-46bf-a979-4b42e90add25	d877ad8a-85b6-4538-ba56-e84fe539b2e5	ba63668a-fccd-4fc7-a772-a654619a85f4	Spring Rolls	3	7.99	\N	pending
f3073423-3a11-4dae-9152-2a2fa0ed283b	7c6a5392-2e5a-4d44-837d-0796fe5d66ec	013732c7-7d5c-4609-b54b-31587de864c9	Calamari Fritti	1	11.99	\N	pending
6ccaae1a-49d7-4847-a165-6e1123d49b9e	7c6a5392-2e5a-4d44-837d-0796fe5d66ec	332e6288-7d80-4a7e-95d6-2da9fecff0a8	Tomato Basil Soup	2	6.99	\N	pending
79d9393e-0a8e-4c32-8940-60ffacd56af0	7c6a5392-2e5a-4d44-837d-0796fe5d66ec	2e08ce01-f9da-430d-8e37-86b7025987b9	French Onion Soup	2	8.99	\N	pending
e739d516-3f1d-4691-9fa5-8df99f9319a4	1bcefec1-ad4b-447e-a83c-4dc8c7acb230	b880ca21-b009-4c21-b0cb-86b7a267b56c	Grilled Salmon	3	24.99	\N	pending
3a56cc0a-cdae-443f-b6b5-af5ec5fc29fd	1bcefec1-ad4b-447e-a83c-4dc8c7acb230	40745101-7833-46c0-b93a-dd84b456c654	Chicken Tikka Masala	2	18.99	\N	pending
c9755f82-7f51-4621-b1bd-849b5ee3bd16	1bcefec1-ad4b-447e-a83c-4dc8c7acb230	f6221c34-6c02-41c9-89ea-20250e5f4757	Lamb Rack	2	32.99	\N	pending
240f150d-acb1-4ffe-9796-c9efff08ee0d	96d05029-9e0e-41ec-bc7e-f18aa58d5a16	0bdce1cf-6146-43f4-9175-f9c711906307	Mushroom Risotto	1	16.99	\N	pending
e2db4b6c-0d9a-4e7a-a800-30d3f1a2709e	96d05029-9e0e-41ec-bc7e-f18aa58d5a16	3b5b37d6-30e7-4b4a-b103-2d43686ad42a	Beef Tenderloin	2	34.99	\N	pending
71989090-9bf5-468c-ba7d-0291891aab17	96d05029-9e0e-41ec-bc7e-f18aa58d5a16	f87e3ba5-6b44-4baf-90d8-45eba373d640	Spaghetti Carbonara	1	14.99	\N	pending
819bc1b7-5e8f-4aa6-8d69-32f95fa1bcf8	b3cf4932-8f5c-40d6-90c0-d6cc160f0780	c5ef9c20-288e-4198-93e7-19b19b03a9d3	Penne Arrabbiata	2	12.99	\N	pending
13cbcfa3-58e6-43b6-ba71-6ea492f7f101	b3cf4932-8f5c-40d6-90c0-d6cc160f0780	0f9ea493-4722-4bf5-b497-986a1023b2e7	Pad Thai	2	15.99	\N	pending
c786112e-84da-4f05-a2a7-acdebd8979d2	b3cf4932-8f5c-40d6-90c0-d6cc160f0780	b45ad7bf-2ff8-4efb-9077-461e1db92bf2	Ribeye Steak	3	38.99	\N	pending
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, tenant_id, outlet_id, table_id, waiter_id, customer_id, order_type, status, subtotal, tax, discount, total, payment_method, notes, created_at) FROM stdin;
d877ad8a-85b6-4538-ba56-e84fe539b2e5	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	aa94c5aa-b5f2-4390-856d-16c9cc280408	2f650369-bd3f-4e54-b9f9-f210470e638d	\N	dine_in	paid	29.97	2.55	0.00	32.52	card	\N	2026-03-11 05:02:11.052412
7c6a5392-2e5a-4d44-837d-0796fe5d66ec	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	a856e5b2-4b0a-424e-8a8c-dfb692f27f4c	2f650369-bd3f-4e54-b9f9-f210470e638d	\N	dine_in	paid	27.97	2.38	0.00	30.35	card	\N	2026-03-11 05:02:11.063971
1bcefec1-ad4b-447e-a83c-4dc8c7acb230	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	61747e8b-1bd9-4012-a703-fedfbebac5f3	2f650369-bd3f-4e54-b9f9-f210470e638d	\N	dine_in	served	76.97	6.54	0.00	83.51	\N	\N	2026-03-11 05:02:11.075503
96d05029-9e0e-41ec-bc7e-f18aa58d5a16	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	69a66c7b-eaab-43de-976e-1560d66a09a2	2f650369-bd3f-4e54-b9f9-f210470e638d	\N	dine_in	in_progress	66.97	5.69	0.00	72.66	\N	\N	2026-03-11 05:02:11.087107
b3cf4932-8f5c-40d6-90c0-d6cc160f0780	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	15f5db89-d053-47ae-975b-0cc8a82c24b8	2f650369-bd3f-4e54-b9f9-f210470e638d	\N	dine_in	new	67.97	5.78	0.00	73.75	\N	\N	2026-03-11 05:02:11.098446
\.


--
-- Data for Name: outlets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.outlets (id, tenant_id, name, address, opening_hours, active) FROM stdin;
ccfef876-984b-47b8-9d61-8b4883486835	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	Main Branch	123 Culinary Avenue	10:00-23:00	t
\.


--
-- Data for Name: reservations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reservations (id, tenant_id, table_id, customer_name, customer_phone, guests, date_time, notes, status) FROM stdin;
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.session (sid, sess, expire) FROM stdin;
5f8hMVeN1mDkCgIeahvIvQ_zDlmGtpc0	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-10T15:12:11.532Z","httpOnly":true,"path":"/"},"passport":{"user":"279be838-d613-46df-9e60-c4c98a8951b8"}}	2026-04-11 07:25:55
\.


--
-- Data for Name: staff_schedules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.staff_schedules (id, tenant_id, user_id, outlet_id, date, start_time, end_time, role) FROM stdin;
\.


--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stock_movements (id, tenant_id, item_id, type, quantity, reason, created_at) FROM stdin;
\.


--
-- Data for Name: tables; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tables (id, tenant_id, outlet_id, number, capacity, zone, status) FROM stdin;
aa94c5aa-b5f2-4390-856d-16c9cc280408	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	1	2	Main Hall	occupied
a856e5b2-4b0a-424e-8a8c-dfb692f27f4c	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	2	2	Main Hall	occupied
61747e8b-1bd9-4012-a703-fedfbebac5f3	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	3	4	Main Hall	occupied
69a66c7b-eaab-43de-976e-1560d66a09a2	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	4	4	Main Hall	free
15f5db89-d053-47ae-975b-0cc8a82c24b8	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	5	6	Main Hall	free
af795d52-f72a-4307-957b-2036b961c0dc	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	6	4	Patio	reserved
3f578ba9-b9c4-4dc3-8de9-c99746a45caa	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	7	2	Patio	free
1d1c1dce-4f2e-4bb2-a087-bb10680528f6	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	8	6	Patio	free
f3e2e0a1-8c47-4e5d-8fc0-a6c49914b661	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	9	8	Private	free
ed6dc025-124b-471f-899c-6e03cfa8831e	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	ccfef876-984b-47b8-9d61-8b4883486835	10	10	Private	free
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tenants (id, name, slug, logo, address, timezone, currency, tax_rate, service_charge, plan, active, business_type) FROM stdin;
1edc954b-05b8-45dd-8f37-13f4a1d6b12f	The Grand Kitchen	the-grand-kitchen	\N	123 Culinary Avenue, Food City	America/New_York	aed	8.50	5.00	premium	t	casual_dining
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, tenant_id, username, password, name, email, phone, role, active) FROM stdin;
279be838-d613-46df-9e60-c4c98a8951b8	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	owner	15580f44a6f8012403561d1f901234eeb3badfe2b0ad887f1e574655e26be6f280a2a5e9f519a654407c829c6624f339ed9a69e511c52b06c9f9b9f4080be34a.84db491f41adae20d4a5e86d4fb11e9d	Alex Sterling	alex@grandkitchen.com	\N	owner	t
0205973c-6047-4d86-a699-5d04cb77e78b	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	manager	15580f44a6f8012403561d1f901234eeb3badfe2b0ad887f1e574655e26be6f280a2a5e9f519a654407c829c6624f339ed9a69e511c52b06c9f9b9f4080be34a.84db491f41adae20d4a5e86d4fb11e9d	Jordan Rivera	jordan@grandkitchen.com	\N	manager	t
2f650369-bd3f-4e54-b9f9-f210470e638d	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	waiter	15580f44a6f8012403561d1f901234eeb3badfe2b0ad887f1e574655e26be6f280a2a5e9f519a654407c829c6624f339ed9a69e511c52b06c9f9b9f4080be34a.84db491f41adae20d4a5e86d4fb11e9d	Sam Chen	sam@grandkitchen.com	\N	waiter	t
6e69affd-303e-4687-94ed-823bea880ff9	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	kitchen	15580f44a6f8012403561d1f901234eeb3badfe2b0ad887f1e574655e26be6f280a2a5e9f519a654407c829c6624f339ed9a69e511c52b06c9f9b9f4080be34a.84db491f41adae20d4a5e86d4fb11e9d	Pat Garcia	pat@grandkitchen.com	\N	kitchen	t
bdab6337-f226-4de0-9a85-f2b3e3a272a7	1edc954b-05b8-45dd-8f37-13f4a1d6b12f	accountant	15580f44a6f8012403561d1f901234eeb3badfe2b0ad887f1e574655e26be6f280a2a5e9f519a654407c829c6624f339ed9a69e511c52b06c9f9b9f4080be34a.84db491f41adae20d4a5e86d4fb11e9d	Morgan Lee	morgan@grandkitchen.com	\N	accountant	t
\.


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: menu_categories menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: outlets outlets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outlets
    ADD CONSTRAINT outlets_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: staff_schedules staff_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_schedules
    ADD CONSTRAINT staff_schedules_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: tables tables_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_unique UNIQUE (slug);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: customers customers_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: feedback feedback_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: feedback feedback_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: feedback feedback_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: inventory_items inventory_items_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: menu_categories menu_categories_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: menu_items menu_items_category_id_menu_categories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_category_id_menu_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.menu_categories(id);


--
-- Name: menu_items menu_items_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: order_items order_items_menu_item_id_menu_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_id_menu_items_id_fk FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);


--
-- Name: order_items order_items_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: orders orders_outlet_id_outlets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_outlet_id_outlets_id_fk FOREIGN KEY (outlet_id) REFERENCES public.outlets(id);


--
-- Name: orders orders_table_id_tables_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_table_id_tables_id_fk FOREIGN KEY (table_id) REFERENCES public.tables(id);


--
-- Name: orders orders_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: orders orders_waiter_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_waiter_id_users_id_fk FOREIGN KEY (waiter_id) REFERENCES public.users(id);


--
-- Name: outlets outlets_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outlets
    ADD CONSTRAINT outlets_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: reservations reservations_table_id_tables_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_table_id_tables_id_fk FOREIGN KEY (table_id) REFERENCES public.tables(id);


--
-- Name: reservations reservations_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: staff_schedules staff_schedules_outlet_id_outlets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_schedules
    ADD CONSTRAINT staff_schedules_outlet_id_outlets_id_fk FOREIGN KEY (outlet_id) REFERENCES public.outlets(id);


--
-- Name: staff_schedules staff_schedules_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_schedules
    ADD CONSTRAINT staff_schedules_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: staff_schedules staff_schedules_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_schedules
    ADD CONSTRAINT staff_schedules_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: stock_movements stock_movements_item_id_inventory_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_item_id_inventory_items_id_fk FOREIGN KEY (item_id) REFERENCES public.inventory_items(id);


--
-- Name: stock_movements stock_movements_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tables tables_outlet_id_outlets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_outlet_id_outlets_id_fk FOREIGN KEY (outlet_id) REFERENCES public.outlets(id);


--
-- Name: tables tables_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: users users_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 4a2qH7etUMCNLZcAs891lCgij9yxqGpbTifR0VZF840kpq7EhmbFd5Cz8SP7cuA

