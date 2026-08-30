const fs = require("fs");
const path = require("path");
const axios = require("axios");

const CARD_LIST_URL = "https://en.onepiece-cardgame.com/cardlist/";
const DATA_PATH = path.join(__dirname, "../data/cards-export.json");
const OUTPUT_PATH = path.join(__dirname, "../data/card-names.json");

function getDisplayCode(card) {
  return card.slug.split("_")[0].toUpperCase();
}

function decodeHtml(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };

  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
      if (code[0] !== "#") return namedEntities[code.toLowerCase()] || entity;

      const radix = code[1].toLowerCase() === "x" ? 16 : 10;
      const number = parseInt(code.slice(radix === 16 ? 2 : 1), radix);
      return Number.isNaN(number) ? entity : String.fromCodePoint(number);
    })
    .trim();
}

function extractNames(html, expectedCodes) {
  const names = new Map();
  const conflicts = new Map();
  const cardPattern =
    /<dl\s+class="modalCol"\s+id="[^"]+">[\s\S]*?<div\s+class="infoCol">[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<div\s+class="cardName">([\s\S]*?)<\/div>/g;

  for (const match of html.matchAll(cardPattern)) {
    const code = decodeHtml(match[1]).toUpperCase();
    const name = decodeHtml(match[2]);

    if (!expectedCodes.has(code)) continue;

    const currentName = names.get(code);
    if (currentName && currentName !== name) {
      conflicts.set(code, [...new Set([currentName, name])]);
    } else {
      names.set(code, name);
    }
  }

  return { names, conflicts };
}

async function fetchSeries(series) {
  console.log(`Fetching ${series}...`);

  const response = await axios.post(
    CARD_LIST_URL,
    new URLSearchParams({ freewords: series }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
      },
      timeout: 60000,
    }
  );

  return response.data;
}

async function main() {
  const cards = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const expectedCodes = new Set(cards.map(getDisplayCode));
  const series = [...new Set([...expectedCodes].map((code) => code.split("-")[0]))].sort();
  const cardNames = new Map();
  const conflicts = new Map();

  for (const seriesCode of series) {
    const html = await fetchSeries(seriesCode);
    const result = extractNames(html, expectedCodes);

    for (const [code, name] of result.names) cardNames.set(code, name);
    for (const [code, names] of result.conflicts) conflicts.set(code, names);
  }

  if (conflicts.size) {
    console.error("Conflicting official names:");
    for (const [code, names] of conflicts) {
      console.error(`- ${code}: ${names.join(" / ")}`);
    }
    process.exitCode = 1;
    return;
  }

  const missingCodes = [...expectedCodes].filter((code) => !cardNames.has(code)).sort();
  const output = Object.fromEntries([...cardNames].sort(([a], [b]) => a.localeCompare(b)));

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Resolved: ${cardNames.size}/${expectedCodes.size}`);
  console.log(`Missing: ${missingCodes.length}`);
  if (missingCodes.length) console.log(missingCodes.join("\n"));
  console.log(`Written: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error.response?.status, error.response?.statusText || error.message);
  process.exitCode = 1;
});
