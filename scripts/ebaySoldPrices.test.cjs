const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSearchUrl, calculatePrice, median } = require('./syncEbaySoldPrices');

test('median supports odd and even samples', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('only valid ungraded EUR sold observations are priced', () => {
  const valid = (soldPrice) => ({ soldPrice, currency: 'EUR', graded: false, soldAt: '2026-08-01', sourceUrl: `https://ebay.fr/${soldPrice}` });
  const result = calculatePrice([
    valid(10), valid(12), valid(100),
    { ...valid(1), graded: true },
    { ...valid(1), currency: 'USD' },
  ]);
  assert.equal(result.price, 12);
  assert.equal(result.accepted.length, 3);
});

test('one valid observation is accepted as a low-confidence fallback', () => {
  const row = { soldPrice: 10, currency: 'EUR', graded: false, soldAt: '2026-08-01', sourceUrl: 'https://ebay.fr/1' };
  assert.equal(calculatePrice([row]).price, 10);
});

test('search URL includes language and sold filters', () => {
  const url = buildSearchUrl({ cardId: 'OP05-119_P2', name: 'Monkey D. Luffy', language: 'FR' });
  assert.match(url, /LH_Sold=1/);
  assert.match(url, /LH_Complete=1/);
  assert.match(decodeURIComponent(url), /FR\+francais/);
});
