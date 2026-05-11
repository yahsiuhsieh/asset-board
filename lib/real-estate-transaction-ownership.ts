export interface RawBankTransactionOwnershipRow {
  asset_id: string;
  classification: string | null;
  description?: string | null;
  raw_bank_transaction_id: string | null;
}

export function isRawBankTransactionClaimingClassification(
  classification: string | null
): boolean {
  return classification === "rental_income" || classification === "expense";
}

export function getClaimedRawBankTransactionIdsForOtherAssets({
  assetId,
  rows
}: {
  assetId: string;
  rows: RawBankTransactionOwnershipRow[];
}): Set<string> {
  return new Set(
    rows
      .filter(
        (row) =>
          row.raw_bank_transaction_id &&
          row.asset_id !== assetId &&
          isRawBankTransactionClaimingClassification(row.classification)
      )
      .map((row) => row.raw_bank_transaction_id as string)
  );
}

export function getPendingRawBankTransactionIdsClaimedByOtherAssets({
  assetId,
  rows
}: {
  assetId: string;
  rows: RawBankTransactionOwnershipRow[];
}): Set<string> {
  const claimedRawIds = getClaimedRawBankTransactionIdsForOtherAssets({
    assetId,
    rows
  });

  if (claimedRawIds.size === 0) {
    return new Set();
  }

  return new Set(
    rows
      .filter(
        (row) =>
          row.asset_id === assetId &&
          row.classification === null &&
          row.raw_bank_transaction_id &&
          claimedRawIds.has(row.raw_bank_transaction_id)
      )
      .map((row) => row.raw_bank_transaction_id as string)
  );
}

export function getPendingRawBankTransactionCleanupDescriptionsByRawId({
  assetId,
  rows
}: {
  assetId: string;
  rows: RawBankTransactionOwnershipRow[];
}): Map<string, string | null> {
  const claimedDescriptionsByRawId = new Map<string, string | null>();

  rows.forEach((row) => {
    if (
      row.raw_bank_transaction_id &&
      row.asset_id !== assetId &&
      isRawBankTransactionClaimingClassification(row.classification) &&
      !claimedDescriptionsByRawId.has(row.raw_bank_transaction_id)
    ) {
      claimedDescriptionsByRawId.set(
        row.raw_bank_transaction_id,
        row.description?.trim() || null
      );
    }
  });

  if (claimedDescriptionsByRawId.size === 0) {
    return new Map();
  }

  const cleanupDescriptionsByRawId = new Map<string, string | null>();

  rows.forEach((row) => {
    if (
      row.asset_id === assetId &&
      row.classification === null &&
      row.raw_bank_transaction_id &&
      claimedDescriptionsByRawId.has(row.raw_bank_transaction_id)
    ) {
      cleanupDescriptionsByRawId.set(
        row.raw_bank_transaction_id,
        claimedDescriptionsByRawId.get(row.raw_bank_transaction_id) ?? null
      );
    }
  });

  return cleanupDescriptionsByRawId;
}

export function getUnreviewedRawBankTransactionClaimDescriptionsByRawId({
  assetId,
  rows
}: {
  assetId: string;
  rows: RawBankTransactionOwnershipRow[];
}): Map<string, string | null> {
  const currentAssetRawIds = new Set(
    rows
      .filter((row) => row.asset_id === assetId && row.raw_bank_transaction_id)
      .map((row) => row.raw_bank_transaction_id as string)
  );
  const claimedDescriptionsByRawId = new Map<string, string | null>();

  rows.forEach((row) => {
    if (
      row.raw_bank_transaction_id &&
      row.asset_id !== assetId &&
      !currentAssetRawIds.has(row.raw_bank_transaction_id) &&
      isRawBankTransactionClaimingClassification(row.classification) &&
      !claimedDescriptionsByRawId.has(row.raw_bank_transaction_id)
    ) {
      claimedDescriptionsByRawId.set(
        row.raw_bank_transaction_id,
        row.description?.trim() || null
      );
    }
  });

  return claimedDescriptionsByRawId;
}
