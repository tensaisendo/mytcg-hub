const fs = require("node:fs");
const path = require("node:path");

module.exports = function getStrapiToken(key = "STRAPI_API_TOKEN") {
  const envFile = path.resolve(__dirname, "../.env.local");
  if (!process.env[key] && fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const token = process.env[key] || process.env.STRAPI_API_TOKEN;
  if (!token) throw new Error("Missing " + key + " in the environment or .env.local");
  return token;
};
