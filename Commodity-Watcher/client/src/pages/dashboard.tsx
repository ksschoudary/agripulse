import { useRoute } from "wouter";
import { RefreshCw, Search, Layers, AlertCircle, Clock, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNews as useNewsData, useRefreshNews as useRefreshAction, useNewsPaginated, useSavedNewsPaginated } from "@/hooks/use-news";
import { useCommodities } from "@/hooks/use-commodities";
import { NewsCard } from "@/components/news-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PdfExportDialog } from "@/components/pdf-export-dialog";

const PIB_PAGE_SIZE = 25;
const WHEAT_PAGE_SIZE = 50;
const SAVED_PAGE_SIZE = 50;

export default function Dashboard({ savedOnly = false, weatherOnly = false, pibOnly = false }: { savedOnly?: boolean, weatherOnly?: boolean, pibOnly?: boolean }) {
  const [match, params] = useRoute("/commodity/:id");
  const commodityId = match && params?.id ? parseInt(params.id, 10) : undefined;
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset page when navigating between tabs / commodities
  useEffect(() => {
    setCurrentPage(1);
  }, [commodityId, savedOnly, pibOnly, weatherOnly]);

  useEffect(() => {
    const saved = localStorage.getItem("lastSyncTime");
    if (saved) setLastSyncTime(new Date(saved));
  }, []);

  useEffect(() => {
    if (showSearch && searchRef.current) searchRef.current.focus();
  }, [showSearch]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    const id = setTimeout(() => setDebouncedSearch(e.target.value), 400);
    return () => clearTimeout(id);
  };

  const { data: commodities } = useCommodities();
  const weatherCommodity = commodities?.find(c => c.name === "Agri Weather");
  const pibCommodity    = commodities?.find(c => c.name === "PIB Updates");
  const wheatCommodity  = commodities?.find(c => c.name === "Wheat");

  const effectiveId = pibOnly
    ? pibCommodity?.id
    : weatherOnly
      ? weatherCommodity?.id
      : savedOnly ? undefined : commodityId;

  const currentCommodity = commodities?.find(c =>
    c.id === (pibOnly ? pibCommodity?.id : weatherOnly ? weatherCommodity?.id : commodityId)
  );

  // Wheat tab: paginated + 365-day rolling window
  const isWheatTab = !pibOnly && !savedOnly && !weatherOnly && currentCommodity?.name === "Wheat";

  // ── Hooks (always called unconditionally) ──────────────────────────────────

  // PIB paginated (25/page)
  const { data: paginatedData, isLoading: isPaginatedLoading } = useNewsPaginated(
    pibCommodity?.id ?? 0,
    currentPage,
    PIB_PAGE_SIZE,
    pibOnly && !!pibCommodity?.id,
  );

  // Wheat paginated (50/page, 365-day window via getNewsPaginated)
  const { data: wheatPaginatedData, isLoading: isWheatPaginatedLoading } = useNewsPaginated(
    wheatCommodity?.id ?? 0,
    currentPage,
    WHEAT_PAGE_SIZE,
    isWheatTab && !!wheatCommodity?.id,
  );

  // Saved paginated (50/page, 365-day window via getSavedNewsPaginated)
  const { data: savedPaginatedData, isLoading: isSavedPaginatedLoading } = useSavedNewsPaginated(
    currentPage,
    SAVED_PAGE_SIZE,
    savedOnly,
  );

  // Non-paginated: used for Latest, Weather, all other commodity tabs, and PDF export for Saved
  const { data: news, isLoading: isLoadingNews, isError, error, isFetching } = useNewsData(
    effectiveId,
    debouncedSearch,
    savedOnly,
    !pibOnly && !isWheatTab, // disable when PIB or Wheat (those use paginated)
  );

  // ── Derived display values ─────────────────────────────────────────────────

  const displayNews = pibOnly
    ? paginatedData?.items
    : isWheatTab
      ? wheatPaginatedData?.items
      : savedOnly
        ? savedPaginatedData?.items
        : news;

  const totalCount = pibOnly
    ? (paginatedData?.total ?? 0)
    : isWheatTab
      ? (wheatPaginatedData?.total ?? 0)
      : savedOnly
        ? (savedPaginatedData?.total ?? 0)
        : displayNews?.length ?? 0;

  const totalPages = pibOnly
    ? Math.ceil((paginatedData?.total || 0) / PIB_PAGE_SIZE)
    : isWheatTab
      ? Math.ceil((wheatPaginatedData?.total || 0) / WHEAT_PAGE_SIZE)
      : savedOnly
        ? Math.ceil((savedPaginatedData?.total || 0) / SAVED_PAGE_SIZE)
        : 1;

  const isPaginated = pibOnly || isWheatTab || savedOnly;

  const isLoading = pibOnly
    ? isPaginatedLoading
    : isWheatTab
      ? isWheatPaginatedLoading
      : savedOnly
        ? isSavedPaginatedLoading
        : isLoadingNews;

  const { mutate: refresh, isPending: isRefreshing } = useRefreshAction();

  const handleRefresh = () => {
    if (savedOnly) return;
    refresh(effectiveId, {
      onSuccess: (data) => {
        const now = new Date();
        setLastSyncTime(now);
        localStorage.setItem("lastSyncTime", now.toISOString());
        toast({
          title: data.background ? "Sync Running" : "Intelligence Synchronized",
          description: data.background
            ? "Fetching all feeds in the background. New articles will appear shortly."
            : `Captured ${data.count} new signals.`,
        });
      },
      onError: (err) => {
        toast({ title: "Sync failed", description: err.message, variant: "destructive" });
      }
    });
  };

  const getISTTime = (date: Date) => new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true
  }).format(date);

  const pageTitle = pibOnly ? "PIB Updates"
    : weatherOnly ? "Agri Weather"
    : savedOnly ? "Saved Articles"
    : currentCommodity ? currentCommodity.name
    : "Latest Updates";

  const pageSubtitle = pibOnly ? "Government announcements & policies"
    : weatherOnly ? "Critical weather signals for Indian agriculture"
    : savedOnly ? "Your bookmarked market intelligence"
    : isWheatTab ? "Last 365 days · 50 per page"
    : currentCommodity ? `High-priority signals for ${currentCommodity.name}`
    : "Live cross-commodity intelligence";

  // Empty state check
  const isEmpty = pibOnly
    ? (!!paginatedData && displayNews?.length === 0)
    : isWheatTab
      ? (!!wheatPaginatedData && displayNews?.length === 0)
      : savedOnly
        ? (!!savedPaginatedData && displayNews?.length === 0)
        : displayNews?.length === 0;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="shrink-0 z-20 bg-[hsl(223,48%,5%)]/92 backdrop-blur-xl border-b border-[hsl(223,30%,17%)]">
        {/* Top accent line */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        {/* Desktop header */}
        <div className="hidden md:flex items-center justify-between gap-4 px-6 py-3.5 max-w-7xl mx-auto">
          <div className="animate-fade-in flex items-center gap-3">
            <div>
              <h1 className="text-xl font-display font-bold tracking-tight text-foreground leading-none">
                {pageTitle}
              </h1>
              <p className="text-[11.5px] text-muted-foreground/50 mt-0.5 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                {pageSubtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search…"
                className="pl-9 w-56 bg-muted/20 border-border/30 focus-visible:ring-primary/20 rounded-lg h-8 text-[13px] transition-all"
                value={searchQuery}
                onChange={handleSearchChange}
                data-testid="input-search"
              />
            </div>
            {savedOnly && (
              <Button
                variant="outline"
                onClick={() => setShowPdfDialog(true)}
                className="h-8 px-3 rounded-lg gap-1.5 text-[12.5px] font-medium border-primary/25 text-primary hover:bg-primary/10"
                data-testid="button-export-pdf"
              >
                <FileText className="w-3.5 h-3.5" />
                Export PDF
              </Button>
            )}
            {!savedOnly && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleRefresh}
                  disabled={isRefreshing || isFetching}
                  className="h-8 px-4 shadow-md shadow-primary/15 rounded-lg text-[12.5px] font-semibold active:scale-95 transition-all"
                  data-testid="button-sync-intel"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  {isRefreshing ? "Syncing…" : "Sync"}
                </Button>
                {lastSyncTime && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
                    <Clock className="w-2.5 h-2.5" />
                    <span data-testid="text-last-sync">{getISTTime(lastSyncTime)} IST</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile header */}
        <div className="md:hidden">
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="min-w-0 flex-1 animate-fade-in">
              <h1 className="text-[16px] font-display font-bold tracking-tight text-foreground truncate leading-tight">
                {pageTitle}
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                <p className="text-[10.5px] text-muted-foreground/65 truncate font-medium">{pageSubtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl bg-[hsl(223,34%,13%)] text-muted-foreground/70 hover:text-foreground hover:bg-[hsl(223,34%,16%)] transition-all"
                onClick={() => setShowSearch(s => !s)}
                data-testid="button-toggle-search"
              >
                <Search className="w-4 h-4" />
              </Button>
              {savedOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl bg-primary/12 text-primary hover:bg-primary/20 transition-all"
                  onClick={() => setShowPdfDialog(true)}
                  data-testid="button-export-pdf-mobile"
                >
                  <FileText className="w-4 h-4" />
                </Button>
              )}
              {!savedOnly && (
                <Button
                  onClick={handleRefresh}
                  disabled={isRefreshing || isFetching}
                  size="icon"
                  className="h-9 w-9 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 active:scale-90 transition-all disabled:opacity-50"
                  data-testid="button-sync-intel"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                </Button>
              )}
            </div>
          </div>

          {/* Expandable search bar on mobile */}
          {showSearch && (
            <div className="px-4 pb-3 animate-fade-in">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                <Input
                  ref={searchRef}
                  placeholder="Search signals…"
                  className="pl-10 bg-[hsl(223,34%,11%)] border-[hsl(223,30%,20%)] focus-visible:ring-primary/30 rounded-xl h-10 text-[13.5px] placeholder:text-muted-foreground/40"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  data-testid="input-search-mobile"
                />
              </div>
            </div>
          )}

          {/* Last sync row on mobile */}
          {lastSyncTime && !savedOnly && (
            <div className="flex items-center gap-1.5 px-4 pb-2 text-[10.5px] text-muted-foreground/45 font-medium">
              <Clock className="w-2.5 h-2.5" />
              <span data-testid="text-last-sync-mobile">Synced {getISTTime(lastSyncTime)} IST</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto overscroll-none pb-safe md:pb-5">
        <div className="max-w-7xl mx-auto px-3 md:px-6 pt-3 md:pt-4">

          {isError && (
            <Alert variant="destructive" className="mb-5 bg-destructive/10 border-destructive/20 text-destructive rounded-xl">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error loading feed</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : "Unknown error fetching market data."}
              </AlertDescription>
            </Alert>
          )}

          {/* Status bar */}
          {!isLoading && !isError && (
            <div className="flex items-center justify-between mb-3.5 animate-fade-in">
              <div className="text-[11px] font-semibold text-muted-foreground/65 flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isFetching && !isPaginated ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
                {isFetching && !isPaginated
                  ? "Fetching latest…"
                  : isPaginated
                    ? `${displayNews?.length || 0} of ${totalCount} updates · page ${currentPage} of ${Math.max(1, totalPages)}`
                    : `${displayNews?.length || 0} updates`
                }
              </div>
            </div>
          )}

          {/* Loading skeletons */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 md:gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-[hsl(223,40%,9%)] rounded-xl p-3.5 md:p-4 border border-[hsl(223,30%,17%)] h-36 flex flex-col justify-between animate-fade-in overflow-hidden relative">
                  <div className="absolute inset-0 animate-shimmer" />
                  <div className="flex justify-between items-center mb-3">
                    <Skeleton className="h-4 w-20 rounded-lg bg-[hsl(223,30%,14%)]" />
                    <Skeleton className="h-3 w-14 rounded-lg bg-[hsl(223,30%,14%)]" />
                  </div>
                  <div className="space-y-2.5">
                    <Skeleton className="h-4 w-full rounded-lg bg-[hsl(223,30%,14%)]" />
                    <Skeleton className="h-4 w-4/5 rounded-lg bg-[hsl(223,30%,14%)]" />
                  </div>
                  <div className="mt-auto pt-3 space-y-2">
                    <Skeleton className="h-3 w-full rounded-lg bg-[hsl(223,30%,12%)]" />
                    <Skeleton className="h-3 w-3/5 rounded-lg bg-[hsl(223,30%,12%)]" />
                  </div>
                </div>
              ))}
            </div>

          /* Empty state */
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-[hsl(223,40%,8%)] rounded-2xl border border-dashed border-[hsl(223,30%,20%)] animate-fade-in">
              <div className="w-14 h-14 bg-[hsl(223,34%,13%)] rounded-2xl flex items-center justify-center mb-4">
                <Layers className="w-7 h-7 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-display font-bold text-foreground mb-2">No updates found</h3>
              <p className="text-[13px] text-muted-foreground/70 max-w-sm leading-relaxed">
                No recent news matches your criteria. The system is continuously monitoring sources.
              </p>
              <Button onClick={handleRefresh} className="mt-5 shadow-md shadow-primary/20 rounded-xl" disabled={savedOnly}>
                Force Source Scan
              </Button>
            </div>

          /* News feed */
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
                {displayNews?.map((item, i) => {
                  const showBadge = (!commodityId && !weatherOnly && !pibOnly) || weatherOnly || pibOnly || savedOnly;
                  const cName = showBadge && commodities ? commodities.find(c => c.id === item.commodityId)?.name : undefined;
                  return (
                    <NewsCard key={item.id} item={item} commodityName={cName} index={i} />
                  );
                })}
              </div>

              {/* Pagination controls — shown for PIB, Wheat, and Saved */}
              {isPaginated && totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-6 pb-2 border-t border-border/30 animate-fade-in">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-9 px-4 rounded-xl"
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 7) {
                        page = i + 1;
                      } else if (currentPage <= 4) {
                        page = i < 6 ? i + 1 : totalPages;
                      } else if (currentPage >= totalPages - 3) {
                        page = i === 0 ? 1 : totalPages - 6 + i;
                      } else {
                        const pages = [1, currentPage - 1, currentPage, currentPage + 1, totalPages];
                        page = pages[Math.min(i, pages.length - 1)];
                      }
                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className="h-9 w-9 p-0 rounded-xl text-xs font-semibold"
                          data-testid={`button-page-${page}`}
                        >
                          {page}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-9 px-4 rounded-xl"
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* PDF Export Dialog — only rendered in Saved Articles tab, uses all saved news */}
      {savedOnly && (
        <PdfExportDialog
          open={showPdfDialog}
          onOpenChange={setShowPdfDialog}
          savedNews={news ?? []}
          commodities={commodities ?? []}
        />
      )}
    </div>
  );
}
