"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { AuthDialog } from "@/components/AuthDialog";
export { AuthDialog } from "@/components/AuthDialog";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import TcgCard from "@/components/TcgCard";
import GameIdentity from "@/components/GameIdentity";
import Image from "next/image";
import WantedProfileButton from "@/components/WantedProfileButton";
import { getExtensionLabel } from "@/lib/extension-label";
import { getCardDisplay, getRelationLabel, getStrapiImageUrl, getTreatmentLabel, type Card, type CardLanguage, type CatalogOptions, type ExtensionSummary } from "@/lib/strapi";

type View = "grid" | "list";
type Sort = "code" | "name" | "price-asc" | "price-desc";
type Section = "cards" | "sets" | "collection" | "wishlist";
export type SessionUser = { id: number; username: string; email: string; berries: number; avatar: { url: string; alternativeText?: string | null } | null; isAdmin: boolean };
type Quantities = { ownedQuantity: number; wantedQuantity: number };
type UserCards = Record<string, Quantities & { language: CardLanguage }>;
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

function groupVariants(cards: Card[], preserveSortedRepresentative = false) {
  const groups = new Map<string, Card>();
  for (const card of cards) {
    const key = card.displayCode || card.cardId.split("_")[0];
    const current = groups.get(key);
    const isBase = !card.variant && !card.cardId.includes("_");
    const currentIsBase = current && !current.variant && !current.cardId.includes("_");
    if (!current || (!preserveSortedRepresentative && isBase && !currentIsBase)) groups.set(key, card);
  }
  return [...groups.values()];
}

async function readUserCards(): Promise<UserCards> {
  const response = await fetch("/api/user-cards", { cache: "no-store" });
  if (!response.ok) throw new Error("Collection request failed");
  const payload = await response.json();
  return Object.fromEntries(
    payload.data.map((entry: UserCardEntry) => [
      entry.printing.documentId,
      { ownedQuantity: entry.ownedQuantity, wantedQuantity: entry.wantedQuantity, language: entry.printing.language },
    ]),
  );
}

