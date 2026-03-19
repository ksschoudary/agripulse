import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { refreshAllNews, COMMODITY_TITLE_KEYWORDS, NOISE_PATTERNS } from "./news";
import nodemailer from "nodemailer";
import { refreshIgcEstimates } from "./igc";
import { refreshMarketSnapshot, startMarketScheduler } from "./market-data";
import { parseNcdexCsv, getLatestNcdexSpotDisplay, seedNcdexIfEmpty, tryRefreshNcdexSpot } from "./ncdex";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Seed Database with initial commodities
  async function seedDatabase() {
    const commodities = await storage.getCommodities();
    if (commodities.length === 0) {
      const items = [
        { name: "Wheat", searchQueries: "Wheat India news" },
        { name: "Maize", searchQueries: "Maize OR Corn India" },
        { name: "Paddy", searchQueries: "Paddy OR Rice India" },
        { name: "Chana", searchQueries: '(Chana OR "Bengal Gram" OR "Gram") AND (Procurement OR "Rabi 2026" OR "PSS" OR "MSP") India -gold -silver' },
        { name: "Palm Oil", searchQueries: '("Palm Oil" OR CPO OR "Crude Palm Oil" OR "Edible Oil" OR "NMEO") AND (Global OR Indonesia OR Malaysia OR India OR Bursa OR Crude OR dollar OR "piglet" OR "distribution" OR "Amspec" OR "export" OR "Iran crisis" OR "war in Iran" OR "oilmeals") news' },
        { name: "Potato", searchQueries: "Potato India" },
        { name: "Sugar", searchQueries: "Sugar India" },
        { name: "Ethanol / DDGS", searchQueries: "Ethanol OR DDGS India" },
        { name: "Rice bran oil", searchQueries: "Rice Bran Oil India" },
        { name: "Soyabean / Oil", searchQueries: "Soybean OR Soyoil India" },
        { name: "Sunflower oil", searchQueries: "Sunflower oil India" },
        { name: "Cotton seed oil", searchQueries: "Cotton seed oil India" },
        { name: "Cashew", searchQueries: "Cashew India news" },
        { name: "Almond", searchQueries: "Almond Board California India" },
        { name: "Raisins", searchQueries: "Raisins OR Grapes India" },
        { name: "Oats", searchQueries: "Oats India" },
        { name: "Psyllium / Isabgol", searchQueries: "Psyllium OR Isabgol India" },
        { name: "Milk / Dairy", searchQueries: "Milk / Dairy India" },
        { name: "Cocoa", searchQueries: "Cocoa price India" },
        { name: "Chilli powder", searchQueries: "Chilli price India" },
        { name: "Turmeric", searchQueries: "Turmeric price India" },
        { name: "Black pepper", searchQueries: "Black pepper India" },
        { name: "Cardamom", searchQueries: "Cardamom India" },
        { name: "Cabbage / Carrot", searchQueries: "Cabbage OR Carrot India" },
        { name: "Ring beans", searchQueries: "Ring bean India" },
        { name: "Onion", searchQueries: "Onion price India" },
        { name: "Potato (Mandi)", searchQueries: "Potato mandi India" },
        { name: "Groundnut", searchQueries: "Groundnut OR Peanut India" }
      ];

      for (const item of items) {
        await storage.insertCommodity(item);
      }
      
      // Perform initial fetch in the background
      console.log("Seeding database and fetching initial news...");
      refreshAllNews().catch(console.error);
    }
  }
  
  seedDatabase().catch(console.error);

  // Ensure special commodity tabs always exist (idempotent inserts)
  async function ensureSpecialCommodities() {
    const all = await storage.getCommodities();
    const names = all.map(c => c.name);

    const specials = [
      { name: "Agri Weather",     searchQueries: '("IMD" OR "India Meteorological Department" OR "Skymet") (forecast OR warning OR alert OR rainfall OR monsoon) India\n("Southwest Monsoon" OR "Northeast Monsoon" OR "Monsoon India" OR "Indian monsoon" OR "monsoon 2025" OR "monsoon 2026") (crop OR farmer OR agriculture OR sowing OR harvest)\n("Kharif" OR "Rabi" OR "zaid") (weather OR rainfall OR "dry spell" OR flood OR drought OR heatwave) India\n(heatwave OR drought OR flood OR "cold wave" OR cyclone OR "rainfall deficit" OR "excess rainfall") India (farmer OR crop OR agriculture OR "food production")\n("El Nino" OR "El-Nino" OR "La Nina" OR "La-Nina" OR ENSO OR "Indian Ocean Dipole" OR IOD) (India OR monsoon OR rainfall OR crop OR agriculture OR sowing OR kharif OR rabi)' },
      { name: "PIB Updates",      searchQueries: 'site:pib.gov.in (wheat OR rice OR paddy OR maize OR corn OR chana OR pulses OR dal)\nsite:pib.gov.in (sugar OR sugarcane OR edible oil OR palm oil OR oilseed OR groundnut OR soybean)\nsite:pib.gov.in (onion OR potato OR vegetable OR horticulture OR tomato OR spice OR turmeric OR chilli)\nsite:pib.gov.in (milk OR dairy OR farmer OR kisan OR agriculture OR msp OR procurement OR fci)\nsite:pib.gov.in (export ban OR import duty OR food inflation OR food security OR crop OR grain storage)\nsite:pib.gov.in (cashew OR almond OR raisin OR cocoa OR cardamom OR pepper OR fertilizer)' },
      { name: "Packaging",        searchQueries: '"food packaging" OR "flexible packaging" OR "BOPP" OR "BOPET" OR "laminates" India\n"agri packaging" OR "food grade packaging" OR "FSSAI packaging" India\nPackaging India food grain storage export (site:economictimes.indiatimes.com OR site:thehindu.com OR site:ibef.org)' },
      { name: "DGFT Updates",     searchQueries: '"DGFT" OR "Director General of Foreign Trade" India export import notification\nDGFT India commodity export import policy trade (site:economictimes.indiatimes.com OR site:thehindu.com OR site:tribuneindia.com)' },
      { name: "IMD / Advisories", searchQueries: '"IMD" OR "ICAR" advisory India agriculture crop\nIMD India crop advisory rainfall forecast (site:thehindu.com OR site:krishijagran.com OR site:agriwatch.com)' },
    ];

    for (const s of specials) {
      if (!names.includes(s.name)) {
        await storage.insertCommodity(s);
        console.log(`Inserted special commodity: ${s.name}`);
        // Trigger initial fetch in background for newly created special commodity
        const inserted = await storage.getCommodities().then(c => c.find(x => x.name === s.name));
        if (inserted) {
          refreshAllNews(inserted.id).catch(console.error);
        }
      }
    }
  }
  ensureSpecialCommodities().catch(console.error);

  // Ensure new market commodities exist (idempotent — safe to run on every boot)
  async function ensureMarketCommodities() {
    const all = await storage.getCommodities();
    const names = all.map(c => c.name);
    const newMarketCommodities = [
      { name: "Crude",           searchQueries: "Brent crude oil price WTI NYMEX OPEC" },
      { name: "Precious Metals", searchQueries: "Gold price India Silver price India bullion" },
    ];
    for (const mc of newMarketCommodities) {
      if (!names.includes(mc.name)) {
        await storage.insertCommodity(mc);
        console.log(`Inserted market commodity: ${mc.name}`);
        const inserted = await storage.getCommodities().then(c => c.find(x => x.name === mc.name));
        if (inserted) {
          refreshAllNews(inserted.id).catch(console.error);
        }
      }
    }
  }
  ensureMarketCommodities().catch(console.error);

  // Always sync the latest search queries to the DB on every boot (fixes prod/dev drift)
  async function syncCommodityQueries() {
    const latest: Record<string, string> = {
      "Wheat": `("Wheat" OR "Atta" OR "Durum") AND (India OR FCI OR Procurement OR MSP OR Mandi OR Price OR Stock OR Import OR Export)
Wheat (farmers OR "record output" OR "harvest forecast" OR "bumper crop" OR "Rabi wheat" OR "wheat output" OR procurement) India
("PP bag" OR "polypropylene bag" OR "jute bag" OR "procurement bag" OR "gunny bag") wheat (India OR MP OR "Madhya Pradesh" OR Punjab OR Haryana OR FCI OR procurement)
Wheat India (site:krishijagran.com OR site:agriwatch.com OR site:igrain.in OR site:ibef.org)
Wheat India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com OR site:tribuneindia.com OR site:freshplaza.com)
("grain stock" OR "grain stocks" OR "foodgrain stock" OR "food grain" OR "surplus grain" OR "grain reserve") India (FCI OR government OR officials OR "food security") (site:hindustantimes.com OR site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com)`,

      "Maize": `("Maize" OR "Corn" OR "Makka") AND (India OR Bihar OR Nizamabad OR Davangere OR "Poultry Feed" OR Starch OR Ethanol OR MSP OR Mandi) -"US Corn" -"Brazil Corn" -"Chicago Board"
Maize India ethanol poultry starch demand price
Maize OR Corn India (site:krishijagran.com OR site:agriwatch.com OR site:igrain.in)
Maize OR Corn India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com OR site:tribuneindia.com)
("E20" OR "E10" OR "ethanol blending" OR "ethanol mandate" OR "blending mandate" OR "petrol blending") India (maize OR corn OR food security OR feedstock OR grain)`,

      "Paddy": `("Paddy" OR "Rice" OR "Basmati" OR "Non-Basmati") AND (India OR FCI OR Procurement OR MSP OR Mandi OR Price OR Export OR Stock OR Levy)
Paddy rice India sowing procurement kharif season
Paddy OR Rice OR Basmati India (site:krishijagran.com OR site:agriwatch.com OR site:igrain.in)
Paddy OR Basmati India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com OR site:tribuneindia.com OR site:freshplaza.com)
rice "export rates" India (Vietnam OR Thailand OR Myanmar OR "global demand" OR "global market") -recipe`,

      "Chana": `("Chana" OR "Bengal Gram" OR "Desi Chana" OR "Kabuli Chana") AND (India OR NAFED OR MSP OR Procurement OR Mandi OR Price OR Stock) -groundnut -peanut -gold -silver
Chana gram pulse India import buffer stock price -gold -silver -bullion
Chana OR "Bengal Gram" India (site:krishijagran.com OR site:agriwatch.com OR site:igrain.in) -gold -silver
Chana India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com OR site:tribuneindia.com) -gold -silver
pulses India (import OR export OR "duty-free" OR "duty free" OR policy OR procurement OR NAFED OR NCCF OR stock OR price OR MSP OR ban OR notification) -gold -silver`,

      "Palm Oil": `("Palm Oil" OR "Crude Palm Oil" OR CPO OR MPOB OR GAPKI OR "Refined Palm Oil" OR "Palm Olein")
"Palm Oil" India import edible oil duty tariff price
"Palm Oil" OR CPO (site:economictimes.indiatimes.com OR site:agriwatch.com OR site:thehindu.com OR site:freshplaza.com)
"Palm Oil" (site:freshplaza.com OR site:freshfruitportal.com OR site:krishijagran.com)`,

      "Potato": `(Potato OR Aloo OR "Potato Market") AND (India OR Mandi OR Retail OR Wholesale OR Price OR Market) -recipe -cook
Potato India cold storage supply price Agra UP
Potato India (site:krishijagran.com OR site:agriwatch.com OR site:igrain.in)
Potato India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com OR site:tribuneindia.com)`,

      "Sugar": `("Sugar" OR "Sugarcane" OR "Ethanol" OR FRP) AND (India OR ISMA OR NFCSF OR Mill OR Mandi OR Price OR Stock OR Export OR Quota)
Sugar India mill production export diversion ethanol
Sugar India (site:krishijagran.com OR site:agriwatch.com OR site:igrain.in)
Sugar India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com OR site:tribuneindia.com)`,

      "Ethanol / DDGS": `Ethanol India blending policy production OMC price
DDGS India import poultry feed price distillers grain
Ethanol OR DDGS India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com OR site:krishijagran.com)
Ethanol OR DDGS India (site:agriwatch.com OR site:igrain.in OR site:ibef.org)`,

      "Rice bran oil": `"Rice Bran Oil" India price production export refinery
"Rice Bran Oil" market edible oil India demand
"Rice Bran Oil" India (site:agriwatch.com OR site:krishijagran.com OR site:economictimes.indiatimes.com OR site:thehindu.com)`,

      "Soyabean / Oil": `("Soybean Oil" OR "Soy Oil" OR CBOT OR "Soybean Price" OR "Brazil Soybean" OR "Argentina Soybean" OR "USDA Soybean")
Soybean India import crushing price edible oil
Soybean OR "Soy Oil" India (site:agriwatch.com OR site:igrain.in OR site:krishijagran.com OR site:freshplaza.com)
Soybean India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com)`,

      "Sunflower oil": `"Sunflower Oil" India price import edible oil duty tariff
"Sunflower Oil" Ukraine Black Sea supply global price
"Sunflower Oil" India (site:agriwatch.com OR site:krishijagran.com OR site:economictimes.indiatimes.com OR site:thehindu.com)`,

      "Cotton seed oil": `"Cottonseed Oil" OR "Cotton seed oil" India price production demand
Cottonseed India oil crushing market price
"Cottonseed Oil" India (site:agriwatch.com OR site:krishijagran.com OR site:economictimes.indiatimes.com OR site:thehindu.com)`,

      "Cashew": `Cashew India trade policy export import tariff mandi price kernel
Cashew India USA bilateral trade agreement deal
"All India Cashew Association" OR AICA OR "cashew association" India
Cashew Africa Vietnam kernel processing market supply chain
Cashew illegal import India enforcement quality surge
Cashew Andhra Pradesh OR Karnataka OR Kerala OR Goa market price arrivals
Cashew India (site:agriwatch.com OR site:igrain.in OR site:krishijagran.com OR site:freshplaza.com)
Cashew India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com OR site:tribuneindia.com)`,

      "Almond": `Almond India import price mandi market trade tariff
Almond California production crop yield harvest season forecast outlook
Almond California groundwater water orchards sustainability removal acreage
Almond California bloom weather rain frost pollination
Almond Australia China export demand supply global trade
Almond "Blue Diamond" OR "Almond Board of California" OR USDA crop estimate
Almond India (site:agriwatch.com OR site:igrain.in OR site:krishijagran.com OR site:ibef.org)
Almond (site:freshplaza.com OR site:freshfruitportal.com OR site:economictimes.indiatimes.com OR site:thehindu.com)`,

      "Raisins": `("Raisins" OR "Kishmish" OR "Dried Grapes") AND (India OR Sangli OR Nashik OR Price OR Mandi OR Export)
Raisins India import price Afghanistan Iran quality
Raisins India (site:agriwatch.com OR site:igrain.in OR site:krishijagran.com)
Raisins India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:freshplaza.com OR site:tribuneindia.com)`,

      "Oats": `Oats India price import breakfast cereal market
Oats India production crop demand
Oats India (site:economictimes.indiatimes.com OR site:krishijagran.com OR site:thehindu.com OR site:agriwatch.com)`,

      "Psyllium / Isabgol": `Psyllium OR Isabgol India price export Unjha Gujarat production
Psyllium husk India demand pharmaceutical export quality
Psyllium OR Isabgol India (site:agriwatch.com OR site:igrain.in OR site:krishijagran.com OR site:economictimes.indiatimes.com)`,

      "Milk / Dairy": `Milk Dairy India price AMUL procurement inflation farmer
"Milk price" OR "dairy sector" India production import export
Milk OR Dairy India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com OR site:tribuneindia.com)
Milk OR Dairy India (site:krishijagran.com OR site:agriwatch.com OR site:ibef.org)
Milk OR Dairy India (site:thehansindia.com OR site:telegraphindia.com OR site:hindustantimes.com OR site:livemint.com OR site:ndtv.com)
FSSAI milk dairy India (producer OR quality OR safety OR standard OR regulation OR certificate OR licence)`,

      "Cocoa": `("Cocoa" OR "Cacao") AND (India OR ICCO OR Price OR "Ivory Coast" OR Ghana OR Arrival)
Cocoa India import chocolate demand processing
Cocoa (site:agriwatch.com OR site:freshplaza.com OR site:krishijagran.com OR site:ibef.org)
Cocoa Ghana "Ivory Coast" price supply (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com)`,

      "Chilli powder": `Chilli India price mandi Guntur Kheda Warangal export
"Chilli" OR "Red pepper" India crop arrival market
Chilli India (site:agriwatch.com OR site:igrain.in OR site:krishijagran.com)
Chilli India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com OR site:tribuneindia.com)`,

      "Turmeric": `Turmeric India price Nizamabad Sangli Erode Nanded export arrival
Turmeric India crop sowing demand export quality
Turmeric India (site:agriwatch.com OR site:igrain.in OR site:krishijagran.com)
Turmeric India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:tribuneindia.com OR site:freshplaza.com)`,

      "Black pepper": `"Black Pepper" India Kerala price export mandi Kochi
"Black Pepper" India Vietnam global supply price
"Black Pepper" India (site:agriwatch.com OR site:igrain.in OR site:krishijagran.com)
"Black Pepper" India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:freshplaza.com)`,

      "Cardamom": `Cardamom India Kerala auction price export arrival
Cardamom India crop production demand global
Cardamom India (site:agriwatch.com OR site:igrain.in OR site:krishijagran.com)
Cardamom India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:tribuneindia.com)`,

      "Cabbage / Carrot": `Cabbage OR Carrot India price market wholesale retail vegetable
Cabbage OR Carrot India supply shortage glut demand
Cabbage OR Carrot India (site:krishijagran.com OR site:agriwatch.com OR site:thehindu.com OR site:timesofindia.indiatimes.com)`,

      "Ring beans": `"Ring bean" OR "Kidney bean" OR Rajma India price mandi import
Rajma OR "kidney bean" India crop market price
Rajma OR "ring bean" India (site:agriwatch.com OR site:krishijagran.com OR site:economictimes.indiatimes.com)`,

      "Onion": `("Onion") AND (India OR NAFED OR NCCF OR Buffer OR "Export Duty" OR Mandi OR Price OR Stock)
Onion India export ban duty price storage Nashik Lasalgaon
Onion India (site:agriwatch.com OR site:igrain.in OR site:krishijagran.com)
Onion India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com OR site:tribuneindia.com)`,

      "Potato (Mandi)": `(Potato OR Aloo OR "Potato Market") AND (India OR Mandi OR Retail OR Wholesale OR Price OR Market) -recipe -cook
Potato mandi arrival India Agra UP cold storage price
Potato mandi India (site:agriwatch.com OR site:igrain.in OR site:krishijagran.com OR site:timesofindia.indiatimes.com)`,

      "Groundnut": `Groundnut OR Peanut India price MSP NAFED export Saurashtra Rajkot
Groundnut India oil crushing edible demand crop
Groundnut OR Peanut India (site:agriwatch.com OR site:igrain.in OR site:krishijagran.com)
Groundnut India (site:economictimes.indiatimes.com OR site:thehindu.com OR site:timesofindia.indiatimes.com OR site:tribuneindia.com)`,

      "Crude": `Brent crude oil price WTI NYMEX OPEC supply demand barrel
India crude oil import price Brent WTI energy market (site:economictimes.indiatimes.com OR site:thehindu.com OR site:businessline.com OR site:livemint.com)
("Crude Palm Oil" OR CPO) price MPOB Malaysia export import daily market
OPEC crude oil production cut quota barrel price supply demand
crude oil energy market price today (site:reuters.com OR site:oilprice.com)`,

      "Precious Metals": `gold price India today MCX bullion market rate
silver price India today MCX bullion market rate
("Gold price" OR "Silver price") (India OR international OR comex OR LBMA) today market
gold OR silver (site:economictimes.indiatimes.com OR site:thehindu.com OR site:livemint.com OR site:financialexpress.com) price today rate
("Gold futures" OR "Silver futures" OR "COMEX gold" OR "LBMA gold" OR "MCX gold" OR "MCX silver") price market today`,

      "Agri Weather": `("IMD" OR "India Meteorological Department" OR "Skymet") (forecast OR warning OR alert OR rainfall OR monsoon) India
("Southwest Monsoon" OR "Northeast Monsoon" OR "Monsoon India" OR "Indian monsoon" OR "monsoon 2025" OR "monsoon 2026") (crop OR farmer OR agriculture OR sowing OR harvest)
("Kharif" OR "Rabi" OR "zaid") (weather OR rainfall OR "dry spell" OR flood OR drought OR heatwave) India
(heatwave OR drought OR flood OR "cold wave" OR cyclone OR "rainfall deficit" OR "excess rainfall") India (farmer OR crop OR agriculture OR "food production")
("El Nino" OR "El-Nino" OR "La Nina" OR "La-Nina" OR ENSO OR "Indian Ocean Dipole" OR IOD) (India OR monsoon OR rainfall OR crop OR agriculture OR sowing OR kharif OR rabi)`,

      "PIB Updates": `site:pib.gov.in (wheat OR rice OR paddy OR maize OR corn OR chana OR pulses OR dal)
site:pib.gov.in (sugar OR sugarcane OR edible oil OR palm oil OR oilseed OR groundnut OR soybean)
site:pib.gov.in (onion OR potato OR vegetable OR horticulture OR tomato OR spice OR turmeric OR chilli)
site:pib.gov.in (milk OR dairy OR farmer OR kisan OR agriculture OR msp OR procurement OR fci)
site:pib.gov.in (export ban OR import duty OR food inflation OR food security OR crop OR grain storage)
site:pib.gov.in (cashew OR almond OR raisin OR cocoa OR cardamom OR pepper OR fertilizer)`,

      "Packaging": `"food packaging" OR "flexible packaging" OR "BOPP" OR "BOPET" OR "laminates" India
"agri packaging" OR "food grade packaging" OR "FSSAI packaging" India
Packaging India food grain storage export (site:economictimes.indiatimes.com OR site:thehindu.com OR site:ibef.org)`,

      "DGFT Updates": `"DGFT" OR "Director General of Foreign Trade" India export import notification
DGFT India commodity export import policy trade (site:economictimes.indiatimes.com OR site:thehindu.com OR site:tribuneindia.com)`,

      "IMD / Advisories": `"IMD" OR "ICAR" advisory India agriculture crop
IMD India crop advisory rainfall forecast (site:thehindu.com OR site:krishijagran.com OR site:agriwatch.com)`,
    };

    let updated = 0;
    for (const [name, searchQueries] of Object.entries(latest)) {
      try {
        await storage.updateCommoditySearchQueries(name, searchQueries);
        updated++;
      } catch (e) {
        console.error(`Failed to sync queries for ${name}:`, e);
      }
    }
    console.log(`syncCommodityQueries: updated ${updated} commodity search queries`);
  }
  syncCommodityQueries().catch(console.error);

  // One-time cleanup: remove irrelevant articles already in the DB based on commodity title keywords
  async function cleanupIrrelevantArticles() {
    const allCommodities = await storage.getCommodities();
    let totalDeleted = 0;
    for (const c of allCommodities) {
      const keywords = COMMODITY_TITLE_KEYWORDS[c.name];
      if (!keywords || keywords.length === 0) continue; // No filter defined for this commodity
      const deleted = await storage.deleteIrrelevantNewsByCommodity(c.id, keywords, NOISE_PATTERNS);
      if (deleted > 0) {
        console.log(`Cleaned up ${deleted} irrelevant articles for "${c.name}"`);
        totalDeleted += deleted;
      }
    }
    if (totalDeleted > 0) console.log(`Total irrelevant articles removed: ${totalDeleted}`);
  }
  cleanupIrrelevantArticles().catch(console.error);

  // Rolling 365-day window: delete Wheat articles older than 365 days
  storage.deleteOldWheatArticles(365).then(n => {
    if (n > 0) console.log(`[Cleanup] Deleted ${n} Wheat articles older than 365 days`);
  }).catch(console.error);

  // Un-save saved articles older than 365 days (keep in commodity tabs, remove from Saved)
  storage.deleteOldSavedArticles(365).then(n => {
    if (n > 0) console.log(`[Cleanup] Auto-un-saved ${n} articles older than 365 days`);
  }).catch(console.error);

  app.get("/api/news/counts", async (req, res) => {
    const counts = await storage.getNewsFreshCounts(8);
    res.json(counts);
  });

  app.get(api.commodities.list.path, async (req, res) => {
    const commodities = await storage.getCommodities();
    res.json(commodities);
  });

  app.get(api.news.list.path, async (req, res) => {
    try {
      const { commodityId, saved, page, pageSize } = req.query;
      if (saved === "true") {
        if (page) {
          const pageNum = Math.max(1, Number(page) || 1);
          const size = Math.min(100, Math.max(1, Number(pageSize) || 50));
          const result = await storage.getSavedNewsPaginated(pageNum, size);
          return res.json(result);
        }
        const news = await storage.getSavedNews();
        return res.json(news);
      }
      const parsedId = commodityId ? Number(commodityId) : undefined;
      
      // Check if pagination is requested
      if (page && parsedId) {
        const pageNum = Math.max(1, Number(page) || 1);
        const size = Math.min(100, Math.max(1, Number(pageSize) || 25));
        const result = await storage.getNewsPaginated(parsedId, pageNum, size);
        return res.json(result);
      }
      
      // When no commodity is specified (Latest Updates view), exclude weather news
      const news = await storage.getNews(parsedId, !parsedId);
      res.json(news);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch news" });
    }
  });

  app.patch("/api/news/:id/toggle-save", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.toggleSaveNews(id);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to toggle save" });
    }
  });

  app.post(api.news.refresh.path, async (req, res) => {
    try {
      const { commodityId } = req.body || {};
      const parsedId = commodityId ? Number(commodityId) : undefined;

      if (!parsedId) {
        // Full refresh: respond immediately, run in background to avoid proxy timeout
        res.json({ message: "Sync started", count: 0, background: true });
        refreshAllNews(undefined).then(async (count) => {
          const cleanedCount = await storage.cleanupOldNews(365);
          if (cleanedCount > 0) console.log(`Cleaned up ${cleanedCount} old news items`);
          console.log(`Background full refresh done: ${count} articles`);
        }).catch(console.error);
        return;
      }

      // Single-commodity refresh: run synchronously (fast — parallel queries)
      const count = await refreshAllNews(parsedId);
      res.json({ message: "News refreshed successfully", count });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to refresh news" });
    }
  });

  // PDF report email endpoint
  app.post("/api/send-pdf-report", async (req, res) => {
    try {
      const { email, pdfBase64, dateFrom, dateTo, articleCount } = req.body;

      if (!email || !pdfBase64) {
        return res.status(400).json({ message: "Email and PDF data are required" });
      }

      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (!smtpUser || !smtpPass) {
        return res.status(503).json({ message: "EMAIL_NOT_CONFIGURED" });
      }

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const pdfBuffer = Buffer.from(pdfBase64.split(",").pop() || pdfBase64, "base64");
      const periodLabel = dateFrom === dateTo ? dateFrom : `${dateFrom} to ${dateTo}`;
      const fileName = `AgriPulse-Saved-${dateFrom.replace(" ", "-")}${dateFrom !== dateTo ? `-to-${dateTo.replace(" ", "-")}` : ""}.pdf`;

      await transporter.sendMail({
        from: process.env.SMTP_FROM || smtpUser,
        to: email,
        subject: `AgriPulse Saved Articles — ${periodLabel}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #166534;">AgriPulse Market Intelligence</h2>
            <p>Please find attached your <strong>Saved Articles Report</strong>.</p>
            <table style="border-collapse: collapse; width: 100%;">
              <tr><td style="padding: 6px 0; color: #555;">Period:</td><td><strong>${periodLabel}</strong></td></tr>
              <tr><td style="padding: 6px 0; color: #555;">Articles:</td><td><strong>${articleCount}</strong></td></tr>
              <tr><td style="padding: 6px 0; color: #555;">Generated:</td><td>${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</td></tr>
            </table>
            <hr style="margin: 20px 0; border: 1px solid #e5e7eb;"/>
            <p style="color: #888; font-size: 12px;">This report was generated by AgriPulse — Real-time Commodity Intelligence Platform.</p>
          </div>
        `,
        attachments: [{ filename: fileName, content: pdfBuffer, contentType: "application/pdf" }],
      });

      res.json({ message: "Report sent successfully" });
    } catch (err) {
      console.error("Email send error:", err);
      res.status(500).json({ message: "Failed to send email. Please check your SMTP settings." });
    }
  });

  // ── IGC World Estimates ──────────────────────────────────────────────────
  app.get("/api/igc-estimates", async (_req, res) => {
    const row = await storage.getLatestIgcEstimates();
    if (!row) return res.json(null);
    res.json({ fetchedAt: row.fetchedAt, data: JSON.parse(row.data) });
  });

  app.post("/api/igc-estimates/refresh", async (_req, res) => {
    try {
      const data = await refreshIgcEstimates();
      res.json({ ok: true, data });
    } catch (err: any) {
      console.error("IGC refresh error:", err);
      res.status(500).json({ message: err.message || "IGC fetch failed" });
    }
  });

  // ── Market Snapshot ───────────────────────────────────────────────────────
  app.get("/api/market-snapshot", async (_req, res) => {
    const row = await storage.getLatestMarketSnapshot();
    if (!row) return res.json(null);
    res.json({ snapshotAt: row.snapshotAt, snapshotLabel: row.snapshotLabel, data: JSON.parse(row.data) });
  });

  app.post("/api/market-snapshot/refresh", async (_req, res) => {
    try {
      const data = await refreshMarketSnapshot();
      res.json({ ok: true, data });
    } catch (err: any) {
      console.error("Market snapshot refresh error:", err);
      res.status(500).json({ message: err.message || "Market data fetch failed" });
    }
  });

  // ── NCDEX Spot Prices ─────────────────────────────────────────────────────
  app.get("/api/ncdex-spot", async (_req, res) => {
    try {
      const result = await getLatestNcdexSpotDisplay();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ncdex-spot/seed", async (req, res) => {
    try {
      const { csv } = req.body;
      if (!csv || typeof csv !== "string") return res.status(400).json({ message: "csv required" });
      const rows = parseNcdexCsv(csv);
      if (rows.length === 0) return res.status(400).json({ message: "No rows parsed" });
      await storage.saveNcdexSpotPrices(rows);
      res.json({ ok: true, rowCount: rows.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ncdex-spot/refresh", async (_req, res) => {
    try {
      const result = await tryRefreshNcdexSpot();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err.message });
    }
  });

  // Start the twice-daily market scheduler
  startMarketScheduler();

  // Auto-seed NCDEX spot prices from bundled seed file if DB is empty
  seedNcdexIfEmpty().catch(console.error);

  return httpServer;
}
