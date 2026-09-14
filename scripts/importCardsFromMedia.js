const fs = require("fs");
const path = require("path");
const axios = require("axios");
const slugify = require("slugify");
const { folderEdition } = require("../../mytcg-cms/scripts/set-edition.cjs");
const { parseMediaIdentity, selectOfficial } = require("./cardMediaIdentity.cjs");

const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337";
const TOKEN = getStrapiToken();
const CARD_LIST_URLS = {
  EN: "https://en.onepiece-cardgame.com/cardlist/",
  FR: "https://fr.onepiece-cardgame.com/cardlist/",
  JP: "https://www.onepiece-cardgame.com/cardlist/",
};

const SERIES_CONFIG = {
  OP09: "OP09 - EMPERORS IN THE NEW WORLD",
  OP10: "OP10 - ROYAL BLOOD",
  OP11: "OP11 - A FIST OF DIVINE SPEED",
  OP12: "OP12 - LEGACY OF THE MASTER",
  OP13: "OP13 - CARRYING ON HIS WILL",
  OP14: "OP14-EB04 - THE AZURE SEA'S SEVEN",
  OP15: "OP15-EB04 - BOOSTER PACK -ADVENTURE ON KAMI'S ISLAND",
  OP16: "OP16 - THE TIME OF BATTLE",
  EB02: "EB02 - EXTRA BOOSTER -ANIME 25TH COLLECTION",
  EB03: "EB03 - EXTRA BOOSTER -ONE PIECE HEROINES EDITION",
  PRB01: "PRB01 - ONE PIECE CARD THE BEST",
  PRB02: "PRB02 - ONE PIECE CARD THE BEST vol.2",
  ST14: "ST14 - 3D2Y",
  ST15: "ST15 - RED EDWARD.NEWGATE",
  ST16: "ST16 - GREEN UTA",
  ST17: "ST17 - BLUE DONQUIXOTE DOFLAMINGO",
  ST18: "ST18 - PURPLE MONKEY.D.LUFFY",
  ST19: "ST19 - BLACK SMOKE",
  ST20: "ST20 - YELLOW CHARLOTTE KATAKURI",
  ST21: "ST21 - GEARS",
  ST22: "ST22 - ACE & NEWGATE",
  ST23: "ST23 - RED SHANKS",
  ST24: "ST24 - GREEN JEWELRY BONNEY",
  ST25: "ST25 - BLUE BUGGY",
  ST26: "ST26 - PURPLE BLACK MONKEY.D.LUFFY",
  ST27: "ST27 - BLACK MARSHALL.D.TEACH",
  ST28: "ST28 - GREEN YELLOW YAMATO",
  ST29: "ST-29 - EGGHEAD",
};

const treatmentNames = new Set(["Alternative Art", "Manga Rare", "Red Manga", "SP"]);
const args = parseArgs(process.argv.slice(2));
const DRY_RUN = !args.write;
const LANGUAGE = normalizeLanguage(args.language || "EN");
const missingRelations = new Map();
const printingOperations = [];
const requestedSeries = args.series?.length
  ? args.series.map(normalizeSeriesCode)
  : null;

const api = axios.create({
  baseURL: `${STRAPI_URL}/api`,
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  timeout: 120000,
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config || {};
    // A lost POST response may already have created the document. Never replay it.
    if ((config.method || '').toLowerCase() === 'post') return Promise.reject(error);
    const retryable = [
      "ECONNRESET",
      "ETIMEDOUT",
      "ECONNABORTED",
      "EAI_AGAIN",
      "EPROTO",
    ].includes(error.code) || /decryption failed|bad record mac/i.test(error.message || "");
    if (!retryable) {
      return Promise.reject(error);
    }

    config.__retryCount = config.__retryCount || 0;
    if (config.__retryCount >= 4) {
      return Promise.reject(error);
    }

    config.__retryCount += 1;
    const delayMs = 500 * config.__retryCount;
    console.log(
      `⚠️ STRAPI RETRY ${config.__retryCount}/4 → ${config.method?.toUpperCase() || "GET"} ${config.url} (${error.message})`
    );
    await delay(delayMs);
    return api.request(config);
  }
);

const relationConfig = {
  attribute: { endpoint: "/attributes", labels: ["name", "key"], fields: ["name", "key", "labelFr", "labelJp"] },
  color: { endpoint: "/colors", labels: ["name", "key"], fields: ["name", "key", "labelFr", "labelJp"] },
  feature: { endpoint: "/features", labels: ["name", "key"], fields: ["name", "key", "labelFr", "labelJp"] },
  rarity: { endpoint: "/rarities", labels: ["name", "key"], fields: ["name", "key", "labelFr", "labelJp"] },
  set: { endpoint: "/sets", labels: ["name", "code", "key"], fields: ["name", "code", "key", "labelFr", "labelJp"] },
  treatment: { endpoint: "/treatments", labels: ["name", "key"], fields: ["name", "key", "labelFr", "labelJp"] },
  type: { endpoint: "/types", labels: ["name", "key"], fields: ["name", "key", "labelFr", "labelJp"] },
};

function getStrapiToken() {
  return require("./strapiToken")();
}

function parseArgs(argv) {
  const parsed = { series: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--write") {
      parsed.write = true;
    } else if (arg === "--only-missing") {
      parsed.onlyMissing = true;
    } else if (arg === "--card-ids") {
      parsed.cardIds = String(argv[++index] || '').toUpperCase().split(',').filter(Boolean);
    } else if (arg === "--report") {
      parsed.report = path.resolve(argv[++index]);
    } else if (arg === "--summary") {
      parsed.summary = true;
    } else if (arg === "--limit") {
      parsed.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--series") {
      parsed.series = String(argv[index + 1] || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
    } else if (arg === "--language") {
      parsed.language = argv[index + 1];
      index += 1;
    } else if (arg === "--media-folder") {
      parsed.mediaFolder = argv[index + 1];
      index += 1;
    } else if (arg === "--card-id") {
      parsed.cardId = String(argv[index + 1] || "").trim().toUpperCase();
      index += 1;
    }
  }

  return parsed;
}

function normalizeLanguage(value) {
  const language = String(value || "").trim().toUpperCase();
  if (!["EN", "FR", "JP"].includes(language)) {
    throw new Error(`Unsupported language "${value}". Use EN, FR or JP.`);
  }
  return language;
}

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

