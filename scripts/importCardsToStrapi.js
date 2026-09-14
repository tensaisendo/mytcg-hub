const fs = require("fs");
const path = require("path");
const axios = require("axios");
const slugify = require("slugify");

const STRAPI_URL = "http://localhost:1337";
const TOKEN = require("./strapiToken")();

// -------------------------
// MODE DRY RUN
// -------------------------

const DRY_RUN = true; // false = écrit en base

const api = axios.create({
  baseURL: `${STRAPI_URL}/api`,
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
});

// -------------------------
// DATA
// -------------------------

const data = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../data/cards-enriched.json"),
    "utf-8"
  )
);
const cardNames = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/card-names.json"), "utf-8")
);

const cards = data;
const mediaCache = new Map();
const limitIndex = process.argv.indexOf("--limit");
const LIMIT =
  limitIndex !== -1 && process.argv[limitIndex + 1]
    ? Number(process.argv[limitIndex + 1])
    : null;
const cardsToImport =
  Number.isInteger(LIMIT) && LIMIT > 0 ? cards.slice(0, LIMIT) : cards;

// -------------------------
// STRAPI RELATION MAPS
// -------------------------

const relationConfig = {
  attribute: { endpoint: "/attributes", labels: ["name", "key"] },
  color: { endpoint: "/colors", labels: ["name", "key"] },
  feature: { endpoint: "/features", labels: ["name", "key"] },
  rarity: { endpoint: "/rarities", labels: ["name", "key"] },
  set: { endpoint: "/sets", labels: ["name", "code", "key"] },
  treatment: { endpoint: "/treatments", labels: ["name", "key"] },
  type: { endpoint: "/types", labels: ["name", "key"] },
};

// -------------------------
// HELPERS
// -------------------------

