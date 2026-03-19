import Parser from "rss-parser";
import { storage } from "./storage";

const parser = new Parser();

const COMMODITY_KEYWORDS = [
  "wheat", "rice", "paddy", "maize", "corn", "sugar", "palm oil", "soybean", "soya",
  "sunflower", "groundnut", "pulses", "chana", "dal", "edible oil", "cotton", "cashew",
  "almond", "raisin", "cocoa", "onion", "potato", "spice", "cardamom", "pepper",
  "turmeric", "chilli", "dairy", "milk", "oilmeal", "oilseed", "agri", "agriculture",
  "food", "import", "export", "tariff", "duty", "quota", "notification", "circular",
  "packaging", "trade", "policy", "commodity", "hs code", "ftdr"
];

function isRelevantToCommodities(text: string): boolean {
  const lower = text.toLowerCase();
  return COMMODITY_KEYWORDS.some(kw => lower.includes(kw));
}

export async function fetchDGFTNews() {
  try {
    const commodity = await storage.getCommodities().then(c => c.find(x => x.name === "DGFT Updates"));
    if (!commodity) {
      console.log("DGFT Updates commodity not found");
      return 0;
    }

    const searchTerms = [
      'site:dgft.gov.in',
      '"DGFT" notification India export import',
      '"DGFT" circular "edible oil" OR "food" OR "agri"',
      '"Director General of Foreign Trade" India commodity',
      '"DGFT" export import policy India wheat OR rice OR sugar OR oil',
      '"DGFT" trade notice India',
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
            if (daysDiff > 90) return null;

            const fullText = (item.title || "") + " " + (item.contentSnippet || "");
            if (!isRelevantToCommodities(fullText)) return null;

            return {
              commodityId: commodity.id,
              title: (item.title || "No Title").trim(),
              link: item.link || "",
              source: "DGFT - Ministry of Commerce",
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
        console.error(`Error fetching DGFT news for "${term}":`, e);
      }
    }

    console.log(`Fetched ${totalInserted} DGFT news items`);
    return totalInserted;
  } catch (error) {
    console.error("Error in fetchDGFTNews:", error);
    return 0;
  }
}
