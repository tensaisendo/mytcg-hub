import DeckBuilder from "./DeckBuilder";
import { fetchCards } from "@/lib/strapi";

export default async function DecksPage() {
  return <DeckBuilder cards={await fetchCards()} />;
}
