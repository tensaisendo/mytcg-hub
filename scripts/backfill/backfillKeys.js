const STRAPI_URL = "http://localhost:1337";
const STRAPI_TOKEN = require("../strapiToken")("STRAPI_BACKFILL_TOKEN");

const headers = {
  Authorization: `Bearer ${STRAPI_TOKEN}`,
  "Content-Type": "application/json",
};

const types = [
  "colors",
  "features",
  "attributes",
  "types",
  "rarities",
  "sets",
];

// 🔥 Nettoie complètement un item Strapi (supprime relations + metadata)
function sanitizeItem(item) {
  const clean = {};

  for (const [key, value] of Object.entries(item)) {
    // on garde uniquement les champs simples
    const isScalar =
      value === null ||
      ["string", "number", "boolean"].includes(typeof value);

    if (isScalar) {
      clean[key] = value;
    }
  }

  return clean;
}

// 🔑 Génère la key propre
function makeKey(item) {
  return (
    item.slug ||
    item.code ||
    item.name?.toLowerCase().replace(/\s+/g, "_")
  );
}

// 📦 fetch items
async function fetchItems(type) {
  const res = await fetch(
    `${STRAPI_URL}/api/${type}?pagination[pageSize]=1000`,
    { headers }
  );

  const json = await res.json();
  return json.data || [];
}

// 🔧 update item SAFE
async function updateItem(type, item) {
    const id = item.documentId;
    if (!id) return 0;

    const key =
      item.slug ||
      item.code ||
      (item.name ? item.name.toLowerCase().replace(/\s+/g, "_") : null);

    if (!key) return 0;

    const payload = {
      data: {
        key,
      },
    };

    console.log(`🔧 UPDATE → ${type}:${item.name} (${id})`);
    console.log(JSON.stringify(payload, null, 2));

    const res = await fetch(`${STRAPI_URL}/api/${type}/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(payload),
    });

    const text = await res.text();

    if (!res.ok) {
      console.log(`❌ ERROR ${type}:${item.name}`, text);
      return 0;
    }

    return 1;
  }

// 🚀 runner
async function run() {
  console.log("🚀 BACKFILL START");

  for (const type of types) {
    console.log(`\n======================`);
    console.log(`🔧 ${type}`);
    console.log(`======================`);

    const items = await fetchItems(type);

    let updated = 0;

    for (const item of items) {
      updated += await updateItem(type, item);
    }

    console.log(`✔ DONE ${type} (${updated} updated)`);
  }

  console.log("\n🎉 BACKFILL DONE");
}

run();
