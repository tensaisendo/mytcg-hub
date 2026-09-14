const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMediaIdentity, productCodes, selectOfficial } = require('./cardMediaIdentity.cjs');
test('reprint, promo and compound suffixes stay distinct', () => {
  assert.equal(parseMediaIdentity('EB01-006_r1.png').cardId, 'EB01-006_R1');
  assert.equal(parseMediaIdentity('P-001_p2.webp').cardId, 'P-001_P2');
  assert.equal(parseMediaIdentity('ST-01-001_r1_p2.png').cardId, 'ST01-001_R1_P2');
  assert.equal(parseMediaIdentity('ST01.webp'), null);
  assert.equal(parseMediaIdentity('logo.png'), null);
});
test('combined regional products do not collapse into origin series', () => {
  assert.deepEqual(productCodes('Product [OP15-EB04]'), ['OP15-EB04']);
  assert.deepEqual(productCodes('商品【PRB-01】'), ['PRB01']);
});
test('official match requires exact identity AND product', () => {
  const media = { cardId: 'EB01-006_R1', setCode: 'PRB01' };
  const card = { cardId: media.cardId, cardSet: 'Product [PRB-01]' };
  assert.equal(selectOfficial(media, card), card);
  assert.equal(selectOfficial(media, { ...card, cardId: 'EB01-006' }), null);
  assert.equal(selectOfficial(media, { ...card, cardSet: 'Product [EB-01]' }), null);
  assert.equal(selectOfficial(media, [card, card]), null);
  assert.equal(selectOfficial({ ...media, setCode: 'MEDIA-1' }, card), null);
});
