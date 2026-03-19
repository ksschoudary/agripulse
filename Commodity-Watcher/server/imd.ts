import Parser from "rss-parser";
import { storage } from "./storage";

const parser = new Parser();

const COMMODITY_KEYWORDS = [
  "wheat", "rice", "paddy", "maize", "kharif", "rabi", "sugarcane", "cotton", "soybean",
  "groundnut", "pulse", "oilseed", "chana", "mustard", "crop", "harvest", "sowing",
  "monsoon", "rainfall", "drought", "flood", "heatwave", "frost", "cold wave",
  "yield", "production", "farm", "farmer", "agriculture", "agri", "horticulture",
  "vegetable", "fruit", "mango", "onion", "potato", "chilli", "turmeric", "spice",
  "soil moisture", "irrigation", "reservoir", "food grain", "advisory"
];

function isRelevantToCommodities(text: string): boolean {
  const lower = text.toLowerCase();
  return COMMODITY_KEYWORDS.some(kw => lower.includes(kw));
}

export async function fetchIMDAdvisories() {
  try {
    const commodity = await storage.getCommodities().then(c => c.find(x => x.name === "IMD / Advisories"));
    if (!commodity) {
      console.log("IMD / Advisories commodity not found");
      return 0;
    }

    const searchTerms = [
      // IMD agricultural weather advisories
      '"IMD" India agricultural advisory crop',
      '"India Meteorological Department" advisory farmer agriculture',
      '"IMD" heatwave OR flood OR drought India crop impact',
      '"IMD" monsoon forecast India 2026 agriculture',
      // ICAR advisories
      '"ICAR" advisory India crop',
      '"ICAR" research India wheat OR rice OR maize OR pulses',
      'site:icar.org.in',
      '"National Research Centre" India crop advisory',
      // General agri-met advisories
      '"agromet" advisory India',
      '"crop advisory" India IMD OR ICAR OR state',
      '"Krishi Vigyan Kendra" advisory India',
      '"KVK" advisory crop India',
    ];

    let totalInserted = 0;

    for (const term of searchTerms) {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(term)}&hl=en-IN&gl=IN&ceid=IN:en&tbs=qdr:m`;
        const feed = await parser.parseURL(url);

        const newsToInsert = (feed.items || [])
          .map(item => {
            const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
            const daysDiff = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysDiff > 60) return null;

            const fullText = (item.title || "") + " " + (item.contentSnippet || "");
            if (!isRelevantToCommodities(fullText)) return null;

            return {
              commodityId: commodity.id,
              title: (item.title || "No Title").trim(),
              link: item.link || "",
              source: item.creator || "IMD / ICAR Advisories",
              snippet: (item.contentSnippet || item.content || "").substring(0, 500),
              publishedAt: pubDate,
              isGlobal: false
            };
          })
          .filter((item): item is any => item !== null && item.link !== "");

        if (newsToInsert.length > 0) {
          await storage.insertNewsItems(newsToInsert);
          totalInserted += newsToInsert.length;
        }
      } catch (e) {
        console.error(`Error fetching IMD/ICAR news for "${term}":`, e);
      }
    }

    console.log(`Fetched ${totalInserted} IMD/Advisories items`);
    return totalInserted;
  } catch (error) {
    console.error("Error in fetchIMDAdvisories:", error);
    return 0;
  }
}
