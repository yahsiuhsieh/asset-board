"use client";

import { useMemo, useState } from "react";
import {
  BarChartHorizontal,
  ChartNoAxesCombined,
  PieChart as PieChartIcon
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart as RechartsPieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { cn } from "@/lib/utils";
import {
  getMonthlyExpenseCategorySeries,
  getMonthlyNetCashFlowSeries,
  getMonthlyRentSeries,
  getPropertyValueEquitySeries,
  monthlyExpenseCategoryKeys,
  snapshotMetricLabels,
  type ChartPoint,
  type MonthlyExpenseCategoryPoint,
  type PropertyValueEquityPoint
} from "@/lib/real-estate-history";
import {
  expenseCategoryLabels,
  getYtdAverageMonthlyExpenses
} from "@/lib/real-estate-expenses";
import type {
  RealEstateAssetDetail,
  RealEstateExpenseCategory,
  RealEstateMetricSnapshot,
  RealEstateMetricType,
  RealEstatePropertyTransaction
} from "@/types/wealth";

interface PropertyHistoryChartsProps {
  property: RealEstateAssetDetail;
  snapshots: RealEstateMetricSnapshot[];
  transactions: RealEstatePropertyTransaction[];
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});
const percentageFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1
});
const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric"
});

const chartColors = {
  value: "#ea580c",
  mortgage: "#64748b",
  equity: "#059669",
  rent: "#2563eb",
  cashFlow: "#0f766e",
  expenseTotal: "#334155",
  expenseAverage: "#7c3aed",
  expenses: {
    taxes: "#2563eb",
    insurance: "#0284c7",
    maintenance: "#059669",
    hoa: "#d97706",
    utilities: "#be123c",
    other: "#64748b"
  }
} as const;

const propertyValueLineConfigs = [
  {
    dataKey: "currentMarketValue",
    label: "Current Value",
    stroke: chartColors.value
  },
  {
    dataKey: "remainingMortgageBalance",
    label: "Mortgage Balance",
    stroke: chartColors.mortgage
  },
  {
    dataKey: "equity",
    label: "Equity",
    stroke: chartColors.equity
  }
] as const;

const monthlyExpenseCategoryColors = chartColors.expenses;
const chartMargin = { bottom: 0, left: 0, right: 12, top: 18 };
const chartMarginWithLabels = { bottom: 0, left: 0, right: 12, top: 30 };
const horizontalBarChartMargin = { bottom: 0, left: 4, right: 72, top: 8 };
const chartTooltipStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  boxShadow: "0 12px 28px rgb(15 23 42 / 0.12)"
};

type MonthlyExpenseChartView = "trend" | "pie" | "bars";

interface MonthlyExpenseBreakdownItem {
  category: RealEstateExpenseCategory;
  color: string;
  label: string;
  percentage: number;
  value: number;
}

const monthlyExpenseViewOptions = [
  {
    icon: ChartNoAxesCombined,
    label: "Trend",
    value: "trend"
  },
  {
    icon: PieChartIcon,
    label: "Pie",
    value: "pie"
  },
  {
    icon: BarChartHorizontal,
    label: "Bars",
    value: "bars"
  }
] as const;

function getLineTooltipFormatter(value: unknown) {
  return currencyFormatter.format(Number(value ?? 0));
}

function getChartCountLabel(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return month;
  }

  return monthLabelFormatter.format(new Date(year, monthNumber - 1, 1));
}

