import crypto from "node:crypto";
import { RateLimitError, ValidationError } from "./errors";

export function validatePinFormat(pin: string): string {
  const trimmed = String(pin ?? "").trim();
  if (!/^\d{4,8}$/.test(trimmed)) {
    throw new ValidationError("PIN Admin harus terdiri dari 4 sampai 8 digit angka.");
  }
  return trimmed;
}

export function hashPin(pin: string, existingSalt?: string): { salt: string; hash: string } {
  const validPin = validatePinFormat(pin);
  const salt = existingSalt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(validPin, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPin(pin: string, salt: string, expectedHash: string): boolean {
  if (!/^\d{4,8}$/.test(String(pin ?? "").trim())) {
    return false;
  }
  if (!salt || !expectedHash) {
    return false;
  }
  const actualBuf = crypto.scryptSync(pin.trim(), salt, 64);
  const expectedBuf = Buffer.from(expectedHash, "hex");
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function createSessionToken(
  secret: string,
  ttlMs = 8 * 60 * 60 * 1000,
  nowMs = Date.now()
): string {
  const exp = nowMs + ttlMs;
  const nonce = crypto.randomBytes(12).toString("hex");
  const payload = `${exp}.${nonce}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  nowMs = Date.now()
): boolean {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || !nonce || !/^[0-9a-f]{64}$/i.test(sig ?? "") || nowMs > exp) {
    return false;
  }
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(`${expStr}.${nonce}`)
    .digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length === 0 || sigBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

interface AttemptBucket {
  count: number;
  windowStartMs: number;
}

export class PinRateLimiter {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly buckets = new Map<string, AttemptBucket>();

  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  check(key: string, nowMs = Date.now()): void {
    const bucket = this.buckets.get(key);
    if (!bucket) return;
    if (nowMs - bucket.windowStartMs > this.windowMs) {
      this.buckets.delete(key);
      return;
    }
    if (bucket.count >= this.maxAttempts) {
      throw new RateLimitError(
        "Terlalu banyak percobaan PIN salah (maksimal 5x). Tunggu 15 menit lalu coba lagi."
      );
    }
  }

  recordFailure(key: string, nowMs = Date.now()): void {
    const bucket = this.buckets.get(key);
    if (!bucket || nowMs - bucket.windowStartMs > this.windowMs) {
      this.buckets.set(key, { count: 1, windowStartMs: nowMs });
      return;
    }
    bucket.count += 1;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}
