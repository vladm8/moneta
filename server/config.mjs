import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createJWT } from "./provider.mjs";

export function loadConfig(env = process.env) {
  const origin = env.MONETA_ORIGIN || "http://localhost:5173";
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    (url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new Error(
      "MONETA_ORIGIN must be an HTTPS origin (HTTP is allowed only on localhost)",
    );
  const environment = env.ENABLE_BANKING_ENVIRONMENT || "SANDBOX";
  if (!["SANDBOX", "PRODUCTION"].includes(environment))
    throw new Error("Invalid Enable Banking environment");
  const prefix = `ENABLE_BANKING_${environment}`;
  let privateKey, setupError;
  const applicationId = env[`${prefix}_APPLICATION_ID`];
  try {
    privateKey = env[`${prefix}_PRIVATE_KEY_PATH`]
      ? readFileSync(env[`${prefix}_PRIVATE_KEY_PATH`], "utf8")
      : undefined;
    if (!applicationId || !privateKey) setupError = "MISSING_CREDENTIALS";
    else createJWT(applicationId, privateKey);
  } catch {
    setupError = "INVALID_KEY";
  }
  if (
    environment === "PRODUCTION" &&
    env.ENABLE_BANKING_ALLOW_PRODUCTION !== "true"
  )
    setupError = "PRODUCTION_DISABLED";
  const database = resolve(env.BANKING_DATABASE || ".banking/moneta.sqlite");
  mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
  return {
    origin,
    callback: `${origin}/api/banking/callback`,
    secure: url.protocol === "https:",
    environment,
    applicationId,
    privateKey,
    setupError,
    database,
    encryptionKey: env.BANKING_ENCRYPTION_KEY,
    port: Number(env.BANKING_PORT || 3001),
  };
}
