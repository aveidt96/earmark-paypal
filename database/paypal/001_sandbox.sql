-- Isolated PayPal Sandbox foundation. Never alters public.earmark_* Monad tables.
-- Applied explicitly by scripts/paypal-migrate.ts, not at application startup.
CREATE SCHEMA IF NOT EXISTS earmark_paypal;
CREATE TABLE earmark_paypal.schema_migrations (
  version integer PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE earmark_paypal.environment (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  environment text NOT NULL CHECK (environment = 'sandbox'),
  version integer NOT NULL CHECK (version = 1)
);
INSERT INTO earmark_paypal.environment VALUES (true, 'sandbox', 1);

CREATE TABLE earmark_paypal.mandates (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  agent_id text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD','EUR','GBP','CAD','AUD','JPY')),
  cap_minor numeric(20,0) NOT NULL CHECK (cap_minor > 0 AND cap_minor < 1e18),
  per_transaction_minor numeric(20,0) NOT NULL CHECK (per_transaction_minor > 0 AND per_transaction_minor <= cap_minor),
  reserved_minor numeric(20,0) NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  consumed_minor numeric(20,0) NOT NULL DEFAULT 0 CHECK (consumed_minor >= 0),
  status text NOT NULL CHECK (status IN ('ACTIVE','REVOKED','CLOSED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK (reserved_minor + consumed_minor <= cap_minor)
);
CREATE TABLE earmark_paypal.approved_merchants (
  mandate_id uuid NOT NULL REFERENCES earmark_paypal.mandates(id),
  merchant_id text NOT NULL CHECK (merchant_id ~ '^[a-zA-Z0-9:_-]{1,120}$'),
  PRIMARY KEY (mandate_id, merchant_id)
);
CREATE TABLE earmark_paypal.attempts (
  id uuid PRIMARY KEY,
  mandate_id uuid NOT NULL REFERENCES earmark_paypal.mandates(id),
  purchase_key text NOT NULL,
  merchant_id text NOT NULL,
  amount_minor numeric(20,0) NOT NULL CHECK (amount_minor > 0 AND amount_minor < 1e18),
  currency text NOT NULL,
  state text NOT NULL CHECK (state IN ('RESERVED','CREATING','CREATE_UNCERTAIN','AWAITING_APPROVAL','APPROVED',
    'CAPTURING','CAPTURE_UNCERTAIN','PENDING','SUCCEEDED','FAILED','VOIDED','CANCELLED','REVIEW_REQUIRED')),
  budget_state text NOT NULL CHECK (budget_state IN ('RESERVED','CONSUMED','RELEASED')),
  order_id text UNIQUE,
  capture_id text UNIQUE,
  create_request_id uuid NOT NULL UNIQUE,
  capture_request_id uuid NOT NULL UNIQUE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (mandate_id, purchase_key),
  FOREIGN KEY (mandate_id, merchant_id) REFERENCES earmark_paypal.approved_merchants(mandate_id,merchant_id),
  CHECK (record @> jsonb_build_object('id',id::text,'mandateId',mandate_id::text,'purchaseKey',purchase_key,
    'merchantId',merchant_id,'amountMinor',amount_minor::text,'currency',currency,'state',state,'budgetState',budget_state,
    'createRequestId',create_request_id::text,'captureRequestId',capture_request_id::text)),
  CHECK ((record->>'orderId') IS NOT DISTINCT FROM order_id),
  CHECK ((record->>'captureId') IS NOT DISTINCT FROM capture_id),
  CHECK ((state = 'SUCCEEDED') = (budget_state = 'CONSUMED')),
  CHECK ((state IN ('FAILED','VOIDED','CANCELLED')) = (budget_state = 'RELEASED'))
);
CREATE INDEX attempts_recovery ON earmark_paypal.attempts(updated_at) WHERE budget_state = 'RESERVED';
CREATE TABLE earmark_paypal.idempotency (
  request_id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES earmark_paypal.attempts(id),
  operation text NOT NULL CHECK (operation IN ('CREATE','CAPTURE')),
  fingerprint text NOT NULL,
  state text NOT NULL,
  UNIQUE (attempt_id, operation)
);
CREATE TABLE earmark_paypal.webhook_events (
  id text PRIMARY KEY,
  digest text NOT NULL,
  record jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('PENDING','PROCESSED','IGNORED','RETRY')),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  error_code text
);
CREATE INDEX webhook_recovery ON earmark_paypal.webhook_events(next_retry_at) WHERE state IN ('PENDING','RETRY');
CREATE TABLE earmark_paypal.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mandate_id uuid REFERENCES earmark_paypal.mandates(id),
  attempt_id uuid REFERENCES earmark_paypal.attempts(id),
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION earmark_paypal.protect_mandate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'MANDATE_HISTORY_IMMUTABLE'; END IF;
  IF ROW(NEW.id,NEW.owner_id,NEW.agent_id,NEW.currency,NEW.cap_minor,NEW.per_transaction_minor,NEW.expires_at,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.agent_id,OLD.currency,OLD.cap_minor,OLD.per_transaction_minor,OLD.expires_at,OLD.created_at)
    OR (OLD.status <> 'ACTIVE' AND NEW.status <> OLD.status)
    OR NEW.consumed_minor < OLD.consumed_minor
  THEN RAISE EXCEPTION 'MANDATE_POLICY_IMMUTABLE'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER protect_mandate BEFORE UPDATE OR DELETE ON earmark_paypal.mandates
  FOR EACH ROW EXECUTE FUNCTION earmark_paypal.protect_mandate();

CREATE FUNCTION earmark_paypal.protect_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m earmark_paypal.mandates;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'PAYMENT_HISTORY_IMMUTABLE'; END IF;
  SELECT * INTO m FROM earmark_paypal.mandates WHERE id=NEW.mandate_id FOR UPDATE;
  IF NEW.record->>'ownerId' IS DISTINCT FROM m.owner_id OR NEW.record->>'agentId' IS DISTINCT FROM m.agent_id
    OR NEW.currency <> m.currency OR NEW.amount_minor > m.per_transaction_minor
    THEN RAISE EXCEPTION 'ATTEMPT_BINDING_MISMATCH'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF m.status <> 'ACTIVE' OR m.expires_at <= clock_timestamp() OR NEW.state <> 'RESERVED'
      OR NEW.order_id IS NOT NULL OR NEW.capture_id IS NOT NULL
      THEN RAISE EXCEPTION 'INVALID_PAYMENT_LIFECYCLE'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.state IN ('CREATING','CAPTURING') AND NEW.state IS DISTINCT FROM OLD.state
    AND (m.status <> 'ACTIVE' OR m.expires_at <= clock_timestamp())
    THEN RAISE EXCEPTION 'MANDATE_INACTIVE_OR_EXPIRED'; END IF;
  IF ROW(NEW.id,NEW.mandate_id,NEW.purchase_key,NEW.merchant_id,NEW.amount_minor,NEW.currency,NEW.create_request_id,NEW.capture_request_id)
    IS DISTINCT FROM ROW(OLD.id,OLD.mandate_id,OLD.purchase_key,OLD.merchant_id,OLD.amount_minor,OLD.currency,OLD.create_request_id,OLD.capture_request_id)
    OR (OLD.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id)
    OR (OLD.capture_id IS NOT NULL AND NEW.capture_id IS DISTINCT FROM OLD.capture_id)
    OR (OLD.budget_state <> 'RESERVED' AND NEW.budget_state <> OLD.budget_state)
    OR (OLD.state IN ('SUCCEEDED','FAILED','VOIDED','CANCELLED') AND NEW.state <> OLD.state)
    OR (OLD.state IN ('CAPTURING','CAPTURE_UNCERTAIN','PENDING') AND NEW.state IN ('RESERVED','CREATING','CREATE_UNCERTAIN','AWAITING_APPROVAL','APPROVED'))
    OR ROW(NEW.record->>'fingerprint',NEW.record->>'ownerId',NEW.record->>'agentId',NEW.record->>'createdAt')
      IS DISTINCT FROM ROW(OLD.record->>'fingerprint',OLD.record->>'ownerId',OLD.record->>'agentId',OLD.record->>'createdAt')
  THEN RAISE EXCEPTION 'PAYMENT_TERMS_IMMUTABLE'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER protect_attempt BEFORE INSERT OR UPDATE OR DELETE ON earmark_paypal.attempts
  FOR EACH ROW EXECUTE FUNCTION earmark_paypal.protect_attempt();

CREATE FUNCTION earmark_paypal.protect_merchant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'MERCHANT_POLICY_IMMUTABLE'; END IF;
  PERFORM id FROM earmark_paypal.mandates WHERE id=NEW.mandate_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM earmark_paypal.attempts WHERE mandate_id=NEW.mandate_id)
    THEN RAISE EXCEPTION 'MERCHANT_POLICY_IMMUTABLE'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER protect_merchant BEFORE INSERT OR UPDATE OR DELETE ON earmark_paypal.approved_merchants
  FOR EACH ROW EXECUTE FUNCTION earmark_paypal.protect_merchant();

CREATE FUNCTION earmark_paypal.audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AUDIT_APPEND_ONLY'; END; $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON earmark_paypal.audit
  FOR EACH ROW EXECUTE FUNCTION earmark_paypal.audit_append_only();

-- Deferred check reconciles both sides of the ledger at COMMIT, never an intermediate write.
CREATE FUNCTION earmark_paypal.check_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mid uuid; m earmark_paypal.mandates; r numeric; c numeric;
BEGIN
  IF TG_TABLE_NAME = 'mandates' THEN mid := NEW.id; ELSE mid := NEW.mandate_id; END IF;
  SELECT * INTO m FROM earmark_paypal.mandates WHERE id = mid;
  SELECT COALESCE(sum(amount_minor) FILTER (WHERE budget_state='RESERVED'),0),
         COALESCE(sum(amount_minor) FILTER (WHERE budget_state='CONSUMED'),0)
    INTO r,c FROM earmark_paypal.attempts WHERE mandate_id = mid;
  IF m.reserved_minor <> r OR m.consumed_minor <> c THEN RAISE EXCEPTION 'BUDGET_LEDGER_MISMATCH'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER mandate_ledger AFTER INSERT OR UPDATE ON earmark_paypal.mandates
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION earmark_paypal.check_ledger();
CREATE CONSTRAINT TRIGGER attempt_ledger AFTER INSERT OR UPDATE ON earmark_paypal.attempts
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION earmark_paypal.check_ledger();

CREATE FUNCTION earmark_paypal.protect_idempotency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'IDEMPOTENCY_HISTORY_IMMUTABLE'; END IF;
  IF ROW(NEW.request_id,NEW.attempt_id,NEW.operation,NEW.fingerprint) IS DISTINCT FROM
    ROW(OLD.request_id,OLD.attempt_id,OLD.operation,OLD.fingerprint)
    THEN RAISE EXCEPTION 'IDEMPOTENCY_TERMS_IMMUTABLE'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER protect_idempotency BEFORE UPDATE OR DELETE ON earmark_paypal.idempotency
  FOR EACH ROW EXECUTE FUNCTION earmark_paypal.protect_idempotency();
