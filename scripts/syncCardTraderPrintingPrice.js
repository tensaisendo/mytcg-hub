const { parseArgs } = require('node:util');
const { calculateMarketPrice, flattenProducts } = require('./cardTraderPricing');

const CT = 'https://api.cardtrader.com/api/v2';
const normalize = (value) => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

async function run(options) {
  const language = options.language?.toUpperCase();
  if (!['FR', 'JP'].includes(language)) throw new Error('--language must be FR or JP');
  if (!options['card-id'] || !/^\d+$/.test(options['blueprint-id'] || '') || !/^\d+$/.test(options['expansion-id'] || '')) {
    throw new Error('--card-id, --blueprint-id and --expansion-id are required');
  }
  const cardId = options['card-id'].toUpperCase();
  const strapiToken = require('./strapiToken')();
  const ctToken = process.env.CARDTRADER_API_TOKEN;
  if (!ctToken) throw new Error('Missing CARDTRADER_API_TOKEN');
  const base = process.env.NEXT_PUBLIC_STRAPI_URL || 'http://127.0.0.1:1337';
  async function request(url, token, init = {}) {
    const attempts = !init.method ? 3 : 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        if (attempt === attempts || /^HTTP 4(?!29)/.test(error.message)) {
          throw new Error(`${new URL(url).host}${new URL(url).pathname}: ${error.cause?.code || error.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    }
  }
  const params = new URLSearchParams({ 'filters[cardId][$eq]': cardId, 'filters[language][$eq]': language, 'populate[set]': 'true' });
  const printingUrl = `${base}/api/card-printings?${params}`;
  const printings = await request(printingUrl, strapiToken);
  if (printings.data?.length !== 1) throw new Error(`Expected exactly one published ${cardId}:${language}`);
  const printing = printings.data[0];
  if (printing.price != null) return { cardId, language, status: 'preserved-existing-price', price: printing.price };

  const expansions = await request(`${CT}/expansions`, ctToken);
  const expansion = expansions.find((item) => String(item.id) === options['expansion-id'] && item.game_id === 15);
  if (!expansion) throw new Error('One Piece expansion not found');
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const exported = await request(`${CT}/blueprints/export?expansion_id=${expansion.id}`, ctToken);
  const blueprint = (Array.isArray(exported) ? exported : exported.array).find((item) => String(item.id) === options['blueprint-id']);
  // The pilot deliberately excludes variants and reprints that require visual review.
  if (!blueprint || blueprint.version || printing.variant || cardId.includes('_') || blueprint.fixed_properties?.collector_number?.toUpperCase() !== cardId) {
    throw new Error('Ambiguous edition/variant: manual review required, no price written');
  }
  const apiLanguage = language === 'JP' ? 'jp' : 'fr';
  if (!blueprint.editable_properties?.find((p) => p.name === 'onepiece_language')?.possible_values.includes(apiLanguage)) {
    throw new Error('This blueprint does not support the requested language');
  }
  let set = printing.set;
  if (!set) {
    const canonical = await request(`${base}/api/cards?${new URLSearchParams({ 'filters[cardId][$eq]': cardId, 'populate[set]': 'true' })}`, strapiToken);
    set = canonical.data?.[0]?.set;
  }
  if (!set?.code || normalize(set.code) !== normalize(expansion.code)) throw new Error('Set mismatch: manual review required, no price written');

  await new Promise((resolve) => setTimeout(resolve, 1100));
  const products = await request(`${CT}/marketplace/products?${new URLSearchParams({ blueprint_id: options['blueprint-id'], language: apiLanguage })}`, ctToken);
  const result = calculateMarketPrice(products, new Date(), { language, blueprintId: options['blueprint-id'] });
  const report = { cardId, language, blueprintId: options['blueprint-id'], expansion: expansion.name, offersReturned: flattenProducts(products).length, ...result, status: result.price == null ? 'insufficient-offers' : 'dry-run' };
  if (options.write && result.price != null) {
    // Re-read immediately before writing: never overwrite a price added in the meantime.
    const fresh = await request(printingUrl, strapiToken);
    if (fresh.data?.length !== 1 || fresh.data[0].documentId !== printing.documentId || fresh.data[0].price != null) throw new Error('Printing changed; stopped without writing');
    await request(`${base}/api/card-printings/${printing.documentId}?status=published`, strapiToken, {
      method: 'PUT', body: JSON.stringify({ data: { ...result, cardTraderBlueprintId: options['blueprint-id'] } }),
    });
    const verified = await request(printingUrl, strapiToken);
    if (Number(verified.data?.[0]?.price) !== result.price) throw new Error('Price write verification failed');
    report.status = 'written-and-verified';
  }
  return report;
}

if (require.main === module) {
  const { values } = parseArgs({ options: { language: { type: 'string' }, 'card-id': { type: 'string' }, 'blueprint-id': { type: 'string' }, 'expansion-id': { type: 'string' }, write: { type: 'boolean', default: false } } });
  run(values).then((report) => console.log(JSON.stringify(report, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { run };
