export type MetricBenchmarkType = "capRate" | "expenseRatio" | "cashOnCashReturn";

type BenchmarkTone = "positive" | "neutral" | "warning" | "negative";

interface BenchmarkBand {
  label: string;
  note: string;
  lower: number;
  upper: number;
  tone: BenchmarkTone;
}

interface BenchmarkConfig {
  min: number;
  max: number;
  unavailableLabel: string;
  unavailableNote: string;
  bands: BenchmarkBand[];
}

const benchmarkConfigs: Record<MetricBenchmarkType, BenchmarkConfig> = {
  capRate: {
    min: 0,
    max: 0.1,
    unavailableLabel: "No benchmark",
    unavailableNote: "Needs a valid current value.",
    bands: [
      {
        label: "Low yield",
        note: "Below a typical income yield for many rental investments.",
        lower: -Infinity,
        upper: 0.04,
        tone: "warning"
      },
      {
        label: "Stable yield",
        note: "Common range for lower-risk or stronger markets.",
        lower: 0.04,
        upper: 0.06,
        tone: "neutral"
      },
      {
        label: "Strong yield",
        note: "Attractive income yield if property risk is controlled.",
        lower: 0.06,
        upper: 0.08,
        tone: "positive"
      },
      {
        label: "High yield / higher risk",
        note: "Verify market, tenant, maintenance, and data quality risks.",
        lower: 0.08,
        upper: Infinity,
        tone: "warning"
      }
    ]
  },
  expenseRatio: {
    min: 0,
    max: 0.7,
    unavailableLabel: "No benchmark",
    unavailableNote: "Needs rent collected or monthly rent data.",
    bands: [
      {
        label: "Low expenses",
        note: "Efficient, but verify tax, insurance, and expense coverage.",
        lower: -Infinity,
        upper: 0.25,
        tone: "positive"
      },
      {
        label: "Efficient",
        note: "Healthy operating expense load for many rentals.",
        lower: 0.25,
        upper: 0.4,
        tone: "positive"
      },
      {
        label: "Typical",
        note: "Within a common operating expense range.",
        lower: 0.4,
        upper: 0.5,
        tone: "neutral"
      },
      {
        label: "Watch",
        note: "Expenses are taking a large share of rental income.",
        lower: 0.5,
        upper: 0.6,
        tone: "warning"
      },
      {
        label: "High",
        note: "Review recurring expenses and one-time repairs.",
        lower: 0.6,
        upper: Infinity,
        tone: "negative"
      }
    ]
  },
  cashOnCashReturn: {
    min: -0.05,
    max: 0.15,
    unavailableLabel: "Needs cash invested",
    unavailableNote: "Enter cash invested before judging owner cash return.",
    bands: [
      {
        label: "Negative cash return",
        note: "Cash flow after debt service is below zero.",
        lower: -Infinity,
        upper: 0,
        tone: "negative"
      },
      {
        label: "Low",
        note: "Positive, but weak for a leveraged rental.",
        lower: 0,
        upper: 0.04,
        tone: "warning"
      },
      {
        label: "Decent",
        note: "Reasonable cash return if risk and data quality are acceptable.",
        lower: 0.04,
        upper: 0.08,
        tone: "neutral"
      },
      {
        label: "Strong",
        note: "Strong cash return on owner capital.",
        lower: 0.08,
        upper: 0.12,
        tone: "positive"
      },
      {
        label: "High return",
        note: "Verify risk, one-time income, and data quality.",
        lower: 0.12,
        upper: Infinity,
        tone: "warning"
      }
    ]
  }
};

const badgeClassNames: Record<BenchmarkTone, string> = {
  positive:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-300",
  neutral:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/35 dark:text-sky-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300",
  negative:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/35 dark:text-red-300"
};

const metricLabels: Record<MetricBenchmarkType, string> = {
  capRate: "Cap rate",
  expenseRatio: "Expense ratio",
  cashOnCashReturn: "Cash-on-cash return"
};

const unavailableBenchmark = {
  label: "No benchmark",
  note: "Not enough data to judge this metric.",
  tone: "neutral" as const
};

export function getMetricBenchmark(
  metric: MetricBenchmarkType,
  value: number | null
): { label: string; note: string; tone: BenchmarkTone } {
  const config = benchmarkConfigs[metric];

  if (value == null || !Number.isFinite(value)) {
    return {
      label: config.unavailableLabel,
      note: config.unavailableNote,
      tone: "neutral"
    };
  }

  return (
    config.bands.find((band) => value >= band.lower && value < band.upper) ??
    unavailableBenchmark
  );
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent"
  }).format(value);
}

function formatBenchmarkRange(band: BenchmarkBand): string {
  if (band.lower === -Infinity) {
    return `< ${formatPercent(band.upper)}`;
  }

  if (band.upper === Infinity) {
    return `>= ${formatPercent(band.lower)}`;
  }

  return `${formatPercent(band.lower)}-${formatPercent(band.upper)}`;
}

export function MetricBenchmarkInfo({
  metric,
  value
}: {
  metric: MetricBenchmarkType;
  value: number | null;
}) {
  const config = benchmarkConfigs[metric];
  const benchmark = getMetricBenchmark(metric, value);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {metricLabels[metric]} benchmark
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${badgeClassNames[benchmark.tone]}`}>
            {benchmark.label}
          </span>
          <span className="text-xs font-semibold text-muted-foreground">
            {benchmark.note}
          </span>
        </div>
      </div>
      <div className="grid gap-1.5">
        {config.bands.map((band) => (
          <div
            className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-xs"
            key={`${metric}-${band.label}`}
          >
            <span className="font-semibold tabular-nums text-foreground">
              {formatBenchmarkRange(band)}
            </span>
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{band.label}</span>
              {" - "}
              {band.note}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
