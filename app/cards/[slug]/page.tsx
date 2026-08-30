import { notFound } from "next/navigation";
import CardDetail from "./CardDetail";
import { fetchCardBySlugOrPrintingSlug, fetchCardVariants } from "@/lib/strapi";

export default async function CardDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: "FR" | "EN" | "JP" }> }) {
  const { slug } = await params;
  const { lang = "FR" } = await searchParams;
  const card = await fetchCardBySlugOrPrintingSlug(slug);
  if (!card) notFound();
  const variants = await fetchCardVariants(card.displayCode || card.cardId);
  return <CardDetail card={card} variants={variants} initialLanguage={lang} />;
}
