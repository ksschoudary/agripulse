import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { Globe2, Bookmark, CloudSun, Wheat, Menu } from "lucide-react";

import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import CommodityCalendar from "@/pages/calendar";
import MarketPrices from "@/pages/market-prices";
import IgcEstimates from "@/pages/igc-estimates";
import { AppSidebar } from "@/components/app-sidebar";
import { useCommodities } from "@/hooks/use-commodities";
import { useNewsCounts } from "@/hooks/use-news";

const SPECIAL_TAB_NAMES = ["Agri Weather", "PIB Updates", "Packaging", "DGFT Updates", "IMD / Advisories"];

function MobileBottomNav() {
  const [location] = useLocation();
  const { toggleSidebar } = useSidebar();
  const { data: commodities } = useCommodities();
  const { data: counts } = useNewsCounts();

  const countMap = new Map<number, number>(
    (counts ?? []).map(c => [c.commodityId, c.freshCount])
  );

  const wheatCommodity   = commodities?.find(c => c.name === "Wheat");
  const weatherCommodity = commodities?.find(c => c.name === "Agri Weather");
  const wheatHref = wheatCommodity ? `/commodity/${wheatCommodity.id}` : null;

  const marketIds   = new Set((commodities ?? []).filter(c => !SPECIAL_TAB_NAMES.includes(c.name)).map(c => c.id));
  const latestFresh = (counts ?? []).filter(c => marketIds.has(c.commodityId)).reduce((s, c) => s + c.freshCount, 0);
  const weatherFresh = weatherCommodity ? (countMap.get(weatherCommodity.id) ?? 0) : 0;
  const wheatFresh   = wheatCommodity   ? (countMap.get(wheatCommodity.id)   ?? 0) : 0;

  const tabs = [
    { href: "/",        icon: Globe2,       label: "Latest",  badge: latestFresh },
    { href: "/saved",   icon: Bookmark,     label: "Saved",   badge: 0           },
    { href: "/weather", icon: CloudSun,     label: "Weather", badge: weatherFresh },
    { href: wheatHref,  icon: Wheat,        label: "Wheat",   badge: wheatFresh  },
  ];

  const isActive = (href: string | null) => {
    if (!href) return false;
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50">
      {/* Gradient fade-up behind nav */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />

      <div className="relative mx-2.5 mb-3 rounded-2xl bg-[hsl(223,44%,7%)]/96 backdrop-blur-3xl border border-[hsl(223,30%,18%)] shadow-2xl shadow-black/70 overflow-hidden">
        {/* Subtle top shimmer line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="flex items-center justify-around px-0.5 py-1">

          {tabs.map(tab => {
            if (!tab.href) return null;
            const active = isActive(tab.href);
            return (
              <Link key={tab.href} href={tab.href}>
                <button
                  className={`relative flex flex-col items-center gap-[3px] px-2 py-2 rounded-xl transition-all duration-200 ease-in-out min-w-[44px] active:scale-95 ${
                    active
                      ? "text-primary"
                      : "text-muted-foreground/55 active:text-muted-foreground/80"
                  }`}
                  data-testid={`nav-${tab.label.toLowerCase()}`}
                >
                  {/* Active pill background */}
                  {active && (
                    <span className="absolute inset-0 rounded-xl bg-primary/12 transition-all duration-300 ease-in-out" />
                  )}

                  {/* Fresh count badge */}
                  {tab.badge > 0 && !active && (
                    <span className="absolute top-1 right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-[8px] font-bold text-primary-foreground flex items-center justify-center tabular-nums leading-none z-10">
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </span>
                  )}

                  {/* Icon with glow when active */}
                  <span className={`relative transition-transform duration-200 ease-out ${active ? "scale-110" : "scale-100"}`}>
                    <tab.icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.2 : 1.8} />
                    {active && (
                      <span className="absolute inset-0 blur-[6px] opacity-50 text-primary">
                        <tab.icon className="w-[18px] h-[18px]" />
                      </span>
                    )}
                  </span>

                  {/* Label */}
                  <span className={`text-[9px] font-semibold tracking-wide transition-all duration-200 ease-in-out leading-none ${
                    active ? "opacity-100" : "opacity-50"
                  }`}>
                    {tab.label}
                  </span>
                </button>
              </Link>
            );
          })}

          {/* More → opens full sidebar */}
          <button
            onClick={toggleSidebar}
            className="relative flex flex-col items-center gap-[3px] px-2 py-2 rounded-xl text-muted-foreground/55 transition-all duration-200 ease-in-out min-w-[44px] active:scale-95 active:text-muted-foreground/80"
            data-testid="nav-more"
          >
            <Menu className="w-[18px] h-[18px]" strokeWidth={1.8} />
            <span className="text-[9px] font-semibold tracking-wide opacity-50 leading-none">More</span>
          </button>

        </div>
      </div>
    </nav>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/saved">
        {() => <Dashboard savedOnly={true} />}
      </Route>
      <Route path="/weather">
        {() => <Dashboard weatherOnly={true} />}
      </Route>
      <Route path="/pib">
        {() => <Dashboard pibOnly={true} />}
      </Route>
      <Route path="/calendar" component={CommodityCalendar} />
      <Route path="/prices" component={MarketPrices} />
      <Route path="/igc" component={IgcEstimates} />
      <Route path="/commodity/:id" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full overflow-hidden bg-background dark">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0 relative">
              <main className="flex-1 overflow-hidden relative">
                <Router />
              </main>
              <MobileBottomNav />
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
