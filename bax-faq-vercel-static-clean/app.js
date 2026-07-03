const DEFAULT_DATA = window.BAX_FAQ_DATA;
const STORAGE_KEY = "bax-follo-faq-data:v4";
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

let DATA = loadStoredData() || DEFAULT_DATA;
let BACKEND_AVAILABLE = false;
let CURRENT_VERSION_ID = "bundled";

const state = {
  query: "",
  category: "all",
  source: "all",
  selectedProductId: "",
  view: "cards",
};

const elements = {
  faqCount: document.querySelector("#faqCount"),
  productCount: document.querySelector("#productCount"),
  categoryCount: document.querySelector("#categoryCount"),
  sourceCount: document.querySelector("#sourceCount"),
  gapCoverage: document.querySelector("#gapCoverage"),
  eeatCoverage: document.querySelector("#eeatCoverage"),
  coverageLabel: document.querySelector("#coverageLabel"),
  searchInput: document.querySelector("#searchInput"),
  categorySelect: document.querySelector("#categorySelect"),
  sourceSelect: document.querySelector("#sourceSelect"),
  productList: document.querySelector("#productList"),
  visibleProductCount: document.querySelector("#visibleProductCount"),
  selectedCategory: document.querySelector("#selectedCategory"),
  selectedProduct: document.querySelector("#selectedProduct"),
  selectedDescription: document.querySelector("#selectedDescription"),
  pdpLink: document.querySelector("#pdpLink"),
  metaStrip: document.querySelector("#metaStrip"),
  faqHeading: document.querySelector("#faqHeading"),
  cardsPanel: document.querySelector("#cardsPanel"),
  tablePanel: document.querySelector("#tablePanel"),
  faqCards: document.querySelector("#faqCards"),
  faqTableWrap: document.querySelector("#faqTableWrap"),
  faqTableBody: document.querySelector("#faqTableBody"),
  copyVisibleButton: document.querySelector("#copyVisibleButton"),
  copyProductButton: document.querySelector("#copyProductButton"),
  exportButton: document.querySelector("#exportButton"),
  csvImportInput: document.querySelector("#csvImportInput"),
  resetDataButton: document.querySelector("#resetDataButton"),
  dataStatus: document.querySelector("#dataStatus"),
  backendMode: document.querySelector("#backendMode"),
  versionSelect: document.querySelector("#versionSelect"),
  activateVersionButton: document.querySelector("#activateVersionButton"),
  refreshVersionsButton: document.querySelector("#refreshVersionsButton"),
  toast: document.querySelector("#toast"),
};

function text(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return text(value).toLowerCase();
}