function isCostLabel(label) {
  return ["cost", "coût", "cout"].includes(normalizeLabel(label));
}

function isLifeLabel(label) {
  return ["life", "vie"].includes(normalizeLabel(label));
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
    ].flatMap((match) =>
      decodeHtml(match[1])
        .split("/")
        .map((value) => value.trim())
        .filter((value) => value && value !== "?")
    );
    const primaryStat = getClassContent(block, "cost");
    const primaryStatLabel = decodeHtml(
      primaryStat.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1] || ""
    );
    const primaryStatValue = parseNumber(
      decodeHtml(primaryStat.replace(/<h3>[\s\S]*?<\/h3>/i, "")),
      isCostLabel(primaryStatLabel) ? 0 : null
    );

    cards.push({
      cardId,
      displayCode: infoValues[0]?.toUpperCase() || cardId.split("_")[0],
      rarity,
      cardType,
      name: getClassText(block, "cardName"),
      cost: isCostLabel(primaryStatLabel) ? primaryStatValue : null,
      life: isLifeLabel(primaryStatLabel) ? primaryStatValue : null,
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSeries(series, language = "EN") {
  const url = CARD_LIST_URLS[language];
  if (!url) throw new Error(`No official source for ${language}`);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      console.log(`🌐 Official data ${language} → ${series}`);
      const response = await axios.post(
        url,
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
    } catch (error) {
      const retryable =
        [
          "ECONNRESET",
          "ETIMEDOUT",
          "ECONNABORTED",
          "EAI_AGAIN",
          "EPROTO",
        ].includes(error.code) || /decryption failed|bad record mac/i.test(error.message || "");
      if (attempt === 5 || !retryable) throw error;
      console.log(
        `⚠️ Official data ${language} retry ${attempt}/5 → ${series} (${error.message})`
      );
      await delay(1000 * attempt);
    }
  }

  return [];
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function recordMissingRelation(type, label) {
  if (!label) return;
  const key = `${type}:${normalizeLabel(label)}`;
  if (!missingRelations.has(key)) {
    missingRelations.set(key, { type, label, count: 0 });
  }
  missingRelations.get(key).count += 1;
}

function normalizeSeriesCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^ST-(\d{2})$/, "ST$1");
}

function normalizeDisplayCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^ST-(\d{2})-/, "ST$1-")
    .replace(/_/g, "-");
}

function labelScore(type, label, entry) {
  if (type !== "set") return 0;

  const labelSlug = slugify(String(label || ""), {
    lower: true,
    strict: true,
  });
  let score = 0;

  if (entry.key === labelSlug) score += 20;
  if (normalizeLabel(entry.name) === normalizeLabel(label)) score += 10;
  if (normalizeLabel(entry.code) === normalizeLabel(label)) score += 5;
  if (entry.code && !String(entry.code).includes("-")) score += 2;

  return score;
}

function registerLabel(map, label, entry, type) {
  const normalized = normalizeLabel(label);
  if (!normalized) return;

  const current = map.get(normalized);
  const next = {
    id: entry.id,
    score: labelScore(type, label, entry),
  };

  if (current && current.id !== next.id) {
    if (next.score > current.score) {
      console.log(
        `⚠️ DUPLICATE ${type.toUpperCase()} LABEL → "${label}" (${current.id} replaced by ${next.id})`
      );
      map.set(normalized, next);
    } else {
      console.log(
        `⚠️ DUPLICATE ${type.toUpperCase()} LABEL → "${label}" (${next.id} ignored, ${current.id} kept)`
      );
    }
    return;
  }

  map.set(normalized, next);
}

async function fetchAll(endpoint, fields, extraParams = {}) {
  const entries = [];
  let page = 1;
  let pageCount = 1;

  do {
    const params = {
      "pagination[page]": page,
      "pagination[pageSize]": 100,
      ...extraParams,
    };

    fields.forEach((field, index) => {
      params[`fields[${index}]`] = field;
    });

    const response = await api.get(endpoint, { params });
    const payload = response.data;
    entries.push(...(payload?.data || []));
    pageCount = payload?.meta?.pagination?.pageCount || 1;
    page += 1;
  } while (page <= pageCount);

  return entries;
}

async function loadRelationMaps() {
  const maps = { __entries: {} };

  for (const [type, config] of Object.entries(relationConfig)) {
    const loaded = await fetchAll(config.endpoint, type === "set" ? [...config.fields, "language", "mediaFolderId", "isLegacy"] : config.fields || config.labels);
    const entries = type === "set" ? loaded.filter(entry => entry.language === LANGUAGE && !entry.isLegacy) : loaded;
    const map = new Map();
    const entriesById = new Map();

    for (const entry of entries) {
      entriesById.set(entry.id, entry);
      for (const label of config.labels) {
        registerLabel(map, entry[label], entry, type);
      }
    }

    maps[type] = new Map([...map].map(([label, value]) => [label, value.id]));
    maps.__entries[type] = entriesById;
    console.log(`🔗 ${type}: ${entries.length} loaded`);
  }

  return maps;
}

function getRelationId(map, type, label) {
  const id = map.get(normalizeLabel(label));
  if (!id && label) {
    recordMissingRelation(type, label);
    if (!args.summary) console.log(`⚠️ MISSING ${type.toUpperCase()} → "${label}"`);
  }
  return id || null;
}

function mapList(list, map, type) {
  const ids = [];

  for (const name of list || []) {
    if (name === "?") continue;
    const id = getRelationId(map, type, name);
    if (id) ids.push(id);
  }

  return ids;
}

async function ensureFeature(name, relationMaps) {
  const normalized = normalizeLabel(name);
  const existingId = relationMaps.feature.get(normalized);
  if (existingId || !name) return existingId || null;

  recordMissingRelation("feature", name);
  const key = slugify(name, { lower: true, strict: true });

  if (DRY_RUN) {
    if (!args.summary) console.log(`🧪 WOULD CREATE FEATURE → ${name}`);
    return null;
  }

  const response = await api.post("/features", {
    data: {
      name,
      key,
    },
  });
  const feature = response.data?.data;

  relationMaps.feature.set(normalizeLabel(feature.name), feature.id);
  relationMaps.feature.set(normalizeLabel(feature.key), feature.id);
  relationMaps.__entries.feature.set(feature.id, feature);

  console.log(`✔ CREATED FEATURE → ${name}`);
  return feature.id;
}

