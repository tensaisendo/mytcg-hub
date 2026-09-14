const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { calculateMarketPrice } = require('./cardTraderPricing');
const { matchPrinting } = require('./syncCardTraderLocalizedPrices');

test('bulk matching requires exact edition, base artwork and supported language', () => {
  const printing = { cardId: 'OP09-001', language: 'JP', set: { code: 'OP-09' }, variant: null };
  const expansion = { id: 1, code: 'op09' };
  const blueprint = { id: 42, fixed_properties: { collector_number: 'OP09-001' }, editable_properties: [{ name: 'onepiece_language', possible_values: ['jp'] }] };
  const blueprints = new Map([[1, [blueprint]]]);
  assert.equal(matchPrinting(printing, {}, [expansion], blueprints).blueprintId, 42);
  assert.equal(matchPrinting({ ...printing, language: 'FR' }, {}, [expansion], blueprints).reason, 'language-not-supported');
  assert.equal(matchPrinting({ ...printing, variant: 'P1' }, {}, [expansion], blueprints).reason, 'variant-needs-review');
  assert.equal(matchPrinting(printing, { treatment: { name: 'Manga Rare' } }, [expansion], blueprints).reason, 'special-treatment-needs-review');
  assert.equal(matchPrinting(printing, {}, [{ id: 1, code: 'prb01' }], blueprints).reason, 'unmatched-or-ambiguous-set');
  assert.equal(matchPrinting(printing, {}, [expansion], new Map([[1, [blueprint, blueprint]]])).reason, 'unmatched-or-ambiguous-blueprint');
});

function offer(language, cents = 100, overrides = {}) {
  return { blueprint_id: 42, price: { cents, currency: 'EUR' }, properties_hash: { condition: 'Near Mint', onepiece_language: language }, user: { country_code: 'IT' }, quantity: 1, ...overrides };
}
test('separates FR/JP/EN even if upstream returns mixed languages', () => {
  const products = [...Array.from({ length: 5 }, () => offer('en', 9000)), ...Array.from({ length: 3 }, () => offer('jp', 200)), offer('fr', 800)];
  assert.equal(calculateMarketPrice(products, new Date(), { language: 'JP', blueprintId: 42 }).price, 2);
  assert.equal(calculateMarketPrice(products, new Date(), { language: 'FR', blueprintId: 42 }).price, null);
});
test('rejects wrong blueprint, graded, unavailable and non-EUR offers', () => {
  const products = [offer('fr'), offer('fr', 100, { blueprint_id: 99 }), offer('fr', 100, { graded: true }), offer('fr', 100, { quantity: 0 }), offer('fr', 100, { price: { cents: 100, currency: 'USD' } })];
  const result = calculateMarketPrice(products, new Date(), { language: 'FR', blueprintId: 42 });
  assert.equal(result.price, null);
  assert.equal(result.priceSampleSize, 1);
});
test('prefers French sellers only when at least five admissible offers exist', () => {
  const products = [...Array.from({ length: 5 }, () => offer('fr', 300, { user: { country_code: 'FR' } })), ...Array.from({ length: 6 }, () => offer('fr', 100))];
  const result = calculateMarketPrice(products, new Date(), { language: 'FR', blueprintId: 42 });
  assert.equal(result.price, 3);
  assert.equal(result.priceScope, 'FR');
});
test('frontend never substitutes an EN price for a missing FR/JP price', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/strapi.ts'), 'utf8');
  const ast = ts.createSourceFile('strapi.ts', source, ts.ScriptTarget.Latest, true);
  const selected = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && ['distributionFromProduct', 'getPreferredPrinting', 'getCardDisplay'].includes(node.name?.text));
  const code = ts.transpileModule(selected.map((node) => node.getText(ast)).join('\n'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = { exports: {}, distributionsForLanguage: () => ({}) };
  vm.runInNewContext(code, context);
  const card = { price: 100, priceScope: 'FR', priceSource: 'CardTrader', printings: [{ language: 'JP', price: null }, { language: 'FR', price: 4 }] };
  assert.equal(context.exports.getCardDisplay(card, 'JP').price, null);
  assert.equal(context.exports.getCardDisplay(card, 'JP').priceSource, null);
  assert.equal(context.exports.getCardDisplay(card, 'FR').price, 4);
  assert.equal(context.exports.getCardDisplay(card, 'EN').price, 100);
});