function formatPrice(value) {
  const raw = text(value);
  if (!raw) return "-";
  if (raw.includes("€")) return raw;

  const amount = Number(raw.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(amount)) return raw;

  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

function slugify(value) {
  return normalize(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function loadStoredData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed?.products?.length || !parsed?.faqs?.length) return null;
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request mislukt (${response.status})`);
  return payload;
}

function canUseBackend() {
  return window.location?.protocol === "http:" || window.location?.protocol === "https:";
}

function setBackendAvailable(isAvailable) {
  BACKEND_AVAILABLE = isAvailable;
  elements.backendMode.textContent = isAvailable
    ? "Verbonden · uploads worden als serverversies opgeslagen"
    : "Niet verbonden · import wordt alleen in deze browser opgeslagen";
  elements.versionSelect.disabled = !isAvailable;
  elements.activateVersionButton.disabled = !isAvailable;
  elements.refreshVersionsButton.disabled = !isAvailable;
}

function formatVersionLabel(version) {
  if (!version) return "Onbekende versie";
  const date = version.createdAt ? new Date(version.createdAt) : null;
  const dateLabel = date && !Number.isNaN(date.valueOf())
    ? date.toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })
    : "zonder datum";
  const countLabel = version.summary?.faqCount ? `${version.summary.faqCount} FAQ's` : "geen telling";
  return `${version.sourceFile || version.id} · ${dateLabel} · ${countLabel}`;
}

function renderVersionOptions({ bundled, versions, currentId }) {
  elements.versionSelect.replaceChildren();
  if (bundled) {
    elements.versionSelect.append(createElement("option", {
      text: `Standaard · ${formatVersionLabel(bundled)}`,
      attrs: { value: "bundled" },
    }));
  }
  for (const version of versions || []) {
    elements.versionSelect.append(createElement("option", {
      text: formatVersionLabel(version),
      attrs: { value: version.id },
    }));
  }
  elements.versionSelect.value = currentId || "bundled";
}

async function loadBackendVersions() {
  if (!BACKEND_AVAILABLE) return;
  const payload = await fetchJson("/api/versions");
  renderVersionOptions(payload);
}

async function tryLoadBackendData() {
  if (!canUseBackend()) {
    setBackendAvailable(false);
    return;
  }

  try {
    const payload = await fetchJson("/api/current");
    if (!payload?.data?.products?.length) throw new Error("Backend gaf geen dataset terug.");
    DATA = payload.data;
    CURRENT_VERSION_ID = payload.currentId || "bundled";
    localStorage.removeItem(STORAGE_KEY);
    setBackendAvailable(true);
    await loadBackendVersions();
  } catch {
    setBackendAvailable(false);
  }
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

function parseTrail(value) {
  const sections = [];
  let active = null;

  for (const line of text(value).split("\n")) {
    const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (match) {
      active = { label: match[1], text: match[2].trim() };
      sections.push(active);
    } else if (active && line.trim()) {
      active.text = `${active.text}\n${line.trim()}`.trim();
    }
  }

  return sections;
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

function createElement(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value !== undefined && value !== null) node.setAttribute(key, value);
    }
  }
  return node;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2200);
}

function matchesSource(faq) {
  if (state.source === "all") return true;
  return faq.inputSources.some((source) => source.key === state.source && source.used);
}

function matchesQuery(product, faq) {
  if (!state.query) return true;
  const haystack = [
    product.name,
    product.category,
    product.brand,
    product.segment,
    product.price,
    product.segmentBasis,
    product.variantOf,
    product.description,
    faq.segment,
    faq.price,
    faq.segmentBasis,
    faq.variantOf,
    faq.question,
    faq.answer,
    faq.competitiveGaps,
    faq.eeatNotes,
    ...faq.inputSources.flatMap((source) => [source.label, source.value, source.trail]),
    faq.sources.join(" "),
  ].map(normalize).join(" ");
  return haystack.includes(state.query);
}

function getMatchingFaqs(product) {
  return product.faqs.filter((faq) => matchesSource(faq) && matchesQuery(product, faq));
}

function getVisibleProducts() {
  return DATA.products.filter((product) => {
    const categoryOk = state.category === "all" || product.category === state.category;
    return categoryOk && getMatchingFaqs(product).length > 0;
  });
}

function getSelectedProduct(visibleProducts) {
  if (!visibleProducts.length) return null;
  const selected = visibleProducts.find((product) => product.id === state.selectedProductId);
  if (selected) return selected;
  state.selectedProductId = visibleProducts[0].id;
  return visibleProducts[0];
}

function getFilteredFaqRows() {
  return getVisibleProducts().flatMap((product) => (
    getMatchingFaqs(product).map((faq) => ({ product, faq }))
  ));
}

function resetFilters() {
  state.query = "";
  state.category = "all";
  state.source = "all";
  state.selectedProductId = "";
  state.view = "cards";
  elements.searchInput.value = "";
  elements.categorySelect.value = "all";
  elements.sourceSelect.value = "all";
  document.querySelectorAll(".view-button").forEach((item) => item.classList.toggle("active", item.dataset.view === "cards"));
}

