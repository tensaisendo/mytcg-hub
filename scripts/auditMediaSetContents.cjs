const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const cms = path.resolve(__dirname, '../../mytcg-cms');
const Database = createRequire(path.join(cms, 'package.json'))('better-sqlite3');
const db = new Database(path.join(cms, '.tmp/data.db'), { readonly: true });
const folders = db.prepare('SELECT id, name, path FROM upload_folders').all();
const files = db.prepare('SELECT f.id, f.name, l.folder_id FROM files f JOIN files_folder_lnk l ON l.file_id = f.id').all();
db.close();
const roots = folders.filter(f => ['EN', 'FR', 'JP'].includes(f.name));
const products = [];
for (const root of roots) {
  for (const folder of folders.filter(f => f.path.startsWith(root.path + '/') && f.path.split('/').length === root.path.split('/').length + 1)) {
    const ids = new Set(folders.filter(f => f.id === folder.id || f.path.startsWith(folder.path + '/')).map(f => f.id));
    const items = files.filter(f => ids.has(f.folder_id));
    const baseCodes = new Set(), variants = new Set(), unparsed = [], seen = new Map();
    for (const item of items) {
      const stem = item.name.replace(/\.[^.]+$/, '').toUpperCase();
      const match = stem.match(/^((?:OP|ST|EB|PRB|SD)[-_ ]?\d{2}|P)[-_ ](\d{3})(.*)$/);
      if (!match) { unparsed.push(item.name); continue; }
      const base = match[1].replace(/[-_ ]/g, '') + '-' + match[2];
      const variant = base + match[3];
      baseCodes.add(base); variants.add(variant);
      seen.set(variant, [...(seen.get(variant) || []), item.name]);
    }
    const codes = Array.from(folder.name.toUpperCase().matchAll(/(?:PRB|OP|EB|ST|SD)[- ]?\d{2}/g), m => m[0].replace(/[- ]/g, ''));
    products.push({ language: root.name, folderId: folder.id, folder: root.name + '/' + folder.name, productCode: codes.join('-') || null,
      fileCount: items.length, baseCount: baseCodes.size, variantCount: variants.size,
      baseCodes: [...baseCodes].sort(), variants: [...variants].sort(), unparsed,
      duplicateNames: [...seen].filter(([, names]) => names.length > 1) });
  }
}
const comparisons = [];
for (let i = 0; i < products.length; i++) for (let j = i + 1; j < products.length; j++) {
  const a = products[i], b = products[j];
  if (!a.productCode || a.productCode !== b.productCode || a.language === b.language) continue;
  comparisons.push({ code: a.productCode, a: a.folder, b: b.folder,
    files: [a.fileCount, b.fileCount], baseCounts: [a.baseCount, b.baseCount],
    onlyA: a.baseCodes.filter(c => !b.baseCodes.includes(c)), onlyB: b.baseCodes.filter(c => !a.baseCodes.includes(c)),
    variantNamesOnlyA: a.variants.filter(c => !b.variants.includes(c)), variantNamesOnlyB: b.variants.filter(c => !a.variants.includes(c)) });
}
const report = { generatedAt: new Date().toISOString(), scope: 'Uploaded Media Library contents only; filenames do not prove matching artwork or complete official checklists.', products, comparisons };
const output = path.resolve(__dirname, '../data/media-set-contents-audit.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, languages: roots.map(r => ({ language: r.name, folders: products.filter(p => p.language === r.name).length, files: products.filter(p => p.language === r.name).reduce((n,p) => n+p.fileCount,0) })),
  comparisons: comparisons.length, differentBaseContents: comparisons.filter(c => c.onlyA.length || c.onlyB.length).length,
  differences: comparisons.filter(c => c.onlyA.length || c.onlyB.length).map(c => ({code:c.code,languages:[c.a.split('/')[0],c.b.split('/')[0]],files:c.files,baseCounts:c.baseCounts,onlyA:c.onlyA,onlyB:c.onlyB})),
  unparsed: products.filter(p => p.unparsed.length).map(p=>({folder:p.folder,count:p.unparsed.length,examples:p.unparsed.slice(0,3)})) }, null, 2));
