import { ExternalLink, Bookmark, BookmarkCheck } from "lucide-react";
import type { NewsItem } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface NewsCardProps {
  item: NewsItem;
  commodityName?: string;
  index?: number;
}

type AgeLevel = "breaking" | "hot" | "fresh" | "normal" | "old";

function getAgeLevel(publishedAt: Date): { level: AgeLevel; label: string } {
  const diffMs = Date.now() - publishedAt.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays >= 1)   return { level: "old",      label: `${diffDays}d ago` };
  if (diffHours >= 8)  return { level: "normal",   label: `${diffHours}h ago` };
  if (diffHours >= 2)  return { level: "fresh",    label: `${diffHours}h ago` };
  if (diffMins  >= 60) return { level: "hot",      label: `${diffHours}h ago` };
  return                      { level: "breaking", label: `${diffMins}m ago` };
}

const AGE_BADGE: Record<AgeLevel, string> = {
  breaking: "bg-red-500/15 text-red-300 border border-red-500/35 font-bold",
  hot:      "bg-amber-500/12 text-amber-300 border border-amber-500/30 font-bold",
  fresh:    "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 font-semibold",
  normal:   "bg-white/5 text-slate-400 border border-white/10",
  old:      "bg-white/3 text-slate-500 border border-white/6",
};

const AGE_PREFIX: Record<AgeLevel, string> = {
  breaking: "⚡ ",
  hot:      "🔥 ",
  fresh:    "",
  normal:   "",
  old:      "",
};

const CARD_BG: Record<AgeLevel, string> = {
  breaking: "bg-gradient-to-br from-red-950/30 via-[hsl(223,40%,9%)] to-[hsl(223,40%,8%)] border-red-700/30",
  hot:      "bg-gradient-to-br from-amber-950/25 via-[hsl(223,40%,9%)] to-[hsl(223,40%,8%)] border-amber-700/25",
  fresh:    "bg-gradient-to-br from-emerald-950/15 via-[hsl(223,40%,9%)] to-[hsl(223,40%,8%)] border-emerald-800/20",
  normal:   "bg-[hsl(223,40%,9%)] border-[hsl(223,30%,17%)]",
  old:      "bg-[hsl(223,38%,8%)] border-[hsl(223,28%,14%)]",
};

const CARD_HOVER: Record<AgeLevel, string> = {
  breaking: "md:hover:border-red-500/50 md:hover:shadow-red-900/30",
  hot:      "md:hover:border-amber-500/40 md:hover:shadow-amber-900/25",
  fresh:    "md:hover:border-primary/35 md:hover:shadow-primary/10",
  normal:   "md:hover:border-primary/30 md:hover:shadow-primary/8",
  old:      "md:hover:border-primary/20 md:hover:shadow-black/20",
};

const ACCENT_BAR: Record<AgeLevel, string | null> = {
  breaking: "bg-gradient-to-r from-red-500 via-red-400/70 to-transparent",
  hot:      "bg-gradient-to-r from-amber-400 via-amber-400/50 to-transparent",
  fresh:    "bg-gradient-to-r from-emerald-500/60 via-emerald-400/30 to-transparent",
  normal:   null,
  old:      null,
};

const TITLE_OPACITY: Record<AgeLevel, string> = {
  breaking: "text-foreground",
  hot:      "text-foreground/95",
  fresh:    "text-foreground/92",
  normal:   "text-foreground/82",
  old:      "text-foreground/50",
};

export function NewsCard({ item, commodityName, index = 0 }: NewsCardProps) {
  const publishedDate = new Date(item.publishedAt);
  const { level, label } = getAgeLevel(publishedDate);
  const staggerClass = `stagger-${Math.min(index + 1, 10)}`;

  const toggleSaveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/news/${item.id}/toggle-save`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
    }
  });

  const accentBar = ACCENT_BAR[level];

  return (
    <div className={`animate-fade-in-up ${staggerClass}`}>
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block group h-full"
        data-testid={`card-news-${item.id}`}
      >
        <div className={`
          relative rounded-xl border h-full flex flex-col overflow-hidden
          transition-all duration-200 ease-out
          active:scale-[0.985] active:brightness-[0.88]
          md:hover:-translate-y-0.5 md:hover:shadow-xl
          ${CARD_BG[level]}
          ${CARD_HOVER[level]}
        `}>

          {/* Desktop hover shimmer */}
          <div className="hidden md:block absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-250 pointer-events-none rounded-xl" />

          {/* Urgency accent bar */}
          {accentBar && <div className={`h-[2.5px] w-full shrink-0 ${accentBar}`} />}

          <div className="flex flex-col flex-1 p-3.5 md:p-4 gap-2.5 relative z-10">

            {/* Top row: badges + save */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">

                {/* Age badge */}
                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-[3px] rounded-md shrink-0 leading-none ${AGE_BADGE[level]}`}>
                  {AGE_PREFIX[level]}{label}
                </span>

                {/* India / Global */}
                <span className={`text-[10px] font-semibold px-1.5 py-[3px] rounded-md shrink-0 leading-none border ${
                  item.isGlobal
                    ? "border-sky-500/25 text-sky-300/90 bg-sky-500/10"
                    : "border-emerald-500/25 text-emerald-300/90 bg-emerald-500/10"
                }`}>
                  {item.isGlobal ? "Global" : "India"}
                </span>

                {/* Commodity pill */}
                {commodityName && (
                  <span className="text-[10px] font-semibold px-1.5 py-[3px] rounded-md leading-none border border-primary/25 text-primary/80 bg-primary/8 shrink-0">
                    {commodityName}
                  </span>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 rounded-lg shrink-0 transition-all duration-150 ${
                  item.isSaved
                    ? "text-primary bg-primary/15 hover:bg-primary/22"
                    : "text-muted-foreground/35 hover:text-primary hover:bg-primary/10"
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleSaveMutation.mutate();
                }}
                disabled={toggleSaveMutation.isPending}
                data-testid={`button-save-${item.id}`}
              >
                {item.isSaved ? (
                  <BookmarkCheck className="h-3.5 w-3.5 fill-current" />
                ) : (
                  <Bookmark className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            {/* Title */}
            <h3 className={`
              font-display text-[14px] md:text-[13.5px] font-semibold leading-snug
              group-hover:text-primary transition-colors duration-150
              line-clamp-3 text-crisp
              ${TITLE_OPACITY[level]}
            `}>
              {item.title}
            </h3>

            {/* Snippet */}
            {item.snippet && (
              <p className={`text-[12.5px] md:text-[12px] line-clamp-2 leading-relaxed flex-1 ${
                level === "old" ? "text-muted-foreground/40" : "text-muted-foreground/75"
              }`}>
                {item.snippet}
              </p>
            )}

            {/* Footer */}
            <div className="mt-auto pt-2.5 border-t border-white/[0.07] flex items-center justify-between">
              <span className={`text-[11px] font-semibold uppercase tracking-tight truncate max-w-[65%] ${
                level === "old" ? "text-muted-foreground/30" : "text-muted-foreground/55"
              }`}>
                {item.source}
              </span>
              <span className="text-[10.5px] font-semibold text-primary/70 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                Read <ExternalLink className="w-2.5 h-2.5" />
              </span>
            </div>
          </div>
        </div>
      </a>
    </div>
  );
}
