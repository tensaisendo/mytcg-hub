"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import TcgCard from "@/components/TcgCard";
import { getCardDisplay, getRelationLabel, getStrapiMediaUrl, type Card, type CardLanguage, type CatalogOptions } from "@/lib/strapi";

type View = "grid" | "list";
type Sort = "code" | "name" | "price-asc" | "price-desc";
type Section = "cards" | "sets" | "collection" | "wishlist";
export type SessionUser = { id: number; username: string; email: string };
type Quantities = { ownedQuantity: number; wantedQuantity: number };
type UserCards = Record<string, Quantities>;
type UserCardEntry = { printing: { documentId: string; cardId: string; printingId: string; language: CardLanguage }; ownedQuantity: number; wantedQuantity: number };

const optionLabels: Record<string, string> = {
  Red: "Rouge", Blue: "Bleu", Green: "Vert", Purple: "Violet", Black: "Noir", Yellow: "Jaune",
  Character: "Personnage", Event: "Événement", Stage: "Terrain", Leader: "Leader",
  C: "Commune", UC: "Peu commune", R: "Rare", SR: "Super rare", SEC: "Secrète",
};

function subscribeToWishlist(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("mytcg-wishlist", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("mytcg-wishlist", callback);
  };
}

function getWishlistSnapshot() {
  return window.localStorage.getItem("mytcg-wishlist") || "[]";
}

function unique(values: Array<string | undefined>) {
  const deduplicated = new Map<string, string>();
  for (const value of values) {
    if (value) deduplicated.set(value.trim().toLocaleLowerCase(), value.trim());
  }
  return [...deduplicated.values()].sort();
}

function groupVariants(cards: Card[]) {
  const groups = new Map<string, Card>();
  for (const card of cards) {
    const key = card.displayCode || card.cardId.split("_")[0];
    const current = groups.get(key);
    const isBase = !card.variant && !card.cardId.includes("_");
    const currentIsBase = current && !current.variant && !current.cardId.includes("_");
    if (!current || (isBase && !currentIsBase)) groups.set(key, card);
  }
  return [...groups.values()];
}

async function readUserCards(): Promise<UserCards> {
  const response = await fetch("/api/user-cards", { cache: "no-store" });
  if (!response.ok) return {};
  const payload = await response.json();
  return Object.fromEntries(
    payload.data.map((entry: UserCardEntry) => [
      entry.printing.documentId,
      { ownedQuantity: entry.ownedQuantity, wantedQuantity: entry.wantedQuantity },
    ]),
  );
}

