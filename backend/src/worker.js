const PLAID_HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (!originAllowed(origin, env.ALLOWED_ORIGIN)) {
      return json({ error: "Origin not allowed" }, 403, headers);
    }

    if (!(await authorized(request, env.APP_PASSWORD))) {
      return json({ error: "Unauthorized" }, 401, headers);
    }

    try {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/api/link-token") {
        const requestBody = await request.json().catch(() => ({}));
        const products = requestBody.kind === "investments" ? ["investments"] : ["transactions"];
        const linkOptions = {
          client_name: "My Budget",
          language: "en",
          country_codes: ["US"],
          products,
          redirect_uri: env.PLAID_REDIRECT_URI,
          user: { client_user_id: "personal-budget-owner" },
        };
        if (products.includes("transactions")) linkOptions.transactions = { days_requested: 180 };
        const data = await plaid(env, "/link/token/create", linkOptions);
        return json({ link_token: data.link_token }, 200, headers);
      }

      if (request.method === "POST" && url.pathname === "/api/exchange") {
        const { public_token, institution_name = "Linked institution" } = await request.json();
        if (!public_token) return json({ error: "Missing public_token" }, 400, headers);
        const exchanged = await plaid(env, "/item/public_token/exchange", { public_token });
        const protectedToken = await seal(exchanged.access_token, env.TOKEN_ENCRYPTION_KEY);
        await env.DB.prepare(
          `INSERT INTO plaid_items (item_id, access_token, institution_name)
           VALUES (?, ?, ?)
           ON CONFLICT(item_id) DO UPDATE SET access_token=excluded.access_token,
           institution_name=excluded.institution_name, updated_at=CURRENT_TIMESTAMP`
        ).bind(exchanged.item_id, protectedToken, institution_name).run();
        const accounts = await refreshAccounts(env, exchanged.item_id, exchanged.access_token);
        if (accounts.some(account => account.type === "investment")) {
          await refreshInvestments(env, exchanged.access_token);
        }
        return json({ ok: true, item_id: exchanged.item_id }, 200, headers);
      }

      if (request.method === "POST" && url.pathname === "/api/sync") {
        const failures = await syncAllItems(env);
        if (failures.length) throw new Error(`${failures.length} Plaid connection(s) could not refresh`);
        return json({ ok: true }, 200, headers);
      }

      if (request.method === "POST" && url.pathname === "/api/disconnect") {
        const { item_id } = await request.json().catch(() => ({}));
        if (!item_id) return json({ error: "Missing item_id" }, 400, headers);
        const item = await env.DB.prepare(
          "SELECT access_token FROM plaid_items WHERE item_id=?"
        ).bind(item_id).first();
        if (!item) return json({ error: "Connection not found" }, 404, headers);
        const accessToken = await unseal(item.access_token, env.TOKEN_ENCRYPTION_KEY);
        await plaid(env, "/item/remove", { access_token: accessToken });
        await env.DB.prepare("DELETE FROM plaid_items WHERE item_id=?").bind(item_id).run();
        await env.DB.prepare(
          "DELETE FROM plaid_securities WHERE NOT EXISTS (SELECT 1 FROM plaid_holdings h WHERE h.security_id=plaid_securities.security_id)"
        ).run();
        return json({ ok: true }, 200, headers);
      }

      if (request.method === "GET" && url.pathname === "/api/accounts") {
        const result = await env.DB.prepare(
          `SELECT a.account_id, a.item_id, a.name, a.official_name, a.type, a.subtype,
                  a.current_balance, a.available_balance, a.credit_limit,
                  a.iso_currency_code,
                  i.institution_name
           FROM plaid_accounts a JOIN plaid_items i ON i.item_id=a.item_id
           ORDER BY i.institution_name, a.name`
        ).all();
        return json({ accounts: result.results }, 200, headers);
      }

      if (request.method === "GET" && url.pathname === "/api/transactions") {
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500);
        const result = await env.DB.prepare(
          `SELECT transaction_id, account_id, name, merchant_name, amount, date,
                  category, category_detail, pending
           FROM plaid_transactions ORDER BY date DESC LIMIT ?`
        ).bind(limit).all();
        return json({ transactions: result.results }, 200, headers);
      }

      if (request.method === "GET" && url.pathname === "/api/investments") {
        const accounts = await env.DB.prepare(
          `SELECT a.account_id, a.item_id, a.name, a.official_name, a.subtype,
                  a.current_balance, i.institution_name
           FROM plaid_accounts a JOIN plaid_items i ON i.item_id=a.item_id
           WHERE a.type='investment' ORDER BY institution_name, name`
        ).all();
        const holdings = await env.DB.prepare(
          `SELECT h.account_id, a.name AS account_name, i.institution_name,
                  s.name, s.ticker_symbol, s.type, s.close_price, s.close_price_as_of,
                  h.quantity, h.cost_basis, h.current_value
           FROM plaid_holdings h
           JOIN plaid_accounts a ON a.account_id=h.account_id
           JOIN plaid_items i ON i.item_id=a.item_id
           JOIN plaid_securities s ON s.security_id=h.security_id
           ORDER BY h.current_value DESC`
        ).all();
        return json({ accounts: accounts.results, holdings: holdings.results }, 200, headers);
      }

      return json({ error: "Not found" }, 404, headers);
    } catch (error) {
      console.error(error);
      return json({ error: error.message || "Backend error" }, 500, headers);
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(syncAllItems(env).then(failures => {
      if (failures.length) console.error("Scheduled Plaid refresh failures", failures);
    }));
  },
};