async function mapFeatures(list, relationMaps) {
  const ids = [];

  for (const name of list || []) {
    if (name === "?") continue;
    const id = await ensureFeature(name, relationMaps);
    if (id) ids.push(id);
  }

  return ids;
}

async function ensureRarity(name, relationMaps) {
  const normalized = normalizeLabel(name);
  const existingId = relationMaps.rarity.get(normalized);
  if (existingId || !name) return existingId || null;

  recordMissingRelation("rarity", name);
  const key = slugify(name, { lower: true, strict: true });

  if (DRY_RUN) {
    if (!args.summary) console.log(`🧪 WOULD CREATE RARITY → ${name}`);
    return null;
  }

  const response = await api.post("/rarities", {
    data: {
      name,
      key,
    },
  });
  const rarity = response.data?.data;

  relationMaps.rarity.set(normalizeLabel(rarity.name), rarity.id);
  relationMaps.rarity.set(normalizeLabel(rarity.key), rarity.id);
  relationMaps.__entries.rarity.set(rarity.id, rarity);

  console.log(`✔ CREATED RARITY → ${name}`);
  return rarity.id;
}

function getMediaSet(file, foldersByPath, mediaRootPath) {
  if (!mediaRootPath || !file.folderPath?.startsWith(mediaRootPath + "/")) return {};
  const productPath = file.folderPath.split("/").slice(0, mediaRootPath.split("/").length + 1).join("/");
  const folder = foldersByPath.get(productPath);
  if (!folder?.id) return {};
  const edition = folderEdition(folder.name, LANGUAGE, folder.id);
  return { setName: edition.name, setCode: edition.code, setKey: edition.key, mediaFolderId: edition.mediaFolderId };
}

function parseCardMedia(file, foldersByPath = new Map(), mediaRootPath = null) {
  const name = file.name || path.basename(file.url || "");
  const identity = parseMediaIdentity(name);
  if (!identity) return null;
  const mediaSet = getMediaSet(file, foldersByPath, mediaRootPath);

  return {
    file,
    fileName: name,
    ...identity,
    ...mediaSet,
  };
}

async function fetchAllMedia() {
  const files = [];
  const seenFirstIds = new Set();
  let page = 1;

  while (true) {
    const response = await api.get("/upload/files", {
      params: {
        "pagination[page]": page,
        "pagination[pageSize]": 100,
      },
    });
    const pageFiles = Array.isArray(response.data)
      ? response.data
      : response.data?.data || [];

    const firstId = pageFiles[0]?.id;
    if (firstId && seenFirstIds.has(firstId)) break;
    if (firstId) seenFirstIds.add(firstId);

    files.push(...pageFiles);

    if (pageFiles.length < 100) break;
    page += 1;
  }

  return [...new Map(files.map((file) => [file.id, file])).values()];
}

function getLocalMediaRootPath(folderName) {
  const cmsPath = path.resolve(__dirname, "../../mytcg-cms");
  const dbPath = path.join(cmsPath, ".tmp", "data.db");
  const databasePath = path.join(cmsPath, "node_modules", "better-sqlite3");

  if (!fs.existsSync(dbPath) || !fs.existsSync(databasePath)) return null;

  try {
    const Database = require(databasePath);
    const db = new Database(dbPath, { readonly: true });
    const folders = db
      .prepare("select name, path from upload_folders where name = ? order by length(path) asc")
      .all(folderName);
    db.close();
    return folders[0]?.path || null;
  } catch (error) {
    console.log(`⚠️ MEDIA FOLDER LOOKUP FAILED → ${error.message}`);
    return null;
  }
}

function getLocalMediaFiles(rootPath) {
  const cmsPath = path.resolve(__dirname, "../../mytcg-cms");
  const dbPath = path.join(cmsPath, ".tmp", "data.db");
  const databasePath = path.join(cmsPath, "node_modules", "better-sqlite3");

  if (!rootPath || !fs.existsSync(dbPath) || !fs.existsSync(databasePath)) {
    return null;
  }

  try {
    const Database = require(databasePath);
    const db = new Database(dbPath, { readonly: true });
    const files = db
      .prepare(
        "select id, name, url, folder_path as folderPath from files where folder_path = ? or folder_path like ? order by name asc"
      )
      .all(rootPath, `${rootPath}/%`);
    db.close();
    return files;
  } catch (error) {
    console.log(`⚠️ LOCAL MEDIA READ FAILED → ${error.message}`);
    return null;
  }
}

function getLocalMediaFolders(rootPath) {
  const cmsPath = path.resolve(__dirname, "../../mytcg-cms");
  const dbPath = path.join(cmsPath, ".tmp", "data.db");
  const databasePath = path.join(cmsPath, "node_modules", "better-sqlite3");

  if (!rootPath || !fs.existsSync(dbPath) || !fs.existsSync(databasePath)) {
    return new Map();
  }

  try {
    const Database = require(databasePath);
    const db = new Database(dbPath, { readonly: true });
    const folders = db
      .prepare(
        "select id, name, path from upload_folders where path = ? or path like ? order by length(path) asc"
      )
      .all(rootPath, `${rootPath}/%`);
    db.close();
    return new Map(folders.map((folder) => [folder.path, folder]));
  } catch (error) {
    console.log(`⚠️ LOCAL MEDIA FOLDER READ FAILED → ${error.message}`);
    return new Map();
  }
}

function isInsideMediaRoot(file, rootPath) {
  if (!rootPath) return true;
  return file.folderPath === rootPath || String(file.folderPath || "").startsWith(`${rootPath}/`);
}

async function getExistingCards() {
  const entries = await fetchAll("/cards", [
    "cardId",
    "name",
    "effect",
    "displayCode",
    "variant",
  ], { "populate[treatment][fields][0]": "name", "populate[set][fields][0]": "key", "populate[set][fields][1]": "language" });
  return new Map(
    entries.map((entry) => [entry.cardId, entry]).filter(([cardId]) => Boolean(cardId))
  );
}

