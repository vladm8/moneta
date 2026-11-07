import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { loadEnvFile } from "node:process";
import { loadConfig } from "./config.mjs";
import { Store, passwordHash, token } from "./store.mjs";

if (!existsSync(".env"))
  appendFileSync(".env", readFileSync(".env.example", "utf8"), { mode: 0o600 });
loadEnvFile(".env");
if (!process.env.BANKING_ENCRYPTION_KEY) {
  const key = randomBytes(32).toString("base64");
  appendFileSync(".env", `\nBANKING_ENCRYPTION_KEY=${key}\n`, { mode: 0o600 });
  process.env.BANKING_ENCRYPTION_KEY = key;
}
let muted = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk, encoding);
    done();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
const username = (await rl.question("Moneta banking username: ")).trim();
process.stdout.write("Password (at least 12 characters, hidden): ");
muted = true;
const password = await rl.question("");
muted = false;
process.stdout.write("\n");
rl.close();
if (
  !/^[\w.@-]{3,80}$/.test(username) ||
  password.length < 12 ||
  password.length > 256
)
  throw new Error("Invalid username or password length");
const config = loadConfig(),
  store = new Store(config.database, config.encryptionKey);
// Explicit create-only provisioning; existing users are never silently replaced.
store.db
  .prepare("INSERT INTO users VALUES(?,?,?)")
  .run(token(), username, passwordHash(password));
store.close();
console.log(
  "User created. Add Enable Banking credentials to .env, then run npm run banking:server.",
);
