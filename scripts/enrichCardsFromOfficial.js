const fs = require("fs");
const path = require("path");
const axios = require("axios");

const CARD_LIST_URL = "https://en.onepiece-cardgame.com/cardlist/";
const DATA_PATH = path.join(__dirname, "../data/cards-export.json");
const OFFICIAL_DATA_PATH = path.join(__dirname, "../data/official-card-data.json");
const OUTPUT_PATH = path.join(__dirname, "../data/cards-enriched.json");
const REPORT_PATH = path.join(__dirname, "../data/cards-enrichment-report.json");

const setNames = {
  OP01: "OP01 - Romance Dawn",
  OP02: "OP02 - Paramount War",
  OP03: "OP03 - Pillars of Strength",
  OP04: "OP04 - Kingdom of Intrigue",
  OP05: "OP05 - Awakening of the New Era",
};
const treatmentNames = new Set(["Alternative Art", "Manga Rare", "Red Manga", "SP"]);

function decodeHtml(value = "") {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };

  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
      if (code[0] !== "#") return namedEntities[code.toLowerCase()] || entity;

      const radix = code[1].toLowerCase() === "x" ? 16 : 10;
      const number = parseInt(code.slice(radix === 16 ? 2 : 1), radix);
      return Number.isNaN(number) ? entity : String.fromCodePoint(number);
    })
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function getClassContent(block, className) {
  const pattern = new RegExp(
    `<div\\s+class="${className}">([\\s\\S]*?)<\\/div>`,
    "i"
  );
  return block.match(pattern)?.[1] || "";
}

function getClassText(block, className) {
  const content = getClassContent(block, className).replace(
    /<h3>[\s\S]*?<\/h3>/i,
    ""
  );
  return decodeHtml(content);
}

function parseNumber(value, dashValue = null) {
  if (!value) return null;
  if (value === "-") return dashValue;
  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function normalizeRarity(rarity) {
  const values = {
    L: "Leader",
    "SP CARD": "SP",
  };
  return values[rarity] || rarity;
}

function normalizeCardType(type) {
  return type ? `${type[0]}${type.slice(1).toLowerCase()}` : null;
}

function parseOfficialCards(html) {
  const cards = [];
  const modalPattern = /<dl\s+class="modalCol"\s+id="([^"]+)">([\s\S]*?)<\/dl>/g;

  for (const modal of html.matchAll(modalPattern)) {
    const cardId = decodeHtml(modal[1]).toUpperCase();
    const block = modal[2];
    const info = getClassContent(block, "infoCol");
    const infoValues = [...info.matchAll(/<span>([\s\S]*?)<\/span>/g)].map(
      (match) => decodeHtml(match[1])
    );
    const rarity = normalizeRarity(infoValues[1]);
    const cardType = normalizeCardType(infoValues[2]);
    const attributeContent = getClassContent(block, "attribute");
    const attributes = [
      ...attributeContent.matchAll(/<img[^>]+alt="([^"]+)"/g),
    ].map((match) => decodeHtml(match[1]));
    const primaryStat = getClassContent(block, "cost");
    const primaryStatLabel = decodeHtml(
      primaryStat.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1] || ""
    ).toLowerCase();
    const primaryStatValue = parseNumber(
      decodeHtml(primaryStat.replace(/<h3>[\s\S]*?<\/h3>/i, "")),
      primaryStatLabel === "cost" ? 0 : null
    );

    cards.push({
      cardId,
      displayCode: infoValues[0]?.toUpperCase() || cardId.split("_")[0],
      rarity,
      cardType,
      name: getClassText(block, "cardName"),
      cost: primaryStatLabel === "cost" ? primaryStatValue : null,
      life: primaryStatLabel === "life" ? primaryStatValue : null,
      attributes,
      power: parseNumber(
        getClassText(block, "power"),
        cardType === "Character" ? 0 : null
      ),
      counter: parseNumber(getClassText(block, "counter")),
      colors: getClassText(block, "color").split("/").filter(Boolean),
      features: getClassText(block, "feature").split("/").filter(Boolean),
      effect: getClassText(block, "text") || null,
      cardSet: getClassText(block, "getInfo") || null,
    });
  }

  return cards;
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
  return parseOfficialCards(response.data);
}

function isEmpty(value) {
  return value == null || value === "" || (Array.isArray(value) && !value.length);
}

function fillField(target, key, value, changes) {
  if (isEmpty(target[key]) && !isEmpty(value)) {
    target[key] = value;
    changes.push(key);
  }
}

function fillNodes(card, key, names, changes) {
  card[key] ||= { nodes: [] };
  if (!card[key].nodes?.length && names?.length) {
    card[key].nodes = names.map((name) => ({ name }));
    changes.push(key);
  }
}