async function plaid(env, path, body) {
  const host = PLAID_HOSTS[env.PLAID_ENV];
  if (!host) throw new Error("Invalid PLAID_ENV");
  const response = await fetch(host + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PLAID-CLIENT-ID": env.PLAID_CLIENT_ID,
      "PLAID-SECRET": env.PLAID_SECRET,
      "Plaid-Version": "2020-09-14",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_message || data.error_code || "Plaid request failed");
  return data;
}

async function refreshAccounts(env, itemId, accessToken) {
  const data = await plaid(env, "/accounts/get", { access_token: accessToken });
  const statements = data.accounts.map(account => env.DB.prepare(
    `INSERT INTO plaid_accounts
      (account_id,item_id,name,official_name,type,subtype,current_balance,available_balance,credit_limit,iso_currency_code)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(account_id) DO UPDATE SET name=excluded.name, official_name=excluded.official_name,
       type=excluded.type, subtype=excluded.subtype, current_balance=excluded.current_balance,
       available_balance=excluded.available_balance, credit_limit=excluded.credit_limit,
       iso_currency_code=excluded.iso_currency_code,
       updated_at=CURRENT_TIMESTAMP`
  ).bind(account.account_id, itemId, account.name, account.official_name, account.type,
    account.subtype, account.balances.current, account.balances.available, account.balances.limit,
    account.balances.iso_currency_code));
  if (statements.length) await env.DB.batch(statements);
  return data.accounts;
}

async function refreshInvestments(env, accessToken) {
  const data = await plaid(env, "/investments/holdings/get", { access_token: accessToken });
  const securities = data.securities.map(security => env.DB.prepare(
    `INSERT INTO plaid_securities
      (security_id,name,ticker_symbol,type,close_price,close_price_as_of,iso_currency_code)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(security_id) DO UPDATE SET name=excluded.name, ticker_symbol=excluded.ticker_symbol,
       type=excluded.type, close_price=excluded.close_price, close_price_as_of=excluded.close_price_as_of,
       iso_currency_code=excluded.iso_currency_code, updated_at=CURRENT_TIMESTAMP`
  ).bind(security.security_id, security.name, security.ticker_symbol, security.type,
    security.close_price, security.close_price_as_of, security.iso_currency_code));
  if (securities.length) await env.DB.batch(securities);
  const holdings = data.holdings.map(holding => env.DB.prepare(
    `INSERT INTO plaid_holdings
      (account_id,security_id,quantity,cost_basis,current_value,institution_value,institution_price)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(account_id,security_id) DO UPDATE SET quantity=excluded.quantity,
       cost_basis=excluded.cost_basis, current_value=excluded.current_value,
       institution_value=excluded.institution_value, institution_price=excluded.institution_price,
       updated_at=CURRENT_TIMESTAMP`
  ).bind(holding.account_id, holding.security_id, holding.quantity, holding.cost_basis,
    holding.institution_value, holding.institution_value, holding.institution_price));
  if (holdings.length) await env.DB.batch(holdings);
}

