import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { token, hash, verifyPassword, passwordHash } from "./store.mjs";
import { BankingError } from "./provider.mjs";

export function createApp(config, store, banking, provider) {
  const attempts = new Map(),
    dummyHash = passwordHash(token());
  const cookieName = config.secure ? "__Host-moneta-bank" : "moneta-bank";
  const cookie = (value, age) =>
    `${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${config.secure ? "; Secure" : ""}`;
  const sessionFor = (req) => {
    const value = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
    return store.db
      .prepare("SELECT * FROM sessions WHERE id=? AND expires>?")
      .get(hash(value), Date.now());
  };
  const json = (res, status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(body));
  };
  async function body(req) {
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw new BankingError("INVALID_INPUT", 415);
    let value = "";
    for await (const chunk of req) {
      value += chunk;
      if (value.length > 16384) throw new BankingError("INVALID_INPUT", 413);
    }
    try {
      const parsed = JSON.parse(value || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw 0;
      return parsed;
    } catch {
      throw new BankingError("INVALID_INPUT");
    }
  }
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    if (config.secure)
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    const url = new URL(req.url, config.origin),
      path = url.pathname;
    try {
      if (!path.startsWith("/api/")) {
        if (!["GET", "HEAD"].includes(req.method))
          throw new BankingError("NOT_FOUND", 404);
        const root = resolve("dist"),
          candidate = resolve(root, `.${decodeURIComponent(path)}`);
        if (!candidate.startsWith(root + sep) && candidate !== root)
          throw new BankingError("NOT_FOUND", 404);
        const file = extname(candidate)
          ? candidate
          : resolve(root, "index.html");
        const types = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".woff2": "font/woff2",
          ".mp4": "video/mp4",
          ".wasm": "application/wasm",
        };
        const data = await readFile(file).catch(() => {
          throw new BankingError("NOT_FOUND", 404);
        });
        res.writeHead(200, {
          "Content-Type": types[extname(file)] || "application/octet-stream",
        });
        res.end(req.method === "HEAD" ? undefined : data);
        return;
      }
      if (!["GET", "POST", "DELETE"].includes(req.method))
        throw new BankingError("INVALID_INPUT", 405);
      if (req.method !== "GET" && req.headers.origin !== config.origin)
        throw new BankingError("ORIGIN_MISMATCH", 403);
      if (
        req.headers["sec-fetch-site"] === "cross-site" &&
        path !== "/api/banking/callback"
      )
        throw new BankingError("CSRF", 403);
      let session = sessionFor(req);
      if (path === "/api/banking/status" && req.method === "GET") {
        json(res, 200, {
          authenticated: !!session,
          ready: !config.setupError,
          error: config.setupError,
          environment: config.environment,
          ...(session ? { csrf: session.csrf, ownerId: session.owner } : {}),
        });
        return;
      }
      if (path === "/api/banking/login" && req.method === "POST") {
        const input = await body(req),
          ip = req.socket.remoteAddress;
        const now = Date.now();
        for (const [key, value] of attempts)
          if (value.until < now) attempts.delete(key);
        const rate = attempts.get(ip) || { count: 0, until: now + 900000 };
        if (++rate.count > 10) throw new BankingError("RATE_LIMIT", 429);
        attempts.set(ip, rate);
        if (
          typeof input.username !== "string" ||
          input.username.length > 80 ||
          typeof input.password !== "string" ||
          input.password.length > 256
        )
          throw new BankingError("LOGIN_FAILED", 401);
        const user = store.db
          .prepare("SELECT * FROM users WHERE username=?")
          .get(input.username);
        const valid = verifyPassword(
          input.password,
          user?.password || dummyHash,
        );
        if (!valid || !user) throw new BankingError("LOGIN_FAILED", 401);
        if (session)
          store.db.prepare("DELETE FROM sessions WHERE id=?").run(session.id);
        store.db.prepare("DELETE FROM sessions WHERE expires<?").run(now);
        const value = token(),
          csrf = token();
        store.db
          .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
          .run(hash(value), user.id, csrf, now + 8 * 3600000);
        res.setHeader("Set-Cookie", cookie(value, 8 * 3600));
        json(res, 200, {
          authenticated: true,
          csrf,
          ownerId: user.id,
          ready: !config.setupError,
          environment: config.environment,
          error: config.setupError,
        });
        return;
      }
      if (!session) throw new BankingError("LOGIN_REQUIRED", 401);
      if (req.method !== "GET" && req.headers["x-csrf-token"] !== session.csrf)
        throw new BankingError("CSRF", 403);
      if (path === "/api/banking/logout" && req.method === "POST") {
        store.db.prepare("DELETE FROM sessions WHERE id=?").run(session.id);
        res.setHeader("Set-Cookie", cookie("", 0));
        json(res, 200, {});
        return;
      }
      if (config.setupError) throw new BankingError(config.setupError, 503);
      if (path === "/api/banking/callback" && req.method === "GET") {
        let result = "connected";
        try {
          await banking.callback(session.owner, session.id, url.searchParams);
        } catch (e) {
          result = e instanceof BankingError ? e.code : "PROVIDER_ERROR";
        }
        res.writeHead(303, {
          Location: `${config.origin}/?banking=${encodeURIComponent(result)}`,
        });
        res.end();
        return;
      }
      if (path === "/api/banking/connections" && req.method === "GET") {
        json(res, 200, banking.view(session.owner));
        return;
      }
      if (path === "/api/banking/institutions" && req.method === "GET") {
        const country = url.searchParams.get("country") || "PL";
        if (!["PL", "LT"].includes(country))
          throw new BankingError("INVALID_INPUT");
        await provider.verifyEnvironment();
        const banks = await provider.institutions(country);
        json(res, 200, {
          institutions: banks
            .filter(
              (b) => !b.psu_types?.length || b.psu_types.includes("personal"),
            )
            .map((b) => ({ name: b.name, country: b.country, beta: b.beta })),
        });
        return;
      }
      if (path === "/api/banking/authorize" && req.method === "POST") {
        json(
          res,
          200,
          await banking.start(session.owner, session.id, await body(req)),
        );
        return;
      }
      const match = path.match(
        /^\/api\/banking\/connections\/([A-Za-z0-9_-]+)(\/sync)?$/,
      );
      if (match && req.method === "POST" && match[2]) {
        json(res, 200, await banking.sync(session.owner, match[1]));
        return;
      }
      if (match && req.method === "DELETE" && !match[2]) {
        const input = await body(req);
        json(
          res,
          200,
          await banking.disconnect(
            session.owner,
            match[1],
            input.forget === true,
          ),
        );
        return;
      }
      throw new BankingError("NOT_FOUND", 404);
    } catch (e) {
      // Never log request URLs, headers, authorization codes, bank payloads or credentials.
      json(res, e instanceof BankingError ? e.status : 500, {
        error: e instanceof BankingError ? e.code : "SERVER_ERROR",
      });
    }
  });
}
