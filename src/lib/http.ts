import { NextRequest, NextResponse } from "next/server";
import { PinRateLimiter, verifySessionToken } from "./domain/auth";
import { DomainError, UnauthorizedError, ValidationError } from "./domain/errors";
import { getSessionSecret } from "./db";

export const ADMIN_COOKIE_NAME = "dapur_admin_session";

const globalForAuth = globalThis as unknown as {
  __dapurPinLimiter?: PinRateLimiter;
};

export function getPinRateLimiter(): PinRateLimiter {
  if (!globalForAuth.__dapurPinLimiter) {
    globalForAuth.__dapurPinLimiter = new PinRateLimiter(5, 15 * 60 * 1000);
  }
  return globalForAuth.__dapurPinLimiter;
}

export function getClientKey(req: NextRequest): string {
  // Hanya percaya header proxy bila secara eksplisit diaktifkan atau saat mode test.
  if (process.env.TRUST_PROXY === "1" || process.env.NODE_ENV === "test") {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim() || "local";
    }
  }
  return req.headers.get("x-real-ip")?.trim() || "local-client";
}

export function maskPhoneForOps(phone: string): string {
  if (!phone || phone.length < 8) return phone;
  return `${phone.slice(0, 4)}****${phone.slice(-4)}`;
}

export function isAdminAuthenticated(req: NextRequest): boolean {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return verifySessionToken(token, getSessionSecret());
}

export function requireAdminSession(req: NextRequest): void {
  if (!isAdminAuthenticated(req)) {
    throw new UnauthorizedError("Akses Admin membutuhkan login PIN.");
  }
}

export function parsePositiveIntId(raw: string): number {
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) {
    throw new ValidationError("ID parameter tidak valid.");
  }
  return num;
}

export async function parseJsonBody<T extends object>(req: NextRequest): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new ValidationError("Format body JSON tidak valid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ValidationError("Payload JSON harus berupa objek.");
  }
  return parsed as T;
}

export function handleRouteError(err: unknown): NextResponse {
  if (err instanceof DomainError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.statusCode }
    );
  }
  console.error("Unexpected API error:", err);
  return NextResponse.json(
    { error: "Terjadi kesalahan internal pada server.", code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}
