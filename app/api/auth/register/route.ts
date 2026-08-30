import { NextResponse } from "next/server";
import { AUTH_COOKIE, STRAPI_URL } from "@/lib/strapi-auth";

export async function POST(request: Request) {
  const response = await fetch(`${STRAPI_URL}/api/auth/local/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await request.json()),
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) return NextResponse.json(payload, { status: response.status });

  const result = NextResponse.json({
    user: { id: payload.user.id, username: payload.user.username, email: payload.user.email },
  });
  result.cookies.set(AUTH_COOKIE, payload.jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return result;
}