export default function CardsCatalog({ cards, pageCount = 1, initialPage = 1, initialSection = "cards", initialSet = "", initialQuery = "", initialRarity = "", initialTreatment = "", initialColor = "", initialType = "", initialSort = "code", initialLanguage = "EN" }: { cards: Card[]; pageCount?: number; initialPage?: number; initialSection?: Section; initialSet?: string; initialQuery?: string; initialRarity?: string; initialTreatment?: string; initialColor?: string; initialType?: string; initialSort?: Sort; initialLanguage?: CardLanguage }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [setCode, setSetCode] = useState(initialSet);
  const [rarity, setRarity] = useState(initialRarity);
  const [treatment, setTreatment] = useState(initialTreatment);
  const [color, setColor] = useState(initialColor);
  const [type, setType] = useState(initialType);
  const [sort, setSort] = useState<Sort>(initialSort);
  const [view, setView] = useState<View>("grid");
  const [section, setSection] = useState<Section>(initialSection);
  const [language, setLanguage] = useState<CardLanguage>(initialLanguage);
  const [visible, setVisible] = useState(12);
  const [catalogCards, setCatalogCards] = useState(cards);
  const [catalogPageCount, setCatalogPageCount] = useState(pageCount);
  const [loadedPage, setLoadedPage] = useState(initialPage);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const firstFilterRender = useRef(true);
  const skipNextFilterRequest = useRef(false);
  const filterCache = useRef(new Map<string, { cards: Card[]; pageCount: number; page: number }>());
  const [catalogOptions, setCatalogOptions] = useState<CatalogOptions>({ sets: [], rarities: [], colors: [], types: [], treatments: [] });
  const [user, setUser] = useState<SessionUser | null>(null);
  const [userCards, setUserCards] = useState<UserCards>({});
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    setCatalogCards(cards);
    setCatalogPageCount(pageCount);
    setLoadedPage(initialPage);
    setVisible(12);
  }, [cards, initialPage, pageCount]);

  useEffect(() => {
    if (firstFilterRender.current) {
      firstFilterRender.current = false;
      return;
    }
    if (skipNextFilterRequest.current) {
      skipNextFilterRequest.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ page: "1", lang: language });
      if (query) params.set("query", query);
      if (setCode) params.set("set", setCode);
      if (rarity) params.set("rarity", rarity);
      if (treatment) params.set("treatment", treatment);
      if (color) params.set("color", color);
      if (type) params.set("type", type);
      if (sort !== "code") params.set("sort", sort);
      const url = new URL(window.location.href);
      ["query", "set", "rarity", "treatment", "color", "type", "sort"].forEach((key) => url.searchParams.delete(key));
      params.forEach((value, key) => { if (key !== "page" && key !== "lang") url.searchParams.set(key, value); });
      window.history.replaceState(null, "", url);
      const cacheKey = params.toString();
      const cached = filterCache.current.get(cacheKey);
      if (cached) {
        setCatalogCards(cached.cards);
        setCatalogPageCount(cached.pageCount);
        setLoadedPage(cached.page);
        setVisible(12);
        return;
      }
      try {
        const response = await fetch(`/api/catalog?${params}`, { cache: "force-cache", signal: controller.signal });
        if (!response.ok) throw new Error("Catalog filter request failed");
        const result = await response.json() as { cards: Card[]; pageCount: number; page: number };
        filterCache.current.set(cacheKey, result);
        setCatalogCards(result.cards);
        setCatalogPageCount(result.pageCount);
        setLoadedPage(result.page);
        setVisible(12);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Keep the current page visible if a filter request is interrupted.
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [color, language, query, rarity, treatment, setCode, sort, type]);

  useEffect(() => {
    let active = true;
    const storageKey = `mytcg-catalog-options-v2-${language}`;
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (stored) setCatalogOptions(JSON.parse(stored) as CatalogOptions);
    } catch {}
    const loadOptions = async () => {
      for (let attempt = 0; attempt < 6 && active; attempt += 1) {
        try {
          const response = await fetch(`/api/catalog/options?lang=${language}`, { cache: "no-store" });
          if (!response.ok) throw new Error("Catalog options request failed");
          const result = await response.json() as CatalogOptions;
          if (active) {
            setCatalogOptions(result);
            try { window.sessionStorage.setItem(storageKey, JSON.stringify(result)); } catch {}
          }
          return;
        } catch {
          if (attempt < 5) await new Promise((resolve) => window.setTimeout(resolve, 750 * (attempt + 1)));
        }
      }
    };
    void loadOptions();
    return () => { active = false; };
  }, [language]);

  const wishlistSnapshot = useSyncExternalStore(subscribeToWishlist, getWishlistSnapshot, () => "[]");
  const localWishlist = useMemo(() => {
    try { return new Set(JSON.parse(wishlistSnapshot) as string[]); }
    catch { return new Set<string>(); }
  }, [wishlistSnapshot]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then(async (payload) => {
        if (!active || !payload?.user) return;
        const entries = await readUserCards();
        if (active) {
          setUser(payload.user);
          setUserCards(entries);
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("mytcg-language", language);
      window.dispatchEvent(new Event("mytcg-language"));
    } catch {}
  }, [language]);

  function changeLanguage(nextLanguage: CardLanguage) {
    skipNextFilterRequest.current = true;
    setLanguage(nextLanguage);
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", nextLanguage);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const options = useMemo(() => ({
    treatments: unique((catalogOptions.treatments || []).map((relation) => relation.name)),
    sets: unique((catalogOptions.sets.length ? catalogOptions.sets : catalogCards.map((card) => card.set).filter((relation): relation is NonNullable<typeof relation> => Boolean(relation))).map((relation) => relation.code || relation.name)),
    rarities: unique((catalogOptions.rarities.length ? catalogOptions.rarities : catalogCards.map((card) => card.rarity).filter((relation): relation is NonNullable<typeof relation> => Boolean(relation))).map((relation) => relation.name)),
    colors: unique((catalogOptions.colors.length ? catalogOptions.colors : catalogCards.flatMap((card) => card.colors)).map((relation) => relation.name)),
    types: unique((catalogOptions.types.length ? catalogOptions.types : catalogCards.flatMap((card) => card.types)).map((relation) => relation.name)),
  }), [catalogCards, catalogOptions]);

  const displayLabels = useMemo(() => {
    const labels = { ...optionLabels };
    for (const card of catalogCards) {
      for (const relation of [
        card.set,
        getCardDisplay(card, language).set,
        card.rarity,
        card.treatment,
        ...card.colors,
        ...card.types,
      ]) {
        if (relation?.name) labels[relation.name] = getRelationLabel(relation, language);
      }
    }
    for (const relation of [...catalogOptions.sets, ...catalogOptions.rarities, ...catalogOptions.colors, ...catalogOptions.types, ...(catalogOptions.treatments || [])]) {
      if (relation.name) labels[relation.name] = getRelationLabel(relation, language);
      if (relation.code) labels[relation.code] = getRelationLabel(relation, language);
    }
    return labels;
  }, [catalogCards, catalogOptions, language]);

  const favorites = useMemo(() => user
    ? new Set(Object.entries(userCards).filter(([, value]) => value.wantedQuantity > 0).map(([printingId]) => printingId))
    : localWishlist,
  [localWishlist, user, userCards]);

  const ownedCardIds = useMemo(() => new Set(
    Object.entries(userCards).filter(([, value]) => value.ownedQuantity > 0).map(([printingId]) => printingId),
  ), [userCards]);

  const langOwnedCount = useMemo(() => {
    return catalogCards.filter((card) => {
      const printingId = getCardDisplay(card, language).printing?.documentId || "";
      return ownedCardIds.has(printingId);
    }).length;
  }, [catalogCards, language, ownedCardIds]);

  const langWishlistCount = useMemo(() => {
    return catalogCards.filter((card) => {
      const printingId = getCardDisplay(card, language).printing?.documentId || "";
      return favorites.has(printingId);
    }).length;
  }, [catalogCards, favorites, language]);

  function filterAndSortCards(source: Card[]) {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return source.filter((card) => {
      const display = getCardDisplay(card, language);
      if (language !== "EN" && !display.printing) return false;
      const matchesQuery = !normalizedQuery || display.name.toLocaleLowerCase().includes(normalizedQuery) || card.cardId.toLocaleLowerCase().includes(normalizedQuery);
      return matchesQuery &&
        (!setCode || display.set?.code === setCode) &&
        (!rarity || card.rarity?.name === rarity) &&
        (!treatment || card.treatment?.name === treatment) &&
        (!color || card.colors.some(({ name }) => name === color)) &&
        (!type || card.types.some(({ name }) => name === type)) &&
        (section !== "wishlist" || favorites.has(display.printing?.documentId || "")) &&
        (section !== "collection" || ownedCardIds.has(display.printing?.documentId || ""));
    }).sort((a, b) => {
      const displayA = getCardDisplay(a, language);
      const displayB = getCardDisplay(b, language);
      if (sort === "name") return displayA.name.localeCompare(displayB.name);
      if (sort === "price-asc") return (displayA.price ?? Number.MAX_VALUE) - (displayB.price ?? Number.MAX_VALUE);
      if (sort === "price-desc") return (displayB.price ?? -1) - (displayA.price ?? -1);
      return a.cardId.localeCompare(b.cardId, undefined, { numeric: true });
    });
  }

  const filtered = useMemo(() => filterAndSortCards(catalogCards), [catalogCards, color, favorites, language, ownedCardIds, query, rarity, treatment, section, setCode, sort, type]);

  const groupedFiltered = useMemo(() => groupVariants(filtered), [filtered]);

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setVisible(40);
  }

  async function loadMore() {
    if (loadingMore) return;
    setLoadMoreError("");
    const targetVisible = visible + 12;
    if (groupedFiltered.length >= targetVisible) {
      setVisible((count) => count + 12);
      return;
    }
    if (loadedPage >= catalogPageCount) return;

    setLoadingMore(true);
    try {
      let nextPageNumber = loadedPage + 1;
      let nextCatalogCards = catalogCards;
      let nextGrouped = groupedFiltered;

      // A Strapi page contains variants, so several pages may be needed to
      // produce one complete batch of 12 representative displayCodes.
      while (nextGrouped.length < targetVisible && nextPageNumber <= catalogPageCount) {
        const params = new URLSearchParams({ page: String(nextPageNumber), lang: language });
        if (query) params.set("query", query);
        if (setCode) params.set("set", setCode);
        if (rarity) params.set("rarity", rarity);
        if (treatment) params.set("treatment", treatment);
        if (color) params.set("color", color);
        if (type) params.set("type", type);
        if (sort !== "code") params.set("sort", sort);
        const response = await fetch(`/api/catalog?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Catalog page request failed");
        const nextPage = await response.json() as { cards: Card[]; page: number };
        const existing = new Set(nextCatalogCards.map((card) => card.documentId));
        nextCatalogCards = [...nextCatalogCards, ...nextPage.cards.filter((card) => !existing.has(card.documentId))];
        nextGrouped = groupVariants(filterAndSortCards(nextCatalogCards));
        nextPageNumber = (nextPage.page || nextPageNumber) + 1;
      }

      setCatalogCards(nextCatalogCards);
      setLoadedPage(Math.min(nextPageNumber - 1, catalogPageCount));
      setVisible(Math.min(targetVisible, nextGrouped.length));
    } catch {
      setLoadMoreError("Impossible de charger les cartes suivantes. Réessaie.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function persistCard(card: Card, quantities: Quantities) {
    const display = getCardDisplay(card, language);
    const printingId = display.printing?.documentId;
    if (!printingId) return;
    const previous = userCards[printingId] || { ownedQuantity: 0, wantedQuantity: 0 };
    setUserCards((current) => ({ ...current, [printingId]: quantities }));
    const response = await fetch(`/api/user-cards/${printingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: quantities }),
    });
    if (!response.ok) {
      setUserCards((current) => ({ ...current, [printingId]: previous }));
      if (response.status === 401 || response.status === 403) setAuthOpen(true);
    }
  }

  function toggleFavorite(card: Card) {
    const display = getCardDisplay(card, language);
    const printingId = display.printing?.documentId;
    if (!printingId) return;
    if (user) {
      const current = userCards[printingId] || { ownedQuantity: 0, wantedQuantity: 0 };
      void persistCard(card, { ...current, wantedQuantity: current.wantedQuantity > 0 ? 0 : 1 });
      return;
    }
    const next = new Set(localWishlist);
    if (next.has(printingId)) next.delete(printingId); else next.add(printingId);
    window.localStorage.setItem("mytcg-wishlist", JSON.stringify([...next]));
    window.dispatchEvent(new Event("mytcg-wishlist"));
  }

  function changeOwned(card: Card, quantity: number) {
    if (!user) { setAuthOpen(true); return; }
    const display = getCardDisplay(card, language);
    const printingId = display.printing?.documentId;
    if (!printingId) return;
    const current = userCards[printingId] || { ownedQuantity: 0, wantedQuantity: 0 };
    void persistCard(card, { ...current, ownedQuantity: Math.max(0, Math.min(999, quantity)) });
  }

  async function handleAuthenticated(authenticatedUser: SessionUser) {
    setUser(authenticatedUser);
    let entries = await readUserCards();
    const byPrintingId = new Map(catalogCards.map((card) => [getCardDisplay(card, language).printing?.documentId || "", card]));
    for (const printingId of localWishlist) {
      const card = byPrintingId.get(printingId);
      if (!card || entries[printingId]?.wantedQuantity) continue;
      const quantities = { ownedQuantity: entries[printingId]?.ownedQuantity || 0, wantedQuantity: 1 };
      await fetch(`/api/user-cards/${printingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: quantities }),
      });
    }
    entries = await readUserCards();
    setUserCards(entries);
    window.localStorage.removeItem("mytcg-wishlist");
    window.dispatchEvent(new Event("mytcg-wishlist"));
    setAuthOpen(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setUserCards({});
    setSection("cards");
    setAuthOpen(false);
  }

  const sectionTitle = section === "wishlist" ? "Liste d’envies" : section === "collection" ? "Ma collection" : "Cartes";
  const sectionSubtitle = section === "wishlist"
    ? `Langue active: ${language}`
    : section === "collection"
      ? `Langue active: ${language}`
      : `Affichage en ${language}`;

  return (
    <main className="catalog-shell">
      <header className="site-header">
        <Link className="brand" href="/cards" aria-label="Cartes MYTCG Hub">
          <span className="brand__mark">M</span><span>MYTCG</span><strong>HUB</strong>
        </Link>
        <nav className="main-nav" aria-label="Navigation principale">
          <Link className={section === "cards" ? "is-active" : ""} href="/cards">Cartes</Link>
          <Link className={section === "sets" ? "is-active" : ""} href="/sets">Extensions</Link>
          <Link className={section === "collection" ? "is-active" : ""} href="/collection">Collection{langOwnedCount > 0 ? <b>{langOwnedCount}</b> : null}</Link>
          <Link className={section === "wishlist" ? "is-active" : ""} href="/wishlist">Liste d’envies{langWishlistCount > 0 ? <b>{langWishlistCount}</b> : null}</Link>
          <Link href="/decks">Decks</Link>
        </nav>
        <div className="language-switch" aria-label="Langue du site">
          {(["FR", "EN", "JP"] as CardLanguage[]).map((item) => (
            <button className={item === language ? "is-active" : ""} key={item} type="button" onClick={() => changeLanguage(item)}>{item}</button>
          ))}
        </div>
        <label className="header-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} placeholder="Rechercher une carte..." aria-label="Rechercher une carte" /></label>
        <button className="profile-button" type="button" aria-label="Ouvrir le profil" onClick={() => setAuthOpen(true)}>{user ? user.username.slice(0, 2).toUpperCase() : "OP"}</button>
      </header>

      <section className="catalog-content">
        {section === "sets" ? (
          <ExtensionsView cards={cards} language={language} ownedCardIds={ownedCardIds} authenticated={Boolean(user)} onLogin={() => setAuthOpen(true)} />
        ) : (
        <>
        <div className="catalog-title"><div><h1>{sectionTitle}</h1><p>{sectionSubtitle}</p></div><p><strong>{groupedFiltered.length}</strong> cartes uniques sur {catalogCards.length} chargées</p></div>
        <div className="filter-bar">
          <label className="filter-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} placeholder="Nom ou code de carte" aria-label="Rechercher par nom ou code de carte" /></label>
          <Filter label="Extension" value={setCode} options={options.sets} optionLabels={displayLabels} onChange={(value) => updateFilter(setSetCode, value)} />
          <Filter label="Rareté" value={rarity} options={options.rarities} optionLabels={displayLabels} onChange={(value) => updateFilter(setRarity, value)} />
          <Filter label="Traitement" value={treatment} options={options.treatments} optionLabels={displayLabels} onChange={(value) => updateFilter(setTreatment, value)} />
          <Filter label="Couleur" value={color} options={options.colors} optionLabels={displayLabels} onChange={(value) => updateFilter(setColor, value)} />
          <Filter label="Type" value={type} options={options.types} optionLabels={displayLabels} onChange={(value) => updateFilter(setType, value)} />
          <label className="select-control sort-control"><span>Trier</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="code">Code de carte</option><option value="name">Nom</option><option value="price-asc">Prix croissant</option><option value="price-desc">Prix décroissant</option></select></label>
          <div className="view-toggle" aria-label="Mode d’affichage"><button className={view === "grid" ? "is-active" : ""} onClick={() => setView("grid")} type="button" title="Vue grille" aria-label="Vue grille">▦</button><button className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} type="button" title="Vue liste" aria-label="Vue liste">☷</button></div>
        </div>

        {filtered.length ? <>
          <div className={`cards-grid cards-grid--${view}`}>{groupedFiltered.slice(0, visible).map((card) => {
            const display = getCardDisplay(card, language);
            const printingId = display.printing?.documentId || "";
            return <TcgCard key={printingId || card.documentId} card={card} view={view} language={language} favorite={favorites.has(printingId)} ownedQuantity={userCards[printingId]?.ownedQuantity || 0} onToggleFavorite={() => toggleFavorite(card)} onOwnedChange={(quantity) => changeOwned(card, quantity)} priority={filtered.indexOf(card) < 12} />;
          })}</div>
          {(visible < groupedFiltered.length || loadedPage < catalogPageCount) && <button className="load-more" type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Chargement..." : "Afficher plus"} {!loadingMore && <span>12</span>}</button>}
          {loadMoreError && <p className="load-more-error" role="alert">{loadMoreError}</p>}
        </> : <div className="empty-state"><p>{section === "wishlist" ? "Ta liste d’envies est vide." : section === "collection" ? "Ta collection est vide." : "Aucune carte ne correspond à ces filtres."}</p><button type="button" onClick={() => { setQuery(""); setSetCode(""); setRarity(""); setTreatment(""); setColor(""); setType(""); setSection("cards"); }}>Retour aux cartes</button></div>}
        </>
        )}
      </section>

      {authOpen && <AuthDialog user={user} onClose={() => setAuthOpen(false)} onAuthenticated={handleAuthenticated} onLogout={logout} />}
    </main>
  );
}

function ExtensionsView({ cards, language, ownedCardIds, authenticated, onLogin }: { cards: Card[]; language: CardLanguage; ownedCardIds: Set<string>; authenticated: boolean; onLogin: () => void }) {
  const extensions = useMemo(() => {
    const grouped = new Map<string, Card[]>();
    for (const card of cards) {
      const display = getCardDisplay(card, language);
      if (language !== "EN" && !display.printing) continue;
      const displaySet = display.set;
      const name = displaySet?.name || "Sans extension";
      grouped.set(name, [...(grouped.get(name) || []), card]);
    }
    return [...grouped.entries()].map(([name, extensionCards]) => ({
      name,
      displayName: getRelationLabel(getCardDisplay(extensionCards[0], language).set, language) || name,
      code: getCardDisplay(extensionCards[0], language).set?.code || name.split(" ")[0],
      cards: extensionCards,
      owned: extensionCards.filter((card) => ownedCardIds.has(getCardDisplay(card, language).printing?.documentId || "")).length,
      image: getCardDisplay(extensionCards.find((card) => getCardDisplay(card, language).image?.url) || extensionCards[0], language).image?.url,
    })).sort((a, b) => b.code.localeCompare(a.code, undefined, { numeric: true }));
  }, [cards, language, ownedCardIds]);

  return (
    <>
      <div className="catalog-title">
        <div><h1>Extensions</h1></div>
        <p><strong>{extensions.length}</strong> extensions</p>
      </div>
      <div className="extensions-grid">
        {extensions.map((extension) => {
          const progress = extension.cards.length
            ? Math.round((extension.owned / extension.cards.length) * 100)
            : 0;
          return (
            <article className="extension-card" key={extension.name}>
              <div className="extension-card__visual">
                {extension.image && (
                  <img
                    src={getStrapiMediaUrl(extension.image)}
                    alt=""
                    className="extension-card__image"
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <span>{extension.code}</span>
              </div>
              <div className="extension-card__body">
                <h2>{extension.displayName.replace(/^\S+\s+-\s+/, "")}</h2>
                <p>{extension.cards.length} cartes</p>
                <div className="progress-row">
                  <span>{authenticated ? `${extension.owned} possédées` : "Progression"}</span>
                  <strong>{progress}%</strong>
                </div>
                <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                <div className="extension-card__actions">
                  <Link href={`/cards?set=${encodeURIComponent(extension.name)}`}>Voir les cartes</Link>
                  {!authenticated && <button type="button" onClick={onLogin}>Se connecter</button>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function Filter({ label, value, options, optionLabels, onChange }: { label: string; value: string; options: string[]; optionLabels: Record<string, string>; onChange: (value: string) => void }) {
  return <label className="select-control"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Tous</option>{options.map((option) => <option value={option} key={option}>{optionLabels[option] || option}</option>)}</select></label>;
}

export function AuthDialog({ user, onClose, onAuthenticated, onLogout }: { user: SessionUser | null; onClose: () => void; onAuthenticated: (user: SessionUser) => Promise<void>; onLogout: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = mode === "login"
      ? { identifier: values.email, password: values.password }
      : mode === "register"
        ? { username: values.username, email: values.email, password: values.password }
        : mode === "forgot"
          ? { email: values.email }
          : { code: values.code, password: values.password, passwordConfirmation: values.passwordConfirmation };
    const endpoint = mode === "forgot" ? "forgot-password" : mode === "reset" ? "reset-password" : mode;
    const response = await fetch(`/api/auth/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error?.message || "Impossible de continuer."); setBusy(false); return; }
    if (mode === "forgot") { setSuccess("Si l’adresse existe, un lien de réinitialisation a été envoyé."); setBusy(false); return; }
    if (mode === "reset") { setSuccess("Mot de passe réinitialisé. Tu peux te connecter."); setMode("login"); setBusy(false); return; }
    await onAuthenticated(payload.user); setBusy(false);
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" type="button" onClick={onClose} aria-label="Fermer">×</button>{user ? <><p className="auth-kicker">Compte MYTCG</p><h2 id="auth-title">{user.username}</h2><p className="auth-email">{user.email}</p><button className="auth-submit is-secondary" type="button" onClick={() => void onLogout()}>Se déconnecter</button></> : <><p className="auth-kicker">Synchronise ta collection</p><h2 id="auth-title">{mode === "login" ? "Connexion" : mode === "register" ? "Créer un compte" : mode === "forgot" ? "Mot de passe oublié" : "Réinitialiser le mot de passe"}</h2><div className="auth-tabs"><button className={mode === "login" ? "is-active" : ""} type="button" onClick={() => setMode("login")}>Connexion</button><button className={mode === "register" ? "is-active" : ""} type="button" onClick={() => setMode("register")}>Inscription</button><button className={mode === "forgot" ? "is-active" : ""} type="button" onClick={() => setMode("forgot")}>Reset</button><button className={mode === "reset" ? "is-active" : ""} type="button" onClick={() => setMode("reset")}>Nouveau mdp</button></div><form onSubmit={submit}>{mode === "register" && <label>Nom d’utilisateur<input name="username" minLength={3} required autoComplete="username" /></label>}{(mode === "login" || mode === "register" || mode === "forgot") && <label>Adresse e-mail<input name="email" type="email" required autoComplete="email" /></label>}{mode === "reset" && <label>Code de réinitialisation<input name="code" required autoComplete="one-time-code" /></label>}{mode !== "forgot" && mode !== "reset" && <label>Mot de passe<input name="password" type="password" minLength={8} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}{mode === "reset" && <><label>Nouveau mot de passe<input name="password" type="password" required autoComplete="new-password" /></label><label>Confirmation<input name="passwordConfirmation" type="password" required autoComplete="new-password" /></label></>}{error && <p className="auth-error">{error}</p>}{success && <p className="auth-success">{success}</p>}{mode === "login" && <button className="auth-link" type="button" onClick={() => setMode("forgot")}>Mot de passe oublié ?</button>}<button className="auth-submit" disabled={busy} type="submit">{busy ? "Patiente un instant..." : mode === "login" ? "Se connecter" : mode === "register" ? "Créer mon compte" : mode === "forgot" ? "Envoyer le lien" : "Réinitialiser"}</button></form></>}</section></div>;
}
