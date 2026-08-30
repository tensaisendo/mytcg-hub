import { NextRequest, NextResponse } from "next/server";
import { fetchCatalogPage, type CardLanguage, type CatalogFilters } from "@/lib/strapi";

export async function GET(request: NextRequest) {
  const rawPage = Number(request.nextUrl.searchParams.get("page") || "1");
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const requestedLanguage = request.nextUrl.searchParams.get("lang");
  const language: CardLanguage = requestedLanguage === "FR" || requestedLanguage === "JP" ? requestedLanguage : "EN";
  const sort = request.nextUrl.searchParams.get("sort");
  const filters: CatalogFilters = {
    treatment: request.nextUrl.searchParams.get("treatment") || undefined,
    query: request.nextUrl.searchParams.get("query") || undefined,
    setCode: request.nextUrl.searchParams.get("set") || undefined,
    rarity: request.nextUrl.searchParams.get("rarity") || undefined,
    color: request.nextUrl.searchParams.get("color") || undefined,
    type: request.nextUrl.searchParams.get("type") || undefined,
    sort: sort === "name" || sort === "price-asc" || sort === "price-desc" ? sort : "code",
  };

  try {
    return NextResponse.json(await fetchCatalogPage(page, language, filters));
  } catch (error) {
    console.error("Catalog page request failed", error);
    return NextResponse.json({ error: "Impossible de charger cette page de cartes." }, { status: 502 });
  }
}
