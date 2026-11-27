import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { handleRouteError, requireAdminSession } from "@/lib/http";
import {
  ensureInitialized,
  getCashRecap,
  getPublicSettings,
  listMenuPackages,
  listOrders,
} from "@/lib/repo/catering-repo";

export async function GET(req: NextRequest) {
  try {
    requireAdminSession(req);
    const db = await getDb();
    await ensureInitialized(db);
    const [settings, cashRecap, packages, orders] = await Promise.all([
      getPublicSettings(db),
      getCashRecap(db),
      listMenuPackages(db, { includeInactive: true }),
      listOrders(db),
    ]);
    return NextResponse.json({ settings, cashRecap, packages, orders });
  } catch (err) {
    return handleRouteError(err);
  }
}