function updateDataStatus() {
  const source = DATA.sourceFile ? `Dataset: ${DATA.sourceFile}` : "Dataset geladen";
  const imported = BACKEND_AVAILABLE ? "Backend dataset" : DATA.imported ? "Geimporteerd" : "Standaard dataset";
  elements.dataStatus.textContent = `${imported} · ${source} · ${DATA.summary.faqCount} FAQ's · ${DATA.summary.productCount} producten`;
  elements.resetDataButton.hidden = BACKEND_AVAILABLE || !DATA.imported;
}

function applyData(nextData, shouldPersist = false) {
  DATA = nextData;
  if (shouldPersist && !BACKEND_AVAILABLE) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
  }
  resetFilters();
  renderSummary();
  renderCategoryOptions();
  renderSourceOptions();
  updateDataStatus();
  render();
}

async function handleCsvImport(file) {
  if (!file) return;
  try {
    const csvText = await file.text();
    const rows = parseCsv(csvText);
    const nextData = buildDataFromRows(rows, file.name);
    if (!nextData.summary.faqCount) throw new Error("Geen FAQ-records gevonden.");

    if (BACKEND_AVAILABLE) {
      const payload = await fetchJson("/api/versions", {
        method: "POST",
        body: JSON.stringify({ sourceFile: file.name, csvText }),
      });
      DATA = payload.data;
      CURRENT_VERSION_ID = payload.currentId;
      await loadBackendVersions();
      resetFilters();
      renderSummary();
      renderCategoryOptions();
      renderSourceOptions();
      updateDataStatus();
      render();
      showToast(`${payload.data.summary.faqCount} FAQ's opgeslagen als backendversie`);
    } else {
      applyData(nextData, true);
      showToast(`${nextData.summary.faqCount} FAQ's lokaal geladen`);
    }
  } catch (error) {
    showToast(error.message || "CSV importeren is niet gelukt");
  } finally {
    elements.csvImportInput.value = "";
  }
}

function renderSummary() {
  const summary = DATA.summary;
  elements.faqCount.textContent = summary.faqCount;
  elements.productCount.textContent = summary.productCount;
  elements.categoryCount.textContent = summary.categoryCount;
  elements.sourceCount.textContent = summary.sourceCount;

  const faqCount = summary.faqCount || 1;
  const anyInputPercent = Math.round(((summary.withAnyInput ?? summary.withCompetitiveGaps ?? 0) / faqCount) * 100);
  const aioPercent = Math.round(((summary.sourceUsage?.aio ?? 0) / faqCount) * 100);
  const redditPercent = Math.round(((summary.sourceUsage?.reddit ?? 0) / faqCount) * 100);

  elements.gapCoverage.style.flexBasis = `${Math.max(aioPercent, 2)}%`;
  elements.eeatCoverage.style.flexBasis = `${Math.max(redditPercent, 2)}%`;
  elements.gapCoverage.title = `${aioPercent}% met AIO-inzicht gebruikt`;
  elements.eeatCoverage.title = `${redditPercent}% met Reddit-input gebruikt`;
  elements.coverageLabel.textContent = `${anyInputPercent}%`;
}

function renderCategoryOptions() {
  elements.categorySelect.replaceChildren();
  elements.categorySelect.append(createElement("option", { text: "Alle categorieen", attrs: { value: "all" } }));
  for (const category of DATA.categories) {
    elements.categorySelect.append(createElement("option", { text: category, attrs: { value: category } }));
  }
}

function renderSourceOptions() {
  elements.sourceSelect.replaceChildren();
  elements.sourceSelect.append(createElement("option", { text: "Alle inputbronnen", attrs: { value: "all" } }));
  for (const source of SOURCE_DEFINITIONS) {
    const count = DATA.summary.sourceUsage?.[source.key] ?? 0;
    elements.sourceSelect.append(createElement("option", {
      text: `${source.label} gebruikt (${count})`,
      attrs: { value: source.key },
    }));
  }
}

