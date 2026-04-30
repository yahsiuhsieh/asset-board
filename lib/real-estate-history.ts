import type {
  RealEstateExpenseCategory,
  RealEstateMetricSnapshot,
  RealEstateMetricType,
  RealEstatePropertyTransaction
} from "@/types/wealth";

export const snapshotMetricLabels: Record<RealEstateMetricType, string> = {
  current_market_value: "Current Value",
  monthly_rent: "Monthly Rent",
  remaining_mortgage_balance: "Mortgage Balance",
  monthly_mortgage: "Monthly Mortgage"
};

export const snapshotMetricOptions: Array<{
  value: RealEstateMetricType;
  label: string;
}> = Object.entries(snapshotMetricLabels).map(([value, label]) => ({
  value: value as RealEstateMetricType,
  label
}));

export interface ChartPoint {
  date: string;
  value: number;
}

export interface MonthlyExpenseCategoryPoint {
  date: string;
  taxes: number;
  insurance: number;
  maintenance: number;
  hoa: number;
  utilities: number;
  other: number;
  total: number;
}

export interface PropertyValueEquityPoint {
  date: string;
  currentMarketValue: number;
  remainingMortgageBalance: number;
  equity: number;
}

export const monthlyExpenseCategoryKeys: RealEstateExpenseCategory[] = [
  "taxes",
  "insurance",
  "maintenance",
  "hoa",
  "utilities",
  "other"
];

export function getMetricSeries(
  snapshots: RealEstateMetricSnapshot[],
  metricType: RealEstateMetricType
): ChartPoint[] {
  return snapshots
    .filter((snapshot) => snapshot.metricType === metricType)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((snapshot) => ({
      date: snapshot.recordedAt,
      value: snapshot.value
    }));
}

export function getMonthlyRentSeries(
  snapshots: RealEstateMetricSnapshot[],
  fallbackMonthlyRent?: number,
  transactions: RealEstatePropertyTransaction[] = []
): ChartPoint[] {
  const snapshotRentByMonth = new Map<string, number>();
  const transactionRentByMonth = new Map<string, number>();

  for (const snapshot of snapshots) {
    if (snapshot.metricType !== "monthly_rent") {
      continue;
    }

    const month = snapshot.recordedAt.slice(0, 7);
    snapshotRentByMonth.set(
      month,
      (snapshotRentByMonth.get(month) ?? 0) + snapshot.value
    );
  }

  for (const transaction of transactions) {
    if (
      transaction.classification !== "rental_income" ||
      transaction.direction !== "credit"
    ) {
      continue;
    }

    const month = transaction.postedAt.slice(0, 7);
    transactionRentByMonth.set(
      month,
      (transactionRentByMonth.get(month) ?? 0) + transaction.amount
    );
  }

  const months = Array.from(
    new Set([...snapshotRentByMonth.keys(), ...transactionRentByMonth.keys()])
  ).sort();
  const points = months.map((date) => ({
    date,
    value: transactionRentByMonth.get(date) ?? snapshotRentByMonth.get(date) ?? 0
  }));

  if (points.length === 0 && fallbackMonthlyRent != null && fallbackMonthlyRent > 0) {
    return [
      {
        date: getTodayDate().slice(0, 7),
        value: fallbackMonthlyRent
      }
    ];
  }

  return points;
}

function getSnapshotValue(
  snapshotsByDate: Map<string, Map<RealEstateMetricType, number>>,
  date: string,
  metricType: RealEstateMetricType
): number | null {
  return snapshotsByDate.get(date)?.get(metricType) ?? null;
}

function groupSnapshotsByDate(snapshots: RealEstateMetricSnapshot[]) {
  const snapshotsByDate = new Map<string, Map<RealEstateMetricType, number>>();

  for (const snapshot of snapshots) {
    const values = snapshotsByDate.get(snapshot.recordedAt) ?? new Map();
    values.set(snapshot.metricType, snapshot.value);
    snapshotsByDate.set(snapshot.recordedAt, values);
  }

  return snapshotsByDate;
}