async function getExistingPrintings() {
  const entries = [];
  let page = 1;
  let pageCount = 1;

  do {
    const params = {
      "pagination[page]": page,
      "pagination[pageSize]": 100,
      "populate[set][fields][0]": "name",
      "populate[set][fields][1]": "key",
      "populate[set][fields][2]": "language",
      "populate[card][fields][0]": "cardId",
      "populate[treatment][fields][0]": "name",
    };

    [
      "printingId",
      "name",
      "effect",
      "language",
      "cardId",
      "displayCode",
      "variant",
    ].forEach((field, index) => {
      params[`fields[${index}]`] = field;
    });

    const response = await api.get("/card-printings", { params });
    const payload = response.data;
    entries.push(...(payload?.data || []));
    pageCount = payload?.meta?.pagination?.pageCount || 1;
    page += 1;
  } while (page <= pageCount);

  return new Map(
    entries
      .map((entry) => [entry.printingId, entry])
      .filter(([printingId]) => Boolean(printingId))
  );
}

function getSetName(mediaCard, official) {
  const officialTitle = String(official?.cardSet || "").match(/-([^-]+)-/)?.[1]?.trim();

  if (mediaCard.setName && (LANGUAGE === "EN" || !mediaCard.setCode)) {
    return mediaCard.setName;
  }
  if (SERIES_CONFIG[mediaCard.series]) return SERIES_CONFIG[mediaCard.series];

  if (officialTitle) {
    return `${mediaCard.setCode || mediaCard.series} - ${officialTitle}`;
  }

  return mediaCard.setName || mediaCard.series;
}

function validateSetAssignments(cards, existingCards, existingPrintings) {
  const products = new Map();
  for (const card of cards) {
    if (!card.setKey) throw new Error(`Missing product folder for ${card.fileName}`);
    const previous = products.get(card.cardId);
    if (previous && previous !== card.setKey) throw new Error(`Multiple products for ${card.cardId}:${LANGUAGE}: ${previous}, ${card.setKey}. Import stopped to preserve existing editions.`);
    products.set(card.cardId, card.setKey);
    const existing = LANGUAGE === "EN" ? existingCards.get(card.cardId) : existingPrintings.get(`${card.cardId}:${LANGUAGE}`);
    if (existing?.set?.key && existing.set.key !== card.setKey) throw new Error(`Set conflict for ${card.cardId}:${LANGUAGE}: ${existing.set.key} -> ${card.setKey}. Resolve this edition explicitly before importing.`);
  }
}

async function ensureSet(mediaCard, relationMaps, official) {
  const setName = mediaCard.setName;
  const setCode = mediaCard.setCode;
  if (!mediaCard.setKey || !mediaCard.mediaFolderId || !setName) throw new Error(`Missing product folder for ${mediaCard.fileName}; refusing to infer a set from the card code`);
  const existingId =
    relationMaps.set.get(normalizeLabel(mediaCard.setKey)) ||
    null;

  if (existingId || !setName) return existingId;

  recordMissingRelation("set", setName);
  const key = mediaCard.setKey;

  if (DRY_RUN) {
    if (!args.summary) console.log(`🧪 WOULD CREATE SET → ${setName}`);
    return null;
  }

  const response = await api.post("/sets", {
    data: {
      name: setName,
      code: setCode,
      key,
      language: LANGUAGE,
      mediaFolderId: mediaCard.mediaFolderId,
    },
  });
  const set = response.data?.data;

  for (const label of [set.name, set.code, set.key]) {
    relationMaps.set.set(normalizeLabel(label), set.id);
  }
  relationMaps.__entries.set.set(set.id, set);

  console.log(`✔ CREATED SET → ${setName}`);
  return set.id;
}

function pickOfficialCard(mediaCard, officialCards) {
  return selectOfficial(mediaCard, officialCards.get(mediaCard.cardId));
}

function getTreatment(mediaCard, official) {
  if (official?.rarity === "SP") return "SP";
  if (/^P\d+$/.test(mediaCard.variant || "")) return "Alternative Art";
  return null;
}

function getRarity(official) {
  if (!official?.rarity) return null;
  return treatmentNames.has(official.rarity) ? null : official.rarity;
}

function getDistributionMetadata(official) {
  const distribution = String(official?.cardSet || "").trim();
  if (!/(championship|\bcs\b|winner|treasure cup|tournament|regional|sealed battle|event pack)/i.test(distribution)) {
    return { distribution: null, acquisition: null, event: null };
  }
  const acquisition = /finalist/i.test(distribution) ? "Finaliste"
    : /winner|winner prize/i.test(distribution) ? "Vainqueur"
    : /participation/i.test(distribution) ? "Participation"
    : null;
  const event = /treasure cup/i.test(distribution) ? "Treasure Cup"
    : /regional/i.test(distribution) ? "Regional"
    : /tournament/i.test(distribution) ? "Tournament"
    : /sealed battle/i.test(distribution) ? "Sealed Battle"
    : /championship|\bcs\b/i.test(distribution) ? "Championship"
    : /event pack/i.test(distribution) ? "Event"
    : null;
  return { distribution, acquisition, event };
}

function getLocalizedField() {
  if (LANGUAGE === "FR") return "labelFr";
  if (LANGUAGE === "JP") return "labelJp";
  return null;
}

function getLocalizedTypeLabel(cardType) {
  if (LANGUAGE !== "FR") return null;

  const labels = {
    Character: "Personnage",
    Event: "Événement",
    Leader: "Leader",
    Stage: "Stage",
  };

  return labels[cardType] || null;
}

function getLocalizedRarityLabel(rarity) {
  if (LANGUAGE !== "FR") return null;

  const labels = {
    Common: "Commune",
    Leader: "Leader",
    Promo: "Promotionnelle",
    Rare: "Rare",
    "Secret Rare": "Secrète rare",
    "Super Rare": "Super rare",
    Uncommon: "Peu commune",
  };

  return labels[rarity] || null;
}

function getLocalizedTreatmentLabel(treatment) {
  if (LANGUAGE !== "FR") return null;

  const labels = {
    "Alternative Art": "Illustration alternative",
    "Manga Rare": "Manga rare",
    "Red Manga": "Red Manga",
    SP: "SP",
  };

  return labels[treatment] || null;
}

function getLocalizedSetLabel(mediaCard, localizedOfficial) {
  if (LANGUAGE === "EN") return null;
  if (mediaCard.setName) return mediaCard.setName;

  const title = String(localizedOfficial?.cardSet || "").match(/-([^-]+)-/)?.[1]?.trim();
  return title ? `${mediaCard.setCode || mediaCard.series} - ${title}` : null;
}

