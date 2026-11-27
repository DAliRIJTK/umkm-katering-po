import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { RecordPaymentInput } from "@/lib/domain/types";
import { handleRouteError, parseJsonBody, parsePositiveIntId } from "@/lib/http";
import { ensureInitialized, recordPayment } from "@/lib/repo/catering-repo";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const orderId = parsePositiveIntId(id);
    const body = await parseJsonBody<RecordPaymentInput>(req);
    const db = await getDb();
    await ensureInitialized(db);
    const order = await recordPayment(db, orderId, body);
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