function logMissing(type, name) {
  console.log(`⚠️ MISSING ${type.toUpperCase()} → "${name}"`);
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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

async function fetchAll(endpoint, fields) {
  const entries = [];
  let page = 1;
  let pageCount = 1;

  do {
    const params = {
      "pagination[page]": page,
      "pagination[pageSize]": 100,
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
  const maps = {};

  for (const [type, config] of Object.entries(relationConfig)) {
    const entries = await fetchAll(config.endpoint, config.labels);
    const map = new Map();

    for (const entry of entries) {
      for (const label of config.labels) {
        registerLabel(map, entry[label], entry, type);
      }
    }

    maps[type] = new Map([...map].map(([label, value]) => [label, value.id]));
    console.log(`🔗 ${type}: ${entries.length} loaded`);
  }

  return maps;
}

function getDisplayCode(card) {
  return card.slug.split("_")[0].toUpperCase();
}

function getCardId(card) {
  return card.slug.toUpperCase();
}

function getVariant(card) {
  const suffix = card.slug.split("_")[1];
  return suffix ? suffix.toUpperCase() : null;
}

function getCardName(card) {
  const displayCode = getDisplayCode(card);
  const name = cardNames[displayCode];

  if (!name) {
    throw new Error(`Missing official card name for ${displayCode}`);
  }

  return name;
}

function getImageCode(card) {
  return getCardId(card);
}

function getSlugSource(value) {
  return String(value).replace(/[._]+/g, "-");
}

// -------------------------
// MAPPING SAFE
// -------------------------

function mapList(list, map, type) {
  const ids = [];

  for (const item of list || []) {
    const name = item?.name || item;
    const id = map.get(normalizeLabel(name));

    if (!id) {
      logMissing(type, name);
    } else {
      ids.push(id);
    }
  }

  return ids;
}

// -------------------------
// MEDIA LIBRARY
// -------------------------

async function findMediaByFileName(fileName) {
  if (mediaCache.has(fileName)) {
    return mediaCache.get(fileName);
  }

  const res = await api.get("/upload/files", {
    params: {
      "filters[name][$eq]": fileName,
      "pagination[pageSize]": 10,
    },
  });

  const files = Array.isArray(res.data) ? res.data : res.data?.data || [];

  if (files.length > 1) {
    console.log(`⚠️ MULTIPLE MEDIA FILES → "${fileName}" (${files.length})`);
  }

  const media = files[0] || null;
  mediaCache.set(fileName, media);

  return media;
}

async function findCardImage(card) {
  const imageCode = getImageCode(card);
  const lowerVariantImageCode = imageCode.replace(/_P(\d+)$/, "_p$1");
  const extensions = ["png", "jpg", "jpeg", "webp"];
  const fileNames = [
    ...extensions.map((extension) => `${imageCode}.${extension}`),
    ...extensions.map((extension) => `${lowerVariantImageCode}.${extension}`),
  ].filter((fileName, index, list) => list.indexOf(fileName) === index);

  for (const fileName of fileNames) {
    const media = await findMediaByFileName(fileName);

    if (media) {
      return media;
    }
  }

  console.log(`⚠️ MISSING IMAGE → "${imageCode}"`);
  return null;
}

async function getExistingCardIds() {
  const response = await api.get("/cards", {
    params: {
      "fields[0]": "cardId",
      "pagination[pageSize]": 1000,
    },
  });
  const entries = response.data?.data || [];
  return new Set(entries.map(({ cardId }) => cardId).filter(Boolean));
}

// -------------------------
// IMPORT
// -------------------------

async function importCards() {
  if (!DRY_RUN) {
    const response = await api.get("/sets", {
      params: { "filters[language][$notNull]": true, "pagination[pageSize]": 1 },
    });
    if (response.data.data?.length) {
      throw new Error("Localized Sets require importCardsFromMedia.js. Legacy WordPress writes are disabled to preserve product/language relations.");
    }
  }
  console.log(`🚀 Importing ${cardsToImport.length}/${cards.length} cards...`);
  console.log(`🧪 DRY RUN = ${DRY_RUN}\n`);
  const relationMaps = await loadRelationMaps();
  const existingCardIds = DRY_RUN ? new Set() : await getExistingCardIds();

  for (const card of cardsToImport) {
    const f = card.cardsFields || {};

    try {
      const name = getCardName(card);
      const cardId = getCardId(card);
      const displayCode = getDisplayCode(card);
      const variant = getVariant(card);

      if (existingCardIds.has(cardId)) {
        console.log(`⏭️ SKIPPED EXISTING → ${cardId}`);
        continue;
      }

      // -------------------------
      // BASE PAYLOAD
      // -------------------------

      const payload = {
        data: {
          name,
          cardId,
          displayCode,
          variant,
          slug: slugify(`${getSlugSource(name)}-${getSlugSource(cardId)}`, {
            lower: true,
            strict: true,
          }),

          effect: f.effect || null,
          cost: f.cost != null ? Number(f.cost) : null,
          power: f.power ? Number(f.power) : null,
          life: f.life ? Number(f.life) : null,
          counter: f.counter || null,
          price: null,
        },
      };

      // -------------------------
      // RELATIONS
      // -------------------------

      const attributes = mapList(f.attribute, relationMaps.attribute, "attribute");
      const colors = mapList(card.colors?.nodes, relationMaps.color, "color");
      const features = mapList(card.features?.nodes, relationMaps.feature, "feature");
      const types = mapList(card.typesOfCard?.nodes, relationMaps.type, "type");
      const rarities = mapList(card.rarities?.nodes, relationMaps.rarity, "rarity");
      const treatments = mapList(
        card.treatments?.nodes,
        relationMaps.treatment,
        "treatment"
      );
      const sets = mapList(card.sets?.nodes, relationMaps.set, "set");
      const image = await findCardImage(card);

      const setId = sets[0] || null;

      // -------------------------
      // APPLY RELATIONS
      // -------------------------

      if (attributes.length) {
        payload.data.attributes = {
          connect: attributes.map((id) => ({ id })),
        };
      }

      if (colors.length) {
        payload.data.colors = {
          connect: colors.map((id) => ({ id })),
        };
      }

      if (features.length) {
        payload.data.features = {
          connect: features.map((id) => ({ id })),
        };
      }

      if (types.length) {
        payload.data.types = {
          connect: types.map((id) => ({ id })),
        };
      }

      if (rarities.length) {
        payload.data.rarity = {
          connect: { id: rarities[0] },
        };
      }

      if (treatments.length) {
        payload.data.treatment = {
          connect: { id: treatments[0] },
        };
      }

      if (setId) {
        payload.data.set = {
          connect: { id: setId },
        };
      }

      if (image) {
        payload.data.image = image.id;
      }

      // -------------------------
      // LOG
      // -------------------------

      console.log("\n=========================");
      console.log(`🃏 ${card.slug}`);
      console.log("=========================");

      console.log("attributes:", attributes);
      console.log("colors:", colors);
      console.log("features:", features);
      console.log("types:", types);
      console.log("rarity:", rarities);
      console.log("treatment:", treatments[0] || null);
      console.log("set:", setId);
      console.log("image:", image?.id || null);

      console.log("\nPAYLOAD:");
      console.log(JSON.stringify(payload, null, 2));

      // -------------------------
      // DRY RUN STOP
      // -------------------------

      if (DRY_RUN) {
        console.log("🧪 DRY RUN → SKIP POST\n");
        continue;
      }

      // -------------------------
      // POST STRAPI
      // -------------------------

      const res = await api.post("/cards", payload);
      existingCardIds.add(cardId);

      console.log(`✔ CREATED → ${card.slug}`);
    } catch (err) {
      console.log(
        `❌ ERROR ${card.slug}`,
        err.response?.data || err.message
      );
    }
  }

  console.log("\n🎉 DONE");
}

importCards().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
