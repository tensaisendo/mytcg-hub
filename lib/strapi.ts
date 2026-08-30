export type CardRelation = {
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

export type CardPrinting = {
  id: number;
  documentId: string;
  printingId: string;
  slug?: string | null;
  cardId: string;
  displayCode: string | null;
  variant: string | null;
  language: CardLanguage;
  name: string;
  effect: string | null;
  price: number | null;
  priceCurrency: "EUR" | null;
  priceSource: "CardTrader" | null;
  priceScope: "FR" | "EU" | null;
  image: CardImage | null;
  set: CardRelation | null;
};

export type Card = {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  cardId: string;
  displayCode: string | null;
  variant: string | null;
  price: number | null;
  priceCurrency: "EUR" | null;
  priceSource: "CardTrader" | null;
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
  query?: string;
  setCode?: string;
  rarity?: string;
  color?: string;
  type?: string;
  sort?: "code" | "name" | "price-asc" | "price-desc";
};

export type CatalogOptions = {
  treatments: CardRelation[];
  sets: CardRelation[];
  rarities: CardRelation[];
  colors: CardRelation[];
  types: CardRelation[];
};

function cardsQuery(page: number, filters: CatalogFilters = {}) {
  const params = new URLSearchParams({
    "pagination[page]": String(page),
    // The catalogue displays one representative per displayCode. Fetch a
    // larger window so a page still contains 12 unique cards when variants
    // occupy several consecutive records in Strapi.
    "pagination[pageSize]": "24",
    "sort[0]": filters.sort === "name" ? "name:asc" : filters.sort === "price-asc" ? "price:asc" : filters.sort === "price-desc" ? "price:desc" : "cardId:asc",
  });

  if (filters.query) {
    params.set("filters[$or][0][name][$containsi]", filters.query);
    params.set("filters[$or][1][cardId][$containsi]", filters.query);
    params.set("filters[$or][2][displayCode][$containsi]", filters.query);
  }
  if (filters.setCode) params.set("filters[set][code][$eq]", filters.setCode);
  if (filters.rarity) params.set("filters[rarity][name][$eq]", filters.rarity);
  if (filters.treatment) params.set("filters[treatment][name][$eq]", filters.treatment);
  if (filters.color) params.set("filters[colors][name][$eq]", filters.color);
  if (filters.type) params.set("filters[types][name][$eq]", filters.type);

  ["name", "slug", "cardId", "displayCode", "variant", "price", "cost", "power", "life", "counter"].forEach(
    (field, index) => params.set(`fields[${index}]`, field),
  );
  params.set("populate[image][fields][0]", "url");
  params.set("populate[image][fields][1]", "alternativeText");
  params.set("populate[set][fields][0]", "name");
  params.set("populate[set][fields][1]", "code");
  params.set("populate[set][fields][2]", "labelFr");
  params.set("populate[set][fields][3]", "labelJp");
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

  cardIds?.forEach((cardId, index) => {
    params.set(`filters[cardId][$in][${index}]`, cardId);
  });

  return params.toString();
}

type CardsResponse = {
  data: Card[];
  meta: { pagination: { pageCount: number; total: number } };
};

async function fetchCardsPage(page: number, filters: CatalogFilters = {}): Promise<CardsResponse> {
  const response = await fetchWithRetry(`${STRAPI_URL}/api/cards?${cardsQuery(page, filters)}`, {
    next: { revalidate: 300 },
  }, "Strapi cards");
  return response.json();
}

export async function fetchCatalogPage(page: number, language: CardLanguage = "EN", filters: CatalogFilters = {}) {
  let result = await fetchCardsPage(page, filters);
  let cards = [...result.data];
  let loadedPage = page;
  let printings = language !== "EN"
    ? await fetchPrintings(result.data.map((card) => card.cardId), language)
    : [];

  // Card pages may contain variants or too few matches for a filter. Continue
  // until the first catalogue window contains 12 representative displayCodes.
  while (loadedPage < result.meta.pagination.pageCount) {
    const candidateCards = language === "EN"
      ? cards
      : attachPrintings(cards, printings).filter((card) => getCardDisplay(card, language).printing);
    const localizedCodes = new Set(candidateCards.map((card) => card.displayCode || card.cardId.split("_")[0]));
    if (localizedCodes.size >= 12) break;
    loadedPage += 1;
    const nextPage = await fetchCardsPage(loadedPage, filters);
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
  const sets = await fetchRelationCollection("sets");
  const rarities = await fetchRelationCollection("rarities");
  const colors = await fetchRelationCollection("colors");
  const types = await fetchRelationCollection("types");
  const treatments = await fetchRelationCollection("treatments");
  const firstSetQuery = languageSetsQuery(1, language);
  const firstSetPage = await fetchWithRetry(`${STRAPI_URL}/api/${firstSetQuery.endpoint}?${firstSetQuery.query}`, { next: { revalidate: 3600 } }, "Strapi language sets").then((response) => response.json() as Promise<{ data: Array<{ cardId: string }>; meta: { pagination: { pageCount: number } } }>);
  const languageSetPages: Array<{ data: Array<{ cardId: string }> }> = [firstSetPage];
  for (let page = 2; page <= firstSetPage.meta.pagination.pageCount; page += 1) {
    const setQuery = languageSetsQuery(page, language);
    languageSetPages.push(await fetchWithRetry(`${STRAPI_URL}/api/${setQuery.endpoint}?${setQuery.query}`, { next: { revalidate: 3600 } }, "Strapi language sets").then((response) => response.json() as Promise<{ data: Array<{ cardId: string }> }>));
  }
  const uniqueRelations = (relations: CardRelation[]) => [...new Map(
    relations.filter((relation) => relation?.name).map((relation) => [
      relation.code ? relation.code.replace(/-/g, "").toUpperCase() : relation.name.trim().toLocaleLowerCase(),
      relation,
    ]),
  ).values()].sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, undefined, { numeric: true }));
  const cardSetCode = (cardId: string) => {
    const match = cardId.match(/^((?:OP|EB|ST|PRB)-?\d+)/i);
    return match?.[1].replace(/-/g, "").replace(/_/g, "").toUpperCase() || "";
  };
  const availableCodes = new Set(languageSetPages.flatMap((page) => page.data.map((item) => cardSetCode(item.cardId))));
  let allowedCodes = availableCodes;
  if (language === "FR") {
    // FR uses the shared EN/FR catalogue and excludes sets available only in JP.
    const enQuery = languageSetsQuery(1, "EN");
    const enPage = await fetchWithRetry(`${STRAPI_URL}/api/${enQuery.endpoint}?${enQuery.query}`, { next: { revalidate: 3600 } }, "Strapi EN language sets").then((response) => response.json() as Promise<{ data: Array<{ cardId: string }>; meta: { pagination: { pageCount: number } } }>);
    const enItems = [...enPage.data];
    for (let page = 2; page <= enPage.meta.pagination.pageCount; page += 1) {
      const pageQuery = languageSetsQuery(page, "EN");
      const nextEnPage = await fetchWithRetry(`${STRAPI_URL}/api/${pageQuery.endpoint}?${pageQuery.query}`, { next: { revalidate: 3600 } }, "Strapi EN language sets").then((response) => response.json() as Promise<{ data: Array<{ cardId: string }> }>);
      enItems.push(...nextEnPage.data);
    }
    const enCodes = new Set(enItems.map((item) => cardSetCode(item.cardId)));
    allowedCodes = new Set([...availableCodes].filter((code) => enCodes.has(code)));
  }
  const languageSets = uniqueRelations(sets.filter((set) => set.code && allowedCodes.has(set.code.replace(/-/g, "").toUpperCase())));
  return {
    // Never fall back to the global list: that would mix extensions from
    // other languages into the active language filter.
    sets: languageSets,
    rarities: uniqueRelations(rarities),
    colors: uniqueRelations(colors),
    types: uniqueRelations(types),
    treatments: uniqueRelations(treatments),
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
    byCardId.set(printing.cardId, [...(byCardId.get(printing.cardId) || []), printing]);
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
  ["printingId", "slug", "cardId", "displayCode", "variant", "language", "name", "effect", "price", "priceCurrency", "priceSource", "priceScope"].forEach(
    (field, index) => params.set(`fields[${index}]`, field),
  );
  params.set("populate[image][fields][0]", "url");
  params.set("populate[image][fields][1]", "alternativeText");
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
  return cards.find((item) => item.cardId === printing.cardId) || null;
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

  return {
    printing,
    name: useBaseCard ? card.name : printing?.name || card.name,
    effect: useBaseCard ? card.effect : printing?.effect || card.effect,
    image: useBaseCard ? card.image : printing?.image || card.image,
    price: useBaseCard ? card.price : printing?.price ?? card.price,
    priceCurrency: useBaseCard ? card.priceCurrency : printing?.priceCurrency || card.priceCurrency,
    priceSource: useBaseCard ? card.priceSource : printing?.priceSource || card.priceSource,
    priceScope: useBaseCard ? card.priceScope : printing?.priceScope || card.priceScope,
    set: useBaseCard ? card.set : printing?.set || card.set,
    language: useBaseCard ? "EN" : printing?.language || null,
  };
}

export function getRelationLabel(
  relation: CardRelation | null | undefined,
  language: CardLanguage = "FR",
) {
  if (!relation) return "";
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