export default function CardsCatalog({ cards, pageCount = 1, initialPage = 1, initialSection = "cards", initialExtensions = [], initialSet = "", initialQuery = "", initialRarity = "", initialTreatment = "", initialDistribution = "", initialColor = "", initialType = "", initialSort = "code", initialLanguage = "EN" }: { cards: Card[]; pageCount?: number; initialPage?: number; initialSection?: Section; initialExtensions?: ExtensionSummary[]; initialSet?: string; initialQuery?: string; initialRarity?: string; initialTreatment?: string; initialDistribution?: string; initialColor?: string; initialType?: string; initialSort?: Sort; initialLanguage?: CardLanguage }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [setCode, setSetCode] = useState(initialSet);
  const [rarity, setRarity] = useState(initialRarity);
  const [treatment, setTreatment] = useState(initialTreatment);
  const [distribution, setDistribution] = useState(initialDistribution);
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
  const [catalogOptions, setCatalogOptions] = useState<CatalogOptions>({ sets: [], rarities: [], colors: [], types: [], treatments: [], distributions: [] });
  const [user, setUser] = useState<SessionUser | null>(null);
  const [userCards, setUserCards] = useState<UserCards>({});
  const [authOpen, setAuthOpen] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [collectionLoading, setCollectionLoading] = useState(initialSection === "collection");
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [collectionRevision, setCollectionRevision] = useState(0);
  const collectionRequest = useRef(0);

  useEffect(() => {
    if (section !== "collection" || !sessionLoaded) return;
    collectionRequest.current += 1;
    setLoadingMore(false);
    if (!user) {
      setCatalogCards([]);
      setCollectionLoading(false);
      return;
    }
    const controller = new AbortController();
    setCollectionLoading(true);
    setLoadMoreError("");
    const params = new URLSearchParams({ page: "1", lang: language, query, set: setCode, rarity, treatment, distribution, color, type, sort });
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/collection?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Collection request failed");
        const result = await response.json();
        if (controller.signal.aborted) return;
        setCatalogCards(result.cards);
        setCatalogPageCount(result.pageCount);
        setCollectionTotal(result.total);
        setLoadedPage(1);
        setVisible(12);
      } catch {
        if (!controller.signal.aborted) setLoadMoreError("Impossible de charger la collection. Réessaie en actualisant la page.");
      } finally {
        if (!controller.signal.aborted) setCollectionLoading(false);
      }
    }, query ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [section, sessionLoaded, user, language, query, setCode, rarity, treatment, distribution, color, type, sort, collectionRevision]);

  useEffect(() => {
    if (section === "collection") return;
    setCatalogCards(cards);
    setCatalogPageCount(pageCount);
    setLoadedPage(initialPage);
    setVisible(12);
  }, [cards, initialPage, pageCount, section]);

  useEffect(() => {
    if (section !== "cards") return;
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
      if (distribution) params.set("distribution", distribution);
      if (color) params.set("color", color);
      if (type) params.set("type", type);
      if (sort !== "code") params.set("sort", sort);
      const url = new URL(window.location.href);
      ["query", "set", "rarity", "treatment", "distribution", "color", "type", "sort"].forEach((key) => url.searchParams.delete(key));
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
        const response = await fetch(`/api/catalog?${params}`, { cache: "no-store", signal: controller.signal });
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
  }, [color, distribution, language, query, rarity, treatment, section, setCode, sort, type]);

  useEffect(() => {
    let active = true;
    const storageKey = `mytcg-catalog-options-v3-${language}`;
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
        setUser(payload.user);
        const entries = await readUserCards();
        if (active) {
          setUser(payload.user);
          setUserCards(entries);
        }
      }).catch(() => {
        if (active) setAccountMessage("Impossible de charger ta collection. Réessaie en actualisant la page.");
      }).finally(() => { if (active) setSessionLoaded(true); });
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
    distributions: unique(catalogOptions.distributions || []),
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
        getCardDisplay(card, language).treatment,
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
    for (const treatment of [...(catalogOptions.treatments || []), ...catalogCards.map((card) => getCardDisplay(card, language).treatment)]) {
      if (treatment?.name) labels[treatment.name] = getTreatmentLabel(treatment);
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

  const langOwnedCount = useMemo(() => Object.values(userCards).filter(
    (entry) => entry.language === language && entry.ownedQuantity > 0,
  ).length, [language, userCards]);

  const langWishlistCount = useMemo(() => {
    if (user) return Object.values(userCards).filter(
      (entry) => entry.language === language && entry.wantedQuantity > 0,
    ).length;
    return catalogCards.filter((card) => {
      const printingId = getCardDisplay(card, language).printing?.documentId || "";
      return favorites.has(printingId);
    }).length;
  }, [catalogCards, favorites, language, user, userCards]);

  function filterAndSortCards(source: Card[]) {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return source.filter((card) => {
      const display = getCardDisplay(card, language);
      if (language !== "EN" && !display.printing) return false;
      const matchesQuery = !normalizedQuery || display.name.toLocaleLowerCase().includes(normalizedQuery) || display.cardId.toLocaleLowerCase().includes(normalizedQuery);
      return matchesQuery &&
        (!setCode || display.set?.code === setCode) &&
        (!rarity || card.rarity?.name === rarity) &&
        (!treatment || display.treatment?.name === treatment) &&
        (!distribution || display.distribution === distribution) &&
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

  const filtered = useMemo(() => filterAndSortCards(catalogCards), [catalogCards, color, distribution, favorites, language, ownedCardIds, query, rarity, treatment, section, setCode, sort, type]);

  const groupedFiltered = useMemo(() => section === "collection" ? filtered : groupVariants(filtered, sort === "price-asc" || sort === "price-desc"), [filtered, section, sort]);

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setVisible(40);
  }

  async function loadMore() {
    if (loadingMore) return;
    setLoadMoreError("");
    if (section === "collection") {
      const request = collectionRequest.current;
      setLoadingMore(true);
      try {
        const params = new URLSearchParams({ page: String(loadedPage + 1), lang: language, query, set: setCode, rarity, treatment, distribution, color, type, sort });
        const response = await fetch(`/api/collection?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Collection request failed");
        const result = await response.json();
        if (request !== collectionRequest.current) return;
        setCatalogCards((current) => {
          const ids = new Set(current.map((card) => card.documentId));
          return [...current, ...result.cards.filter((card: Card) => !ids.has(card.documentId))];
        });
        setLoadedPage(result.page);
        setCatalogPageCount(result.pageCount);
        setCollectionTotal(result.total);
        setVisible((count) => count + 12);
      } catch {
        if (request === collectionRequest.current) setLoadMoreError("Impossible de charger les cartes suivantes. Réessaie.");
      } finally { if (request === collectionRequest.current) setLoadingMore(false); }
      return;
    }
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
        if (distribution) params.set("distribution", distribution);
        if (color) params.set("color", color);
        if (type) params.set("type", type);
        if (sort !== "code") params.set("sort", sort);
        const response = await fetch(`/api/catalog?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Catalog page request failed");
        const nextPage = await response.json() as { cards: Card[]; page: number };
        const existing = new Set(nextCatalogCards.map((card) => card.documentId));
        nextCatalogCards = [...nextCatalogCards, ...nextPage.cards.filter((card) => !existing.has(card.documentId))];
        nextGrouped = groupVariants(filterAndSortCards(nextCatalogCards), sort === "price-asc" || sort === "price-desc");
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
    const previous = userCards[printingId] || { ownedQuantity: 0, wantedQuantity: 0, language };
    setUserCards((current) => ({ ...current, [printingId]: { ...quantities, language } }));
    try {
      const response = await fetch(`/api/user-cards/${printingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: quantities }),
      });
      if (response.status === 401 || response.status === 403) setAuthOpen(true);
      if (!response.ok) throw new Error("Collection update failed");
      const payload = await response.json();
      if (typeof payload.meta?.berries === "number") setUser((current) => current ? { ...current, berries: payload.meta.berries } : current);
      setAccountMessage("");
      if (section === "collection" && (previous.ownedQuantity > 0) !== (quantities.ownedQuantity > 0)) setCollectionRevision((value) => value + 1);
    } catch {
      setUserCards((current) => ({ ...current, [printingId]: previous }));
      setAccountMessage("La modification n’a pas été enregistrée. Réessaie.");
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
    setAuthOpen(false);
    setAccountMessage("Connecté en tant que " + authenticatedUser.username + ".");
    try {
      await syncCollection();
    } catch {
      setAccountMessage("Tu es connecté, mais la collection n’a pas pu être synchronisée. Tes favoris locaux sont conservés.");
    }
  }

  async function syncCollection() {
    let entries = await readUserCards();
    setUserCards(entries);
    const remaining = new Set(localWishlist);
    const byPrintingId = new Map(catalogCards.map((card) => [getCardDisplay(card, language).printing?.documentId || "", card]));
    for (const printingId of localWishlist) {
      const card = byPrintingId.get(printingId);
      if (!card) continue;
      if (entries[printingId]?.wantedQuantity) { remaining.delete(printingId); continue; }
      const quantities = { ownedQuantity: entries[printingId]?.ownedQuantity || 0, wantedQuantity: 1 };
      const response = await fetch(`/api/user-cards/${printingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: quantities }),
      });
      if (!response.ok) throw new Error("Wishlist synchronization failed");
      entries = { ...entries, [printingId]: { ...quantities, language } };
      remaining.delete(printingId);
    }
    setUserCards(entries);
    window.localStorage.setItem("mytcg-wishlist", JSON.stringify([...remaining]));
    window.dispatchEvent(new Event("mytcg-wishlist"));
    setAuthOpen(false);
  }

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("Logout failed");
    setAccountMessage("");
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
        <Link className="brand" href={`/cards?lang=${language}`} aria-label="Cartes MYTCG Hub">
          <span className="brand__mark">M</span><span>MYTCG</span><strong>HUB</strong>
        </Link>
        <GameIdentity />
        <nav className="main-nav" aria-label="Navigation principale">
          <Link className={section === "cards" ? "is-active" : ""} href={`/cards?lang=${language}`}>Cartes</Link>
          <Link className={section === "sets" ? "is-active" : ""} href={`/sets?lang=${language}`}>Extensions</Link>
          <Link className={section === "collection" ? "is-active" : ""} href={`/collection?lang=${language}`}>Collection{langOwnedCount > 0 ? <b>{langOwnedCount}</b> : null}</Link>
          <Link className={section === "wishlist" ? "is-active" : ""} href={`/wishlist?lang=${language}`}>Liste d’envies{langWishlistCount > 0 ? <b>{langWishlistCount}</b> : null}</Link>
          <Link href="/decks">Decks</Link>
        </nav>
        <div className="language-switch" aria-label="Langue du site">
          {(["FR", "EN", "JP"] as CardLanguage[]).map((item) => (
            <button className={item === language ? "is-active" : ""} key={item} type="button" onClick={() => changeLanguage(item)}>{item}</button>
          ))}
        </div>
        <label className="header-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} placeholder="Rechercher une carte..." aria-label="Rechercher une carte" /></label>
        <WantedProfileButton user={user} onClick={() => setAuthOpen(true)} />
      </header>

      <section className="catalog-content">
        {accountMessage && <p className="account-status" role="status">{accountMessage}</p>}
        {section === "sets" ? (
          <ExtensionsView extensions={initialExtensions} language={language} ownedCardIds={ownedCardIds} authenticated={Boolean(user)} onLogin={() => setAuthOpen(true)} />
        ) : (
        <>
        <div className="catalog-title"><div><h1>{sectionTitle}</h1><p>{sectionSubtitle}</p></div><p><strong>{groupedFiltered.length}</strong> cartes {section === "collection" ? `sur ${collectionTotal}` : `uniques sur ${catalogCards.length} chargées`}</p></div>
        <div className="filter-bar">
          <label className="filter-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} placeholder="Nom ou code de carte" aria-label="Rechercher par nom ou code de carte" /></label>
          <Filter label="Extension" value={setCode} options={options.sets} optionLabels={displayLabels} onChange={(value) => updateFilter(setSetCode, value)} />
          <Filter label="Rareté" value={rarity} options={options.rarities} optionLabels={displayLabels} onChange={(value) => updateFilter(setRarity, value)} />
          <Filter label="Traitement" value={treatment} options={options.treatments} optionLabels={displayLabels} onChange={(value) => updateFilter(setTreatment, value)} />
          <Filter label="Distribution" value={distribution} options={options.distributions} optionLabels={displayLabels} onChange={(value) => updateFilter(setDistribution, value)} />
          <Filter label="Couleur" value={color} options={options.colors} optionLabels={displayLabels} onChange={(value) => updateFilter(setColor, value)} />
          <Filter label="Type" value={type} options={options.types} optionLabels={displayLabels} onChange={(value) => updateFilter(setType, value)} />
          <label className="select-control sort-control"><span>Trier</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="code">Code de carte</option><option value="name">Nom</option><option value="price-asc">Prix croissant</option><option value="price-desc">Prix décroissant</option></select></label>
          <div className="view-toggle" aria-label="Mode d’affichage"><button className={view === "grid" ? "is-active" : ""} onClick={() => setView("grid")} type="button" title="Vue grille" aria-label="Vue grille">▦</button><button className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} type="button" title="Vue liste" aria-label="Vue liste">☷</button></div>
        </div>

        {section === "collection" && collectionLoading ? <p role="status">Chargement de ta collection...</p> : section === "collection" && !user ? <div className="empty-state"><Image src="/assets/one-piece/card-backs.webp" alt="" width={1072} height={512} /><p>Connecte-toi pour retrouver ta collection.</p><button type="button" onClick={() => setAuthOpen(true)}>Se connecter</button></div> : section === "collection" && loadMoreError && !filtered.length ? null : filtered.length ? <>
          <div className={`cards-grid cards-grid--${view}`}>{groupedFiltered.slice(0, visible).map((card) => {
            const display = getCardDisplay(card, language);
            const printingId = display.printing?.documentId || "";
            return <TcgCard key={printingId || card.documentId} card={card} view={view} language={language} favorite={favorites.has(printingId)} ownedQuantity={userCards[printingId]?.ownedQuantity || 0} onToggleFavorite={() => toggleFavorite(card)} onOwnedChange={(quantity) => changeOwned(card, quantity)} priority={filtered.indexOf(card) < 12} />;
          })}</div>
          {(visible < groupedFiltered.length || loadedPage < catalogPageCount) && <button className="load-more" type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Chargement..." : "Afficher plus"} {!loadingMore && <span>12</span>}</button>}
        </> : <div className="empty-state"><Image src="/assets/one-piece/card-backs.webp" alt="" width={1072} height={512} /><p>{section === "wishlist" ? "Ta liste d’envies est vide." : section === "collection" ? "Aucune carte de ta collection ne correspond à cette langue et à ces filtres." : "Aucune carte ne correspond à ces filtres."}</p><button type="button" onClick={() => router.push(`/cards?lang=${language}`)}>Retour aux cartes</button></div>}
        {loadMoreError && <p className="load-more-error" role="alert">{loadMoreError}</p>}
        </>
        )}
      </section>

      {authOpen && <AuthDialog user={user} onClose={() => setAuthOpen(false)} onAuthenticated={handleAuthenticated} onLogout={logout} />}
    </main>
  );
}

function ExtensionsView({ extensions: summaries, language, ownedCardIds, authenticated, onLogin }: { extensions: ExtensionSummary[]; language: CardLanguage; ownedCardIds: Set<string>; authenticated: boolean; onLogin: () => void }) {
  const extensionFamily = (code: string) => {
    const normalized = code.toUpperCase();
    if (normalized.startsWith("ST")) return { key: "st", label: "Starter Deck" };
    if (normalized.startsWith("EB")) return { key: "eb", label: "Extra Booster" };
    if (normalized.startsWith("PRB")) return { key: "prb", label: "Premium Booster" };
    if (normalized.includes("PROMO")) return { key: "promo", label: "Promotion" };
    return { key: "op", label: "Booster Pack" };
  };
  const extensions = useMemo(() => summaries.map((extension) => ({
    ...extension,
    displayName: getExtensionLabel(extension, language),
    owned: extension.printingIds.filter((id) => ownedCardIds.has(id)).length,
  })).sort((a, b) => b.code.localeCompare(a.code, undefined, { numeric: true })), [language, ownedCardIds, summaries]);

  const extensionTheme = (code: string, name: string) => {
    const normalizedCode = code.toUpperCase().replaceAll("-", "");
    const normalizedName = name.toUpperCase();
    const palettes: Record<string, [string, string]> = {
      OP01: ["#d12b37", "#5b141b"], OP02: ["#4489ba", "#183853"],
      OP03: ["#e7b42f", "#6b4c0d"], OP04: ["#9b69cb", "#43255e"],
      OP05: ["#d95491", "#632140"], OP06: ["#496fb6", "#1d315c"],
      OP07: ["#43b8cc", "#185563"], OP08: ["#e07c38", "#682f15"],
      OP09: ["#d7a83f", "#653f16"], OP10: ["#b82d47", "#591525"],
      OP11: ["#51a568", "#1d4b2b"], OP12: ["#4b8ac1", "#1d4160"],
      OP13: ["#db4b45", "#67201e"], OP14: ["#2da5c7", "#125068"],
      OP15: ["#e5ae36", "#684b10"], OP16: ["#d1363f", "#65171d"],
      OP17: ["#d9a82e", "#66480d"], EB01: ["#4ca58d", "#1b4c41"],
      EB02: ["#58bcd6", "#1a5262"], EB03: ["#df6ca5", "#682b49"],
      EB04: ["#42b6cb", "#185662"], EB05: ["#d96aa3", "#652a48"],
      PRB01: ["#d9a83c", "#624718"], PRB02: ["#d04a42", "#65231e"],
    };
    const colorNames: Array<[string, [string, string]]> = [
      ["RED", ["#df3d48", "#681921"]], ["BLUE", ["#438ed0", "#173e64"]],
      ["GREEN", ["#45a969", "#194a2b"]], ["PURPLE", ["#9a64cf", "#40265d"]],
      ["BLACK", ["#8993a0", "#252b33"]], ["YELLOW", ["#e4bd3e", "#66500f"]],
    ];
    const palette = palettes[normalizedCode]
      || colorNames.find(([color]) => normalizedName.includes(color))?.[1]
      || ["#ed4b5c", "#681d28"];
    return {
      "--extension-accent": palette[0],
      "--extension-depth": palette[1],
    } as CSSProperties;
  };

  return (
    <>
      <div className="catalog-title">
        <div><h1>Extensions</h1></div>
        <p><strong>{extensions.length}</strong> extensions</p>
      </div>
      <div className="extensions-grid">
        {extensions.map((extension) => {
          const progress = extension.count
            ? Math.round((extension.owned / extension.count) * 100)
            : 0;
          const family = extensionFamily(extension.code);
          const imageUrl = getStrapiImageUrl(extension.image, "medium");
          return (
            <article className={`extension-card extension-card--${family.key}`} key={extension.name} style={extensionTheme(extension.code, extension.name)}>
              <div className={`extension-card__media${imageUrl ? "" : " is-empty"}`}>
                {imageUrl
                  ? <Image src={imageUrl} alt={extension.displayName} fill unoptimized sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 25vw" />
                  : <span className="extension-card__placeholder">{extension.code}</span>}
                <span className="extension-card__family">{family.label}</span>
                <strong className="extension-card__code">{extension.code}</strong>
              </div>
              <div className="extension-card__body">
                <h2>{extension.displayName}</h2>
                <div className="progress-row">
                  <span>{extension.count} cartes{authenticated ? ` · ${extension.owned} possédées` : ""}</span>
                  <strong>{progress}%</strong>
                </div>
                <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                <div className="extension-card__actions">
                  <Link href={`/cards?set=${encodeURIComponent(extension.code)}&lang=${language}`}>Voir les cartes</Link>
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
