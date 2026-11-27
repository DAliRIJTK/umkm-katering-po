import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { CreateMenuPackageInput } from "@/lib/domain/types";
import { handleRouteError, parseJsonBody, requireAdminSession } from "@/lib/http";
import { createMenuPackage, ensureInitialized } from "@/lib/repo/catering-repo";

export async function POST(req: NextRequest) {
  try {
    requireAdminSession(req);
    const body = await parseJsonBody<CreateMenuPackageInput>(req);
    const db = await getDb();
    await ensureInitialized(db);
    const pkg = await createMenuPackage(db, body);
    return NextResponse.json({ package: pkg }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
