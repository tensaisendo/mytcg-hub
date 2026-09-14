const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

const sources = require("../data/distribution-sources.json");
const languageArg = process.argv.find((value) => value.startsWith("--language="))?.split("=")[1]?.toUpperCase();
const languages = languageArg ? [languageArg] : Object.keys(sources);
const maxPages = Number(process.argv.find((value) => value.startsWith("--max-pages="))?.split("=")[1] || 80);
const reportPath = path.join(__dirname, "../data/official-distribution-audit.json");
const cardCodePattern = /\b(?:OP|EB|ST|P|PRB)\s*-?\s*\d{1,2}\s*-\s*\d{3}\b/gi;

function normalizeCardCode(value) {
  return value.toUpperCase().replace(/\s+/g, "").replace(/^(OP|EB|ST|PRB)-(\d+)/, "$1$2");
}

function eventLinks(html, baseUrl) {
  const origin = new URL(baseUrl).origin;
  return [...html.matchAll(/href=["']([^"'#]+)["']/gi)]
    .map((match) => new URL(match[1], baseUrl).href)
    .filter((url) => url.startsWith(origin) && /\/(events|news)\//.test(url));
}

async function auditLanguage(language) {
  const config = sources[language];
  if (!config) throw new Error(`Unsupported language ${language}`);
  const queue = [...config.indexes];
  const visited = new Set();
  const matches = [];
  while (queue.length && visited.size < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const { data } = await axios.get(url, { timeout: 10000, headers: { "User-Agent": "MYTCG-HUB distribution audit" } });
      const html = String(data);
      const cardIds = [...new Set((html.match(cardCodePattern) || []).map(normalizeCardCode))];
      if (cardIds.length) matches.push({ url, cardIds });
      for (const link of eventLinks(html, url)) if (!visited.has(link) && queue.length < maxPages * 3) queue.push(link);
    } catch (error) {
      matches.push({ url, error: error.response?.status || error.code || error.message });
    }
  }
  return { market: config.market, checkedAt: new Date().toISOString(), pagesChecked: visited.size, matches };
}

async function main() {
  const report = {};
  for (const language of languages) report[language] = await auditLanguage(language);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([language, value]) => [language, { pagesChecked: value.pagesChecked, pagesWithCards: value.matches.filter((item) => item.cardIds).length }])), null, 2));
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
