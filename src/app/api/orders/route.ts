import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { UnauthorizedError, ValidationError } from "@/lib/domain/errors";
import { ALL_ORDER_STATUSES } from "@/lib/domain/state-machine";
import type { CreateOrderInput, OrderStatus } from "@/lib/domain/types";
import {
  handleRouteError,
  isAdminAuthenticated,
  maskPhoneForOps,
  parseJsonBody,
} from "@/lib/http";
import { createOrder, ensureInitialized, listOrders } from "@/lib/repo/catering-repo";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureInitialized(db);
    const statusParam = req.nextUrl.searchParams.get("status")?.trim() || "";
    const dateParam = req.nextUrl.searchParams.get("date")?.trim() || "";
    const qParam = req.nextUrl.searchParams.get("q")?.trim() || "";

    let status: OrderStatus | undefined;
    if (statusParam) {
      if (!ALL_ORDER_STATUSES.includes(statusParam as OrderStatus)) {
        throw new ValidationError("Filter status PO tidak valid.");
      }
      status = statusParam as OrderStatus;
    }

    const orders = await listOrders(db, {
      status,
      date: dateParam || undefined,
      query: qParam || undefined,
    });
    const isAdmin = isAdminAuthenticated(req);
    const safeOrders = isAdmin
      ? orders
      : orders.map((o) => ({ ...o, customerPhone: maskPhoneForOps(o.customerPhone) }));
    return NextResponse.json({ orders: safeOrders });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    await ensureInitialized(db);
    const body = await parseJsonBody<CreateOrderInput & Record<string, unknown>>(req);
    if (body.initialPayment !== undefined && !isAdminAuthenticated(req)) {
      throw new UnauthorizedError("Pembayaran awal saat membuat PO hanya dapat dicatat oleh Admin.");
    }
    const order = await createOrder(db, body);
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
