# Plaid integration checkpoint

Saved: August 28, 2026 (end-of-day checkpoint)

## Current live state

- Frontend: `https://jnt39126-coder.github.io/My-budget/`
- Cloudflare Worker: `https://my-budget-plaid.james-my-budget.workers.dev`
- The live Worker is still configured for Plaid **Sandbox**. Production has not been activated.
- Sandbox D1 database: `my-budget-plaid` (`715d7e7d-e69f-4ebf-8adf-7a0288059606`).
- Separate empty Production D1 database: `my-budget-plaid-production` (`e5605a96-fd2d-44d2-b4f4-8f7021e9a6c3`). Its schema is initialized, but the Worker is not using it yet.
- Production configuration is prepared in `backend/wrangler.production.jsonc`.
- The Plaid **Production secret has not been entered** and the existing Worker secret remains the Sandbox secret.
- No real financial account has been connected.

## Completed and verified

- Sandbox bank linking, token exchange, account loading, transaction synchronization, and dashboard totals work.
- Sandbox brokerage/retirement linking works; fake IRA and 401(k) accounts and their holdings load correctly.
- Mobile/web OAuth support is implemented and verified with a fake Chase Sandbox connection.
- Plaid Dashboard has this Allowed Redirect URI registered exactly:
  `https://jnt39126-coder.github.io/My-budget/oauth.html`
- The OAuth return page is live at that address.
- Plaid data refreshes automatically every six hours through a Cloudflare scheduled trigger; manual Refresh still works.
- The app has a Disconnect institution control. It revokes the Plaid Item and removes its stored data after confirmation.
- Sandbox and Production data are isolated so fake data will not mix with real data.
- Access tokens are encrypted in D1. The Worker requires the personal `APP_PASSWORD`, keeps Plaid secrets server-side, and restricts browser access to the GitHub Pages origin.

## Latest deployed commits

- `f80c9a1` Add Plaid OAuth return flow
- `4c95eee` Add Plaid institution disconnect control
- `d33c957` Refresh Plaid data automatically
- `a08d9db` Prepare isolated Plaid production database

## Exact stopping point

The separate Production database and configuration are ready. The next requested action was to copy the Plaid **Production** secret and enter it securely with Wrangler, but the user paused before doing that. Nothing should be switched or redeployed until the user is ready to complete the secret entry and Production deployment together.

## First action next time

1. In Plaid Dashboard, open **Developers → Keys** and copy the **Production Secret** (not Sandbox).
2. In the Codex terminal, run:

   ```text
   cd /Users/jamesdevita/Downloads/My-budget-main/backend
   npx wrangler secret put PLAID_SECRET --config wrangler.production.jsonc
   ```

3. At `Enter a secret value`, paste the Production secret and press Return. Do not paste it into chat.
4. Immediately deploy using the Production configuration so the Production secret, Production Plaid host, and empty Production database become active together:

   ```text
   npm run deploy -- --config wrangler.production.jsonc
   ```

5. Verify the Worker reports `PLAID_ENV ("production")` and database `my-budget-plaid-production`.
6. Open My Budget and confirm Linked accounts are empty before connecting the first real institution.
7. Connect only one real institution first, verify accounts/transactions, and remember that a Plaid Production Trial Item is not restored if disconnected.

## Security boundaries

- Never paste Plaid secrets, access tokens, the personal app password, or bank credentials into chat, GitHub, or source files.
- Do not rotate the Production secret unless there is evidence it was exposed.
- Do not connect a real institution until the Worker is verified as Production and bound to the separate Production database.
- Do not delete a Production Item casually; deleting/disconnecting it does not restore the Trial Item allowance.
