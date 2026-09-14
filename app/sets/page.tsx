import CardsCatalog from "@/app/cards/CardsCatalog";
import { fetchExtensionSummaries } from "@/lib/strapi";

export default async function SetsPage({ searchParams }: { searchParams?: Promise<{ lang?: "FR" | "EN" | "JP" }> }) {
  const lang = (await searchParams)?.lang || "EN";
  return <CardsCatalog cards={[]} initialExtensions={await fetchExtensionSummaries(lang)} initialSection="sets" initialLanguage={lang} />;
}
