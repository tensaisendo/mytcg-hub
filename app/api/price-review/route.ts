import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isPriceReviewAuthorized } from "@/lib/price-review-auth";

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL || "http://127.0.0.1:1337";
const TOKEN = process.env.STRAPI_API_TOKEN;
const LANGUAGES = new Set(["EN", "FR", "JP"]);

type Sale = {
  soldPrice: number;
  soldAt: string;
  sourceUrl: string;
  currency: "EUR";
  graded: false;
};
type PriceSource = "Cardmarket" | "eBay";

function isEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.PRICE_REVIEW_ENABLED === "true";
}

async function strapi(path: string, init: RequestInit = {}) {
  if (!TOKEN) throw new Error("STRAPI_API_TOKEN manquant");
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${STRAPI_URL}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...init.headers },
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const detail = await response.text();
        let message = detail;
        try {
          const payload = JSON.parse(detail);
          message = payload?.error?.message || payload?.error || detail;
        } catch {}
        throw new Error(`Strapi ${response.status}${message ? ` : ${String(message).slice(0, 300)}` : ""}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Strapi indisponible");
}

async function allPages(endpoint: string, params: URLSearchParams) {
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; ; page += 1) {
    const pageParams = new URLSearchParams(params);
    pageParams.delete("pagination[start]");
    pageParams.delete("pagination[limit]");
    pageParams.set("pagination[page]", String(page));
    pageParams.set("pagination[pageSize]", "100");
    const payload = await strapi(`/api/${endpoint}?${pageParams}`);
    rows.push(...(payload.data || []));
    if (page >= (payload.meta?.pagination?.pageCount || 1)) return rows;
  }
}

async function localizedPrintingsForCardIds(params: URLSearchParams, cardIds: string[]) {
  const rows: Record<string, unknown>[] = [];
  for (let start = 0; start < cardIds.length; start += 40) {
    const chunkParams = new URLSearchParams(params);
    cardIds.slice(start, start + 40).forEach((cardId, index) => {
      chunkParams.set(`filters[card][cardId][$in][${index}]`, cardId);
    });
    rows.push(...await allPages("card-printings", chunkParams));
  }
  return rows;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function ebaySearch(cardId: string, name: string, language: string) {
  const locale = language === "FR" ? "FR francais" : language === "JP" ? "JP Japanese" : "EN English";
  return `https://www.ebay.fr/sch/i.html?${new URLSearchParams({
    _nkw: `${cardId} ${name} One Piece Card Game ${locale}`,
    LH_Sold: "1",
    LH_Complete: "1",
  })}`;
}

function cardmarketSearch(cardId: string, language: string) {
  const displayCode = cardId.replace(/_P\d+$/i, "");
  return `https://www.cardmarket.com/fr/OnePiece/Products/Search?${new URLSearchParams({ searchString: `${displayCode} ${language}` })}`;
}

