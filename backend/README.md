# My Budget Plaid backend

This Cloudflare Worker keeps Plaid credentials and access tokens out of the public
GitHub Pages frontend. It starts in Plaid Sandbox and stores encrypted access tokens
plus normalized account and transaction data in D1.

Required Worker secrets:

- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `APP_PASSWORD`
- `TOKEN_ENCRYPTION_KEY`

Do not commit any of their values. For local development, copy `.dev.vars.example`
to `.dev.vars` and enter Sandbox values only. The real `.dev.vars` file is ignored
by Git.

Deployment outline:

1. Create a Cloudflare account and D1 database named `my-budget-plaid`.
2. Replace the placeholder database ID in `wrangler.jsonc`.
3. Apply `schema.sql` to the remote database.
4. add the four secrets through Cloudflare's encrypted secret settings.
5. Deploy the Worker and enter its URL in My Budget when prompted.
6. Complete a Sandbox Link test before changing `PLAID_ENV` to `production`.

The production deployment intentionally uses a separate Worker and D1 database:

- Sandbox Worker: `my-budget-plaid`
- Production Worker: `my-budget-plaid-production`

Apply `schema.sql` to each database before deploying its Worker. The browser app
uses `/api/state` to keep its budget plan synchronized in D1 while retaining a
local cached copy and manual JSON export.
