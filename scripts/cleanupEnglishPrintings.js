const axios = require("axios");
const path = require("path");
const fs = require("fs");

const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337";
const TOKEN = getStrapiToken();
const DRY_RUN = !process.argv.includes("--write");

const api = axios.create({
  baseURL: `${STRAPI_URL}/api`,
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  timeout: 60000,
});

function getStrapiToken() {
  return require("./strapiToken")();
}

async function fetchAllEnglishPrintings() {
  const entries = [];
  let page = 1;
  let pageCount = 1;

  do {
    const params = new URLSearchParams({
      "pagination[page]": String(page),
      "pagination[pageSize]": "100",
      "filters[language][$eq]": "EN",
      "fields[0]": "printingId",
      "fields[1]": "slug",
      "fields[2]": "cardId",
      "fields[3]": "displayCode",
      "fields[4]": "variant",
      "fields[5]": "language",
    });

    const response = await api.get("/card-printings", { params });
    const payload = response.data;
    entries.push(...(payload?.data || []));
    pageCount = payload?.meta?.pagination?.pageCount || 1;
    page += 1;
  } while (page <= pageCount);

  return entries;
}

async function main() {
  const printings = await fetchAllEnglishPrintings();
  console.log(`EN printings found: ${printings.length}`);

  for (const printing of printings) {
    const label = `${printing.printingId} (${printing.slug || printing.cardId})`;
    if (DRY_RUN) {
      console.log(`WOULD DELETE ${label}`);
      continue;
    }

    const deleteId = printing.documentId || printing.id;
    await api.delete(`/card-printings/${deleteId}`);
    console.log(`DELETED ${label}`);
  }

  console.log(DRY_RUN ? "Dry-run complete." : "Cleanup complete.");
}

main().catch((error) => {
  console.error("cleanupEnglishPrintings failed");
  console.error(error?.response?.data || error.message || error);
  process.exit(1);
});
