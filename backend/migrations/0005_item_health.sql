ALTER TABLE plaid_items ADD COLUMN last_sync_attempt TEXT;
ALTER TABLE plaid_items ADD COLUMN last_successful_sync TEXT;
ALTER TABLE plaid_items ADD COLUMN last_error_code TEXT;
ALTER TABLE plaid_items ADD COLUMN last_error_message TEXT;
ALTER TABLE plaid_items ADD COLUMN consent_expiration_time TEXT;

