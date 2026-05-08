export interface RealEstateTransactionFingerprintInput {
  accountName: string;
  amount: number;
  description: string;
  direction: "credit" | "debit";
  memo?: string | null;
  postedAt: string;
}

function normalizeFingerprintText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFingerprintAmount(value: number): string {
  return value.toFixed(2);
}

export function getRealEstateTransactionFingerprint(
  transaction: RealEstateTransactionFingerprintInput
): string {
  return [
    transaction.postedAt.slice(0, 10),
    transaction.direction,
    normalizeFingerprintAmount(transaction.amount),
    normalizeFingerprintText(transaction.accountName),
    normalizeFingerprintText(transaction.description),
    normalizeFingerprintText(transaction.memo)
  ].join("|");
}

export function isSameRealEstateTransactionFingerprint(
  left: RealEstateTransactionFingerprintInput,
  right: RealEstateTransactionFingerprintInput
): boolean {
  return (
    getRealEstateTransactionFingerprint(left) ===
    getRealEstateTransactionFingerprint(right)
  );
}
