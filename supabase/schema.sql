-- ============================================================================
-- ASSAY FINANCIAL COPILOT - COMPLETE PRODUCTION SUPABASE SCHEMA
-- Standards: Bank-Grade ACID | Numeric(14,2) Precision | Row-Level Security 
-- B-Tree + GIN Indexes | Immutable Ledger | Multi-Currency & Anti-DoS Defense
-- Granular Immutability | Composite Multi-Tenant FKs | Full Traceability
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Enumerated Domain Types
DO $$ BEGIN
    CREATE TYPE account_type_enum AS ENUM ('savings', 'salary', 'current', 'credit', 'demat');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE account_status_enum AS ENUM ('connected', 'syncing', 'disconnected', 'error');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE transaction_type_enum AS ENUM ('debit', 'credit');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE transaction_source_enum AS ENUM ('aa', 'receipt_ocr', 'upi_ocr', 'manual');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE obligation_type_enum AS ENUM ('subscription', 'loan', 'rent', 'utility', 'bill');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE obligation_frequency_enum AS ENUM ('monthly', 'quarterly', 'yearly');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE recommendation_action_enum AS ENUM ('spending_reduction', 'subscription_audit', 'debt_accelerator', 'emergency_fund');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE recommendation_status_enum AS ENUM ('active', 'applied', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE split_status_enum AS ENUM ('pending', 'settled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE upload_status_enum AS ENUM ('uploaded', 'processing', 'extracted', 'confirmed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE copilot_role_enum AS ENUM ('user', 'assistant', 'system');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE aa_consent_status_enum AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'NONE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 3. CORE DATABASE FUNCTIONS & TRIGGERS
-- ============================================================================

-- Automatic microsecond-accurate updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Email normalization to lowercase and whitespace trimming
CREATE OR REPLACE FUNCTION normalize_user_email()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email IS NOT NULL THEN
        NEW.email = LOWER(TRIM(NEW.email));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Active User Security Helper for Zero-Lag Session Revocation and Deactivation Guards
CREATE OR REPLACE FUNCTION public.is_user_active(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = p_user_id AND is_active = TRUE AND deleted_at IS NULL
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Calendar-Safe Obligation Due Date Helper (Prevents Feb 29/30/31 and 30-day month runtime crashes)
CREATE OR REPLACE FUNCTION public.get_safe_due_date(p_year INT, p_month INT, p_due_day INT)
RETURNS DATE AS $$
DECLARE
    v_first_of_month DATE;
    v_last_day_num INT;
    v_safe_day INT;
BEGIN
    IF p_month < 1 OR p_month > 12 THEN
        RAISE EXCEPTION 'Invalid month %: Must be between 1 and 12.', p_month;
    END IF;
    IF p_year < 1900 OR p_year > 2200 THEN
        RAISE EXCEPTION 'Invalid year %: Must be between 1900 and 2200.', p_year;
    END IF;

    v_first_of_month := MAKE_DATE(p_year, p_month, 1);
    v_last_day_num := EXTRACT(DAY FROM (v_first_of_month + INTERVAL '1 month - 1 day'))::INT;
    v_safe_day := GREATEST(1, LEAST(p_due_day, v_last_day_num));
    RETURN MAKE_DATE(p_year, p_month, v_safe_day);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Automatic Atomic Ledger Balance Sync (Prevents ledger drift, currency poisoning, and ghost writes)
CREATE OR REPLACE FUNCTION sync_account_balance_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_acc_currency VARCHAR(5);
    v_acc_status account_status_enum;
BEGIN
    -- Block inactive or soft-deleted users from writing transactions
    IF NOT is_user_active(NEW.user_id) THEN
        RAISE EXCEPTION 'Cannot record transaction: User account % is inactive or deleted.', NEW.user_id;
    END IF;

    IF NEW.account_id IS NOT NULL THEN
        SELECT currency, status INTO v_acc_currency, v_acc_status 
        FROM accounts 
        WHERE id = NEW.account_id;

        -- Currency Poisoning Guard: Reject cross-currency contamination without explicit FX rate
        IF v_acc_currency IS NOT NULL AND NEW.currency != v_acc_currency THEN
            RAISE EXCEPTION 'Currency mismatch: Transaction currency (%) does not match Account currency (%). Multi-currency ledger entries must specify explicit conversions.', 
                NEW.currency, v_acc_currency;
        END IF;

        -- Atomic balance mutation
        IF NEW.type = 'credit' THEN
            UPDATE accounts 
            SET balance = balance + NEW.amount 
            WHERE id = NEW.account_id;
        ELSIF NEW.type = 'debit' THEN
            UPDATE accounts 
            SET balance = balance - NEW.amount 
            WHERE id = NEW.account_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Disconnected Account Guard: Prevents recording transactions on unlinked bank accounts
CREATE OR REPLACE FUNCTION check_account_status_for_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_status account_status_enum;
BEGIN
    IF NEW.account_id IS NOT NULL THEN
        SELECT status INTO v_status FROM accounts WHERE id = NEW.account_id;
        IF v_status = 'disconnected' THEN
            RAISE EXCEPTION 'Cannot record transaction on a disconnected bank account.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- RBI Account Aggregator (AA) Total Immutability Post-Revocation/Expiry
CREATE OR REPLACE FUNCTION validate_aa_consent_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT is_user_active(NEW.user_id) THEN
        RAISE EXCEPTION 'Cannot modify consent for inactive or soft-deleted user.';
    END IF;

    IF OLD.status IN ('REVOKED', 'EXPIRED') THEN
        RAISE EXCEPTION 'RBI Compliance: A revoked or expired consent is immutable and cannot be altered.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cascade Account Aggregator Consent Revocation to Accounts (Disconnects bank fetch)
CREATE OR REPLACE FUNCTION public.cascade_aa_consent_revocation()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status IN ('REVOKED', 'EXPIRED') AND OLD.status = 'ACTIVE') THEN
        UPDATE accounts 
        SET status = 'disconnected', updated_at = clock_timestamp()
        WHERE user_id = NEW.user_id AND provider = 'mock_aa';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Stored Procedure for Automated AA Consent Expiry (Designed for scheduled pg_cron / Edge Worker)
CREATE OR REPLACE FUNCTION public.expire_stale_consents()
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE aa_consents
    SET status = 'EXPIRED', updated_at = clock_timestamp()
    WHERE status = 'ACTIVE' AND expiry_date <= NOW();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bill Split Over-Allocation Guard: Item price totals cannot exceed bill split total
CREATE OR REPLACE FUNCTION validate_split_item_allocation()
RETURNS TRIGGER AS $$
DECLARE
    v_total NUMERIC(14, 2);
    v_allocated NUMERIC(14, 2);
BEGIN
    SELECT total_amount INTO v_total FROM bill_splits WHERE id = NEW.split_id;
    SELECT COALESCE(SUM(price), 0.00) INTO v_allocated 
    FROM split_items 
    WHERE split_id = NEW.split_id AND id != COALESCE(NEW.id, gen_random_uuid());

    IF (v_allocated + NEW.price) > v_total THEN
        RAISE EXCEPTION 'Split allocation error: Sum of item prices (%) exceeds bill total (%).', 
            (v_allocated + NEW.price), v_total;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ghost Split Prevention Trigger: Cannot settle a bill unless all items sum to total AND are paid
CREATE OR REPLACE FUNCTION validate_bill_split_settlement()
RETURNS TRIGGER AS $$
DECLARE
    v_item_count INT;
    v_unpaid_count INT;
    v_sum_allocated NUMERIC(14, 2);
BEGIN
    IF NEW.status = 'settled' AND (OLD.status IS NULL OR OLD.status != 'settled') THEN
        -- Ghost Participant Guard
        IF NEW.participants IS NULL OR jsonb_typeof(NEW.participants) != 'array' OR jsonb_array_length(NEW.participants) = 0 THEN
            RAISE EXCEPTION 'Cannot settle a bill split with no participants registered.';
        END IF;

        SELECT 
            COUNT(*), 
            COUNT(*) FILTER (WHERE is_paid = FALSE),
            COALESCE(SUM(price), 0.00)
        INTO v_item_count, v_unpaid_count, v_sum_allocated
        FROM split_items 
        WHERE split_id = NEW.id;

        IF v_item_count = 0 THEN
            RAISE EXCEPTION 'Cannot settle an empty bill split with zero line items.';
        END IF;

        IF v_sum_allocated != NEW.total_amount THEN
            RAISE EXCEPTION 'Cannot settle bill split: Item prices sum to % but bill total is %.', 
                v_sum_allocated, NEW.total_amount;
        END IF;

        IF v_unpaid_count > 0 THEN
            RAISE EXCEPTION 'Cannot settle bill split: Found % unpaid line items.', v_unpaid_count;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bill Split Total Amount Update & Post-Settlement Immutability Guard
CREATE OR REPLACE FUNCTION validate_bill_split_total_update()
RETURNS TRIGGER AS $$
DECLARE
    v_allocated NUMERIC(14, 2);
BEGIN
    SELECT COALESCE(SUM(price), 0.00) INTO v_allocated 
    FROM split_items 
    WHERE split_id = NEW.id;

    IF NEW.total_amount < v_allocated THEN
        RAISE EXCEPTION 'Cannot decrease bill total to %: Already allocated line items sum to %.', 
            NEW.total_amount, v_allocated;
    END IF;

    IF OLD.status = 'settled' AND NEW.total_amount != OLD.total_amount THEN
        RAISE EXCEPTION 'Cannot alter total amount of a settled bill split (ID %). The ledger is finalized.', NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Settled Bill Split Immutability Guard: Blocks modifying items once a bill split is settled
CREATE OR REPLACE FUNCTION prevent_settled_split_mutation()
RETURNS TRIGGER AS $$
DECLARE
    v_old_status split_status_enum;
    v_new_status split_status_enum;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT status INTO v_old_status FROM bill_splits WHERE id = OLD.split_id;
        IF v_old_status = 'settled' THEN
            RAISE EXCEPTION 'Cannot modify or remove items from a settled bill split (ID %). The ledger is finalized.', OLD.split_id;
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT status INTO v_new_status FROM bill_splits WHERE id = NEW.split_id;
        IF v_new_status = 'settled' THEN
            RAISE EXCEPTION 'Cannot add or move items to a settled bill split (ID %). The ledger is finalized.', NEW.split_id;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Bill Split Item Paid Timestamping Trigger (Synchronizes paid_at with is_paid)
CREATE OR REPLACE FUNCTION set_split_item_paid_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_paid = TRUE AND NEW.paid_at IS NULL THEN
        NEW.paid_at := clock_timestamp();
    ELSIF NEW.is_paid = FALSE THEN
        NEW.paid_at := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Copilot Chat Message Flooding & DoS Rate Limiter (Max 30 msgs/min, Max 500 msgs/session)
CREATE OR REPLACE FUNCTION throttle_copilot_messages()
RETURNS TRIGGER AS $$
DECLARE
    v_session_count INT;
    v_burst_count INT;
    v_is_archived BOOLEAN;
BEGIN
    IF NOT is_user_active(NEW.user_id) THEN
        RAISE EXCEPTION 'User account % is inactive or deleted.', NEW.user_id;
    END IF;

    -- Block message injection into archived sessions
    SELECT is_archived INTO v_is_archived
    FROM copilot_sessions
    WHERE id = NEW.session_id;

    IF v_is_archived = TRUE THEN
        RAISE EXCEPTION 'Cannot send message to an archived copilot session (ID %).', NEW.session_id;
    END IF;

    -- 500-message session cap
    SELECT COUNT(*) INTO v_session_count 
    FROM copilot_messages 
    WHERE session_id = NEW.session_id;

    IF NEW.role = 'user' AND v_session_count >= 500 THEN
        RAISE EXCEPTION 'Session message limit (500) reached. Please start a new advisory session.';
    END IF;

    -- Burst limit (max 30 msgs/min per session)
    SELECT COUNT(*) INTO v_burst_count 
    FROM copilot_messages 
    WHERE session_id = NEW.session_id 
      AND created_at >= clock_timestamp() - INTERVAL '60 seconds';

    IF v_burst_count >= 30 THEN
        RAISE EXCEPTION 'Rate limit exceeded: Maximum 30 messages per minute allowed per session. Please wait a moment.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Copilot Chat Session Touch Trigger (Propagates new message activity to session updated_at)
CREATE OR REPLACE FUNCTION touch_copilot_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE copilot_sessions 
    SET updated_at = clock_timestamp() 
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- What-If Simulations: Single Active Committed Plan Synchronization Trigger
CREATE OR REPLACE FUNCTION sync_single_committed_simulation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_committed = TRUE THEN
        UPDATE simulations 
        SET is_committed = FALSE 
        WHERE user_id = NEW.user_id AND id != COALESCE(NEW.id, gen_random_uuid()) AND is_committed = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Granular Transaction Financial & Ownership Immutability Trigger (Locks financial fields & tenant user_id, allows user annotations)
CREATE OR REPLACE FUNCTION guard_transaction_financial_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.user_id != NEW.user_id OR
        OLD.amount != NEW.amount OR 
        OLD.type != NEW.type OR 
        OLD.account_id IS DISTINCT FROM NEW.account_id OR 
        OLD.currency != NEW.currency OR 
        OLD.transaction_date != NEW.transaction_date OR
        OLD.parent_transaction_id IS DISTINCT FROM NEW.parent_transaction_id) THEN
        RAISE EXCEPTION 'Financial fields and user ownership of a transaction are strictly immutable.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Automatic Supabase Auth User Profile & Settings Provisioning
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, phone, name)
    VALUES (
        NEW.id, 
        CASE WHEN NEW.email IS NOT NULL THEN LOWER(NEW.email) ELSE NULL END,
        NEW.phone,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', 'Assay User')
    )
    ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(users.email, EXCLUDED.email),
        phone = COALESCE(EXCLUDED.phone, users.phone),
        name = CASE WHEN users.name = 'Assay User' AND EXCLUDED.name != 'Assay User' THEN EXCLUDED.name ELSE users.name END,
        updated_at = NOW();

    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Guaranteed user_settings Provisioning Trigger (Handles direct inserts into public.users)
