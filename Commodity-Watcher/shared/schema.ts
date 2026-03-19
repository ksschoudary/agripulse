import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const commodities = pgTable("commodities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  searchQueries: text("search_queries").notNull(), // Comma-separated query strings
});

export const newsItems = pgTable("news_items", {
  id: serial("id").primaryKey(),
  commodityId: integer("commodity_id").notNull(),
  title: text("title").notNull(),
  link: text("link").notNull().unique(),
  source: text("source").notNull(),
  snippet: text("snippet"),
  publishedAt: timestamp("published_at").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  isSaved: boolean("is_saved").default(false).notNull(),
  isGlobal: boolean("is_global").default(false),
});

export const igcEstimates = pgTable("igc_estimates", {
  id: serial("id").primaryKey(),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  data: text("data").notNull(),
});

export const marketSnapshot = pgTable("market_snapshot", {
  id: serial("id").primaryKey(),
  snapshotAt: timestamp("snapshot_at").defaultNow(),
  snapshotLabel: text("snapshot_label"),
  data: text("data").notNull(),
});

export const ncdexSpotCache = pgTable("ncdex_spot_cache", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  center: text("center").notNull(),
  priceDate: text("price_date").notNull(),
  priceTime: text("price_time").notNull(),
  price: text("price").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCommoditySchema = createInsertSchema(commodities).omit({ id: true });
export const insertNewsItemSchema = createInsertSchema(newsItems).omit({ id: true, fetchedAt: true });

export type Commodity = typeof commodities.$inferSelect;
export type InsertCommodity = z.infer<typeof insertCommoditySchema>;

export type NewsItem = typeof newsItems.$inferSelect;
export type InsertNewsItem = z.infer<typeof insertNewsItemSchema>;