function setOfficialField(target, key, value, changes) {
  if (JSON.stringify(target[key] ?? null) !== JSON.stringify(value ?? null)) {
    target[key] = value;
    changes.push(`${key}(official)`);
  }
}

function setOfficialNodes(card, key, names, changes) {
  const current = (card[key]?.nodes || []).map(({ name }) => name);
  if (JSON.stringify(current) !== JSON.stringify(names || [])) {
    card[key] = { nodes: (names || []).map((name) => ({ name })) };
    changes.push(`${key}(official)`);
  }
}

async function main() {
  const sourceCards = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const expectedIds = new Set(sourceCards.map((card) => card.slug.toUpperCase()));
  const expectedDisplayCodes = new Set(
    [...expectedIds].map((cardId) => cardId.split("_")[0])
  );
  const series = [
    ...new Set([...expectedIds].map((cardId) => cardId.split("-")[0])),
  ].sort();
  const officialCards = new Map();

  for (const seriesCode of series) {
    for (const card of await fetchSeries(seriesCode)) {
      if (expectedDisplayCodes.has(card.displayCode)) {
        officialCards.set(card.cardId, card);
      }
    }
  }

  const enrichedCards = structuredClone(sourceCards);
  const report = [];
  const unresolved = [];

  for (const card of enrichedCards) {
    const cardId = card.slug.toUpperCase();
    const displayCode = cardId.split("_")[0];
    const exactOfficial = officialCards.get(cardId);
    const baseOfficial = officialCards.get(displayCode);
    const official = exactOfficial || baseOfficial;

    if (!official) {
      unresolved.push(cardId);
      continue;
    }

    const fields = card.cardsFields || (card.cardsFields = {});
    const changes = [];

    setOfficialField(fields, "cardTitle", official.name, changes);
    setOfficialField(fields, "cost", official.cost, changes);
    setOfficialField(fields, "life", official.life, changes);
    setOfficialField(fields, "attribute", official.attributes, changes);
    setOfficialField(fields, "counter", official.counter, changes);
    setOfficialField(fields, "effect", official.effect, changes);
    setOfficialField(fields, "power", official.power, changes);

    setOfficialNodes(card, "colors", official.colors, changes);
    setOfficialNodes(card, "features", official.features, changes);
    setOfficialNodes(
      card,
      "typesOfCard",
      official.cardType ? [official.cardType] : [],
      changes
    );

    const sourceRarities = (card.rarities?.nodes || []).map(({ name }) => name);
    const sourceBaseRarity = sourceRarities.find(
      (name) => !treatmentNames.has(name)
    );
    const baseRarity = baseOfficial?.rarity || sourceBaseRarity;
    const treatment =
      sourceRarities.find((name) => treatmentNames.has(name)) ||
      (exactOfficial?.rarity === "SP" ? "SP" : null);

    if (baseRarity) {
      const currentRarities = (card.rarities?.nodes || []).map(({ name }) => name);
      if (currentRarities.length !== 1 || currentRarities[0] !== baseRarity) {
        card.rarities = { nodes: [{ name: baseRarity }] };
        changes.push("rarities(normalized)");
      }
    }

    card.treatments = {
      nodes: treatment ? [{ name: treatment }] : [],
    };
    if (treatment) changes.push("treatment");

    const setName = setNames[displayCode.split("-")[0]];
    fillNodes(card, "sets", setName ? [setName] : [], changes);

    if (changes.length) report.push({ cardId, fields: changes });
  }

  const officialOutput = Object.fromEntries(
    [...officialCards].sort(([a], [b]) => a.localeCompare(b))
  );
  const reportOutput = {
    source: CARD_LIST_URL,
    cards: sourceCards.length,
    officialCardsMatched: [...expectedIds].filter((cardId) =>
      officialCards.has(cardId)
    ).length,
    enrichedCards: report.length,
    unresolved,
    changes: report,
  };

  fs.writeFileSync(
    OFFICIAL_DATA_PATH,
    `${JSON.stringify(officialOutput, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    OUTPUT_PATH,
    `${JSON.stringify(enrichedCards, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    REPORT_PATH,
    `${JSON.stringify(reportOutput, null, 2)}\n`,
    "utf8"
  );

  const matchedVariants = [...expectedIds].filter((cardId) =>
    officialCards.has(cardId)
  ).length;
  console.log(`Official variants matched: ${matchedVariants}/${expectedIds.size}`);
  console.log(`Cards enriched: ${report.length}/${sourceCards.length}`);
  console.log(`Unresolved: ${unresolved.length}`);
  if (unresolved.length) console.log(unresolved.join("\n"));
}

main().catch((error) => {
  console.error(error.response?.status, error.response?.statusText || error.message);
  process.exitCode = 1;
});
