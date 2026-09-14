import CardsCatalog from "./CardsCatalog";
import { fetchCatalogPage, type CardLanguage } from "@/lib/strapi";

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ set?: string; lang?: CardLanguage; query?: string; rarity?: string; treatment?: string; distribution?: string; color?: string; type?: string; sort?: "code" | "name" | "price-asc" | "price-desc" }> }) {
  const { set = "", lang = "EN", query = "", rarity = "", treatment = "", distribution = "", color = "", type = "", sort = "code" } = await searchParams;
  const catalog = await fetchCatalogPage(1, lang, { query, setCode: set, rarity, treatment, distribution, color, type, sort });
  return <CardsCatalog cards={catalog.cards} pageCount={catalog.pageCount} initialPage={catalog.page} initialSet={set} initialQuery={query} initialRarity={rarity} initialTreatment={treatment} initialDistribution={distribution} initialColor={color} initialType={type} initialSort={sort} initialLanguage={lang} />;
}
