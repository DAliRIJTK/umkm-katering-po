import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { handleRouteError } from "@/lib/http";
import { ensureInitialized, getPublicSettings } from "@/lib/repo/catering-repo";

export async function GET() {
  try {
    const db = await getDb();
    await ensureInitialized(db);
    const settings = await getPublicSettings(db);
    return NextResponse.json({ ok: true, db: "pglite", businessName: settings.businessName });
  } catch (err) {
    return handleRouteError(err);
  }
}
