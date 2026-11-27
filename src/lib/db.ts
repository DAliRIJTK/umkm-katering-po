import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const globalForDb = globalThis as unknown as {
  __dapurDb?: PGlite;
  __dapurSessionSecret?: string;
};

export async function getDb(dataDir?: string): Promise<PGlite> {
  if (dataDir) {
    return new PGlite(dataDir);
  }
  if (!globalForDb.__dapurDb) {
    const dir = process.env.PGLITE_DATA_DIR || "./data/pglite";
    if (dir !== "memory://" && !dir.startsWith("memory://")) {
      fs.mkdirSync(path.dirname(path.resolve(dir)), { recursive: true });
    }
    globalForDb.__dapurDb = new PGlite(dir);
  }
  return globalForDb.__dapurDb;
}

export function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (globalForDb.__dapurSessionSecret) {
    return globalForDb.__dapurSessionSecret;
  }
  const secretPath = path.resolve("./data/.session_secret");
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, "utf-8").trim();
      if (existing.length >= 32) {
        globalForDb.__dapurSessionSecret = existing;
        return existing;
      }
    }
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    const generated = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(secretPath, generated, { mode: 0o600 });
    globalForDb.__dapurSessionSecret = generated;
    return generated;
  } catch {
    const ephemeral = crypto.randomBytes(32).toString("hex");
    globalForDb.__dapurSessionSecret = ephemeral;
    return ephemeral;
  }
}
