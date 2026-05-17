import type { AnnualQualityIssue } from "@/lib/real-estate-annual-quality";

interface AnnualQualityIssueDisplay {
  detail: string;
  meta: string | null;
  title: string;
}

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC"
});

function formatIssueCount(
  count: number | undefined,
  singular: string,
  plural: string
): string | null {
  if (count == null) {
    return null;
  }

  return `${count} ${count === 1 ? singular : plural}`;
}

function formatIssueMonths(months: string[] | undefined): string | null {
  if (!months || months.length === 0) {
    return null;
  }

  const parsedMonths = months.map((month) => {
    const [year, monthNumber] = month.split("-");
    const date = new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1));

    return {
      label: monthFormatter.format(date),
      year
    };
  });
  const uniqueYears = new Set(parsedMonths.map((month) => month.year));

  if (uniqueYears.size === 1) {
    return `${parsedMonths.map((month) => month.label).join(", ")} ${
      parsedMonths[0]?.year ?? ""
    }`;
  }

  return parsedMonths.map((month) => `${month.label} ${month.year}`).join(", ");
}

export function getAnnualQualityIssueDisplay(
  issue: AnnualQualityIssue
): AnnualQualityIssueDisplay {
  if (issue.code === "open_monthly_reviews") {
    return {
      detail: formatIssueMonths(issue.months) ?? issue.description,
      meta: formatIssueCount(issue.count, "month", "months"),
      title: issue.title
    };
  }

  if (issue.code === "missing_rent_months") {
    return {
      detail: formatIssueMonths(issue.months) ?? issue.description,
      meta: formatIssueCount(issue.count, "month", "months"),
      title: issue.title
    };
  }

  if (issue.code === "mock_ledger_transactions") {
    return {
      detail: "Remove mock ledger rows before export",
      meta: formatIssueCount(issue.count, "transaction", "transactions"),
      title: issue.title
    };
  }

  if (issue.code === "incomplete_bank_coverage") {
    return {
      detail: formatIssueMonths(issue.months) ?? "Run Check & Sync or reconnect accounts",
      meta: formatIssueCount(issue.count, "month", "months"),
      title: issue.title
    };
  }

  if (issue.code === "unclassified_expense_transactions") {
    return {
      detail: "Review in Expense Transactions",
      meta: formatIssueCount(issue.count, "transaction", "transactions"),
      title: issue.title
    };
  }

  if (issue.code === "missing_expense_category") {
    return {
      detail: "Add categories before export",
      meta: formatIssueCount(issue.count, "transaction", "transactions"),
      title: issue.title
    };
  }

  if (issue.code === "vacant_rent_check_skipped") {
    return {
      detail: "Vacant property excluded from rent checks",
      meta: formatIssueCount(issue.count, "month", "months"),
      title: issue.title
    };
  }

  return {
    detail: issue.months ? formatIssueMonths(issue.months) ?? issue.description : issue.description,
    meta: issue.count != null ? formatIssueCount(issue.count, "item", "items") : null,
    title: issue.title
  };
}
