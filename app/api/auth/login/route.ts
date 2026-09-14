import { NextResponse } from "next/server";
import { AUTH_COOKIE, STRAPI_URL } from "@/lib/strapi-auth";
import { requestLogin } from "@/lib/login-request";
import { isSiteAdmin } from "@/lib/site-admin";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let phase = "request";
  try {
    const body = await request.json();
    if (typeof body?.identifier !== "string" || typeof body?.password !== "string" || !body.identifier.trim() || !body.password) {
      return NextResponse.json({ error: { message: "Identifiant et mot de passe requis." } }, { status: 400 });
    }
    phase = "strapi";
    const { response, payload } = await requestLogin(`${STRAPI_URL}/api/auth/local`, {
      identifier: body.identifier.trim(), password: body.password,
    });
    phase = "response";
    if (response.status >= 500) {
      console.error("[auth/login]", { phase, upstreamStatus: response.status, elapsedMs: Date.now() - startedAt });
      return NextResponse.json({ error: { code: "AUTH_UPSTREAM", message: "Strapi a rencontré une erreur pendant la connexion (AUTH_UPSTREAM)." } }, { status: 502 });
    }
    if (!response.ok) return NextResponse.json(payload, { status: response.status });
    if (!payload.jwt || !payload.user?.id) {
      console.error("[auth/login]", { phase, code: "AUTH_RESPONSE", elapsedMs: Date.now() - startedAt });
      return NextResponse.json({ error: { code: "AUTH_RESPONSE", message: "La réponse de connexion de Strapi est incomplète (AUTH_RESPONSE)." } }, { status: 502 });
    }

    phase = "profile";
    let sessionUser = payload.user;
    try {
      const profileResponse = await fetch(`${STRAPI_URL}/api/profile/check-in`, {
        method: "POST",
        headers: { Authorization: `Bearer ${payload.jwt}`, "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      const profilePayload = profileResponse.ok ? await profileResponse.json() : null;
      sessionUser = profilePayload?.data || sessionUser;
    } catch { /* A profile outage must not invalidate valid login credentials. */ }
    phase = "cookie";
    const result = NextResponse.json({
      user: { ...sessionUser, berries: Number(sessionUser.berries || 0), avatar: sessionUser.avatar || null, isAdmin: isSiteAdmin(sessionUser) },
    });
    result.cookies.set(AUTH_COOKIE, payload.jwt, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return result;
  } catch (error) {
    const failure = error as { name?: string; cause?: { code?: string } };
    const code = phase === "cookie" ? "AUTH_COOKIE"
      : failure.name === "TimeoutError" ? "AUTH_TIMEOUT"
      : phase === "response" || failure.name === "SyntaxError" ? "AUTH_RESPONSE" : "AUTH_NETWORK";
    console.error("[auth/login]", { phase, code, errorName: failure.name, networkCode: failure.cause?.code, elapsedMs: Date.now() - startedAt });
    const message = code === "AUTH_TIMEOUT" ? "Strapi ne répond pas dans le délai de connexion (AUTH_TIMEOUT)."
      : code === "AUTH_COOKIE" ? "La connexion a réussi, mais la session n’a pas pu être enregistrée (AUTH_COOKIE)."
      : code === "AUTH_RESPONSE" ? "La réponse de Strapi est illisible (AUTH_RESPONSE)."
      : "Le frontend n’arrive pas à joindre Strapi (AUTH_NETWORK).";
    return NextResponse.json({ error: { code, message } }, { status: code === "AUTH_TIMEOUT" ? 504 : 503 });
  }
}
