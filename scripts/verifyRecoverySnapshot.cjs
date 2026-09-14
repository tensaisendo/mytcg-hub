function verifyRecoverySnapshot(before, after, allowedNewPrintingIds = []) {
  const compareDocuments = (table, ignored = []) => {
    const previousRows = before.prepare(`SELECT * FROM "${table}"`).all();
    const currentRows = after.prepare(`SELECT * FROM "${table}"`).all();
    const documentIds = new Set(previousRows.map(row => row.document_id));
    const relevantCurrent = currentRows.filter(row => documentIds.has(row.document_id));
    const rowKey = row => `${row.document_id}:${row.published_at == null ? 'draft' : 'published'}`;
    const mutable = new Set(['id', 'updated_at', 'published_at', 'updated_by_id', ...ignored]);
    const stable = row => Object.fromEntries(Object.entries(row).filter(([key]) => !mutable.has(key)));
    const currentByKey = new Map(relevantCurrent.map(row => [rowKey(row), row]));
    if (currentByKey.size !== relevantCurrent.length || relevantCurrent.length !== previousRows.length) {
      throw Error(`${table} document count changed`);
    }
    for (const row of previousRows) {
      const currentRow = currentByKey.get(rowKey(row));
      if (!currentRow || JSON.stringify(stable(row)) !== JSON.stringify(stable(currentRow))) {
        throw Error(`${table} identity/content changed: ${rowKey(row)}`);
      }
    }
    return { previousRows, relevantCurrent, rowKey };
  };

  // Strapi may recreate draft/published physical rows while publishing or updating a price.
  // Compare stable Card content by document identity instead of SQLite row ids.
  const cards = compareDocuments('cards');

  const previous = before.prepare('SELECT * FROM card_printings').all();
  const previousDocuments = new Set(previous.map(r => r.document_id));
  const allCurrent = after.prepare('SELECT * FROM card_printings').all();
  const current = allCurrent.filter(r => previousDocuments.has(r.document_id) || !allowedNewPrintingIds.includes(r.printing_id));
  const key = row => `${row.document_id}:${row.published_at == null ? 'draft' : 'published'}`;
  const mutable = new Set(['id', 'updated_at', 'published_at', 'updated_by_id']);
  const stable = row => Object.fromEntries(Object.entries(row).filter(([k]) => !mutable.has(k) && !k.startsWith('price')));
  const now = new Map(current.map(r => [key(r), r]));
  if (now.size !== current.length || current.length !== previous.length) throw Error('Localized document count changed');
  const concurrent = [];
  for (const row of previous) {
    const next = now.get(key(row));
    if (!next || JSON.stringify(stable(row)) !== JSON.stringify(stable(next))) throw Error('Localized identity/text changed: ' + key(row));
    if (JSON.stringify(row) !== JSON.stringify(next)) concurrent.push(key(row));
  }
  const semantics = (db, rows, table) => {
    const records = new Map(rows.map(r => [r.id, key(r)]));
    if (table === 'files_related_mph') return db.prepare("SELECT * FROM files_related_mph WHERE related_type='api::card-printing.card-printing'").all()
      .filter(r => records.has(r.related_id)).map(r => [records.get(r.related_id), r.file_id, r.field, r.order]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return db.prepare('SELECT * FROM card_printings_set_lnk').all().filter(r=>records.has(r.card_printing_id)).map(r => [records.get(r.card_printing_id),r.set_id]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  };
  for (const table of ['files_related_mph','card_printings_set_lnk']) {
    if (JSON.stringify(semantics(before,previous,table)) !== JSON.stringify(semantics(after,current,table))) throw Error('Localized media/set changed: ' + table);
  }
  const cardImages = (db, rows) => {
    const records = new Map(rows.map(row => [row.id, cards.rowKey(row)]));
    return db.prepare("SELECT * FROM files_related_mph WHERE related_type='api::card.card'").all()
      .filter(row => records.has(row.related_id))
      .map(row => [records.get(row.related_id), row.file_id, row.field, row.order])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  };
  if (JSON.stringify(cardImages(before, cards.previousRows)) !== JSON.stringify(cardImages(after, cards.relevantCurrent))) {
    throw Error('Card media changed');
  }
  const tables = before.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name).filter(t=>/^(cards|card_printings|files|user_cards)(_|$)/.test(t));
  for (const table of tables) {
    if (table === 'cards' || ['card_printings','card_printings_set_lnk'].includes(table)) continue;
    const live = new Map(after.prepare(`SELECT * FROM "${table}"`).all().map(r=>[r.id,r]));
    for (const row of before.prepare(`SELECT * FROM "${table}"`).all()) {
      if (table === 'files_related_mph' && ['api::card.card', 'api::card-printing.card-printing'].includes(row.related_type)) continue;
      if (JSON.stringify(live.get(row.id)) !== JSON.stringify(row)) throw Error(`Existing data changed: ${table}:${row.id}`);
    }
  }
  return { existingEnAndCollectionRowsUnchanged: true, localizedIdentityTextImagesSetsUnchanged: true, concurrentLocalizedPriceOrPublicationChanges: concurrent };
}
module.exports = { verifyRecoverySnapshot };
