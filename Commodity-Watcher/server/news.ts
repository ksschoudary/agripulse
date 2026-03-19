import Parser from "rss-parser";
import { storage } from "./storage";
import { fetchPIBNews } from "./pib";
import { fetchPackagingNews } from "./packaging";
import { fetchDGFTNews } from "./dgft";
import { fetchIMDAdvisories } from "./imd";

const parser = new Parser();

// Fetches news for a single query string and returns mapped items (without inserting)
async function fetchSingleQuery(commodityId: number, query: string) {
  const encodedQuery = encodeURIComponent(query);
  const isGlobal = query.toLowerCase().includes("palm") || query.toLowerCase().includes("soy") || query.toLowerCase().includes("pea") || query.toLowerCase().includes("pulse") || query.toLowerCase().includes("cocoa") || query.toLowerCase().includes("almond") || query.toLowerCase().includes("vietnam") || query.toLowerCase().includes("ivory coast");
  const isWeather = query.toLowerCase().includes("monsoon") || query.toLowerCase().includes("imd") || query.toLowerCase().includes("skymet");
  const baseUrl = (isGlobal && !isWeather)
    ? `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`
    : `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-IN&gl=IN&ceid=IN:en`;
  const url = `${baseUrl}&tbs=qdr:h24`;
  const feed = await parser.parseURL(url);
  const items = feed.items || [];

  const indiaKeywords = [
    "india", "indian", "new delhi", "delhi", "mumbai", "bangalore", "bengaluru",
    "hyderabad", "pune", "kolkata", "chennai", "ahmedabad", "jaipur", "surat",
    "mandi", "imd", "icar", "nafed", "nccf", "fci", "ncdex", "apmc", "sebi",
    "karnataka", "maharashtra", "punjab", "haryana", "uttar pradesh", "madhya pradesh",
    "tamil nadu", "andhra pradesh", "telangana", "rajasthan", "bihar", "west bengal",
    "gujarat", "kerala", "odisha", "assam", "chhattisgarh", "jharkhand", "goa",
    "himachal", "uttarakhand", "manipur", "nagaland", "tripura", "meghalaya",
    "government of india", "ministry of agriculture", "pib", "cacp", "msp",
    "rupee", "₹", " rs.", "lakh", "crore", "sangli", "nashik", "akola",
    "indore", "bhopal", "ludhiana", "amritsar", "nagpur", "vizag", "kochi",
    "wayanad", "idukki", "nizamabad", "guntur", "nanded", "latur",
  ];

  return items
    .filter(item => item.link)
    .map(item => {
      let snippet = item.contentSnippet || item.content || "";
      if (snippet.length > 500) snippet = snippet.substring(0, 500) + "...";
      const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
      const fullText = (item.title + " " + snippet).toLowerCase();
      const mentionsIndia = indiaKeywords.some(kw => fullText.includes(kw));
      return {
        commodityId,
        title: item.title || "No Title",
        link: item.link || "",
        source: item.creator || item.source || "Google News",
        snippet,
        publishedAt: pubDate,
        isGlobal: !mentionsIndia,
      };
    });
}

// Commodity names that must only store India-focused articles
const INDIA_ONLY_NAMES = new Set(["Agri Weather"]);

// Per-commodity keywords: article title must contain at least one (case-insensitive)
const COMMODITY_TITLE_KEYWORDS: Record<string, string[]> = {
  "Wheat":              ["wheat", "atta", "durum", "gehun", "grain", "food grain", "foodgrain", "grain stock"],
  "Maize":              ["maize", "corn", "makka", "E20", "e20", "ethanol blend", "blending mandate", "blending target"],
  "Paddy":              ["paddy", "rice", "basmati", "non-basmati", "parboiled", "export rates", "thai", "vietnamese"],
  "Chana":              ["chana", "gram", "bengal gram", "kabuli", "chickpea", "pulses", "pulse", "dal", "tur", "urad", "moong", "masur", "lentil"],
  "Crude":              ["brent", "wti", "crude oil", "crude price", "nymex", "opec", "barrel", "crude palm oil", "cpo price", "oil price", "crude futures", "light crude"],
  "Precious Metals":    ["gold price", "silver price", "gold rate", "silver rate", "gold futures", "silver futures", "bullion", "comex gold", "mcx gold", "gold per gram", "gold ounce", "precious metal", "gold market", "silver market", "gold today", "silver today"],
  "Palm Oil":           ["palm oil", "crude palm oil", "palm olein", "palm kernel", "mpob", "gapki"],
  "Potato":             ["potato", "aloo"],
  "Sugar":              ["sugarcane", "molasses", "jaggery", "isma", "nfcsf", "sugar mill", "sugar price", "sugar output", "sugar export", "sugar import", "sugar production", "sugar market", "sugar stock", "raw sugar", "white sugar", "refined sugar"],
  "Ethanol / DDGS":     ["ethanol", "ddgs", "biofuel", "blending mandate", "distillers grain"],
  "Rice bran oil":      ["rice bran"],
  "Soyabean / Oil":     ["soybean", "soyabean", "soy oil", "soya", "soymeal"],
  "Sunflower oil":      ["sunflower oil", "sunflower"],
  "Cotton seed oil":    ["cottonseed", "cotton seed"],
  "Cashew":             ["cashew"],
  "Almond":             ["almond"],
  "Raisins":            ["raisin", "kishmish", "dried grape"],
  "Oats":               ["oats", "oat"],
  "Psyllium / Isabgol": ["psyllium", "isabgol"],
  "Milk / Dairy":       ["milk", "dairy", "amul", "skimmed milk", "full cream milk"],
  "Cocoa":              ["cocoa", "cacao"],
  "Chilli powder":      ["chilli", "chili", "capsicum", "mirchi", "red pepper"],
  "Turmeric":           ["turmeric", "haldi"],
  "Black pepper":       ["black pepper", "pepper"],
  "Cardamom":           ["cardamom", "elaichi"],
  "Cabbage / Carrot":   ["cabbage", "carrot"],
  "Ring beans":         ["ring bean", "kidney bean", "rajma"],
  "Onion":              ["onion"],
  "Potato (Mandi)":     ["potato", "aloo"],
  "Groundnut":          ["groundnut", "peanut"],
  "Agri Weather":       ["monsoon", "rainfall", "drought", "flood", "weather", "imd", "cyclone", "heatwave", "cold wave", "crop advisory", "forecast", "kharif", "rabi", "el nino", "el-nino", "la nina", "la-nina", "enso", "indian ocean dipole", "iod", "skymet"],
};