function renderProductList(visibleProducts) {
  elements.productList.replaceChildren();
  elements.visibleProductCount.textContent = `${visibleProducts.length} zichtbaar`;

  if (!visibleProducts.length) {
    elements.productList.append(createElement("div", {
      className: "empty-state",
      text: "Geen producten gevonden voor deze filters.",
    }));
    return;
  }

  for (const product of visibleProducts) {
    const button = createElement("button", {
      className: `product-item${product.id === state.selectedProductId ? " active" : ""}`,
      attrs: { type: "button", "data-product-id": product.id },
    });
    button.append(createElement("span", { className: "product-title", text: product.name }));

    const meta = createElement("span", { className: "product-meta" });
    meta.append(createElement("span", { className: "chip", text: product.category }));
    if (text(product.segment)) meta.append(createElement("span", { className: "chip", text: `Segment ${product.segment}` }));
    if (text(product.price)) meta.append(createElement("span", { className: "chip", text: formatPrice(product.price) }));
    meta.append(createElement("span", { className: "chip", text: product.brand }));
    meta.append(createElement("span", { className: "chip", text: `${getMatchingFaqs(product).length} FAQ` }));
    button.append(meta);

    button.addEventListener("click", () => {
      state.selectedProductId = product.id;
      render();
    });

    elements.productList.append(button);
  }
}

function renderMeta(product, faqs) {
  elements.metaStrip.replaceChildren();
  const chips = [
    ["Brand", product.brand],
    ["Categorie", product.category],
    ["Segment", product.segment || "-"],
    ["Prijs", formatPrice(product.price)],
    ["FAQ's", faqs.length],
    ["AIO", faqs.filter((faq) => faq.inputSources.some((source) => source.key === "aio" && source.used)).length],
    ["Reddit", faqs.filter((faq) => faq.inputSources.some((source) => source.key === "reddit" && source.used)).length],
    ["Specs", faqs.filter((faq) => faq.inputSources.some((source) => source.key === "specs" && source.used)).length],
  ];

  for (const [label, value] of chips) {
    elements.metaStrip.append(createElement("span", {
      className: "chip",
      text: `${label}: ${value}`,
    }));
  }

  for (const [key, value] of Object.entries(product.specs).slice(0, 4)) {
    if (key !== "Brand") {
      elements.metaStrip.append(createElement("span", {
        className: "chip",
        text: `${key}: ${value}`,
      }));
    }
  }
}

function renderSource(source) {
  const isUrl = /^https?:\/\//i.test(source);
  const label = source.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  if (isUrl) {
    return createElement("a", {
      className: "chip",
      text: label,
      attrs: { href: source, target: "_blank", rel: "noreferrer" },
    });
  }
  return createElement("span", { className: "chip", text: source });
}

function renderInputUsage(faq) {
  const section = createElement("section", { className: "input-usage" });
  section.append(createElement("h5", { text: "Gebruikte input" }));
  const grid = createElement("div", { className: "input-grid" });

  for (const source of faq.inputSources) {
    const status = source.used ? "Gebruikt" : source.hasResearch ? "Research aanwezig" : "Niet gebruikt";
    const card = createElement("div", {
      className: `input-card ${source.used ? "used" : source.hasResearch ? "research-only" : "unused"}`,
    });
    const head = createElement("div", { className: "input-card-head" });
    head.append(createElement("strong", { text: source.label }));
    head.append(createElement("span", { text: status }));
    card.append(head);
    card.append(createElement("p", {
      text: source.value || (source.hasResearch ? "Niet direct gebruikt in het antwoord." : "Niet gebruikt."),
    }));
    grid.append(card);
  }

  section.append(grid);
  return section;
}

