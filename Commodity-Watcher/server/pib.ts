import Parser from "rss-parser";
import { storage } from "./storage";

const parser = new Parser();

// ─── Commodity & agriculture keywords for title filtering ───────────────────
const COMMODITY_KEYWORDS = [
  "agri", "farm", "farmer", "kisan", "crop", "harvest", "yield", "sowing",
  "rabi", "kharif", "msp", "minimum support price", "procurement",
  "fci", "nafed", "nccf", "apmc", "apeda", "mandi",
  "wheat", "rice", "paddy", "maize", "corn", "jowar", "bajra", "barley",
  "sugar", "sugarcane", "ethanol", "frp",
  "cotton", "jute",
  "pulses", "chana", "tur", "urad", "moong", "masur", "lentil",
  "oilseed", "soybean", "groundnut", "mustard", "sunflower", "sesame", "palm",
  "onion", "tomato", "potato", "vegetable", "horticulture", "fruit",
  "cashew", "spice", "turmeric", "pepper", "guar",
  "fertilizer", "urea", "dap",
  "food", "grain", "storage", "buffer stock", "food security",
  "food processing", "food corporation",
  "irrigation", "soil", "seed", "pesticide",
  "pm-kisan", "pmkisan", "kisaan",
  "cooperative", "credit society",
  "fisheries", "animal husbandry",
];

const PIB_BASE = "https://www.pib.gov.in";
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
};

function isCommodityRelated(title: string): boolean {
  const lower = title.toLowerCase();
  return COMMODITY_KEYWORDS.some(kw => lower.includes(kw));
}

function formatDatePIB(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function delay(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

// ─── Strategy 1: Direct PIB allRel scraping ─────────────────────────────────
async function scrapeAllRelPage(dateStr: string): Promise<Array<{ prid: string; title: string }>> {
  try {
    const url = `${PIB_BASE}/allRel.aspx?reg=3&lang=1${dateStr ? `&dt=${encodeURIComponent(dateStr)}` : ""}`;
    const resp = await fetch(url, { headers: BROWSER_HEADERS });
    if (!resp.ok) return [];
    const html = await resp.text();
    if (!html.includes("PressReleasePage.aspx?PRID=")) return [];

    const regex = /href='\/PressReleasePage\.aspx\?PRID=(\d+)'(?:\s+title='([^']*)')?[^>]*>([^<]+)</g;
    const results: Array<{ prid: string; title: string }> = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      const title = ((match[2] || match[3] || "").trim());
      if (title && isCommodityRelated(title)) {
        results.push({ prid: match[1], title });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Get exact publication date from a press release page ────────────────────
async function getPressReleaseDate(prid: string, fallback: Date): Promise<Date> {
  try {
    await delay(300);
    const url = `${PIB_BASE}/PressReleasePage.aspx?PRID=${prid}`;
    const resp = await fetch(url, { headers: BROWSER_HEADERS });
    if (!resp.ok) return fallback;
    const html = await resp.text();
    const m = html.match(/(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})\s+(\d{1,2}):(\d{2})(AM|PM)/i);
    if (!m) return fallback;
    const months: Record<string, number> = {
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
    };
    let hour = parseInt(m[4]);
    const min = parseInt(m[5]);
    if (m[6].toUpperCase() === "PM" && hour !== 12) hour += 12;
    if (m[6].toUpperCase() === "AM" && hour === 12) hour = 0;
    return new Date(parseInt(m[3]), months[m[2].toUpperCase()], parseInt(m[1]), hour, min, 0);
  } catch {
    return fallback;
  }
}

// ─── Strategy 2: Google News RSS fallback ────────────────────────────────────
async function fetchPIBViaGoogleNews(commodityId: number): Promise<Array<{
  commodityId: number; title: string; link: string;
  source: string; snippet: string; publishedAt: Date; isGlobal: boolean;
}>> {
  const searchTerms = [
    '"pib.gov.in" agriculture farmers India',
    '"press information bureau" (wheat OR rice OR sugar OR MSP OR procurement) India',
    '"press information bureau" (pulses OR oilseed OR crop OR kisan) India',
    '"pib.gov.in" (food grain OR horticulture OR fertilizer) India',
    'site:pib.gov.in agriculture crop farmer',
  ];
  const results: any[] = [];
  const seen = new Set<string>();

  for (const term of searchTerms) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(term)}&hl=en-IN&gl=IN&ceid=IN:en&tbs=qdr:w`;
      const feed = await parser.parseURL(url);
      for (const item of feed.items || []) {
        const link = item.link || "";
        if (!link || seen.has(link)) continue;
        const title = (item.title || "").replace(/ - PIB$/i, "").replace(/ - Press Information Bureau$/i, "").trim();
        if (!isCommodityRelated(title) && !isCommodityRelated((item.contentSnippet || ""))) continue;
        seen.add(link);
        results.push({
          commodityId,
          title,
          link,
          source: "PIB - Press Information Bureau",
          snippet: (item.contentSnippet || item.content || "").substring(0, 500),
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          isGlobal: false,
        });
      }
      await delay(500);
    } catch { /* continue */ }
  }
  return results;
}

// ─── Main entry point ────────────────────────────────────────────────────────
export async function fetchPIBNews(): Promise<number> {
  try {
    const pibCommodity = await storage.getCommodities().then(c => c.find(x => x.name === "PIB Updates"));
    if (!pibCommodity) {
      console.log("PIB Updates commodity not found");
      return 0;
    }

    // ── Strategy 1: Scrape PIB allRel directly ──────────────────────────────
    let directCount = 0;
    const seenPRIDs = new Set<string>();
    const toInsert: Array<{
      commodityId: number; title: string; link: string;
      source: string; snippet: string; publishedAt: Date; isGlobal: boolean;
    }> = [];

    // Today (no date param) + past 6 days with date param
    const datesToScrape = [""];  // "" = today without param
    for (let i = 1; i <= 6; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      datesToScrape.push(formatDatePIB(d));
    }

    for (const dateStr of datesToScrape) {
      const found = await scrapeAllRelPage(dateStr);
      for (const { prid, title } of found) {
        if (seenPRIDs.has(prid)) continue;
        seenPRIDs.add(prid);
        const approxDate = new Date();
        if (dateStr) {
          const [dd, mm, yyyy] = dateStr.split("/");
          approxDate.setFullYear(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
          approxDate.setHours(12, 0, 0, 0);
        }
        const exactDate = await getPressReleaseDate(prid, approxDate);
        toInsert.push({
          commodityId: pibCommodity.id,
          title,
          link: `${PIB_BASE}/PressReleasePage.aspx?PRID=${prid}`,
          source: "PIB - Press Information Bureau",
          snippet: "",
          publishedAt: exactDate,
          isGlobal: false,
        });
        directCount++;
      }
      await delay(800); // Be polite between page requests
    }

    // ── Strategy 2: Google News fallback if direct scraping got nothing ─────
    if (directCount === 0) {
      console.log("PIB direct scrape returned 0 — trying Google News fallback");
      const fallback = await fetchPIBViaGoogleNews(pibCommodity.id);
      toInsert.push(...fallback);
    }

    if (toInsert.length > 0) {
      await storage.insertNewsItems(toInsert);
    }

    console.log(`PIB: fetched ${toInsert.length} commodity-related releases (direct=${directCount}, fallback=${toInsert.length - directCount})`);
    return toInsert.length;
  } catch (error) {
    console.error("Critical error in fetchPIBNews:", error);
    return 0;
  }
}
