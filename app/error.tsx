"use client";

import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="catalog-shell">
      <section className="empty-state" style={{ minHeight: "100vh" }}>
        <p>Une erreur est survenue.</p>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error.message}</pre>
        <div style={{ display: "flex", gap: "12px" }}>
          <button type="button" onClick={reset}>Réessayer</button>
          <Link href="/cards">Retour au catalogue</Link>
        </div>
      </section>
    </main>
  );
}
