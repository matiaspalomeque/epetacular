#!/usr/bin/env node
// Usage: node scripts/update-cpi.js
// Fetches fresh CPI data from INDEC and appends new months to js/cpi.js.

const https = require("https");
const fs = require("fs");
const path = require("path");

const API_URL =
  "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=200&sort=asc";
const CPI_FILE = path.join(__dirname, "..", "js", "cpi.js");

// "MM/YYYY" → YYYYMM integer for reliable ordering
function keyToInt(key) {
  const [mm, yyyy] = key.split("/");
  return parseInt(yyyy) * 100 + parseInt(mm);
}

// "YYYY-MM-DD" → "MM/YYYY"
function isoToKey(isoDate) {
  const [yyyy, mm] = isoDate.split("-");
  return `${mm}/${yyyy}`;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Accept: "application/json" } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from INDEC API`));
          res.resume();
          return;
        }
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error("Respuesta de INDEC no es JSON válido"));
          }
        });
      })
      .on("error", reject);
  });
}

async function main() {
  // 1. Read js/cpi.js
  let fileText;
  try {
    fileText = fs.readFileSync(CPI_FILE, "utf8");
  } catch (err) {
    console.error(`No se pudo leer ${CPI_FILE}: ${err.message}`);
    process.exit(1);
  }

  // 2. Extract all existing "MM/YYYY" keys
  const existingKeys = [...fileText.matchAll(/"(\d{2}\/\d{4})":/g)].map(
    (m) => m[1]
  );
  if (existingKeys.length === 0) {
    console.error("No se encontraron claves MM/YYYY en js/cpi.js");
    process.exit(1);
  }
  const latestKey = existingKeys.reduce((a, b) =>
    keyToInt(a) >= keyToInt(b) ? a : b
  );
  const latestInt = keyToInt(latestKey);

  // 3. Fetch INDEC API
  let json;
  try {
    json = await fetchJSON(API_URL);
  } catch (err) {
    console.error(`Error al consultar INDEC: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(json.data)) {
    console.error("Formato inesperado en respuesta de INDEC");
    process.exit(1);
  }

  // 4-6. Parse, convert dates, filter to strictly newer months
  const newEntries = json.data
    .map(([isoDate, value]) => ({ key: isoToKey(isoDate), value }))
    .filter(({ key }) => keyToInt(key) > latestInt);

  // 7. Nothing new
  if (newEntries.length === 0) {
    console.log(`Ya actualizado. Último disponible: ${latestKey}`);
    process.exit(0);
  }

  // 8-9. Format lines and insert before the closing `};`
  const newLines = newEntries
    .map(({ key, value }) => `    "${key}": ${parseFloat(value).toFixed(2)},`)
    .join("\n");

  // Replace last occurrence of `};` line (handles trailing newline variants)
  const closingPattern = /(\n\s*\};)/;
  if (!closingPattern.test(fileText)) {
    console.error("No se encontró la línea de cierre `};` en js/cpi.js");
    process.exit(1);
  }
  const updatedText = fileText.replace(closingPattern, `\n${newLines}$1`);

  // 10. Write file back
  fs.writeFileSync(CPI_FILE, updatedText, "utf8");

  // 11. Report
  const addedKeys = newEntries.map((e) => e.key).join(", ");
  console.log(`Agregado ${newEntries.length} mes${newEntries.length > 1 ? "es" : ""}: ${addedKeys}`);
}

main();
