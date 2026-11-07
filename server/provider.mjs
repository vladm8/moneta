import { createPrivateKey, sign } from "node:crypto";

export class BankingError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function createJWT(
  applicationId,
  privateKey,
  now = Math.floor(Date.now() / 1000),
) {
  const key = createPrivateKey(privateKey);
  if (
    key.asymmetricKeyType !== "rsa" ||
    key.asymmetricKeyDetails.modulusLength < 2048
  )
    throw new BankingError("INVALID_KEY", 503);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ typ: "JWT", alg: "RS256", kid: applicationId })}.${encode({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 300 })}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), key).toString("base64url")}`;
}

// Provider boundary: discovery, consent, session inspection/revocation and AIS only.
export class EnableBanking {
  constructor(config, fetcher = fetch) {
    this.config = config;
    this.fetcher = fetcher;
  }
  async request(path, method = "GET", body) {
    let response;
    try {
      response = await this.fetcher(`https://api.enablebanking.com${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(25000),
        headers: {
          Authorization: `Bearer ${createJWT(this.config.applicationId, this.config.privateKey)}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      if (e instanceof BankingError) throw e;
      throw new BankingError("PROVIDER_UNAVAILABLE", 502);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const expired =
        /SESSION_(EXPIRED|INVALID|CLOSED)|INVALID_SESSION|SESSION_NOT_FOUND/.test(
          payload.error || "",
        );
      throw new BankingError(
        expired
          ? "CONSENT_EXPIRED"
          : response.status === 429
            ? "RATE_LIMIT"
            : response.status === 401
              ? "PROVIDER_AUTH"
              : response.status === 403
                ? "ACCESS_DENIED"
                : "PROVIDER_ERROR",
        response.status === 429 ? 429 : 502,
      );
    }
    if (response.status === 204) return {};
    return response.json();
  }
  async institutions(country) {
    return (await this.request(`/aspsps?country=${country}`)).aspsps;
  }
  async verifyEnvironment() {
    const application = await this.request("/application");
    if (application.environment !== this.config.environment)
      throw new BankingError("ENVIRONMENT_MISMATCH", 503);
    if (!application.active || !application.services?.includes("AIS"))
      throw new BankingError("APPLICATION_INACTIVE", 503);
    if (!application.redirect_urls?.includes(this.config.callback))
      throw new BankingError("INVALID_REDIRECT", 503);
  }
  authorize(body) {
    return this.request("/auth", "POST", body);
  }
  session(code) {
    return this.request("/sessions", "POST", { code });
  }
  inspect(id) {
    return this.request(`/sessions/${encodeURIComponent(id)}`);
  }
  revoke(id) {
    return this.request(`/sessions/${encodeURIComponent(id)}`, "DELETE");
  }
  balances(uid) {
    return this.request(`/accounts/${encodeURIComponent(uid)}/balances`);
  }
  async transactions(uid, from, to) {
    const transactions = [],
      seen = new Set();
    let continuation;
    do {
      const query = new URLSearchParams({ date_from: from, date_to: to });
      if (continuation) query.set("continuation_key", continuation);
      const page = await this.request(
        `/accounts/${encodeURIComponent(uid)}/transactions?${query}`,
      );
      if (!Array.isArray(page.transactions))
        throw new BankingError("INVALID_RESPONSE", 502);
      transactions.push(...page.transactions);
      continuation = page.continuation_key;
      if (continuation && (seen.has(continuation) || seen.size >= 199))
        throw new BankingError("PAGINATION_LIMIT", 502);
      if (transactions.length > 50000)
        throw new BankingError("PAGINATION_LIMIT", 502);
      if (continuation) seen.add(continuation);
    } while (continuation);
    return transactions;
  }
}
