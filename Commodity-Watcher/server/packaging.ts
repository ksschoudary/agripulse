import Parser from "rss-parser";
import { storage } from "./storage";

const parser = new Parser();

export async function fetchPackagingNews() {
  try {
    const commodity = await storage.getCommodities().then(c => c.find(x => x.name === "Packaging"));
    if (!commodity) {
      console.log("Packaging commodity not found");
      return 0;
    }

    const searchTerms = [
      '"food packaging" India',
      '"flexible packaging" India',
      '"packaging industry" India',
      'laminates India packaging',
      '"BOPP" OR "BOPET" India packaging',
      '"multilayer packaging" India',
      '"agri packaging" OR "agricultural packaging" India',
      '"packaging material" India food',
      '"pouch" OR "sachet" India food packaging',
      '"rigid packaging" OR "glass packaging" OR "tin packaging" India food',
    ];

    let totalInserted = 0;

    for (const term of searchTerms) {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(term)}&hl=en-IN&gl=IN&ceid=IN:en&tbs=qdr:w`;
        const feed = await parser.parseURL(url);

        const newsToInsert = (feed.items || [])
          .map(item => {
            const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
            const daysDiff = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysDiff > 30) return null;

            return {
              commodityId: commodity.id,
              title: (item.title || "No Title").trim(),
              link: item.link || "",
              source: item.creator || "Google News",
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
        console.error(`Error fetching packaging news for "${term}":`, e);
      }
    }

    console.log(`Fetched ${totalInserted} packaging news items`);
    return totalInserted;
  } catch (error) {
    console.error("Error in fetchPackagingNews:", error);
    return 0;
  }
}
