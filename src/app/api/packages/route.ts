import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ValidationError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/http";
import { ensureInitialized, getPublicSnapshot } from "@/lib/repo/catering-repo";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureInitialized(db);
    const datesParam = req.nextUrl.searchParams.get("dates");
    const dates = datesParam
      ? Array.from(new Set(datesParam.split(",").map((d) => d.trim()).filter(Boolean)))
      : undefined;
    if (dates && dates.length > 14) {
      throw new ValidationError("Maksimal 14 tanggal kapasitas per permintaan.");
    }
    const snapshot = await getPublicSnapshot(db, dates);
    return NextResponse.json(snapshot);
  } catch (err) {
    return handleRouteError(err);
  }
}
