const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join('..','mytcg-cms','.tmp','data.db'), { readonly: true });
const rows = db.prepare(`select card_id, name, slug, price, card_trader_blueprint_id from cards where price is null and instr(card_id, '_')=0 and published_at is not null order by card_id`).all();
console.log(JSON.stringify(rows, null, 2));
