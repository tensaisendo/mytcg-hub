const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'data/ebay-sold-observations.json');
const REPORT = path.join(ROOT, 'data/ebay-sold-price-report.json');
const LANGUAGES = new Set(['EN', 'FR', 'JP']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildSearchUrl(card) {
  const language = card.language === 'FR' ? 'FR francais' : card.language === 'JP' ? 'JP Japanese' : 'EN English';
  const query = `${card.cardId} ${card.name || ''} One Piece Card Game ${language}`.trim();
  return `https://www.ebay.fr/sch/i.html?${new URLSearchParams({ _nkw: query, LH_Sold: '1', LH_Complete: '1' })}`;
}

function calculatePrice(observations, minimumSamples = 1) {
  const accepted = observations.filter((row) =>
    Number.isFinite(Number(row.soldPrice)) && Number(row.soldPrice) > 0 &&
    row.currency === 'EUR' && row.graded === false && row.sourceUrl && row.soldAt
  );
  if (accepted.length < minimumSamples) return { price: null, accepted, reason: 'insufficient-sold-listings' };
  return {
    price: Math.round(median(accepted.map((row) => Number(row.soldPrice))) * 100) / 100,
    accepted,
    reason: null,
  };
}

async function main(options) {
  const token = require('./strapiToken')();
  const base = process.env.NEXT_PUBLIC_STRAPI_URL || 'http://127.0.0.1:1337';

  async function request(url, init = {}) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        if (init.method || attempt === 3) throw error;
        await sleep(1000 * attempt);
      }
    }
  }

  async function all(endpoint, fields, filters) {
    const rows = [];
    for (let page = 1, pageCount = 1; page <= pageCount; page++) {
      const params = new URLSearchParams({
        'pagination[page]': String(page),
        'pagination[pageSize]': '100',
        'sort[0]': 'cardId:asc',
        ...filters,
      });
      fields.forEach((field, index) => params.set(`fields[${index}]`, field));
      const payload = await request(`${base}/api/${endpoint}?${params}`);
      rows.push(...payload.data);
      pageCount = payload.meta.pagination.pageCount;
    }
    return rows;
  }

  const endpoint = options.language === 'EN' ? 'cards' : 'card-printings';
  const filters = options.language === 'EN' ? {} : { 'filters[language][$eq]': options.language };
  if (!options.overwrite) filters['filters[price][$null]'] = 'true';
  let cards = await all(endpoint, ['cardId', 'name', 'price', ...(endpoint === 'card-printings' ? ['language'] : [])], filters);
  cards = cards.map((card) => ({ ...card, language: card.language || 'EN' }));
  if (options.cardId) cards = cards.filter((card) => card.cardId.toUpperCase() === options.cardId.toUpperCase());
  if (options.limit) cards = cards.slice(0, options.limit);

  const observations = fs.existsSync(INPUT) ? JSON.parse(fs.readFileSync(INPUT, 'utf8')) : [];
  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.write ? 'write' : 'dry-run',
    language: options.language,
    records: [],
  };

  for (const card of cards) {
    const matching = observations.filter((row) =>
      String(row.cardId).toUpperCase() === card.cardId.toUpperCase() && row.language === card.language
    );
    const result = calculatePrice(matching, options.minimumSamples);
    const record = {
      documentId: card.documentId,
      cardId: card.cardId,
      name: card.name,
      language: card.language,
      currentPrice: card.price,
      searchUrl: buildSearchUrl(card),
      sampleSize: result.accepted.length,
      proposedPrice: result.price,
      status: result.reason || 'ready',
    };
    report.records.push(record);
    if (!options.write || result.price == null) continue;
    if (card.price != null && !options.overwrite) {
      record.status = 'preserved-existing-price';
      continue;
    }
    const sourceUrls = [...new Set(result.accepted.map((row) => row.sourceUrl))];
    const payload = {
      price: result.price,
      priceCurrency: 'EUR',
      priceSource: 'eBay',
      priceUpdatedAt: new Date().toISOString(),
      priceSampleSize: result.accepted.length,
      priceScope: 'FR',
      priceMethod: 'median_sold_listings',
      priceCondition: 'Ungraded',
      priceSourceUrl: sourceUrls[0],
    };
    await request(`${base}/api/${endpoint}/${card.documentId}?status=published`, {
      method: 'PUT',
      body: JSON.stringify({ data: payload }),
    });
    const verified = (await request(`${base}/api/${endpoint}/${card.documentId}`)).data;
    if (Number(verified.price) !== result.price || verified.priceSource !== 'eBay') throw new Error(`Write verification failed for ${card.cardId}`);
    record.status = 'written-and-verified';
  }

  report.counts = report.records.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
    return counts;
  }, {});
  save(REPORT, report);
  console.log(JSON.stringify(report.counts));
  console.log(`Report: ${REPORT}`);
  if (!fs.existsSync(INPUT)) {
    save(INPUT, []);
    console.log(`Observation template created: ${INPUT}`);
  }
}

if (require.main === module) {
  const { values } = parseArgs({
    options: {
      language: { type: 'string', default: 'FR' },
      limit: { type: 'string' },
      'card-id': { type: 'string' },
      'minimum-samples': { type: 'string', default: '1' },
      overwrite: { type: 'boolean', default: false },
      write: { type: 'boolean', default: false },
    },
  });
  const language = values.language.toUpperCase();
  if (!LANGUAGES.has(language)) throw new Error('Language must be EN, FR or JP');
  main({
    language,
    limit: values.limit ? Number(values.limit) : null,
    cardId: values['card-id'],
    minimumSamples: Number(values['minimum-samples']),
    overwrite: values.overwrite,
    write: values.write,
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildSearchUrl, calculatePrice, median };
