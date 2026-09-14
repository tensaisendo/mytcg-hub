const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const Database = createRequire(path.resolve(__dirname,'../../mytcg-cms/package.json'))('better-sqlite3');
const { verifyRecoverySnapshot } = require('./verifyRecoverySnapshot.cjs');
function pair() {
  const before = new Database(':memory:');
  before.exec(`CREATE TABLE card_printings(id INTEGER,document_id TEXT,published_at INTEGER,updated_at INTEGER,price REAL,name TEXT);
    CREATE TABLE card_printings_set_lnk(id INTEGER,card_printing_id INTEGER,set_id INTEGER);
    CREATE TABLE files_related_mph(id INTEGER,related_id INTEGER,related_type TEXT,file_id INTEGER,field TEXT,"order" INTEGER);
    CREATE TABLE cards(id INTEGER,price REAL);
    INSERT INTO card_printings VALUES(1,'fr1',10,10,NULL,'Test');
    INSERT INTO card_printings_set_lnk VALUES(1,1,20);
    INSERT INTO files_related_mph VALUES(1,1,'api::card-printing.card-printing',30,'image',1);
    INSERT INTO cards VALUES(1,12);`);
  return [before, new Database(before.serialize())];
}
test('concurrent price review and republication preserve semantic links', () => {
  const [a,b] = pair();
  try {
    b.exec('UPDATE card_printings SET id=2,price=25,published_at=11; UPDATE files_related_mph SET id=2,related_id=2; UPDATE card_printings_set_lnk SET id=2,card_printing_id=2');
    assert.equal(verifyRecoverySnapshot(a,b).concurrentLocalizedPriceOrPublicationChanges.length,1);
  } finally { a.close(); b.close(); }
});
for (const [name,sql] of [['image','UPDATE files_related_mph SET file_id=999'],['set','UPDATE card_printings_set_lnk SET set_id=999'],['text',"UPDATE card_printings SET name='Changed'"],['existing EN price','UPDATE cards SET price=99']]) {
  test('rejects changes to '+name,()=>{const [a,b]=pair();try {b.exec(sql);assert.throws(()=>verifyRecoverySnapshot(a,b));}finally{a.close();b.close();}});
}

test('only explicitly approved new printing identities are allowed', () => {
  const [a,b]=pair();
  try {
    a.exec('ALTER TABLE card_printings ADD COLUMN printing_id TEXT');
    b.exec("ALTER TABLE card_printings ADD COLUMN printing_id TEXT; INSERT INTO card_printings VALUES(2,'new',11,11,NULL,'JP','OP01-001:JP'); INSERT INTO card_printings_set_lnk VALUES(2,2,21); INSERT INTO files_related_mph VALUES(2,2,'api::card-printing.card-printing',31,'image',1)");
    assert.throws(()=>verifyRecoverySnapshot(a,b),/count changed/);
    assert.doesNotThrow(()=>verifyRecoverySnapshot(a,b,['OP01-001:JP']));
    b.exec('UPDATE files_related_mph SET file_id=999 WHERE related_id=1');
    assert.throws(()=>verifyRecoverySnapshot(a,b,['OP01-001:JP']),/media\/set changed/);
  } finally {a.close();b.close();}
});