CREATE OR REPLACE FUNCTION public.ensure_user_settings_provisioned()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auth User Update Sync (Propagates email/phone changes from auth.users to public.users)
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.users
    SET 
        email = CASE WHEN NEW.email IS NOT NULL THEN LOWER(NEW.email) ELSE users.email END,
        phone = COALESCE(NEW.phone, users.phone),
        updated_at = clock_timestamp()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Deadlock-Free, Multi-Currency-Safe Atomic Fund Transfers
CREATE OR REPLACE FUNCTION public.transfer_funds(
    p_user_id UUID,
    p_from_account_id UUID,
    p_to_account_id UUID,
    p_amount NUMERIC(14, 2),
    p_category TEXT DEFAULT 'Transfer',
    p_description TEXT DEFAULT 'Internal Account Transfer'
)
RETURNS JSONB AS $$
DECLARE
    v_from_bal NUMERIC(14, 2);
    v_from_limit NUMERIC(14, 2);
    v_from_type account_type_enum;
    v_from_curr VARCHAR(5);
    v_from_status account_status_enum;
    v_to_bal NUMERIC(14, 2);
    v_to_curr VARCHAR(5);
    v_to_status account_status_enum;
    v_tx1_id UUID;
    v_tx2_id UUID;
    v_first_acc UUID;
    v_second_acc UUID;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Transfer amount must be positive.';
    END IF;
    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'Cannot transfer funds to the same account.';
    END IF;

    -- Caller Authorization Guard: If called via PostgREST/client RPC, ensure caller matches p_user_id
    IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized: Caller (%) cannot execute fund transfers on behalf of user (%).', auth.uid(), p_user_id;
    END IF;

    -- Verify user is active
    IF NOT is_user_active(p_user_id) THEN
        RAISE EXCEPTION 'User account % is deactivated or deleted.', p_user_id;
    END IF;

    -- Deadlock-free locking: lock accounts in strict deterministic UUID order
    IF p_from_account_id < p_to_account_id THEN
        v_first_acc := p_from_account_id;
        v_second_acc := p_to_account_id;
    ELSE
        v_first_acc := p_to_account_id;
        v_second_acc := p_from_account_id;
    END IF;

    -- Lock first account, verify ownership
    PERFORM id FROM accounts 
    WHERE id = v_first_acc AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account % not found or not owned by user.', v_first_acc;
    END IF;

    -- Lock second account, verify ownership
    PERFORM id FROM accounts 
    WHERE id = v_second_acc AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account % not found or not owned by user.', v_second_acc;
    END IF;

    -- Fetch source account details
    SELECT balance, credit_limit, account_type, currency, status 
    INTO v_from_bal, v_from_limit, v_from_type, v_from_curr, v_from_status 
    FROM accounts WHERE id = p_from_account_id;

    -- Fetch destination account details
    SELECT balance, currency, status 
    INTO v_to_bal, v_to_curr, v_to_status 
    FROM accounts WHERE id = p_to_account_id;

    -- Guard 1: Connected status check
    IF v_from_status != 'connected' THEN
        RAISE EXCEPTION 'Source account % is % (cannot transfer out).', p_from_account_id, v_from_status;
    END IF;
    IF v_to_status != 'connected' THEN
        RAISE EXCEPTION 'Destination account % is % (cannot transfer in).', p_to_account_id, v_to_status;
    END IF;

    -- Guard 2: Currency matching check (prevents cross-currency arbitrage)
    IF v_from_curr != v_to_curr THEN
        RAISE EXCEPTION 'Currency mismatch: Cannot transfer from % (%) to % (%). Direct multi-currency transfer requires an explicit FX exchange rate.',
            p_from_account_id, v_from_curr, p_to_account_id, v_to_curr;
    END IF;

    -- Guard 3: Sufficient funds check
    IF v_from_type != 'credit' AND (v_from_bal - p_amount) < 0 THEN
        RAISE EXCEPTION 'Insufficient funds: Source account % has balance %, but transfer amount is %.',
            p_from_account_id, v_from_bal, p_amount;
    ELSIF v_from_type = 'credit' AND (v_from_bal - p_amount) < -v_from_limit THEN
        RAISE EXCEPTION 'Credit limit exceeded: Source account % has balance % and limit %, cannot withdraw %.',
            p_from_account_id, v_from_bal, v_from_limit, p_amount;
    END IF;

    -- Debit from source account
    INSERT INTO transactions (
        user_id, account_id, amount, currency, type, category, 
        merchant_name, description, transaction_date, source_type, payment_method
    ) VALUES (
        p_user_id, p_from_account_id, p_amount, v_from_curr, 'debit', p_category,
        'Account Transfer (Out)', p_description, CURRENT_DATE, 'manual', 'netbanking'
    ) RETURNING id INTO v_tx1_id;

    -- Credit to destination account (with parent_transaction_id link)
    INSERT INTO transactions (
        user_id, account_id, amount, currency, type, category, 
        merchant_name, description, transaction_date, source_type, payment_method, parent_transaction_id
    ) VALUES (
        p_user_id, p_to_account_id, p_amount, v_to_curr, 'credit', p_category,
        'Account Transfer (In)', p_description, CURRENT_DATE, 'manual', 'netbanking', v_tx1_id
    ) RETURNING id INTO v_tx2_id;

    SELECT balance INTO v_from_bal FROM accounts WHERE id = p_from_account_id;
    SELECT balance INTO v_to_bal FROM accounts WHERE id = p_to_account_id;

    RETURN jsonb_build_object(
        'success', true,
        'amount', p_amount,
        'currency', v_from_curr,
        'debit_transaction_id', v_tx1_id,
        'credit_transaction_id', v_tx2_id,
        'from_balance', v_from_bal,
        'to_balance', v_to_bal
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. RELATIONAL TABLES
-- ============================================================================

-- Table 1: Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT CHECK (email IS NULL OR (email = LOWER(email) AND email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$')),
    name TEXT NOT NULL CHECK (length(name) <= 150),
    phone TEXT CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{10,15}$'),
    pan_masked VARCHAR(10) CHECK (pan_masked IS NULL OR (length(pan_masked) = 10 AND pan_masked ~ '[•*Xx]')),
    hashed_password TEXT,
    avatar_url TEXT,
    avatar_index INT DEFAULT 24 CHECK (avatar_index BETWEEN 1 AND 35),
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMPTZ, -- Soft deletion for regulatory 5-year data retention compliance
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_user_identity CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_normalize_email ON users;
CREATE TRIGGER trg_users_normalize_email BEFORE INSERT OR UPDATE OF email ON users FOR EACH ROW EXECUTE FUNCTION normalize_user_email();

DROP TRIGGER IF EXISTS trg_ensure_user_settings ON users;
CREATE TRIGGER trg_ensure_user_settings AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION public.ensure_user_settings_provisioned();

-- Table 2: User Settings
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    biometric_enabled BOOLEAN DEFAULT TRUE,
    mask_pii BOOLEAN DEFAULT TRUE,
    read_only_consent BOOLEAN DEFAULT TRUE,
    emi_alerts BOOLEAN DEFAULT TRUE,
    cash_flow_pressure_alerts BOOLEAN DEFAULT TRUE,
    unusual_spend_alerts BOOLEAN DEFAULT TRUE,
    weekly_briefing BOOLEAN DEFAULT TRUE,
    whatsapp_alerts BOOLEAN DEFAULT FALSE,
    email_digest BOOLEAN DEFAULT TRUE,
    theme_preference TEXT DEFAULT 'system' CHECK (theme_preference IN ('system', 'light', 'dark')),
    currency VARCHAR(5) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_user_settings_user UNIQUE(user_id)
);

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON user_settings;
CREATE TRIGGER trg_user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 3: Financial Accounts (with FIP Metadata, Non-Zero Overdraft & PCI-DSS Masking)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_name TEXT NOT NULL CHECK (length(institution_name) <= 150),
    account_type account_type_enum DEFAULT 'savings',
    account_number_masked VARCHAR(20) NOT NULL,
    balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    credit_limit NUMERIC(14, 2) DEFAULT 0.00 CHECK (credit_limit >= 0),
    currency VARCHAR(5) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
    provider TEXT DEFAULT 'mock_aa',
    status account_status_enum DEFAULT 'connected',
    fip_id TEXT,
    institution_type TEXT DEFAULT 'Bank' CHECK (institution_type IN ('Bank', 'NBFC', 'Mutual Fund', 'Brokerage')),
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_positive_balance CHECK (balance >= 0 OR (account_type = 'credit' AND credit_limit > 0 AND balance >= -credit_limit)),
    CONSTRAINT chk_account_masked_format CHECK (account_number_masked ~ '[•*Xx]' AND length(account_number_masked) >= 4 AND account_number_masked ~ '\d{2,4}$'),
    CONSTRAINT uq_accounts_user_institution_accnum UNIQUE (user_id, institution_name, account_number_masked, account_type),
    CONSTRAINT uq_accounts_id_user UNIQUE (id, user_id)
);

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON accounts;
CREATE TRIGGER trg_accounts_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 4: Account Aggregator Consents (RBI Compliant)
CREATE TABLE IF NOT EXISTS aa_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_id TEXT UNIQUE NOT NULL,
    status aa_consent_status_enum DEFAULT 'ACTIVE',
    purpose TEXT NOT NULL DEFAULT 'Personal Financial Management',
    data_range TEXT NOT NULL DEFAULT 'Last 6 months',
    fetch_frequency TEXT NOT NULL DEFAULT 'Daily / On-demand',
    expiry_date TIMESTAMPTZ NOT NULL,
    fiu_name TEXT NOT NULL DEFAULT 'ASSAY Financial Intelligence',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_consent_expiry_future CHECK (expiry_date > created_at)
);

