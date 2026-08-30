export default function LoadingCards() {
  return (
    <main className="catalog-shell">
      <header className="site-header">
        <div className="brand" aria-hidden="true">
          <span className="brand__mark">M</span>
          <span>MYTCG</span>
          <strong>HUB</strong>
        </div>
        <div className="main-nav" aria-hidden="true" />
        <div className="language-switch" aria-hidden="true" />
        <div className="header-search" aria-hidden="true" />
        <div className="profile-button" aria-hidden="true" />
      </header>

      <section className="catalog-content">
        <div className="catalog-title">
          <div>
            <p className="eyebrow">Affichage</p>
            <h1>Cartes</h1>
          </div>
          <p><strong>0</strong> carte sur 0</p>
        </div>

        <div className="filter-bar">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="select-control is-loading" key={index}>
              <span />
            </div>
          ))}
        </div>

        <div className="cards-grid">
          {Array.from({ length: 12 }).map((_, index) => (
            <article className="tcg-card tcg-card--grid is-loading" key={index}>
              <div className="tcg-card__visual">
                <div className="tcg-card__skeleton" />
              </div>
              <div className="tcg-card__meta">
                <div className="loading-line loading-line--sm" />
                <div className="loading-line loading-line--lg" />
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
