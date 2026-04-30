"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronDown } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getAnnualQualityIssueDisplay } from "@/lib/real-estate-annual-quality-display";
import type {
  AnnualQualityIssue,
  PropertyAnnualQualityResult
} from "@/lib/real-estate-annual-quality";

interface PropertyAnnualReportIssuesProps {
  annualReportYear: string;
  annualReportYears: string[];
  qualityResult: PropertyAnnualQualityResult;
}

function IssueRow({ issue }: { issue: AnnualQualityIssue }) {
  const display = getAnnualQualityIssueDisplay(issue);

  return (
    <div className="grid gap-1 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{display.title}</p>
        <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
          {display.detail}
        </p>
      </div>
      <div className="sm:justify-self-end">
        {display.meta ? (
          <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
            {display.meta}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function IssueGroup({
  issues,
  title,
  tone
}: {
  issues: AnnualQualityIssue[];
  title: string;
  tone: "blocking" | "warning";
}) {
  if (issues.length === 0) {
    return null;
  }

  const headingClassName =
    tone === "blocking"
      ? "bg-red-50/80 text-red-700"
      : "bg-amber-50/80 text-amber-700";

  return (
    <div>
      <div
        className={`flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 ${headingClassName}`}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.14em]">
          {title}
        </span>
        <span className="text-xs font-semibold">
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </span>
      </div>
      {issues.map((issue) => (
        <IssueRow issue={issue} key={issue.id} />
      ))}
    </div>
  );
}

export function PropertyAnnualReportIssues({
  annualReportYear,
  annualReportYears,
  qualityResult
}: PropertyAnnualReportIssuesProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isExpanded, setIsExpanded] = useState(false);
  const hasIssues = qualityResult.issues.length > 0;
  const blockingIssueCount = qualityResult.blockingIssues.length;
  const warningIssueCount = qualityResult.warningIssues.length;

  if (!hasIssues) {
    return null;
  }

  function handleYearChange(year: string) {
    const params = new URLSearchParams(searchParams.toString());

    params.set("annualReportYear", year);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <button
          aria-controls="property-annual-report-issues"
          aria-expanded={isExpanded}
          className="flex min-w-0 items-start gap-3 text-left"
          onClick={() => setIsExpanded((current) => !current)}
          type="button"
        >
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-100 bg-amber-50 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold tracking-tight text-slate-900">
                Annual Report Issues
              </span>
              {blockingIssueCount > 0 ? (
                <span className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                  {blockingIssueCount} blocking
                </span>
              ) : null}
              {warningIssueCount > 0 ? (
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                  {warningIssueCount} warning
                </span>
              ) : null}
            </span>
            <span className="mt-1 block text-sm font-medium text-muted-foreground">
              {annualReportYear} property-level export review
            </span>
          </span>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
        <div>
          <label className="sr-only" htmlFor="property-annual-report-year">
            Report year
          </label>
          <select
            aria-label="Report year"
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
            id="property-annual-report-year"
            onChange={(event) => handleYearChange(event.target.value)}
            value={annualReportYear}
          >
            {annualReportYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      {isExpanded ? (
        <CardContent id="property-annual-report-issues">
          <div className="overflow-hidden rounded-md border border-slate-200">
            <IssueGroup
              issues={qualityResult.blockingIssues}
              title="Blocking"
              tone="blocking"
            />
            <IssueGroup
              issues={qualityResult.warningIssues}
              title="Warnings"
              tone="warning"
            />
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
