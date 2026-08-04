const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 8787);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "backend-data");
const VERSIONS_DIR = path.join(DATA_DIR, "versions");
const CURRENT_FILE = path.join(DATA_DIR, "current.json");
const MAX_BODY_BYTES = 25 * 1024 * 1024;

const EXPECTED_COLUMNS = [
  "PDP URL",
  "Product",
  "Segment",
  "Prijs",
  "Segment_Basis",
  "Variant_Van",
  "FAQ",
  "Antwoord",
  "PAA_Basis",
  "AIO_Inzicht",
  "ChatGPT_Frame",
  "Reddit_Twijfel",
  "Review_Gebruikt",
  "Spec_Gebruikt",
  "Competitive_Gaps",
  "EEAT_notes",
  "Trail_PAA",
  "Trail_AIO",
  "Trail_ChatGPT",
  "Trail_Reddit",
  "Trail_Reviews",
  "Trail_Competitors",
  "SERP_Features",
  "Sources",
  "Product_Feed_Data",
];

const SOURCE_DEFINITIONS = [
  { key: "paa", label: "PAA", valueField: "PAA_Basis", trailField: "Trail_PAA" },
  { key: "aio", label: "AIO", valueField: "AIO_Inzicht", trailField: "Trail_AIO" },
  { key: "chatgpt", label: "ChatGPT", valueField: "ChatGPT_Frame", trailField: "Trail_ChatGPT" },
  { key: "reddit", label: "Reddit", valueField: "Reddit_Twijfel", trailField: "Trail_Reddit" },
  { key: "reviews", label: "Reviews", valueField: "Review_Gebruikt", trailField: "Trail_Reviews" },
  { key: "specs", label: "Specs", valueField: "Spec_Gebruikt" },
  { key: "competitors", label: "SERP/Concurrenten", valueField: "SERP_Features", trailField: "Trail_Competitors" },
];

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function text(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return text(value).toLowerCase();
}

function slugify(value) {
  return normalize(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseCsv(textValue) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = textValue.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  if (!rows.length) throw new Error("De CSV is leeg.");

  const [headers, ...body] = rows;
  const missingColumns = EXPECTED_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length) {
    throw new Error(`Kolommen ontbreken: ${missingColumns.join(", ")}`);
  }

  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function extractBetween(value, start, end) {
  const source = text(value);
  const startIndex = source.indexOf(start);
  if (startIndex === -1) return "";
  const valueStart = startIndex + start.length;
  const endIndex = end ? source.indexOf(end, valueStart) : -1;
  return source.slice(valueStart, endIndex === -1 ? undefined : endIndex).trim();
}

function parseFeedData(feedData) {
  const title = extractBetween(feedData, "Titel:", " | Categorie:");
  const category = extractBetween(feedData, "Categorie:", " | Omschrijving:");
  const description = extractBetween(feedData, "Omschrijving:", " | Specs:");
  const specsRaw = extractBetween(feedData, "Specs:", "");
  const specs = {};

  for (const line of specsRaw.split(/\n+/)) {
    const index = line.indexOf(":");
    if (index > -1) {
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key && value) specs[key] = value;
    }
  }

  return {
    title,
    category: category || "Onbekend",
    description,
    specs,
    brand: specs.Brand || "Onbekend",
  };
}

function parseSources(value) {
  return text(value)
    .split("|")
    .map((source) => source.trim())
    .filter(Boolean);
}

function isUsedValue(value) {
  const normalized = normalize(value);
  if (!normalized) return false;
  if (normalized === "niet gebruikt") return false;
  if (normalized === "nvt" || normalized === "n.v.t." || normalized === "-") return false;
  if (normalized.startsWith("niet gebruikt")) return false;
  if (normalized.startsWith("geen ") || normalized.startsWith("❌ geen ")) return false;
  return true;
}

function hasResearchValue(value) {
  const normalized = normalize(value);
  if (!normalized) return false;
  if (normalized.includes("niet beschikbaar")) return false;
  return true;
}

