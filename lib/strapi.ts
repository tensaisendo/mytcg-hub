import { distributionsForLanguage, distributionCardIds } from "@/lib/card-distributions";

export type CardRelation = {
  language?: CardLanguage | null;
  isLegacy?: boolean;
  id: number;
  name: string;
  code?: string | null;
  labelFr?: string | null;
  labelJp?: string | null;
};

export type CardImage = {
  url: string;
  alternativeText?: string | null;
  formats?: {
    thumbnail?: { url?: string | null } | null;
    small?: { url?: string | null } | null;
    medium?: { url?: string | null } | null;
    large?: { url?: string | null } | null;
  } | null;
};

export type CardLanguage = "FR" | "EN" | "JP";

export type ExtensionSummary = {
  language?: CardLanguage;
  name: string;
  labelFr?: string | null;
  labelJp?: string | null;
  code: string;
  image?: CardImage | null;
  count: number;
  printingIds: string[];
};

export function getTreatmentLabel(treatment: CardRelation | null | undefined) {
  const name = treatment?.name?.trim() || "";
  return name === "Manga Rare" ? "Manga" : name;
}

function distributionFromProduct(name: string | null | undefined) {
  const distribution = name?.trim() || "";
  if (!/(championship|\bcs\b|winner|treasure cup|tournament|regional|sealed battle|event pack)/i.test(distribution)) return null;
  return {
    distribution,
    acquisition: /finalist/i.test(distribution) ? "Finaliste" : /winner/i.test(distribution) ? "Vainqueur" : /participation/i.test(distribution) ? "Participation" : null,
    event: /treasure cup/i.test(distribution) ? "Treasure Cup" : /regional/i.test(distribution) ? "Regional" : /tournament/i.test(distribution) ? "Tournament" : /sealed battle/i.test(distribution) ? "Sealed Battle" : /championship|\bcs\b/i.test(distribution) ? "Championship" : "Event",
  };
}

export type CardPrinting = {
  id: number;
  documentId: string;
  printingId: string;
  slug?: string | null;
  cardId: string;
  displayCode: string | null;
  variant: string | null;
  distribution: string | null;
  acquisition: string | null;
  event: string | null;
  distributionRegion: string | null;
  distributionSourceUrl: string | null;
  distributionVerifiedAt: string | null;
  language: CardLanguage;
  name: string;
  effect: string | null;
  price: number | null;
  priceCurrency: "EUR" | null;
  priceSource: "CardTrader" | "Cardmarket" | "eBay" | null;
  priceScope: "FR" | "EU" | null;
  image: CardImage | null;
  set: CardRelation | null;
  card: { id: number; documentId: string; cardId: string } | null;
  treatment: CardRelation | null;
};

export type Card = {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  cardId: string;
  displayCode: string | null;
  variant: string | null;
  distribution: string | null;
  acquisition: string | null;
  event: string | null;
  distributionRegion: string | null;
  distributionSourceUrl: string | null;
  distributionVerifiedAt: string | null;
  price: number | null;
  priceCurrency: "EUR" | null;
  priceSource: "CardTrader" | "Cardmarket" | "eBay" | null;
  priceScope: "FR" | "EU" | null;
  cost: number | null;
  power: number | null;
  life: number | null;
  counter: number | null;
  effect: string | null;
  image: CardImage | null;
  rarity: CardRelation | null;
  treatment: CardRelation | null;
  set: CardRelation | null;
  printings: CardPrinting[];
  colors: CardRelation[];
  types: CardRelation[];
  attributes: CardRelation[];
  features: CardRelation[];
};

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL || "http://localhost:1337";
const FETCH_RETRY_ERRORS = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNABORTED",
  "EAI_AGAIN",
  "EPROTO",
]);

export async function fetchExtensionSummaries(language: CardLanguage): Promise<ExtensionSummary[]> {
  const response = await fetchWithRetry(`${STRAPI_URL}/api/sets/summary?language=${language}`, {
    cache: "no-store",
  }, "Strapi extension summaries");
  const payload = await response.json() as { data: ExtensionSummary[] };
  return payload.data;
}

