const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { verifyRecoverySnapshot } = require('./verifyRecoverySnapshot.cjs');
const hub = path.resolve(__dirname, '..');
const cms = path.resolve(hub, '../mytcg-cms');
const Database = createRequire(path.join(cms, 'package.json'))('better-sqlite3');
const args = process.argv.slice(2);
const value = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const language = value('--language', 'FR').toUpperCase();
const limit = Number(value('--limit', '5'));
const write = args.includes('--write');
if (!['FR','JP'].includes(language) || !Number.isInteger(limit) || limit < 1 || limit > 50) throw Error('Use --language FR|JP and --limit 1..50');
const out = path.join(cms, '.tmp/reports', `localized-recovery-${language}-${Date.now()}`);
const journal = { generatedAt: new Date().toISOString(), language, write, status: 'planning' };
const save = () => fs.writeFileSync(out + '.json', JSON.stringify(journal,null,2) + '\n');
function run(ids, report, apply) {
  execFileSync(process.execPath, [path.join(__dirname,'importCardsFromMedia.js'), '--language', language, '--only-missing', '--summary', '--card-ids', ids.join(','), '--report', report, ...(apply ? ['--write'] : [])], {cwd:hub,stdio:'inherit'});
  return JSON.parse(fs.readFileSync(report,'utf8'));
}
async function main() {
  fs.mkdirSync(path.dirname(out),{recursive:true});
  const plan = JSON.parse(fs.readFileSync(path.join(cms,'.tmp/reports/card-recovery-plan.json'),'utf8'));
  const db = new Database(path.join(cms,'.tmp/data.db'),{readonly:true});
  try {
    const exists = new Set(db.prepare('SELECT printing_id FROM card_printings').all().map(r=>r.printing_id));
    const deferred = new Set();
    if (!args.includes('--retry-unverified')) for (const file of fs.readdirSync(path.dirname(out)).filter(f=>new RegExp(`^localized-recovery-${language}-\\d+\\.json$`).test(f))) {
      const old = JSON.parse(fs.readFileSync(path.join(path.dirname(out),file),'utf8'));
      if (old.write && ['verified','dry-run-complete'].includes(old.status)) for (const id of old.unverifiedIds || []) deferred.add(id);
    }
    const items = plan.items.filter(i=>i.language===language && i.category==='new-local-printing-candidate' && !exists.has(`${i.cardId}:${language}`) && !deferred.has(i.cardId)).slice(0,limit);
    journal.requested=items.map(i=>i.cardId);
    if (!items.length) {journal.status='nothing-to-do';save();return;}
    const dry=run(journal.requested,out+'-dry.json',false);
    if (dry.createdCards.length || dry.plannedCards.length || dry.missingRelations.length) throw Error('Unexpected shared-card or relation mutation');
    const proposed=dry.printingOperations;
    if (new Set(proposed.map(p=>p.data.printingId)).size!==proposed.length) throw Error('Duplicate printing proposal');
    for (const op of proposed) {
      const d=op.data,item=items.find(i=>i.cardId===d.cardId);
      const set=db.prepare('SELECT key,language,is_legacy FROM sets WHERE id=?').get(d.set?.connect?.id);
      const canonical=db.prepare('SELECT DISTINCT document_id FROM cards WHERE card_id=?').all(d.cardId);
      if (op.action!=='planned' || !item || d.language!==language || d.printingId!==`${d.cardId}:${language}` || d.image!==item.imageId || set?.key!==item.setKey || set.language!==language || set.is_legacy || canonical.length!==1 || d.price!==null || !d.name) throw Error('Invalid localized proposal: '+d.cardId);
    }
    journal.validated=proposed.map(p=>p.data.cardId);
    journal.unverifiedIds=journal.requested.filter(id=>!journal.validated.includes(id));
    journal.skippedOfficial=dry.missingOfficial;
    journal.status='dry-run-complete';save();
    if (!write || !proposed.length) return;
    const backups=path.join(cms,'.tmp/backups');fs.mkdirSync(backups,{recursive:true});
    journal.backup=path.join(backups,path.basename(out)+'.db');await db.backup(journal.backup);
    journal.status='writing';save();
    const result=run(journal.validated,out+'-write.json',true);
    journal.created=result.printingOperations;save();
    const before=new Database(journal.backup,{readonly:true});
    try {
      if (result.createdCards.length) throw Error('Unexpected Card creation');
      const allowed=[];
      for (const op of journal.created) {
        const d=op.data,expected=proposed.find(p=>p.data.printingId===d.printingId)?.data;
        if (op.action!=='created' || !expected || JSON.stringify(expected)!==JSON.stringify(d)) throw Error('Payload changed after simulation');
        const rows=db.prepare('SELECT * FROM card_printings WHERE printing_id=?').all(d.printingId);
        if (new Set(rows.map(r=>r.document_id)).size!==1 || !rows.some(r=>r.published_at!=null)) throw Error('Duplicate or unpublished printing');
        for (const row of rows) {
          const images=db.prepare("SELECT file_id FROM files_related_mph WHERE related_type='api::card-printing.card-printing' AND field='image' AND related_id=?").all(row.id);
          const sets=db.prepare('SELECT set_id FROM card_printings_set_lnk WHERE card_printing_id=?').all(row.id);
          if (row.language!==language || row.name!==d.name || row.effect!==d.effect || row.card_id!==d.cardId || row.price!==null || images.length!==1 || images[0].file_id!==d.image || sets.length!==1 || sets[0].set_id!==d.set.connect.id) throw Error('Localized data verification failed: '+d.printingId);
        }
        allowed.push(d.printingId);
      }
      if (db.prepare('SELECT count(*) n FROM cards').get().n!==before.prepare('SELECT count(*) n FROM cards').get().n) throw Error('Shared Card count changed');
      journal.verification=verifyRecoverySnapshot(before,db,allowed);
      journal.status='verified';save();
    } finally {before.close();}
  } finally {db.close();}
}
main().then(()=>console.log(JSON.stringify({status:journal.status,language,requested:journal.requested?.length,validated:journal.validated?.length,created:journal.created?.length||0,report:out+'.json'},null,2))).catch(e=>{journal.status='failed-review-required';journal.error=e.message;save();console.error(e.message);process.exitCode=1;});
