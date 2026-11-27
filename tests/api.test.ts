import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

process.env.PGLITE_DATA_DIR = "memory://";

import { GET as healthGet } from "../src/app/api/health/route";
import { GET as packagesGet } from "../src/app/api/packages/route";
import { GET as capacityGet } from "../src/app/api/capacity/route";
import { GET as trackGet } from "../src/app/api/track/route";
import { GET as ordersGet, POST as ordersPost } from "../src/app/api/orders/route";
import { POST as paymentPost } from "../src/app/api/orders/[id]/payments/route";
import { PATCH as statusPatch } from "../src/app/api/orders/[id]/status/route";
import { GET as bomGet } from "../src/app/api/shopping-list/route";
import { POST as adminLoginPost } from "../src/app/api/admin/login/route";
import { GET as adminOverviewGet } from "../src/app/api/admin/overview/route";
import { PATCH as adminSettingsPatch } from "../src/app/api/admin/settings/route";
import { ADMIN_COOKIE_NAME } from "../src/lib/http";

function jsonReq(url: string, method: string, body?: unknown, cookieValue?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": "10.0.0.50" });
  if (cookieValue) {
    headers.set("cookie", `${ADMIN_COOKIE_NAME}=${cookieValue}`);
  }
  return new NextRequest(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("Next.js API Route Handlers end-to-end (PGlite memory://)", () => {
  beforeAll(async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
  });

  it("serves public packages, capacity, and protected /api/track", async () => {
    const pkgRes = await packagesGet(new NextRequest("http://localhost/api/packages"));
    expect(pkgRes.status).toBe(200);
    const pkgJson = await pkgRes.json();
    expect(pkgJson.packages).toHaveLength(5);

    const capRes = await capacityGet(new NextRequest("http://localhost/api/capacity?date=2026-11-28"));
    const capJson = await capRes.json();
    expect(capJson.usedBoxes).toBe(150);

    const okTrack = await trackGet(
      new NextRequest("http://localhost/api/track?code=PO-261127-03&last4=3344")
    );
    expect(okTrack.status).toBe(200);

    const badTrack = await trackGet(
      new NextRequest("http://localhost/api/track?code=PO-261127-03&last4=0000")
    );
    expect(badTrack.status).toBe(404);
  });

  it("blocks unauthenticated initialPayment on POST /api/orders and enforces payment & status gates", async () => {
    const forbiddenInit = await ordersPost(
      jsonReq("http://localhost/api/orders", "POST", {
        customerName: "Penguji",
        customerPhone: "081234567890",
        deliveryAddress: "Jl. Dago, Bandung",
        deliveryDate: "2026-11-30",
        deliveryTime: "10:00",
        items: [{ packageId: 1, qty: 20 }],
        initialPayment: { amountIdr: 500_000, method: "TRANSFER" },
      })
    );
    expect(forbiddenInit.status).toBe(401);

    const createdRes = await ordersPost(
      jsonReq("http://localhost/api/orders", "POST", {
        customerName: "Ibu Ani",
        institutionName: "Sekolah Harapan",
        customerPhone: "081234567890",
        deliveryAddress: "Jl. Dago, Bandung",
        deliveryDate: "2026-11-30",
        deliveryTime: "10:00",
        items: [{ packageId: 1, qty: 20 }],
      })
    );
    expect(createdRes.status).toBe(201);
    const { order } = await createdRes.json();
    expect(order.status).toBe("MENUNGGU_DP");

    // Cannot jump to TERJADWAL without DP
    const blockedJump = await statusPatch(
      jsonReq(`http://localhost/api/orders/${order.id}/status`, "PATCH", { status: "TERJADWAL" }),
      { params: Promise.resolve({ id: String(order.id) }) }
    );
    expect(blockedJump.status).toBe(409);

    // Record DP >= 30% auto-schedules to TERJADWAL
    const dpRes = await paymentPost(
      jsonReq(`http://localhost/api/orders/${order.id}/payments`, "POST", {
        amountIdr: order.minDpIdr,
        method: "QRIS",
        kind: "DP",
      }),
      { params: Promise.resolve({ id: String(order.id) }) }
    );
    expect(dpRes.status).toBe(201);
    const dpJson = await dpRes.json();
    expect(dpJson.order.status).toBe("TERJADWAL");

    // Check BOM shopping list includes 2026-11-30 now
    const bomRes = await bomGet(
      new NextRequest("http://localhost/api/shopping-list?from=2026-11-30&to=2026-11-30")
    );
    expect(bomRes.status).toBe(200);
    const bomJson = await bomRes.json();
    expect(bomJson.items.some((i: { ingredientName: string }) => i.ingredientName === "Beras Pulen")).toBe(true);

    // Check orders listing
    const listRes = await ordersGet(new NextRequest("http://localhost/api/orders?date=2026-11-30"));
    const listJson = await listRes.json();
    expect(listJson.orders).toHaveLength(1);
  });

  it("protects admin endpoints with scrypt PIN cookie and rate-limits brute force", async () => {
    const unauthOverview = await adminOverviewGet(
      jsonReq("http://localhost/api/admin/overview", "GET")
    );
    expect(unauthOverview.status).toBe(401);

    // Wrong PIN 5 times triggers 429 on 6th attempt
    for (let i = 0; i < 5; i++) {
      const failRes = await adminLoginPost(
        jsonReq("http://localhost/api/admin/login", "POST", { pin: "999999" })
      );
      expect(failRes.status).toBe(401);
    }
    const lockedRes = await adminLoginPost(
      jsonReq("http://localhost/api/admin/login", "POST", { pin: "271127" })
    );
    expect(lockedRes.status).toBe(429);

    // Different client IP succeeds with valid default PIN
    const okLoginReq = new NextRequest("http://localhost/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.51" },
      body: JSON.stringify({ pin: "271127" }),
    });
    const okLogin = await adminLoginPost(okLoginReq);
    expect(okLogin.status).toBe(200);
    const sessionCookie = okLogin.cookies.get(ADMIN_COOKIE_NAME)?.value;
    expect(sessionCookie).toBeTruthy();

    const overviewRes = await adminOverviewGet(
      jsonReq("http://localhost/api/admin/overview", "GET", undefined, sessionCookie)
    );
    expect(overviewRes.status).toBe(200);
    const overview = await overviewRes.json();
    expect(overview.cashRecap.totalCollectedIdr).toBeGreaterThan(0);

    const patchRes = await adminSettingsPatch(
      jsonReq("http://localhost/api/admin/settings", "PATCH", { dailyCapacityBoxes: 220 }, sessionCookie)
    );
    expect(patchRes.status).toBe(200);
    const patchJson = await patchRes.json();
    expect(patchJson.settings.dailyCapacityBoxes).toBe(220);
  });
});
