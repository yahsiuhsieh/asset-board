"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAnnualQualityIssueDisplay } from "@/lib/real-estate-annual-quality-display";
import {
  type AnnualQualityIssue,
  getBlockingAnnualQualityIssues,
  type PropertyAnnualQualityResult
} from "@/lib/real-estate-annual-quality";
import {
  getPortfolioAnnualExportFilename,
  getPortfolioAnnualExportRows,
  serializePortfolioAnnualTransactionsCsv
} from "@/lib/real-estate-transaction-export";
import type { RealEstateAssetDetail } from "@/types/wealth";

interface PortfolioAnnualTransactionsExportProps {
  annualQualityResults: PropertyAnnualQualityResult[];
  annualReportYear: string;
  annualReportYears: string[];
  properties: RealEstateAssetDetail[];
}

function formatIssueCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function IssueGroup({
  issues,
  tone,
  title
}: {
  issues: AnnualQualityIssue[];
  tone: "blocking" | "warning";
  title: string;
}) {
  if (issues.length === 0) {
    return null;
  }

  const isBlocking = tone === "blocking";
  const containerClasses = isBlocking
    ? "border-red-100 bg-red-50/70"
    : "border-amber-100 bg-amber-50/80";
  const headingClasses = isBlocking ? "text-red-800" : "text-amber-800";
  const dividerClasses = isBlocking ? "divide-red-100" : "divide-amber-100";
  const metaClasses = isBlocking
    ? "border-red-100 text-red-700"
    : "border-amber-100 text-amber-700";

  return (
    <div className={`overflow-hidden rounded-md border ${containerClasses}`}>
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <p className={`text-xs font-bold uppercase tracking-[0.14em] ${headingClasses}`}>
          {title}
        </p>
        <p className={`text-xs font-semibold ${headingClasses}`}>
          {formatIssueCount(issues.length, "issue", "issues")}
        </p>
      </div>
      <ul className={`divide-y ${dividerClasses}`}>
        {issues.map((issue) => {
          const display = getAnnualQualityIssueDisplay(issue);

          return (
            <li
              className="grid gap-2 bg-white/55 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
              key={issue.id}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">
                  {display.title}
                </p>
                <p className="mt-0.5 break-words text-xs font-medium leading-5 text-slate-600">
                  {display.detail}
                </p>
              </div>
              {display.meta ? (
                <span
                  className={`w-fit rounded-full border bg-white px-2.5 py-1 text-xs font-semibold ${metaClasses}`}
                >
                  {display.meta}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
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
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false);
  const [reviewedIssues, setReviewedIssues] = useState(false);
  const exportRows = useMemo(
    () => getPortfolioAnnualExportRows(properties, annualReportYear),
    [annualReportYear, properties]
  );
  const blockingIssues = getBlockingAnnualQualityIssues(annualQualityResults);
  const issueResults = annualQualityResults.filter(
    (result) => result.blockingIssues.length > 0 || result.warningIssues.length > 0
  );
  const hasBlockingIssues = blockingIssues.length > 0;
  const canExport = exportRows.length > 0;
  const canClickExport = canExport || hasBlockingIssues;

  function handleYearChange(year: string) {
    const params = new URLSearchParams(searchParams.toString());

    params.set("annualReportYear", year);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function downloadCsv() {
    const csv = serializePortfolioAnnualTransactionsCsv(exportRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = getPortfolioAnnualExportFilename(annualReportYear);
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function closeIssueDialog() {
    setReviewedIssues(false);
    setIsIssueDialogOpen(false);
  }

  function handleExport() {
    if (hasBlockingIssues) {
      setReviewedIssues(false);
      setIsIssueDialogOpen(true);
      return;
    }

    if (!canExport) {
      return;
    }

    downloadCsv();
  }

  function handleExportAnyway() {
    if (!reviewedIssues) {
      return;
    }

    downloadCsv();
    closeIssueDialog();
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
        <Button
          data-testid="portfolio-export-button"
          disabled={!canClickExport}
          onClick={handleExport}
          type="button"
        >
          <FileDown className="h-4 w-4" />
          Export Annual Report
        </Button>
      </div>

      {isIssueDialogOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          role="dialog"
        >
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-soft">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Review annual report issues
                </h2>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  {annualReportYear} has blocking issues. Warnings are shown for
                  context. Review the affected properties or export anyway for this
                  download.
                </p>
              </div>
              <Button
                aria-label="Close"
                className="h-8 w-8 p-0"
                onClick={closeIssueDialog}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-4 p-5">
              {issueResults.map((result) => (
                <div
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  key={result.propertyId}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {result.propertyName}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">
                        {formatIssueCount(
                          result.blockingIssues.length,
                          "blocking issue",
                          "blocking issues"
                        )}
                        {" · "}
                        {formatIssueCount(
                          result.warningIssues.length,
                          "warning",
                          "warnings"
                        )}
                      </p>
                    </div>
                    <Link
                      className="inline-flex h-8 w-fit items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                      href={`/real-estate/${result.propertyId}?annualReportYear=${annualReportYear}`}
                    >
                      View
                    </Link>
                  </div>
                  <div className="mt-3 grid gap-3">
                    <IssueGroup
                      issues={result.blockingIssues}
                      title="Blocking"
                      tone="blocking"
                    />
                    <IssueGroup
                      issues={result.warningIssues}
                      title="Warnings"
                      tone="warning"
                    />
                  </div>
                </div>
              ))}

              {!canExport ? (
                <div className="rounded-md border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm font-semibold text-amber-800">
                  This year has no exportable rent or expense transactions. Export
                  anyway will download a header-only CSV.
                </div>
              ) : null}

              <label
                className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800"
                htmlFor="portfolio-export-issue-review"
              >
                <input
                  checked={reviewedIssues}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-ring"
                  id="portfolio-export-issue-review"
                  onChange={(event) => setReviewedIssues(event.target.checked)}
                  type="checkbox"
                />
                <span>I reviewed these issues and want to export anyway</span>
              </label>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button onClick={closeIssueDialog} type="button" variant="secondary">
                  Cancel
                </Button>
                <Button
                  disabled={!reviewedIssues}
                  onClick={handleExportAnyway}
                  type="button"
                >
                  <FileDown className="h-4 w-4" />
                  Export Anyway
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
