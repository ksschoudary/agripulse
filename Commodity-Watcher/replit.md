# AgriPulse — Market Intelligence Dashboard

Real-time commodity news and price dashboard for 27+ Indian agricultural commodities.

## Architecture

**Stack**: Express + Vite (full-stack JS), PostgreSQL, React + TanStack Query, Drizzle ORM, shadcn/ui

**Workflow**: `npm run dev` — Express (port 5000) serves both backend API and Vite frontend.

## Key Features

- **News Dashboard**: Breaking agri news from Google RSS; IST timestamps; saved articles; relevance badges; PDF export
- **Commodity Calendar**: Seasonal planting/harvest events per commodity
- **Market Prices (Global Wheat FOB)**: 7-origin wheat FOB table (Russia, EU, USA HRW/SRW, AUS, CAN, ARG) — auto-fetched via CME, IGC, USDA FAS PDF
- **IGC Estimates**: World Grain Estimates from IGC reports

## Important Files

```
shared/schema.ts          — Drizzle schema + Zod insert schemas
server/
  routes.ts               — All API routes
  storage.ts              — IStorage interface + PostgresStorage impl
  market-data.ts          — Global wheat FOB + market snapshot logic
  index.ts                — Boot sequence + schedulers
client/src/
  App.tsx                 — Routes: /, /saved, /weather, /pib, /calendar, /prices, /igc
  components/app-sidebar.tsx
  pages/
    dashboard.tsx
    market-prices.tsx     — Global Wheat FOB table
    igc-estimates.tsx     — IGC world grain estimates
    calendar.tsx
```

## Market Data Scheduler

Runs at 9:30 AM and 6:00 PM IST daily:
- Forex (USD/INR, USD/MYR, EUR/USD) from Yahoo Finance
- Energy/Metals (Brent, Gold) from Yahoo Finance
- Wheat FOB: Russia from CME BWF=F, EU/USA from IGC, AUS/CAN/ARG from USDA FAS PDF

## Database Tables

- `commodities` — 27+ agri commodities + special tabs
- `news` — fetched RSS articles with fresh/saved flags
- `savedArticles` — user bookmarks
- `marketSnapshot` — latest market price snapshot (JSON blob)

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-provided by Replit)
- `SESSION_SECRET` — Express session secret

## Boot Sequence

`syncCommodityQueries()` → `ensureSpecialCommodities()` → `ensureMarketCommodities()` → `startMarketScheduler()` (9:30 AM & 6:00 PM IST)