async function updateLocalizedRelationLabel(relationMaps, type, id, label) {
  if (type === "set") return "skipped";
  const field = getLocalizedField();
  if (!field || !id || !label || label === "?") return "skipped";

  const entry = relationMaps.__entries[type]?.get(id);
  if (!entry) return "skipped";
  if ((entry[field] || null) === label) return "skipped";

  if (!args.summary) {
    console.log(`🌍 ${type}.${field} → ${entry.name || entry.code || id}: ${label}`);
  }

  if (DRY_RUN) {
    entry[field] = label;
    return "would-update";
  }

  const updateId = entry.documentId || entry.id;
  await api.put(`${relationConfig[type].endpoint}/${updateId}`, {
    data: { [field]: label },
  });

  entry[field] = label;
  return "updated";
}

async function syncLocalizedListLabels(relationMaps, type, canonicalLabels, localizedLabels) {
  let updated = 0;
  let wouldUpdate = 0;

  for (let index = 0; index < (canonicalLabels || []).length; index += 1) {
    const canonicalLabel = canonicalLabels[index];
    const localizedLabel = localizedLabels?.[index];
    if (!canonicalLabel || canonicalLabel === "?") continue;
    const id = getRelationId(relationMaps[type], type, canonicalLabel);
    const result = await updateLocalizedRelationLabel(
      relationMaps,
      type,
      id,
      localizedLabel
    );
    if (result === "updated") updated += 1;
    if (result === "would-update") wouldUpdate += 1;
  }

  return { updated, wouldUpdate };
}

async function syncLocalizedRelationLabels(
  relationMaps,
  mediaCard,
  official,
  localizedOfficial,
  setId
) {
  if (LANGUAGE === "EN" || !official || !localizedOfficial) {
    return { updated: 0, wouldUpdate: 0 };
  }

  const totals = { updated: 0, wouldUpdate: 0 };
  const add = (result) => {
    totals.updated += result.updated;
    totals.wouldUpdate += result.wouldUpdate;
  };

  add(
    await syncLocalizedListLabels(
      relationMaps,
      "attribute",
      official.attributes,
      localizedOfficial.attributes
    )
  );
  add(
    await syncLocalizedListLabels(
      relationMaps,
      "color",
      official.colors,
      localizedOfficial.colors
    )
  );
  add(
    await syncLocalizedListLabels(
      relationMaps,
      "feature",
      official.features,
      localizedOfficial.features
    )
  );

  const typeId = getRelationId(relationMaps.type, "type", official.cardType);
  const typeResult = await updateLocalizedRelationLabel(
    relationMaps,
    "type",
    typeId,
    getLocalizedTypeLabel(official.cardType) || localizedOfficial.cardType
  );
  if (typeResult === "updated") totals.updated += 1;
  if (typeResult === "would-update") totals.wouldUpdate += 1;

  const rarity = getRarity(official);
  const rarityId = getRelationId(relationMaps.rarity, "rarity", rarity);
  const rarityResult = await updateLocalizedRelationLabel(
    relationMaps,
    "rarity",
    rarityId,
    getLocalizedRarityLabel(rarity)
  );
  if (rarityResult === "updated") totals.updated += 1;
  if (rarityResult === "would-update") totals.wouldUpdate += 1;

  const treatment = getTreatment(mediaCard, official);
  const treatmentId = getRelationId(relationMaps.treatment, "treatment", treatment);
  const treatmentResult = await updateLocalizedRelationLabel(
    relationMaps,
    "treatment",
    treatmentId,
    getLocalizedTreatmentLabel(treatment)
  );
  if (treatmentResult === "updated") totals.updated += 1;
  if (treatmentResult === "would-update") totals.wouldUpdate += 1;

  const setResult = await updateLocalizedRelationLabel(
    relationMaps,
    "set",
    setId,
    getLocalizedSetLabel(mediaCard, localizedOfficial)
  );
  if (setResult === "updated") totals.updated += 1;
  if (setResult === "would-update") totals.wouldUpdate += 1;

  return totals;
}

function getSlugSource(value) {
  return String(value).replace(/[._]+/g, "-");
}

async function buildPayload(mediaCard, official, relationMaps, setId, existingCard = null) {
  const name = official.name;
  const treatment = getTreatment(mediaCard, official);
  const rarity = getRarity(official);
  const attributes = mapList(official.attributes, relationMaps.attribute, "attribute");
  const colors = mapList(official.colors, relationMaps.color, "color");
  const features = await mapFeatures(official.features, relationMaps);
  const types = mapList(
    official.cardType ? [official.cardType] : [],
    relationMaps.type,
    "type"
  );
  const rarityId = await ensureRarity(rarity, relationMaps);
  const treatmentId = getRelationId(
    relationMaps.treatment,
    "treatment",
    treatment
  );

  const payload = {
    data: {
      name,
      cardId: mediaCard.cardId,
      displayCode: mediaCard.displayCode,
      variant: mediaCard.variant,
      ...getDistributionMetadata(official),
      slug: slugify(
        `${getSlugSource(name)}-${getSlugSource(mediaCard.cardId)}`,
        { lower: true, strict: true }
      ),
      effect: official.effect && official.effect !== "-" ? official.effect : null,
      cost: official.cost != null ? Number(official.cost) : null,
      power: official.power != null ? Number(official.power) : null,
      life: official.life != null ? Number(official.life) : null,
      counter: official.counter != null ? Number(official.counter) : null,
      price: null,
    },
  };

  const imageId = LANGUAGE === "EN" ? mediaCard.file.id : existingCard?.image?.id || null;
  if (imageId) {
    payload.data.image = imageId;
  }

  if (attributes.length) {
    payload.data.attributes = { connect: attributes.map((id) => ({ id })) };
  }
  if (colors.length) {
    payload.data.colors = { connect: colors.map((id) => ({ id })) };
  }
  if (features.length) {
    payload.data.features = { connect: features.map((id) => ({ id })) };
  }
  if (types.length) {
    payload.data.types = { connect: types.map((id) => ({ id })) };
  }
  if (rarityId) {
    payload.data.rarity = { connect: { id: rarityId } };
  }
  if (treatmentId) {
    payload.data.treatment = { connect: { id: treatmentId } };
  }
  if (setId && LANGUAGE === "EN") {
    payload.data.set = { connect: { id: setId } };
  }

  return {
    payload,
    relations: {
      attributes,
      colors,
      features,
      types,
      rarity: rarityId,
      treatment: treatmentId,
      set: setId,
      image: imageId,
    },
  };
}

