import CardsCatalog from "@/app/cards/CardsCatalog";

export default async function CollectionPage({ searchParams }: { searchParams?: Promise<{ lang?: "FR" | "EN" | "JP" }> }) {
  const lang = (await searchParams)?.lang || "EN";
  return <CardsCatalog cards={[]} initialSection="collection" initialLanguage={lang} />;
}
