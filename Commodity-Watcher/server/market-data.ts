import { storage } from "./storage";
import { PDFParse } from "pdf-parse";

export interface SnapshotItem {
  label: string;
  value: string | null;
  rawValue: number | null;
  change: string | null;
  trend: "up" | "down" | "steady" | null;
  source: string;
  auto: boolean;
}

export interface MarketSnapshotData {
  forex: SnapshotItem[];
  energyMetals: SnapshotItem[];
  edibleOils: SnapshotItem[];
  sugar: SnapshotItem[];
  grainsPulses: SnapshotItem[];
  polymers: SnapshotItem[];
  wheatFob: WheatFobItem[];
}

export interface WheatFobItem {
  origin: string;
  grade: string;
  price: string | null;
  change: string | null;
  trend: "up" | "down" | "steady" | null;
  priceDate: string | null;
  source: string;
  auto: boolean;
}

async function yahooPrice(ticker: string): Promise<{ price: number; change: number; currency: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const meta = json.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return {
      price: meta.regularMarketPrice,
      change: meta.regularMarketChangePercent ?? 0,
      currency: meta.currency ?? "",
    };
  } catch {
    return null;
  }
}

function pctLabel(chg: number | null): { change: string; trend: "up" | "down" | "steady" } {
  if (chg === null || Math.abs(chg) < 0.05) return { change: "Steady", trend: "steady" };
  const sign = chg > 0 ? "+" : "";
  return { change: `${sign}${chg.toFixed(2)}%`, trend: chg > 0 ? "up" : "down" };
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

interface UsdaFasWheatPrices {
  argentina: number | null;
  australia: number | null;
  canada: number | null;
  eu: number | null;
  russia: number | null;
  usa: number | null;
  reportDate: string | null;
}

let _usdaCache: { data: UsdaFasWheatPrices; fetchedAt: number } | null = null;

async function fetchUsdaFasWheatPrices(): Promise<UsdaFasWheatPrices> {
  const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
  if (_usdaCache && Date.now() - _usdaCache.fetchedAt < CACHE_TTL) return _usdaCache.data;

  const empty: UsdaFasWheatPrices = { argentina: null, australia: null, canada: null, eu: null, russia: null, usa: null, reportDate: null };
  try {
    const buf = await fetchBuffer("https://apps.fas.usda.gov/psdonline/circulars/grain.pdf");
    if (!buf) return empty;

    const parser = new PDFParse({ data: new Uint8Array(buf), verbosity: 0 });
    await parser.load();
    const result = await parser.getText();
    const lines = result.text.split("\n");

    // Find the header line: "Argentina  Australia  Canada  EU  Russia  United States" (tab-separated)
    const headerRe = /Argentina\s+Australia\s+Canada\s+EU\s+Russia\s+United States/i;
    const headerIdx = lines.findIndex((l) => headerRe.test(l));
    if (headerIdx === -1) return empty;

    // The price line is the first non-empty line after the header
    let priceIdx = headerIdx + 1;
    while (priceIdx < lines.length && !lines[priceIdx].trim()) priceIdx++;
    const priceLine = lines[priceIdx];

    // Parse: "$209 \t$262 \t$271 \t$240 \t$235 \t$269"
    const parts = priceLine.split(/\t/).map((p) => p.trim().replace(/[$,]/g, ""));
    const parse = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n; };
    const [argentina, australia, canada, eu, russia, usa] = parts.map(parse);

    // Extract report date from nearby "Foreign Agricultural Service/USDA {date}" line
    let reportDate: string | null = null;
    for (let i = Math.max(0, headerIdx - 15); i <= Math.min(lines.length - 1, headerIdx + 15); i++) {
      const m = (lines[i] ?? "").match(/USDA\s+(\d+\s+\w+\s+\d{4})/i);
      if (m) { reportDate = m[1]; break; }
    }

    const data: UsdaFasWheatPrices = { argentina: argentina ?? null, australia: australia ?? null, canada: canada ?? null, eu: eu ?? null, russia: russia ?? null, usa: usa ?? null, reportDate };
    _usdaCache = { data, fetchedAt: Date.now() };
    console.log(`[market] USDA FAS wheat prices fetched: Russia=$${russia}, report=${reportDate}`);
    return data;
  } catch (err) {
    console.error("[market] USDA FAS PDF fetch error:", err);
    return empty;
  }
}

