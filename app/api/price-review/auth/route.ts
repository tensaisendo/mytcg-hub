import { NextRequest, NextResponse } from "next/server";
import {
  PRICE_REVIEW_COOKIE,
  authenticatePriceReviewer,
  createPriceReviewSession,
  isPriceReviewAuthorized,
  isPriceReviewConfigured,
} from "@/lib/price-review-auth";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    configured: isPriceReviewConfigured(),
    authenticated: isPriceReviewAuthorized(request),
  });
}

export async function POST(request: NextRequest) {
  if (!isPriceReviewConfigured()) {
    return NextResponse.json({ error: "Les identifiants de l’outil ne sont pas configurés." }, { status: 503 });
  }
  const { username = "", password = "" } = await request.json();
  if (!authenticatePriceReviewer(String(username), String(password))) {
    return NextResponse.json({ error: "Identifiant ou mot de passe incorrect." }, { status: 401 });
  }
  const session = createPriceReviewSession();
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(PRICE_REVIEW_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: session.maxAge,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(PRICE_REVIEW_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
