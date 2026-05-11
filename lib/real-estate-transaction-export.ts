import { getTransactionNoteCsvValue } from "@/lib/real-estate-transaction-notes";
import type {
  RealEstateAssetDetail,
  RealEstatePropertyTransaction
} from "@/types/wealth";

export interface PortfolioAnnualTransactionExportRow {
  date: string;
  type: "rental_income" | "expense";
  category: string;
  description: string;
  note: string;
  account: string;
  amount: number;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
}

function isExportableTransaction(
  transaction: RealEstatePropertyTransaction
): boolean {
  return (
    transaction.classification === "rental_income" ||
    transaction.classification === "expense"
  );
}

function getTransactionYear(transaction: RealEstatePropertyTransaction): string {
  return transaction.postedAt.slice(0, 4);
}

export function getCurrentExportYear(): string {
  return String(new Date().getFullYear());
}

export function getPortfolioAnnualExportYears(
  properties: RealEstateAssetDetail[]
): string[] {
  const years = new Set<string>();

  for (const property of properties) {
    for (const transaction of property.propertyTransactions) {
      if (isExportableTransaction(transaction)) {
        years.add(getTransactionYear(transaction));
      }
    }
  }

  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

export function getDefaultPortfolioAnnualExportYear(
  years: string[],
  currentYear = getCurrentExportYear()
): string {
  if (years.includes(currentYear)) {
    return currentYear;
  }

  return years[0] ?? currentYear;
}

export function getPortfolioAnnualExportRows(
  properties: RealEstateAssetDetail[],
  year: string
): PortfolioAnnualTransactionExportRow[] {
  return properties
    .flatMap((property) =>
      property.propertyTransactions
        .filter(
          (transaction) =>
            isExportableTransaction(transaction) &&
            getTransactionYear(transaction) === year
        )
        .map((transaction) => ({
          date: transaction.postedAt,
          type: transaction.classification as "rental_income" | "expense",
          category: transaction.category ?? "",
          description: transaction.description,
          note: getTransactionNoteCsvValue(transaction.note),
          account: transaction.accountName,
          amount: Math.abs(transaction.amount),
          propertyId: property.id,
          propertyName: property.name,
          propertyAddress: property.address
        }))
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.propertyName.localeCompare(b.propertyName) ||
        a.description.localeCompare(b.description)
    );
}