DROP TRIGGER IF EXISTS trg_aa_consents_updated_at ON aa_consents;
CREATE TRIGGER trg_aa_consents_updated_at BEFORE UPDATE ON aa_consents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_aa_consent_transition ON aa_consents;
CREATE TRIGGER trg_aa_consent_transition BEFORE UPDATE ON aa_consents FOR EACH ROW EXECUTE FUNCTION validate_aa_consent_transition();

DROP TRIGGER IF EXISTS trg_cascade_aa_consent_revocation ON aa_consents;
CREATE TRIGGER trg_cascade_aa_consent_revocation
AFTER UPDATE OF status ON aa_consents
FOR EACH ROW EXECUTE FUNCTION public.cascade_aa_consent_revocation();

-- Table 5: Upload Audits (Receipts & UPI Screenshots with Composite Unique Constraint)
CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id UUID,
    filename TEXT NOT NULL CHECK (length(filename) <= 255),
    storage_path TEXT,
    file_type VARCHAR(50) DEFAULT 'image/jpeg' CHECK (file_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR (file_size_bytes > 0 AND file_size_bytes <= 20971520)),
    status upload_status_enum DEFAULT 'uploaded',
    extracted_data JSONB,
    confidence NUMERIC(4, 2) CHECK (confidence BETWEEN 0 AND 1),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_uploads_id_user UNIQUE (id, user_id)
);

