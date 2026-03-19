import { db } from "./db";
import { commodities, newsItems, igcEstimates, marketSnapshot, ncdexSpotCache, type Commodity, type InsertCommodity, type NewsItem, type InsertNewsItem } from "@shared/schema";
import { eq, desc, lt, ne, notInArray, sql, count, or, and, gte, ilike } from "drizzle-orm";

export interface IStorage {
  getCommodities(): Promise<Commodity[]>;
  getCommodity(id: number): Promise<Commodity | undefined>;
  insertCommodity(commodity: InsertCommodity): Promise<Commodity>;
  updateCommoditySearchQueries(name: string, searchQueries: string): Promise<void>;
  getNews(commodityId?: number): Promise<NewsItem[]>;
  getNewsPaginated(commodityId: number, page: number, pageSize: number): Promise<{ items: NewsItem[], total: number }>;
  getSavedNewsPaginated(page: number, pageSize: number): Promise<{ items: NewsItem[], total: number }>;
  insertNewsItem(newsItem: InsertNewsItem): Promise<NewsItem>;
  insertNewsItems(newsItems: InsertNewsItem[]): Promise<void>;
  toggleSaveNews(id: number): Promise<NewsItem>;
  getSavedNews(): Promise<NewsItem[]>;
  getNewsFreshCounts(sinceHours?: number): Promise<Array<{ commodityId: number; freshCount: number }>>;
  deleteIrrelevantNewsByCommodity(commodityId: number, requiredKeywords: string[], noisePatterns: string[]): Promise<number>;
  cleanupOldNews(daysOld: number): Promise<number>;
  deleteOldWheatArticles(daysOld?: number): Promise<number>;
  deleteOldSavedArticles(daysOld?: number): Promise<number>;
  saveIgcEstimates(data: string): Promise<void>;
  getLatestIgcEstimates(): Promise<{ id: number; fetchedAt: Date | null; data: string } | null>;
  saveMarketSnapshot(label: string, data: string): Promise<void>;
  getLatestMarketSnapshot(): Promise<{ id: number; snapshotAt: Date | null; snapshotLabel: string | null; data: string } | null>;
  saveNcdexSpotPrices(rows: Array<{ symbol: string; center: string; priceDate: string; priceTime: string; price: string }>): Promise<void>;
  getLatestNcdexSpotPrices(): Promise<Array<{ symbol: string; center: string; priceDate: string; priceTime: string; price: string; updatedAt: Date | null }>>;
}

export class DatabaseStorage implements IStorage {
  async getCommodities(): Promise<Commodity[]> {
    return await db.select().from(commodities).orderBy(commodities.id);
  }

  async getCommodity(id: number): Promise<Commodity | undefined> {
    const [commodity] = await db.select().from(commodities).where(eq(commodities.id, id));
    return commodity;
  }

  async insertCommodity(commodity: InsertCommodity): Promise<Commodity> {
    const [newCommodity] = await db.insert(commodities).values(commodity).returning();
    return newCommodity;
  }

  async updateCommoditySearchQueries(name: string, searchQueries: string): Promise<void> {
    await db.update(commodities)
      .set({ searchQueries })
      .where(eq(commodities.name, name));
  }

  async getNews(commodityId?: number, excludeWeather: boolean = false): Promise<NewsItem[]> {
    if (commodityId) {
      return await db.select().from(newsItems)
        .where(eq(newsItems.commodityId, commodityId))
        .orderBy(desc(newsItems.publishedAt))
        .limit(100);
    }
    
    // Get all news excluding special tab commodities (Weather, PIB, Packaging, DGFT, IMD) when in Latest Updates view
    if (excludeWeather) {
      const SPECIAL_NAMES = ["Agri Weather", "PIB Updates", "Packaging", "DGFT Updates", "IMD / Advisories"];
      const allCommodities = await this.getCommodities();
      const specialIds = allCommodities.filter(c => SPECIAL_NAMES.includes(c.name)).map(c => c.id);
      if (specialIds.length > 0) {
        return await db.select().from(newsItems)
          .where(notInArray(newsItems.commodityId, specialIds))
          .orderBy(desc(newsItems.publishedAt))
          .limit(200);
      }
    }
    
    return await db.select().from(newsItems)
      .orderBy(desc(newsItems.publishedAt))
      .limit(200);
  }

  async insertNewsItem(newsItem: InsertNewsItem): Promise<NewsItem> {
    const [newItem] = await db.insert(newsItems).values(newsItem).returning();
    return newItem;
  }