function getCardUpdateData(payload, existingCard) {
  if (LANGUAGE !== "EN") return {};
  const next = payload.data;
  const update = {};
  const toIds = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item) => item.id).filter(Boolean);
    if (value.data) return toIds(value.data);
    if (value.id) return [value.id];
    return [];
  };

  for (const field of [
    "name",
    "cardId",
    "displayCode",
    "variant",
    "distribution",
    "acquisition",
    "event",
    "slug",
    "effect",
    "cost",
    "power",
    "life",
    "counter",
  ]) {
    const current = existingCard?.[field] ?? null;
    const incoming = next[field] ?? null;
    if (current !== incoming) update[field] = incoming;
  }

  if (LANGUAGE === "EN") {
    const nextImageId = next.image || null;
    const currentImageId = existingCard?.image?.id || null;
    if (nextImageId && currentImageId !== nextImageId) {
      update.image = nextImageId;
    }
  }

  const nextAttributes = next.attributes?.connect?.map((item) => item.id) || [];
  const currentAttributes = toIds(existingCard?.attributes);
  if (JSON.stringify(nextAttributes) !== JSON.stringify(currentAttributes)) {
    update.attributes = { connect: nextAttributes.map((id) => ({ id })) };
  }

  const nextColors = next.colors?.connect?.map((item) => item.id) || [];
  const currentColors = toIds(existingCard?.colors);
  if (JSON.stringify(nextColors) !== JSON.stringify(currentColors)) {
    update.colors = { connect: nextColors.map((id) => ({ id })) };
  }

  const nextFeatures = next.features?.connect?.map((item) => item.id) || [];
  const currentFeatures = toIds(existingCard?.features);
  if (JSON.stringify(nextFeatures) !== JSON.stringify(currentFeatures)) {
    update.features = { connect: nextFeatures.map((id) => ({ id })) };
  }

  const nextTypes = next.types?.connect?.map((item) => item.id) || [];
  const currentTypes = toIds(existingCard?.types);
  if (JSON.stringify(nextTypes) !== JSON.stringify(currentTypes)) {
    update.types = { connect: nextTypes.map((id) => ({ id })) };
  }

  const nextRarityId = next.rarity?.connect?.id || null;
  const currentRarityId = existingCard?.rarity?.id || existingCard?.rarity?.data?.id || null;
  if (nextRarityId && currentRarityId !== nextRarityId) {
    update.rarity = { connect: { id: nextRarityId } };
  }

  const nextTreatmentId = next.treatment?.connect?.id || null;
  // Undefined means the relation was not loaded; only an explicit empty
  // relation may be filled. Never overwrite a treatment curated in Strapi.
  const currentTreatment = existingCard?.treatment;
  const treatmentIsEmpty = currentTreatment === null || currentTreatment?.data === null;
  if (nextTreatmentId && treatmentIsEmpty) {
    update.treatment = { connect: { id: nextTreatmentId } };
  }

  const nextSetId = next.set?.connect?.id || null;
  const currentSetId = existingCard?.set?.id || existingCard?.set?.data?.id || null;
  if (LANGUAGE === "EN" && nextSetId && currentSetId !== nextSetId) {
    update.set = { connect: { id: nextSetId } };
  }

  return update;
}

function buildPrintingPayload(mediaCard, official, existingCard, setId, relationMaps) {
  if (!official?.name) throw new Error(`Missing ${LANGUAGE} official text for ${mediaCard.cardId}`);
  const name = official.name;
  const effect =
    official?.effect && official.effect !== "-"
      ? official.effect
      : null;

  const distribution = getDistributionMetadata(official);
  const payload = {
    data: {
      printingId: `${mediaCard.cardId}:${LANGUAGE}`,
      cardId: mediaCard.cardId,
      displayCode: mediaCard.displayCode,
      variant: mediaCard.variant,
      ...distribution,
      language: LANGUAGE,
      name,
      effect,
      image: mediaCard.file.id,
      price: null,
    },
  };

  if (setId) {
    payload.data.set = { connect: { id: setId } };
  }
  if (existingCard?.id) {
    payload.data.card = { connect: { id: existingCard.id } };
  }
  const treatmentId = relationMaps
    ? getRelationId(relationMaps.treatment, "treatment", getTreatment(mediaCard, official))
    : null;
  if (treatmentId) {
    payload.data.treatment = { connect: { id: treatmentId } };
  }

  return payload;
}

function getPrintingUpdateData(payload, existingPrinting) {
  const next = payload.data;
  const update = {};

  for (const field of ["name", "effect", "language", "cardId", "displayCode", "variant", "distribution", "acquisition", "event"]) {
    const current = existingPrinting?.[field] ?? null;
    const incoming = next[field] ?? null;
    if (current !== incoming) update[field] = incoming;
  }

  const nextSetId = next.set?.connect?.id || null;
  const currentSetId = existingPrinting?.set?.id || null;
  if (nextSetId && currentSetId !== nextSetId) {
    update.set = { connect: { id: nextSetId } };
  }

  const nextCardId = next.card?.connect?.id || null;
  const currentCard = existingPrinting?.card;
  const cardIsEmpty = currentCard === null || currentCard?.data === null;
  if (nextCardId && cardIsEmpty) update.card = { connect: { id: nextCardId } };

  const nextTreatmentId = next.treatment?.connect?.id || null;
  const currentTreatment = existingPrinting?.treatment;
  const treatmentIsEmpty = currentTreatment === null || currentTreatment?.data === null;
  if (nextTreatmentId && treatmentIsEmpty) update.treatment = { connect: { id: nextTreatmentId } };

  return update;
}

