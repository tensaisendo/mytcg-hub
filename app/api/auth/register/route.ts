import { NextResponse } from "next/server";
import { AUTH_COOKIE, STRAPI_URL } from "@/lib/strapi-auth";
import { isSiteAdmin } from "@/lib/site-admin";

export async function POST(request: Request) {
  try {
    const response = await fetch(`${STRAPI_URL}/api/auth/local/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await request.json()),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const payload = await response.json();
    if (!response.ok) return NextResponse.json(payload, { status: response.status });

    let user = payload.user;
    try {
      const profileResponse = await fetch(`${STRAPI_URL}/api/profile/me`, {
        headers: { Authorization: `Bearer ${payload.jwt}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
      });
      const profilePayload = profileResponse.ok ? await profileResponse.json() : null;
      user = profilePayload?.data || user;
    } catch { /* Registration remains valid if profile initialization is briefly unavailable. */ }
    const result = NextResponse.json({ user: { ...user, berries: Number(user.berries || 0), avatar: user.avatar || null, isAdmin: isSiteAdmin(user) } });
    result.cookies.set(AUTH_COOKIE, payload.jwt, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return result;
  } catch {
    return NextResponse.json({ error: { message: "Le service de connexion est temporairement indisponible." } }, { status: 503 });
  }
}
