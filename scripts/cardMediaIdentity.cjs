function parseMediaIdentity(fileName) {
  const match = String(fileName).match(/^((?:OP|EB|PRB|ST|SD)[-_ ]?\d{2}|P)[-_ ](\d{3})((?:[_ -][PR]\d+)*)\.(png|jpe?g|webp)$/i);
  if (!match) return null;
  const series = match[1].toUpperCase().replace(/[-_ ]/g, '');
  const displayCode = `${series}-${match[2]}`;
  const variant = match[3].toUpperCase().replace(/[-_ ]/g, '_').replace(/^_/, '') || null;
  return { series, displayCode, variant, cardId: displayCode + (variant ? '_' + variant : '') };
}

function productCodes(text = '') {
  return [...String(text).matchAll(/(?:PRB|OP|EB|ST|SD)[- ]?\d{2}(?:[-/](?:PRB|OP|EB|ST|SD)[- ]?\d{2})*/gi)]
    .map(match => match[0].toUpperCase().replace(/(PRB|OP|EB|ST|SD)[- ](\d)/g, '$1$2').replace(/\//g, '-'));
}

function selectOfficial(media, entries) {
  const exact = (Array.isArray(entries) ? entries : entries ? [entries] : []).filter(card => card.cardId === media.cardId);
  const product = exact.filter(card => productCodes(card.cardSet).includes(media.setCode));
  // Generic promotional folders need an explicit product correspondence, not a guessed prefix.
  return product.length === 1 ? product[0] : null;
}

module.exports = { parseMediaIdentity, productCodes, selectOfficial };
