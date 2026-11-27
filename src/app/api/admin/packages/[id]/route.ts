import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ValidationError } from "@/lib/domain/errors";
import {
  handleRouteError,
  parseJsonBody,
  parsePositiveIntId,
  requireAdminSession,
} from "@/lib/http";
import { ensureInitialized, toggleMenuPackage } from "@/lib/repo/catering-repo";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    requireAdminSession(req);
    const { id } = await context.params;
    const pkgId = parsePositiveIntId(id);
    const body = await parseJsonBody<{ isActive?: boolean }>(req);
    if (typeof body.isActive !== "boolean") {
      throw new ValidationError("Field isActive wajib bertipe boolean.");
    }
    const db = await getDb();
    await ensureInitialized(db);
    const pkg = await toggleMenuPackage(db, pkgId, body.isActive);
    return NextResponse.json({ package: pkg });
  } catch (err) {
    return handleRouteError(err);
  }
}
