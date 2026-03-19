import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileText, Mail, Download, Loader2 } from "lucide-react";
import type { NewsItem, Commodity } from "@shared/schema";
import jsPDF from "jspdf";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  savedNews: NewsItem[];
  commodities: Commodity[];
}

export function PdfExportDialog({ open, onOpenChange, savedNews, commodities }: Props) {
  const { toast } = useToast();
  const [fromMonth, setFromMonth] = useState(MONTHS[new Date().getMonth()]);
  const [fromYear, setFromYear] = useState(String(currentYear));
  const [toMonth, setToMonth] = useState(MONTHS[new Date().getMonth()]);
  const [toYear, setToYear] = useState(String(currentYear));
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);

  const filteredArticles = useMemo(() => {
    const fromDate = new Date(Number(fromYear), MONTHS.indexOf(fromMonth), 1);
    const toDate = new Date(Number(toYear), MONTHS.indexOf(toMonth) + 1, 0, 23, 59, 59);
    return savedNews.filter(item => {
      const d = new Date(item.publishedAt);
      return d >= fromDate && d <= toDate;
    });
  }, [savedNews, fromMonth, fromYear, toMonth, toYear]);

  const getCommodityName = (id: number) =>
    commodities.find(c => c.id === id)?.name ?? "Other";

  const periodLabel = fromMonth === toMonth && fromYear === toYear
    ? `${fromMonth} ${fromYear}`
    : `${fromMonth} ${fromYear} – ${toMonth} ${toYear}`;

  function generatePDF(): string {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210;
    const margin = 18;
    const usableW = W - margin * 2;
    let y = 0;

    const addPage = () => { doc.addPage(); y = 20; };
    const checkY = (needed: number) => { if (y + needed > 280) addPage(); };

    // ── Cover banner
    doc.setFillColor(22, 101, 52);
    doc.rect(0, 0, W, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("AgriPulse", margin, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Market Intelligence Platform", margin, 26);

    // Report meta
    doc.setFontSize(9);
    doc.text(`Period: ${periodLabel}`, margin, 34);
    doc.text(
      `Generated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
      W - margin,
      34,
      { align: "right" }
    );

    y = 52;

    // Summary row
    doc.setTextColor(30, 30, 30);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, y, usableW, 14, 2, 2, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 101, 52);
    doc.text(`${filteredArticles.length} saved articles`, margin + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`across ${new Set(filteredArticles.map(a => a.commodityId)).size} commodities`, margin + 4, y + 11);
    y += 22;

    // Group by commodity
    const grouped = new Map<string, NewsItem[]>();
    for (const item of filteredArticles) {
      const name = getCommodityName(item.commodityId);
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name)!.push(item);
    }

    for (const [commodity, items] of Array.from(grouped.entries())) {
      checkY(20);

      // Commodity header bar
      doc.setFillColor(22, 101, 52);
      doc.rect(margin, y, usableW, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`${commodity.toUpperCase()}  (${items.length})`, margin + 3, y + 5.5);
      y += 12;

      for (const item of items) {
        const dateStr = new Date(item.publishedAt).toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata"
        });

        // Wrap title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(15, 15, 15);
        const titleLines = doc.splitTextToSize(item.title, usableW - 4);
        checkY(titleLines.length * 4.5 + 14);

        doc.text(titleLines, margin + 2, y);
        y += titleLines.length * 4.5 + 1;

        // Source + date
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 100, 100);
        doc.text(`${item.source}  •  ${dateStr}`, margin + 2, y);
        y += 4;

        // Snippet (if any)
        if (item.snippet) {
          doc.setFontSize(7.5);
          doc.setTextColor(80, 80, 80);
          const snipLines = doc.splitTextToSize(item.snippet.substring(0, 200), usableW - 4);
          const clipped = snipLines.slice(0, 2);
          doc.text(clipped, margin + 2, y);
          y += clipped.length * 3.5 + 1;
        }

        // Link
        doc.setFontSize(7);
        doc.setTextColor(22, 101, 52);
        const shortLink = item.link.length > 80 ? item.link.substring(0, 80) + "…" : item.link;
        doc.text(shortLink, margin + 2, y);
        y += 3;

        // Divider
        doc.setDrawColor(230, 230, 230);
        doc.line(margin, y, W - margin, y);
        y += 6;
      }
      y += 4;
    }

    // Footer on every page
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text("AgriPulse — Confidential Market Intelligence", margin, 292);
      doc.text(`Page ${i} of ${totalPages}`, W - margin, 292, { align: "right" });
    }

    return doc.output("datauristring");
  }

  function handleDownload() {
    if (filteredArticles.length === 0) {
      toast({ title: "No articles", description: "No saved articles found for the selected period.", variant: "destructive" });
      return;
    }
    const dataUri = generatePDF();
    const link = document.createElement("a");
    link.href = dataUri;
    link.download = `AgriPulse-Saved-${periodLabel.replace(/\s+/g, "-").replace("–", "to")}.pdf`;
    link.click();
    toast({ title: "PDF downloaded", description: `${filteredArticles.length} articles exported.` });
  }

  async function handleSendEmail() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    if (filteredArticles.length === 0) {
      toast({ title: "No articles", description: "No saved articles found for the selected period.", variant: "destructive" });
      return;
    }
    setIsSending(true);
    try {
      const pdfBase64 = generatePDF();
      const res = await fetch("/api/send-pdf-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pdfBase64, dateFrom: `${fromMonth} ${fromYear}`, dateTo: `${toMonth} ${toYear}`, articleCount: filteredArticles.length }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.message === "EMAIL_NOT_CONFIGURED") {
          toast({
            title: "Email not configured",
            description: "SMTP settings are not set up. Please download the PDF instead.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Failed to send", description: data.message, variant: "destructive" });
        }
        return;
      }
      toast({ title: "Report sent!", description: `${filteredArticles.length} articles sent to ${email}` });
      onOpenChange(false);
    } catch {
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl" data-testid="dialog-pdf-export">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-display font-bold">
            <FileText className="w-5 h-5 text-primary" />
            Export Saved Articles
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Generate a PDF of your saved articles for a selected period and download or email it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* From */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">From</Label>
            <div className="flex gap-2">
              <Select value={fromMonth} onValueChange={setFromMonth}>
                <SelectTrigger className="flex-1 rounded-xl h-9 text-sm" data-testid="select-from-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fromYear} onValueChange={setFromYear}>
                <SelectTrigger className="w-24 rounded-xl h-9 text-sm" data-testid="select-from-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* To */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">To</Label>
            <div className="flex gap-2">
              <Select value={toMonth} onValueChange={setToMonth}>
                <SelectTrigger className="flex-1 rounded-xl h-9 text-sm" data-testid="select-to-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={toYear} onValueChange={setToYear}>
                <SelectTrigger className="w-24 rounded-xl h-9 text-sm" data-testid="select-to-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Article count preview */}
          <div className={`rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-2 ${filteredArticles.length > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            <FileText className="w-4 h-4 shrink-0" />
            {filteredArticles.length > 0
              ? `${filteredArticles.length} articles found for ${periodLabel}`
              : `No articles found for ${periodLabel}`}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="pdf-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Send to Email (optional)
            </Label>
            <Input
              id="pdf-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="rounded-xl h-9 text-sm"
              data-testid="input-pdf-email"
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-10 gap-2 font-semibold"
              onClick={handleDownload}
              disabled={filteredArticles.length === 0}
              data-testid="button-download-pdf"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
            <Button
              className="flex-1 rounded-xl h-10 gap-2 font-semibold shadow-lg shadow-primary/20"
              onClick={handleSendEmail}
              disabled={isSending || filteredArticles.length === 0 || !email}
              data-testid="button-send-email"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {isSending ? "Sending…" : "Send via Email"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
