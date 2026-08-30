import { NextResponse } from "next/server";
import { STRAPI_URL } from "@/lib/strapi-auth";

export async function POST(request: Request) {
  const body = await request.json();
  const response = await fetch(`${STRAPI_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email }),
    cache: "no-store",
  });

  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
