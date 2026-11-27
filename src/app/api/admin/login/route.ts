import { NextRequest, NextResponse } from "next/server";
import { getDb, getSessionSecret } from "@/lib/db";
import { createSessionToken } from "@/lib/domain/auth";
import { UnauthorizedError } from "@/lib/domain/errors";
import {
  ADMIN_COOKIE_NAME,
  getClientKey,
  getPinRateLimiter,
  handleRouteError,
  parseJsonBody,
} from "@/lib/http";
import { ensureInitialized, verifyAdminPin } from "@/lib/repo/catering-repo";

export async function POST(req: NextRequest) {
  try {
    const clientKey = getClientKey(req);
    const limiter = getPinRateLimiter();
    limiter.check(clientKey);

    const body = await parseJsonBody<{ pin?: string }>(req);
    const db = await getDb();
    await ensureInitialized(db);

    const ok = await verifyAdminPin(db, String(body.pin ?? ""));
    if (!ok) {
      limiter.recordFailure(clientKey);
      throw new UnauthorizedError("PIN Admin salah.");
    }

    limiter.reset(clientKey);
    const token = createSessionToken(getSessionSecret());
    const res = NextResponse.json({ authenticated: true });
    res.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return res;
  } catch (err) {
    return handleRouteError(err);
  }
}
