const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { calculateMarketPrice, flattenProducts } = require('./cardTraderPricing');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache/cardtrader/localized-v1');
const REPORT = path.join(ROOT, 'data/cardtrader-localized-report.json');
const CT = 'https://api.cardtrader.com/api/v2';
const normalize = (value) => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}

function matchPrinting(printing, canonical, expansions, blueprints) {
  if (printing.variant || printing.cardId.includes('_')) return { reason: 'variant-needs-review' };
  const setCode = printing.set?.code || canonical?.set?.code;
  if (!setCode) return { reason: 'missing-set' };
  const sets = expansions.filter((expansion) => normalize(expansion.code) === normalize(setCode));
  if (sets.length !== 1) return { reason: 'unmatched-or-ambiguous-set', setCode };
  const expansion = sets[0];
  const candidates = (blueprints.get(expansion.id) || []).filter((item) =>
    !item.version && item.fixed_properties?.collector_number?.toUpperCase() === printing.cardId.toUpperCase());
  if (candidates.length !== 1) return { reason: 'unmatched-or-ambiguous-blueprint', setCode };
  const blueprint = candidates[0];
  const language = printing.language === 'JP' ? 'jp' : 'fr';
  if (!blueprint.editable_properties?.find((p) => p.name === 'onepiece_language')?.possible_values?.includes(language)) {
    return { reason: 'language-not-supported', setCode, blueprintId: blueprint.id };
  }
  // A special treatment on a base-code record is not proof of the base artwork.
  if (canonical?.treatment) return { reason: 'special-treatment-needs-review', setCode };
  return { blueprintId: blueprint.id, expansionId: expansion.id, setCode };
}

