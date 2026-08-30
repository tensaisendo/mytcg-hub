import CardsCatalog from "@/app/cards/CardsCatalog";
import { fetchCards } from "@/lib/strapi";

export default async function WishlistPage({ searchParams }: { searchParams?: Promise<{ lang?: "FR" | "EN" | "JP" }> }) {
  const lang = (await searchParams)?.lang || "EN";
  return <CardsCatalog cards={await fetchCards(lang)} initialSection="wishlist" initialLanguage={lang} />;
}
