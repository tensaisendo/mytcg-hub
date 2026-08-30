import Link from "next/link";

export default function NotFound() {
  return (
    <main className="catalog-shell">
      <section className="empty-state" style={{ minHeight: "100vh" }}>
        <p>Cette page est introuvable.</p>
        <Link href="/cards">Retour au catalogue</Link>
      </section>
    </main>
  );
}