async function main(options) {
  const strapiToken = require('./strapiToken')();
  const ctToken = process.env.CARDTRADER_API_TOKEN;
  if (!ctToken) throw new Error('Missing CARDTRADER_API_TOKEN');
  const base = process.env.NEXT_PUBLIC_STRAPI_URL || 'http://127.0.0.1:1337';
  let lastCT = 0;
  async function request(url, token, init = {}) {
    for (let attempt = 1; attempt <= (init.method ? 1 : 3); attempt++) {
      try {
        if (url.startsWith(CT)) {
          await sleep(Math.max(0, 1100 - (Date.now() - lastCT)));
          lastCT = Date.now();
        }
        const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        if (init.method || attempt === 3 || /^HTTP 4(?!29)/.test(error.message)) throw new Error(`${new URL(url).pathname}: ${error.cause?.code || error.message}`);
        await sleep(1500 * attempt);
      }
    }
  }
  async function all(endpoint, fields, extra = {}) {
    const result = [];
    for (let page = 1, pageCount = 1; page <= pageCount; page++) {
      const params = new URLSearchParams({ 'pagination[page]': String(page), 'pagination[pageSize]': '100', 'sort[0]': 'cardId:asc', ...extra });
      fields.forEach((field, i) => params.set(`fields[${i}]`, field));
      const response = await request(`${base}/api/${endpoint}?${params}`, strapiToken);
      result.push(...response.data);
      pageCount = response.meta.pagination.pageCount;
      if (page % 10 === 0 || page === pageCount) console.log(`${endpoint}: ${page}/${pageCount} pages`);
    }
    return result;
  }
  async function cached(file, fetcher, maxAge) {
    if (!options.refresh && fs.existsSync(file)) {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Date.now() - stored.time < maxAge) return stored.value;
    }
    const value = await fetcher();
    save(file, { time: Date.now(), value });
    return value;
  }
  const report = { startedAt: new Date().toISOString(), mode: options.write ? 'write' : 'dry-run', counts: {}, records: [] };
  function checkpoint() {
    report.counts = {};
    for (const row of report.records) {
      const key = `${row.language}:${row.status}`;
      report.counts[key] = (report.counts[key] || 0) + 1;
    }
    save(REPORT, report);
  }
  const printings = await all('card-printings', ['cardId', 'language', 'variant', 'price'], {
    'filters[language][$in][0]': 'FR', 'filters[language][$in][1]': 'JP', 'populate[set][fields][0]': 'code',
  });
  const canonical = new Map((await all('cards', ['cardId'], { 'populate[set][fields][0]': 'code', 'populate[treatment][fields][0]': 'name' })).map((card) => [card.cardId, card]));
  const expansions = (await cached(path.join(CACHE, 'expansions.json'), () => request(`${CT}/expansions`, ctToken), 86400000)).filter((item) => item.game_id === 15);
  const blueprints = new Map();
  const neededSets = new Set(printings.filter((p) => p.price == null && !p.variant && !p.cardId.includes('_')).map((p) => normalize(p.set?.code || canonical.get(p.cardId)?.set?.code)));
  for (const expansion of expansions.filter((e) => neededSets.has(normalize(e.code)))) {
    try {
      const values = await cached(path.join(CACHE, `blueprints-${expansion.id}.json`), () => request(`${CT}/blueprints/export?expansion_id=${expansion.id}`, ctToken), 86400000);
      blueprints.set(expansion.id, Array.isArray(values) ? values : values.array);
      console.log(`Blueprints: ${expansion.code}`);
    } catch (error) { console.error(`Blueprints ${expansion.code}: ${error.message}`); }
  }
  const groups = new Map();
  const identities = new Map();
  for (const printing of printings) {
    const key = `${printing.cardId}:${printing.language}`;
    identities.set(key, (identities.get(key) || 0) + 1);
  }
  for (const printing of printings) {
    const row = { cardId: printing.cardId, language: printing.language, documentId: printing.documentId };
    report.records.push(row);
    if (printing.price != null) { row.status = 'preserved-existing-price'; continue; }
    if (identities.get(`${printing.cardId}:${printing.language}`) !== 1) { row.status = 'duplicate-printing-needs-review'; continue; }
    const match = matchPrinting(printing, canonical.get(printing.cardId), expansions, blueprints);
    Object.assign(row, match);
    if (match.reason) { row.status = match.reason; continue; }
    row.status = 'pending';
    const key = `${match.expansionId}:${printing.language}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  checkpoint();
  console.log('MATCHING', JSON.stringify(report.counts));
  let writesProcessed = 0;
  for (const [key, rows] of groups) {
    const [expansionId, language] = key.split(':');
    console.log(`OFFERS ${key}: ${rows.length} matched printings`);
    try {
      const results = await cached(path.join(CACHE, `prices-${expansionId}-${language}.json`), async () => {
        const payload = await request(`${CT}/marketplace/products?${new URLSearchParams({ expansion_id: expansionId, language: language === 'JP' ? 'jp' : 'fr' })}`, ctToken);
        const byBlueprint = new Map();
        for (const product of flattenProducts(payload)) {
          const id = String(product.blueprint_id);
          if (!byBlueprint.has(id)) byBlueprint.set(id, []);
          byBlueprint.get(id).push(product);
        }
        const capturedAt = new Date();
        return { capturedAt: capturedAt.toISOString(), prices: Object.fromEntries([...byBlueprint].map(([id, products]) => [id, calculateMarketPrice(products, capturedAt, { language, blueprintId: id })])) };
      }, 86400000);
      for (const row of rows) {
        const result = results.prices[String(row.blueprintId)] || calculateMarketPrice([], new Date(results.capturedAt), { language, blueprintId: row.blueprintId });
        row.result = result;
        if (result.price == null) { row.status = 'insufficient-offers'; continue; }
        if (!options.write) { row.status = 'ready'; continue; }
        try {
          const url = `${base}/api/card-printings/${row.documentId}`;
          const fresh = (await request(url, strapiToken)).data;
          const draft = (await request(`${url}?status=draft`, strapiToken)).data;
          if (fresh.cardId !== row.cardId || fresh.language !== language) throw new Error('Printing identity changed');
          if (fresh.price != null || draft?.price != null) { row.status = 'preserved-existing-price'; continue; }
          // Price sync must not publish unrelated pending editorial changes.
          const clean = (value) => Object.fromEntries(Object.entries(value || {}).filter(([field]) => !['id', 'createdAt', 'updatedAt', 'publishedAt'].includes(field)));
          if (draft && JSON.stringify(clean(fresh)) !== JSON.stringify(clean(draft))) { row.status = 'draft-changes-needs-review'; continue; }
          save(path.join(CACHE, `before-${row.documentId}.json`), { capturedAt: new Date().toISOString(), published: fresh, draft });
          await request(`${url}?status=published`, strapiToken, { method: 'PUT', body: JSON.stringify({ data: { ...result, cardTraderBlueprintId: String(row.blueprintId) } }) });
          const verified = (await request(url, strapiToken)).data;
          if (verified.language !== language || Number(verified.price) !== result.price) throw new Error('Write verification failed');
          row.status = 'written-and-verified';
        } catch (error) { row.status = 'write-error'; row.error = error.message; }
        writesProcessed++;
        if (writesProcessed % 25 === 0) {
          checkpoint();
          console.log(`WRITES processed: ${writesProcessed}`, JSON.stringify(report.counts));
        }
      }
    } catch (error) {
      for (const row of rows) { if (row.status === 'pending') { row.status = 'fetch-error'; row.error = error.message; } }
    }
    checkpoint();
    console.log('PROGRESS', JSON.stringify(report.counts));
  }
  report.finishedAt = new Date().toISOString();
  checkpoint();
  console.log('FINISHED', JSON.stringify(report.counts));
  console.log(`Report: ${REPORT}`);
}

if (require.main === module) {
  const { values } = parseArgs({ options: { write: { type: 'boolean', default: false }, refresh: { type: 'boolean', default: false } } });
  main(values).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { matchPrinting };
