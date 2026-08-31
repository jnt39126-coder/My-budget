# Plaid integration checkpoint

Saved: August 30, 2026

## Current live state

- Frontend: `https://jnt39126-coder.github.io/My-budget/`
- Sandbox Worker: `https://my-budget-plaid.james-my-budget.workers.dev`
- The sandbox Worker is deployed and remains connected only to Plaid Sandbox.
- Sandbox D1 database: `my-budget-plaid` (`715d7e7d-e69f-4ebf-8adf-7a0288059606`).
- Production D1 database: `my-budget-plaid-production` (`e5605a96-fd2d-44d2-b4f4-8f7021e9a6c3`).
- Both databases include cloud app-state storage and Plaid item sync-health fields.
- Production is deliberately configured as a separate Worker named `my-budget-plaid-production`; it has not been deployed or connected to a real account.
- The Plaid Production secret has not been entered for the separate production Worker.

## Completed and verified

- Sandbox bank, transaction, brokerage, retirement, holding, OAuth, disconnect, and scheduled-refresh flows work.
- The Worker stores access tokens encrypted, keeps Plaid secrets server-side, requires the personal app password, and restricts browser access to the GitHub Pages origin.
- The app now has D1-backed budget-plan backup with a local cache, revision-conflict protection, and visible backup status.
- Institution health is tracked and the app provides a reconnect flow for connections needing attention.
- Transaction loading follows all backend pages and sync pagination is hardened against changes during pagination.
- The new backend passed syntax, local D1/API, browser, mobile-layout, and live unauthenticated security/CORS checks.
- Live sandbox database migrations `0004_app_state.sql` and `0005_item_health.sql` succeeded.
- Live production database migrations `0004_app_state.sql` and `0005_item_health.sql` succeeded.
- Sandbox Worker version `49fdb488-fbac-4c89-b9e0-25262e5e02ea` is deployed.

## Production cutover requirements

The production Worker is intentionally separate so deploying it cannot overwrite or reconfigure the working sandbox Worker. Before it can be deployed, add these four encrypted secrets specifically to `my-budget-plaid-production` using `--config wrangler.production.jsonc`:

1. `PLAID_CLIENT_ID` — the same Plaid Client ID.
2. `PLAID_SECRET` — the Plaid Production Secret, not the Sandbox Secret.
3. `APP_PASSWORD` — the personal password used to unlock the app.
4. `TOKEN_ENCRYPTION_KEY` — a new strong random value for production token encryption.

Never place any of these values in chat, source files, GitHub, screenshots, or shell history.

## Safe cutover order

1. Publish and verify the new frontend against Sandbox.
2. Add all four secrets to the separate production Worker.
3. Deploy with `npm run deploy:production` from `backend/`.
4. Verify the deployment reports Plaid `production`, database `my-budget-plaid-production`, and URL `my-budget-plaid-production.james-my-budget.workers.dev`.
5. Test the production Worker without changing the frontend default.
6. Change the frontend API default to the production Worker only after verification.
7. Connect one real institution first and verify accounts, transactions, sync health, and budget calculations.

## Security boundaries

- Do not connect a real institution until the Worker is verified as Production and bound to the separate Production database.
- Do not casually disconnect a Production Trial Item; deleting it may not restore the limited Trial allowance.
- Do not rotate secrets unless necessary. Changing `TOKEN_ENCRYPTION_KEY` makes existing stored access tokens unreadable and requires institutions to be linked again.
