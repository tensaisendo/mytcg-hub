const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Load only pure update/query functions, never the importer's main routine.
const source = fs.readFileSync(path.join(__dirname, 'importCardsFromMedia.js'), 'utf8');
const ast = ts.createSourceFile('importer.js', source, ts.ScriptTarget.Latest, true);
const names = ['fetchAll', 'getExistingCards', 'getCardUpdateData', 'validateSetAssignments', 'getMediaSet', 'updateLocalizedRelationLabel', 'getTreatment', 'getDistributionMetadata', 'buildPrintingPayload'];
const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map((node) => node.getText(ast)).join('\n');

function setup(api = {}, language = 'EN') {
  const { folderEdition } = require('../../mytcg-cms/scripts/set-edition.cjs');
  const context = vm.createContext({ api, LANGUAGE: language, folderEdition });
  vm.runInContext(functions, context);
  return context;
}

test('FR imports cannot replace the base EN set relation', () => {
  const { getCardUpdateData } = setup({}, 'FR');
  const result = getCardUpdateData({data:{set:{connect:{id:200}}}}, {set:{id:100}});
  assert.equal(Object.hasOwn(result,'set'),false);
});

test('reprint suffix does not imply Alternative Art', () => {
  const { getTreatment } = setup();
  assert.equal(getTreatment({variant:'R1'}, {rarity:'SR'}), null);
  assert.equal(getTreatment({variant:'P1'}, {rarity:'SP'}), 'SP');
});

test('event products become printing provenance, not rarity or treatment', () => {
  const { getDistributionMetadata } = setup();
  assert.deepEqual(
    { ...getDistributionMetadata({ cardSet: 'CS 25-26 Event Pack Finalist Ver.' }) },
    { distribution: 'CS 25-26 Event Pack Finalist Ver.', acquisition: 'Finaliste', event: 'Championship' },
  );
  assert.deepEqual(
    { ...getDistributionMetadata({ cardSet: '-ROMANCE DAWN- [OP01]' }) },
    { distribution: null, acquisition: null, event: null },
  );
});

test('localized printing never falls back to English effect', () => {
  const { buildPrintingPayload } = setup({}, 'FR');
  const media = { cardId:'EB01-006_R1', file:{id:1} };
  assert.equal(buildPrintingPayload(media, {name:'Chopper',effect:'-'}, {effect:'English text'}, 3).data.effect, null);
  assert.throws(()=>buildPrintingPayload(media, null, {name:'English name'}, 3), /Missing FR official text/);
});

test('reprint folders never overwrite localized Set labels', async () => {
  const { updateLocalizedRelationLabel } = setup({}, 'FR');
  assert.equal(await updateLocalizedRelationLabel({},'set',51,'PRB02 - Wrong label'),'skipped');
});

test('the product folder, not the card prefix, defines the regional edition', () => {
  const { getMediaSet } = setup({}, 'FR');
  const folders = new Map([['/57/87',{id:87,name:'PRB02 - ONE PIECE CARD THE BEST VOL.2'}]]);
  const result = getMediaSet({name:'ST16-001.png',folderPath:'/57/87/999'},folders,'/57');
  assert.equal(result.setKey,'PRB02:FR');
  assert.equal(result.mediaFolderId,87);
});

test('conflicting product identities abort before writes', () => {
  const { validateSetAssignments } = setup({}, 'FR');
  const card = {cardId:'ST16-001',setKey:'ST16:FR',fileName:'ST16-001.png'};
  assert.throws(()=>validateSetAssignments([card,{...card,setKey:'PRB02:FR'}],new Map(),new Map()),/Multiple products/);
  assert.throws(()=>validateSetAssignments([card],new Map(),new Map([['ST16-001:FR',{set:{key:'PRB02:FR'}}]])),/Set conflict/);
  assert.doesNotThrow(()=>validateSetAssignments([card],new Map(),new Map([['ST16-001:FR',{set:{key:'ST16:FR'}}]])));
});

test('preserves every existing treatment, including legacy relation shape', () => {
  const { getCardUpdateData } = setup();
  for (const treatment of [{ id: 4, name: 'Manga Rare' }, { id: 6, name: 'SP' }, { id: 2, name: 'Alternative Art' }, { data: { id: 4 } }]) {
    const update = getCardUpdateData({ data: { treatment: { connect: { id: 2 } } } }, { treatment });
    assert.equal(Object.hasOwn(update, 'treatment'), false);
  }
});

test('fills only explicitly empty relations; missing populate cannot overwrite', () => {
  const { getCardUpdateData } = setup();
  const payload = { data: { treatment: { connect: { id: 2 } } } };
  for (const treatment of [null, { data: null }]) {
    assert.equal(getCardUpdateData(payload, { treatment }).treatment.connect.id, 2);
  }
  assert.equal(Object.hasOwn(getCardUpdateData(payload, {}), 'treatment'), false);
  assert.equal(Object.hasOwn(getCardUpdateData({ data: {} }, { treatment: null }), 'treatment'), false);
});

test('loads existing treatment on every page', async () => {
  let calls = 0;
  const { getExistingCards } = setup({ get: async (endpoint, { params }) => {
    assert.equal(endpoint, '/cards');
    assert.equal(params['populate[treatment][fields][0]'], 'name');
    calls++;
    return { data: { data: [{ cardId: `card-${calls}`, treatment: { id: 4 } }], meta: { pagination: { pageCount: 2 } } } };
  } });
  const cards = await getExistingCards();
  assert.equal(calls, 2);
  assert.equal(cards.get('card-2').treatment.id, 4);
});

test('media imports never overwrite an existing market price', () => {
  const { getCardUpdateData } = setup();
  for (const price of [10, null, undefined]) {
    const update = getCardUpdateData({ data: { price: null } }, { price });
    assert.equal(Object.hasOwn(update, 'price'), false);
  }
});
