import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Wheat,
  BarChart2,
  ScrollText,
  TrendingUp,
  CloudSun,
  MapPin,
  Clock,
  Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isSameMonth, isToday, parseISO, isWithinInterval } from "date-fns";

// ─── Types ──────────────────────────────────────────────────────────────────
type Category = "harvest" | "report" | "policy" | "trade" | "advisory";

interface CalEvent {
  id: string;
  title: string;
  date?: string;           // "YYYY-MM-DD" for single-day
  startDate?: string;      // "YYYY-MM-DD" for ranges
  endDate?: string;
  category: Category;
  commodity?: string;
  description: string;
  source?: string;
}

// ─── Category Meta ───────────────────────────────────────────────────────────
const CAT = {
  harvest:  { label: "Harvest Season",  color: "emerald", dot: "bg-emerald-500",  badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",  icon: Wheat      },
  report:   { label: "Trade Report",    color: "blue",    dot: "bg-blue-500",     badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",           icon: BarChart2  },
  policy:   { label: "Policy Event",    color: "violet",  dot: "bg-violet-500",   badge: "bg-violet-500/15 text-violet-400 border-violet-500/30",     icon: ScrollText },
  trade:    { label: "Market Event",    color: "orange",  dot: "bg-orange-500",   badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",     icon: TrendingUp },
  advisory: { label: "IMD / Advisory",  color: "amber",   dot: "bg-amber-400",    badge: "bg-amber-400/15 text-amber-400 border-amber-400/30",        icon: CloudSun   },
} satisfies Record<Category, { label: string; color: string; dot: string; badge: string; icon: React.ElementType }>;

// ─── Event Data ──────────────────────────────────────────────────────────────
const EVENTS: CalEvent[] = [

  // ── USDA WASDE Monthly Reports ──────────────────────────────────────────
  { id:"w1",  date:"2026-01-09", title:"USDA WASDE Report — January",    category:"report",  source:"USDA",      description:"World Agricultural Supply and Demand Estimates. Key data on global wheat, rice, coarse grains, oilseeds, and cotton." },
  { id:"w2",  date:"2026-02-11", title:"USDA WASDE Report — February",   category:"report",  source:"USDA",      description:"Updated supply/demand outlook for all major crops including soybean, palm oil, and sugar." },
  { id:"w3",  date:"2026-03-11", title:"USDA WASDE Report — March",      category:"report",  source:"USDA",      description:"Mid-season update. Crop year balances for India, Brazil and Argentina closely watched." },
  { id:"w4",  date:"2026-04-09", title:"USDA WASDE Report — April",      category:"report",  source:"USDA",      description:"Southern hemisphere harvest revisions. India wheat crop estimate typically revised here." },
  { id:"w5",  date:"2026-05-12", title:"USDA WASDE Report — May",        category:"report",  source:"USDA",      description:"First projections for new crop year (2026-27). Monsoon impact on Kharif acreage discussed." },
  { id:"w6",  date:"2026-06-11", title:"USDA WASDE Report — June",       category:"report",  source:"USDA",      description:"New-crop outlook with early Kharif sowing data from India; US corn/soy crop condition." },
  { id:"w7",  date:"2026-07-09", title:"USDA WASDE Report — July",       category:"report",  source:"USDA",      description:"Mid-season monsoon impact assessment for India Kharif. Brazilian safrinha soy harvest." },
  { id:"w8",  date:"2026-08-12", title:"USDA WASDE Report — August",     category:"report",  source:"USDA",      description:"US crop production estimates and India Kharif acreage finalization." },
  { id:"w9",  date:"2026-09-11", title:"USDA WASDE Report — September",  category:"report",  source:"USDA",      description:"Pre-harvest estimates for India Kharif crops. Palm oil supply tightness window." },
  { id:"w10", date:"2026-10-09", title:"USDA WASDE Report — October",    category:"report",  source:"USDA",      description:"India Kharif harvest data; Rabi sowing outlook. Southern hemisphere new-crop projections." },
  { id:"w11", date:"2026-11-12", title:"USDA WASDE Report — November",   category:"report",  source:"USDA",      description:"Updated global sugar, wheat and rice balances. Argentina new-crop soybean." },
  { id:"w12", date:"2026-12-10", title:"USDA WASDE Report — December",   category:"report",  source:"USDA",      description:"Year-end crop estimates. India Rabi sowing progress update." },

  // ── MPOB Monthly Palm Oil Reports ──────────────────────────────────────
  { id:"m1",  date:"2026-01-10", title:"MPOB Palm Oil Data — January",   category:"report",  commodity:"Palm Oil", source:"MPOB",  description:"Malaysian Palm Oil Board monthly production, export, and stock data. Key price driver." },
  { id:"m2",  date:"2026-02-10", title:"MPOB Palm Oil Data — February",  category:"report",  commodity:"Palm Oil", source:"MPOB",  description:"Monthly CPO output and inventory report from Malaysia." },
  { id:"m3",  date:"2026-03-10", title:"MPOB Palm Oil Data — March",     category:"report",  commodity:"Palm Oil", source:"MPOB",  description:"Off-season production trough; stock levels closely monitored." },
  { id:"m4",  date:"2026-04-10", title:"MPOB Palm Oil Data — April",     category:"report",  commodity:"Palm Oil", source:"MPOB",  description:"Seasonal production recovery begins. Indonesia GAPKI data also released." },
  { id:"m5",  date:"2026-05-11", title:"MPOB Palm Oil Data — May",       category:"report",  commodity:"Palm Oil", source:"MPOB",  description:"Pre-peak season inventory build." },
  { id:"m6",  date:"2026-06-10", title:"MPOB Palm Oil Data — June",      category:"report",  commodity:"Palm Oil", source:"MPOB",  description:"Eid export demand window assessed." },
  { id:"m7",  date:"2026-07-10", title:"MPOB Palm Oil Data — July",      category:"report",  commodity:"Palm Oil", source:"MPOB",  description:"Peak production season begins; Bursa Malaysia contracts closely watched." },
  { id:"m8",  date:"2026-08-10", title:"MPOB Palm Oil Data — August",    category:"report",  commodity:"Palm Oil", source:"MPOB",  description:"Indonesia biodiesel mandate impact on export volumes." },
  { id:"m9",  date:"2026-09-10", title:"MPOB Palm Oil Data — September", category:"report",  commodity:"Palm Oil", source:"MPOB",  description:"Peak season output. Stock build or drawdown — critical for CPO prices." },
  { id:"m10", date:"2026-10-10", title:"MPOB Palm Oil Data — October",   category:"report",  commodity:"Palm Oil", source:"MPOB",  description:"Production peak window. Global edible oil demand shifts." },
  { id:"m11", date:"2026-11-10", title:"MPOB Palm Oil Data — November",  category:"report",  commodity:"Palm Oil", source:"MPOB",  description:"Post-peak production decline; festive demand impact." },
  { id:"m12", date:"2026-12-10", title:"MPOB Palm Oil Data — December",  category:"report",  commodity:"Palm Oil", source:"MPOB",  description:"Year-end stock levels set the tone for Q1 2027." },

  // ── India Policy Events ─────────────────────────────────────────────────
  { id:"p1",  date:"2026-02-01", title:"Union Budget 2026-27",            category:"policy",  source:"MoF India",  description:"Annual Union Budget — import duties, MSP allocations, agri credit targets, and APMC reforms announced. Critical for all commodity prices." },
  { id:"p2",  date:"2026-06-18", title:"Kharif MSP Announcement",         category:"policy",  source:"CACP India", description:"Cabinet Committee on Economic Affairs approves Minimum Support Prices for Kharif crops (Paddy, Maize, Chana, Cotton, Soybean, Groundnut, Sugarcane). Impacts farm economics across India.", commodity:"Multiple" },
  { id:"p3",  date:"2026-10-20", title:"Rabi MSP Announcement",           category:"policy",  source:"CACP India", description:"MSP fixation for Rabi crops (Wheat, Gram, Mustard, Lentil). Key signal for procurement operations by FCI and state agencies.", commodity:"Wheat" },
  { id:"p4",  date:"2026-04-01", title:"FCI Wheat Procurement Opens",     category:"policy",  source:"FCI India",  description:"Food Corporation of India opens Rabi wheat procurement in Punjab, Haryana, MP and UP. Procurement quantities influence open-market prices.", commodity:"Wheat" },
  { id:"p5",  date:"2026-01-15", title:"DGFT Export-Import Policy Review",category:"policy",  source:"DGFT",       description:"Quarterly review of export incentives, duty drawback rates, and advance authorisation norms. Key for cashew, spice, and rice exporters." },
  { id:"p6",  date:"2026-04-15", title:"DGFT Export-Import Policy Review",category:"policy",  source:"DGFT",       description:"Mid-year export-import policy review. Any changes to export bans, MEPs or duty concessions typically notified here." },
  { id:"p7",  date:"2026-07-15", title:"DGFT Export-Import Policy Review",category:"policy",  source:"DGFT",       description:"Post-budget policy alignment; trade facilitation measures reviewed." },
  { id:"p8",  date:"2026-10-15", title:"DGFT Export-Import Policy Review",category:"policy",  source:"DGFT",       description:"Pre-winter export window review. Key for onion, wheat, and pulses." },
  { id:"p9",  date:"2026-03-31", title:"Sugar Crushing Season Ends",      category:"policy",  commodity:"Sugar",   source:"ISMA",  description:"North Indian sugar mills typically complete the crushing season. ISMA final production estimates released. Impacts sugar and ethanol blending targets." },
  { id:"p10", date:"2026-10-01", title:"Sugar Crushing Season Begins",    category:"policy",  commodity:"Sugar",   source:"ISMA",  description:"New crushing season 2026-27 commences across Maharashtra, UP and Karnataka. ISMA advance estimate closely tracked." },
  { id:"p11", date:"2026-05-01", title:"FCI Wheat Procurement Closes",    category:"policy",  commodity:"Wheat",   source:"FCI",   description:"Rabi wheat procurement concludes. Final procurement numbers vs. targets shape market supply expectations." },

  // ── IMD / Weather Advisories ────────────────────────────────────────────
  { id:"a1",  date:"2026-04-15", title:"IMD Pre-Monsoon Crop Advisory",   category:"advisory", source:"IMD",    description:"India Meteorological Department releases the April crop advisory with heat stress warnings and pre-sowing guidance for Kharif crops." },
  { id:"a2",  date:"2026-04-30", title:"IMD Southwest Monsoon Forecast",  category:"advisory", source:"IMD",    description:"IMD Long-Range Forecast (LRF) for Southwest Monsoon 2026. Quantitative normal/below-normal/above-normal forecast. Markets react strongly to this data." },
  { id:"a3",  date:"2026-06-01", title:"Monsoon Onset — Kerala (Expected)",category:"advisory", source:"IMD",   description:"Normal date for Southwest Monsoon onset over Kerala. Actual onset ±1 week triggers Kharif sowing adjustments across India." },
  { id:"a4",  date:"2026-06-15", title:"IMD Monsoon Progress Update",     category:"advisory", source:"IMD",    description:"IMD 2nd updated Long-Range Forecast for monsoon. Spatial distribution across agri zones assessed." },
  { id:"a5",  date:"2026-09-01", title:"IMD Monsoon Withdrawal Begins",   category:"advisory", source:"IMD",    description:"Southwest Monsoon withdrawal typically begins from Rajasthan. Impacts late Kharif crops and early Rabi sowing window." },
  { id:"a6",  date:"2026-10-15", title:"Northeast Monsoon Onset",         category:"advisory", source:"IMD",    description:"NE Monsoon onset over Tamil Nadu. Critical for irrigated rice in south India and post-kharif crops." },
  { id:"a7",  date:"2026-05-15", title:"ENSO / El Niño Status Update",    category:"advisory", source:"IMD/NOAA", description:"IMD & NOAA joint update on El Niño/La Niña conditions. Influences Indian monsoon intensity and global grain production." },
  { id:"a8",  date:"2026-11-15", title:"IMD Rabi Crop Advisory",          category:"advisory", source:"IMD/ICAR", description:"Winter crop advisory covering cold wave risks, fog impact on wheat, and moisture adequacy for rabi crop development." },
  { id:"a9",  date:"2026-03-15", title:"ICAR Kharif Variety Advisories",  category:"advisory", source:"ICAR",   description:"ICAR releases recommended high-yield variety bulletins for Kharif 2026. Farmers and traders watch for acreage shift signals." },

  // ── Harvest Seasons (Ranges) ────────────────────────────────────────────
  { id:"hs1", startDate:"2026-03-01", endDate:"2026-05-15", title:"Rabi Harvest Season",             category:"harvest", commodity:"Wheat / Chana",    description:"India Rabi harvest in progress — wheat, chickpea (chana), mustard, and lentils. Bulk arrivals depress mandi prices; FCI procurement absorbs supply." },
  { id:"hs2", startDate:"2026-03-01", endDate:"2026-06-15", title:"Cashew Harvest — India",          category:"harvest", commodity:"Cashew",            description:"Coastal cashew harvest season in Goa, Kerala, Karnataka, and Maharashtra. Fresh Raw Cashew Nut (RCN) arrivals from West Africa (Ivory Coast, Guinea-Bissau) begin April onward." },
  { id:"hs3", startDate:"2026-04-01", endDate:"2026-06-30", title:"Mango Season — India",            category:"harvest", commodity:"Mango",             description:"Alphonso, Kesar, Dasheri and Langra mango season. Drives packaging demand for corrugated boxes and cold-chain logistics." },
  { id:"hs4", startDate:"2026-03-01", endDate:"2026-05-15", title:"Onion (Rabi) Harvest",            category:"harvest", commodity:"Onion",             description:"Maharashtra Rabi onion harvest — largest supply event of the year. Price softening typical in April-May. NAFED/NCCF buffer stock operations." },
  { id:"hs5", startDate:"2026-06-01", endDate:"2026-07-31", title:"Kharif Sowing Season",            category:"harvest", commodity:"Paddy / Soybean / Cotton", description:"India Kharif sowing begins after monsoon onset. Key crops: Paddy, Soybean, Cotton, Groundnut, Maize. Acreage reports released weekly by Dept. of Agriculture." },
  { id:"hs6", startDate:"2026-08-01", endDate:"2026-10-15", title:"Almond Harvest — California",     category:"harvest", commodity:"Almond",            description:"US almond harvest window. California accounts for ~80% of global almond supply. ABC crop estimate in May sets tone; harvest confirms final yields." },
  { id:"hs7", startDate:"2026-08-01", endDate:"2026-10-31", title:"Palm Oil Peak Production",        category:"harvest", commodity:"Palm Oil",          description:"Malaysia and Indonesia peak palm oil production window. CPO output highest July-October. Stock build and export pace determine price direction on Bursa Malaysia." },
  { id:"hs8", startDate:"2026-09-01", endDate:"2026-12-15", title:"Cotton Harvest — India",          category:"harvest", commodity:"Cotton",            description:"Gujarat, Maharashtra, and Telangana cotton (kapas) harvest. CCI procurement under MSP scheme. Cottonseed oil output linked to this season." },
  { id:"hs9", startDate:"2026-10-01", endDate:"2026-11-30", title:"Kharif Harvest Season",           category:"harvest", commodity:"Paddy / Soybean / Groundnut", description:"Major Kharif crop arrivals — Paddy, Soybean, Groundnut, Maize. Soybean crushing margins and CPO import substitution demand in focus." },
  { id:"hs10",startDate:"2026-10-15", endDate:"2026-12-15", title:"Rabi Sowing Season",              category:"harvest", commodity:"Wheat / Chana",    description:"Rabi crops sown across India. Wheat in Punjab, Haryana, UP, MP; Chana/Chickpea in MP and Rajasthan. Soil moisture from retreating monsoon is critical." },
  { id:"hs11",startDate:"2026-10-01", endDate:"2026-12-31", title:"Cocoa Main Crop — West Africa",   category:"harvest", commodity:"Cocoa",             description:"Ivory Coast and Ghana main crop harvest (Oct–Mar). Quality assessment, arrivals, and farmer payments set the global cocoa price trajectory." },
  { id:"hs12",startDate:"2026-07-01", endDate:"2026-11-30", title:"Cardamom Harvest — Kerala",       category:"harvest", commodity:"Cardamom",          description:"Green cardamom harvest in Idukki and Wayanad districts. Spices Board e-auction prices monitored by exporters and traders." },
  { id:"hs13",startDate:"2026-12-01", endDate:"2026-12-31", title:"Black Pepper Harvest — Kerala",   category:"harvest", commodity:"Black Pepper",      description:"Berry black pepper harvest begins in December in Wayanad, Kozhikode and Kannur. Vietnam season ends; India's share supports global prices." },
  { id:"hs14",startDate:"2026-01-01", endDate:"2026-03-31", title:"Turmeric Harvest",                category:"harvest", commodity:"Turmeric",          description:"Sangli and Nizamabad turmeric harvest season. Curcumin content highest in this window. Export demand from US, Europe, and Middle East tracked." },
  { id:"hs15",startDate:"2026-09-01", endDate:"2026-11-30", title:"Raisins Harvest — Sangli/Nashik", category:"harvest", commodity:"Raisins",           description:"Maharashtra grapevine harvest and raisin drying season. Sangli is Asia's largest raisin market. Export parity critical vs. Afghan/Turkish raisins." },
  { id:"hs16",startDate:"2026-04-01", endDate:"2026-06-30", title:"Kharif Groundnut Sowing",         category:"harvest", commodity:"Groundnut",         description:"Gujarat and Andhra Pradesh groundnut sowing under Kharif. NAFED procurement under MSP critical. Groundnut oil presses begin monitoring new-crop arrivals from October." },
  { id:"hs17",startDate:"2026-02-15", endDate:"2026-04-30", title:"Isabgol (Psyllium) Harvest",      category:"harvest", commodity:"Psyllium",          description:"Rajasthan isabgol (psyllium husk) harvest. India supplies ~90% of global psyllium. DMRP and ACS assessments released by Gujarat Agri Dept." },

  // ── Market / Trade Events ───────────────────────────────────────────────
  { id:"t1", date:"2026-01-20", title:"APEDA Monthly Export Data — Jan",  category:"trade", source:"APEDA",    description:"Agricultural & Processed Food Products Export Development Authority releases monthly export figures for rice, spices, cashew, and fresh produce." },
  { id:"t2", date:"2026-02-20", title:"APEDA Monthly Export Data — Feb",  category:"trade", source:"APEDA",    description:"February Agri export data. Rice exports most closely watched; Non-basmati and basmati volumes vs. previous year." },
  { id:"t3", date:"2026-03-20", title:"APEDA Monthly Export Data — Mar",  category:"trade", source:"APEDA",    description:"Pre-new crop year export data. Spices, cashew, and fresh mango shipment data." },
  { id:"t4", date:"2026-04-20", title:"APEDA Monthly Export Data — Apr",  category:"trade", source:"APEDA",    description:"Mango export season begins. Alphonso US-UAE shipments tracked." },
  { id:"t5", date:"2026-05-20", title:"APEDA Monthly Export Data — May",  category:"trade", source:"APEDA",    description:"Cashew kernel export peak window. May APEDA data critical for Vietnam vs. India market share." },
  { id:"t6", date:"2026-06-20", title:"APEDA Monthly Export Data — Jun",  category:"trade", source:"APEDA",    description:"Year-end export performance data. FY totals for rice, spices, and pulses." },
  { id:"t7", date:"2026-03-31", title:"NCDEX Futures Expiry — March",     category:"trade", source:"NCDEX",    description:"NCDEX commodity futures March contract expiry — Chana, Soybean, Castor, Coriander, Jeera contracts. Rollover activity impacts near-term prices." },
  { id:"t8", date:"2026-06-30", title:"NCDEX Futures Expiry — June",      category:"trade", source:"NCDEX",    description:"June contract expiry. Monsoon progress impacts Kharif-linked futures rollover." },
  { id:"t9", date:"2026-09-30", title:"NCDEX Futures Expiry — September", category:"trade", source:"NCDEX",    description:"Pre-harvest futures expiry. New-crop Soybean and Chana contracts take centre stage." },
  { id:"t10",date:"2026-12-31", title:"NCDEX Futures Expiry — December",  category:"trade", source:"NCDEX",    description:"Year-end futures contract expiry. Rabi crop sowing progress sets tone for Jan contracts." },
  { id:"t11",date:"2026-03-15", title:"Anuga FoodTec — Cologne",          category:"trade", source:"Koelnmesse",description:"Global food technology and packaging exhibition. Key networking event for flexible packaging, laminates, and BOPP/BOPET film manufacturers." },
  { id:"t12",date:"2026-11-05", title:"World Food India",                  category:"trade", source:"DPIIT",    description:"India's flagship food processing industry event. Government announces export targets, PLI scheme updates, and APEDA partnerships." },
  { id:"t13",date:"2026-09-15", title:"Soyabean Crop Tour — India",       category:"trade", source:"SOPA",     description:"Soybean Processors Association of India (SOPA) field crop tour in Madhya Pradesh. Production estimate closely tracked by oil mills and importers.", commodity:"Soyabean" },
  { id:"t14",date:"2026-01-16", title:"Vietnam Cashew Export Report — Q4",category:"trade", commodity:"Cashew", source:"VINACAS", description:"Vietnam Cashew Association quarterly export report. Vietnam is world's largest cashew exporter; India vs. Vietnam price competition drives kernel markets." },
  { id:"t15",date:"2026-07-16", title:"Vietnam Cashew Export Report — H1",category:"trade", commodity:"Cashew", source:"VINACAS", description:"Mid-year cashew export volumes from Vietnam. India's RCN processing margins vs. direct kernel imports evaluated." },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function eventsOnDay(date: Date, events: CalEvent[]): CalEvent[] {
  return events.filter(ev => {
    if (ev.date) return isSameDay(parseISO(ev.date), date);
    if (ev.startDate && ev.endDate) {
      return isWithinInterval(date, { start: parseISO(ev.startDate), end: parseISO(ev.endDate) });
    }
    return false;
  });
}

function upcomingEvents(events: CalEvent[], from: Date, limit = 8): CalEvent[] {
  const results: { ev: CalEvent; date: Date }[] = [];
  events.forEach(ev => {
    if (ev.date) {
      const d = parseISO(ev.date);
      if (d >= from) results.push({ ev, date: d });
    } else if (ev.startDate) {
      const d = parseISO(ev.startDate);
      if (d >= from) results.push({ ev, date: d });
    }
  });
  return results
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, limit)
    .map(x => x.ev);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function CommodityCalendar() {
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [activeFilters, setActiveFilters] = useState<Set<Category>>(new Set(Object.keys(CAT) as Category[]));

  const filteredEvents = useMemo(
    () => EVENTS.filter(e => activeFilters.has(e.category as Category)),
    [activeFilters]
  );

  const toggleFilter = (cat: Category) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(cat)) { if (next.size > 1) next.delete(cat); } else next.add(cat);
      return next;
    });
  };

  // Build calendar grid
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart); // 0=Sun
  const gridCells = [...Array(startPad).fill(null), ...days];

  const selectedEvents = selectedDate ? eventsOnDay(selectedDate, filteredEvents) : [];
  const upcoming = upcomingEvents(filteredEvents, new Date());

  // Dot colors for a given day (up to 3 unique categories)
  const dayDots = (date: Date): Category[] => {
    const cats = Array.from(new Set(eventsOnDay(date, filteredEvents).map(e => e.category as Category)));
    return cats.slice(0, 3);
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">

      {/* Header */}
      <header className="shrink-0 z-20 bg-background/80 backdrop-blur-2xl border-b border-border/50">
        <div className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 max-w-7xl mx-auto">
          <div className="animate-fade-in">
            <h1 className="text-xl md:text-3xl font-display font-extrabold tracking-tight flex items-center gap-2.5">
              <CalendarDays className="w-6 h-6 md:w-7 md:h-7 text-primary shrink-0" />
              Commodity Calendar
            </h1>
            <p className="text-[11px] md:text-sm font-medium text-muted-foreground/60 mt-0.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Harvest seasons · Policy events · Trade reports · Advisories
            </p>
          </div>
        </div>

        {/* Category filter chips */}
        <div className="flex items-center gap-2 px-4 md:px-8 pb-3 overflow-x-auto scrollbar-none">
          {(Object.entries(CAT) as [Category, typeof CAT[Category]][]).map(([key, meta]) => {
            const Icon = meta.icon;
            const active = activeFilters.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border whitespace-nowrap transition-all duration-200 shrink-0 ${
                  active ? meta.badge : "border-border/30 text-muted-foreground/40 bg-transparent"
                }`}
              >
                <Icon className="w-3 h-3" />
                {meta.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto overscroll-none pb-safe md:pb-6">
        <div className="max-w-7xl mx-auto px-3 md:px-8 pt-4 md:pt-6">
          <div className="flex flex-col lg:flex-row gap-5">

            {/* ── Left: Calendar Grid ─────────────────────────────────── */}
            <div className="flex-1 min-w-0">
              {/* Month navigator */}
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewDate(d => subMonths(d, 1))}
                  className="h-9 w-9 rounded-xl hover:bg-muted/50"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <h2 className="font-display font-extrabold text-xl md:text-2xl tracking-tight text-foreground">
                  {format(viewDate, "MMMM yyyy")}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewDate(d => addMonths(d, 1))}
                  className="h-9 w-9 rounded-xl hover:bg-muted/50"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 mb-1">
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest py-2">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar cells */}
              <div className="grid grid-cols-7 gap-1 animate-fade-in">
                {gridCells.map((day, i) => {
                  if (!day) return <div key={`pad-${i}`} />;
                  const dots = dayDots(day);
                  const inMonth = isSameMonth(day, viewDate);
                  const todayDay = isToday(day);
                  const selected = selectedDate && isSameDay(day, selectedDate);

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`
                        relative flex flex-col items-center justify-start pt-2 pb-1.5 rounded-xl
                        min-h-[52px] md:min-h-[64px] transition-all duration-150
                        ${!inMonth ? "opacity-25" : ""}
                        ${selected ? "bg-primary/20 border border-primary/50 shadow-sm shadow-primary/20" : "hover:bg-muted/40 border border-transparent"}
                        ${todayDay && !selected ? "border-primary/30 bg-primary/8" : ""}
                      `}
                    >
                      <span className={`text-[13px] md:text-sm font-bold leading-none mb-1.5 ${
                        todayDay
                          ? "w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px]"
                          : selected
                          ? "text-primary"
                          : "text-foreground/80"
                      }`}>
                        {format(day, "d")}
                      </span>
                      {dots.length > 0 && (
                        <div className="flex items-center gap-0.5">
                          {dots.map(cat => (
                            <span key={cat} className={`w-1.5 h-1.5 rounded-full ${CAT[cat].dot}`} />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 flex flex-wrap gap-3 px-1">
                {(Object.entries(CAT) as [Category, typeof CAT[Category]][]).map(([key, meta]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                    <span className="text-[10px] text-muted-foreground/60 font-medium">{meta.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right: Event Panel ──────────────────────────────────── */}
            <div className="lg:w-[360px] xl:w-[400px] shrink-0 space-y-4">

              {/* Selected day events */}
              {selectedDate && (
                <div className="bg-card rounded-2xl border border-border/50 overflow-hidden animate-fade-in">
                  <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        {isToday(selectedDate) ? "Today" : "Selected"}
                      </p>
                      <h3 className="font-display font-bold text-base text-foreground">
                        {format(selectedDate, "EEEE, d MMMM yyyy")}
                      </h3>
                    </div>
                    {selectedEvents.length > 0 && (
                      <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">
                        {selectedEvents.length} event{selectedEvents.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>

                  {selectedEvents.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <CalendarDays className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground/50">No events on this day</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/30">
                      {selectedEvents.map(ev => {
                        const meta = CAT[ev.category];
                        const Icon = meta.icon;
                        const isRange = !!ev.startDate;
                        return (
                          <div key={ev.id} className="px-4 py-3.5">
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 p-1.5 rounded-lg border ${meta.badge} shrink-0`}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className={`text-[10px] font-bold uppercase tracking-wide border rounded-md px-1.5 py-0.5 ${meta.badge}`}>
                                    {meta.label}
                                  </span>
                                  {ev.commodity && (
                                    <span className="text-[10px] font-semibold text-muted-foreground/60 border border-border/40 rounded-md px-1.5 py-0.5">
                                      {ev.commodity}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-semibold text-foreground leading-snug mb-1.5">{ev.title}</p>
                                <p className="text-[12px] text-muted-foreground/70 leading-relaxed">{ev.description}</p>
                                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/50">
                                  {ev.source && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-2.5 h-2.5" />
                                      {ev.source}
                                    </span>
                                  )}
                                  {isRange && ev.startDate && ev.endDate && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5" />
                                      {format(parseISO(ev.startDate), "d MMM")} – {format(parseISO(ev.endDate), "d MMM")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Upcoming Events */}
              <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border/40">
                  <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Upcoming Events
                  </h3>
                </div>
                <div className="divide-y divide-border/20">
                  {upcoming.length === 0 ? (
                    <p className="text-sm text-muted-foreground/50 px-4 py-6 text-center">No upcoming events</p>
                  ) : (
                    upcoming.map((ev, i) => {
                      const meta = CAT[ev.category];
                      const Icon = meta.icon;
                      const dateStr = ev.date
                        ? format(parseISO(ev.date), "d MMM")
                        : ev.startDate
                        ? `${format(parseISO(ev.startDate), "d MMM")} →`
                        : "";
                      return (
                        <button
                          key={ev.id}
                          className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors animate-fade-in-up stagger-${Math.min(i+1,10)}`}
                          onClick={() => {
                            const d = ev.date ? parseISO(ev.date) : ev.startDate ? parseISO(ev.startDate) : null;
                            if (d) { setViewDate(d); setSelectedDate(d); }
                          }}
                        >
                          <div className={`mt-0.5 p-1.5 rounded-lg border ${meta.badge} shrink-0`}>
                            <Icon className="w-3 h-3" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-semibold text-foreground leading-tight line-clamp-1">{ev.title}</p>
                            {ev.commodity && (
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5">{ev.commodity}</p>
                            )}
                          </div>
                          <span className={`text-[10px] font-bold shrink-0 mt-0.5 ${meta.badge.split(" ")[1]}`}>
                            {dateStr}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
