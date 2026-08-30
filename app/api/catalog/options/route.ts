import { NextResponse } from "next/server";
import { fetchCatalogOptions, type CardLanguage } from "@/lib/strapi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const requestedLanguage = new URL(request.url).searchParams.get("lang");
    const language: CardLanguage = requestedLanguage === "FR" || requestedLanguage === "JP" ? requestedLanguage : "EN";
    return NextResponse.json(await fetchCatalogOptions(language));
  } catch (error) {
    console.error("Catalog options request failed", error);
    return NextResponse.json({ error: "Impossible de charger les options des filtres." }, { status: 502 });
  }
}
