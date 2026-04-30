"use client";

import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

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
const chartTooltipStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  boxShadow: "0 12px 28px rgb(15 23 42 / 0.12)"
};

function getLineTooltipFormatter(value: unknown) {
  return currencyFormatter.format(Number(value ?? 0));
}

function getChartCountLabel(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
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
  const shouldShowAverageLine =
    Number.isFinite(ytdAverageMonthlyExpenses) && ytdAverageMonthlyExpenses > 0;

  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="font-semibold">Monthly Expenses</h3>
        <span className="text-sm font-medium text-muted-foreground">
          {points.length} month{points.length === 1 ? "" : "s"}
        </span>
      </div>
      {points.length > 0 ? (
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
      ) : (
        <div className="flex h-64 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-muted-foreground">
          No expense data yet.
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