  async insertNewsItems(items: InsertNewsItem[]): Promise<void> {
    if (items.length === 0) return;
    // On conflict do nothing based on unique link
    await db.insert(newsItems).values(items).onConflictDoNothing({ target: newsItems.link });
  }

  async toggleSaveNews(id: number): Promise<NewsItem> {
    const [item] = await db.select().from(newsItems).where(eq(newsItems.id, id));
    if (!item) throw new Error("News item not found");
    const [updated] = await db.update(newsItems)
      .set({ isSaved: !item.isSaved })
      .where(eq(newsItems.id, id))
      .returning();
    return updated;
  }

  async getSavedNews(): Promise<NewsItem[]> {
    return await db.select().from(newsItems)
      .where(eq(newsItems.isSaved, true))
      .orderBy(desc(newsItems.publishedAt));
  }

  async getNewsPaginated(commodityId: number, page: number = 1, pageSize: number = 25): Promise<{ items: NewsItem[], total: number }> {
    const offset = (page - 1) * pageSize;

    // 365-day rolling window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);

    // Base: commodity + date window
    let whereCondition: any = and(
      eq(newsItems.commodityId, commodityId),
      gte(newsItems.publishedAt, cutoff),
    );

    // PIB Updates: additionally require title to mention at least one commodity keyword
    const [commodityRecord] = await db.select({ name: commodities.name }).from(commodities).where(eq(commodities.id, commodityId)).limit(1);
    if (commodityRecord?.name === "PIB Updates") {
      const keywords = [
        // Grains & staples
        "wheat", "atta", "maize", "corn", "makka", "paddy", "rice", "basmati",
        // Pulses
        "chana", "gram", "pulse", "dal", "lentil", "arhar", "moong", "urad", "masur",
        // Oilseeds & edible oils
        "palm oil", "edible oil", "oilseed", "sunflower", "soybean", "soya",
        "mustard oil", "groundnut", "peanut", "cottonseed", "rice bran oil",
        // Vegetables
        "potato", "aloo", "onion", "tomato", "vegetable", "horticulture",
        // Sugar & sweeteners
        "sugar", "sugarcane", "ethanol", "jaggery", "molasses",
        // Spices
        "turmeric", "chilli", "pepper", "cardamom", "spice",
        // Tree crops / dry fruits
        "cashew", "almond", "raisin", "kishmish", "cocoa", "coconut",
        // Dairy
        "milk", "dairy", "amul", "butter", "cheese",
        // Other agri
        "oats", "isabgol", "psyllium", "fertiliser", "fertilizer",
        // Policy / institutional
        "msp", "mandi", "fci", "nafed", "nccf", "procurement", "kisan",
        "food security", "food inflation", "food processing", "agri",
        "crop", "harvest", "sowing", "kharif", "rabi", "farmer",
        "agriculture", "apmc", "commodity", "export ban", "import duty",
        "grain", "storage", "irrigation", "pmksy", "warehousing", "silos",
        "price stabilisation", "buffer stock", "price support", "market intervention",
        "drip irrigation", "crop insurance", "pm fasal", "fasal bima",
      ];
      const keywordConditions = keywords.map(kw => ilike(newsItems.title, `%${kw}%`));
      whereCondition = and(whereCondition, or(...keywordConditions));
    }

    const items = await db.select().from(newsItems)
      .where(whereCondition)
      .orderBy(desc(newsItems.publishedAt))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db.select({ count: count() })
      .from(newsItems)
      .where(whereCondition);

    const total = Number(countResult[0]?.count) || 0;

    return { items, total };
  }

  async getNewsFreshCounts(sinceHours: number = 8): Promise<Array<{ commodityId: number; freshCount: number }>> {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    const rows = await db
      .select({ commodityId: newsItems.commodityId, freshCount: count(newsItems.id) })
      .from(newsItems)
      .where(gte(newsItems.publishedAt, since))
      .groupBy(newsItems.commodityId);
    return rows.map(r => ({ commodityId: r.commodityId, freshCount: Number(r.freshCount) }));
  }