function buildInputSources(row) {
  return SOURCE_DEFINITIONS.map((definition) => {
    const value = text(row[definition.valueField]);
    const trail = definition.trailField ? text(row[definition.trailField]) : "";
    return {
      key: definition.key,
      label: definition.label,
      value,
      trail,
      used: isUsedValue(value),
      hasResearch: hasResearchValue(trail),
    };
  });
}

function buildDataFromRows(rows, sourceFile) {
  const productsByKey = new Map();
  const usedProductIds = new Set();
  const faqs = [];

  rows.forEach((row, index) => {
    const feed = parseFeedData(row.Product_Feed_Data);
    const key = row["PDP URL"] || row.Product || `product-${index + 1}`;
    const inputSources = buildInputSources(row);
    const faq = {
      id: `faq-${index + 1}`,
      productUrl: row["PDP URL"],
      product: row.Product,
      segment: row.Segment,
      price: row.Prijs,
      segmentBasis: row.Segment_Basis,
      variantOf: row.Variant_Van,
      question: row.FAQ,
      answer: row.Antwoord,
      paaBasis: row.PAA_Basis,
      aioInsight: row.AIO_Inzicht,
      chatgptFrame: row.ChatGPT_Frame,
      redditDoubt: row.Reddit_Twijfel,
      reviewUsed: row.Review_Gebruikt,
      specUsed: row.Spec_Gebruikt,
      competitiveGaps: row.Competitive_Gaps,
      serpFeatures: row.SERP_Features,
      inputSources,
      researchTrail: inputSources.map((source) => source.trail).filter(Boolean).join("\n\n"),
      researchSections: inputSources
        .filter((source) => source.trail)
        .map((source) => ({ label: source.label, text: source.trail })),
      sources: parseSources(row.Sources),
      eeatNotes: row.EEAT_notes,
    };
    faqs.push(faq);

    if (!productsByKey.has(key)) {
      const baseId = slugify(row.Product || `product-${productsByKey.size + 1}`) || `product-${productsByKey.size + 1}`;
      let id = baseId;
      let idSuffix = 2;
      while (usedProductIds.has(id)) {
        id = `${baseId}-${idSuffix}`;
        idSuffix += 1;
      }
      usedProductIds.add(id);

      productsByKey.set(key, {
        id,
        name: row.Product || "Onbekend product",
        url: row["PDP URL"],
        segment: row.Segment,
        price: row.Prijs,
        segmentBasis: row.Segment_Basis,
        variantOf: row.Variant_Van,
        category: feed.category,
        brand: feed.brand,
        feedTitle: feed.title,
        description: feed.description,
        specs: feed.specs,
        faqs: [],
      });
    }

    productsByKey.get(key).faqs.push(faq);
  });

  const products = Array.from(productsByKey.values()).sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const categories = Array.from(new Set(products.map((product) => product.category))).sort((a, b) => a.localeCompare(b, "nl"));
  const brands = Array.from(new Set(products.map((product) => product.brand))).sort((a, b) => a.localeCompare(b, "nl"));
  const sourceSet = new Set(faqs.flatMap((faq) => faq.sources));
  const sourceUsage = Object.fromEntries(SOURCE_DEFINITIONS.map((definition) => [
    definition.key,
    faqs.filter((faq) => faq.inputSources.some((source) => source.key === definition.key && source.used)).length,
  ]));
  const withAnyInput = faqs.filter((faq) => faq.inputSources.some((source) => source.used)).length;

  return {
    generatedAt: new Date().toISOString(),
    sourceFile,
    imported: true,
    summary: {
      faqCount: faqs.length,
      productCount: products.length,
      categoryCount: categories.length,
      brandCount: brands.length,
      sourceCount: sourceSet.size,
      withCompetitiveGaps: faqs.filter((faq) => isUsedValue(faq.competitiveGaps)).length,
      withEeatNotes: faqs.filter((faq) => faq.eeatNotes).length,
      withAnyInput,
      sourceUsage,
    },
    categories,
    brands,
    products,
    faqs,
  };
}

function ensureStore() {
  fs.mkdirSync(VERSIONS_DIR, { recursive: true });
}

function readBundledData() {
  const source = fs.readFileSync(path.join(ROOT_DIR, "data.js"), "utf8");
  const match = source.match(/window\.BAX_FAQ_DATA\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!match) throw new Error("Kon data.js niet lezen.");
  return JSON.parse(match[1]);
}

