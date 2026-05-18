import type {
  RealEstateAsset,
  RealEstateAssetDetail,
  RealEstateExpenseCategory,
  RealEstateMetricType,
  RealEstatePropertyTransaction,
  RealEstateTransactionRule
} from "@/types/wealth";

const fixtureYear = "2026";
const fixtureMonths = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, "0")
);

export function isAssetBoardE2EFixtureMode(): boolean {
  const isEnabled = process.env.ASSETBOARD_E2E_FIXTURES === "1";

  if (isEnabled && process.env.NODE_ENV === "production") {
    throw new Error("ASSETBOARD_E2E_FIXTURES cannot be enabled in production.");
  }

  return isEnabled;
}

function makePostedDate(month: string, day: number): string {
  return `${fixtureYear}-${month}-${String(day).padStart(2, "0")}`;
}

function makeMonthlyReviews(assetId: string, startMonth = 1) {
  return fixtureMonths.slice(startMonth - 1).map((month) => ({
    id: `${assetId}-review-${month}`,
    assetId,
    reviewMonth: `${fixtureYear}-${month}-01`,
    closedAt: `${fixtureYear}-${month}-27T16:00:00.000Z`,
    note: "E2E fixture monthly review."
  }));
}

function makeRentTransactions({
  accountName,
  assetId,
  monthlyRent,
  startMonth = 1
}: {
  accountName: string;
  assetId: string;
  monthlyRent: number;
  startMonth?: number;
}): RealEstatePropertyTransaction[] {
  return fixtureMonths.slice(startMonth - 1).map((month) => ({
    id: `${assetId}-rent-${month}`,
    assetId,
    rawBankTransactionId: `${assetId}-raw-rent-${month}`,
    bankConnectionId: `${assetId}-bank`,
    provider: "plaid",
    providerTransactionId: `${assetId}-provider-rent-${month}`,
    accountId: `${assetId}-operating`,
    accountName,
    postedAt: makePostedDate(month, 5),
    description: "Tenant Rent Payment",
    originalDescription: "ACH CREDIT TENANT RENT",
    memo: null,
    amount: monthlyRent,
    direction: "credit",
    classification: "rental_income",
    category: null,
    rentPeriodMonth: `${fixtureYear}-${month}-01`,
    note: null
  }));
}

function makeExpenseTransactions({
  accountName,
  assetId,
  startMonth = 1
}: {
  accountName: string;
  assetId: string;
  startMonth?: number;
}): RealEstatePropertyTransaction[] {
  const expensePattern: Array<{
    amount: number;
    category: RealEstateExpenseCategory;
    day: number;
    description: string;
  }> = [
    {
      amount: 285.42,
      category: "maintenance",
      day: 12,
      description: "Austin Property Repairs"
    },
    {
      amount: 142.18,
      category: "utilities",
      day: 16,
      description: "City Utilities"
    },
    {
      amount: 410,
      category: "insurance",
      day: 18,
      description: "Landlord Insurance"
    },
    {
      amount: 960,
      category: "taxes",
      day: 20,
      description: "County Property Tax Escrow"
    }
  ];

  return fixtureMonths.slice(startMonth - 1).map((month, index) => {
    const expense = expensePattern[index % expensePattern.length];

    return {
      id: `${assetId}-expense-${month}`,
      assetId,
      rawBankTransactionId: `${assetId}-raw-expense-${month}`,
      bankConnectionId: `${assetId}-bank`,
      provider: "plaid",
      providerTransactionId: `${assetId}-provider-expense-${month}`,
      accountId: `${assetId}-operating`,
      accountName,
      postedAt: makePostedDate(month, expense.day),
      description: expense.description,
      originalDescription: expense.description.toUpperCase(),
      memo: null,
      amount: expense.amount,
      direction: "debit",
      classification: "expense",
      category: expense.category,
      rentPeriodMonth: null,
      note: null
    };
  });
}

