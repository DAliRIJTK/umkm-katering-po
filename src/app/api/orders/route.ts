import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { UnauthorizedError, ValidationError } from "@/lib/domain/errors";
import type { CreateOrderInput, OrderStatus } from "@/lib/domain/types";
import { handleRouteError, isAdminAuthenticated, parseJsonBody } from "@/lib/http";
import { createOrder, ensureInitialized, listOrders } from "@/lib/repo/catering-repo";

const VALID_STATUSES: OrderStatus[] = [
  "MENUNGGU_DP",
  "TERJADWAL",
  "DIPRODUKSI",
  "SIAP_KIRIM",
  "SELESAI_DIKIRIM",
  "DIBATALKAN",
];

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureInitialized(db);
    const statusParam = req.nextUrl.searchParams.get("status")?.trim() || "";
    const dateParam = req.nextUrl.searchParams.get("date")?.trim() || "";
    const qParam = req.nextUrl.searchParams.get("q")?.trim() || "";

    let status: OrderStatus | undefined;
    if (statusParam) {
      if (!VALID_STATUSES.includes(statusParam as OrderStatus)) {
        throw new ValidationError("Filter status PO tidak valid.");
      }
      status = statusParam as OrderStatus;
    }

    const orders = await listOrders(db, {
      status,
      date: dateParam || undefined,
      query: qParam || undefined,
    });
    return NextResponse.json({ orders });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureInitialized(db);
    const body = await parseJsonBody<CreateOrderInput>(req);
    if (body.initialPayment !== undefined && !isAdminAuthenticated(req)) {
      throw new UnauthorizedError("Pembayaran awal saat membuat PO hanya dapat dicatat oleh Admin.");
    }
    const order = await createOrder(db, body);
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
