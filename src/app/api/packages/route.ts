import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { handleRouteError } from "@/lib/http";
import { ensureInitialized, getPublicSnapshot } from "@/lib/repo/catering-repo";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureInitialized(db);
    const datesParam = req.nextUrl.searchParams.get("dates");
    const dates = datesParam
      ? datesParam.split(",").map((d) => d.trim()).filter(Boolean)
      : undefined;
    const snapshot = await getPublicSnapshot(db, dates);
    return NextResponse.json(snapshot);
  } catch (err) {
    return handleRouteError(err);
  }
}
