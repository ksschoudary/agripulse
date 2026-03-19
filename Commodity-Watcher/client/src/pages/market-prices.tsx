import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Info, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { MarketSnapshotData, SnapshotItem, WheatFobItem } from "../../../server/market-data";

function TrendIcon({ trend }: { trend: "up" | "down" | "steady" | null }) {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-green-500 inline shrink-0" />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-500 inline shrink-0" />;
  return <Minus className="w-3 h-3 text-muted-foreground inline shrink-0" />;
}

function ChangeTag({ item }: { item: SnapshotItem }) {
  if (!item.auto) return <span className="text-[10px] text-muted-foreground/60 italic">—</span>;
  if (!item.change) return <span className="text-[10px] text-muted-foreground/60">N/A</span>;
  if (item.trend === "up") return <span className="text-[11px] font-medium text-green-600 dark:text-green-400">{item.change}</span>;
  if (item.trend === "down") return <span className="text-[11px] font-medium text-red-600 dark:text-red-400">{item.change}</span>;
  return <span className="text-[11px] text-muted-foreground">Steady</span>;
}

function PriceRow({ item }: { item: SnapshotItem }) {
  return (
    <div data-testid={`price-row-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
      className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <TrendIcon trend={item.trend} />
        <span className="text-[12.5px] text-foreground/90 truncate">{item.label}</span>
        {!item.auto && (
          <span title={`Source: ${item.source}`}>
            <Info className="w-3 h-3 text-muted-foreground/40 shrink-0 cursor-help" />
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[12.5px] font-semibold tabular-nums text-foreground min-w-[80px] text-right">
          {item.value ?? <span className="text-muted-foreground/40 font-normal text-[11px]">Pending</span>}
        </span>
        <span className="min-w-[72px] text-right">
          <ChangeTag item={item} />
        </span>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  emoji: string;
  items: SnapshotItem[];
}

function SnapshotSection({ title, emoji, items }: SectionProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <div className="bg-muted/30 px-4 py-2.5 border-b border-border/40">
        <h3 className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <span>{emoji}</span> {title}
        </h3>
      </div>
      <div className="px-4 py-1">
        {items.map(item => <PriceRow key={item.label} item={item} />)}
      </div>
    </div>
  );
}

function FobTrendIcon({ trend }: { trend: "up" | "down" | "steady" | null }) {
  if (trend === "up") return <TrendingUp className="w-3 h-3 text-green-500 inline shrink-0" />;
  if (trend === "down") return <TrendingDown className="w-3 h-3 text-red-500 inline shrink-0" />;
  return null;
}

function WheatFobTable({ items }: { items: WheatFobItem[] }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <div className="bg-muted/30 px-4 py-2.5 border-b border-border/40">
        <h3 className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
          🌾 Global Wheat — FOB Reference Prices
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border/40 bg-muted/10">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Origin</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Grade</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">FOB Price</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">Chg</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Source</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors">
                <td className="px-4 py-2.5 font-medium text-foreground/90 whitespace-nowrap">{item.origin}</td>
                <td className="px-4 py-2.5 text-foreground/70 whitespace-nowrap">{item.grade}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-semibold text-foreground">
                      {item.price ?? (
                        <span className="text-[11px] text-muted-foreground/50 font-normal">
                          {item.auto ? "Fetching…" : "—"}
                        </span>
                      )}
                    </span>
                    {item.priceDate && (
                      <span className="text-[9.5px] text-muted-foreground/50 font-normal leading-none">
                        {item.priceDate}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right hidden sm:table-cell">
                  {item.change && item.trend ? (
                    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
                      item.trend === "up" ? "text-green-600 dark:text-green-400" :
                      item.trend === "down" ? "text-red-600 dark:text-red-400" :
                      "text-muted-foreground"
                    }`}>
                      <FobTrendIcon trend={item.trend} />
                      {item.change}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/30">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 hidden md:table-cell">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10.5px] text-muted-foreground/60">{item.source}</span>
                    {item.auto && (
                      <Badge variant="outline" className="text-[8.5px] py-0 px-1 text-green-600 border-green-300 shrink-0">
                        Auto
                      </Badge>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 bg-muted/10 border-t border-border/30">
        <p className="text-[10.5px] text-muted-foreground/55 leading-relaxed">
          FOB = Free On Board · Prices in USD/MT · Russia: CME Black Sea Wheat futures (BWF=F, live) ·
          France &amp; USA: IGC daily export bids · AUS/CAN/ARG: USDA FAS monthly grain circular (IGC-sourced)
        </p>
      </div>
    </div>
  );
}

export default function MarketPrices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isFetching } = useQuery<{
    snapshotAt: string;
    snapshotLabel: string;
    data: MarketSnapshotData;
  } | null>({
    queryKey: ["/api/market-snapshot"],
    refetchInterval: 5 * 60 * 1000,
  });

  const refreshMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/market-snapshot/refresh"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-snapshot"] });
      toast({ title: "Prices refreshed", description: "Live market data updated." });
    },
    onError: () => toast({ title: "Refresh failed", variant: "destructive" }),
  });

  const snap = data?.data;
  const label = data?.snapshotLabel ?? "";
  const snapshotAt = data?.snapshotAt ? new Date(data.snapshotAt) : null;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Market Prices</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Live prices from ICE, CME, Yahoo Finance · Refreshed at 09:30 AM & 06:00 PM IST
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            data-testid="button-refresh-snapshot"
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending || isFetching}
            className="text-[12px] shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshMut.isPending ? "animate-spin" : ""}`} />
            Sync Now
          </Button>
        </div>

        {/* Snapshot timestamp */}
        {snapshotAt && (
          <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground bg-muted/20 rounded-lg px-3 py-2 border border-border/30">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>
              Last updated: <strong>{label || snapshotAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</strong>
            </span>
            <span className="text-muted-foreground/40 ml-auto text-[10px]">
              Auto-refresh: 09:30 AM & 06:00 PM IST daily
            </span>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-16 text-muted-foreground">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 opacity-30 animate-spin" />
            <p className="text-sm">Loading market data…</p>
          </div>
        )}

        {!isLoading && !snap && (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border/50 rounded-xl">
            <p className="text-sm mb-3">No market data yet. Click <strong>Sync Now</strong> to fetch live prices.</p>
            <Button size="sm" onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}>
              {refreshMut.isPending ? "Fetching…" : "Fetch Live Prices"}
            </Button>
          </div>
        )}

        {snap && (
          <>
            {/* Market Snapshot Grid */}
            <div className="space-y-3">
              <SnapshotSection title="FOREX" emoji="💱" items={snap.forex} />
              <SnapshotSection title="ENERGY & METALS" emoji="🔥" items={snap.energyMetals} />
              <SnapshotSection title="EDIBLE OILS" emoji="🛢️" items={snap.edibleOils} />
              <SnapshotSection title="SUGAR" emoji="🍬" items={snap.sugar} />
              <SnapshotSection title="GRAINS & PULSES" emoji="🌾" items={snap.grainsPulses} />
              <SnapshotSection title="POLYMERS" emoji="🧪" items={snap.polymers} />
            </div>

            {/* Source Notes */}
            <div className="rounded-xl border border-border/30 bg-muted/10 px-4 py-3 space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Data Sources</p>
              {[
                ["Forex (USD:INR, USD:MYR, EUR:USD)", "LSEG, Yahoo Finance — Interbank mid-market rates"],
                ["Brent Crude", "ICE Futures Europe via Yahoo Finance (BZ=F)"],
                ["Gold (Comex)", "CME Group via Yahoo Finance (GC=F) — front-month futures"],
                ["Soybean Oil (CBOT)", "CBOT / CME Group via Yahoo Finance (ZL=F)"],
                ["Sugar No.11 (Raw)", "ICE Futures US via Yahoo Finance (SB=F)"],
                ["CPO (BMD) C1/C2", "Bursa Malaysia Derivatives — requires direct subscription"],
                ["Palmolein Kakinada", "SEA India / Kakinada port mandi reports"],
                ["Sugar No.5 (Refined)", "ICE Futures Europe, London"],
                ["Wheat, Chana, Maize (Indian)", "NCDEX Spot / Agriwatch.com"],
                ["LLDPE Singapore", "ICIS / Platts S&P Global (CFR SE Asia)"],
              ].map(([item, src]) => (
                <p key={item} className="text-[10.5px] text-muted-foreground/70">
                  <span className="font-medium text-foreground/60">{item}:</span> {src}
                </p>
              ))}
            </div>

            {/* Wheat FOB Table */}
            <WheatFobTable items={snap.wheatFob} />
          </>
        )}
      </div>
    </div>
  );
}
