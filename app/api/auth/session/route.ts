import { NextResponse } from "next/server";
import { strapiAuthRequest } from "@/lib/strapi-auth";
import { isSiteAdmin } from "@/lib/site-admin";

export async function GET() {
  try {
    const response = await strapiAuthRequest("/api/profile/me");
    if (!response.ok) return NextResponse.json({ user: null }, { status: response.status === 401 || response.status === 403 ? 401 : 503 });
    const payload = await response.json();
    const user = payload.data;
    return NextResponse.json({ user: { ...user, isAdmin: isSiteAdmin(user) } });
  } catch {
    return NextResponse.json({ error: "Session temporairement indisponible." }, { status: 503 });
  }
}
