import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  handleRouteError,
  parseJsonBody,
  parsePositiveIntId,
  requireAdminSession,
} from "@/lib/http";
import { ensureInitialized, updateMenuPackage } from "@/lib/repo/catering-repo";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    requireAdminSession(req);
    const { id } = await context.params;
    const pkgId = parsePositiveIntId(id);
    const body = await parseJsonBody<{
      isActive?: boolean;
      priceIdr?: number;
      minOrderQty?: number;
    }>(req);
    const db = await getDb();
    await ensureInitialized(db);
    const pkg = await updateMenuPackage(db, pkgId, {
      isActive: body.isActive,
      priceIdr: body.priceIdr,
      minOrderQty: body.minOrderQty,
    });
    return NextResponse.json({ package: pkg });
  } catch (err) {
    return handleRouteError(err);
  }
}