// Universal blocklist: these title patterns indicate clearly off-topic articles regardless of commodity
const NOISE_PATTERNS = [
  "word of the day", "horoscope", "recipe", "exfoliat", "skin care", "skincare",
  "weight loss", "diet tip", "mutual fund", "data center", "semiconductor", "ai chip",
  "co-packaged optics", "celebrity", "bollywood", "cricket match", "ipl ",
  "movie review", "film review", "tv show", "web series", "ott", "stock market tip",
  "personal finance", "credit card", "loan emi", "home loan", "travel tip",
  // Pet/animal food articles that match commodity names as ingredients
  "cornstarch", "vet-reviewed", "vet-approved", "cats eat", "dogs eat", "pets eat",
  "can cats", "can dogs", "for cats", "for dogs", "cat food", "dog food",
  // Crime/local news that incidentally mentions commodity names
  "opium crop found", "opium field", "opium cultivation", "drug haul",
  "ganja field", "cannabis field", "narcotics hidden",
  // Beauty, skincare, home remedy articles that match spice/veggie commodity names
  "face pack", "on the face", "for your skin", "home remedy for",
  "beauty secret", "beauty routine", "beauty tip", "skin brightening",
  "for your hair", "ayurvedic remedy",
];

export { COMMODITY_TITLE_KEYWORDS, NOISE_PATTERNS };

function isArticleRelevant(commodityName: string, title: string): boolean {
  const lowerTitle = title.toLowerCase();
  // 1. Reject universal noise
  if (NOISE_PATTERNS.some(p => lowerTitle.includes(p))) return false;
  // 2. Commodity-specific exclusions
  if (commodityName === "Chana") {
    // "gram" as a weight unit appears in gold/silver price articles — block all precious-metal content
    const metalWords = ["gold", "silver", "antam", "karat", "bullion", "platinum", "jewelry", "jewellery", "precious metal"];
    if (metalWords.some(m => lowerTitle.includes(m))) return false;
  }
  // 3. Commodity keyword must appear in title
  const keywords = COMMODITY_TITLE_KEYWORDS[commodityName];
  if (!keywords || keywords.length === 0) return true;
  return keywords.some(kw => lowerTitle.includes(kw));
}

// Supports newline-separated multi-query strings for broader coverage.
// Each line is treated as a separate RSS query; results are merged and deduped by link.
export async function fetchNewsForCommodity(commodityId: number, queryString: string, commodityName?: string) {
  try {
    const queries = queryString.split("\n").map(q => q.trim()).filter(Boolean);
    const allResults: Awaited<ReturnType<typeof fetchSingleQuery>> = [];
    const seenLinks = new Set<string>();
    const indiaOnly = commodityName ? INDIA_ONLY_NAMES.has(commodityName) : false;

    // Fetch all queries in parallel for speed
    const batchResults = await Promise.allSettled(queries.map(q => fetchSingleQuery(commodityId, q)));
    for (const result of batchResults) {
      if (result.status === "rejected") continue;
      for (const item of result.value) {
        // For India-only commodities, skip articles not mentioning India
        if (indiaOnly && item.isGlobal) continue;
        // Relevance gate: title must mention commodity keywords and not be noise
        if (commodityName && !isArticleRelevant(commodityName, item.title)) continue;
        if (!seenLinks.has(item.link)) {
          seenLinks.add(item.link);
          allResults.push(item);
        }
      }
    }

    const sorted = allResults.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    if (sorted.length > 0) {
      await storage.insertNewsItems(sorted);
    }
    return sorted.length;
  } catch (error) {
    console.error(`Error fetching news for commodity ${commodityId}:`, error);
    return 0;
  }
}

const SPECIAL_FETCHERS: Record<string, () => Promise<number>> = {
  "PIB Updates": fetchPIBNews,
  "Packaging": fetchPackagingNews,
  "DGFT Updates": fetchDGFTNews,
  "IMD / Advisories": fetchIMDAdvisories,
};

export async function refreshAllNews(commodityId?: number) {
  let count = 0;
  if (commodityId) {
    const commodity = await storage.getCommodity(commodityId);
    if (commodity) {
      const fetcher = SPECIAL_FETCHERS[commodity.name];
      if (fetcher) {
        count += await fetcher();
      } else {
        count += await fetchNewsForCommodity(commodity.id, commodity.searchQueries, commodity.name);
      }
    }
  } else {
    const commodities = await storage.getCommodities();
    // Process up to 5 commodities in parallel to avoid rate-limiting Google News
    const CONCURRENCY = 5;
    for (let i = 0; i < commodities.length; i += CONCURRENCY) {
      const batch = commodities.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(c => {
        const fetcher = SPECIAL_FETCHERS[c.name];
        return fetcher ? fetcher() : fetchNewsForCommodity(c.id, c.searchQueries, c.name);
      }));
      for (const r of results) {
        if (r.status === "fulfilled") count += r.value;
      }
    }
  }
  return count;
}
