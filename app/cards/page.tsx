import TcgCard from "@/components/TcgCard";
import { fetchCards } from "@/lib/strapi";

export default async function CardsPage() {
  const cards = await fetchCards();

  return (
    <div style={{ padding: 24 }}>
      <h1>Cards</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, 240px)",
          gap: 24,
        }}
      >
        {cards.map((c) => (
          <TcgCard key={c.id} card={c} />
        ))}
      </div>
    </div>
  );
}