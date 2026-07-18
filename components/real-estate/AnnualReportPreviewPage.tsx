"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileText,
  Home,
  Landmark,
  Printer,
  ReceiptText,
  ShieldAlert,
  TrendingUp,
  Wallet
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAnnualQualityIssueDisplay } from "@/lib/real-estate-annual-quality-display";
import {
  getPortfolioAnnualReportFilename,
  serializePortfolioAnnualReportCsv
} from "@/lib/real-estate-annual-statement";
import type {
  AnnualReportExpenseCategoryRow,
  AnnualReportPropertyScorecard,
  PortfolioAnnualReportModel
} from "@/lib/real-estate-annual-report";
import { cn } from "@/lib/utils";
import { PortfolioAnnualExportGate } from "./PortfolioAnnualExportGate";
import { RealEstatePortfolioNav } from "./RealEstatePortfolioNav";

interface AnnualReportPreviewPageProps {
  annualReportYears: string[];
  report: PortfolioAnnualReportModel;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium"
});

const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

const chartColors = {
  rent: "hsl(var(--chart-rent))",
  expenses: "hsl(var(--chart-expense-total))",
  noi: "#4f46e5",
  debt: "hsl(var(--chart-expense-hoa))",
  cashFlow: "hsl(var(--chart-cash-flow))",
  negative: "#dc2626",
  categories: {
    taxes: "hsl(var(--chart-expense-taxes))",
    insurance: "hsl(var(--chart-expense-insurance))",
    maintenance: "hsl(var(--chart-expense-maintenance))",
    hoa: "hsl(var(--chart-expense-hoa))",
    utilities: "hsl(var(--chart-expense-utilities))",
    other: "hsl(var(--chart-expense-other))"
  }
} as const;

const coverMetricClassName =
  "annual-report-cover-metric rounded-md border border-border bg-secondary/70 p-4 text-foreground print:border-slate-200 print:bg-white print:text-slate-950";
const coverMetricLabelClassName =
  "annual-report-cover-label text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground print:text-slate-500";

function formatSvgNumber(value: number): string {
  const rounded = Number(value.toFixed(3));

  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "N/A";
  }

  return percentFormatter.format(value);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "N/A";
  }

  return compactDateFormatter.format(new Date(value));
}

function formatGeneratedDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function formatIssueCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getStatusClassName(tone: "positive" | "warning" | "negative"): string {
  if (tone === "positive") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-300";
  }

  if (tone === "negative") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/35 dark:text-red-300";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300";
}

function getSignedCurrencyClassName(value: number): string {
  if (value > 0) {
    return "text-emerald-700 dark:text-emerald-300";
  }

  if (value < 0) {
    return "text-red-700 dark:text-red-300";
  }

  return "text-foreground";
}