async function createPrinting(mediaCard, official, existingCard, existingPrintings, setId, relationMaps) {
  if (LANGUAGE === "EN") {
    if (!args.summary) console.log(`⏭️ SKIPPED EN PRINTING → ${mediaCard.cardId}`);
    return "skipped";
  }

  const printingId = `${mediaCard.cardId}:${LANGUAGE}`;
  const payload = buildPrintingPayload(mediaCard, official, existingCard, setId, relationMaps);
  const existingPrinting = existingPrintings.get(printingId);

  if (existingPrinting) {
    const updateData = getPrintingUpdateData(payload, existingPrinting);

    if (!Object.keys(updateData).length) {
      if (!args.summary) console.log(`⏭️ SKIPPED EXISTING PRINTING → ${printingId}`);
      return "skipped";
    }

    if (!args.summary) {
      console.log(`PRINTING UPDATE → ${printingId}`);
      console.log(JSON.stringify({ data: updateData }, null, 2));
    }

    if (DRY_RUN) {
      if (!args.summary) console.log("🧪 DRY RUN → SKIP PRINTING PUT");
      return "would-update";
    }

    const updateId = existingPrinting.documentId || existingPrinting.id;
    if (!updateId) {
      throw new Error(`Missing Strapi id for existing printing ${printingId}`);
    }

    await api.put(`/card-printings/${updateId}`, {
      data: updateData,
    });
    existingPrintings.set(printingId, {
      ...existingPrinting,
      ...updateData,
    });
    console.log(`✔ UPDATED PRINTING → ${printingId}`);
    return "updated";
  }

  if (!args.summary) {
    console.log("PRINTING PAYLOAD:");
    console.log(JSON.stringify(payload, null, 2));
  }

  if (DRY_RUN) {
    if (!args.summary) console.log("🧪 DRY RUN → SKIP PRINTING POST");
    printingOperations.push({ action: 'planned', data: payload.data });
    return "would-create";
  }

  const response = await api.post("/card-printings", payload);
  printingOperations.push({ action: 'created', documentId: response.data?.data?.documentId, data: payload.data });
  existingPrintings.set(printingId, response.data?.data);
  console.log(`✔ CREATED PRINTING → ${printingId}`);
  return "created";
}

