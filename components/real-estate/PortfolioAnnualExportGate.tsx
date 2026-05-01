"use client";

import { useState } from "react";
import Link from "next/link";
import { FileDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAnnualQualityIssueDisplay } from "@/lib/real-estate-annual-quality-display";
import {
  type AnnualQualityIssue,
  getBlockingAnnualQualityIssues,
  hasHardBlockingAnnualQualityIssues,
  type PropertyAnnualQualityResult
} from "@/lib/real-estate-annual-quality";

interface PortfolioAnnualExportGateProps {
  annualQualityResults: PropertyAnnualQualityResult[];
  annualReportYear: string;
  buttonLabel: string;
  checkboxId: string;
  dataTestId: string;
  dialogDescription: string;
  dialogTitle: string;
  emptyExportMessage: string;
  canExport: boolean;
  onExport: () => void;
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

export function PortfolioAnnualExportGate({
  annualQualityResults,
  annualReportYear,
  buttonLabel,
  canExport,
  checkboxId,
  dataTestId,
  dialogDescription,
  dialogTitle,
  emptyExportMessage,
  onExport
}: PortfolioAnnualExportGateProps) {
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false);
  const [reviewedIssues, setReviewedIssues] = useState(false);
  const blockingIssues = getBlockingAnnualQualityIssues(annualQualityResults);
  const hasHardBlockingIssues = hasHardBlockingAnnualQualityIssues(annualQualityResults);
  const issueResults = annualQualityResults.filter(
    (result) => result.blockingIssues.length > 0 || result.warningIssues.length > 0
  );
  const hasBlockingIssues = blockingIssues.length > 0;
  const canClickExport = canExport || hasBlockingIssues;

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

    onExport();
  }

  function handleExportAnyway() {
    if (hasHardBlockingIssues) {
      return;
    }

    if (!reviewedIssues) {
      return;
    }

    onExport();
    closeIssueDialog();
  }

  return (
    <>
      <Button
        data-testid={dataTestId}
        disabled={!canClickExport}
        onClick={handleExport}
        type="button"
      >
        <FileDown className="h-4 w-4" />
        {buttonLabel}
      </Button>

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
                  {dialogTitle}
                </h2>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  {dialogDescription}
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
                  {emptyExportMessage}
                </div>
              ) : null}

              {hasHardBlockingIssues ? (
                <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  Mock ledger transactions must be removed before this annual report can be exported.
                </div>
              ) : (
                <label
                  className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800"
                  htmlFor={checkboxId}
                >
                  <input
                    checked={reviewedIssues}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-ring"
                    id={checkboxId}
                    onChange={(event) => setReviewedIssues(event.target.checked)}
                    type="checkbox"
                  />
                  <span>I reviewed these issues and want to export anyway</span>
                </label>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button onClick={closeIssueDialog} type="button" variant="secondary">
                  Cancel
                </Button>
                <Button
                  disabled={hasHardBlockingIssues || !reviewedIssues}
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
    </>
  );
}