async function mediaFolder(image?: { documentId?: string } | null) {
  if (!image?.documentId) return null;
  try {
    return (await strapi(`/api/media-folder/${image.documentId}`)).data?.path || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!isEnabled()) return NextResponse.json({ error: "Outil désactivé en production." }, { status: 403 });
  if (!isPriceReviewAuthorized(request)) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  try {
    const language = (request.nextUrl.searchParams.get("language") || "FR").toUpperCase();
    const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset") || 0));
    const query = (request.nextUrl.searchParams.get("query") || "").trim();
    const setCode = (request.nextUrl.searchParams.get("set") || "").trim();
    const version = request.nextUrl.searchParams.get("version") || "all";
    const rarity = (request.nextUrl.searchParams.get("rarity") || "").trim();
    const treatment = (request.nextUrl.searchParams.get("treatment") || "").trim();
    const includeCommon = request.nextUrl.searchParams.get("includeCommon") === "true";
    if (!LANGUAGES.has(language)) return NextResponse.json({ error: "Langue invalide." }, { status: 400 });
    const endpoint = language === "EN" ? "cards" : "card-printings";
    const params = new URLSearchParams({
      "pagination[start]": String(offset),
      "pagination[limit]": "1",
      "sort[0]": "cardId:asc",
      "fields[0]": "cardId",
      "fields[1]": "name",
      "fields[2]": "variant",
      "fields[3]": "price",
      "fields[4]": "priceSource",
      "fields[5]": "distribution",
      "fields[6]": "acquisition",
      "fields[7]": "event",
      "fields[8]": "distributionRegion",
      "fields[9]": "distributionSourceUrl",
      "fields[10]": "distributionVerifiedAt",
      "populate[image][fields][0]": "url",
      "populate[image][fields][1]": "name",
    });
    if (query) {
      params.set("filters[$or][0][cardId][$containsi]", query);
      params.set("filters[$or][1][name][$containsi]", query);
    } else {
      params.set("filters[price][$null]", "true");
    }
    if (setCode) params.set("filters[set][code][$eq]", setCode);
    if (version === "variant") params.set("filters[variant][$notNull]", "true");
    if (version === "base") params.set("filters[variant][$null]", "true");
    if (language === "EN" && rarity) params.set("filters[rarity][name][$eq]", rarity);
    if (language === "EN" && !rarity && !includeCommon) {
      params.set("filters[rarity][name][$notIn][0]", "C");
      params.set("filters[rarity][name][$notIn][1]", "UC");
    }
    if (language === "EN" && treatment) params.set("filters[treatment][name][$eq]", treatment);
    if (language !== "EN") params.set("filters[language][$eq]", language);
    if (language === "EN") params.set("populate[treatment][fields][0]", "name");
    if (language !== "EN") {
      params.set("populate[card][fields][0]", "cardId");
      params.set("populate[treatment][fields][0]", "name");
      if (treatment) params.set("filters[treatment][name][$eq]", treatment);
    }

    if (language !== "EN" && (rarity || !includeCommon)) {
      const cardParams = new URLSearchParams({
        "fields[0]": "cardId",
        "populate[treatment][fields][0]": "name",
      });
      if (rarity) cardParams.set("filters[rarity][name][$eq]", rarity);
      if (!rarity && !includeCommon) {
        cardParams.set("filters[rarity][name][$notIn][0]", "C");
        cardParams.set("filters[rarity][name][$notIn][1]", "UC");
      }
      const canonicalCards = await allPages("cards", cardParams) as Array<{ documentId: string; cardId?: string; treatment?: { name?: string } | null }>;
      const canonicalById = new Map(canonicalCards.filter((card) => card.cardId).map((card) => [card.cardId as string, card]));

      const printingParams = new URLSearchParams(params);
      printingParams.delete("populate[image][fields][0]");
      const printings = await localizedPrintingsForCardIds(printingParams, [...canonicalById.keys()]) as Array<{ documentId: string; cardId: string; card?: { cardId?: string }; treatment?: { name?: string } | null }>;
      const matching = printings.sort((left, right) => left.cardId.localeCompare(right.cardId, undefined, { numeric: true }));
      const selected = matching[offset];
      if (!selected) return NextResponse.json({ data: null, total: matching.length, offset });
      const detailParams = new URLSearchParams({ "populate[image][fields][0]": "url", "populate[image][fields][1]": "name", "populate[card][fields][0]": "cardId", "populate[treatment][fields][0]": "name" });
      const card = (await strapi(`/api/card-printings/${selected.documentId}?${detailParams}`)).data;
      const folder = await mediaFolder(card.image);
      const canonicalId = card.card?.cardId || card.cardId;
      return NextResponse.json({
        data: {
          ...card,
          canonicalDocumentId: canonicalById.get(canonicalId)?.documentId,
          language,
          treatment: card.treatment || null,
          imageUrl: card.image?.url ? `${STRAPI_URL}${card.image.url}` : null,
          imageName: card.image?.name || null,
          mediaFolder: folder,
          searchUrls: {
            Cardmarket: cardmarketSearch(card.cardId, language),
            eBay: ebaySearch(card.cardId, card.name, language),
          },
        },
        total: matching.length,
        offset,
      });
    }
    const payload = await strapi(`/api/${endpoint}?${params}`);
    const card = payload.data?.[0];
    if (!card) return NextResponse.json({ data: null, total: payload.meta?.pagination?.total || 0 });
    const folder = await mediaFolder(card.image);
    let canonicalCard = card;
    if (language !== "EN") {
      canonicalCard = card.card;
      if (!canonicalCard) throw new Error("Card canonique introuvable");
    }
    return NextResponse.json({
      data: {
        ...card,
        canonicalDocumentId: canonicalCard.documentId,
        treatment: language === "EN" ? canonicalCard.treatment || null : card.treatment || null,
        language,
        imageUrl: card.image?.url ? `${STRAPI_URL}${card.image.url}` : null,
        imageName: card.image?.name || null,
        mediaFolder: folder,
        searchUrls: {
          Cardmarket: cardmarketSearch(card.cardId, language),
          eBay: ebaySearch(card.cardId, card.name, language),
        },
      },
      total: payload.meta.pagination.total,
      offset,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isEnabled()) return NextResponse.json({ error: "Outil désactivé en production." }, { status: 403 });
  if (!isPriceReviewAuthorized(request)) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  try {
    const body = await request.json() as { kind?: "treatment" | "distribution"; documentId?: string; canonicalDocumentId?: string; cardId?: string; language?: string; treatment?: string | null; distribution?: string | null; acquisition?: string | null; event?: string | null; distributionRegion?: string | null; distributionSourceUrl?: string | null };
    const treatmentName = body.treatment == null ? null : String(body.treatment).trim();
    const language = String(body.language || "").toUpperCase();
    const endpoint = language === "EN" ? "cards" : "card-printings";
    const documentId = language === "EN" ? body.canonicalDocumentId : body.documentId;
    if (!LANGUAGES.has(language) || !documentId || !body.cardId) {
      return NextResponse.json({ error: "Identité de correction invalide." }, { status: 400 });
    }
    const card = (await strapi(`/api/${endpoint}/${documentId}?populate[treatment][fields][0]=name`)).data;
    if (!card || card.cardId !== body.cardId || (language !== "EN" && card.language !== language)) {
      return NextResponse.json({ error: "L’impression ne correspond plus à la variante sélectionnée." }, { status: 409 });
    }
    if (body.kind === "distribution") {
      const distribution = String(body.distribution || "").trim() || null;
      const sourceUrl = String(body.distributionSourceUrl || "").trim() || null;
      const allowedHosts: Record<string, string> = { EN: "en.onepiece-cardgame.com", FR: "fr.onepiece-cardgame.com", JP: "www.onepiece-cardgame.com" };
      if (distribution && !body.distributionRegion) return NextResponse.json({ error: "La région est obligatoire pour une distribution." }, { status: 400 });
      if (sourceUrl) {
        try {
          const url = new URL(sourceUrl);
          if (url.protocol !== "https:" || url.hostname !== allowedHosts[language]) throw new Error();
        } catch {
          return NextResponse.json({ error: `Utilise une URL officielle ${allowedHosts[language]}.` }, { status: 400 });
        }
      }
      const data = distribution ? {
        distribution,
        acquisition: String(body.acquisition || "").trim() || null,
        event: String(body.event || "").trim() || null,
        distributionRegion: String(body.distributionRegion || "").trim(),
        distributionSourceUrl: sourceUrl,
        distributionVerifiedAt: sourceUrl ? new Date().toISOString() : null,
      } : { distribution: null, acquisition: null, event: null, distributionRegion: null, distributionSourceUrl: null, distributionVerifiedAt: null };
      if (language === "EN") {
        await strapi(`/api/cards/${documentId}?status=published`, {
          method: "PUT",
          body: JSON.stringify({ data }),
        });
      } else {
        await strapi(`/api/card-printings/${documentId}/distribution`, {
          method: "POST",
          body: JSON.stringify({ cardId: body.cardId, language, data }),
        });
      }
      const verified = (await strapi(`/api/${endpoint}/${documentId}`)).data;
      if ((verified?.distribution || null) !== distribution) throw new Error("La vérification de la distribution Strapi a échoué");
      revalidatePath("/cards");
      revalidatePath(`/cards/${card.slug || ""}`);
      revalidatePath("/api/catalog");
      return NextResponse.json({ data: {
        distribution: verified.distribution || null,
        acquisition: verified.acquisition || null,
        event: verified.event || null,
        distributionRegion: verified.distributionRegion || null,
        distributionSourceUrl: verified.distributionSourceUrl || null,
        distributionVerifiedAt: verified.distributionVerifiedAt || null,
      } });
    }
    if (treatmentName === "") return NextResponse.json({ error: "Correction de traitement invalide." }, { status: 400 });
    let treatment: { id: number; documentId: string; name: string } | null = null;
    if (treatmentName) {
      const treatmentParams = new URLSearchParams({
        "filters[name][$eq]": treatmentName,
        "pagination[pageSize]": "2",
        "fields[0]": "name",
      });
      const treatments = (await strapi(`/api/treatments?${treatmentParams}`)).data || [];
      if (treatments.length !== 1) return NextResponse.json({ error: "Traitement Strapi introuvable ou ambigu." }, { status: 400 });
      treatment = treatments[0];
    }
    if (language === "EN") {
      await strapi(`/api/cards/${documentId}?status=published`, {
        method: "PUT",
        body: JSON.stringify({ data: { treatment: treatment ? { connect: { id: treatment.id } } : null } }),
      });
    } else {
      await strapi(`/api/card-printings/${documentId}/treatment`, {
        method: "POST",
        body: JSON.stringify({
          cardId: body.cardId,
          language,
          treatmentDocumentId: treatment?.documentId || null,
        }),
      });
    }
    const verified = (await strapi(`/api/${endpoint}/${documentId}?populate[treatment][fields][0]=name`)).data;
    if ((verified?.treatment?.name || null) !== treatmentName) throw new Error("La vérification du traitement Strapi a échoué");
    revalidatePath("/cards");
    revalidatePath("/api/catalog");
    return NextResponse.json({ data: { treatment: verified.treatment || null } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!isEnabled()) return NextResponse.json({ error: "Outil désactivé en production." }, { status: 403 });
  if (!isPriceReviewAuthorized(request)) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  try {
    const body = await request.json() as { documentId?: string; cardId?: string; language?: string; source?: PriceSource; sales?: Sale[]; overwrite?: boolean };
    const language = String(body.language || "").toUpperCase();
    const source: PriceSource = body.source === "Cardmarket" ? "Cardmarket" : "eBay";
    if (!body.documentId || !body.cardId || !LANGUAGES.has(language)) {
      return NextResponse.json({ error: "Identité de carte invalide." }, { status: 400 });
    }
    const observedAt = new Date().toISOString().slice(0, 10);
    let sales = (body.sales || []).map((sale) => source === "Cardmarket" ? { ...sale, soldAt: observedAt } : sale).filter((sale) =>
      Number.isFinite(Number(sale.soldPrice)) && Number(sale.soldPrice) > 0 &&
      sale.currency === "EUR" && sale.graded === false &&
      /^\d{4}-\d{2}-\d{2}$/.test(sale.soldAt) &&
      (source === "Cardmarket" ? /^https:\/\/(www\.)?cardmarket\.com\//i.test(sale.sourceUrl) : /^https:\/\/(www\.)?ebay\./i.test(sale.sourceUrl))
    );
    if (source === "Cardmarket") sales = sales.slice(0, 1);
    if (sales.length < 1) return NextResponse.json({ error: `Une observation ${source} valide minimum est nécessaire.` }, { status: 400 });
    const endpoint = language === "EN" ? "cards" : "card-printings";
    const fresh = (await strapi(`/api/${endpoint}/${body.documentId}`)).data;
    if (fresh.cardId !== body.cardId || (language !== "EN" && fresh.language !== language)) {
      return NextResponse.json({ error: "La carte a changé depuis son chargement." }, { status: 409 });
    }
    if (fresh.price != null && body.overwrite !== true) return NextResponse.json({ error: "Cette carte possède déjà un prix. Confirme son remplacement." }, { status: 409 });
    const price = Math.round(median(sales.map((sale) => Number(sale.soldPrice))) * 100) / 100;
    const priceData = {
      price,
      priceCurrency: "EUR",
      priceSource: source,
      priceUpdatedAt: new Date().toISOString(),
      priceSampleSize: source === "Cardmarket" ? null : sales.length,
      priceScope: "FR",
      priceMethod: source === "Cardmarket" ? "cardmarket_trend" : "median_sold_listings",
      priceCondition: "Ungraded",
      priceSourceUrl: sales[0].sourceUrl,
    };
    if (language === "EN") {
      await strapi(`/api/cards/${body.documentId}?status=published`, {
        method: "PUT",
        body: JSON.stringify({ data: priceData }),
      });
    } else {
      await strapi(`/api/card-printings/${body.documentId}/price`, {
        method: "POST",
        body: JSON.stringify({ cardId: body.cardId, language, overwrite: body.overwrite === true, data: priceData }),
      });
    }
    const verified = (await strapi(`/api/${endpoint}/${body.documentId}`)).data;
    if (Number(verified.price) !== price || verified.priceSource !== source) throw new Error("La vérification Strapi a échoué");
    revalidatePath("/cards");
    revalidatePath("/api/catalog");
    return NextResponse.json({ data: { price, sampleSize: source === "Cardmarket" ? null : sales.length, source } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue" }, { status: 503 });
  }
}
