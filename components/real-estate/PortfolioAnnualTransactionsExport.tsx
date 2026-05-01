"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { PropertyAnnualQualityResult } from "@/lib/real-estate-annual-quality";
import { getPortfolioAnnualExportRows } from "@/lib/real-estate-transaction-export";
import {
  getPortfolioAnnualReportFilename,
  getPortfolioAnnualStatement,
  serializePortfolioAnnualReportCsv
} from "@/lib/real-estate-annual-statement";
import type { RealEstateAssetDetail } from "@/types/wealth";
import { PortfolioAnnualExportGate } from "./PortfolioAnnualExportGate";

interface PortfolioAnnualTransactionsExportProps {
  annualQualityResults: PropertyAnnualQualityResult[];
  annualReportYear: string;
  annualReportYears: string[];
  properties: RealEstateAssetDetail[];
}

export function PortfolioAnnualTransactionsExport({
  annualQualityResults,
  annualReportYear,
  annualReportYears,
  properties
}: PortfolioAnnualTransactionsExportProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const exportRows = useMemo(
    () => getPortfolioAnnualExportRows(properties, annualReportYear),
    [annualReportYear, properties]
  );
  const annualReport = useMemo(
    () =>
      getPortfolioAnnualStatement(
        properties,
        annualReportYear,
        annualQualityResults
      ),
    [annualQualityResults, annualReportYear, properties]
  );
  const canExportAnnualReport =
    annualReport.propertyRows.length > 0 || exportRows.length > 0;

  function handleYearChange(year: string) {
    const params = new URLSearchParams(searchParams.toString());

    params.set("annualReportYear", year);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function downloadAnnualReportCsv() {
    const csv = serializePortfolioAnnualReportCsv(annualReport, exportRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = getPortfolioAnnualReportFilename(annualReportYear);
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div
      className="flex flex-col gap-2"
      data-testid="portfolio-annual-transactions-export"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="portfolio-export-year">
          Export year
        </label>
        <select
          aria-label="Export year"
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
          data-testid="portfolio-export-year"
          id="portfolio-export-year"
          onChange={(event) => handleYearChange(event.target.value)}
          value={annualReportYear}
        >
          {annualReportYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <PortfolioAnnualExportGate
          annualQualityResults={annualQualityResults}
          annualReportYear={annualReportYear}
          buttonLabel="Export Annual Report"
          canExport={canExportAnnualReport}
          checkboxId="portfolio-annual-report-export-issue-review"
          dataTestId="portfolio-annual-report-export-button"
          dialogDescription={`${annualReportYear} has blocking issues. Warnings are shown for context. Review the affected properties before exporting.`}
          dialogTitle="Review annual report issues"
          emptyExportMessage="This report has no properties. Export anyway will download a portfolio total row only."
          onExport={downloadAnnualReportCsv}
        />
      </div>
    </div>
  );
}