async function syncItem(env, item) {
  const accounts = await refreshAccounts(env, item.item_id, item.access_token);
  const hasInvestments = accounts.some(account => account.type === "investment");
  if (hasInvestments) await refreshInvestments(env, item.access_token);
  if (accounts.every(account => account.type === "investment")) return;
  let cursor = item.cursor || null;
  let more = true;
  while (more) {
    const data = await plaid(env, "/transactions/sync", {
      access_token: item.access_token,
      cursor,
      count: 100,
    });
    const upserts = [...data.added, ...data.modified].map(tx => env.DB.prepare(
      `INSERT INTO plaid_transactions
        (transaction_id,item_id,account_id,name,merchant_name,amount,date,category,category_detail,pending)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(transaction_id) DO UPDATE SET name=excluded.name, merchant_name=excluded.merchant_name,
         amount=excluded.amount, date=excluded.date, category=excluded.category,
         category_detail=excluded.category_detail,
         pending=excluded.pending, updated_at=CURRENT_TIMESTAMP`
    ).bind(tx.transaction_id, item.item_id, tx.account_id, tx.name, tx.merchant_name,
      tx.amount, tx.date, tx.personal_finance_category?.primary || "Other",
      tx.personal_finance_category?.detailed || null, tx.pending ? 1 : 0));
    const removals = data.removed.map(tx => env.DB.prepare(
      "DELETE FROM plaid_transactions WHERE transaction_id=?"
    ).bind(tx.transaction_id));
    if (upserts.length || removals.length) await env.DB.batch([...upserts, ...removals]);
    cursor = data.next_cursor;
    more = data.has_more;
  }
  await env.DB.prepare("UPDATE plaid_items SET cursor=?, updated_at=CURRENT_TIMESTAMP WHERE item_id=?")
    .bind(cursor, item.item_id).run();
}

async function syncAllItems(env) {
  const items = await env.DB.prepare("SELECT item_id, access_token, cursor FROM plaid_items").all();
  const failures = [];
  for (const item of items.results) {
    try {
      item.access_token = await unseal(item.access_token, env.TOKEN_ENCRYPTION_KEY);
      await syncItem(env, item);
    } catch (error) {
      console.error("Plaid refresh failed", item.item_id, error);
      failures.push({ item_id: item.item_id, error: error.message || "Refresh failed" });
    }
  }
  return failures;
}

function originAllowed(origin, allowed) {
  if (!origin) return false;
  if (origin === allowed) return true;
  return origin === "http://localhost:8000" || origin === "http://127.0.0.1:8000";
}

function corsHeaders(origin, allowed) {
  const ok = originAllowed(origin, allowed);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

async function authorized(request, expected) {
  if (!expected) return false;
  const supplied = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(supplied)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const av = new Uint8Array(a), bv = new Uint8Array(b);
  let diff = av.length ^ bv.length;
  for (let i = 0; i < Math.min(av.length, bv.length); i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

async function encryptionKey(secret, usage) {
  if (!secret) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, usage);
}

async function seal(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(secret, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(value)
  ));
  const packed = new Uint8Array(iv.length + encrypted.length);
  packed.set(iv); packed.set(encrypted, iv.length);
  return btoa(String.fromCharCode(...packed));
}

async function unseal(value, secret) {
  const packed = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const key = await encryptionKey(secret, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: packed.slice(0, 12) }, key, packed.slice(12)
  );
  return new TextDecoder().decode(decrypted);
}
