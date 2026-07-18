export interface AnnualReportPeriod {
  periodLabel: string;
  throughMonth: string | null;
  year: string;
}

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
] as const;

export function normalizeAnnualReportYear(year: string): string {
  const normalizedYear = year.trim();

  if (!/^\d{4}$/.test(normalizedYear)) {
    throw new Error("Annual report year must use YYYY format.");
  }

  return normalizedYear;
}

export function normalizeAnnualReportThroughMonth(
  throughMonth: string | null | undefined,
  year: string
): string | undefined {
  if (!throughMonth?.trim()) {
    return undefined;
  }

  const normalizedThroughMonth = throughMonth.trim().slice(0, 7);
  const [throughYear, month] = normalizedThroughMonth.split("-").map(Number);

  if (
    !/^\d{4}-\d{2}$/.test(normalizedThroughMonth) ||
    !Number.isInteger(throughYear) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error("Annual report throughMonth must use YYYY-MM format.");
  }

  if (String(throughYear) !== year) {
    throw new Error("Annual report throughMonth must be in the selected year.");
  }

  return normalizedThroughMonth;
}

export function getAnnualReportPeriodLabel({
  throughMonth,
  year
}: {
  throughMonth?: string | null;
  year: string;
}): string {
  if (!throughMonth || throughMonth === `${year}-12`) {
    return year;
  }

  if (throughMonth === `${year}-06`) {
    return `${year} H1`;
  }

  const month = Number(throughMonth.slice(5, 7));

  return `${year} through ${monthLabels[month - 1]}`;
}

export function getAnnualReportPeriod({
  throughMonth,
  year
}: {
  throughMonth?: string | null;
  year: string;
}): AnnualReportPeriod {
  const normalizedYear = normalizeAnnualReportYear(year);
  const normalizedThroughMonth = normalizeAnnualReportThroughMonth(
    throughMonth,
    normalizedYear
  );

  return {
    periodLabel: getAnnualReportPeriodLabel({
      throughMonth: normalizedThroughMonth,
      year: normalizedYear
    }),
    throughMonth: normalizedThroughMonth ?? null,
    year: normalizedYear
  };
}

export function isMonthInAnnualReportPeriod({
  month,
  throughMonth,
  year
}: {
  month: string;
  throughMonth?: string | null;
  year: string;
}): boolean {
  const normalizedMonth = month.slice(0, 7);

  return (
    normalizedMonth.startsWith(year) &&
    (!throughMonth || normalizedMonth <= throughMonth)
  );
}