function getMonthlyExpenseBreakdown(
  point: MonthlyExpenseCategoryPoint | undefined
): MonthlyExpenseBreakdownItem[] {
  if (!point) {
    return [];
  }

  const total = monthlyExpenseCategoryKeys.reduce(
    (sum, category) => sum + point[category],
    0
  );

  return monthlyExpenseCategoryKeys
    .map((category) => ({
      category,
      color: monthlyExpenseCategoryColors[category],
      label: expenseCategoryLabels[category],
      percentage: total > 0 ? point[category] / total : 0,
      value: point[category]
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function ChartLegend({
  items
}: {
  items: Array<{
    color: string;
    label: string;
  }>;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-slate-600">
      {items.map((item) => (
        <span className="inline-flex items-center gap-2" key={item.label}>
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function ChartCard({
  countUnit = "point",
  points,
  stroke,
  title
}: {
  countUnit?: string;
  points: ChartPoint[];
  stroke: string;
  title: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-sm font-medium text-muted-foreground">
          {getChartCountLabel(points.length, countUnit)}
        </span>
      </div>
      {points.length > 0 ? (
        <div className="h-56 min-w-0">
          <ResponsiveContainer height="100%" minWidth={0} width="100%">
            <LineChart data={points} margin={chartMargin}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis
                axisLine={false}
                fontSize={12}
                dataKey="date"
                tickMargin={8}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                fontSize={12}
                tickFormatter={(value) => currencyFormatter.format(Number(value))}
                tickLine={false}
                width={76}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={getLineTooltipFormatter}
                labelClassName="font-semibold"
              />
              <Line
                activeDot={{ fill: stroke, r: 5 }}
                dataKey="value"
                dot={{ fill: stroke, r: 3, strokeWidth: 0 }}
                stroke={stroke}
                strokeWidth={2}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-56 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-muted-foreground">
          No data yet.
        </div>
      )}
    </div>
  );
}

function PropertyValueEquityChart({
  points
}: {
  points: PropertyValueEquityPoint[];
}) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="font-semibold">Value, Mortgage & Equity</h3>
        <span className="text-sm font-medium text-muted-foreground">
          {points.length} point{points.length === 1 ? "" : "s"}
        </span>
      </div>
      {points.length > 0 ? (
        <div className="min-w-0">
          <div className="h-64 min-w-0">
            <ResponsiveContainer height="100%" minWidth={0} width="100%">
              <AreaChart data={points} margin={chartMargin}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  fontSize={12}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={(value) => currencyFormatter.format(Number(value))}
                  tickLine={false}
                  width={76}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value, name) => {
                    const line = propertyValueLineConfigs.find(
                      (config) => config.dataKey === name
                    );

                    return [
                      currencyFormatter.format(Number(value ?? 0)),
                      line?.label ?? String(name)
                    ];
                  }}
                  labelClassName="font-semibold"
                />
                {propertyValueLineConfigs.map((config) => (
                  <Area
                    activeDot={{ fill: config.stroke, r: 5 }}
                    dataKey={config.dataKey}
                    dot={{ fill: config.stroke, r: 3, strokeWidth: 0 }}
                    fill={config.stroke}
                    fillOpacity={0.16}
                    key={config.dataKey}
                    stroke={config.stroke}
                    strokeWidth={2}
                    type="monotone"
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend
            items={propertyValueLineConfigs.map((config) => ({
              color: config.stroke,
              label: config.label
            }))}
          />
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-muted-foreground">
          No data yet.
        </div>
      )}
    </div>
  );
}

function MonthlyExpenseChart({
  ytdAverageMonthlyExpenses,
  points
}: {
  ytdAverageMonthlyExpenses: number;
  points: MonthlyExpenseCategoryPoint[];
}) {
  const latestExpenseMonth = points.at(-1)?.date ?? "";
  const [selectedView, setSelectedView] =
    useState<MonthlyExpenseChartView>("trend");
  const [selectedMonth, setSelectedMonth] = useState(latestExpenseMonth);
  const effectiveSelectedMonth = points.some((point) => point.date === selectedMonth)
    ? selectedMonth
    : latestExpenseMonth;
  const selectedMonthPoint = useMemo(
    () => points.find((point) => point.date === effectiveSelectedMonth),
    [effectiveSelectedMonth, points]
  );
  const selectedMonthBreakdown = useMemo(
    () => getMonthlyExpenseBreakdown(selectedMonthPoint),
    [selectedMonthPoint]
  );
  const selectedMonthTotal = selectedMonthBreakdown.reduce(
    (total, item) => total + item.value,
    0
  );
  const shouldShowAverageLine =
    Number.isFinite(ytdAverageMonthlyExpenses) && ytdAverageMonthlyExpenses > 0;
  const shouldShowMonthSelector = selectedView !== "trend" && points.length > 0;
  const hasSelectedMonthBreakdown =
    selectedMonthBreakdown.length > 0 && selectedMonthTotal > 0;

  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold">Monthly Expenses</h3>
          <div className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            {monthlyExpenseViewOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedView === option.value;

              return (
                <button
                  aria-pressed={isSelected}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 border-l border-slate-200 px-3 text-xs font-semibold transition first:border-l-0",
                    isSelected
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                  key={option.value}
                  onClick={() => setSelectedView(option.value)}
                  type="button"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {option.label}
                </button>
              );
            })}
          </div>
          {shouldShowMonthSelector ? (
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="sr-only">Expense month</span>
              <select
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                onChange={(event) => setSelectedMonth(event.target.value)}
                value={effectiveSelectedMonth}
              >
                {points.map((point) => (
                  <option key={point.date} value={point.date}>
                    {formatMonthLabel(point.date)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <span className="text-sm font-medium text-muted-foreground">
            {points.length} month{points.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      {points.length > 0 && selectedView === "trend" ? (
        <div className="min-w-0">
          <div className="h-64 min-w-0">
            <ResponsiveContainer height="100%" minWidth={0} width="100%">
              <ComposedChart data={points} margin={chartMarginWithLabels}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  fontSize={12}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={(value) => currencyFormatter.format(Number(value))}
                  tickLine={false}
                  width={76}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value, name) => [
                    currencyFormatter.format(Number(value)),
                    expenseCategoryLabels[
                      name as keyof typeof expenseCategoryLabels
                    ] ?? String(name)
                  ]}
                  labelClassName="font-semibold"
                />
                {monthlyExpenseCategoryKeys.map((category) => (
                  <Bar
                    dataKey={category}
                    fill={monthlyExpenseCategoryColors[category]}
                    key={category}
                    maxBarSize={42}
                    stackId="expenses"
                  />
                ))}
                <Line
                  activeDot={{ fill: chartColors.expenseTotal, r: 5 }}
                  dataKey="total"
                  dot={{
                    fill: "#ffffff",
                    r: 4,
                    stroke: chartColors.expenseTotal,
                    strokeWidth: 2
                  }}
                  name="Total Expenses"
                  stroke={chartColors.expenseTotal}
                  strokeWidth={2.5}
                  type="monotone"
                >
                  <LabelList
                    dataKey="total"
                    fill={chartColors.expenseTotal}
                    fontSize={12}
                    fontWeight={700}
                    formatter={getLineTooltipFormatter}
                    position="top"
                  />
                </Line>
                {shouldShowAverageLine ? (
                  <ReferenceLine
                    ifOverflow="extendDomain"
                    label={{
                      fill: chartColors.expenseAverage,
                      fontSize: 12,
                      fontWeight: 700,
                      position: "insideTopRight",
                      value: `YTD avg ${currencyFormatter.format(ytdAverageMonthlyExpenses)}/mo`
                    }}
                    stroke={chartColors.expenseAverage}
                    strokeDasharray="6 5"
                    strokeWidth={2}
                    y={ytdAverageMonthlyExpenses}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend
            items={[
              ...monthlyExpenseCategoryKeys.map((category) => ({
                color: monthlyExpenseCategoryColors[category],
                label: expenseCategoryLabels[category]
              })),
              {
                color: chartColors.expenseTotal,
                label: "Total Expenses"
              },
              ...(shouldShowAverageLine
                ? [
                    {
                      color: chartColors.expenseAverage,
                      label: "YTD Average Monthly Expenses"
                    }
                  ]
                : [])
            ]}
          />
          {shouldShowAverageLine ? (
            <div className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-500">
              <span
                aria-hidden="true"
                className="h-px w-8 border-t-2 border-dashed"
                style={{ borderColor: chartColors.expenseAverage }}
              />
              Average is calculated from January through the current month.
            </div>
          ) : null}
        </div>
      ) : points.length > 0 && selectedView === "pie" && hasSelectedMonthBreakdown ? (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(220px,0.9fr)_minmax(260px,1.1fr)]">
          <div className="relative h-72 min-w-0">
            <ResponsiveContainer height="100%" minWidth={0} width="100%">
              <RechartsPieChart margin={{ bottom: 4, left: 4, right: 4, top: 4 }}>
                <Pie
                  data={selectedMonthBreakdown}
                  dataKey="value"
                  innerRadius={72}
                  nameKey="label"
                  outerRadius={108}
                  paddingAngle={1}
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  {selectedMonthBreakdown.map((item) => (
                    <Cell fill={item.color} key={item.category} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value, name) => [
                    currencyFormatter.format(Number(value)),
                    String(name)
                  ]}
                  labelClassName="font-semibold"
                />
              </RechartsPieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-lg font-bold text-slate-900">
                  {currencyFormatter.format(selectedMonthTotal)}
                </div>
                <div className="text-xs font-semibold text-slate-500">Total</div>
              </div>
            </div>
          </div>
          <div className="grid content-center gap-x-5 gap-y-4 sm:grid-cols-2">
            {selectedMonthBreakdown.map((item) => (
              <div className="flex min-w-0 items-start gap-2" key={item.category}>
                <span
                  aria-hidden="true"
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-700">
                    {item.label}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {currencyFormatter.format(item.value)}{" "}
                    <span className="font-medium text-slate-500">
                      ({percentageFormatter.format(item.percentage)})
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : points.length > 0 && selectedView === "bars" && hasSelectedMonthBreakdown ? (
        <div className="h-72 min-w-0">
          <ResponsiveContainer height="100%" minWidth={0} width="100%">
            <RechartsBarChart
              data={selectedMonthBreakdown}
              layout="vertical"
              margin={horizontalBarChartMargin}
            >
              <CartesianGrid
                horizontal={false}
                stroke="#e2e8f0"
                strokeDasharray="3 3"
              />
              <XAxis
                axisLine={false}
                fontSize={12}
                tickFormatter={(value) => currencyFormatter.format(Number(value))}
                tickLine={false}
                type="number"
              />
              <YAxis
                axisLine={false}
                dataKey="label"
                fontSize={12}
                tickLine={false}
                type="category"
                width={104}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value) => [
                  currencyFormatter.format(Number(value)),
                  "Expenses"
                ]}
                labelClassName="font-semibold"
              />
              <Bar dataKey="value" maxBarSize={22} name="Expenses" radius={[0, 5, 5, 0]}>
                {selectedMonthBreakdown.map((item) => (
                  <Cell fill={item.color} key={item.category} />
                ))}
                <LabelList
                  dataKey="value"
                  fill="#475569"
                  fontSize={12}
                  fontWeight={700}
                  formatter={getLineTooltipFormatter}
                  position="right"
                />
              </Bar>
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-muted-foreground">
          {selectedView === "trend"
            ? "No expense data yet."
            : "No expense data for this month."}
        </div>
      )}
    </div>
  );
}

export function PropertyHistoryCharts({
  property,
  snapshots,
  transactions
}: PropertyHistoryChartsProps) {
  const monthlyRentPoints = getMonthlyRentSeries(
    snapshots,
    property.monthlyRent,
    transactions
  );
  const monthlyNetCashFlowPoints = getMonthlyNetCashFlowSeries(
    snapshots,
    transactions,
    {
      monthlyRent: property.monthlyRent,
      monthlyMortgage: property.monthlyMortgage
    }
  );

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <PropertyValueEquityChart
        points={getPropertyValueEquitySeries({
          currentMarketValue: property.currentMarketValue,
          remainingMortgageBalance: property.remainingMortgageBalance,
          snapshots
        })}
      />
      <ChartCard
        countUnit="month"
        points={monthlyRentPoints}
        stroke={chartColors.rent}
        title={snapshotMetricLabels.monthly_rent}
      />
      <MonthlyExpenseChart
        points={getMonthlyExpenseCategorySeries(transactions)}
        ytdAverageMonthlyExpenses={getYtdAverageMonthlyExpenses(transactions)}
      />
      <ChartCard
        countUnit="month"
        points={monthlyNetCashFlowPoints}
        stroke={chartColors.cashFlow}
        title="Monthly Net Cash Flow"
      />
    </div>
  );
}

export function getSnapshotLabel(metricType: RealEstateMetricType): string {
  return snapshotMetricLabels[metricType];
}