DROP TRIGGER IF EXISTS trg_uploads_updated_at ON uploads;
CREATE TRIGGER trg_uploads_updated_at BEFORE UPDATE ON uploads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 6: Transactions (Ledger with Granular Immutability, Composite Multi-Tenant FK & Idempotency)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID,
    parent_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    receipt_upload_id UUID,
    idempotency_key TEXT,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(5) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
    type transaction_type_enum NOT NULL,
    category TEXT NOT NULL CHECK (length(category) <= 100),
    merchant_name TEXT NOT NULL CHECK (length(merchant_name) <= 255),
    payment_method VARCHAR(30) DEFAULT 'upi' CHECK (payment_method IN ('upi', 'card', 'netbanking', 'cash', 'nach', 'other')),
    notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
    description TEXT CHECK (description IS NULL OR length(description) <= 1000),
    transaction_date DATE NOT NULL,
    bank_transaction_id TEXT,
    is_recurring BOOLEAN DEFAULT FALSE,
    is_fixed BOOLEAN DEFAULT FALSE,
    is_discretionary BOOLEAN DEFAULT TRUE,
    source_type transaction_source_enum DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_transaction_date_valid_range CHECK (transaction_date >= '2000-01-01'::DATE AND transaction_date <= CURRENT_DATE + INTERVAL '1 day'),
    CONSTRAINT fk_transactions_account_user FOREIGN KEY (account_id, user_id) REFERENCES accounts(id, user_id) ON DELETE CASCADE,
    CONSTRAINT fk_transactions_upload_user FOREIGN KEY (receipt_upload_id, user_id) REFERENCES uploads(id, user_id) ON DELETE SET NULL,
    CONSTRAINT uq_transactions_id_user UNIQUE (id, user_id)
);

