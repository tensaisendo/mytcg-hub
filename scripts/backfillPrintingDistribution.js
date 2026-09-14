const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");
const getStrapiToken = require("./strapiToken");
const { getDistributionMetadata } = require("./importCardsFromMedia");

const WRITE = process.argv.includes("--write");
const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337";
const official = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/official-card-data.json"), "utf8"));
const candidateIds = Object.values(official).filter((card) => getDistributionMetadata(card).distribution).map((card) => card.cardId);
const api = axios.create({
  baseURL: `${STRAPI_URL}/api`,
  timeout: 90000,
  headers: { Authorization: `Bearer ${getStrapiToken()}` },
});

async function fetchAll(endpoint) {
  const rows = [];
  for (let offset = 0; offset < candidateIds.length; offset += 50) {
    const params = { "pagination[pageSize]": 100, "fields[0]": "cardId", "fields[1]": "distribution", "fields[2]": "acquisition", "fields[3]": "event" };
    candidateIds.slice(offset, offset + 50).forEach((cardId, index) => { params[`filters[cardId][$in][${index}]`] = cardId; });
    const response = await api.get(endpoint, { params });
    rows.push(...response.data.data);
  }
  return rows;
}

async function backfill(endpoint) {
  const rows = await fetchAll(endpoint);
  let candidates = 0;
  let updated = 0;
  for (const row of rows) {
    const metadata = getDistributionMetadata(official[row.cardId]);
    if (!metadata.distribution) continue;
    const changed = Object.entries(metadata).some(([key, value]) => (row[key] || null) !== value);
    if (!changed) continue;
    candidates += 1;
    if (WRITE) {
      await api.put(`/${endpoint}/${row.documentId || row.id}`, { data: metadata });
      updated += 1;
    }
  }
  return { scanned: rows.length, candidates, updated };
}

async function main() {
  const cards = await backfill("cards");
  const printings = await backfill("card-printings");
  console.log(JSON.stringify({ write: WRITE, cards, printings }, null, 2));
}

main().catch((error) => {
  console.error(error.response?.data || error.message);
  process.exit(1);
});
