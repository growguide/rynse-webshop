-- RYNSE data model (PostgreSQL 14+)
-- Money is stored in integer cents. Card data never touches this database:
-- Mollie keeps all sensitive payment details; we only store Mollie references.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- CUSTOMER
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               citext NOT NULL UNIQUE,
  name                text,
  mollie_customer_id  text UNIQUE,            -- cst_xxx
  locale              text NOT NULL DEFAULT 'en',          -- en | nl | es (site language of the customer)
  marketing_consent   boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- ORDER
-- payment_status and fulfillment_status are deliberately separate columns.
-- ---------------------------------------------------------------------------
CREATE TYPE order_type AS ENUM ('one_time', 'subscription_first', 'subscription_renewal');
CREATE TYPE payment_status AS ENUM ('pending', 'open', 'authorized', 'paid', 'failed', 'canceled', 'expired', 'refunded', 'partially_refunded');
CREATE TYPE fulfillment_status AS ENUM ('unfulfilled', 'processing', 'shipped', 'delivered', 'returned', 'cancelled');

CREATE TABLE IF NOT EXISTS orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number               text NOT NULL UNIQUE,                 -- human readable, e.g. RY-2026-000123
  customer_id          uuid REFERENCES customers(id) ON DELETE SET NULL,
  subscription_id      uuid,                                 -- set for subscription_first / renewal (FK added below)
  order_type           order_type NOT NULL,
  quantity             integer NOT NULL CHECK (quantity > 0),
  currency             char(3) NOT NULL DEFAULT 'EUR',
  unit_price_cents     integer NOT NULL CHECK (unit_price_cents >= 0),
  subtotal_cents       integer NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents       integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  discount_label       text,
  shipping_cents       integer NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  total_cents          integer NOT NULL CHECK (total_cents >= 0),
  vat_cents            integer NOT NULL DEFAULT 0,
  payment_status       payment_status NOT NULL DEFAULT 'pending',
  fulfillment_status   fulfillment_status NOT NULL DEFAULT 'unfulfilled',
  mollie_payment_id    text UNIQUE,                          -- tr_xxx of the *latest* payment attempt
  email                citext NOT NULL,
  shipping_address     jsonb NOT NULL,                       -- {name, street, postalCode, city, country}
  pricing_snapshot     jsonb NOT NULL,                       -- exact config values used (audit trail)
  confirmation_sent_at timestamptz,
  paid_at              timestamptz,
  shipped_at           timestamptz,
  tracking_code        text,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(payment_status, fulfillment_status);

-- ---------------------------------------------------------------------------
-- SUBSCRIPTION
-- ---------------------------------------------------------------------------
CREATE TYPE subscription_status AS ENUM ('pending', 'active', 'past_due', 'suspended', 'canceled', 'completed');

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id             uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status                  subscription_status NOT NULL DEFAULT 'pending',
  quantity                integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  interval                text NOT NULL,                     -- Mollie interval syntax, e.g. '1 month'
  unit_price_cents        integer NOT NULL,                  -- base price at signup (snapshot)
  shipping_address        jsonb NOT NULL,
  mollie_customer_id      text,                              -- cst_xxx
  mollie_mandate_id       text,                              -- mdt_xxx
  mollie_subscription_id  text UNIQUE,                       -- sub_xxx
  first_order_id          uuid REFERENCES orders(id) ON DELETE SET NULL,
  start_date              date,                              -- first successful payment
  next_payment_date       date,
  -- Loyalty: the uninterrupted streak starts here. Reset to NULL on cancellation.
  loyalty_start_date      date,
  loyalty_level           integer NOT NULL DEFAULT 1,
  loyalty_history         jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{event, at, level}]
  failed_payment_count    integer NOT NULL DEFAULT 0,
  last_payment_at         timestamptz,
  canceled_at             timestamptz,
  cancel_reason           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
ALTER TABLE orders ADD CONSTRAINT orders_subscription_fk FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- PAYMENT (one row per Mollie payment; an order can have several attempts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  mollie_payment_id  text NOT NULL UNIQUE,                   -- tr_xxx
  mollie_status      text NOT NULL DEFAULT 'open',           -- raw Mollie status
  sequence_type      text NOT NULL DEFAULT 'oneoff',         -- oneoff | first | recurring
  method             text,                                   -- ideal | creditcard | applepay | ...
  amount_cents       integer NOT NULL,
  amount_refunded_cents integer NOT NULL DEFAULT 0,
  currency           char(3) NOT NULL DEFAULT 'EUR',
  mollie_mandate_id  text,
  mollie_subscription_id text,
  checkout_url       text,
  raw                jsonb,                                  -- last fetched payment resource (no card data is ever in it)
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments(order_id);

-- ---------------------------------------------------------------------------
-- WEBHOOK EVENTS — idempotency log. One row per (payment id, status) transition.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
  id                 bigserial PRIMARY KEY,
  provider           text NOT NULL DEFAULT 'mollie',
  resource_id        text NOT NULL,                          -- tr_xxx
  resource_status    text NOT NULL,
  refunded_cents     integer NOT NULL DEFAULT 0,
  received_at        timestamptz NOT NULL DEFAULT now(),
  processed_at       timestamptz,
  error              text,
  UNIQUE (provider, resource_id, resource_status, refunded_cents)
);

-- ---------------------------------------------------------------------------
-- EMAILS — every transactional mail is logged once (prevents duplicates)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_log (
  id          bigserial PRIMARY KEY,
  dedupe_key  text NOT NULL UNIQUE,                          -- e.g. order_confirmation:<order id>
  to_email    citext NOT NULL,
  template    text NOT NULL,
  status      text NOT NULL DEFAULT 'sent',
  provider_id text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- AUTH — passwordless magic links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash  text PRIMARY KEY,
  email       citext NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RATE LIMITING (works across serverless instances)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket      text NOT NULL,
  window_start timestamptz NOT NULL,
  count       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

-- ---------------------------------------------------------------------------
-- ANALYTICS EVENTS (server-side copy of e-commerce events, consent-aware)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_events (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  order_id    uuid,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- PAYMENT EMULATOR (local development / tests only — never used with PAYMENT_PROVIDER=mollie)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emulator_payments (
  id          text PRIMARY KEY,                               -- tr_emu_xxx
  resource    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS emulator_customers (
  id          text PRIMARY KEY,                               -- cst_emu_xxx
  resource    jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS emulator_mandates (
  id          text PRIMARY KEY,                               -- mdt_emu_xxx
  customer_id text NOT NULL,
  resource    jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS emulator_subscriptions (
  id          text PRIMARY KEY,                               -- sub_emu_xxx
  customer_id text NOT NULL,
  resource    jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS emulator_refunds (
  id          text PRIMARY KEY,                               -- re_emu_xxx
  payment_id  text NOT NULL,
  resource    jsonb NOT NULL
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['customers','orders','subscriptions','payments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- Order number sequence
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1000;