interface IgcWheatPrices {
  euFrance: number | null;
  usHrw: number | null;
  usSrw: number | null;
  date: string | null;
}

let _igcCache: { data: IgcWheatPrices; fetchedAt: number } | null = null;

async function fetchIgcWheatPrices(): Promise<IgcWheatPrices> {
  const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
  if (_igcCache && Date.now() - _igcCache.fetchedAt < CACHE_TTL) return _igcCache.data;

  const empty: IgcWheatPrices = { euFrance: null, usHrw: null, usSrw: null, date: null };
  try {
    const buf = await fetchBuffer("https://www.igc.int/en/default.aspx");
    if (!buf) return empty;
    const html = buf.toString("utf-8");

    // IGC embeds a hidden table "GridViewHiddenPrices" with columns:
    // Date | EU (France) Grade 1, Rouen | US HRW (11.5%), Gulf | US SRW, Gulf
    const tableMatch = html.match(/GridViewHiddenPrices[\s\S]*?<tr>\s*<th[\s\S]*?<\/tr>([\s\S]*?)<\/table>/);
    if (!tableMatch) return empty;

    // First data row after the header
    const rowMatch = tableMatch[1].match(/<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/);
    if (!rowMatch) return empty;

    const [, rawDate, euStr, hrwStr, srwStr] = rowMatch;
    const parse = (s: string) => { const n = parseFloat(s.trim()); return isNaN(n) ? null : n; };

    // Convert date from DD/MM/YYYY to readable format
    let date: string | null = null;
    const dm = rawDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dm) {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      date = `${parseInt(dm[1])} ${months[parseInt(dm[2]) - 1]} ${dm[3]}`;
    }

    const data: IgcWheatPrices = { euFrance: parse(euStr), usHrw: parse(hrwStr), usSrw: parse(srwStr), date };
    _igcCache = { data, fetchedAt: Date.now() };
    console.log(`[market] IGC wheat prices fetched: EU/France=$${data.euFrance}, US HRW=$${data.usHrw}, US SRW=$${data.usSrw}, date=${data.date}`);
    return data;
  } catch (err) {
    console.error("[market] IGC wheat price fetch error:", err);
    return empty;
  }
}

async function fetchBuffer(url: string, redirects = 5): Promise<Buffer | null> {
  const https = await import("https");
  return new Promise((resolve) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400 && res.headers.location && redirects > 0) {
        fetchBuffer(res.headers.location, redirects - 1).then(resolve); return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (d: Buffer) => chunks.push(d));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", () => resolve(null));
    }).on("error", () => resolve(null));
  });
}

