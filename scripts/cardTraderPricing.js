const assert = require("assert");
const axios = require("axios");

const CARDTRADER_API_URL = "https://api.cardtrader.com/api/v2";
const MIN_FR_OFFERS = 5;
const MIN_EU_OFFERS = 3;
const MAX_OFFERS = 10;
const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
  "FR", "GR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL",
  "PT", "RO", "SE", "SI", "SK",
]);

function flattenProducts(value) {
  if (Array.isArray(value)) return value.flatMap(flattenProducts);
  if (!value || typeof value !== "object") return [];
  if (value.blueprint_id || value.blueprintId) return [value];
  return Object.values(value).flatMap(flattenProducts);
}

function getOffer(product, options = {}) {
  const cents = Number(product.price?.cents ?? product.price_cents);
  const currency = product.price?.currency ?? product.price_currency;
  const properties = product.properties_hash || product.properties || {};
  const condition = properties.condition;
  const country = product.user?.country_code;

  if (options.language) {
    const language = String(properties.onepiece_language || "").toLowerCase();
    const expected = options.language.toLowerCase() === "ja" ? "jp" : options.language.toLowerCase();
    if (language !== expected) return null;
    if (options.blueprintId && String(product.blueprint_id) !== String(options.blueprintId)) return null;
    if (product.graded || product.on_vacation || properties.signed || properties.altered) return null;
    if (product.quantity <= 0 || (product.bundle_size && product.bundle_size !== 1)) return null;
  }

  if (!Number.isFinite(cents) || cents <= 0) return null;
  if (currency !== "EUR" || condition !== "Near Mint") return null;
  if (!country || !EU_COUNTRIES.has(country)) return null;

  return { cents, country };
}

function median(values) {
  const middle = Math.floor(values.length / 2);
  if (values.length % 2) return values[middle];
  return Math.round((values[middle - 1] + values[middle]) / 2);
}

function calculateMarketPrice(products, capturedAt = new Date(), options = {}) {
  const offers = flattenProducts(products).map((product) => getOffer(product, options)).filter(Boolean);
  const frenchOffers = offers.filter(({ country }) => country === "FR");
  const scope = frenchOffers.length >= MIN_FR_OFFERS ? "FR" : "EU";
  const scopedOffers = scope === "FR" ? frenchOffers : offers;
  const minimum = scope === "FR" ? MIN_FR_OFFERS : MIN_EU_OFFERS;

  if (scopedOffers.length < minimum) {
    return {
      price: null,
      priceCurrency: "EUR",
      priceSource: "CardTrader",
      priceUpdatedAt: capturedAt.toISOString(),
      priceSampleSize: scopedOffers.length,
      priceScope: scope,
      priceMethod: "median_lowest_listings",
    };
  }

  const selected = scopedOffers
    .map(({ cents }) => cents)
    .sort((a, b) => a - b)
    .slice(0, MAX_OFFERS);

  return {
    price: median(selected) / 100,
    priceCurrency: "EUR",
    priceSource: "CardTrader",
    priceUpdatedAt: capturedAt.toISOString(),
    priceSampleSize: selected.length,
    priceScope: scope,
    priceMethod: "median_lowest_listings",
  };
}

async function fetchBlueprintPrice(blueprintId, token) {
  const response = await axios.get(`${CARDTRADER_API_URL}/marketplace/products`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { blueprint_id: blueprintId, language: "en" },
    timeout: 30000,
  });

  return calculateMarketPrice(response.data);
}

function runSelfTest() {
  const fixture = [
    { blueprint_id: 1, price: { cents: 800, currency: "EUR" }, properties_hash: { condition: "Near Mint" }, user: { country_code: "FR" } },
    { blueprint_id: 1, price: { cents: 900, currency: "EUR" }, properties_hash: { condition: "Near Mint" }, user: { country_code: "FR" } },
    { blueprint_id: 1, price: { cents: 900, currency: "EUR" }, properties_hash: { condition: "Near Mint" }, user: { country_code: "FR" } },
    { blueprint_id: 1, price: { cents: 1000, currency: "EUR" }, properties_hash: { condition: "Near Mint" }, user: { country_code: "FR" } },
    { blueprint_id: 1, price: { cents: 4000, currency: "EUR" }, properties_hash: { condition: "Near Mint" }, user: { country_code: "FR" } },
    { blueprint_id: 1, price: { cents: 100, currency: "EUR" }, properties_hash: { condition: "Played" }, user: { country_code: "FR" } },
  ];
  const result = calculateMarketPrice(fixture, new Date("2026-01-01T00:00:00Z"));

  assert.equal(result.price, 9);
  assert.equal(result.priceScope, "FR");
  assert.equal(result.priceSampleSize, 5);
  console.log(JSON.stringify(result, null, 2));
  console.log("CardTrader pricing self-test passed");
}

async function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const blueprintIndex = process.argv.indexOf("--blueprint-id");
  const blueprintId = blueprintIndex >= 0 ? process.argv[blueprintIndex + 1] : null;
  const token = process.env.CARDTRADER_API_TOKEN;

  if (!blueprintId) throw new Error("Missing --blueprint-id");
  if (!token) throw new Error("Missing CARDTRADER_API_TOKEN");

  const result = await fetchBlueprintPrice(blueprintId, token);
  console.log(JSON.stringify({ cardTraderBlueprintId: blueprintId, ...result }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.response?.data || error.message);
    process.exitCode = 1;
  });
}

module.exports = { calculateMarketPrice, fetchBlueprintPrice, flattenProducts };
