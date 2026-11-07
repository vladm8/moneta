import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export const token = () => randomBytes(32).toString("base64url");
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export function passwordHash(password, salt = token()) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password, encoded) {
  const [salt, expected] = encoded.split(":");
  const actual = scryptSync(password, salt, 64),
    wanted = Buffer.from(expected, "hex");
  return wanted.length === actual.length && timingSafeEqual(actual, wanted);
}
export class Store {
  constructor(path, key) {
    this.key = Buffer.from(key, "base64");
    if (this.key.length !== 32)
      throw new Error(
        "BANKING_ENCRYPTION_KEY must contain 32 random bytes in base64",
      );
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO migrations VALUES(1);
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, owner TEXT NOT NULL, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, owner TEXT NOT NULL, login TEXT NOT NULL, expires INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records(owner TEXT NOT NULL, environment TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner, environment));`);
  }
  encrypt(value, aad) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      "base64",
    );
  }
  decrypt(value, aad) {
    const data = Buffer.from(value, "base64"),
      decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        data.subarray(0, 12),
      );
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
  }
  get(owner, environment) {
    const row = this.db
      .prepare("SELECT payload FROM records WHERE owner=? AND environment=?")
      .get(owner, environment);
    return row
      ? this.decrypt(row.payload, `${owner}:${environment}`)
      : { connections: [], accounts: [], transactions: [] };
  }
  put(owner, environment, data) {
    this.db
      .prepare(
        "INSERT INTO records VALUES(?,?,?) ON CONFLICT(owner,environment) DO UPDATE SET payload=excluded.payload",
      )
      .run(owner, environment, this.encrypt(data, `${owner}:${environment}`));
  }
  attempt(state, owner, login, payload, now = Date.now()) {
    this.db.prepare("DELETE FROM attempts WHERE expires<?").run(now);
    this.db
      .prepare("INSERT INTO attempts VALUES(?,?,?,?,?)")
      .run(
        hash(state),
        owner,
        login,
        now + 600000,
        this.encrypt(payload, owner),
      );
  }
  consume(state, owner, login, now = Date.now()) {
    const row = this.db
      .prepare(
        "DELETE FROM attempts WHERE id=? AND owner=? AND login=? AND expires>? RETURNING payload",
      )
      .get(hash(state), owner, login, now);
    return row ? this.decrypt(row.payload, owner) : null;
  }
  close() {
    this.db.close();
  }
}