function versionPath(id) {
  if (!/^[a-z0-9._-]+$/i.test(id)) throw new Error("Ongeldige versie-id.");
  return path.join(VERSIONS_DIR, `${id}.json`);
}

function readVersion(id) {
  return JSON.parse(fs.readFileSync(versionPath(id), "utf8"));
}

function listVersions() {
  ensureStore();
  return fs.readdirSync(VERSIONS_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const version = JSON.parse(fs.readFileSync(path.join(VERSIONS_DIR, file), "utf8"));
      return version.meta;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function readCurrentId() {
  try {
    return JSON.parse(fs.readFileSync(CURRENT_FILE, "utf8")).currentId;
  } catch {
    return null;
  }
}

function writeCurrentId(id) {
  ensureStore();
  fs.writeFileSync(CURRENT_FILE, JSON.stringify({ currentId: id }, null, 2));
}

function getCurrentPayload() {
  const currentId = readCurrentId();
  if (currentId && fs.existsSync(versionPath(currentId))) {
    const version = readVersion(currentId);
    return { currentId, version: version.meta, data: version.data, backend: true };
  }
  const bundled = readBundledData();
  return {
    currentId: "bundled",
    version: {
      id: "bundled",
      sourceFile: bundled.sourceFile || "data.js",
      createdAt: bundled.generatedAt || new Date(0).toISOString(),
      summary: bundled.summary,
      bundled: true,
    },
    data: bundled,
    backend: true,
  };
}

function createVersion({ sourceFile, csvText }) {
  if (!csvText || typeof csvText !== "string") throw new Error("Geen CSV ontvangen.");
  const rows = parseCsv(csvText);
  const data = buildDataFromRows(rows, sourceFile || "sheet-export.csv");
  if (!data.summary.faqCount) throw new Error("Geen FAQ-records gevonden.");

  ensureStore();
  const createdAt = new Date().toISOString();
  const hash = crypto.createHash("sha1").update(csvText).digest("hex").slice(0, 8);
  const id = `${createdAt.replace(/[:.]/g, "-")}-${hash}`;
  const meta = {
    id,
    sourceFile: sourceFile || "sheet-export.csv",
    createdAt,
    summary: data.summary,
    bundled: false,
  };
  fs.writeFileSync(versionPath(id), JSON.stringify({ meta, data }, null, 2));
  writeCurrentId(id);
  return { currentId: id, version: meta, data, backend: true };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("Upload is te groot."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Ongeldige JSON-body."));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(ROOT_DIR, safePath));
  if (!filePath.startsWith(ROOT_DIR)) {
    sendError(res, 403, "Verboden pad.");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendError(res, 404, "Niet gevonden.");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
    });
    res.end(content);
  });
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && pathname === "/api/current") {
      sendJson(res, 200, getCurrentPayload());
      return;
    }
    if (req.method === "GET" && pathname === "/api/versions") {
      sendJson(res, 200, {
        currentId: readCurrentId() || "bundled",
        bundled: getCurrentPayload().version,
        versions: listVersions(),
      });
      return;
    }
    if (req.method === "POST" && pathname === "/api/versions") {
      const body = await readJsonBody(req);
      sendJson(res, 201, createVersion(body));
      return;
    }
    if (req.method === "POST" && pathname === "/api/activate") {
      const body = await readJsonBody(req);
      const id = text(body.id);
      if (id === "bundled") {
        writeCurrentId("bundled");
        sendJson(res, 200, getCurrentPayload());
        return;
      }
      if (!id || !fs.existsSync(versionPath(id))) throw new Error("Versie niet gevonden.");
      writeCurrentId(id);
      sendJson(res, 200, getCurrentPayload());
      return;
    }
    sendError(res, 404, "API-route niet gevonden.");
  } catch (error) {
    sendError(res, 400, error.message || "Onbekende fout.");
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url.pathname);
    return;
  }
  serveStatic(req, res, decodeURIComponent(url.pathname));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Bax FAQ backend draait op http://127.0.0.1:${PORT}`);
});