function renderResearchTabs(faq) {
  const available = faq.inputSources.filter((source) => source.trail);
  if (!available.length) return null;

  const details = createElement("details", {
    className: "research-details",
    attrs: { open: "" },
  });
  details.append(createElement("summary", { text: "Research trail per bron" }));

  const tabs = createElement("div", { className: "research-tabs" });
  const buttons = createElement("div", { className: "trail-tab-buttons", attrs: { role: "tablist" } });
  const panels = createElement("div", { className: "trail-panels" });

  available.forEach((source, index) => {
    const tabId = `${faq.id}-${source.key}`;
    buttons.append(createElement("button", {
      className: `trail-tab${index === 0 ? " active" : ""}`,
      text: source.label,
      attrs: {
        type: "button",
        role: "tab",
        "data-trail-tab": tabId,
        "aria-selected": index === 0 ? "true" : "false",
      },
    }));

    const panel = createElement("div", {
      className: `trail-panel${index === 0 ? " active" : ""}`,
      attrs: {
        role: "tabpanel",
        "data-trail-panel": tabId,
      },
    });
    panel.append(createElement("p", { text: source.trail }));
    panels.append(panel);
  });

  tabs.append(buttons, panels);
  details.append(tabs);
  return details;
}

function renderFaqCards(product, faqs) {
  elements.faqCards.replaceChildren();

  if (!faqs.length) {
    elements.faqCards.append(createElement("div", {
      className: "empty-state",
      text: "Geen FAQ's gevonden binnen dit product voor deze filters.",
    }));
    return;
  }

  for (const faq of faqs) {
    const card = createElement("article", { className: "faq-card" });

    const header = createElement("div", { className: "faq-card-header" });
    header.append(createElement("h4", { text: faq.question }));
    const statusRow = createElement("div", { className: "chip-row" });
    for (const source of faq.inputSources.filter((item) => item.used).slice(0, 4)) {
      statusRow.append(createElement("span", { className: "status-chip source", text: source.label }));
    }
    header.append(statusRow);
    card.append(header);

    card.append(createElement("p", { className: "faq-answer", text: faq.answer }));
    card.append(renderInputUsage(faq));

    const noteGrid = createElement("div", { className: "note-grid" });
    if (isUsedValue(faq.competitiveGaps)) {
      const gap = createElement("div", { className: "note" });
      gap.append(createElement("strong", { text: "Competitive gap" }));
      gap.append(createElement("p", { text: faq.competitiveGaps }));
      noteGrid.append(gap);
    }
    if (text(faq.eeatNotes)) {
      const eeat = createElement("div", { className: "note eeat-note" });
      eeat.append(createElement("strong", { text: "E-E-A-T notitie" }));
      eeat.append(createElement("p", { text: faq.eeatNotes }));
      noteGrid.append(eeat);
    }
    if (noteGrid.children.length) card.append(noteGrid);

    const sources = createElement("div", { className: "source-row" });
    for (const source of faq.sources) sources.append(renderSource(source));
    card.append(sources);

    const researchTabs = renderResearchTabs(faq);
    if (researchTabs) card.append(researchTabs);

    elements.faqCards.append(card);
  }
}

function renderFaqTable(product, faqs) {
  elements.faqTableBody.replaceChildren();

  for (const faq of faqs) {
    const byKey = Object.fromEntries(faq.inputSources.map((source) => [source.key, source]));
    const row = document.createElement("tr");
    row.append(createElement("td", { className: "segment-cell", text: faq.segment || product.segment || "-" }));
    row.append(createElement("td", { className: "price-cell", text: formatPrice(faq.price || product.price) }));
    row.append(createElement("td", { className: "question-cell", text: faq.question }));
    row.append(createElement("td", { className: "answer-cell", text: faq.answer }));
    row.append(createElement("td", { text: byKey.paa?.value || "-" }));
    row.append(createElement("td", { text: byKey.aio?.value || "-" }));
    row.append(createElement("td", { text: byKey.chatgpt?.value || "-" }));
    row.append(createElement("td", { text: byKey.reddit?.value || "-" }));
    row.append(createElement("td", { text: byKey.reviews?.value || "-" }));
    row.append(createElement("td", { text: byKey.specs?.value || "-" }));
    row.append(createElement("td", { text: isUsedValue(faq.competitiveGaps) ? faq.competitiveGaps : "-" }));
    elements.faqTableBody.append(row);
  }
}