export async function buildMarketSnapshot(): Promise<MarketSnapshotData> {
  const [inr, myr, eur, brent, gold, soyoil, sugarRaw, cbotwh, bwf, usdaWheat, igcWheat] = await Promise.all([
    yahooPrice("USDINR=X"),
    yahooPrice("USDMYR=X"),
    yahooPrice("EURUSD=X"),
    yahooPrice("BZ=F"),
    yahooPrice("GC=F"),
    yahooPrice("ZL=F"),
    yahooPrice("SB=F"),
    yahooPrice("ZW=F"),
    yahooPrice("BWF=F"),  // CME Black Sea Wheat FOB futures (USD/MT)
    fetchUsdaFasWheatPrices(),
    fetchIgcWheatPrices(),
  ]);

  function autoItem(label: string, data: typeof inr, source: string, formatter: (p: number) => string): SnapshotItem {
    if (!data) return { label, value: null, rawValue: null, change: null, trend: null, source, auto: true };
    const { change, trend } = pctLabel(data.change);
    return { label, value: formatter(data.price), rawValue: data.price, change, trend, source, auto: true };
  }

  function manualItem(label: string, source: string): SnapshotItem {
    return { label, value: null, rawValue: null, change: null, trend: null, source, auto: false };
  }

  // CBOT Wheat: convert USc/bushel → $/MT (1 MT = 36.7437 bu)
  const cbotWtPerMT = cbotwh ? Math.round((cbotwh.price / 100) * 36.7437 * 10) / 10 : null;

  const now = new Date();
  const istOffset = (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const h = ist.getUTCHours();
  const isEvening = h >= 12;
  const timeLabel = isEvening ? "06:00 PM IST" : "09:30 AM IST";
  const dateLabel = ist.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).replace(/ /g, "-");

  return {
    forex: [
      autoItem("USD:INR", inr, "LSEG / Yahoo Finance (Interbank)", p => fmt(p, 2)),
      autoItem("USD:MYR", myr, "LSEG / Yahoo Finance", p => fmt(p, 3)),
      autoItem("EUR:USD", eur, "LSEG / Yahoo Finance", p => fmt(p, 4)),
    ],
    energyMetals: [
      autoItem("Brent Crude", brent, "ICE Futures Europe / Yahoo Finance", p => `$${fmt(p, 2)}`),
      autoItem("Gold (Comex)", gold, "CME Group / Yahoo Finance", p => `$${fmt(p, 2)}`),
    ],
    edibleOils: [
      autoItem("Soybean Oil (CBOT)", soyoil, "CBOT / Yahoo Finance", p => `${fmt(p, 2)}¢/lb`),
      manualItem("CPO (BMD) C1", "Bursa Malaysia Derivatives (BMD)"),
      manualItem("CPO (BMD) C2", "Bursa Malaysia Derivatives (BMD)"),
      manualItem("Palmolein (Kakinada)", "SEA India / Kakinada Port Mandi"),
    ],
    sugar: [
      manualItem("Sugar No.5 (Refined)", "ICE Futures Europe (London)"),
      autoItem("Sugar No.11 (Raw)", sugarRaw, "ICE Futures US / Yahoo Finance", p => `${fmt(p, 2)}¢/lb`),
      manualItem("Spot Sugar (Kolhapur)", "VSI / Maharashtra Trade Associations"),
    ],
    grainsPulses: [
      manualItem("Wheat Delhi (Lawrence Rd)", "NCDEX Spot / Agriwatch"),
      manualItem("Wheat Indore (LB Nagar)", "NCDEX Spot / Agriwatch"),
      manualItem("Wheat Kota", "NCDEX Spot / Agriwatch"),
      manualItem("Wheat Kanpur", "NCDEX Spot / Agriwatch"),
      manualItem("Wheat Rajkot", "NCDEX Spot / Agriwatch"),
      manualItem("Chana Delhi (Naya Bazar)", "NCDEX Spot / Agriwatch"),
      manualItem("Chana Bikaner", "NCDEX Spot / Agriwatch"),
      manualItem("Maize Sangli", "NCDEX Spot / Agriwatch"),
    ],
    polymers: [
      manualItem("LLDPE (Singapore)", "ICIS / Platts S&P Global (CFR SE Asia)"),
    ],
    wheatFob: [
      {
        origin: "Russia",
        grade: "Black Sea FOB (Milling)",
        price: bwf ? `$${fmt(bwf.price, 2)}/MT` : (usdaWheat.russia ? `$${usdaWheat.russia}/MT` : null),
        change: bwf ? pctLabel(bwf.change).change : null,
        trend: bwf ? pctLabel(bwf.change).trend : null,
        priceDate: bwf ? "Live — CME BWF=F" : (usdaWheat.reportDate ?? null),
        source: bwf ? "CME Black Sea Wheat / Yahoo Finance (BWF=F)" : "USDA FAS Grain Circular (IGC)",
        auto: !!(bwf || usdaWheat.russia),
      },
      {
        origin: "EU (France)",
        grade: "Grade 1 FOB Rouen",
        price: igcWheat.euFrance ? `$${igcWheat.euFrance}/MT` : null,
        change: null,
        trend: null,
        priceDate: igcWheat.date ?? null,
        source: "IGC",
        auto: !!igcWheat.euFrance,
      },
      {
        origin: "USA",
        grade: "HRW 11.5% Gulf",
        price: igcWheat.usHrw ? `$${igcWheat.usHrw}/MT` : (cbotWtPerMT ? `$${fmt(cbotWtPerMT, 1)}/MT` : null),
        change: null,
        trend: null,
        priceDate: igcWheat.usHrw ? (igcWheat.date ?? null) : null,
        source: igcWheat.usHrw ? "IGC" : "CBOT Futures / Yahoo Finance (ZW=F)",
        auto: !!(igcWheat.usHrw || cbotwh),
      },
      {
        origin: "USA",
        grade: "SRW Gulf",
        price: igcWheat.usSrw ? `$${igcWheat.usSrw}/MT` : null,
        change: null,
        trend: null,
        priceDate: igcWheat.usSrw ? (igcWheat.date ?? null) : null,
        source: "IGC",
        auto: !!igcWheat.usSrw,
      },
      {
        origin: "Australia",
        grade: "APW (Prime White)",
        price: usdaWheat.australia ? `$${usdaWheat.australia}/MT` : null,
        change: null,
        trend: null,
        priceDate: usdaWheat.reportDate ?? null,
        source: "USDA FAS Grain Circular (IGC)",
        auto: !!usdaWheat.australia,
      },
      {
        origin: "Canada",
        grade: "CWRS 13.5% Vancouver",
        price: usdaWheat.canada ? `$${usdaWheat.canada}/MT` : null,
        change: null,
        trend: null,
        priceDate: usdaWheat.reportDate ?? null,
        source: "USDA FAS Grain Circular (IGC)",
        auto: !!usdaWheat.canada,
      },
      {
        origin: "Argentina",
        grade: "12.0% FOB Up-River",
        price: usdaWheat.argentina ? `$${usdaWheat.argentina}/MT` : null,
        change: null,
        trend: null,
        priceDate: usdaWheat.reportDate ?? null,
        source: "USDA FAS Grain Circular (IGC)",
        auto: !!usdaWheat.argentina,
      },
    ],
  };
}

export async function refreshMarketSnapshot(): Promise<MarketSnapshotData> {
  const now = new Date();
  const istOffset = (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const h = ist.getUTCHours();
  const isEvening = h >= 12;
  const timeLabel = isEvening ? "06:00 PM IST" : "09:30 AM IST";
  const dateLabel = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const label = `${timeLabel}, ${dateLabel}`;

  console.log(`Refreshing market snapshot [${label}]…`);
  const data = await buildMarketSnapshot();
  await storage.saveMarketSnapshot(label, JSON.stringify(data));
  console.log("Market snapshot saved.");
  return data;
}

let lastScheduledH = -1;

export function startMarketScheduler() {
  setInterval(() => {
    const now = new Date();
    const istOffset = (5 * 60 + 30) * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    const h = ist.getUTCHours();
    const m = ist.getUTCMinutes();
    const trigger = (h === 9 && m === 30) || (h === 18 && m === 0);
    if (trigger && lastScheduledH !== h) {
      lastScheduledH = h;
      refreshMarketSnapshot().catch(console.error);
    }
  }, 60 * 1000);
  console.log("Market snapshot scheduler running (9:30 AM & 6:00 PM IST)");
}