DROP TRIGGER IF EXISTS trg_sync_account_balance ON transactions;
CREATE TRIGGER trg_sync_account_balance
AFTER INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION sync_account_balance_on_transaction();

DROP TRIGGER IF EXISTS trg_check_account_status ON transactions;
CREATE TRIGGER trg_check_account_status
BEFORE INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION check_account_status_for_transaction();

DROP TRIGGER IF EXISTS trg_guard_transaction_financial_immutability ON transactions;
CREATE TRIGGER trg_guard_transaction_financial_immutability
BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION guard_transaction_financial_immutability();

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions;
CREATE TRIGGER trg_transactions_updated_at
BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Complete circular foreign key from uploads to transactions (Composite Multi-Tenant)
DO $$ BEGIN
    ALTER TABLE uploads ADD CONSTRAINT fk_uploads_transaction_user FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Table 7: Obligations (Loans, Subscriptions, Rent, EMIs with Composite Account FK & Payoff Calculation)
CREATE TABLE IF NOT EXISTS obligations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID,
    name TEXT NOT NULL CHECK (length(name) <= 100),
    institution_name TEXT CHECK (institution_name IS NULL OR length(institution_name) <= 150),
    obligation_type obligation_type_enum DEFAULT 'subscription',
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    original_amount NUMERIC(14, 2) CHECK (original_amount IS NULL OR original_amount >= amount),
    remaining_balance NUMERIC(14, 2) CHECK (remaining_balance >= 0),
    category TEXT NOT NULL CHECK (length(category) <= 100),
    frequency obligation_frequency_enum DEFAULT 'monthly',
    due_month INT CHECK (due_month BETWEEN 1 AND 12),
    due_day INT CHECK (due_day BETWEEN 1 AND 31),
    apr NUMERIC(5, 2) CHECK (apr >= 0 AND apr <= 100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_obligation_frequency_month CHECK (frequency != 'monthly' OR due_month IS NULL),
    CONSTRAINT chk_yearly_obligation_due_month CHECK (frequency != 'yearly' OR due_month IS NOT NULL),
    CONSTRAINT chk_remaining_le_original CHECK (original_amount IS NULL OR remaining_balance IS NULL OR remaining_balance <= original_amount),
    CONSTRAINT fk_obligations_account_user FOREIGN KEY (account_id, user_id) REFERENCES accounts(id, user_id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS trg_obligations_updated_at ON obligations;
CREATE TRIGGER trg_obligations_updated_at BEFORE UPDATE ON obligations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 8: Financial Health Snapshots (Precomputed for <15ms cold start)
CREATE TABLE IF NOT EXISTS financial_health_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    income NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    spending NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    savings NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    savings_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.0000 CHECK (savings_rate <= 1.0000 AND savings_rate >= -10.0000),
    fixed_expenses NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    variable_expenses NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    recurring_obligations NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    projected_month_end_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    daily_burn_rate NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    health_score INT NOT NULL CHECK (health_score BETWEEN 0 AND 100),
    signals JSONB DEFAULT '[]'::jsonb CHECK (jsonb_typeof(signals) = 'array'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_health_metrics_non_negative CHECK (
        income >= 0 AND 
        spending >= 0 AND 
        fixed_expenses >= 0 AND 
        variable_expenses >= 0 AND 
        recurring_obligations >= 0 AND 
        daily_burn_rate >= 0
    )
);

-- Table 9: Recommendations
CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(title) <= 255),
    category TEXT NOT NULL CHECK (length(category) <= 100),
    potential_monthly_savings NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (potential_monthly_savings >= 0),
    impact_description TEXT NOT NULL,
    action_type recommendation_action_enum NOT NULL,
    status recommendation_status_enum DEFAULT 'active',
    confidence NUMERIC(4, 2) DEFAULT 0.85 CHECK (confidence BETWEEN 0 AND 1),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_recommendations_updated_at ON recommendations;
CREATE TRIGGER trg_recommendations_updated_at BEFORE UPDATE ON recommendations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 10: What-If Simulations (with Single Active Committed Plan Synchronization)
CREATE TABLE IF NOT EXISTS simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Budget Optimization' CHECK (length(name) <= 100),
    dining_reduction NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (dining_reduction >= 0),
    extra_loan_payment NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (extra_loan_payment >= 0),
    simulated_monthly_savings NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    simulated_interest_saved NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (simulated_interest_saved >= 0),
    simulated_score INT CHECK (simulated_score BETWEEN 0 AND 100),
    is_committed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_simulations_updated_at ON simulations;
CREATE TRIGGER trg_simulations_updated_at BEFORE UPDATE ON simulations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_sync_single_committed_simulation ON simulations;
CREATE TRIGGER trg_sync_single_committed_simulation
BEFORE INSERT OR UPDATE OF is_committed ON simulations
FOR EACH ROW EXECUTE FUNCTION sync_single_committed_simulation();

-- Table 11: Bill Splits & Split Items (Composite Multi-Tenant References to Receipts & Transactions)
CREATE TABLE IF NOT EXISTS bill_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    upload_id UUID,
    transaction_id UUID,
    title TEXT NOT NULL CHECK (length(title) <= 255),
    total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount > 0),
    participants JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(participants) = 'array'),
    status split_status_enum DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_bill_splits_upload_user FOREIGN KEY (upload_id, user_id) REFERENCES uploads(id, user_id) ON DELETE SET NULL,
    CONSTRAINT fk_bill_splits_tx_user FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS trg_bill_splits_updated_at ON bill_splits;
