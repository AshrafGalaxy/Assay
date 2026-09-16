# Assay --- Database Schema

PostgreSQL is the target database and SQLAlchemy is the ORM/data-access
layer.

## Conceptual Model

``` text
users
 ├── accounts
 │     └── transactions
 ├── income_records
 ├── obligations
 ├── financial_snapshots
 ├── recommendations
 │     └── recommendation_impacts
 └── copilot_sessions
       └── copilot_messages
```

## users

  Column       Type           Constraints
  ------------ -------------- ------------------
  id           UUID/VARCHAR   PRIMARY KEY
  name         VARCHAR(100)   NOT NULL
  email        VARCHAR(150)   UNIQUE, NOT NULL
  created_at   TIMESTAMP      DEFAULT NOW()

Authentication credentials should not be duplicated unnecessarily.

## accounts

  Column              Type           Constraints
  ------------------- -------------- ---------------------
  id                  UUID           PRIMARY KEY
  user_id             UUID           FK users
  provider_type       VARCHAR(30)    e.g. mock_aa
  institution_name    VARCHAR(150)   NULL
  account_type        VARCHAR(50)    e.g. savings/credit
  masked_identifier   VARCHAR(50)    NULL
  currency            VARCHAR(3)     DEFAULT INR
  created_at          TIMESTAMP      DEFAULT NOW()

Never store bank credentials.

## transactions

  Column                Type            Constraints
  --------------------- --------------- -----------------------
  id                    UUID            PRIMARY KEY
  user_id               UUID            FK users
  account_id            UUID            FK accounts
  merchant_name         VARCHAR(150)    NOT NULL
  amount                DECIMAL(12,2)   NOT NULL
  transaction_type      VARCHAR(20)     income/expense
  date                  TIMESTAMP       NOT NULL
  category              VARCHAR(50)     NOT NULL
  payment_mode          VARCHAR(30)     NULL
  transaction_ref       VARCHAR(150)    NULL
  source_type           VARCHAR(30)     aa/receipt/upi/manual
  source_reference      VARCHAR(150)    NULL
  category_confidence   DECIMAL(5,4)    NULL
  created_at            TIMESTAMP       DEFAULT NOW()

## income_records

  Column          Type            Constraints
  --------------- --------------- --------------------------
  id              UUID            PRIMARY KEY
  user_id         UUID            FK users
  source          VARCHAR(100)    NOT NULL
  amount          DECIMAL(12,2)   NOT NULL
  frequency       VARCHAR(30)     monthly/weekly/irregular
  expected_date   DATE            NULL
  confidence      DECIMAL(5,4)    NULL

## obligations

  Column            Type            Constraints
  ----------------- --------------- ----------------------------------
  id                UUID            PRIMARY KEY
  user_id           UUID            FK users
  name              VARCHAR(150)    NOT NULL
  amount            DECIMAL(12,2)   NOT NULL
  frequency         VARCHAR(30)     NOT NULL
  next_due_date     DATE            NULL
  obligation_type   VARCHAR(50)     rent/emi/subscription/bill/other
  is_active         BOOLEAN         DEFAULT TRUE

## financial_snapshots

  Column              Type            Constraints
  ------------------- --------------- ---------------
  id                  UUID            PRIMARY KEY
  user_id             UUID            FK users
  period_start        DATE            NOT NULL
  period_end          DATE            NOT NULL
  income              DECIMAL(12,2)   NOT NULL
  spending            DECIMAL(12,2)   NOT NULL
  savings             DECIMAL(12,2)   NOT NULL
  savings_rate        DECIMAL(6,3)    NULL
  projected_balance   DECIMAL(12,2)   NULL
  created_at          TIMESTAMP       DEFAULT NOW()

## recommendations

  Column       Type           Constraints
  ------------ -------------- ----------------------------
  id           UUID           PRIMARY KEY
  user_id      UUID           FK users
  title        VARCHAR(200)   NOT NULL
  reason       TEXT           NOT NULL
  action       TEXT           NOT NULL
  confidence   DECIMAL(5,4)   NULL
  status       VARCHAR(30)    active/dismissed/completed
  created_at   TIMESTAMP      DEFAULT NOW()

## recommendation_impacts

  Column              Type            Constraints
  ------------------- --------------- --------------------
  id                  UUID            PRIMARY KEY
  recommendation_id   UUID            FK recommendations
  baseline_value      DECIMAL(12,2)   NOT NULL
  projected_value     DECIMAL(12,2)   NOT NULL
  difference_value    DECIMAL(12,2)   NOT NULL
  period              VARCHAR(30)     monthly/annual
  assumption          TEXT            NOT NULL

## copilot_sessions

  Column       Type        Constraints
  ------------ ----------- ---------------
  id           UUID        PRIMARY KEY
  user_id      UUID        FK users
  created_at   TIMESTAMP   DEFAULT NOW()

## copilot_messages

  Column       Type          Constraints
  ------------ ------------- ---------------------
  id           UUID          PRIMARY KEY
  session_id   UUID          FK copilot_sessions
  role         VARCHAR(20)   user/assistant
  content      TEXT          NOT NULL
  intent       VARCHAR(50)   NULL
  created_at   TIMESTAMP     DEFAULT NOW()

## receipts

  Column           Type           Constraints
  ---------------- -------------- -----------------
  id               UUID           PRIMARY KEY
  user_id          UUID           FK users
  transaction_id   UUID           FK transactions
  storage_url      TEXT           NULL
  ocr_text         TEXT           NULL
  ocr_confidence   DECIMAL(5,4)   NULL
  created_at       TIMESTAMP      DEFAULT NOW()

## Future AA Integration

For the hackathon, use `accounts.provider_type = "mock_aa"`. Keep
production provider/consent-specific entities out of the MVP until the
integration contract is known.