function makeSnapshots({
  assetId,
  currentMarketValue,
  monthlyMortgage,
  monthlyRent,
  remainingMortgageBalance
}: {
  assetId: string;
  currentMarketValue: number;
  monthlyMortgage: number;
  monthlyRent: number;
  remainingMortgageBalance: number;
}) {
  const snapshotValues: Array<{
    metricType: RealEstateMetricType;
    value: number;
  }> = [
    {
      metricType: "current_market_value",
      value: currentMarketValue - 12000
    },
    {
      metricType: "current_market_value",
      value: currentMarketValue
    },
    {
      metricType: "remaining_mortgage_balance",
      value: remainingMortgageBalance + 6000
    },
    {
      metricType: "remaining_mortgage_balance",
      value: remainingMortgageBalance
    },
    {
      metricType: "monthly_rent",
      value: monthlyRent
    },
    {
      metricType: "monthly_mortgage",
      value: monthlyMortgage
    }
  ];

  return snapshotValues.map((snapshot, index) => ({
    id: `${assetId}-snapshot-${index + 1}`,
    assetId,
    metricType: snapshot.metricType,
    value: snapshot.value,
    recordedAt: index % 2 === 0 ? "2026-01-01" : "2026-04-01",
    source: "provider" as const,
    note: "E2E fixture snapshot."
  }));
}

function makeProperty({
  address,
  buildingCost,
  county,
  currentMarketValue,
  landCost,
  monthlyMortgage,
  monthlyRent,
  name,
  parcelNumber,
  propertyId,
  purchasedAt,
  purchasePrice,
  remainingMortgageBalance,
  startMonth = 1
}: {
  address: string;
  buildingCost: number;
  county: string;
  currentMarketValue: number;
  landCost: number;
  monthlyMortgage: number;
  monthlyRent: number;
  name: string;
  parcelNumber: string;
  propertyId: string;
  purchasedAt: string;
  purchasePrice: number;
  remainingMortgageBalance: number;
  startMonth?: number;
}): RealEstateAssetDetail {
  const accountName = `${name} Operating Checking`;

  return {
    id: propertyId,
    name,
    type: "real-estate",
    value: currentMarketValue,
    address,
    rentalStatus: "rented",
    latitude: null,
    longitude: null,
    mapZoom: 12,
    currentMarketValueSyncedAt: "2026-04-15T12:00:00.000Z",
    county,
    purchasedAt,
    parcelNumber,
    purchasePrice,
    currentMarketValue,
    remainingMortgageBalance,
    monthlyRent,
    monthlyMortgage,
    buildingCost,
    landCost,
    totalDepreciation: Math.round(buildingCost * 0.03),
    rentMatchTolerance: 75,
    coverPhoto: {
      storagePath: `${propertyId}/cover.jpg`,
      signedUrl: null
    },
    snapshots: makeSnapshots({
      assetId: propertyId,
      currentMarketValue,
      monthlyMortgage,
      monthlyRent,
      remainingMortgageBalance
    }),
    propertyTransactions: [
      ...makeRentTransactions({
        accountName,
        assetId: propertyId,
        monthlyRent,
        startMonth
      }),
      ...makeExpenseTransactions({
        accountName,
        assetId: propertyId,
        startMonth
      })
    ].sort((left, right) => right.postedAt.localeCompare(left.postedAt)),
    bankConnections: [
      {
        id: `${propertyId}-bank`,
        assetId: propertyId,
        provider: "plaid",
        providerItemId: `${propertyId}-item`,
        accountId: `${propertyId}-operating`,
        accountName,
        accountType: "depository",
        accountSubtype: "checking",
        institutionName: "Fixture Bank",
        institutionId: "fixture-bank",
        lastFour: propertyId === "e2e-cedar-park-duplex" ? "1100" : "2201",
        status: "active",
        connectedAt: "2026-01-01T12:00:00.000Z",
        lastSyncedAt: "2026-12-31T18:00:00.000Z",
        rawTransactionsSyncedStartDate: `${fixtureYear}-${String(startMonth).padStart(2, "0")}-01`,
        rawTransactionsSyncedEndDate: "2026-12-31"
      }
    ],
    monthlyReviews: makeMonthlyReviews(propertyId, startMonth)
  };
}

