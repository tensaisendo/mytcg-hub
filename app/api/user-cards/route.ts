import { NextResponse } from "next/server";
import { strapiAuthRequest } from "@/lib/strapi-auth";

export async function GET() {
  const response = await strapiAuthRequest("/api/user-cards/me");
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
