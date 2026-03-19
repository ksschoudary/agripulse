import * as fs from "fs";
import * as path from "path";
import { storage } from "./storage";
import xlsx from "xlsx";

export interface IgcCommodityData {
  name: string;
  years: string[];
  production: (number | null)[];
  consumption: (number | null)[];
  trade: (number | null)[];
  endStocks: (number | null)[];
}

export interface IgcReportData {
  reportNumber: string;
  reportDate: string;
  reportLabel: string;
  commodities: IgcCommodityData[];
}

async function fetchWithUA(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function getReportMeta(): Promise<{ reportNumber: string; reportDate: string; reportLabel: string }> {
  const html = (await fetchWithUA("https://www.igc.int/en/gmr_summary.aspx")).toString("utf-8");
  const numMatch = html.match(/href="\\gmr\\(\d+)\\gmr\d+grainsSD\.xlsx"/i);
  const labelMatch = html.match(/IGC Grain Market Report[^<"]*?(\d{1,2} \w+ \d{4})/i);
  const footerMatch = html.match(/id="FooterReportLabel"[^>]*>([^<]+)</);
  const reportNumber = numMatch?.[1] ?? "573";
  const fullLabel = footerMatch?.[1]?.trim() ?? `IGC Grain Market Report`;
  const reportDate = labelMatch?.[1] ?? footerMatch?.[1]?.replace(/IGC Grain Market Report\s*[-–]\s*/i, "").trim() ?? "";
  return { reportNumber, reportDate, reportLabel: fullLabel };
}

function parseGrainsExcel(buf: Buffer): { totalGrains: IgcCommodityData; wheat: IgcCommodityData; maize: IgcCommodityData } {
  const wb = xlsx.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });

  function findWorldTotalBlock(startRow: number): { years: string[]; production: (number|null)[]; consumption: (number|null)[]; trade: (number|null)[]; endStocks: (number|null)[] } {
    const years: string[] = [];
    const production: (number|null)[] = [];
    const consumption: (number|null)[] = [];
    const trade: (number|null)[] = [];
    const endStocks: (number|null)[] = [];

    let i = startRow;
    while (i < rows.length && years.length < 3) {
      const row = rows[i];
      const yearCell = String(row[1] || "").trim();
      if (/^\d{4}\/\d{2}/.test(yearCell)) {
        const estLabel = String(row[2] || "").trim();
        const label = yearCell + (estLabel ? ` ${estLabel}` : "");
        years.push(label);
        production.push(typeof row[4] === "number" ? Math.round(row[4] * 10) / 10 : null);
        consumption.push(typeof row[13] === "number" ? Math.round(row[13] * 10) / 10 : null);
        trade.push(typeof row[14] === "number" ? Math.round(row[14] * 10) / 10 : null);
        endStocks.push(typeof row[15] === "number" ? Math.round(row[15] * 10) / 10 : null);
      }
      i++;
      if (i < rows.length && String(rows[i]?.[1] || "").includes("WORLD TOTAL")) break;
    }
    return { years, production, consumption, trade, endStocks };
  }

  let totalGrainsWorldRow = -1;
  let wheatWorldRow = -1;
  let maizeWorldRow = -1;
  let inSection = "";

  for (let i = 0; i < rows.length; i++) {
    const cell = String(rows[i][1] || "").trim();
    if (cell === "TOTAL GRAINS") inSection = "totalGrains";
    else if (cell === "WHEAT") inSection = "wheat";
    else if (cell === "MAIZE") inSection = "maize";
    else if (cell === "WORLD TOTAL" && !cell.includes("excl")) {
      if (inSection === "totalGrains" && totalGrainsWorldRow < 0) totalGrainsWorldRow = i + 1;
      else if (inSection === "wheat" && wheatWorldRow < 0) wheatWorldRow = i + 1;
      else if (inSection === "maize" && maizeWorldRow < 0) maizeWorldRow = i + 1;
    }
  }

  const tgData = findWorldTotalBlock(totalGrainsWorldRow);
  const wData = findWorldTotalBlock(wheatWorldRow);
  const mData = findWorldTotalBlock(maizeWorldRow);

  return {
    totalGrains: { name: "Total Grains", ...tgData },
    wheat: { name: "Wheat", ...wData },
    maize: { name: "Maize", ...mData },
  };
}

function parseRiceExcel(buf: Buffer): IgcCommodityData {
  const wb = xlsx.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const years: string[] = [];
  const production: (number|null)[] = [];
  const consumption: (number|null)[] = [];
  const trade: (number|null)[] = [];
  const endStocks: (number|null)[] = [];

  let worldTotalRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const c2 = String(rows[i][2] || "").trim();
    if (c2 === "WORLD TOTAL") { worldTotalRow = i + 1; break; }
  }

  if (worldTotalRow >= 0) {
    for (let i = worldTotalRow; i < rows.length && years.length < 3; i++) {
      const row = rows[i];
      const yearCell = String(row[2] || "").trim();
      if (/^\d{4}\/\d{2}/.test(yearCell)) {
        const estLabel = String(row[3] || "").trim();
        years.push(yearCell + (estLabel ? ` ${estLabel}` : ""));
        production.push(typeof row[6] === "number" ? Math.round(row[6] * 10) / 10 : null);
        consumption.push(typeof row[12] === "number" ? Math.round(row[12] * 10) / 10 : null);
        trade.push(typeof row[14] === "number" ? Math.round(row[14] * 10) / 10 : null);
        endStocks.push(typeof row[16] === "number" ? Math.round(row[16] * 10) / 10 : null);
      }
    }
  }
  return { name: "Rice", years, production, consumption, trade, endStocks };
}

export async function refreshIgcEstimates(): Promise<IgcReportData> {
  console.log("Fetching IGC World Estimates...");
  const { reportNumber, reportDate, reportLabel } = await getReportMeta();
  const base = `https://www.igc.int/gmr/${reportNumber}/gmr${reportNumber}`;

  const [grainsBuf, riceBuf] = await Promise.all([
    fetchWithUA(`${base}grainsSD.xlsx`),
    fetchWithUA(`${base}riceSD.xlsx`),
  ]);

  const { totalGrains, wheat, maize } = parseGrainsExcel(grainsBuf);
  const rice = parseRiceExcel(riceBuf);

  const report: IgcReportData = {
    reportNumber,
    reportDate,
    reportLabel,
    commodities: [totalGrains, wheat, maize, rice],
  };

  await storage.saveIgcEstimates(JSON.stringify(report));
  console.log(`IGC Estimates saved — Report #${reportNumber} (${reportDate})`);
  return report;
}
