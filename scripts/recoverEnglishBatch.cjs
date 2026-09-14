const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { verifyRecoverySnapshot } = require('./verifyRecoverySnapshot.cjs');
const hub = path.resolve(__dirname, '..');
const cms = path.resolve(hub, '../mytcg-cms');
const Database = createRequire(path.join(cms, 'package.json'))('better-sqlite3');
const write = process.argv.includes('--write');
const limitIndex = process.argv.indexOf('--limit');
const limit = limitIndex < 0 ? 25 : Number(process.argv[limitIndex + 1]);
if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw Error('Use --limit between 1 and 50');
const dbPath = path.join(cms, '.tmp/data.db');
const out = path.join(cms, '.tmp/reports', `en-recovery-batch-${Date.now()}`);
const journal = { generatedAt: new Date().toISOString(), write, status: 'planning' };
const save = () => fs.writeFileSync(out + '.json', JSON.stringify(journal, null, 2) + '\n');
function run(ids, report, apply) {
  execFileSync(process.execPath, [path.join(__dirname, 'importCardsFromMedia.js'), '--language', 'EN', '--only-missing', '--summary', '--card-ids', ids.join(','), '--report', report, ...(apply ? ['--write'] : [])], { cwd: hub, stdio: 'inherit' });
  return JSON.parse(fs.readFileSync(report, 'utf8'));
}
async function main() {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const plan = JSON.parse(fs.readFileSync(path.join(cms, '.tmp/reports/card-recovery-plan.json'), 'utf8'));
  const db = new Database(dbPath, { readonly: true });
  try {
    const existing = new Set(db.prepare('SELECT card_id FROM cards').all().map(r => r.card_id));
    const deferred = new Set();
    if (!process.argv.includes('--retry-unverified')) {
      for (const file of fs.readdirSync(path.dirname(out)).filter(f => /^en-recovery-batch-\d+\.json$/.test(f))) {
        const previous = JSON.parse(fs.readFileSync(path.join(path.dirname(out), file), 'utf8'));
        if (previous.write && ['verified', 'dry-run-complete'].includes(previous.status)) {
          for (const id of previous.unverifiedIds || []) deferred.add(id);
        }
      }
    }
    journal.previouslyDeferred = [...deferred];
    const items = plan.items.filter(x => x.category === 'new-en-candidate' && x.language === 'EN' && !existing.has(x.cardId) && !deferred.has(x.cardId)).slice(0, limit);
    journal.requested = items.map(x => x.cardId);
    if (!items.length) { journal.status = 'nothing-to-do'; save(); return; }
    const dry = run(journal.requested, out + '-dry.json', false);
    if (dry.missingRelations.length) throw Error('Missing relations: review dry-run before creating');
    if (new Set(dry.plannedCards.map(c=>c.cardId)).size !== dry.plannedCards.length) throw Error('Duplicate planned identity');
    for (const card of dry.plannedCards) {
      const item = items.find(x => x.cardId === card.cardId);
      const set = db.prepare('SELECT key,language,is_legacy FROM sets WHERE id=?').get(card.setId);
      if (!item || item.imageId !== card.imageId || set?.key !== item.setKey || set.language !== 'EN' || set.is_legacy) throw Error('Media/Set changed since audit');
    }
    journal.validated = dry.plannedCards.map(c => c.cardId);
    journal.skippedOfficial = dry.missingOfficial;
    journal.unverifiedIds = journal.requested.filter(id => !journal.validated.includes(id));
    journal.status = 'dry-run-complete'; save();
    if (!write || !journal.validated.length) return;
    const backupDir = path.join(cms, '.tmp/backups'); fs.mkdirSync(backupDir, { recursive: true });
    journal.backup = path.join(backupDir, path.basename(out) + '.db');
    await db.backup(journal.backup);
    journal.status = 'writing'; save();
    const result = run(journal.validated, out + '-write.json', true);
    journal.created = result.createdCards;
    save();
    const before = new Database(journal.backup, { readonly: true });
    try {
      const oldRows = before.prepare('SELECT * FROM cards').all();
      const oldIds = new Set(oldRows.map(r => r.id));
      const added = db.prepare('SELECT * FROM cards').all().filter(r => !oldIds.has(r.id));
      const createdIds = new Set(result.createdCards.map(c=>c.cardId));
      if (added.some(r => !createdIds.has(r.card_id))) throw Error('Unexpected new card during batch');
      for (const entry of result.createdCards) {
        const rows = added.filter(r => r.card_id === entry.cardId);
        const expected = dry.plannedCards.find(c => c.cardId === entry.cardId);
        if (!expected || new Set(rows.map(r=>r.document_id)).size !== 1 || !rows.some(r=>r.published_at != null)) throw Error('Duplicate or unpublished card: ' + entry.cardId);
        for (const row of rows) {
          const images = db.prepare("SELECT file_id FROM files_related_mph WHERE related_type='api::card.card' AND field='image' AND related_id=?").all(row.id);
          const sets = db.prepare('SELECT set_id FROM cards_set_lnk WHERE card_id=?').all(row.id);
          if (images.length !== 1 || images[0].file_id !== expected.imageId || sets.length !== 1 || sets[0].set_id !== expected.setId || row.price !== null) throw Error('Invalid image/set/price: ' + entry.cardId);
        }
      }
      journal.verification = verifyRecoverySnapshot(before, db);
      journal.existingDataUnchanged = journal.verification.concurrentLocalizedPriceOrPublicationChanges.length === 0;
      journal.status = 'verified'; save();
    } finally { before.close(); }
  } finally { db.close(); }
}
main().then(()=>console.log(JSON.stringify({ status:journal.status, requested:journal.requested?.length, validated:journal.validated?.length, created:journal.created?.length || 0, report:out+'.json' },null,2))).catch(error=>{journal.status='failed-review-required';journal.error=error.message;save();console.error(error.message);process.exitCode=1;});