async function fetchWithRetry(url: string, init: RequestInit, label: string, attempts = 4) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(`${label} request failed (${response.status})`);
      return response;
    } catch (error) {
      lastError = error;
      const code = (error as { cause?: { code?: string } })?.cause?.code;
      if (attempt < attempts && (!code || FETCH_RETRY_ERRORS.has(code))) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} request failed`);
}

export type CatalogFilters = {
  treatment?: string;
  distribution?: string;
  query?: string;
  setCode?: string;
  rarity?: string;
  color?: string;
  type?: string;
  sort?: "code" | "name" | "price-asc" | "price-desc";
};

export type CatalogOptions = {
  treatments: CardRelation[];
  distributions: string[];
  sets: CardRelation[];
  rarities: CardRelation[];
  colors: CardRelation[];
  types: CardRelation[];
};

function cardsQuery(page: number, filters: CatalogFilters = {}, language: CardLanguage = "EN") {
  const params = new URLSearchParams({
    "pagination[page]": String(page),
    // The catalogue displays one representative per displayCode. Fetch a
    // larger window so a page still contains 12 unique cards when variants
    // occupy several consecutive records in Strapi.
    "pagination[pageSize]": "24",
    "sort[0]": filters.sort === "name" ? "name:asc" : filters.sort === "price-asc" ? "price:asc" : filters.sort === "price-desc" ? "price:desc" : "cardId:asc",
  });

  if (filters.sort === "price-asc" || filters.sort === "price-desc") {
    params.set("filters[price][$notNull]", "true");
  }

  if (filters.query) {
    params.set("filters[$or][0][name][$containsi]", filters.query);
    params.set("filters[$or][1][cardId][$containsi]", filters.query);
    params.set("filters[$or][2][displayCode][$containsi]", filters.query);
  }
  if (filters.setCode) params.set("filters[set][code][$eq]", filters.setCode);
  if (filters.rarity) params.set("filters[rarity][name][$eq]", filters.rarity);
  if (filters.treatment) params.set("filters[treatment][name][$eq]", filters.treatment);
  if (filters.distribution) distributionCardIds(filters.distribution, language).forEach((cardId, index) => params.set(`filters[cardId][$in][${index}]`, cardId));
  if (filters.color) params.set("filters[colors][name][$eq]", filters.color);
  if (filters.type) params.set("filters[types][name][$eq]", filters.type);

  ["name", "slug", "cardId", "displayCode", "variant", "distribution", "acquisition", "event", "distributionRegion", "distributionSourceUrl", "distributionVerifiedAt", "price", "cost", "power", "life", "counter"].forEach(
    (field, index) => params.set(`fields[${index}]`, field),
  );
  params.set("populate[image][fields][0]", "url");
  params.set("populate[image][fields][1]", "alternativeText");
  params.set("populate[set][fields][0]", "name");
  params.set("populate[set][fields][1]", "code");
  params.set("populate[set][fields][2]", "labelFr");
  params.set("populate[set][fields][3]", "labelJp");
  params.set("populate[set][fields][4]", "language");
  params.set("populate[rarity][fields][0]", "name");
  params.set("populate[rarity][fields][1]", "labelFr");
  params.set("populate[rarity][fields][2]", "labelJp");
  params.set("populate[treatment][fields][0]", "name");
  params.set("populate[treatment][fields][1]", "labelFr");
  params.set("populate[treatment][fields][2]", "labelJp");
  params.set("populate[colors][fields][0]", "name");
  params.set("populate[colors][fields][1]", "labelFr");
  params.set("populate[colors][fields][2]", "labelJp");
  params.set("populate[types][fields][0]", "name");
  params.set("populate[types][fields][1]", "labelFr");
  params.set("populate[types][fields][2]", "labelJp");
  params.set("populate[attributes][fields][0]", "name");
  params.set("populate[attributes][fields][1]", "labelFr");
  params.set("populate[attributes][fields][2]", "labelJp");
  params.set("populate[features][fields][0]", "name");
  params.set("populate[features][fields][1]", "labelFr");
  params.set("populate[features][fields][2]", "labelJp");
  return params.toString();
}

function relationOptionsQuery(page: number) {
  const params = new URLSearchParams({
    "pagination[page]": String(page),
    "pagination[pageSize]": "100",
  });
  return params.toString();
}

function languageSetsQuery(page: number, language: CardLanguage) {
  const params = new URLSearchParams({
    "pagination[page]": String(page),
    "pagination[pageSize]": "100",
  });
  if (language === "EN") {
    params.set("fields[0]", "cardId");
    params.set("filters[image][$notNull]", "true");
    return { endpoint: "cards", query: params.toString() };
  }
  params.set("filters[language][$eq]", language);
  params.set("filters[image][$notNull]", "true");
  params.set("fields[0]", "cardId");
  return { endpoint: "card-printings", query: params.toString() };
}

function printingsQuery(page: number, cardIds?: string[], language?: CardLanguage) {
  const params = new URLSearchParams({
    "pagination[page]": String(page),
    "pagination[pageSize]": "100",
    "sort[0]": "printingId:asc",
  });

  [
    "printingId",
    "slug",
    "cardId",
    "displayCode",
    "variant",
    "distribution",
    "acquisition",
    "event",
    "distributionRegion",
    "distributionSourceUrl",
    "distributionVerifiedAt",
    "language",
    "name",
    "effect",
    "price",
    "priceCurrency",
    "priceSource",
    "priceScope",
  ].forEach((field, index) => params.set(`fields[${index}]`, field));

  params.set("populate[image][fields][0]", "url");
  params.set("populate[image][fields][1]", "alternativeText");
  if (language) params.set("filters[language][$eq]", language);
  params.set("populate[set][fields][0]", "name");
  params.set("populate[set][fields][1]", "code");
  params.set("populate[set][fields][2]", "language");
  params.set("populate[card][fields][0]", "cardId");
  params.set("populate[treatment][fields][0]", "name");
  params.set("populate[treatment][fields][1]", "labelFr");
  params.set("populate[treatment][fields][2]", "labelJp");

  cardIds?.forEach((cardId, index) => {
    params.set(`filters[card][cardId][$in][${index}]`, cardId);
  });

  return params.toString();
}

type CardsResponse = {
  data: Card[];
  meta: { pagination: { pageCount: number; total: number } };
};

async function fetchCardsPage(page: number, filters: CatalogFilters = {}, englishOnly = false): Promise<CardsResponse> {
  const params = new URLSearchParams(cardsQuery(page, filters, englishOnly ? "EN" : undefined));
  if (englishOnly) params.set("filters[set][language][$eq]", "EN");
  const response = await fetchWithRetry(`${STRAPI_URL}/api/cards?${params}`, {
    next: { revalidate: 300 },
  }, "Strapi cards");
  return response.json();
}

async function fetchLocalizedPriceCatalogPage(page: number, language: CardLanguage, filters: CatalogFilters): Promise<CardsResponse> {
  const printingParams = new URLSearchParams(printingsQuery(page, undefined, language));
  printingParams.set("pagination[pageSize]", "24");
  printingParams.set("sort[0]", filters.sort === "price-asc" ? "price:asc" : filters.sort === "price-desc" ? "price:desc" : filters.sort === "name" ? "name:asc" : "cardId:asc");
  printingParams.set("filters[set][language][$eq]", language);
  if (filters.sort === "price-asc" || filters.sort === "price-desc") printingParams.set("filters[price][$notNull]", "true");
  if (filters.query) {
    printingParams.set("filters[$or][0][name][$containsi]", filters.query);
    printingParams.set("filters[$or][1][cardId][$containsi]", filters.query);
  }
  if (filters.setCode) printingParams.set("filters[set][code][$eq]", filters.setCode);
  if (filters.treatment) printingParams.set("filters[treatment][name][$eq]", filters.treatment);
  if (filters.distribution) {
    const knownCardIds = distributionCardIds(filters.distribution, language);
    if (knownCardIds.length) knownCardIds.forEach((cardId, index) => printingParams.set(`filters[cardId][$in][${index}]`, cardId));
    else printingParams.set("filters[distribution][$eq]", filters.distribution);
  }
  const printingResponse = await fetchWithRetry(`${STRAPI_URL}/api/card-printings?${printingParams}`, {
    next: { revalidate: 300 },
  }, "Strapi localized price printings");
  const printingPayload = await printingResponse.json() as { data: CardPrinting[]; meta: CardsResponse["meta"] };
  if (!printingPayload.data.length) return { data: [], meta: printingPayload.meta };

  const cardIds = [...new Set(printingPayload.data.map((printing) => printing.card?.cardId || printing.cardId))];
  const cardParams = new URLSearchParams(cardsQuery(1, { ...filters, query: undefined, setCode: undefined, treatment: undefined, distribution: undefined, sort: "code" }));
  cardParams.set("pagination[pageSize]", "100");
  cardParams.delete("sort[0]");
  cardIds.forEach((cardId, index) => cardParams.set(`filters[cardId][$in][${index}]`, cardId));
  const cardResponse = await fetchWithRetry(`${STRAPI_URL}/api/cards?${cardParams}`, {
    next: { revalidate: 300 },
  }, "Strapi localized price cards");
  const cards = (await cardResponse.json() as CardsResponse).data;
  const order = new Map(cardIds.map((cardId, index) => [cardId, index]));
  return {
    data: attachPrintings(cards, printingPayload.data).sort((a, b) => (order.get(a.cardId) ?? 0) - (order.get(b.cardId) ?? 0)),
    meta: printingPayload.meta,
  };
}

export async function fetchCatalogPage(page: number, language: CardLanguage = "EN", filters: CatalogFilters = {}) {
  if (language !== "EN") {
    let localized = await fetchLocalizedPriceCatalogPage(page, language, filters);
    const cards = [...localized.data];
    let loadedPage = page;
    while (loadedPage < localized.meta.pagination.pageCount && new Set(cards.map(card => card.displayCode || card.cardId.split("_")[0])).size < 12) {
      localized = await fetchLocalizedPriceCatalogPage(++loadedPage, language, filters);
      cards.push(...localized.data);
    }
    return {
      cards,
      page: loadedPage,
      pageCount: localized.meta.pagination.pageCount,
      total: localized.meta.pagination.total,
    };
  }
  const result = await fetchCardsPage(page, filters, true);
  let cards = [...result.data];
  let loadedPage = page;
  let printings = await fetchPrintings(result.data.map((card) => card.cardId), language);

  // Card pages may contain variants or too few matches for a filter. Continue
  // until the first catalogue window contains 12 representative displayCodes.
  while (loadedPage < result.meta.pagination.pageCount) {
    const candidateCards = language === "EN"
      ? cards
      : attachPrintings(cards, printings).filter((card) => getCardDisplay(card, language).printing);
    const localizedCodes = new Set(candidateCards.map((card) => card.displayCode || card.cardId.split("_")[0]));
    if (localizedCodes.size >= 12) break;
    loadedPage += 1;
    const nextPage = await fetchCardsPage(loadedPage, filters, true);
    cards = [...cards, ...nextPage.data];
    printings = [...printings, ...await fetchPrintings(nextPage.data.map((card) => card.cardId), language)];
  }

  return {
    cards: attachPrintings(cards, printings),
    page: loadedPage,
    pageCount: result.meta.pagination.pageCount,
    total: result.meta.pagination.total,
  };
}

export async function fetchCatalogOptions(language: CardLanguage = "EN"): Promise<CatalogOptions> {
  const fetchRelationCollection = async (endpoint: string) => {
    const first = await fetchWithRetry(`${STRAPI_URL}/api/${endpoint}?${relationOptionsQuery(1)}`, { next: { revalidate: 3600 } }, `Strapi ${endpoint}`).then((response) => response.json() as Promise<{ data: CardRelation[]; meta: { pagination: { pageCount: number } } }>);
    const extraPages = await Promise.all(
      Array.from({ length: Math.max(0, first.meta.pagination.pageCount - 1) }, (_, index) =>
        fetchWithRetry(`${STRAPI_URL}/api/${endpoint}?${relationOptionsQuery(index + 2)}`, { next: { revalidate: 3600 } }, `Strapi ${endpoint}`).then((response) => response.json() as Promise<{ data: CardRelation[] }>),
      ),
    );
    return [first.data, ...extraPages.map((page) => page.data)].flat();
  };
  // Keep these small requests sequential: Strapi can reset connections when
  // several collection queries start together during local development.
  const localizedSets: CardRelation[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams(relationOptionsQuery(page));
    params.set("filters[language][$eq]", language);
    params.set("filters[isLegacy][$eq]", "false");
    const response = await fetchWithRetry(`${STRAPI_URL}/api/sets?${params}`, { cache: "no-store" }, "Strapi localized sets");
    const payload = await response.json() as { data: CardRelation[]; meta: { pagination: { pageCount: number } } };
    localizedSets.push(...payload.data);
    if (page >= payload.meta.pagination.pageCount) break;
  }
  const rarities = await fetchRelationCollection("rarities");
  const colors = await fetchRelationCollection("colors");
  const types = await fetchRelationCollection("types");
  const treatments = await fetchRelationCollection("treatments");
  const uniqueRelations = (relations: CardRelation[]) => [...new Map(
    relations.filter((relation) => relation?.name).map((relation) => [
      relation.code ? relation.code.replace(/-/g, "").toUpperCase() : relation.name.trim().toLocaleLowerCase(),
      relation,
    ]),
  ).values()].sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, undefined, { numeric: true }));
  const languageSets = uniqueRelations(localizedSets);
  return {
    // Never fall back to the global list: that would mix extensions from
    // other languages into the active language filter.
    sets: languageSets,
    rarities: uniqueRelations(rarities),
    colors: uniqueRelations(colors),
    types: uniqueRelations(types),
    treatments: uniqueRelations(treatments.some((item) => item.name === "Red Manga")
      ? treatments
      : [...treatments, { id: -1, name: "Red Manga" }]),
    distributions: [...new Set(Object.values(distributionsForLanguage(language)))].sort(),
  };
}

async function fetchPrintingsPage(page: number, cardIds?: string[], language?: CardLanguage): Promise<{ data: CardPrinting[]; meta: { pagination: { pageCount: number } } }> {
  const response = await fetchWithRetry(`${STRAPI_URL}/api/card-printings?${printingsQuery(page, cardIds, language)}`, {
    next: { revalidate: 300 },
  }, "Strapi card printings");
  return response.json();
}

async function fetchPrintings(cardIds?: string[], language?: CardLanguage): Promise<CardPrinting[]> {
  const firstPage = await fetchPrintingsPage(1, cardIds, language);
  const results = [firstPage];
  const extraPages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.meta.pagination.pageCount - 1) }, (_, index) =>
      fetchPrintingsPage(index + 2, cardIds, language),
    ),
  );
  results.push(...extraPages);
  return results.flatMap(({ data }) => data);
}

function attachPrintings(cards: Card[], printings: CardPrinting[]) {
  const byCardId = new Map<string, CardPrinting[]>();

  for (const printing of printings) {
    const canonicalCardId = printing.card?.cardId || printing.cardId;
    byCardId.set(canonicalCardId, [...(byCardId.get(canonicalCardId) || []), printing]);
  }

  return cards.map((card) => ({
    ...card,
    printings: byCardId.get(card.cardId) || [],
  }));
}

export async function fetchCards(language?: CardLanguage): Promise<Card[]> {
  const firstPage = await fetchCardsPage(1);
  const pages = [firstPage];
  const extraPages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.meta.pagination.pageCount - 1) }, (_, index) =>
      fetchCardsPage(index + 2),
    ),
  );
  pages.push(...extraPages);
  const cards = pages.flatMap(({ data }) => data);
  // English uses the canonical Card fields. Avoid loading every localized
  // printing for the catalogue, deck builder and default routes.
  const printings = language && language !== "EN"
    ? await fetchPrintings(undefined, language)
    : [];
  return attachPrintings(cards, printings);
}

export async function fetchCardBySlug(slug: string): Promise<Card | null> {
  const params = new URLSearchParams({
    "filters[slug][$eq]": slug,
    "pagination[pageSize]": "1",
  });
  ["name", "slug", "cardId", "displayCode", "variant", "price", "priceCurrency", "priceSource", "priceScope", "cost", "power", "life", "counter", "effect"].forEach(
    (field, index) => params.set(`fields[${index}]`, field),
  );
  params.set("populate[image][fields][0]", "url");
  params.set("populate[image][fields][1]", "alternativeText");
  params.set("populate[rarity][fields][0]", "name");
  params.set("populate[rarity][fields][1]", "labelFr");
  params.set("populate[rarity][fields][2]", "labelJp");
  params.set("populate[treatment][fields][0]", "name");
  params.set("populate[treatment][fields][1]", "labelFr");
  params.set("populate[treatment][fields][2]", "labelJp");
  params.set("populate[set][fields][0]", "name");
  params.set("populate[set][fields][1]", "code");
  params.set("populate[set][fields][2]", "labelFr");
  params.set("populate[set][fields][3]", "labelJp");
  params.set("populate[colors][fields][0]", "name");
  params.set("populate[colors][fields][1]", "labelFr");
  params.set("populate[colors][fields][2]", "labelJp");
  params.set("populate[types][fields][0]", "name");
  params.set("populate[types][fields][1]", "labelFr");
  params.set("populate[types][fields][2]", "labelJp");
  params.set("populate[attributes][fields][0]", "name");
  params.set("populate[attributes][fields][1]", "labelFr");
  params.set("populate[attributes][fields][2]", "labelJp");
  params.set("populate[features][fields][0]", "name");
  params.set("populate[features][fields][1]", "labelFr");
  params.set("populate[features][fields][2]", "labelJp");
  const response = await fetch(`${STRAPI_URL}/api/cards?${params}`, {
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`Strapi card request failed (${response.status})`);
  const payload = await response.json();
  const card = payload.data[0] || null;
  if (!card) return null;
  const printings = await fetchPrintings([card.cardId]);
  return attachPrintings([card], printings)[0];
}

export async function fetchCardVariants(displayCode: string): Promise<Card[]> {
  const cards = await fetchCards();
  return cards.filter((card) => card.displayCode === displayCode);
}

async function fetchPrintingBySlug(slug: string): Promise<CardPrinting | null> {
  const params = new URLSearchParams({
    "filters[slug][$eq]": slug,
    "pagination[pageSize]": "1",
  });
  ["printingId", "slug", "cardId", "displayCode", "variant", "distribution", "acquisition", "event", "distributionRegion", "distributionSourceUrl", "distributionVerifiedAt", "language", "name", "effect", "price", "priceCurrency", "priceSource", "priceScope"].forEach(
    (field, index) => params.set(`fields[${index}]`, field),
  );
  params.set("populate[image][fields][0]", "url");
  params.set("populate[image][fields][1]", "alternativeText");
  params.set("populate[card][fields][0]", "cardId");
  params.set("populate[treatment][fields][0]", "name");
  const response = await fetch(`${STRAPI_URL}/api/card-printings?${params}`, {
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`Strapi card printing request failed (${response.status})`);
  const payload = await response.json();
  return payload.data[0] || null;
}

export async function fetchCardBySlugOrPrintingSlug(slug: string): Promise<Card | null> {
  const card = await fetchCardBySlug(slug);
  if (card) return card;
  const printing = await fetchPrintingBySlug(slug);
  if (!printing) return null;
  const cards = await fetchCards();
  return cards.find((item) => item.cardId === (printing.card?.cardId || printing.cardId)) || null;
}

export function getStrapiMediaUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${STRAPI_URL}${path}`;
}

