import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ValidationError } from "@/lib/domain/errors";
import type { OrderStatus } from "@/lib/domain/types";
import { handleRouteError, parseJsonBody, parsePositiveIntId } from "@/lib/http";
import { ensureInitialized, transitionOrderStatus } from "@/lib/repo/catering-repo";

const VALID_STATUSES: OrderStatus[] = [
  "MENUNGGU_DP",
  "TERJADWAL",
  "DIPRODUKSI",
  "SIAP_KIRIM",
  "SELESAI_DIKIRIM",
  "DIBATALKAN",
];

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const orderId = parsePositiveIntId(id);
    const body = await parseJsonBody<{ status?: string }>(req);
    if (!body.status || !VALID_STATUSES.includes(body.status as OrderStatus)) {
      throw new ValidationError("Status tujuan tidak valid.");
    }
    const db = await getDb();
    await ensureInitialized(db);
    const order = await transitionOrderStatus(db, orderId, body.status as OrderStatus);
    return NextResponse.json({ order });
  } catch (err) {
    return handleRouteError(err);
  }
}
