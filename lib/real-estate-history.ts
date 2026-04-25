import type {
  RealEstateMetricSnapshot,
  RealEstateMetricType
} from "@/types/wealth";

export const snapshotMetricLabels: Record<RealEstateMetricType, string> = {
  current_market_value: "Current Value",
  monthly_rent: "Monthly Rent",
  remaining_mortgage_balance: "Mortgage Balance",
  monthly_mortgage: "Monthly Mortgage",
  annual_taxes: "Annual Taxes",
  annual_insurance: "Annual Insurance",
  annual_maintenance: "Annual Maintenance",
  annual_expenses: "Annual Expenses"
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

export function getMonthlyOperatingExpensesSeries(
  snapshots: RealEstateMetricSnapshot[]
): ChartPoint[] {
  const snapshotsByDate = groupSnapshotsByDate(snapshots);

  return Array.from(snapshotsByDate.keys())
    .sort()
    .flatMap((date) => {
      const taxes = getSnapshotValue(snapshotsByDate, date, "annual_taxes");
      const insurance = getSnapshotValue(snapshotsByDate, date, "annual_insurance");
      const maintenance = getSnapshotValue(snapshotsByDate, date, "annual_maintenance");
      const expenses = getSnapshotValue(snapshotsByDate, date, "annual_expenses");

      if (taxes == null || insurance == null || maintenance == null || expenses == null) {
        return [];
      }

      return [{ date, value: (taxes + insurance + maintenance + expenses) / 12 }];
    });
}

export function getAnnualScheduledExpensesSeries(
  snapshots: RealEstateMetricSnapshot[]
): ChartPoint[] {
  return getMonthlyOperatingExpensesSeries(snapshots).map((point) => ({
    date: point.date,
    value: point.value * 12
  }));
}

export function getMonthlyNetCashFlowSeries(
  snapshots: RealEstateMetricSnapshot[]
): ChartPoint[] {
  const snapshotsByDate = groupSnapshotsByDate(snapshots);

  return Array.from(snapshotsByDate.keys())
    .sort()
    .flatMap((date) => {
      const rent = getSnapshotValue(snapshotsByDate, date, "monthly_rent");
      const mortgage = getSnapshotValue(snapshotsByDate, date, "monthly_mortgage");
      const operatingExpenses = getMonthlyOperatingExpensesSeries(snapshots).find(
        (point) => point.date === date
      );

      if (rent == null || mortgage == null || !operatingExpenses) {
        return [];
      }

      return [{ date, value: rent - mortgage - operatingExpenses.value }];
    });
}
