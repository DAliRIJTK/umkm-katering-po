import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { UpdateSettingsInput } from "@/lib/domain/types";
import { handleRouteError, parseJsonBody, requireAdminSession } from "@/lib/http";
import { ensureInitialized, updateSettings } from "@/lib/repo/catering-repo";

export async function PATCH(req: NextRequest) {
  try {
    requireAdminSession(req);
    const body = await parseJsonBody<UpdateSettingsInput>(req);
    const db = await getDb();
    await ensureInitialized(db);
    const settings = await updateSettings(db, body);
    return NextResponse.json({ settings });
  } catch (err) {
    return handleRouteError(err);
  }
}
