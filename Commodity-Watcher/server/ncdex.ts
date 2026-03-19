import { storage } from "./storage";
import { NCDEX_SEED_DATA } from "./ncdex-seed-data";
import https from "https";
import zlib from "zlib";
import fs from "fs";
import path from "path";
import os from "os";

export interface NcdexSpotRow {
  symbol: string;
  center: string;
  priceDate: string;
  priceTime: string;
  price: string;
}

export interface NcdexSpotEntry {
  symbol: string;
  label: string;
  center: string;
  priceDate: string;
  price: number | null;
  priceFormatted: string | null;
  unit: string;
  group: string;
  changePercent: number | null;
  changeTrend: "up" | "down" | "flat" | null;
}

const SYMBOL_META: Record<string, { label: string; group: string }> = {
  WHEAT:       { label: "Wheat (Delhi)",           group: "Grains" },
  WHEATFAQ:    { label: "Wheat FAQ (Kota)",         group: "Grains" },
  WHTSMQIDRI:  { label: "Wheat Sharbati (Indore)",  group: "Grains" },
  WHTSMQKPRI:  { label: "Wheat (Kanpur)",           group: "Grains" },
  BARLEY:      { label: "Barley (Jaipur)",          group: "Grains" },
  MAIZE:       { label: "Maize (Jalgaon)",          group: "Grains" },
  MAIZEDEL:    { label: "Maize (Delhi)",            group: "Grains" },
  MAIZERABI:   { label: "Maize Rabi (Gulabbagh)",   group: "Grains" },
  PADYPB1121:  { label: "Paddy Pusa 1121 (Kota)",   group: "Grains" },
  CHANA:       { label: "Chana (Bikaner)",          group: "Pulses" },
  CHANAAKL:    { label: "Chana (Akola)",            group: "Pulses" },
  CHARJDDEL:   { label: "Chana (Delhi)",            group: "Pulses" },
  MOONG:       { label: "Moong (Merta City)",       group: "Pulses" },
  MSRBLDIDR:   { label: "Masoor (Indore)",          group: "Pulses" },
  YELLOWP:     { label: "Yellow Peas (Kanpur)",     group: "Pulses" },
  RMSEED:      { label: "Mustard Seed (Jaipur)",    group: "Oilseeds" },
  RMSEEDALW:   { label: "Mustard Seed (Alwar)",     group: "Oilseeds" },
  CASTOR:      { label: "Castor Seed (Deesa)",      group: "Oilseeds" },
  SYBEANAKL:   { label: "Soybean (Akola)",          group: "Oilseeds" },
  SYBEANIDR:   { label: "Soybean (Indore)",         group: "Oilseeds" },
  GROUNDNUT:   { label: "Groundnut (Bikaner)",      group: "Oilseeds" },
  SYOREF:      { label: "Refined Soyoil (Indore)",  group: "Edible Oils" },
  CPO:         { label: "Crude Palm Oil (Kandla)",  group: "Edible Oils" },
  KACHIGHANI:  { label: "Kachi Ghani (Jaipur)",     group: "Edible Oils" },
  CASTOROIL:   { label: "Refined Castor Oil (Kandla)", group: "Edible Oils" },
  SUNOIL:      { label: "Crude Sunflower Oil (Chennai)", group: "Edible Oils" },
  JEERAUNJHA:  { label: "Jeera (Unjha)",            group: "Spices" },
  DHANIYA:     { label: "Dhaniya (Gondal)",         group: "Spices" },
  PEPPER:      { label: "Pepper (Kochi)",           group: "Spices" },
  TMCFGRNZM:   { label: "Turmeric (Nizamabad)",     group: "Spices" },
  ISABGOL:     { label: "Isabgol (Unjha)",          group: "Others" },
  GUARSEED10:  { label: "Guar Seed (Jodhpur)",      group: "Others" },
  GUARGUM5:    { label: "Guar Gum (Jodhpur)",       group: "Others" },
  COTTON:      { label: "Cotton 29mm (Rajkot)",     group: "Others" },
  KAPAS:       { label: "Kapas (Rajkot)",           group: "Others" },
  GUR:         { label: "Gur (Muzaffar Nagar)",     group: "Others" },
  SUGARS:      { label: "Sugar S (Kolhapur)",       group: "Others" },
  STEEL:       { label: "Steel Long (Mandi Gobindgarh)", group: "Others" },
  COFFEE:      { label: "Coffee Robusta (KushalNagar)", group: "Others" },
};

