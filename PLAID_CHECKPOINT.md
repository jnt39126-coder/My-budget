# Plaid integration checkpoint

Saved: August 30, 2026

## Current live state

- Frontend: `https://jnt39126-coder.github.io/My-budget/`
- Sandbox Worker: `https://my-budget-plaid.james-my-budget.workers.dev`
- The sandbox Worker is deployed and remains connected only to Plaid Sandbox.
- Sandbox D1 database: `my-budget-plaid` (`715d7e7d-e69f-4ebf-8adf-7a0288059606`).
- Production D1 database: `my-budget-plaid-production` (`e5605a96-fd2d-44d2-b4f4-8f7021e9a6c3`).
- Both databases include cloud app-state storage and Plaid item sync-health fields.
- Production is deliberately configured as a separate Worker named `my-budget-plaid-production` at `https://my-budget-plaid-production.james-my-budget.workers.dev`.
- Production Worker version `61d46703-f9fd-4d22-a260-feae19f306b9` is deployed but is not connected to the frontend or any real account.
- A new production `TOKEN_ENCRYPTION_KEY` was generated and stored directly in Cloudflare without exposing it.
- The production Worker still needs `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `APP_PASSWORD` before it is usable.

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
- Frontend release commit `1d28c45` is published on GitHub Pages with service-worker cache `my-budget-v20`.

## Exact stopping point

Work paused immediately after opening the secure `PLAID_CLIENT_ID` secret prompt. The prompt was canceled cleanly before anything was entered. Nothing is waiting in the terminal.

The current public app still points to the working Sandbox Worker. The separate production Worker exists, uses the Production D1 database and Plaid Production environment, and has its encryption key, but it cannot make Plaid requests until its remaining three secrets are added.

## First action next time

From `backend/`, run:

```text
npx wrangler secret put PLAID_CLIENT_ID --config wrangler.production.jsonc
```

At `Enter a secret value`, paste the Plaid Client ID and press Return. Do not paste it into chat. Then add `PLAID_SECRET` using the Plaid Production Secret and `APP_PASSWORD` using the personal app password. Verify all four secret names before testing the production Worker. Do not switch the frontend until the production test passes.

## Production cutover requirements

The production Worker is intentionally separate so it cannot overwrite or reconfigure the working sandbox Worker. Before it can be used, it needs these four encrypted secrets specifically on `my-budget-plaid-production` using `--config wrangler.production.jsonc`:

1. `PLAID_CLIENT_ID` — the same Plaid Client ID.
2. `PLAID_SECRET` — the Plaid Production Secret, not the Sandbox Secret.
3. `APP_PASSWORD` — the personal password used to unlock the app.
4. `TOKEN_ENCRYPTION_KEY` — already generated and stored on August 30, 2026.

Never place any of these values in chat, source files, GitHub, screenshots, or shell history.

## Safe cutover order

1. Publish and verify the new frontend against Sandbox.
2. Add the three remaining secrets to the separate production Worker.
3. Redeploy with `npm run deploy:production` from `backend/` if the code or configuration changes.
4. Verify the deployment reports Plaid `production`, database `my-budget-plaid-production`, and URL `my-budget-plaid-production.james-my-budget.workers.dev`.
5. Test the production Worker without changing the frontend default.
6. Change the frontend API default to the production Worker only after verification.
7. Connect one real institution first and verify accounts, transactions, sync health, and budget calculations.

## Security boundaries

- Do not connect a real institution until the Worker is verified as Production and bound to the separate Production database.
- Do not casually disconnect a Production Trial Item; deleting it may not restore the limited Trial allowance.
- Do not rotate secrets unless necessary. Changing `TOKEN_ENCRYPTION_KEY` makes existing stored access tokens unreadable and requires institutions to be linked again.
