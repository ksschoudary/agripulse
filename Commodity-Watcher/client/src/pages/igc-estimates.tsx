import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ExternalLink, Calendar, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { IgcReportData, IgcCommodityData } from "../../../server/igc";

const COMMODITY_ICONS: Record<string, string> = {
  "Total Grains": "🌾",
  "Wheat": "🌿",
  "Maize": "🌽",
  "Rice": "🍚",
  "Soyabean": "🫘",
};

const METRIC_LABELS: { key: keyof Pick<IgcCommodityData, "production" | "consumption" | "trade" | "endStocks">; label: string }[] = [
  { key: "production", label: "Production" },
  { key: "consumption", label: "Consumption" },
  { key: "trade", label: "Trade" },
  { key: "endStocks", label: "End Stocks" },
];

function CommodityTable({ commodity }: { commodity: IgcCommodityData }) {
  const icon = COMMODITY_ICONS[commodity.name] ?? "📊";
  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden"
      data-testid={`igc-table-${commodity.name.replace(/\s+/g, "-").toLowerCase()}`}>
      <div className="bg-muted/30 px-4 py-2.5 border-b border-border/40 flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <h3 className="text-[13px] font-semibold text-foreground">{commodity.name}</h3>
        <span className="text-[10.5px] text-muted-foreground/60 ml-auto">Million Tonnes</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border/40 bg-muted/10">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground w-32">Metric</th>
              {commodity.years.map((yr, i) => (
                <th key={i} className="text-right px-4 py-2 font-medium text-muted-foreground">
                  <span className={i === commodity.years.length - 1 ? "text-foreground font-semibold" : ""}>{yr}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_LABELS.map(({ key, label }) => (
              <tr key={key} className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors">
                <td className="px-4 py-2.5 text-muted-foreground/80 font-medium">{label}</td>
                {commodity[key].map((val, i) => (
                  <td key={i} className={`px-4 py-2.5 text-right tabular-nums ${i === commodity[key].length - 1 ? "font-semibold text-foreground" : "text-foreground/70"}`}>
                    {val !== null ? val.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function IgcEstimates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{
    fetchedAt: string;
    data: IgcReportData;
  } | null>({
    queryKey: ["/api/igc-estimates"],
  });

  const refreshMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/igc-estimates/refresh"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/igc-estimates"] });
      toast({ title: "IGC Estimates updated", description: "World grain supply/demand data refreshed from IGC." });
    },
    onError: (err: any) => toast({
      title: "Refresh failed",
      description: err.message ?? "Could not reach IGC website.",
      variant: "destructive",
    }),
  });

  const report = data?.data;
  const fetchedAt = data?.fetchedAt ? new Date(data.fetchedAt) : null;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">IGC World Grain Estimates</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Supply &amp; demand outlook from the International Grains Council (IGC) GMR
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            data-testid="button-refresh-igc"
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending}
            className="text-[12px] shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshMut.isPending ? "animate-spin" : ""}`} />
            Sync IGC Data
          </Button>
        </div>

        {/* Report metadata */}
        {report && (
          <div className="flex flex-wrap items-center gap-3 bg-muted/20 rounded-xl px-4 py-3 border border-border/30">
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium text-foreground">{report.reportLabel}</span>
            </div>
            {report.reportNumber && (
              <Badge variant="outline" className="text-[10px] font-normal">GMR #{report.reportNumber}</Badge>
            )}
            {fetchedAt && (
              <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground ml-auto">
                <Calendar className="w-3 h-3 shrink-0" />
                <span>Fetched: {fetchedAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
            )}
            <a
              href="https://www.igc.int/en/gmr_summary.aspx"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10.5px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              IGC Website
            </a>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-16 text-muted-foreground">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 opacity-30 animate-spin" />
            <p className="text-sm">Loading IGC estimates…</p>
          </div>
        )}

        {!isLoading && !report && (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border/50 rounded-xl space-y-3">
            <FileSpreadsheet className="w-10 h-10 mx-auto opacity-20" />
            <p className="text-sm">No IGC data yet.</p>
            <p className="text-[12px] text-muted-foreground/70">
              Click <strong>Sync IGC Data</strong> to fetch the latest World Grain Estimates from{" "}
              <a href="https://www.igc.int/en/gmr_summary.aspx" target="_blank" rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline">igc.int</a>.
            </p>
            <Button size="sm" onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}>
              {refreshMut.isPending ? "Fetching from IGC…" : "Fetch IGC Estimates"}
            </Button>
          </div>
        )}

        {report && (
          <div className="space-y-4">
            {/* Narrative summary from IGC */}
            <div className="rounded-xl border border-border/30 bg-amber-50/30 dark:bg-amber-900/10 px-4 py-3">
              <p className="text-[11.5px] text-foreground/80 leading-relaxed">
                <span className="font-semibold text-foreground">IGC Outlook:</span>{" "}
                World <strong>Total Grains</strong> (wheat &amp; coarse grains) production in 2025/26 forecast at{" "}
                <strong>{report.commodities.find(c => c.name === "Total Grains")?.production.slice(-1)[0]?.toFixed(0) ?? "—"}m t</strong>,
                with end-season carryovers of{" "}
                <strong>{report.commodities.find(c => c.name === "Total Grains")?.endStocks.slice(-1)[0]?.toFixed(0) ?? "—"}m t</strong>.{" "}
                Global <strong>Rice</strong> production: <strong>{report.commodities.find(c => c.name === "Rice")?.production.slice(-1)[0]?.toFixed(0) ?? "—"}m t</strong> (record).{" "}
                All figures in million tonnes; current season forecast column shown in bold.
              </p>
            </div>

            {/* Tables for each commodity */}
            {report.commodities.map(commodity => (
              <CommodityTable key={commodity.name} commodity={commodity} />
            ))}

            {/* Definitions */}
            <div className="rounded-xl border border-border/30 bg-muted/10 px-4 py-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Notes</p>
              <p className="text-[10.5px] text-muted-foreground/70">
                <strong>Trade</strong> = exports (calendar year basis). <strong>End Stocks</strong> = aggregate of respective local marketing year carryovers.
                Figures in <strong>Million Tonnes</strong>. "est." = estimate, "f'cast" = forecast.
                Source: <a href="https://www.igc.int" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">International Grains Council (IGC)</a> — Grain Market Report (GMR).
                Data refreshed every 15–30 days (on manual sync) as IGC GMR is published monthly.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
