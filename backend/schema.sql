CREATE TABLE IF NOT EXISTS plaid_items (
  item_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  institution_name TEXT,
  cursor TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plaid_accounts (
  account_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  official_name TEXT,
  type TEXT,
  subtype TEXT,
  current_balance REAL,
  available_balance REAL,
  credit_limit REAL,
  iso_currency_code TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES plaid_items(item_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plaid_transactions (
  transaction_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  merchant_name TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  category TEXT,
  pending INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES plaid_items(item_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON plaid_transactions(date DESC);

CREATE TABLE IF NOT EXISTS plaid_securities (
  security_id TEXT PRIMARY KEY,
  name TEXT,
  ticker_symbol TEXT,
  type TEXT,
  close_price REAL,
  close_price_as_of TEXT,
  iso_currency_code TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plaid_holdings (
  account_id TEXT NOT NULL,
  security_id TEXT NOT NULL,
  quantity REAL,
  cost_basis REAL,
  current_value REAL,
  institution_value REAL,
  institution_price REAL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, security_id),
  FOREIGN KEY (account_id) REFERENCES plaid_accounts(account_id) ON DELETE CASCADE,
  FOREIGN KEY (security_id) REFERENCES plaid_securities(security_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_holdings_account ON plaid_holdings(account_id);