CREATE TRIGGER trg_bill_splits_updated_at BEFORE UPDATE ON bill_splits FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_validate_bill_split_settlement ON bill_splits;
CREATE TRIGGER trg_validate_bill_split_settlement
BEFORE UPDATE OF status ON bill_splits
FOR EACH ROW EXECUTE FUNCTION validate_bill_split_settlement();

DROP TRIGGER IF EXISTS trg_validate_bill_split_total_update ON bill_splits;
CREATE TRIGGER trg_validate_bill_split_total_update
BEFORE UPDATE OF total_amount ON bill_splits
FOR EACH ROW EXECUTE FUNCTION validate_bill_split_total_update();

CREATE TABLE IF NOT EXISTS split_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    split_id UUID NOT NULL REFERENCES bill_splits(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) <= 100),
    price NUMERIC(14, 2) NOT NULL CHECK (price >= 0),
    assigned_to TEXT NOT NULL CHECK (length(assigned_to) <= 100),
    is_paid BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_validate_split_item ON split_items;
CREATE TRIGGER trg_validate_split_item
BEFORE INSERT OR UPDATE ON split_items
FOR EACH ROW EXECUTE FUNCTION validate_split_item_allocation();

DROP TRIGGER IF EXISTS trg_prevent_settled_split_mutation ON split_items;
CREATE TRIGGER trg_prevent_settled_split_mutation
BEFORE INSERT OR UPDATE OR DELETE ON split_items
FOR EACH ROW EXECUTE FUNCTION prevent_settled_split_mutation();

