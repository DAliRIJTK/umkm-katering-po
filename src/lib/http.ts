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
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim() || "local";
  }
  return req.headers.get("x-real-ip") || "local";
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

export async function parseJsonBody<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ValidationError("Format body JSON tidak valid.");
  }
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