function updateViewTabs() {
  document.querySelectorAll(".view-button").forEach((button) => {
    const isActive = button.dataset.view === state.view;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.setAttribute("tabindex", isActive ? "0" : "-1");
  });

  const showCards = state.view === "cards";
  elements.cardsPanel.hidden = !showCards;
  elements.tablePanel.hidden = showCards;
  elements.cardsPanel.classList.toggle("active", showCards);
  elements.tablePanel.classList.toggle("active", !showCards);
}

function renderDetail(product) {
  if (!product) {
    elements.selectedCategory.textContent = "Geen resultaat";
    elements.selectedProduct.textContent = "Geen producten gevonden";
    elements.selectedDescription.textContent = "Pas de zoekterm of filters aan.";
    elements.pdpLink.removeAttribute("href");
    elements.metaStrip.replaceChildren();
    elements.faqHeading.textContent = "FAQ's";
    elements.faqCards.replaceChildren(createElement("div", {
      className: "empty-state",
      text: "Geen FAQ's om te tonen.",
    }));
    elements.faqTableBody.replaceChildren();
    updateViewTabs();
    return;
  }

  const faqs = getMatchingFaqs(product);
  elements.selectedCategory.textContent = product.category;
  elements.selectedProduct.textContent = product.name;
  elements.selectedDescription.textContent = product.description || "Geen productomschrijving in de feeddata.";
  elements.pdpLink.href = product.url;
  elements.faqHeading.textContent = `${faqs.length} FAQ's voor dit product`;
  renderMeta(product, faqs);
  renderFaqCards(product, faqs);
  renderFaqTable(product, faqs);
  updateViewTabs();
}

function render() {
  const visibleProducts = getVisibleProducts();
  const product = getSelectedProduct(visibleProducts);
  renderProductList(visibleProducts);
  renderDetail(product);
}

function formatFaqText(rows) {
  return rows.map(({ product, faq }, index) => [
    `${index + 1}. ${product.name}`,
    `PDP: ${product.url}`,
    `Segment: ${faq.segment || product.segment || "-"}`,
    `Prijs: ${formatPrice(faq.price || product.price)}`,
    `Vraag: ${faq.question}`,
    `Antwoord: ${faq.answer}`,
    "Gebruikte input:",
    ...faq.inputSources.map((source) => `- ${source.label}: ${source.value || "niet gebruikt"}`),
    isUsedValue(faq.competitiveGaps) ? `Competitive gap: ${faq.competitiveGaps}` : "",
    faq.eeatNotes ? `E-E-A-T: ${faq.eeatNotes}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast(successMessage);
}

function csvEscape(value) {
  const output = text(value);
  if (/[",\n\r]/.test(output)) return `"${output.replace(/"/g, "\"\"")}"`;
  return output;
}

