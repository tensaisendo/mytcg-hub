import { NextResponse } from "next/server";
import { strapiAuthRequest } from "@/lib/strapi-auth";

export async function GET() {
  const response = await strapiAuthRequest("/api/decks/me");
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function POST(request: Request) {
  const response = await strapiAuthRequest("/api/decks", {
    method: "POST",
    body: JSON.stringify(await request.json()),
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