const GROUP_ORDER = ["Grains", "Pulses", "Oilseeds", "Edible Oils", "Spices", "Others"];

export function parseNcdexCsv(csv: string): NcdexSpotRow[] {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const rows: NcdexSpotRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < 5) continue;
    rows.push({
      symbol: parts[0].trim(),
      center: parts[1].trim(),
      priceDate: parts[2].trim(),
      priceTime: parts[3].trim(),
      price: parts[4].trim(),
    });
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function buildNcdexDisplay(rows: NcdexSpotRow[], prevPriceMap?: Map<string, number>): NcdexSpotEntry[] {
  const latestBySymbol = new Map<string, NcdexSpotRow>();
  for (const row of rows) {
    const existing = latestBySymbol.get(row.symbol);
    if (!existing || row.priceTime > existing.priceTime) {
      latestBySymbol.set(row.symbol, row);
    }
  }

  const entries: NcdexSpotEntry[] = [];
  for (const [symbol, row] of latestBySymbol) {
    const meta = SYMBOL_META[symbol];
    if (!meta) continue;
    const priceNum = parseFloat(row.price.replace(/,/g, ''));
    const prevPrice = prevPriceMap?.get(symbol) ?? null;

    let changePercent: number | null = null;
    let changeTrend: "up" | "down" | "flat" | null = null;
    if (prevPrice !== null && !isNaN(priceNum) && prevPrice > 0) {
      changePercent = ((priceNum - prevPrice) / prevPrice) * 100;
      changeTrend = changePercent > 0.05 ? "up" : changePercent < -0.05 ? "down" : "flat";
    }

    entries.push({
      symbol,
      label: meta.label,
      center: row.center,
      priceDate: row.priceDate,
      price: isNaN(priceNum) ? null : priceNum,
      priceFormatted: isNaN(priceNum) ? null : `₹${priceNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      unit: "₹/quintal",
      group: meta.group,
      changePercent,
      changeTrend,
    });
  }

  entries.sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    return a.label.localeCompare(b.label);
  });

  return entries;
}

const MONTH_MAP: Record<string, number> = {
  Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11
};

function parsePriceDate(d: string): number {
  const parts = d.split("-");
  if (parts.length !== 3) return 0;
  const day = parseInt(parts[0], 10);
  const mon = MONTH_MAP[parts[1]] ?? 0;
  const yr  = parseInt(parts[2], 10);
  return new Date(yr, mon, day).getTime();
}

export async function getLatestNcdexSpotDisplay(): Promise<{ entries: NcdexSpotEntry[]; seededAt: Date | null }> {
  const allRows = await storage.getLatestNcdexSpotPrices();
  if (allRows.length === 0) return { entries: [], seededAt: null };

  const dateGroups = new Map<string, typeof allRows>();
  for (const row of allRows) {
    const group = dateGroups.get(row.priceDate) ?? [];
    group.push(row);
    dateGroups.set(row.priceDate, group);
  }

  const sortedDates = [...dateGroups.entries()].sort((a, b) =>
    parsePriceDate(b[0]) - parsePriceDate(a[0]),
  );

  const todayRows = sortedDates[0]?.[1] ?? [];
  const prevRows = sortedDates[1]?.[1] ?? [];

  const prevPriceMap = new Map<string, number>();
  for (const row of prevRows) {
    const p = parseFloat(row.price.replace(/,/g, ''));
    if (!isNaN(p)) prevPriceMap.set(row.symbol, p);
  }

  const seededAt = todayRows.reduce(
    (max, r) => r.updatedAt && (!max || r.updatedAt > max) ? r.updatedAt : max,
    null as Date | null,
  );

  const entries = buildNcdexDisplay(
    todayRows.map(r => ({ symbol: r.symbol, center: r.center, priceDate: r.priceDate, priceTime: r.priceTime, price: r.price })),
    prevPriceMap.size > 0 ? prevPriceMap : undefined,
  );

  return { entries, seededAt };
}

export async function seedNcdexIfEmpty(): Promise<void> {
  try {
    const existing = await storage.getLatestNcdexSpotPrices();
    if (existing.length > 0) return;

    const rows = NCDEX_SEED_DATA.map(r => ({
      symbol: r.symbol,
      center: r.center,
      priceDate: r.priceDate,
      priceTime: r.priceTime,
      price: r.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    }));

    await storage.saveNcdexSpotPrices(rows);
    console.log(`[ncdex] Seeded ${rows.length} spot price rows from bundled data`);
  } catch (e) {
    console.warn("[ncdex] Startup seed failed:", (e as Error).message?.slice(0, 120));
  }
}

export interface NcdexRefreshResult {
  ok: boolean;
  rowCount?: number;
  message: string;
  blocked?: boolean;
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Sec-Ch-Ua": '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="8"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

interface HttpResponse {
  status: number;
  body: string;
  setCookies: string[];
  location?: string;
}

function httpsGetRaw(urlStr: string, extraHeaders: Record<string, string> = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: { ...BROWSER_HEADERS, ...extraHeaders },
      timeout: 28000,
    }, (res) => {
      const encoding = res.headers["content-encoding"] ?? "";
      const rawCookies = res.headers["set-cookie"] ?? [];
      const location = res.headers["location"] as string | undefined;
      const chunks: Buffer[] = [];

      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const decode = (b: Buffer) => {
          const s = b.toString("utf8");
          return { status: res.statusCode ?? 0, setCookies: rawCookies, location, body: s };
        };
        if (encoding === "br") {
          zlib.brotliDecompress(buf, (e, r) => e ? reject(e) : resolve(decode(r)));
        } else if (encoding === "gzip") {
          zlib.gunzip(buf, (e, r) => e ? reject(e) : resolve(decode(r)));
        } else if (encoding === "deflate") {
          zlib.inflate(buf, (e, r) => e ? reject(e) : resolve(decode(r)));
        } else {
          resolve(decode(buf));
        }
      });
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", reject);
    req.end();
  });
}

function parseCookieValue(setCookieHeaders: string[]): string {
  return setCookieHeaders
    .map(h => h.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function fetchNcdexCsvWithCookies(): Promise<string> {
  // Step 1 — visit the spot prices page to receive session cookies
  console.log("[ncdex] Step 1: fetching session cookies from NCDEX...");
  const landingResp = await httpsGetRaw("https://www.ncdex.com/markets/spotprices", {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Sec-Fetch-Dest": "document",
  });
  console.log(`[ncdex] Landing page status: ${landingResp.status}, cookies: ${landingResp.setCookies.length}`);

  const cookieHeader = parseCookieValue(landingResp.setCookies);

  // Step 2 — fetch CSV using those cookies as a same-site navigation
  console.log("[ncdex] Step 2: fetching CSV with session cookie...");
  const csvResp = await httpsGetRaw("https://www.ncdex.com/spotprices/csv_data", {
    "Accept": "text/csv,text/plain,application/octet-stream,*/*;q=0.8",
    "Sec-Fetch-Dest": "document",
    "Referer": "https://www.ncdex.com/markets/spotprices",
    ...(cookieHeader ? { "Cookie": cookieHeader } : {}),
  });
  console.log(`[ncdex] CSV endpoint status: ${csvResp.status}, body length: ${csvResp.body.length}`);

  if (csvResp.status >= 400) throw new Error(`HTTP ${csvResp.status}`);
  return csvResp.body;
}

async function fetchNcdexWithBrowser(): Promise<string> {
  const { chromium } = await import("playwright");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ncdex-"));

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
      acceptDownloads: true,
      viewport: { width: 1280, height: 800 },
    });

    // Hide automation signals
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      (window as any).chrome = { runtime: {} };
    });

    const page = await context.newPage();
    let interceptedCsv: string | null = null;

    // Intercept all responses — catch CSV/JSON data from any API endpoint
    page.on("response", async (response) => {
      const url = response.url();
      const ct = response.headers()["content-type"] ?? "";
      try {
        if (
          url.includes("csv") ||
          url.includes("spotprice") ||
          url.includes("SpotPrice") ||
          ct.includes("text/csv") ||
          ct.includes("application/octet")
        ) {
          const body = await response.text();
          if (body.length > 100 && body.includes(",")) {
            console.log(`[ncdex] Intercepted potential CSV from: ${url} (${body.length} bytes)`);
            interceptedCsv = body;
          }
        }
      } catch {}
    });

    console.log("[ncdex] Browser: navigating to spot prices page...");
    await page.goto("https://www.ncdex.com/markets/spotprices", {
      waitUntil: "networkidle",
      timeout: 45000,
    });

    // Wait for table/data to appear
    try {
      await page.waitForSelector("table, .data-table, [class*='price'], [class*='spot']", {
        timeout: 15000,
      });
    } catch {
      console.log("[ncdex] Browser: no table selector found, continuing...");
    }

    // If we already intercepted CSV data, return it
    if (interceptedCsv && interceptedCsv.split("\n").length > 5) {
      console.log(`[ncdex] Browser: got CSV via response interception`);
      return interceptedCsv;
    }

    // Try to find and click a CSV download button
    const csvButtonSelectors = [
      "a:has-text('Download CSV')",
      "a:has-text('CSV')",
      "button:has-text('CSV')",
      "[title*='CSV']",
      "a[href*='csv']",
      ".csv-download",
    ];

    for (const sel of csvButtonSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.count() > 0) {
          console.log(`[ncdex] Browser: found download button: ${sel}`);
          const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 15000 }),
            btn.click(),
          ]);
          const filePath = path.join(tmpDir, "ncdex_spot.csv");
          await download.saveAs(filePath);
          const csv = fs.readFileSync(filePath, "utf8");
          console.log(`[ncdex] Browser: downloaded CSV via click, ${csv.length} bytes`);
          return csv;
        }
      } catch {}
    }

    // Final fallback: directly navigate to the CSV URL with fresh session cookies from this browser
    console.log("[ncdex] Browser: navigating directly to csv_data endpoint...");
    const csvPage = await context.newPage();
    await csvPage.goto("https://www.ncdex.com/spotprices/csv_data", {
      waitUntil: "commit",
      timeout: 20000,
    });
    await csvPage.waitForTimeout(3000);
    const csvBody = await csvPage.content();
    if (interceptedCsv && interceptedCsv.split("\n").length > 5) {
      return interceptedCsv;
    }
    return csvBody;

  } finally {
    await browser.close();
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  }
}

export async function tryRefreshNcdexSpot(): Promise<NcdexRefreshResult> {
  try {
    let csvBody: string;

    // Primary: use Playwright headless browser (same as real bots)
    console.log("[ncdex] Attempting browser-based fetch...");
    try {
      csvBody = await fetchNcdexWithBrowser();
    } catch (browserErr) {
      console.log("[ncdex] Browser fetch failed:", (browserErr as Error).message?.slice(0, 80));
      // Fallback: cookie-based Node.js fetch
      console.log("[ncdex] Falling back to cookie-based fetch...");
      csvBody = await fetchNcdexCsvWithCookies();
    }
    const rows = parseNcdexCsv(csvBody);

    if (rows.length < 5) {
      const preview = csvBody.slice(0, 4200).replace(/\n/g, " ");
      console.log(`[ncdex] Too few rows (${rows.length}). FULL BODY: ${preview}`);
      const isBlocked = /access denied|cloudflare|captcha|403 forbidden/i.test(csvBody);
      return {
        ok: false,
        blocked: isBlocked,
        message: isBlocked
          ? "NCDEX blocked the request. Try again in a few minutes."
          : `Fetched data but could not parse CSV (${rows.length} rows). Format may have changed.`,
      };
    }

    await storage.saveNcdexSpotPrices(rows);
    const msg = `Refreshed ${rows.length} spot price rows`;
    console.log(`[ncdex] ${msg}`);
    return { ok: true, rowCount: rows.length, message: msg };

  } catch (e) {
    const err = (e as Error).message ?? String(e);
    console.log(`[ncdex] Refresh failed:`, err.slice(0, 120));
    return {
      ok: false,
      blocked: /403|503|forbidden/i.test(err),
      message: `Could not reach NCDEX: ${err.slice(0, 80)}`,
    };
  }
}