function exportCsv() {
  const rows = getFilteredFaqRows();
  const header = EXPECTED_COLUMNS;
  const lines = [
    header.join(","),
    ...rows.map(({ product, faq }) => {
      const byKey = Object.fromEntries(faq.inputSources.map((source) => [source.key, source]));
      return [
        product.url,
        product.name,
        faq.segment || product.segment,
        faq.price || product.price,
        faq.segmentBasis || product.segmentBasis,
        faq.variantOf || product.variantOf,
        faq.question,
        faq.answer,
        byKey.paa?.value,
        byKey.aio?.value,
        byKey.chatgpt?.value,
        byKey.reddit?.value,
        byKey.reviews?.value,
        byKey.specs?.value,
        faq.competitiveGaps,
        faq.eeatNotes,
        byKey.paa?.trail,
        byKey.aio?.trail,
        byKey.chatgpt?.trail,
        byKey.reddit?.trail,
        byKey.reviews?.trail,
        byKey.competitors?.trail,
        byKey.competitors?.value,
        faq.sources.join(" | "),
        `Titel: ${product.feedTitle || product.name} | Categorie: ${product.category} | Omschrijving: ${product.description} | Specs: ${Object.entries(product.specs).map(([key, value]) => `${key}: ${value}`).join("\n")}`,
      ].map(csvEscape).join(",");
    }),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = createElement("a", {
    attrs: {
      href: url,
      download: "bax-pdp-faqs-filtered.csv",
    },
  });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(`${rows.length} FAQ's geexporteerd`);
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.query = normalize(event.target.value);
    render();
  });

  elements.categorySelect.addEventListener("change", (event) => {
    state.category = event.target.value;
    render();
  });

  elements.sourceSelect.addEventListener("change", (event) => {
    state.source = event.target.value;
    render();
  });

  document.querySelectorAll(".view-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  elements.faqCards.addEventListener("click", (event) => {
    const button = event.target.closest("[data-trail-tab]");
    if (!button) return;
    const wrapper = button.closest(".research-tabs");
    const activeId = button.dataset.trailTab;
    wrapper.querySelectorAll("[data-trail-tab]").forEach((tabButton) => {
      const isActive = tabButton.dataset.trailTab === activeId;
      tabButton.classList.toggle("active", isActive);
      tabButton.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    wrapper.querySelectorAll("[data-trail-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.trailPanel === activeId);
    });
  });

  elements.copyVisibleButton.addEventListener("click", () => {
    const rows = getFilteredFaqRows();
    copyText(formatFaqText(rows), `${rows.length} zichtbare FAQ's gekopieerd`);
  });

  elements.copyProductButton.addEventListener("click", () => {
    const product = DATA.products.find((item) => item.id === state.selectedProductId);
    if (!product) return;
    const rows = getMatchingFaqs(product).map((faq) => ({ product, faq }));
    copyText(formatFaqText(rows), `${rows.length} product FAQ's gekopieerd`);
  });

  elements.exportButton.addEventListener("click", exportCsv);

  elements.csvImportInput.addEventListener("change", (event) => {
    handleCsvImport(event.target.files?.[0]);
  });

  elements.resetDataButton.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    applyData(DEFAULT_DATA, false);
    showToast("Standaard dataset hersteld");
  });

  elements.activateVersionButton.addEventListener("click", async () => {
    if (!BACKEND_AVAILABLE) return;
    try {
      const payload = await fetchJson("/api/activate", {
        method: "POST",
        body: JSON.stringify({ id: elements.versionSelect.value }),
      });
      DATA = payload.data;
      CURRENT_VERSION_ID = payload.currentId || "bundled";
      await loadBackendVersions();
      resetFilters();
      renderSummary();
      renderCategoryOptions();
      renderSourceOptions();
      updateDataStatus();
      render();
      showToast("Sheet-versie geactiveerd");
    } catch (error) {
      showToast(error.message || "Versie activeren is niet gelukt");
    }
  });

  elements.refreshVersionsButton.addEventListener("click", async () => {
    if (!BACKEND_AVAILABLE) return;
    try {
      await loadBackendVersions();
      elements.versionSelect.value = CURRENT_VERSION_ID;
      showToast("Versielijst ververst");
    } catch (error) {
      showToast(error.message || "Versies verversen is niet gelukt");
    }
  });
}

async function init() {
  if (!DATA) {
    document.body.textContent = "Data ontbreekt. Genereer data.js opnieuw.";
    return;
  }
  bindEvents();
  await tryLoadBackendData();
  renderSummary();
  renderCategoryOptions();
  renderSourceOptions();
  updateDataStatus();
  render();
}

init();
