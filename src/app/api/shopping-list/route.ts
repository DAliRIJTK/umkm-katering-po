import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { handleRouteError } from "@/lib/http";
import { ensureInitialized, getShoppingList } from "@/lib/repo/catering-repo";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureInitialized(db);
    const from = req.nextUrl.searchParams.get("from") || "2026-11-27";
    const to = req.nextUrl.searchParams.get("to") || from;
    const items = await getShoppingList(db, from, to);
    return NextResponse.json({ from, to, items });
  } catch (err) {
    return handleRouteError(err);
  }
}
