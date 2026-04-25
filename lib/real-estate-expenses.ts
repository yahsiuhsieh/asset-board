import type {
  ExpenseFrequency,
  RealEstateExpenseItem
} from "@/types/wealth";

const frequencyMonths: Record<ExpenseFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12
};

export const expenseFrequencyLabels: Record<ExpenseFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Semiannual",
  annual: "Annual"
};

export const expenseCategoryLabels = {
  taxes: "Taxes",
  insurance: "Insurance",
  maintenance: "Maintenance",
  hoa: "HOA",
  utilities: "Utilities",
  other: "Other"
} as const;

export function getExpenseMonthlyAverage(expense: RealEstateExpenseItem): number {
  return expense.amount / frequencyMonths[expense.frequency];
}

export function getExpenseAnnualTotal(expense: RealEstateExpenseItem): number {
  return getExpenseMonthlyAverage(expense) * 12;
}

export function getMonthlyAverageExpenses(expenses: RealEstateExpenseItem[]): number {
  return expenses.reduce((total, expense) => total + getExpenseMonthlyAverage(expense), 0);
}

export function getAnnualScheduledExpenses(expenses: RealEstateExpenseItem[]): number {
  return expenses.reduce((total, expense) => total + getExpenseAnnualTotal(expense), 0);
}
