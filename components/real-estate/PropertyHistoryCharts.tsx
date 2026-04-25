"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  getAnnualScheduledExpensesSeries,
  getEquitySeries,
  getMetricSeries,
  getMonthlyNetCashFlowSeries,
  getMonthlyOperatingExpensesSeries,
  snapshotMetricLabels,
  type ChartPoint
} from "@/lib/real-estate-history";
import type { RealEstateMetricSnapshot, RealEstateMetricType } from "@/types/wealth";

interface PropertyHistoryChartsProps {
  snapshots: RealEstateMetricSnapshot[];
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const chartConfigs: Array<{
  id: string;
  title: string;
  points: (snapshots: RealEstateMetricSnapshot[]) => ChartPoint[];
}> = [
  {
    id: "current_market_value",
    title: snapshotMetricLabels.current_market_value,
    points: (snapshots) => getMetricSeries(snapshots, "current_market_value")
  },
  {
    id: "monthly_rent",
    title: snapshotMetricLabels.monthly_rent,
    points: (snapshots) => getMetricSeries(snapshots, "monthly_rent")
  },
  {
    id: "remaining_mortgage_balance",
    title: snapshotMetricLabels.remaining_mortgage_balance,
    points: (snapshots) => getMetricSeries(snapshots, "remaining_mortgage_balance")
  },
  {
    id: "monthly_mortgage",
    title: snapshotMetricLabels.monthly_mortgage,
    points: (snapshots) => getMetricSeries(snapshots, "monthly_mortgage")
  },
  {
    id: "monthly_average_expenses",
    title: "Monthly Average Expenses",
    points: getMonthlyOperatingExpensesSeries
  },
  {
    id: "annual_scheduled_expenses",
    title: "Annual Scheduled Expenses",
    points: getAnnualScheduledExpensesSeries
  },
  {
    id: "equity",
    title: "Equity",
    points: getEquitySeries
  },
  {
    id: "monthly_net_cash_flow",
    title: "Monthly Net Cash Flow",
    points: getMonthlyNetCashFlowSeries
  }
];

function ChartCard({ title, points }: { title: string; points: ChartPoint[] }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-sm font-medium text-muted-foreground">
          {points.length} point{points.length === 1 ? "" : "s"}
        </span>
      </div>
      {points.length > 0 ? (
        <div className="h-56">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={points} margin={{ bottom: 0, left: 0, right: 10, top: 10 }}>
              <XAxis
                dataKey="date"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                fontSize={12}
                tickFormatter={(value) => currencyFormatter.format(Number(value))}
                tickLine={false}
                axisLine={false}
                width={76}
              />
              <Tooltip
                formatter={(value) => currencyFormatter.format(Number(value))}
                labelClassName="font-semibold"
              />
              <Line
                activeDot={{ r: 5 }}
                dataKey="value"
                dot={{ r: 3 }}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-56 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-muted-foreground">
          No snapshot data yet.
        </div>
      )}
    </div>
  );
}

export function PropertyHistoryCharts({ snapshots }: PropertyHistoryChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {chartConfigs.map((config) => (
        <ChartCard
          key={config.id}
          points={config.points(snapshots)}
          title={config.title}
        />
      ))}
    </div>
  );
}

export function getSnapshotLabel(metricType: RealEstateMetricType): string {
  return snapshotMetricLabels[metricType];
}
