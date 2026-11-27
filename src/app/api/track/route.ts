import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { handleRouteError } from "@/lib/http";
import { ensureInitialized, trackOrderPublic } from "@/lib/repo/catering-repo";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureInitialized(db);
    const code = req.nextUrl.searchParams.get("code") || "";
    const last4 = req.nextUrl.searchParams.get("last4") || "";
    const order = await trackOrderPublic(db, code, last4);
    return NextResponse.json({ order });
  } catch (err) {
    return handleRouteError(err);
  }
}
