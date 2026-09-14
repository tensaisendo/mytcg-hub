type ExtensionLabel = {
  code: string;
  name: string;
  labelFr?: string | null;
  labelJp?: string | null;
};

function seriesCodes(value: string) {
  return Array.from(value.toUpperCase().matchAll(/\b(?:PRB|OP|EB|ST|SD)[-\s]?\d{2}\b/g),
    ([code]) => code.replace(/[-\s]/g, ""));
}

function withoutSeriesCode(label: string) {
  const code = "(?:PRB|OP|EB|ST|SD)[-\\s]?\\d{2}";
  const productCode = `${code}(?:\\s*[-/]\\s*${code})*`;
  const prefix = new RegExp(`^\\s*[\\[\\u3010(]?${productCode}(?![\\w])(?:[\\]\\u3011)])?\\s*(?:[-:\\u2013\\u2014]\\s*)?`, "i");
  const suffix = new RegExp(`\\s*(?:[-:\\u2013\\u2014]\\s*)?[\\[\\u3010(]?${productCode}(?:[\\]\\u3011)])?\\s*$`, "i");
  return label.replace(prefix, "").replace(suffix, "").trim() || "Extension sans nom";
}

export function getExtensionLabel(extension: ExtensionLabel, language: string) {
  const localized = language === "FR" ? extension.labelFr : language === "JP" ? extension.labelJp : null;
  const expected = seriesCodes(extension.code);
  const candidates = [localized, extension.name];
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    const codes = seriesCodes(candidate);
    // Reprint imports may have saved another product's title as this set's label.
    if (expected.length && codes.length && !codes.some((code) => expected.includes(code))) continue;
    return withoutSeriesCode(candidate.trim());
  }
  return "Extension sans nom";
}