export function getStrapiImageUrl(
  image: CardImage | null | undefined,
  format: "thumbnail" | "small" | "medium" | "large" | "original" = "original",
) {
  if (!image) return "";
  if (format !== "original") {
    const formatted = image.formats?.[format]?.url;
    if (formatted) return getStrapiMediaUrl(formatted);
    if (format === "thumbnail" && image.url) {
      const separator = image.url.lastIndexOf("/");
      const directory = separator >= 0 ? image.url.slice(0, separator + 1) : "/uploads/";
      const filename = separator >= 0 ? image.url.slice(separator + 1) : image.url;
      return getStrapiMediaUrl(`${directory}thumbnail_${filename}`);
    }
  }
  return getStrapiMediaUrl(image.url);
}

export function getPreferredPrinting(card: Card, language: CardLanguage = "FR") {
  const printings = card.printings || [];
  if (language === "EN") return null;
  return printings.find((printing) => printing.language === language) || null;
}

export function getCardDisplay(card: Card, language: CardLanguage = "FR") {
  const printing = getPreferredPrinting(card, language);
  const useBaseCard = language === "EN";
  const set = useBaseCard ? card.set : printing?.set || null;
  const languageDistributions = distributionsForLanguage(language);
  const inferredDistribution = distributionFromProduct(languageDistributions[useBaseCard ? card.cardId : printing?.cardId || card.cardId] || set?.name);

  return {
    printing,
    cardId: useBaseCard ? card.cardId : printing?.cardId || card.cardId,
    displayCode: useBaseCard ? card.displayCode : printing?.displayCode || card.displayCode,
    variant: useBaseCard ? card.variant : printing?.variant ?? card.variant,
    name: useBaseCard ? card.name : printing?.name || card.name,
    effect: useBaseCard ? card.effect : printing?.effect || card.effect,
    image: useBaseCard ? card.image : printing?.image || card.image,
    price: useBaseCard ? card.price ?? null : printing?.price ?? null,
    priceCurrency: useBaseCard ? card.priceCurrency : printing?.priceCurrency ?? null,
    priceSource: useBaseCard ? card.priceSource : printing?.priceSource ?? null,
    priceScope: useBaseCard ? card.priceScope : printing?.priceScope ?? null,
    set,
    treatment: useBaseCard ? card.treatment : printing?.treatment || null,
    distribution: (useBaseCard ? card.distribution : printing?.distribution) || inferredDistribution?.distribution || null,
    acquisition: (useBaseCard ? card.acquisition : printing?.acquisition) || inferredDistribution?.acquisition || null,
    event: (useBaseCard ? card.event : printing?.event) || inferredDistribution?.event || null,
    distributionRegion: (useBaseCard ? card.distributionRegion : printing?.distributionRegion) || null,
    distributionSourceUrl: (useBaseCard ? card.distributionSourceUrl : printing?.distributionSourceUrl) || null,
    distributionVerifiedAt: (useBaseCard ? card.distributionVerifiedAt : printing?.distributionVerifiedAt) || null,
    language: useBaseCard ? "EN" : printing?.language || null,
  };
}

export function getRelationLabel(
  relation: CardRelation | null | undefined,
  language: CardLanguage = "FR",
) {
  if (!relation) return "";
  if (relation.language) return relation.language === language ? relation.name : "";
  if (language === "FR") {
    if (relation.labelFr) return relation.labelFr;
    if (/[\u3040-\u30ff\u3400-\u9fff]/.test(relation.name)) return relation.code || relation.name;
    return relation.name;
  }
  if (language === "JP") return relation.labelJp || relation.name;
  // A few sets were initially created from JP data and have a Japanese
  // canonical name with no English label. Never show that value in EN.
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(relation.name)) return relation.code || relation.name;
  return relation.name;
}
