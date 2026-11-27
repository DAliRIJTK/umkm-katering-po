import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, isAdminAuthenticated } from "@/lib/http";

export async function GET(req: NextRequest) {
  return NextResponse.json({ authenticated: isAdminAuthenticated(req) });
}

export async function POST() {
  const res = NextResponse.json({ authenticated: false });
  res.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
