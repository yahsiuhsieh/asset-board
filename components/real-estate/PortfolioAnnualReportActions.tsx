"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import type { PropertyAnnualQualityResult } from "@/lib/real-estate-annual-quality";

interface PortfolioAnnualReportActionsProps {
  annualQualityResults: PropertyAnnualQualityResult[];
  annualReportYear: string;
  annualReportYears: string[];
}

function formatIssueCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function PortfolioAnnualReportActions({
  annualQualityResults,
  annualReportYear,
  annualReportYears
}: PortfolioAnnualReportActionsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const blockingIssueCount = annualQualityResults.reduce(
    (total, result) => total + result.blockingIssues.length,
    0
  );
  const warningIssueCount = annualQualityResults.reduce(
    (total, result) => total + result.warningIssues.length,
    0
  );

  function handleYearChange(year: string) {
    const params = new URLSearchParams(searchParams.toString());

    params.set("annualReportYear", year);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-2" data-testid="portfolio-annual-report-actions">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="portfolio-report-year">
          Report year
        </label>
        <select
          aria-label="Report year"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
          data-testid="portfolio-report-year"
          id="portfolio-report-year"
          onChange={(event) => handleYearChange(event.target.value)}
          value={annualReportYear}
        >
          {annualReportYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <Link
          className={buttonVariants()}
          href={`/real-estate/annual-report?year=${annualReportYear}`}
        >
          <FileText className="h-4 w-4" />
          Preview Annual Report
        </Link>
      </div>
      {blockingIssueCount > 0 || warningIssueCount > 0 ? (
        <p className="text-xs font-semibold text-muted-foreground">
          {formatIssueCount(blockingIssueCount, "blocking issue", "blocking issues")}
          {" · "}
          {formatIssueCount(warningIssueCount, "warning", "warnings")}
        </p>
      ) : null}
    </div>
  );
}