const fixtureProperties: RealEstateAssetDetail[] = [
  makeProperty({
    propertyId: "e2e-cedar-park-duplex",
    name: "Cedar Park Duplex",
    address: "1100 Cypress Creek Rd, Cedar Park, TX 78613",
    county: "Williamson",
    parcelNumber: "CP-1100",
    purchasedAt: "2025-08-15",
    purchasePrice: 520000,
    currentMarketValue: 565000,
    remainingMortgageBalance: 360000,
    monthlyRent: 3200,
    monthlyMortgage: 2050,
    buildingCost: 390000,
    landCost: 130000
  }),
  makeProperty({
    propertyId: "e2e-round-rock-townhome",
    name: "Round Rock Townhome",
    address: "2201 Sunrise Rd, Round Rock, TX 78664",
    county: "Williamson",
    parcelNumber: "RR-2201",
    purchasedAt: "2026-02-10",
    purchasePrice: 390000,
    currentMarketValue: 415000,
    remainingMortgageBalance: 255000,
    monthlyRent: 2400,
    monthlyMortgage: 1500,
    buildingCost: 292500,
    landCost: 97500,
    startMonth: 2
  })
];

const fixtureRules: RealEstateTransactionRule[] = [
  {
    id: "e2e-rule-utilities",
    assignedAssetId: "e2e-cedar-park-duplex",
    name: "City utilities",
    containsText: "CITY UTILITIES",
    targetAmount: 142.18,
    setTransactionName: "City Utilities",
    category: "utilities",
    isActive: true,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z"
  },
  {
    id: "e2e-rule-repairs",
    assignedAssetId: "e2e-round-rock-townhome",
    name: "Property repairs",
    containsText: "PROPERTY REPAIRS",
    targetAmount: 285.42,
    setTransactionName: "Property Repairs",
    category: "maintenance",
    isActive: false,
    createdAt: "2026-02-01T12:00:00.000Z",
    updatedAt: "2026-02-01T12:00:00.000Z"
  }
];

function cloneProperty(property: RealEstateAssetDetail): RealEstateAssetDetail {
  return {
    ...property,
    coverPhoto: property.coverPhoto ? { ...property.coverPhoto } : null,
    snapshots: property.snapshots.map((snapshot) => ({ ...snapshot })),
    propertyTransactions: property.propertyTransactions.map((transaction) => ({
      ...transaction
    })),
    bankConnections: property.bankConnections.map((connection) => ({
      ...connection
    })),
    monthlyReviews: property.monthlyReviews.map((review) => ({ ...review }))
  };
}

export function getE2ERealEstateAssetsWithCoverPhoto(): RealEstateAssetDetail[] {
  return fixtureProperties.map(cloneProperty);
}

export function getE2ERealEstateAssets(): RealEstateAsset[] {
  return getE2ERealEstateAssetsWithCoverPhoto().map((property) => ({
    id: property.id,
    name: property.name,
    type: property.type,
    value: property.value,
    address: property.address,
    rentalStatus: property.rentalStatus,
    coverPhoto: property.coverPhoto ? { ...property.coverPhoto } : null,
    latitude: property.latitude,
    longitude: property.longitude,
    mapZoom: property.mapZoom,
    currentMarketValueSyncedAt: property.currentMarketValueSyncedAt,
    county: property.county,
    purchasedAt: property.purchasedAt,
    parcelNumber: property.parcelNumber,
    purchasePrice: property.purchasePrice,
    currentMarketValue: property.currentMarketValue,
    remainingMortgageBalance: property.remainingMortgageBalance,
    monthlyRent: property.monthlyRent,
    monthlyMortgage: property.monthlyMortgage,
    buildingCost: property.buildingCost,
    landCost: property.landCost,
    totalDepreciation: property.totalDepreciation,
    rentMatchTolerance: property.rentMatchTolerance,
    propertyTransactions: property.propertyTransactions.map((transaction) => ({
      ...transaction
    }))
  }));
}

export function getE2ERealEstateAssetDetail(
  assetId: string
): RealEstateAssetDetail | null {
  return (
    getE2ERealEstateAssetsWithCoverPhoto().find((property) => property.id === assetId) ??
    null
  );
}

export function getE2ERealEstateTransactionRules(): RealEstateTransactionRule[] {
  return fixtureRules.map((rule) => ({ ...rule }));
}
