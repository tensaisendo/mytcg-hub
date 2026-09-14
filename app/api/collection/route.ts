import { NextRequest, NextResponse } from "next/server";
import { strapiAuthRequest } from "@/lib/strapi-auth";

export async function GET(request: NextRequest) {
  try {
    const params = new URLSearchParams();
    for (const key of ["page", "lang", "query", "set", "rarity", "treatment", "distribution", "color", "type", "sort"]) {
      const value = request.nextUrl.searchParams.get(key);
      if (value) params.set(key, value);
    }
    const response = await strapiAuthRequest(`/api/user-cards/catalog?${params}`);
    if (!response.ok) return NextResponse.json({ error: "Impossible de charger la collection." }, { status: response.status });
    return NextResponse.json(await response.json(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "La collection est temporairement indisponible." }, { status: 503 });
  }
}
