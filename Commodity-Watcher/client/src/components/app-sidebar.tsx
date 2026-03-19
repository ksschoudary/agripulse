import { useLocation, Link } from "wouter";
import { 
  BarChart2, 
  Globe2, 
  PackageOpen, 
  Sprout,
  Bookmark,
  CloudSun,
  FileText,
  ShieldCheck,
  Thermometer,
  CalendarDays,
  TrendingUp,
  FileBarChart2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useCommodities } from "@/hooks/use-commodities";
import { Skeleton } from "@/components/ui/skeleton";
import { useNewsCounts } from "@/hooks/use-news";

const SPECIAL_TAB_NAMES = ["Agri Weather", "PIB Updates", "Packaging", "DGFT Updates", "IMD / Advisories"];

export function AppSidebar() {
  const [location] = useLocation();
  const { data: commodities, isLoading } = useCommodities();
  const { data: counts } = useNewsCounts();

  const countMap = new Map<number, number>(
    (counts ?? []).map(c => [c.commodityId, c.freshCount])
  );
  const getFreshCount = (id: number) => countMap.get(id) ?? 0;

  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  const weatherCommodity = commodities?.find(c => c.name === "Agri Weather");
  const pibCommodity = commodities?.find(c => c.name === "PIB Updates");
  const packagingCommodity = commodities?.find(c => c.name === "Packaging");
  const dgftCommodity = commodities?.find(c => c.name === "DGFT Updates");
  const imdCommodity = commodities?.find(c => c.name === "IMD / Advisories");
  const marketCommodities = commodities?.filter(c => !SPECIAL_TAB_NAMES.includes(c.name));

  const totalFreshCount = (() => {
    if (!counts || !marketCommodities) return 0;
    const marketIds = new Set(marketCommodities.map(c => c.id));
    return (counts ?? []).filter(c => marketIds.has(c.commodityId)).reduce((sum, c) => sum + c.freshCount, 0);
  })();

  const menuItemClass = "h-8 px-3 rounded-lg text-[13px] font-medium hover:bg-primary/10 hover:text-primary transition-all duration-150 group";
  const badgeClass = "ml-auto text-[9px] font-bold tabular-nums bg-primary/15 text-primary rounded-full px-1.5 min-w-[18px] h-4 flex items-center justify-center";

  return (
    <Sidebar variant="inset" className="border-r border-sidebar-border/50">
      {/* Brand header */}
      <SidebarHeader className="px-4 py-4 border-b border-sidebar-border/30">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/15 text-primary p-1.5 rounded-lg shadow-md shadow-primary/20 animate-pulse-glow">
            <BarChart2 className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-display font-bold text-[1.15rem] tracking-tight bg-gradient-to-r from-white via-primary to-blue-300 bg-clip-text text-transparent">
              AgriPulse
            </span>
            <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground/40 mt-0.5">
              Market Intelligence
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2 overflow-y-auto">

        {/* Command Center */}
        <SidebarGroup className="py-0">
          <SidebarGroupLabel className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/40 px-3 pt-4 pb-1.5">
            Command
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/")} className={menuItemClass}>
                  <Link href="/">
                    <Globe2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1">Latest Updates</span>
                    {totalFreshCount > 0 && <span className={badgeClass}>{totalFreshCount}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/saved")} className={menuItemClass}>
                  <Link href="/saved">
                    <Bookmark className="w-3.5 h-3.5 shrink-0" />
                    <span>Saved Articles</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {weatherCommodity && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/weather"} className={menuItemClass}>
                    <Link href="/weather">
                      <CloudSun className="w-3.5 h-3.5 shrink-0" />
                      <span>Agri Weather</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/calendar")} className={menuItemClass}>
                  <Link href="/calendar">
                    <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                    <span>Commodity Calendar</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/prices")} className={menuItemClass}>
                  <Link href="/prices">
                    <TrendingUp className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    <span>Price</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/igc")} className={menuItemClass}>
                  <Link href="/igc">
                    <FileBarChart2 className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    <span>IGC Est.</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Market Intelligence */}
        <SidebarGroup className="py-0">
          <SidebarGroupLabel className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/40 px-3 pt-4 pb-1.5">
            Markets
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {isLoading ? (
              <div className="space-y-1 px-2">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-7 w-full bg-sidebar-border/20 rounded-lg" />)}
              </div>
            ) : (
              <SidebarMenu className="gap-0.5">
                {marketCommodities?.map((commodity) => {
                  const path = `/commodity/${commodity.id}`;
                  const fresh = getFreshCount(commodity.id);
                  return (
                    <SidebarMenuItem key={commodity.id}>
                      <SidebarMenuButton asChild isActive={isActive(path)} className={menuItemClass}>
                        <Link href={path}>
                          <Sprout className="w-3.5 h-3.5 shrink-0 opacity-60" />
                          <span className="flex-1 truncate">{commodity.name}</span>
                          {fresh > 0 && <span className={badgeClass}>{fresh}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Regulatory & Advisory */}
        <SidebarGroup className="py-0">
          <SidebarGroupLabel className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/40 px-3 pt-4 pb-1.5">
            Regulatory
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {packagingCommodity && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive(`/commodity/${packagingCommodity.id}`)} className={menuItemClass}>
                    <Link href={`/commodity/${packagingCommodity.id}`}>
                      <PackageOpen className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      <span className="flex-1">Packaging</span>
                      {getFreshCount(packagingCommodity.id) > 0 && <span className={badgeClass}>{getFreshCount(packagingCommodity.id)}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {pibCommodity && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/pib"} className={menuItemClass}>
                    <Link href="/pib">
                      <FileText className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      <span className="flex-1">PIB Updates</span>
                      {getFreshCount(pibCommodity.id) > 0 && <span className={badgeClass}>{getFreshCount(pibCommodity.id)}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {dgftCommodity && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive(`/commodity/${dgftCommodity.id}`)} className={menuItemClass}>
                    <Link href={`/commodity/${dgftCommodity.id}`}>
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      <span className="flex-1">DGFT Updates</span>
                      {getFreshCount(dgftCommodity.id) > 0 && <span className={badgeClass}>{getFreshCount(dgftCommodity.id)}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {imdCommodity && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive(`/commodity/${imdCommodity.id}`)} className={menuItemClass}>
                    <Link href={`/commodity/${imdCommodity.id}`}>
                      <Thermometer className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      <span className="flex-1">IMD / Advisories</span>
                      {getFreshCount(imdCommodity.id) > 0 && <span className={badgeClass}>{getFreshCount(imdCommodity.id)}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>
    </Sidebar>
  );
}
