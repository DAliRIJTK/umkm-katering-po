import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { handleRouteError } from "@/lib/http";
import { ensureInitialized, getDailyCapacity } from "@/lib/repo/catering-repo";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureInitialized(db);
    const date = req.nextUrl.searchParams.get("date") || "2026-11-28";
    const info = await getDailyCapacity(db, date);
    return NextResponse.json(info);
  } catch (err) {
    return handleRouteError(err);
  }
}
