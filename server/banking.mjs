import { token, hash } from "./store.mjs";
import { BankingError } from "./provider.mjs";
import {
  normalizeTransactions,
  mergeTransactions,
  selectBalance,
} from "./normalize.mjs";

export class BankingService {
  constructor(store, provider, config) {
    this.store = store;
    this.provider = provider;
    this.config = config;
    this.locks = new Set();
  }
  async exclusive(owner, work) {
    if (this.locks.has(owner)) throw new BankingError("BUSY", 409);
    this.locks.add(owner);
    try {
      return await work();
    } finally {
      this.locks.delete(owner);
    }
  }
  read(owner) {
    return this.store.get(owner, this.config.environment);
  }
  save(owner, state) {
    this.store.put(owner, this.config.environment, state);
  }
  view(owner) {
    const state = this.read(owner);
    return {
      ownerId: owner,
      environment: this.config.environment,
      connections: state.connections.map(
        ({ id, bank, country, expires, status, lastSync, error }) => ({
          id,
          bank,
          country,
          expires,
          status: Date.parse(expires) <= Date.now() ? "EXPIRED" : status,
          lastSync,
          error,
        }),
      ),
      accounts: state.accounts.map(
        ({
          id,
          connectionId,
          bank,
          name,
          currency,
          balance,
          balanceFetchedAt,
          lastSync,
          error,
          details,
        }) => ({
          id,
          connectionId,
          bank,
          name,
          currency,
          balance,
          balanceFetchedAt,
          lastSync,
          error,
          mask: details.account_id?.iban
            ? `•••• ${details.account_id.iban.slice(-4)}`
            : "",
        }),
      ),
      transactions: state.transactions,
    };
  }
  async start(owner, login, input) {
    if (!["PL", "LT"].includes(input.country) || typeof input.name !== "string")
      throw new BankingError("INVALID_INPUT");
    if (this.config.environment === "PRODUCTION" && input.liveConsent !== true)
      throw new BankingError("LIVE_CONSENT_REQUIRED");
    await this.provider.verifyEnvironment();
    const institutions = await this.provider.institutions(input.country);
    const bank = institutions.find(
      (b) =>
        b.name === input.name &&
        b.country === input.country &&
        (!b.psu_types?.length || b.psu_types.includes("personal")),
    );
    if (!bank) throw new BankingError("UNSUPPORTED_BANK");
    if (
      input.reconnect &&
      !this.read(owner).connections.some(
        (c) =>
          c.id === input.reconnect &&
          c.bank === bank.name &&
          c.country === bank.country,
      )
    )
      throw new BankingError("NOT_FOUND", 404);
    const state = token();
    const seconds = Math.min(bank.maximum_consent_validity, 180 * 86400);
    if (!(seconds > 0)) throw new BankingError("UNSUPPORTED_BANK");
    const response = await this.provider.authorize({
      access: {
        valid_until: new Date(Date.now() + seconds * 1000 - 1000).toISOString(),
        balances: true,
        transactions: true,
      },
      aspsp: { name: bank.name, country: bank.country },
      state,
      redirect_url: this.config.callback,
      psu_type: "personal",
      psu_id: owner,
      language: "pl",
    });
    if (new URL(response.url).protocol !== "https:")
      throw new BankingError("INVALID_RESPONSE", 502);
    this.store.attempt(state, owner, login, {
      bank: bank.name,
      country: bank.country,
      reconnect: input.reconnect || null,
      environment: this.config.environment,
    });
    return { url: response.url };
  }
  async callback(owner, login, query) {
    const attempt = this.store.consume(query.get("state") || "", owner, login);
    if (!attempt || attempt.environment !== this.config.environment)
      throw new BankingError("INVALID_STATE");
    if (query.has("error")) throw new BankingError("AUTH_CANCELLED");
    const code = query.get("code");
    if (!code || code.length > 4096) throw new BankingError("INVALID_STATE");
    return this.exclusive(owner, async () => {
      const session = await this.provider.session(code);
      if (
        !session.session_id ||
        !Array.isArray(session.accounts) ||
        !session.access?.valid_until ||
        session.aspsp?.name !== attempt.bank ||
        session.aspsp?.country !== attempt.country
      )
        throw new BankingError("INVALID_RESPONSE", 502);
      const state = this.read(owner),
        id = token();
      const connection = {
        id,
        sessionId: session.session_id,
        bank: attempt.bank,
        country: attempt.country,
        expires: session.access.valid_until,
        status: "AUTHORIZED",
      };
      state.connections.push(connection);
      for (const details of session.accounts) {
        if (!details.identification_hash) continue;
        const accountId = hash(
          `${this.config.environment}:${owner}:${details.identification_hash}:${details.currency}`,
        );
        const old = state.accounts.find((a) => a.id === accountId);
        const account = {
          ...old,
          id: accountId,
          connectionId: id,
          bank: attempt.bank,
          name:
            details.details || details.product || details.name || attempt.bank,
          currency: details.currency,
          details,
        };
        state.accounts = state.accounts.filter((a) => a.id !== accountId);
        state.accounts.push(account);
      }
      // Persist the new consent before attempting cleanup or the first synchronization.
      this.save(owner, state);
      if (attempt.reconnect) {
        const old = state.connections.find((c) => c.id === attempt.reconnect);
        if (old) {
          try {
            await this.provider.revoke(old.sessionId);
            state.connections = state.connections.filter((c) => c !== old);
            state.accounts = state.accounts.filter(
              (a) => a.connectionId !== old.id,
            );
          } catch {
            old.status = "REPLACED";
            old.error = "REVOCATION_REQUIRED";
          }
          this.save(owner, state);
        }
      }
      await this.syncUnlocked(owner, id);
      return id;
    });
  }
  sync(owner, id) {
    return this.exclusive(owner, () => this.syncUnlocked(owner, id));
  }
  async syncUnlocked(owner, id) {
    const state = this.read(owner),
      connection = state.connections.find((c) => c.id === id);
    if (!connection) throw new BankingError("NOT_FOUND", 404);
    if (
      connection.lastAttempt &&
      Date.now() - Date.parse(connection.lastAttempt) < 60000
    )
      throw new BankingError("RATE_LIMIT", 429);
    connection.lastAttempt = new Date().toISOString();
    this.save(owner, state);
    try {
      const status = await this.provider.inspect(connection.sessionId);
      connection.status = status.status;
      if (status.access?.valid_until)
        connection.expires = status.access.valid_until;
      if (
        status.status !== "AUTHORIZED" ||
        Date.parse(connection.expires) <= Date.now()
      )
        throw new BankingError("CONSENT_EXPIRED", 409);
      let failed = false;
      for (const account of state.accounts.filter(
        (a) => a.connectionId === id,
      )) {
        if (!account.details.uid) {
          account.error = "UNSUPPORTED_ACCOUNT";
          failed = true;
          continue;
        }
        const uid = account.details.uid;
        account.error = null;
        try {
          const result = await this.provider.balances(uid);
          const balance = selectBalance(
            result.balances || [],
            account.currency,
          );
          if (!balance) throw new BankingError("BALANCE_UNAVAILABLE");
          account.balance = balance;
          account.balanceFetchedAt = new Date().toISOString();
        } catch (e) {
          account.error = e.code || "BALANCE_UNAVAILABLE";
          failed = true;
        }
        try {
          const end = new Date();
          end.setUTCHours(0, 0, 0, 0);
          // First fetch is 90 days; subsequent fetches overlap 7 days. Chunk to 30 days.
          const start = new Date(
            account.lastSync
              ? Date.parse(account.lastSync) - 7 * 86400000
              : Date.now() - 90 * 86400000,
          );
          start.setUTCHours(0, 0, 0, 0);
          const from = start.toISOString().slice(0, 10),
            to = end.toISOString().slice(0, 10),
            rows = [];
          while (start <= end) {
            const chunkEnd = new Date(
              Math.min(start.getTime() + 29 * 86400000, end.getTime()),
            );
            rows.push(
              ...(await this.provider.transactions(
                uid,
                start.toISOString().slice(0, 10),
                chunkEnd.toISOString().slice(0, 10),
              )),
            );
            start.setUTCDate(start.getUTCDate() + 30);
          }
          const normalized = normalizeTransactions(
            rows,
            account,
            state.accounts,
          );
          state.transactions = mergeTransactions(
            state.transactions,
            normalized,
            account.id,
            from,
            to,
          );
          account.lastSync = new Date().toISOString();
        } catch (e) {
          account.error = e.code || "PROVIDER_UNAVAILABLE";
          failed = true;
        }
        this.save(owner, state);
      }
      connection.error = failed ? "PARTIAL_SYNC" : null;
      if (!failed) connection.lastSync = new Date().toISOString();
    } catch (e) {
      connection.error = e.code || "PROVIDER_UNAVAILABLE";
      if (e.code === "CONSENT_EXPIRED") connection.status = "EXPIRED";
    }
    this.save(owner, state);
    return this.view(owner);
  }
  disconnect(owner, id, forget = false) {
    return this.exclusive(owner, async () => {
      const state = this.read(owner),
        connection = state.connections.find((c) => c.id === id);
      if (!connection) throw new BankingError("NOT_FOUND", 404);
      try {
        await this.provider.revoke(connection.sessionId);
      } catch (e) {
        if (!forget && e.code !== "CONSENT_EXPIRED")
          throw new BankingError("REVOCATION_REQUIRED", 502);
      }
      const accountIds = new Set(
        state.accounts.filter((a) => a.connectionId === id).map((a) => a.id),
      );
      state.accounts = state.accounts.filter((a) => !accountIds.has(a.id));
      state.transactions = state.transactions.filter(
        (t) => !accountIds.has(t.accountId),
      );
      state.connections = state.connections.filter((c) => c.id !== id);
      this.save(owner, state);
      return this.view(owner);
    });
  }
}