DROP TRIGGER IF EXISTS trg_split_items_paid_at ON split_items;
CREATE TRIGGER trg_split_items_paid_at
BEFORE INSERT OR UPDATE OF is_paid ON split_items
FOR EACH ROW EXECUTE FUNCTION set_split_item_paid_at();

-- Table 12: Copilot Chat Sessions & Complete Messages (with Archival Lifecycle & Burst Throttle)
CREATE TABLE IF NOT EXISTS copilot_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Financial Advisory Session' CHECK (length(title) <= 255),
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_copilot_sessions_id_user UNIQUE (id, user_id)
);

DROP TRIGGER IF EXISTS trg_copilot_sessions_updated_at ON copilot_sessions;
CREATE TRIGGER trg_copilot_sessions_updated_at BEFORE UPDATE ON copilot_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS copilot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role copilot_role_enum NOT NULL,
    content TEXT NOT NULL CHECK (length(content) <= 30000), -- Boundary defense against payload bloat
    intent VARCHAR(50),
    grounded_data JSONB CHECK (grounded_data IS NULL OR jsonb_typeof(grounded_data) = 'object'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_copilot_messages_session_user FOREIGN KEY (session_id, user_id) REFERENCES copilot_sessions(id, user_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_throttle_copilot_messages ON copilot_messages;
CREATE TRIGGER trg_throttle_copilot_messages
BEFORE INSERT ON copilot_messages
FOR EACH ROW EXECUTE FUNCTION throttle_copilot_messages();

DROP TRIGGER IF EXISTS trg_touch_copilot_session ON copilot_messages;
CREATE TRIGGER trg_touch_copilot_session
AFTER INSERT ON copilot_messages
FOR EACH ROW EXECUTE FUNCTION touch_copilot_session_updated_at();

-- ============================================================================
-- 5. HIGH-PERFORMANCE B-TREE, GIN & IDEMPOTENCY INDEXES
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone ON users(phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_aa_consents_user ON aa_consents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_acc_date ON transactions(account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(user_id, category);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_account_bank_tx ON transactions(account_id, bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_user_idempotency ON transactions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_parent_tx ON transactions(parent_transaction_id) WHERE parent_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_receipt_upload ON transactions(receipt_upload_id) WHERE receipt_upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_obligations_user ON obligations(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_obligations_account ON obligations(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_health_snapshots_user ON financial_health_snapshots(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_signals_gin ON financial_health_snapshots USING gin(signals);
CREATE INDEX IF NOT EXISTS idx_recommendations_user ON recommendations(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recommendations_active ON recommendations(user_id, title, action_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_simulations_user ON simulations(user_id);
CREATE INDEX IF NOT EXISTS idx_bill_splits_user ON bill_splits(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bill_splits_upload ON bill_splits(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bill_splits_transaction ON bill_splits(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_split_items_split ON split_items(split_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id, status);
CREATE INDEX IF NOT EXISTS idx_uploads_transaction ON uploads(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copilot_sessions_user ON copilot_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_sessions_user_active ON copilot_sessions(user_id, updated_at DESC) WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_copilot_messages_user ON copilot_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_copilot_messages_session ON copilot_messages(session_id, created_at ASC);

-- ============================================================================
-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE aa_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_messages ENABLE ROW LEVEL SECURITY;

-- Standard tenant isolation policies: Users access only their own records
DO $$ BEGIN
    CREATE POLICY "Users can access own user profile" ON users FOR ALL USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can access own settings" ON user_settings FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can access own accounts" ON accounts FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can access own consents" ON aa_consents FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- GRANULAR IMMUTABLE TRANSACTION POLICIES
-- Users can SELECT and INSERT. They can UPDATE annotations (notes, category), but financial values and ownership are strictly protected by trg_guard_transaction_financial_immutability. DELETE is strictly blocked.
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can read own transactions" ON transactions;
    CREATE POLICY "Users can read own transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;
    CREATE POLICY "Users can insert own transactions" ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can update own transaction annotations" ON transactions;
    CREATE POLICY "Users can update own transaction annotations" 
    ON transactions FOR UPDATE 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can access own obligations" ON obligations FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can access own health snapshots" ON financial_health_snapshots FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can access own recommendations" ON recommendations FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can access own simulations" ON simulations FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can access own bill splits" ON bill_splits FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can access own split items" ON split_items FOR ALL USING (
        EXISTS (SELECT 1 FROM bill_splits WHERE bill_splits.id = split_items.split_id AND bill_splits.user_id = auth.uid())
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM bill_splits WHERE bill_splits.id = split_items.split_id AND bill_splits.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can access own uploads" ON uploads FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can access own copilot sessions" ON copilot_sessions FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can access own copilot messages" ON copilot_messages FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 7. SUPABASE AUTH AUTOMATIC LIFECYCLE HOOKS
-- ============================================================================
DO $$ BEGIN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN undefined_table THEN null;
END $$;

DO $$ BEGIN
    DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
    CREATE TRIGGER on_auth_user_updated
    AFTER UPDATE OF email, phone ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_user_update();
EXCEPTION WHEN undefined_table THEN null;
END $$;

-- ============================================================================
-- 8. SUPABASE STORAGE BUCKET FOR RECEIPTS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', false) 
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
    CREATE POLICY "Users can upload their own receipt files" 
    ON storage.objects FOR INSERT 
    WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can view their own receipt files" 
    ON storage.objects FOR SELECT 
    USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can delete their own receipt files" 
    ON storage.objects FOR DELETE 
    USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can update their own receipt files" 
    ON storage.objects FOR UPDATE 
    USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1])
    WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN null; END $$;
