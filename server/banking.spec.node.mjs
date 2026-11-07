import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJWT, EnableBanking, BankingError } from "./provider.mjs";
import { Store, passwordHash, verifyPassword, hash } from "./store.mjs";
import {
  normalizeTransactions,
  mergeTransactions,
  minor,
  selectBalance,
} from "./normalize.mjs";
import { BankingService } from "./banking.mjs";
import { createApp } from "./http.mjs";

const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const key = randomBytes(32).toString("base64");
const config = {
  applicationId: "test-id",
  privateKey: keys.privateKey,
  environment: "SANDBOX",
  callback: "http://localhost:5173/api/banking/callback",
  origin: "http://localhost:5173",
  secure: false,
};
const details = {
  uid: "provider-account",
  identification_hash: "stable-account",
  currency: "PLN",
  account_id: { iban: "PL1234567890" },
  name: "Synthetic account",
};
const account = { id: "account", details };
const row = {
  entry_reference: "stable-row",
  transaction_amount: { amount: "12.34", currency: "PLN" },
  credit_debit_indicator: "DBIT",
  status: "BOOK",
  booking_date: new Date().toISOString().slice(0, 10),
  remittance_information: ["Synthetic merchant"],
};
function fixture() {
  const store = new Store(":memory:", key),
    calls = [];
  const provider = {
    verifyEnvironment: async () => {},
    institutions: async (country) => [
      {
        name: "Test Bank",
        country,
        psu_types: ["personal"],
        maximum_consent_validity: 86400,
      },
    ],
    authorize: async (body) => {
      calls.push(body);
      return { url: "https://bank.example/authorize" };
    },
    session: async () => ({
      session_id: "secret-bank-session",
      accounts: [details],
      aspsp: { name: "Test Bank", country: "PL" },
      access: { valid_until: new Date(Date.now() + 86400000).toISOString() },
    }),
    inspect: async () => ({ status: "AUTHORIZED" }),
    revoke: async () => {},
    balances: async () => ({
      balances: [
        {
          balance_amount: { amount: "100.00", currency: "PLN" },
          balance_type: "CLBD",
        },
      ],
    }),
    transactions: async () => [row],
  };
  return {
    store,
    provider,
    calls,
    service: new BankingService(store, provider, config),
  };
}
test("JWT uses required claims and a verifiable RS256 signature", () => {
  const jwt = createJWT("app", keys.privateKey, 1234),
    [head, payload, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(head, "base64url")), {
    typ: "JWT",
    alg: "RS256",
    kid: "app",
  });
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), {
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat: 1234,
    exp: 1534,
  });
  assert.ok(
    verify(
      "RSA-SHA256",
      Buffer.from(`${head}.${payload}`),
      keys.publicKey,
      Buffer.from(signature, "base64url"),
    ),
  );
});
test("non-RSA and weak keys are rejected", () => {
  const ec = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
  });
  assert.throws(() => createJWT("app", ec.privateKey), /INVALID_KEY/);
});
test("password hashes verify only the correct password", () => {
  const encoded = passwordHash("test-only-long-password");
  assert.equal(verifyPassword("test-only-long-password", encoded), true);
  assert.equal(verifyPassword("incorrect", encoded), false);
});
test("encrypted persistence survives reopening and isolates owners/environment", () => {
  const dir = mkdtempSync(join(tmpdir(), "moneta-bank-test-")),
    path = join(dir, "test.sqlite");
  try {
    let store = new Store(path, key);
    store.put("alice", "SANDBOX", { session: "sensitive-session" });
    assert.ok(
      !store.db
        .prepare("SELECT payload FROM records")
        .get()
        .payload.includes("sensitive-session"),
    );
    store.close();
    store = new Store(path, key);
    assert.equal(store.get("alice", "SANDBOX").session, "sensitive-session");
    assert.equal(store.get("bob", "SANDBOX").session, undefined);
    assert.equal(store.get("alice", "PRODUCTION").session, undefined);
    assert.throws(() =>
      store.decrypt(
        store.db.prepare("SELECT payload FROM records").get().payload,
        "bob:SANDBOX",
      ),
    );
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("authorization attempts are bound to owner, login, expiry and consumed once", () => {
  const store = new Store(":memory:", key);
  store.attempt("state", "alice", "login", { value: 1 }, 1000);
  assert.equal(store.consume("state", "bob", "login", 1100), null);
  assert.equal(store.consume("state", "alice", "other", 1100), null);
  assert.deepEqual(store.consume("state", "alice", "login", 1100), {
    value: 1,
  });
  assert.equal(store.consume("state", "alice", "login", 1100), null);
  store.attempt("expired", "alice", "login", {}, 1000);
  assert.equal(store.consume("expired", "alice", "login", 601001), null);
  store.close();
});
test("complete consent flow stores accounts and balances without leaking credentials", async () => {
  const f = fixture();
  await f.service.start("alice", "login", { name: "Test Bank", country: "PL" });
  assert.equal(f.calls[0].redirect_url, config.callback);
  assert.equal(f.calls[0].access.transactions, true);
  const params = new URLSearchParams({
    state: f.calls[0].state,
    code: "one-use-code",
  });
  await f.service.callback("alice", "login", params);
  const view = f.service.view("alice");
  assert.equal(view.connections.length, 1);
  assert.equal(view.accounts[0].balance.amount, 10000);
  assert.equal(view.transactions.length, 1);
  const text = JSON.stringify(view);
  for (const secret of [
    "secret-bank-session",
    "provider-account",
    "PL1234567890",
    "one-use-code",
  ])
    assert.ok(!text.includes(secret));
  await assert.rejects(
    () => f.service.callback("alice", "login", params),
    /INVALID_STATE/,
  );
  assert.equal(f.service.view("bob").accounts.length, 0);
  f.store.close();
});
test("cancelled and cross-user callbacks cannot create connections", async () => {
  const f = fixture();
  await f.service.start("alice", "login", { name: "Test Bank", country: "PL" });
  const params = new URLSearchParams({
    state: f.calls[0].state,
    error: "access_denied",
  });
  await assert.rejects(
    () => f.service.callback("bob", "login", params),
    /INVALID_STATE/,
  );
  await assert.rejects(
    () => f.service.callback("alice", "login", params),
    /AUTH_CANCELLED/,
  );
  assert.equal(f.service.view("alice").connections.length, 0);
  f.store.close();
});
test("unsupported banks, wrong reconnect owner and unapproved production are rejected", async () => {
  const f = fixture();
  await assert.rejects(
    () => f.service.start("alice", "login", { name: "Missing", country: "PL" }),
    /UNSUPPORTED_BANK/,
  );
  await assert.rejects(
    () =>
      f.service.start("alice", "login", {
        name: "Test Bank",
        country: "PL",
        reconnect: "other",
      }),
    /NOT_FOUND/,
  );
  f.service.config = { ...config, environment: "PRODUCTION" };
  await assert.rejects(
    () =>
      f.service.start("alice", "login", { name: "Test Bank", country: "PL" }),
    /LIVE_CONSENT_REQUIRED/,
  );
  f.store.close();
});
test("API pagination preserves dates and follows continuation keys", async () => {
  const requests = [];
  const provider = new EnableBanking(config, async (url) => {
    requests.push(url);
    return new Response(
      JSON.stringify(
        requests.length === 1
          ? { transactions: [row], continuation_key: "next+key" }
          : { transactions: [{ ...row, entry_reference: "two" }] },
      ),
      { status: 200 },
    );
  });
  assert.equal(
    (await provider.transactions("uid", "2026-01-01", "2026-01-30")).length,
    2,
  );
  assert.ok(requests[1].includes("continuation_key=next%2Bkey"));
  assert.ok(requests[1].includes("date_from=2026-01-01"));
});
test("pagination cycles and rate limits fail safely", async () => {
  const cycle = new EnableBanking(
    config,
    async () =>
      new Response(
        JSON.stringify({ transactions: [], continuation_key: "same" }),
      ),
  );
  await assert.rejects(
    () => cycle.transactions("uid", "2026-01-01", "2026-01-02"),
    /PAGINATION_LIMIT/,
  );
  const limited = new EnableBanking(
    config,
    async () => new Response("{}", { status: 429 }),
  );
  await assert.rejects(() => limited.balances("uid"), /RATE_LIMIT/);
  const offline = new EnableBanking(config, async () => {
    throw new Error("network");
  });
  await assert.rejects(() => offline.balances("uid"), /PROVIDER_UNAVAILABLE/);
});
test("application environment, activity and registered redirect are checked", async () => {
  const provider = new EnableBanking(
    config,
    async () => new Response(JSON.stringify({ environment: "PRODUCTION" })),
  );
  await assert.rejects(
    () => provider.verifyEnvironment(),
    /ENVIRONMENT_MISMATCH/,
  );
  provider.fetcher = async () =>
    new Response(
      JSON.stringify({
        environment: "SANDBOX",
        active: true,
        services: ["AIS"],
        redirect_urls: [],
      }),
    );
  await assert.rejects(() => provider.verifyEnvironment(), /INVALID_REDIRECT/);
});
test("normalization uses immutable entry reference, integer amounts, safe dates and currencies", () => {
  const a = normalizeTransactions([row], account, [account])[0],
    b = normalizeTransactions(
      [{ ...row, transaction_id: "changed" }],
      account,
      [account],
    )[0];
  assert.equal(a.id, b.id);
  assert.equal(a.amount, 1234);
  assert.equal(a.type, "expense");
  assert.ok(a.valid);
  assert.equal(minor("0.01"), 1);
  assert.equal(minor("1.001"), null);
  assert.equal(minor("1000000000000"), null);
  assert.equal(
    normalizeTransactions([{ ...row, booking_date: "2026-02-31" }], account, [
      account,
    ])[0].valid,
    false,
  );
  assert.equal(
    normalizeTransactions(
      [{ ...row, transaction_amount: { amount: "1", currency: "JPY" } }],
      account,
      [account],
    )[0].valid,
    false,
  );
});
test("own-account transfers are internal, credits and refunds have distinct types", () => {
  const own = { ...row, creditor_account: { iban: "PL1234567890" } };
  assert.equal(
    normalizeTransactions([own], account, [account])[0].type,
    "internal",
  );
  assert.equal(
    normalizeTransactions(
      [{ ...row, credit_debit_indicator: "CRDT" }],
      account,
      [account],
    )[0].type,
    "income",
  );
  assert.equal(
    normalizeTransactions(
      [
        {
          ...row,
          credit_debit_indicator: "CRDT",
          remittance_information: ["Refund"],
        },
      ],
      account,
      [account],
    )[0].type,
    "refund",
  );
});
test("fallback preserves distinct identical transactions and repeated synchronization is idempotent", () => {
  const raw = { ...row, entry_reference: undefined };
  const incoming = normalizeTransactions([raw, raw], account, [account]);
  assert.notEqual(incoming[0].id, incoming[1].id);
  const once = mergeTransactions(
    [],
    incoming,
    "account",
    "2020-01-01",
    "2030-01-01",
  );
  assert.equal(
    mergeTransactions(once, incoming, "account", "2020-01-01", "2030-01-01")
      .length,
    2,
  );
});
test("pending never creates a second booked row and fallback can acquire a stable identifier", () => {
  const pending = normalizeTransactions(
    [{ ...row, status: "PDNG", entry_reference: undefined }],
    account,
    [account],
  );
  const booked = normalizeTransactions([row], account, [account]);
  assert.equal(
    mergeTransactions(pending, booked, "account", "2020-01-01", "2030-01-01")
      .length,
    1,
  );
  const fallback = normalizeTransactions(
    [{ ...row, entry_reference: undefined }],
    account,
    [account],
  );
  const merged = mergeTransactions(
    fallback,
    booked,
    "account",
    "2020-01-01",
    "2030-01-01",
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, fallback[0].id);
  assert.equal(
    mergeTransactions(merged, booked, "account", "2020-01-01", "2030-01-01")
      .length,
    1,
  );
});
test("balance selection does not add booked and available or mix currencies", () => {
  const balances = [
    { balance_type: "CLAV", balance_amount: { amount: "80", currency: "PLN" } },
    {
      balance_type: "CLBD",
      balance_amount: { amount: "100", currency: "PLN" },
    },
    {
      balance_type: "CLBD",
      balance_amount: { amount: "500", currency: "EUR" },
    },
  ];
  assert.equal(selectBalance(balances, "PLN").amount, 10000);
  assert.equal(selectBalance(balances, "EUR").amount, 50000);
  assert.equal(selectBalance(balances, "GBP"), null);
});
test("partial synchronization retains previous booked history and balance", async () => {
  const f = fixture();
  await f.service.start("alice", "login", { name: "Test Bank", country: "PL" });
  await f.service.callback(
    "alice",
    "login",
    new URLSearchParams({ state: f.calls[0].state, code: "code" }),
  );
  const state = f.service.read("alice"),
    id = state.connections[0].id;
  state.connections[0].lastAttempt = null;
  f.service.save("alice", state);
  f.provider.balances = async () => {
    throw new BankingError("PROVIDER_UNAVAILABLE");
  };
  f.provider.transactions = async () => {
    throw new BankingError("RATE_LIMIT");
  };
  const view = await f.service.sync("alice", id);
  assert.equal(view.connections[0].error, "PARTIAL_SYNC");
  assert.equal(view.accounts[0].balance.amount, 10000);
  assert.equal(view.transactions.length, 1);
  await assert.rejects(() => f.service.sync("bob", id), /NOT_FOUND/);
  await assert.rejects(() => f.service.disconnect("bob", id), /NOT_FOUND/);
  await f.service.disconnect("alice", id);
  assert.equal(f.service.view("alice").accounts.length, 0);
  assert.equal(f.service.view("alice").transactions.length, 0);
  f.store.close();
});
test("initial synchronization includes today and uses nonoverlapping 30-day chunks", async () => {
  const f = fixture(),
    ranges = [];
  f.provider.transactions = async (uid, from, to) => {
    ranges.push([from, to]);
    return [];
  };
  await f.service.start("alice", "login", { name: "Test Bank", country: "PL" });
  await f.service.callback(
    "alice",
    "login",
    new URLSearchParams({ state: f.calls[0].state, code: "code" }),
  );
  assert.equal(ranges.at(-1)[1], new Date().toISOString().slice(0, 10));
  for (let i = 0; i < ranges.length; i++) {
    assert.ok(
      (Date.parse(ranges[i][1]) - Date.parse(ranges[i][0])) / 86400000 <= 29,
    );
    if (i)
      assert.equal(
        Date.parse(ranges[i][0]) - Date.parse(ranges[i - 1][1]),
        86400000,
      );
  }
  f.store.close();
});
test("reconnection preserves account/transaction identity and expired sessions require new consent", async () => {
  const f = fixture();
  await f.service.start("alice", "login", { name: "Test Bank", country: "PL" });
  await f.service.callback(
    "alice",
    "login",
    new URLSearchParams({ state: f.calls[0].state, code: "code" }),
  );
  const before = f.service.view("alice");
  await f.service.start("alice", "login", {
    name: "Test Bank",
    country: "PL",
    reconnect: before.connections[0].id,
  });
  await f.service.callback(
    "alice",
    "login",
    new URLSearchParams({ state: f.calls[1].state, code: "new-code" }),
  );
  const after = f.service.view("alice");
  assert.equal(after.connections.length, 1);
  assert.equal(after.accounts[0].id, before.accounts[0].id);
  assert.equal(after.transactions[0].id, before.transactions[0].id);
  f.provider.inspect = async () => ({ status: "EXPIRED" });
  const stored = f.service.read("alice");
  stored.connections[0].lastAttempt = null;
  f.service.save("alice", stored);
  const expired = await f.service.sync("alice", after.connections[0].id);
  assert.equal(expired.connections[0].status, "EXPIRED");
  assert.equal(expired.transactions.length, 1);
  f.store.close();
});
test("failed revocation preserves session until explicit server data deletion", async () => {
  const f = fixture();
  await f.service.start("alice", "login", { name: "Test Bank", country: "PL" });
  await f.service.callback(
    "alice",
    "login",
    new URLSearchParams({ state: f.calls[0].state, code: "code" }),
  );
  const id = f.service.view("alice").connections[0].id;
  f.provider.revoke = async () => {
    throw new Error("offline");
  };
  await assert.rejects(
    () => f.service.disconnect("alice", id),
    /REVOCATION_REQUIRED/,
  );
  assert.equal(f.service.view("alice").connections.length, 1);
  await f.service.disconnect("alice", id, true);
  assert.equal(f.service.view("alice").connections.length, 0);
  f.store.close();
});
test("HTTP enforces authentication, CSRF, session ownership and logout", async () => {
  const f = fixture();
  f.store.db
    .prepare("INSERT INTO users VALUES(?,?,?)")
    .run("alice", "alice", passwordHash("test-password-long"));
  const server = createApp(config, f.store, f.service, f.provider);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/banking`;
  try {
    assert.equal((await fetch(`${base}/connections`)).status, 401);
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.origin },
      body: JSON.stringify({
        username: "alice",
        password: "test-password-long",
      }),
    };
    assert.equal(
      (
        await fetch(`${base}/login`, {
          ...options,
          headers: { ...options.headers, Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    const login = await fetch(`${base}/login`, options),
      body = await login.json(),
      cookie = login.headers.get("set-cookie").split(";")[0];
    assert.ok(login.headers.get("set-cookie").includes("HttpOnly"));
    assert.ok(login.headers.get("set-cookie").includes("SameSite=Lax"));
    assert.equal(
      (await fetch(`${base}/connections`, { headers: { Cookie: cookie } }))
        .status,
      200,
    );
    assert.equal(
      (
        await fetch(`${base}/logout`, {
          method: "POST",
          headers: { Cookie: cookie, Origin: config.origin },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/connections/other/sync`, {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: config.origin,
            "X-CSRF-Token": body.csrf,
          },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${base}/logout`, {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: config.origin,
            "X-CSRF-Token": body.csrf,
          },
        })
      ).status,
      200,
    );
    assert.equal(
      (await fetch(`${base}/connections`, { headers: { Cookie: cookie } }))
        .status,
      401,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    f.store.close();
  }
});