export function getEquitySeries(snapshots: RealEstateMetricSnapshot[]): ChartPoint[] {
  const snapshotsByDate = groupSnapshotsByDate(snapshots);

  return Array.from(snapshotsByDate.keys())
    .sort()
    .flatMap((date) => {
      const value = getSnapshotValue(snapshotsByDate, date, "current_market_value");
      const mortgage = getSnapshotValue(
        snapshotsByDate,
        date,
        "remaining_mortgage_balance"
      );

      if (value == null || mortgage == null) {
        return [];
      }

      return [{ date, value: value - mortgage }];
    });
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getLatestMetricValueByDate(
  snapshots: RealEstateMetricSnapshot[],
  metricType: RealEstateMetricType,
  date: string
): number | null {
  const matchingSnapshots = snapshots
    .filter(
      (snapshot) => snapshot.metricType === metricType && snapshot.recordedAt <= date
    )
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  return matchingSnapshots.at(-1)?.value ?? null;
}

export function getEquitySeriesWithFallback({
  currentMarketValue,
  remainingMortgageBalance,
  snapshots
}: {
  currentMarketValue: number;
  remainingMortgageBalance: number;
  snapshots: RealEstateMetricSnapshot[];
}): ChartPoint[] {
  const dates = Array.from(
    new Set(
      snapshots
        .filter((snapshot) =>
          ["current_market_value", "remaining_mortgage_balance"].includes(
            snapshot.metricType
          )
        )
        .map((snapshot) => snapshot.recordedAt)
    )
  ).sort();
  const chartDates = dates.length > 0 ? dates : [getTodayDate()];

  return chartDates.map((date) => {
    const value =
      getLatestMetricValueByDate(snapshots, "current_market_value", date) ??
      currentMarketValue;
    const mortgage =
      getLatestMetricValueByDate(snapshots, "remaining_mortgage_balance", date) ??
      remainingMortgageBalance;

    return {
      date,
      value: value - mortgage
    };
  });
}

export function getPropertyValueEquitySeries({
  currentMarketValue,
  remainingMortgageBalance,
  snapshots
}: {
  currentMarketValue: number;
  remainingMortgageBalance: number;
  snapshots: RealEstateMetricSnapshot[];
}): PropertyValueEquityPoint[] {
  const dates = Array.from(
    new Set(
      snapshots
        .filter((snapshot) =>
          ["current_market_value", "remaining_mortgage_balance"].includes(
            snapshot.metricType
          )
        )
        .map((snapshot) => snapshot.recordedAt)
    )
  ).sort();
  const chartDates = dates.length > 0 ? dates : [getTodayDate()];

  return chartDates.map((date) => {
    const value =
      getLatestMetricValueByDate(snapshots, "current_market_value", date) ??
      currentMarketValue;
    const mortgage =
      getLatestMetricValueByDate(snapshots, "remaining_mortgage_balance", date) ??
      remainingMortgageBalance;

    return {
      date,
      currentMarketValue: value,
      remainingMortgageBalance: mortgage,
      equity: value - mortgage
    };
  });
}

export function getMonthlyExpenseSeries(
  transactions: RealEstatePropertyTransaction[]
): ChartPoint[] {
  const expensesByMonth = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.classification !== "expense" || transaction.direction !== "debit") {
      continue;
    }

    const month = transaction.postedAt.slice(0, 7);
    expensesByMonth.set(month, (expensesByMonth.get(month) ?? 0) + transaction.amount);
  }

  return Array.from(expensesByMonth.entries())
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, value]) => ({
      date,
      value
    }));
}

function createEmptyMonthlyExpensePoint(month: string): MonthlyExpenseCategoryPoint {
  return {
    date: month,
    taxes: 0,
    insurance: 0,
    maintenance: 0,
    hoa: 0,
    utilities: 0,
    other: 0,
    total: 0
  };
}

export function getMonthlyExpenseCategorySeries(
  transactions: RealEstatePropertyTransaction[]
): MonthlyExpenseCategoryPoint[] {
  const expensesByMonth = new Map<string, MonthlyExpenseCategoryPoint>();

  for (const transaction of transactions) {
    if (transaction.classification !== "expense" || transaction.direction !== "debit") {
      continue;
    }

    const month = transaction.postedAt.slice(0, 7);
    const category = transaction.category ?? "other";
    const point = expensesByMonth.get(month) ?? createEmptyMonthlyExpensePoint(month);

    point[category] += transaction.amount;
    point.total += transaction.amount;
    expensesByMonth.set(month, point);
  }

  return Array.from(expensesByMonth.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

function getLatestMetricValueByMonth(
  snapshots: RealEstateMetricSnapshot[],
  metricType: RealEstateMetricType,
  month: string
): number | null {
  const matchingSnapshots = snapshots
    .filter(
      (snapshot) =>
        snapshot.metricType === metricType && snapshot.recordedAt.slice(0, 7) <= month
    )
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  return matchingSnapshots.at(-1)?.value ?? null;
}

export function getMonthlyNetCashFlowSeries(
  snapshots: RealEstateMetricSnapshot[],
  transactions: RealEstatePropertyTransaction[],
  fallbackValues?: {
    monthlyRent: number;
    monthlyMortgage: number;
  }
): ChartPoint[] {
  const expenseSeries = getMonthlyExpenseSeries(transactions);
  const rentSeries = getMonthlyRentSeries(snapshots, undefined, transactions);
  const expensesByMonth = new Map(
    expenseSeries.map((point) => [point.date, point.value])
  );
  const rentByMonth = new Map(rentSeries.map((point) => [point.date, point.value]));
  const chartMonths = Array.from(
    new Set([
      ...expenseSeries.map((point) => point.date),
      ...rentSeries.map((point) => point.date)
    ])
  ).sort();
  const months = chartMonths.length > 0 ? chartMonths : [getTodayDate().slice(0, 7)];

  return months.flatMap((month) => {
    const rent =
      rentByMonth.get(month) ??
      (rentSeries.length === 0 ? fallbackValues?.monthlyRent : 0);
    const mortgage = getLatestMetricValueByMonth(
      snapshots,
      "monthly_mortgage",
      month
    ) ?? fallbackValues?.monthlyMortgage;

    if (rent == null || mortgage == null) {
      return [];
    }

    return [
      {
        date: month,
        value: rent - mortgage - (expensesByMonth.get(month) ?? 0)
      }
    ];
  });
}