async function main() {
  console.log(`🧪 DRY RUN = ${DRY_RUN}`);
  console.log(`🌍 Language = ${LANGUAGE}`);
  console.log(`🎯 Series = ${requestedSeries?.join(", ") || "auto from media"}`);

  const relationMaps = await loadRelationMaps();
  const existingCards = await getExistingCards();
  const existingPrintings = await getExistingPrintings();
  if (args.onlyMissing) {
    // Draft-only documents also count as existing; never create a second identity.
    for (const card of await fetchAll('/cards', ['cardId'], { status: 'draft' })) {
      if (card.cardId && !existingCards.has(card.cardId)) existingCards.set(card.cardId, card);
    }
    for (const printing of await fetchAll('/card-printings', ['printingId'], { status: 'draft' })) {
      if (printing.printingId && !existingPrintings.has(printing.printingId)) existingPrintings.set(printing.printingId, printing);
    }
  }
  const mediaFolder = args.mediaFolder || LANGUAGE;
  const mediaRootPath = getLocalMediaRootPath(mediaFolder);

  if (!mediaRootPath) {
    throw new Error(
      `Could not resolve Media Library folder "${mediaFolder}". Use --media-folder or check Strapi local database.`
    );
  }

  console.log(`📁 Media folder = ${mediaFolder} (${mediaRootPath})`);

  const mediaFolders = getLocalMediaFolders(mediaRootPath);
  const mediaFiles = getLocalMediaFiles(mediaRootPath) || (await fetchAllMedia());
  const allMediaCards = mediaFiles
    .filter((file) => isInsideMediaRoot(file, mediaRootPath))
    .map((file) => parseCardMedia(file, mediaFolders, mediaRootPath))
    .filter(Boolean);
  const mediaCards = allMediaCards
    .filter((card) => !requestedSeries || requestedSeries.includes(card.series))
    .sort((a, b) => a.cardId.localeCompare(b.cardId));
  const selectedCards = args.cardIds
    ? mediaCards.filter(card => args.cardIds.includes(card.cardId))
    : args.cardId
    ? mediaCards.filter((card) => card.cardId.toUpperCase() === args.cardId)
    : Number.isInteger(args.limit) && args.limit > 0
      ? mediaCards.slice(0, args.limit)
      : mediaCards;
  const cardsToImport = args.onlyMissing
    ? selectedCards.filter(card => LANGUAGE === "EN" ? !existingCards.has(card.cardId) : !existingPrintings.has(`${card.cardId}:${LANGUAGE}`))
    : selectedCards;
  validateSetAssignments(cardsToImport, existingCards, existingPrintings);
  const seriesToFetch = [...new Set(cardsToImport.map((card) => card.series === 'P' ? card.displayCode : card.series))];
  const officialCards = new Map();
  const localizedOfficialCards = new Map();

  console.log(`🖼️ Media cards found = ${mediaCards.length}`);
  if (requestedSeries) {
    console.log(`🖼️ Media cards in folder before series filter = ${allMediaCards.length}`);
  }
  console.log(`🚀 Cards selected = ${cardsToImport.length}`);

  for (const series of LANGUAGE === "EN" ? seriesToFetch : []) {
    for (const card of await fetchSeries(series, "EN")) {
      officialCards.set(card.cardId, [...(officialCards.get(card.cardId) || []), card]);
    }
  }

  if (LANGUAGE === "EN") {
    for (const [cardId, card] of officialCards) {
      localizedOfficialCards.set(cardId, card);
    }
  } else if (CARD_LIST_URLS[LANGUAGE]) {
    for (const series of seriesToFetch) {
      for (const card of await fetchSeries(series, LANGUAGE)) {
        localizedOfficialCards.set(card.cardId, [...(localizedOfficialCards.get(card.cardId) || []), card]);
      }
    }
  }

  let created = 0;
  let createdPrintings = 0;
  let updatedPrintings = 0;
  let updatedLocalizedLabels = 0;
  let skipped = 0;
  let existingCardsCount = 0;
  let wouldCreateCards = 0;
  let wouldCreatePrintings = 0;
  let wouldUpdatePrintings = 0;
  let wouldUpdateLocalizedLabels = 0;
  const missingOfficial = [];
  const missingCanonical = [];
  const plannedCards = [];
  const createdCards = [];

  for (const mediaCard of cardsToImport) {
    const official = pickOfficialCard(mediaCard, officialCards);
    const localizedOfficial = pickOfficialCard(mediaCard, localizedOfficialCards);
    if (!localizedOfficial) {
      missingOfficial.push(`${mediaCard.cardId} (${LANGUAGE}: exact identifier/product not verified)`);
      skipped += 1;
      continue;
    }

    if (!args.summary) {
      console.log("\n=========================");
      console.log(`🃏 ${mediaCard.cardId}`);
      console.log("=========================");
      console.log("file:", mediaCard.fileName);
    }

    const existingCard = existingCards.get(mediaCard.cardId);
    const setId = await ensureSet(mediaCard, relationMaps, localizedOfficial);

    if (existingCard) {
      existingCardsCount += 1;
      if (!args.summary) console.log(`⏭️ CARD EXISTS → ${mediaCard.cardId}`);
      if (official && LANGUAGE === "EN") {
        const labelResult = await syncLocalizedRelationLabels(
          relationMaps,
          mediaCard,
          official,
          localizedOfficial,
          setId
        );
        updatedLocalizedLabels += labelResult.updated;
        wouldUpdateLocalizedLabels += labelResult.wouldUpdate;
        const { payload } = await buildPayload(
          mediaCard,
          official,
          relationMaps,
          setId,
          existingCard
        );
        const updateData = getCardUpdateData(payload, existingCard);
        if (Object.keys(updateData).length) {
          if (!args.summary) {
            console.log("CARD UPDATE:");
            console.log(JSON.stringify({ data: updateData }, null, 2));
          }

          if (DRY_RUN) {
            if (!args.summary) console.log("🧪 DRY RUN → SKIP CARD PUT");
          } else {
            const updateId = existingCard.documentId || existingCard.id;
            if (!updateId) {
              throw new Error(`Missing Strapi id for existing card ${mediaCard.cardId}`);
            }
            await api.put(`/cards/${updateId}`, {
              data: updateData,
            });
            existingCards.set(mediaCard.cardId, {
              ...existingCard,
              ...updateData,
            });
            console.log(`✔ UPDATED CARD → ${mediaCard.cardId}`);
          }
        }
      }
      const result = await createPrinting(
        mediaCard,
        localizedOfficial,
        existingCard,
        existingPrintings,
        setId,
        relationMaps
      );
      if (result === "would-create") wouldCreatePrintings += 1;
      if (result === "would-update") wouldUpdatePrintings += 1;
      if (result === "created") createdPrintings += 1;
      if (result === "updated") updatedPrintings += 1;
      continue;
    }

    if (LANGUAGE !== "EN") {
      missingCanonical.push(mediaCard.cardId);
      if (!args.summary) console.log(`REVIEW REQUIRED: no shared card for ${mediaCard.cardId}:${LANGUAGE}`);
      skipped += 1;
      continue;
    }
    if (!official) {
      missingOfficial.push(mediaCard.cardId);
      if (!args.summary) console.log(`REVIEW REQUIRED: no verified shared card for ${mediaCard.cardId}:${LANGUAGE}`);
      skipped += 1;
      continue;
    }

    const labelResult = await syncLocalizedRelationLabels(
      relationMaps,
      mediaCard,
      official,
      localizedOfficial,
      setId
    );
    updatedLocalizedLabels += labelResult.updated;
    wouldUpdateLocalizedLabels += labelResult.wouldUpdate;
    const { payload, relations } = await buildPayload(
      mediaCard,
      official,
      relationMaps,
      setId,
      null
    );

    if (!args.summary) {
      console.log("name:", payload.data.name);
      console.log("relations:", relations);
      console.log("PAYLOAD:");
      console.log(JSON.stringify(payload, null, 2));
    }

    if (DRY_RUN) {
      wouldCreateCards += 1;
      plannedCards.push({ cardId: mediaCard.cardId, imageId: mediaCard.file.id, setId, data: payload.data });
      const result = await createPrinting(
        mediaCard,
        localizedOfficial,
        payload.data,
        existingPrintings,
        setId,
        relationMaps
      );
      if (result === "would-create") wouldCreatePrintings += 1;
      if (result === "would-update") wouldUpdatePrintings += 1;
      if (!args.summary) {
        console.log("🧪 DRY RUN → SKIP POST");
      }
      continue;
    }

    const response = await api.post("/cards", payload);
    const createdCard = response.data?.data;
    existingCards.set(mediaCard.cardId, createdCard);
    created += 1;
    createdCards.push({ cardId: mediaCard.cardId, documentId: createdCard?.documentId, imageId: mediaCard.file.id, setId });
    console.log(`✔ CREATED → ${mediaCard.cardId}`);
    const result = await createPrinting(
      mediaCard,
      localizedOfficial,
      createdCard,
      existingPrintings,
      setId,
      relationMaps
    );
    if (result === "created") createdPrintings += 1;
    if (result === "updated") updatedPrintings += 1;
  }

  console.log("\n🎉 DONE");
  console.log(`created: ${created}`);
  console.log(`created ${LANGUAGE} printings: ${createdPrintings}`);
  console.log(`updated ${LANGUAGE} printings: ${updatedPrintings}`);
  console.log(`updated localized relation labels: ${updatedLocalizedLabels}`);
  console.log(`skipped: ${skipped}`);
  if (DRY_RUN) {
    console.log(`would create cards: ${wouldCreateCards}`);
    console.log(`would create ${LANGUAGE} printings: ${wouldCreatePrintings}`);
    console.log(`would update ${LANGUAGE} printings: ${wouldUpdatePrintings}`);
    console.log(`would update localized relation labels: ${wouldUpdateLocalizedLabels}`);
  }
  console.log(`existing cards: ${existingCardsCount}`);
  console.log(`missing official data: ${missingOfficial.length}`);
  if (missingOfficial.length) console.log(missingOfficial.join("\n"));
  console.log(`shared cards requiring review (not created): ${missingCanonical.length}`);
  if (missingCanonical.length) console.log(missingCanonical.join("\n"));
  console.log(`missing relations: ${missingRelations.size}`);
  if (args.report) {
    fs.mkdirSync(path.dirname(args.report), { recursive: true });
    fs.writeFileSync(args.report, JSON.stringify({ dryRun: DRY_RUN, language: LANGUAGE, selected: cardsToImport.length, plannedCards, createdCards, printingOperations, missingOfficial, missingCanonical, missingRelations: [...missingRelations.values()] }, null, 2) + '\n');
  }
  if (missingRelations.size) {
    for (const item of [...missingRelations.values()].sort((a, b) =>
      `${a.type}:${a.label}`.localeCompare(`${b.type}:${b.label}`)
    )) {
      console.log(`${item.type}: ${item.label} (${item.count})`);
    }
  }
}

module.exports = { parseOfficialCards, parseCardMedia, fetchSeries, pickOfficialCard, getTreatment, getDistributionMetadata, buildPrintingPayload };
if (require.main === module) main().catch((error) => {
  console.error("❌ importCardsFromMedia failed");
  console.error(error.response?.data || error.message);
  process.exit(1);
});