  async deleteIrrelevantNewsByCommodity(commodityId: number, requiredKeywords: string[], noisePatterns: string[]): Promise<number> {
    // Build: NOT (kw1 OR kw2 OR ...) OR (noise1 OR noise2 OR ...)
    const keywordConditions = requiredKeywords.map(kw => ilike(newsItems.title, `%${kw}%`));
    const noiseConditions = noisePatterns.map(p => ilike(newsItems.title, `%${p}%`));

    let deleteCondition;
    if (keywordConditions.length > 0 && noiseConditions.length > 0) {
      deleteCondition = and(
        eq(newsItems.commodityId, commodityId),
        or(
          sql`NOT (${or(...keywordConditions)})`,
          or(...noiseConditions)
        )
      );
    } else if (keywordConditions.length > 0) {
      deleteCondition = and(
        eq(newsItems.commodityId, commodityId),
        sql`NOT (${or(...keywordConditions)})`
      );
    } else if (noiseConditions.length > 0) {
      deleteCondition = and(
        eq(newsItems.commodityId, commodityId),
        or(...noiseConditions)
      );
    } else {
      return 0;
    }

    const result = await db.delete(newsItems).where(deleteCondition).returning({ id: newsItems.id });
    return result.length;
  }

  async cleanupOldNews(daysOld: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await db.delete(newsItems)
      .where(lt(newsItems.publishedAt, cutoffDate))
      .returning();
    
    return result.length;
  }

  async getSavedNewsPaginated(page: number = 1, pageSize: number = 50): Promise<{ items: NewsItem[], total: number }> {
    const offset = (page - 1) * pageSize;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);

    const whereCondition = and(
      eq(newsItems.isSaved, true),
      gte(newsItems.publishedAt, cutoff),
    );

    const items = await db.select().from(newsItems)
      .where(whereCondition)
      .orderBy(desc(newsItems.publishedAt))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db.select({ count: count() })
      .from(newsItems)
      .where(whereCondition);

    return { items, total: Number(countResult[0]?.count) || 0 };
  }

  async deleteOldWheatArticles(daysOld: number = 365): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const [wheat] = await db.select({ id: commodities.id })
      .from(commodities)
      .where(eq(commodities.name, "Wheat"))
      .limit(1);

    if (!wheat) return 0;

    const result = await db.delete(newsItems)
      .where(and(
        eq(newsItems.commodityId, wheat.id),
        lt(newsItems.publishedAt, cutoff),
      ))
      .returning({ id: newsItems.id });

    return result.length;
  }

  async deleteOldSavedArticles(daysOld: number = 365): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    // Un-save articles older than daysOld — keep them in their commodity tabs but remove from Saved
    const result = await db.update(newsItems)
      .set({ isSaved: false })
      .where(and(
        eq(newsItems.isSaved, true),
        lt(newsItems.publishedAt, cutoff),
      ))
      .returning({ id: newsItems.id });

    return result.length;
  }

  async saveIgcEstimates(data: string): Promise<void> {
    await db.insert(igcEstimates).values({ data });
  }

  async getLatestIgcEstimates() {
    const [row] = await db.select().from(igcEstimates).orderBy(desc(igcEstimates.fetchedAt)).limit(1);
    return row ?? null;
  }

  async saveMarketSnapshot(label: string, data: string): Promise<void> {
    await db.insert(marketSnapshot).values({ snapshotLabel: label, data });
  }

  async getLatestMarketSnapshot() {
    const [row] = await db.select().from(marketSnapshot).orderBy(desc(marketSnapshot.snapshotAt)).limit(1);
    return row ?? null;
  }

  async saveNcdexSpotPrices(rows: Array<{ symbol: string; center: string; priceDate: string; priceTime: string; price: string }>): Promise<void> {
    if (rows.length === 0) return;

    const incomingDates = [...new Set(rows.map(r => r.priceDate))];
    for (const date of incomingDates) {
      await db.delete(ncdexSpotCache).where(eq(ncdexSpotCache.priceDate, date));
    }
    await db.insert(ncdexSpotCache).values(rows);

    const allRows = await db.selectDistinct({ priceDate: ncdexSpotCache.priceDate }).from(ncdexSpotCache);
    const MONTHS: Record<string, number> = {
      Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12
    };
    const toNum = (d: string) => {
      const p = d.split('-');
      return p.length === 3 ? parseInt(p[2])*10000 + (MONTHS[p[1]] ?? 0)*100 + parseInt(p[0]) : 0;
    };
    const sortedDates = allRows.map(r => r.priceDate).sort((a, b) => toNum(b) - toNum(a));
    if (sortedDates.length > 2) {
      const keepDates = sortedDates.slice(0, 2);
      await db.delete(ncdexSpotCache).where(notInArray(ncdexSpotCache.priceDate, keepDates));
    }
  }

  async getLatestNcdexSpotPrices() {
    return await db.select().from(ncdexSpotCache).orderBy(ncdexSpotCache.symbol, desc(ncdexSpotCache.updatedAt));
  }
}

export const storage = new DatabaseStorage();