function ReportSection({
  children,
  description,
  eyebrow,
  title
}: {
  children: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <section className="annual-report-section border-t border-border/80 px-5 py-6 md:px-8">
      <div className="annual-report-section-heading mb-4 flex flex-col gap-1">
        {eyebrow ? (
          <p className="annual-report-section-eyebrow text-xs font-bold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="annual-report-section-title text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="annual-report-section-description max-w-5xl text-sm font-medium leading-6 text-muted-foreground print:max-w-none">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function MetricPanel({
  children,
  icon: Icon,
  label,
  tone = "neutral",
  value
}: {
  children?: ReactNode;
  icon: typeof Building2;
  label: string;
  tone?: "neutral" | "positive" | "negative";
  value: string;
}) {
  return (
    <div className="annual-report-metric-panel rounded-md border border-border bg-card p-4 print:bg-white">
      <div className="flex items-start justify-between gap-3">
        <p className="annual-report-panel-label text-sm font-semibold text-muted-foreground">{label}</p>
        <Icon className="annual-report-metric-icon h-4 w-4 text-primary" />
      </div>
      <p
        className={cn(
          "annual-report-metric-value mt-3 text-2xl font-semibold tracking-tight",
          tone === "positive" && "text-emerald-700 dark:text-emerald-300",
          tone === "negative" && "text-red-700 dark:text-red-300"
        )}
      >
        {value}
      </p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function ChartPanel({
  children,
  title
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="annual-report-chart-panel rounded-md border border-border bg-card p-4 print:bg-white">
      <h3 className="annual-report-panel-title text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3 min-w-0">{children}</div>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-48 items-center justify-center rounded-md border border-dashed border-border bg-secondary/60 px-4 text-center text-sm font-semibold text-muted-foreground">
      {message}
    </div>
  );
}

function PropertyStatusBadge({
  blockingIssues,
  warningIssues
}: {
  blockingIssues: number;
  warningIssues: number;
}) {
  if (blockingIssues > 0) {
    return (
      <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${getStatusClassName("negative")}`}>
        {formatIssueCount(blockingIssues, "blocking issue", "blocking issues")}
      </span>
    );
  }

  if (warningIssues > 0) {
    return (
      <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${getStatusClassName("warning")}`}>
        {formatIssueCount(warningIssues, "warning", "warnings")}
      </span>
    );
  }

  return (
    <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${getStatusClassName("positive")}`}>
      Ready
    </span>
  );
}

function DetailMetric({
  label,
  value,
  valueClassName
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="annual-report-detail-metric border-b border-border/70 py-2 last:border-b-0">
      <p className="annual-report-detail-label text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("annual-report-detail-value mt-1 text-sm font-semibold text-foreground", valueClassName)}>
        {value}
      </p>
    </div>
  );
}

function PropertyScorecard({ scorecard }: { scorecard: AnnualReportPropertyScorecard }) {
  return (
    <article className="annual-report-scorecard break-inside-avoid rounded-md border border-border bg-card p-4 print:bg-white">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="annual-report-scorecard-title text-base font-semibold tracking-tight text-foreground">
            {scorecard.propertyName}
          </h3>
          <p className="annual-report-scorecard-address mt-1 text-sm font-medium leading-5 text-muted-foreground">
            {scorecard.propertyAddress}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {scorecard.rentalStatus === "vacant" ? "Vacant" : "Rented"}
            </span>
            <PropertyStatusBadge
              blockingIssues={scorecard.blockingIssues.length}
              warningIssues={scorecard.warningIssues.length}
            />
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="annual-report-detail-label text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Current Value
          </p>
          <p className="annual-report-scorecard-value mt-1 text-lg font-semibold text-primary">
            {formatCurrency(scorecard.currentValue)}
          </p>
        </div>
      </div>

      <div className="annual-report-scorecard-grid mt-4 grid gap-x-5 sm:grid-cols-2">
        <DetailMetric label="Mortgage Balance" value={formatCurrency(scorecard.mortgageBalance)} />
        <DetailMetric label="Equity" value={formatCurrency(scorecard.equity)} />
        <DetailMetric label="Purchase Price" value={formatCurrency(scorecard.purchasePrice)} />
        <DetailMetric label="Cash Invested" value={formatCurrency(scorecard.cashInvested)} />
        <DetailMetric label="Monthly Rent" value={formatCurrency(scorecard.monthlyRent)} />
        <DetailMetric label="Monthly Mortgage" value={formatCurrency(scorecard.monthlyMortgage)} />
        <DetailMetric label="County" value={scorecard.county ?? "N/A"} />
        <DetailMetric label="Rent Collected" value={formatCurrency(scorecard.rentCollected)} />
        <DetailMetric label="Expected Rent" value={formatCurrency(scorecard.expectedRent)} />
        <DetailMetric label="Operating Expenses" value={formatCurrency(scorecard.totalOperatingExpenses)} />
        <DetailMetric label="NOI" value={formatCurrency(scorecard.noi)} />
        <DetailMetric label="Debt Service" value={formatCurrency(scorecard.scheduledDebtService)} />
        <DetailMetric
          label="Cash Flow After Debt"
          value={formatCurrency(scorecard.cashFlowAfterDebtService)}
          valueClassName={getSignedCurrencyClassName(scorecard.cashFlowAfterDebtService)}
        />
        <DetailMetric
          label="Cash-on-Cash Return"
          value={formatPercent(scorecard.cashOnCashReturn)}
          valueClassName={
            scorecard.cashOnCashReturn == null
              ? undefined
              : getSignedCurrencyClassName(scorecard.cashOnCashReturn)
          }
        />
        <DetailMetric label="Purchase Date" value={formatDate(scorecard.purchasedAt)} />
        <DetailMetric label="Parcel" value={scorecard.parcelNumber ?? "N/A"} />
      </div>
    </article>
  );
}

function IssueSummary({ report }: { report: PortfolioAnnualReportModel }) {
  const issueResults = report.annualQualityResults.filter(
    (result) => result.issues.length > 0
  );

  if (issueResults.length === 0) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-300">
        All properties are ready for the selected annual report period.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {issueResults.map((result) => (
        <div className="rounded-md border border-border bg-card p-4 print:bg-white" key={result.propertyId}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-semibold text-foreground">{result.propertyName}</h3>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {formatIssueCount(result.blockingIssues.length, "blocking issue", "blocking issues")}
                {" · "}
                {formatIssueCount(result.warningIssues.length, "warning", "warnings")}
              </p>
            </div>
            <Link
              className="inline-flex h-8 w-fit items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-secondary print:hidden"
              href={`/real-estate/${result.propertyId}?annualReportYear=${report.year}`}
            >
              View Property
            </Link>
          </div>
          <div className="mt-3 grid gap-2">
            {result.issues.map((issue) => {
              const display = getAnnualQualityIssueDisplay(issue);
              const isBlocking = issue.severity === "blocking";

              return (
                <div
                  className={cn(
                    "grid gap-2 rounded-md border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]",
                    isBlocking
                      ? "border-red-100 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/35"
                      : "border-amber-100 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/35"
                  )}
                  key={issue.id}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {display.title}
                    </p>
                    <p className="mt-0.5 text-xs font-medium leading-5 text-muted-foreground">
                      {display.detail}
                    </p>
                  </div>
                  {display.meta ? (
                    <span className="h-fit w-fit rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      {display.meta}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ReportBarRow {
  color: string;
  label: string;
  value: number;
}

function getBarWidth(value: number, maxValue: number): string {
  if (maxValue <= 0 || value === 0) {
    return "0%";
  }

  return `${Math.max((Math.abs(value) / maxValue) * 100, 2)}%`;
}

function ReportHorizontalBarList({ rows }: { rows: ReportBarRow[] }) {
  const maxValue = Math.max(...rows.map((row) => Math.abs(row.value)), 0);

  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <div className="grid gap-2" key={row.label}>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-semibold text-foreground">{row.label}</p>
            <p className={cn("text-sm font-bold", getSignedCurrencyClassName(row.value))}>
              {formatCurrency(row.value)}
            </p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-secondary print:bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                backgroundColor: row.color,
                width: getBarWidth(row.value, maxValue)
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function getPointOnCircle(
  centerX: number,
  centerY: number,
  radius: number,
  angle: number
): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;

  return {
    x: Number(formatSvgNumber(centerX + radius * Math.cos(radians))),
    y: Number(formatSvgNumber(centerY + radius * Math.sin(radians)))
  };
}

function getDonutSegmentPath({
  centerX,
  centerY,
  endAngle,
  innerRadius,
  outerRadius,
  startAngle
}: {
  centerX: number;
  centerY: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
}): string {
  const safeEndAngle = Math.min(endAngle, startAngle + 359.99);
  const outerStart = getPointOnCircle(centerX, centerY, outerRadius, startAngle);
  const outerEnd = getPointOnCircle(centerX, centerY, outerRadius, safeEndAngle);
  const innerEnd = getPointOnCircle(centerX, centerY, innerRadius, safeEndAngle);
  const innerStart = getPointOnCircle(centerX, centerY, innerRadius, startAngle);
  const largeArcFlag = safeEndAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${formatSvgNumber(outerStart.x)} ${formatSvgNumber(outerStart.y)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${formatSvgNumber(
      outerEnd.x
    )} ${formatSvgNumber(outerEnd.y)}`,
    `L ${formatSvgNumber(innerEnd.x)} ${formatSvgNumber(innerEnd.y)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${formatSvgNumber(
      innerStart.x
    )} ${formatSvgNumber(innerStart.y)}`,
    "Z"
  ].join(" ");
}

interface ExpenseDonutSegment {
  color: string;
  endAngle: number;
  midAngle: number;
  row: AnnualReportExpenseCategoryRow;
  startAngle: number;
}

function getExpenseDonutSegments({
  rows
}: {
  rows: AnnualReportExpenseCategoryRow[];
}): ExpenseDonutSegment[] {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  let currentAngle = -90;

  if (total <= 0) {
    return [];
  }

  return rows.map((row) => {
    const sweep = (row.amount / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sweep;

    currentAngle = endAngle;

    return {
      color: chartColors.categories[row.category],
      endAngle,
      midAngle: startAngle + sweep / 2,
      row,
      startAngle
    };
  });
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface ExpenseDonutCalloutLayout {
  labelY: number;
  segment: ExpenseDonutSegment;
  side: "left" | "right";
}

function getExpenseDonutCallouts({
  centerX,
  centerY,
  maxY,
  minY,
  outerRadius,
  segments
}: {
  centerX: number;
  centerY: number;
  maxY: number;
  minY: number;
  outerRadius: number;
  segments: ExpenseDonutSegment[];
}): ExpenseDonutCalloutLayout[] {
  const callouts = segments.map((segment) => {
    const anchor = getPointOnCircle(
      centerX,
      centerY,
      outerRadius + 12,
      segment.midAngle
    );
    const side = Math.cos((segment.midAngle * Math.PI) / 180) >= 0 ? "right" : "left";

    return { anchorY: anchor.y, segment, side };
  });

  return (["left", "right"] as const).flatMap((side) => {
    const sideCallouts = callouts
      .filter((callout) => callout.side === side)
      .sort((a, b) => a.anchorY - b.anchorY);

    if (sideCallouts.length === 0) {
      return [];
    }

    if (sideCallouts.length === 1) {
      return [
        {
          labelY: clampNumber(sideCallouts[0].anchorY, minY, maxY),
          segment: sideCallouts[0].segment,
          side
        }
      ];
    }

    return sideCallouts.map((callout, index) => ({
      labelY: minY + ((maxY - minY) * index) / (sideCallouts.length - 1),
      segment: callout.segment,
      side
    }));
  });
}

function ExpenseDonutCallout({
  centerX,
  centerY,
  labelY,
  outerRadius,
  segment,
  side
}: {
  centerX: number;
  centerY: number;
  labelY: number;
  outerRadius: number;
  segment: ExpenseDonutSegment;
  side: "left" | "right";
}) {
  const isRight = side === "right";
  const start = getPointOnCircle(centerX, centerY, outerRadius + 4, segment.midAngle);
  const shoulder = getPointOnCircle(centerX, centerY, outerRadius + 18, segment.midAngle);
  const railX = isRight ? centerX + outerRadius + 52 : centerX - outerRadius - 52;
  const labelX = isRight ? centerX + outerRadius + 108 : centerX - outerRadius - 108;
  const lineEndX = isRight ? labelX - 16 : labelX + 16;
  const textAnchor = isRight ? "start" : "end";

  return (
    <g>
      <path
        d={[
          `M ${formatSvgNumber(start.x)} ${formatSvgNumber(start.y)}`,
          `L ${formatSvgNumber(shoulder.x)} ${formatSvgNumber(shoulder.y)}`,
          `L ${formatSvgNumber(railX)} ${formatSvgNumber(shoulder.y)}`,
          `L ${formatSvgNumber(railX)} ${formatSvgNumber(labelY)}`,
          `L ${formatSvgNumber(lineEndX)} ${formatSvgNumber(labelY)}`
        ].join(" ")}
        fill="none"
        stroke={segment.color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <circle
        cx={formatSvgNumber(start.x)}
        cy={formatSvgNumber(start.y)}
        fill={segment.color}
        r="3.5"
      />
      <text
        fill="hsl(var(--foreground))"
        fontSize="13"
        fontWeight="800"
        textAnchor={textAnchor}
        x={formatSvgNumber(labelX)}
        y={formatSvgNumber(labelY - 12)}
      >
        {segment.row.label}
      </text>
      <text
        fill="hsl(var(--foreground))"
        fontSize="12"
        fontWeight="700"
        textAnchor={textAnchor}
        x={formatSvgNumber(labelX)}
        y={formatSvgNumber(labelY + 5)}
      >
        {formatCurrency(segment.row.amount)} · {formatPercent(segment.row.shareOfExpenses)}
      </text>
      <text
        fill="hsl(var(--muted-foreground))"
        fontSize="11"
        fontWeight="600"
        textAnchor={textAnchor}
        x={formatSvgNumber(labelX)}
        y={formatSvgNumber(labelY + 21)}
      >
        {formatIssueCount(segment.row.transactionCount, "transaction", "transactions")}
      </text>
    </g>
  );
}

function ExpenseDonutChart({
  rows,
  total
}: {
  rows: AnnualReportExpenseCategoryRow[];
  total: number;
}) {
  const centerX = 380;
  const centerY = 220;
  const outerRadius = 128;
  const innerRadius = 76;
  const segments = getExpenseDonutSegments({ rows });
  const callouts = getExpenseDonutCallouts({
    centerX,
    centerY,
    maxY: 364,
    minY: 76,
    outerRadius,
    segments
  });

  return (
    <div className="annual-report-visual mx-auto w-full max-w-4xl">
      <svg
        aria-label="Expense category breakdown"
        className="h-auto w-full overflow-visible"
        role="img"
        viewBox="0 0 760 440"
      >
        <g>
          {segments.map((segment) => (
            <path
              d={getDonutSegmentPath({
                centerX,
                centerY,
                endAngle: segment.endAngle,
                innerRadius,
                outerRadius,
                startAngle: segment.startAngle
              })}
              fill={segment.color}
              key={segment.row.category}
              stroke="hsl(var(--card))"
              strokeWidth="3"
            />
          ))}
        </g>

        <text
          fill="hsl(var(--muted-foreground))"
          fontSize="13"
          fontWeight="700"
          textAnchor="middle"
          x={centerX}
          y={centerY - 8}
        >
          Total Expenses
        </text>
        <text
          fill="hsl(var(--foreground))"
          fontSize="24"
          fontWeight="800"
          textAnchor="middle"
          x={centerX}
          y={centerY + 22}
        >
          {formatCurrency(total)}
        </text>

        {callouts.map((callout) => (
          <ExpenseDonutCallout
            centerX={centerX}
            centerY={centerY}
            key={`callout-${callout.segment.row.category}`}
            labelY={callout.labelY}
            outerRadius={outerRadius}
            segment={callout.segment}
            side={callout.side}
          />
        ))}
      </svg>
    </div>
  );
}

function PropertyComparisonMetricCell({
  color,
  maxValue,
  value,
  valueClassName
}: {
  color: string;
  maxValue: number;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="annual-report-table-metric-value text-right text-sm font-semibold tabular-nums">
        <span className={valueClassName}>{formatCurrency(value)}</span>
      </div>
      <div className="annual-report-table-bar h-2.5 overflow-hidden rounded-full bg-secondary print:bg-slate-100">
        <div
          className="h-full rounded-full"
          style={{
            backgroundColor: color,
            width: getBarWidth(value, maxValue)
          }}
        />
      </div>
    </div>
  );
}

function PropertyComparisonBarTable({ rows }: { rows: AnnualReportPropertyScorecard[] }) {
  const maxRentCollected = Math.max(...rows.map((row) => row.rentCollected), 0);
  const maxOperatingExpenses = Math.max(
    ...rows.map((row) => row.totalOperatingExpenses),
    0
  );
  const maxNoi = Math.max(...rows.map((row) => Math.abs(row.noi)), 0);
  const maxCashFlow = Math.max(
    ...rows.map((row) => Math.abs(row.cashFlowAfterDebtService)),
    0
  );

  return (
    <div className="annual-report-visual">
      <ReportTable minWidth="min-w-[58rem]">
        <thead className="bg-secondary text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground print:bg-slate-100">
          <tr>
            <th className="px-3 py-3 text-left">Property</th>
            <th className="px-3 py-3 text-right">Rent Collected</th>
            <th className="px-3 py-3 text-right">Operating Expenses</th>
            <th className="px-3 py-3 text-right">NOI</th>
            <th className="px-3 py-3 text-right">Cash Flow After Debt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card print:bg-white">
          {rows.map((row) => (
            <tr key={row.propertyId}>
              <td className="px-3 py-3 font-semibold">{row.propertyName}</td>
              <td className="px-3 py-3">
                <PropertyComparisonMetricCell
                  color={chartColors.rent}
                  maxValue={maxRentCollected}
                  value={row.rentCollected}
                />
              </td>
              <td className="px-3 py-3">
                <PropertyComparisonMetricCell
                  color={chartColors.expenses}
                  maxValue={maxOperatingExpenses}
                  value={row.totalOperatingExpenses}
                />
              </td>
              <td className="px-3 py-3">
                <PropertyComparisonMetricCell
                  color={chartColors.noi}
                  maxValue={maxNoi}
                  value={row.noi}
                />
              </td>
              <td className="px-3 py-3">
                <PropertyComparisonMetricCell
                  color={
                    row.cashFlowAfterDebtService >= 0
                      ? chartColors.cashFlow
                      : chartColors.negative
                  }
                  maxValue={maxCashFlow}
                  value={row.cashFlowAfterDebtService}
                  valueClassName={getSignedCurrencyClassName(row.cashFlowAfterDebtService)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </ReportTable>
    </div>
  );
}

function ReportTable({
  allowPrintBreak = false,
  children,
  minWidth = "min-w-[56rem]",
  printMode = "default"
}: {
  allowPrintBreak?: boolean;
  children: ReactNode;
  minWidth?: string;
  printMode?: "default" | "compact";
}) {
  return (
    <div
      className={cn(
        "annual-report-table overflow-x-auto rounded-md border border-border print:overflow-visible",
        printMode === "compact" && "annual-report-table--compact",
        allowPrintBreak
          ? "annual-report-table--allow-break"
          : "annual-report-table--keep-together"
      )}
    >
      <table className={`${minWidth} w-full border-collapse text-sm print:min-w-0`}>
        {children}
      </table>
    </div>
  );
}

export function AnnualReportPreviewPage({
  annualReportYears,
  report
}: AnnualReportPreviewPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasReportData =
    report.statement.propertyRows.length > 0 || report.transactionRows.length > 0;
  const hasHardBlockingIssues = report.status.hardBlockingIssueCount > 0;
  const performanceRows: ReportBarRow[] = [
    {
      color: chartColors.rent,
      label: "Rent Collected",
      value: report.statement.totalRow.rentCollected
    },
    {
      color: chartColors.expenses,
      label: "Operating Expenses",
      value: report.statement.totalRow.totalOperatingExpenses
    },
    {
      color: chartColors.debt,
      label: "Debt Service",
      value: report.statement.totalRow.scheduledDebtService
    },
    {
      color:
        report.statement.totalRow.cashFlowAfterDebtService >= 0
          ? chartColors.cashFlow
          : chartColors.negative,
      label: "Cash Flow After Debt",
      value: report.statement.totalRow.cashFlowAfterDebtService
    }
  ];
  const expensePieRows = report.expenseCategoryRows.filter((row) => row.amount > 0);

  function handleYearChange(year: string) {
    const params = new URLSearchParams(searchParams.toString());

    params.set("year", year);
    params.delete("throughMonth");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function downloadAnnualReportCsv() {
    const csv = serializePortfolioAnnualReportCsv(
      report.statement,
      report.transactionRows
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = getPortfolioAnnualReportFilename(report.year);
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function printReport() {
    window.print();
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 print:hidden">
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
          href="/real-estate"
        >
          <ArrowLeft className="h-4 w-4" />
          Real Estate
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">
              AssetBoard / Real Estate / Annual Report
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Annual report preview
            </h1>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor="annual-report-preview-year">
                Report year
              </label>
              <select
                aria-label="Report year"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                data-testid="annual-report-preview-year"
                id="annual-report-preview-year"
                onChange={(event) => handleYearChange(event.target.value)}
                value={report.year}
              >
                {annualReportYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <Button
                disabled={hasHardBlockingIssues}
                onClick={printReport}
                title={
                  hasHardBlockingIssues
                    ? "Fix hard blocking issues before printing this report."
                    : undefined
                }
                type="button"
              >
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </Button>
              <PortfolioAnnualExportGate
                annualQualityResults={report.annualQualityResults}
                annualReportYear={report.year}
                buttonLabel="Download CSV"
                buttonVariant="secondary"
                canExport={hasReportData}
                checkboxId="annual-report-preview-csv-issue-review"
                dataTestId="annual-report-preview-csv-button"
                dialogDescription={`${report.year} has blocking issues. Warnings are shown for context. Review the affected properties before exporting the CSV.`}
                dialogTitle="Review annual report issues"
                emptyExportMessage="This report has no properties or transactions to export."
                onExport={downloadAnnualReportCsv}
              />
            </div>
          </div>
        </div>
        <RealEstatePortfolioNav active="annual-report" />
        {hasHardBlockingIssues ? (
          <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-300">
            Annual report output is blocked until hard data issues are fixed.
          </div>
        ) : null}
      </div>

      <article
        className="annual-report-document mx-auto w-full max-w-[72rem] overflow-hidden rounded-lg border border-border bg-card shadow-soft print:max-w-none print:rounded-none print:border-0 print:bg-white print:shadow-none"
        data-testid="annual-report-document"
      >
        <section className="annual-report-cover bg-white px-5 py-7 text-slate-950 dark:bg-card dark:text-foreground print:bg-white print:text-slate-950 md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                Annual Property Management Report
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
                {report.periodLabel} Portfolio Report
              </h2>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-600 dark:text-muted-foreground print:text-slate-600">
                Financial performance, rent collection, operating expenses, debt service,
                property-level scorecards, data readiness, and transaction coverage.
              </p>
            </div>
            <div className="grid gap-3 text-sm font-semibold">
              <span className={`w-fit rounded-md border px-3 py-1.5 ${getStatusClassName(report.status.tone)}`}>
                {report.status.label}
              </span>
              <span className="inline-flex items-center gap-2 text-slate-600 dark:text-muted-foreground print:text-slate-600">
                <CalendarDays className="h-4 w-4 text-primary" />
                Generated {formatGeneratedDate(report.generatedAt)}
              </span>
            </div>
          </div>

          <div className="annual-report-cover-metrics mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className={coverMetricClassName}>
              <p className={coverMetricLabelClassName}>
                Properties
              </p>
              <p className="mt-2 text-2xl font-semibold">{report.portfolio.propertyCount}</p>
            </div>
            <div className={coverMetricClassName}>
              <p className={coverMetricLabelClassName}>
                Portfolio Value
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatCurrency(report.portfolio.currentValue)}
              </p>
            </div>
            <div className={coverMetricClassName}>
              <p className={coverMetricLabelClassName}>
                Equity
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatCurrency(report.portfolio.equity)}
              </p>
            </div>
            <div className={coverMetricClassName}>
              <p className={coverMetricLabelClassName}>
                Issues
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {report.status.blockingIssueCount + report.status.warningIssueCount}
              </p>
            </div>
          </div>
        </section>

        <ReportSection
          description="The management view focuses on actual collected rent, posted operating expenses, debt service, and cash flow after debt service."
          eyebrow="01"
          title="Executive Summary"
        >
          <div className="annual-report-metric-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricPanel
              icon={Wallet}
              label="Rent Collected"
              value={formatCurrency(report.statement.totalRow.rentCollected)}
            />
            <MetricPanel
              icon={ReceiptText}
              label="Operating Expenses"
              value={formatCurrency(report.statement.totalRow.totalOperatingExpenses)}
            />
            <MetricPanel
              icon={TrendingUp}
              label="NOI"
              tone={report.statement.totalRow.noi >= 0 ? "positive" : "negative"}
              value={formatCurrency(report.statement.totalRow.noi)}
            />
            <MetricPanel
              icon={Landmark}
              label="Debt Service"
              value={formatCurrency(report.statement.totalRow.scheduledDebtService)}
            />
            <MetricPanel
              icon={BarChart3}
              label="Cash Flow After Debt"
              tone={
                report.statement.totalRow.cashFlowAfterDebtService >= 0
                  ? "positive"
                  : "negative"
              }
              value={formatCurrency(report.statement.totalRow.cashFlowAfterDebtService)}
            />
            <MetricPanel
              icon={TrendingUp}
              label="Cash-on-Cash Return"
              tone={
                report.statement.totalRow.cashOnCashReturn == null
                  ? "neutral"
                  : report.statement.totalRow.cashOnCashReturn >= 0
                    ? "positive"
                    : "negative"
              }
              value={formatPercent(report.statement.totalRow.cashOnCashReturn)}
            />
            <MetricPanel
              icon={FileText}
              label="Expense Ratio"
              value={formatPercent(report.statement.totalRow.expenseRatio)}
            />
          </div>
        </ReportSection>

        <ReportSection
          description="Charts are structured to carry forward into the final PDF report without changing the underlying calculations."
          eyebrow="02"
          title="Portfolio Performance"
        >
          <div className="grid gap-4">
            <ChartPanel title="Annual Financial Flow">
              <ReportHorizontalBarList rows={performanceRows} />
            </ChartPanel>

            <ChartPanel title="Expense Category Breakdown">
              {expensePieRows.length > 0 ? (
                <ExpenseDonutChart
                  rows={expensePieRows}
                  total={report.statement.totalRow.totalOperatingExpenses}
                />
              ) : (
                <EmptyPanel message="No expense transactions recorded for this report year." />
              )}
            </ChartPanel>

            <ChartPanel title="Property NOI and Cash Flow">
              {report.propertyScorecards.length > 0 ? (
                <PropertyComparisonBarTable rows={report.propertyScorecards} />
              ) : (
                <EmptyPanel message="No properties available for property comparison." />
              )}
            </ChartPanel>
          </div>
        </ReportSection>

        <ReportSection
          description="Each scorecard is designed as a manager-ready property snapshot for review with an owner, lender, or tax professional."
          eyebrow="03"
          title="Property Scorecards"
        >
          <div className="grid gap-4">
            {report.propertyScorecards.length > 0 ? (
              report.propertyScorecards.map((scorecard) => (
                <PropertyScorecard key={scorecard.propertyId} scorecard={scorecard} />
              ))
            ) : (
              <EmptyPanel message="No properties are available in this report year." />
            )}
          </div>
        </ReportSection>

        <ReportSection
          description="Rent performance compares actual collected rent against the expected rent for the report period."
          eyebrow="04"
          title="Rent & Income Review"
        >
          <ReportTable printMode="compact">
            <thead className="bg-secondary text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground print:bg-slate-100">
              <tr>
                <th className="px-3 py-3 text-left">Property</th>
                <th className="px-3 py-3 text-right">Expected Rent</th>
                <th className="px-3 py-3 text-right">Rent Collected</th>
                <th className="px-3 py-3 text-right">Variance</th>
                <th className="px-3 py-3 text-right">Collection Rate</th>
                <th className="px-3 py-3 text-right">Rent Transactions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card print:bg-white">
              {report.propertyScorecards.map((scorecard) => (
                <tr key={scorecard.propertyId}>
                  <td className="px-3 py-3 font-semibold">{scorecard.propertyName}</td>
                  <td className="px-3 py-3 text-right">{formatCurrency(scorecard.expectedRent)}</td>
                  <td className="px-3 py-3 text-right">{formatCurrency(scorecard.rentCollected)}</td>
                  <td className={`px-3 py-3 text-right font-semibold ${getSignedCurrencyClassName(scorecard.rentVariance)}`}>
                    {formatCurrency(scorecard.rentVariance)}
                  </td>
                  <td className="px-3 py-3 text-right">{formatPercent(scorecard.rentCollectionRate)}</td>
                  <td className="px-3 py-3 text-right">{scorecard.rentalIncomeTransactionCount}</td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
        </ReportSection>

        <ReportSection
          description="Operating expenses are grouped by property-management categories that map cleanly to annual review and accounting workflows."
          eyebrow="05"
          title="Expense Review"
        >
          <div className="grid gap-5">
            <div className="grid gap-2">
              <h3 className="annual-report-panel-title text-sm font-semibold text-foreground">
                Expense Category Summary
              </h3>
              <ReportTable minWidth="min-w-[42rem]">
                <thead className="bg-secondary text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground print:bg-slate-100">
                  <tr>
                    <th className="px-3 py-3 text-left">Category</th>
                    <th className="px-3 py-3 text-right">Amount</th>
                    <th className="px-3 py-3 text-right">Share</th>
                    <th className="px-3 py-3 text-right">Transactions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card print:bg-white">
                  {report.expenseCategoryRows.map((row) => (
                    <tr key={row.category}>
                      <td className="px-3 py-3 font-semibold">{row.label}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(row.amount)}</td>
                      <td className="px-3 py-3 text-right">{formatPercent(row.shareOfExpenses)}</td>
                      <td className="px-3 py-3 text-right">{row.transactionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </ReportTable>
            </div>

            <div className="grid gap-2">
              <h3 className="annual-report-panel-title text-sm font-semibold text-foreground">
                Property Expense Detail
              </h3>
              <ReportTable minWidth="min-w-[48rem]">
                <thead className="bg-secondary text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground print:bg-slate-100">
                  <tr>
                    <th className="px-3 py-3 text-left">Property</th>
                    <th className="px-3 py-3 text-right">Operating Expenses</th>
                    <th className="px-3 py-3 text-right">Expense Ratio</th>
                    <th className="px-3 py-3 text-right">Expense Transactions</th>
                    <th className="px-3 py-3 text-right">Review Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card print:bg-white">
                  {report.propertyScorecards.map((scorecard) => (
                    <tr key={scorecard.propertyId}>
                      <td className="px-3 py-3 font-semibold">{scorecard.propertyName}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(scorecard.totalOperatingExpenses)}</td>
                      <td className="px-3 py-3 text-right">{formatPercent(scorecard.expenseRatio)}</td>
                      <td className="px-3 py-3 text-right">{scorecard.expenseTransactionCount}</td>
                      <td className="px-3 py-3 text-right">
                        {scorecard.blockingIssues.length + scorecard.warningIssues.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ReportTable>
            </div>
          </div>
        </ReportSection>

        <ReportSection
          description="Debt service is separated from operating performance so NOI and owner cash flow remain easy to explain."
          eyebrow="06"
          title="Debt & Cash Flow"
        >
          <ReportTable minWidth="min-w-[72rem]" printMode="compact">
            <thead className="bg-secondary text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground print:bg-slate-100">
              <tr>
                <th className="px-3 py-3 text-left">Property</th>
                <th className="px-3 py-3 text-right">NOI</th>
                <th className="px-3 py-3 text-right">Debt Service</th>
                <th className="px-3 py-3 text-right">Cash Flow After Debt</th>
                <th className="px-3 py-3 text-right">Cash Invested</th>
                <th className="px-3 py-3 text-right">Cash-on-Cash Return</th>
                <th className="px-3 py-3 text-right">Mortgage Balance</th>
                <th className="px-3 py-3 text-right">Equity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card print:bg-white">
              {report.propertyScorecards.map((scorecard) => (
                <tr key={scorecard.propertyId}>
                  <td className="px-3 py-3 font-semibold">{scorecard.propertyName}</td>
                  <td className="px-3 py-3 text-right">{formatCurrency(scorecard.noi)}</td>
                  <td className="px-3 py-3 text-right">{formatCurrency(scorecard.scheduledDebtService)}</td>
                  <td className={`px-3 py-3 text-right font-semibold ${getSignedCurrencyClassName(scorecard.cashFlowAfterDebtService)}`}>
                    {formatCurrency(scorecard.cashFlowAfterDebtService)}
                  </td>
                  <td className="px-3 py-3 text-right">{formatCurrency(scorecard.cashInvested)}</td>
                  <td className="px-3 py-3 text-right">{formatPercent(scorecard.cashOnCashReturn)}</td>
                  <td className="px-3 py-3 text-right">{formatCurrency(scorecard.mortgageBalance)}</td>
                  <td className="px-3 py-3 text-right">{formatCurrency(scorecard.equity)}</td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
        </ReportSection>

        <ReportSection
          description="Readiness highlights report blockers before the PDF or CSV is shared outside the product."
          eyebrow="07"
          title="Data Readiness"
        >
          <div className="annual-report-metric-grid mb-4 grid gap-3 sm:grid-cols-3">
            <MetricPanel
              icon={report.status.hardBlockingIssueCount > 0 ? ShieldAlert : CheckCircle2}
              label="Report Status"
              tone={report.status.tone === "positive" ? "positive" : report.status.tone === "negative" ? "negative" : "neutral"}
              value={report.status.label}
            />
            <MetricPanel
              icon={AlertTriangle}
              label="Blocking Issues"
              tone={report.status.blockingIssueCount > 0 ? "negative" : "neutral"}
              value={String(report.status.blockingIssueCount)}
            />
            <MetricPanel
              icon={FileText}
              label="Warnings"
              value={String(report.status.warningIssueCount)}
            />
          </div>
          <IssueSummary report={report} />
        </ReportSection>

        <ReportSection
          description="The preview keeps the appendix readable; the CSV contains the full transaction detail for accounting review."
          eyebrow="08"
          title="Transaction Appendix"
        >
          <div className="annual-report-metric-grid mb-4 grid gap-3 sm:grid-cols-3">
            <MetricPanel
              icon={ReceiptText}
              label="Total Transactions"
              value={String(report.transactionSummary.totalCount)}
            />
            <MetricPanel
              icon={Wallet}
              label="Rental Income Transactions"
              value={String(report.transactionSummary.rentalIncomeCount)}
            />
            <MetricPanel
              icon={Home}
              label="Expense Transactions"
              value={String(report.transactionSummary.expenseCount)}
            />
          </div>
          <ReportTable allowPrintBreak minWidth="min-w-[64rem]" printMode="compact">
            <thead className="bg-secondary text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground print:bg-slate-100">
              <tr>
                <th className="px-3 py-3 text-left">Date</th>
                <th className="px-3 py-3 text-left">Type</th>
                <th className="px-3 py-3 text-left">Category</th>
                <th className="px-3 py-3 text-left">Description</th>
                <th className="px-3 py-3 text-left">Property</th>
                <th className="px-3 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card print:bg-white">
              {report.transactionSummary.previewRows.length > 0 ? (
                report.transactionSummary.previewRows.map((row, index) => (
                  <tr
                    key={`${row.propertyId}-${row.date}-${row.description}-${row.amount}-${index}`}
                  >
                    <td className="px-3 py-3">{formatDate(row.date)}</td>
                    <td className="px-3 py-3 font-semibold">
                      {row.type === "rental_income" ? "Rental Income" : "Expense"}
                    </td>
                    <td className="px-3 py-3">{row.category || "N/A"}</td>
                    <td className="px-3 py-3">{row.description}</td>
                    <td className="px-3 py-3">{row.propertyName}</td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {formatCurrency(row.amount)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-4 text-sm font-semibold text-muted-foreground" colSpan={6}>
                    No exportable rent or expense transactions for this report year.
                  </td>
                </tr>
              )}
            </tbody>
          </ReportTable>
          {report.transactionSummary.totalCount > report.transactionSummary.previewLimit ? (
            <p className="mt-3 text-sm font-semibold text-muted-foreground">
              Showing {report.transactionSummary.previewLimit} of {report.transactionSummary.totalCount} transactions. Download the CSV for the full appendix.
            </p>
          ) : null}
        </ReportSection>
      </article>
    </div>
  );
}
