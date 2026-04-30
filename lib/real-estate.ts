import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  RealEstateAsset,
  RealEstateBankConnection,
  RealEstateAssetDetail,
  RealEstateExpenseCategory,
  RealEstateMetricSnapshot,
  RealEstateMetricType,
  RealEstatePhoto,
  RealEstatePropertyTransaction,
  RealEstateSource
} from "@/types/wealth";

const PROPERTY_PHOTO_BUCKET = "property-photos";

interface AssetRow {
  id: string;
  name: string;
  type: string;
  value: string | number;
}

interface RealEstatePropertyRow {
  id: string;
  asset_id: string;
  address: string;
  latitude: string | number | null;
  longitude: string | number | null;
  map_zoom: number | null;
  current_market_value_synced_at: string | null;
  county: string | null;
  purchased_at: string | null;
  parcel_number: string | null;
  purchase_price: string | number;
  current_market_value: string | number;
  remaining_mortgage_balance: string | number;
  monthly_rent: string | number;
  monthly_mortgage: string | number;
  building_cost: string | number;
  land_cost: string | number;
  total_depreciation: string | number;
  rent_collection_month: string | null;
  rent_collected_amount: string | number;
  rent_collected_at: string | null;
  rent_match_tolerance: string | number;
  asset: AssetRow | AssetRow[] | null;
}

interface RealEstateBankConnectionRow {
  id: string;
  asset_id: string;
  provider: "teller";
  enrollment_id: string | null;
  account_id: string;
  account_name: string;
  account_type: string | null;
  account_subtype: string | null;
  institution_name: string | null;
  institution_id: string | null;
  last_four: string | null;
  status: "active" | "disconnected";
  connected_at: string;
  last_synced_at: string | null;
}

interface RealEstatePhotoRow {
  id: string;
  asset_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
}

interface RealEstateMetricSnapshotRow {
  id: string;
  asset_id: string;
  metric_type: RealEstateMetricType;
  value: string | number;
  recorded_at: string;
  source: RealEstateSource;
  note: string | null;
}

interface RealEstatePropertyTransactionRow {
  id: string;
  asset_id: string;
  bank_connection_id: string | null;
  provider: "mock" | "teller";
  provider_transaction_id: string;
  account_id: string;
  account_name: string;
  posted_at: string;
  description: string;
  memo: string | null;
  amount: string | number;
  direction: "credit" | "debit";
  classification: "expense" | "rental_income" | "ignored";
  category: RealEstateExpenseCategory | null;
  note: string | null;
}

function toNumber(value: string | number): number {
  return Number(value);
}

function toOptionalNumber(value: string | number | null): number | null {
  if (value == null || value === "") {
    return null;
  }

  return Number(value);
}

function getRelatedAsset(row: RealEstatePropertyRow): AssetRow {
  const asset = Array.isArray(row.asset) ? row.asset[0] : row.asset;

  if (!asset) {
    throw new Error(`Real estate property ${row.id} is missing its asset record.`);
  }

  return asset;
}

function mapRealEstateProperty(row: RealEstatePropertyRow): RealEstateAsset {
  const asset = getRelatedAsset(row);

  return {
    id: asset.id,
    name: asset.name,
    type: "real-estate",
    value: toNumber(asset.value),
    address: row.address,
    latitude: toOptionalNumber(row.latitude),
    longitude: toOptionalNumber(row.longitude),
    mapZoom: row.map_zoom ?? 12,
    currentMarketValueSyncedAt: row.current_market_value_synced_at,
    county: row.county,
    purchasedAt: row.purchased_at,
    parcelNumber: row.parcel_number,
    purchasePrice: toNumber(row.purchase_price),
    currentMarketValue: toNumber(row.current_market_value),
    remainingMortgageBalance: toNumber(row.remaining_mortgage_balance),
    monthlyRent: toNumber(row.monthly_rent),
    monthlyMortgage: toNumber(row.monthly_mortgage),
    buildingCost: toNumber(row.building_cost),
    landCost: toNumber(row.land_cost),
    totalDepreciation: toNumber(row.total_depreciation),
    rentCollectionMonth: row.rent_collection_month,
    rentCollectedAmount: toNumber(row.rent_collected_amount),
    rentCollectedAt: row.rent_collected_at,
    rentMatchTolerance: toNumber(row.rent_match_tolerance)
  };
}

function mapBankConnection(row: RealEstateBankConnectionRow): RealEstateBankConnection {
  return {
    id: row.id,
    assetId: row.asset_id,
    provider: row.provider,
    enrollmentId: row.enrollment_id,
    accountId: row.account_id,
    accountName: row.account_name,
    accountType: row.account_type,
    accountSubtype: row.account_subtype,
    institutionName: row.institution_name,
    institutionId: row.institution_id,
    lastFour: row.last_four,
    status: row.status,
    connectedAt: row.connected_at,
    lastSyncedAt: row.last_synced_at
  };
}

function mapSnapshot(row: RealEstateMetricSnapshotRow): RealEstateMetricSnapshot {
  return {
    id: row.id,
    assetId: row.asset_id,
    metricType: row.metric_type,
    value: toNumber(row.value),
    recordedAt: row.recorded_at,
    source: row.source,
    note: row.note
  };
}

function mapPropertyTransaction(
  row: RealEstatePropertyTransactionRow
): RealEstatePropertyTransaction {
  return {
    id: row.id,
    assetId: row.asset_id,
    bankConnectionId: row.bank_connection_id,
    provider: row.provider,
    providerTransactionId: row.provider_transaction_id,
    accountId: row.account_id,
    accountName: row.account_name,
    postedAt: row.posted_at,
    description: row.description,
    memo: row.memo,
    amount: toNumber(row.amount),
    direction: row.direction,
    classification: row.classification,
    category: row.category,
    note: row.note
  };
}

async function createSignedPhotoUrl(storagePath: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.storage
    .from(PROPERTY_PHOTO_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

async function mapPhoto(row: RealEstatePhotoRow): Promise<RealEstatePhoto> {
  return {
    id: row.id,
    assetId: row.asset_id,
    storagePath: row.storage_path,
    caption: row.caption,
    sortOrder: row.sort_order,
    isCover: row.is_cover,
    signedUrl: await createSignedPhotoUrl(row.storage_path)
  };
}

async function getPropertyRows() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("real_estate_properties")
    .select(
      `
      id,
      asset_id,
      address,
      latitude,
      longitude,
      map_zoom,
      current_market_value_synced_at,
      county,
      purchased_at,
      parcel_number,
      purchase_price,
      current_market_value,
      remaining_mortgage_balance,
      monthly_rent,
      monthly_mortgage,
      building_cost,
      land_cost,
      total_depreciation,
      rent_collection_month,
      rent_collected_amount,
      rent_collected_at,
      rent_match_tolerance,
      asset:assets!inner (
        id,
        name,
        type,
        value
      )
    `
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load real estate assets: ${error.message}`);
  }

  return (data ?? []) as RealEstatePropertyRow[];
}

async function getBankConnectionRows(
  assetIds: string[]
): Promise<RealEstateBankConnectionRow[]> {
  if (assetIds.length === 0) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_bank_connections")
    .select(
      `
      id,
      asset_id,
      provider,
      enrollment_id,
      account_id,
      account_name,
      account_type,
      account_subtype,
      institution_name,
      institution_id,
      last_four,
      status,
      connected_at,
      last_synced_at
    `
    )
    .in("asset_id", assetIds)
    .order("institution_name", { ascending: true })
    .order("account_name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load bank connections: ${error.message}`);
  }

  return (data ?? []) as RealEstateBankConnectionRow[];
}

async function getPhotoRows(assetIds: string[]): Promise<RealEstatePhotoRow[]> {
  if (assetIds.length === 0) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_photos")
    .select("id, asset_id, storage_path, caption, sort_order, is_cover")
    .in("asset_id", assetIds)
    .order("is_cover", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load property photos: ${error.message}`);
  }

  return (data ?? []) as RealEstatePhotoRow[];
}

async function getSnapshotRows(assetId: string): Promise<RealEstateMetricSnapshotRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_metric_snapshots")
    .select("id, asset_id, metric_type, value, recorded_at, source, note")
    .eq("asset_id", assetId)
    .order("recorded_at", { ascending: true })
    .order("metric_type", { ascending: true });

  if (error) {
    throw new Error(`Failed to load property history: ${error.message}`);
  }

  return (data ?? []) as RealEstateMetricSnapshotRow[];
}

async function getPropertyTransactionRows(
  assetIds: string[]
): Promise<RealEstatePropertyTransactionRow[]> {
  if (assetIds.length === 0) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_property_transactions")
    .select(
      `
      id,
      asset_id,
      bank_connection_id,
      provider,
      provider_transaction_id,
      account_id,
      account_name,
      posted_at,
      description,
      memo,
      amount,
      direction,
      classification,
      category,
      note
    `
    )
    .in("asset_id", assetIds)
    .order("posted_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load property transactions: ${error.message}`);
  }

  return (data ?? []) as RealEstatePropertyTransactionRow[];
}

export async function getRealEstateAssets(): Promise<RealEstateAsset[]> {
  const rows = await getPropertyRows();
  const properties = rows.map(mapRealEstateProperty);
  const assetIds = properties.map((property) => property.id);
  const transactionRows = await getPropertyTransactionRows(assetIds);
  const transactions = transactionRows.map(mapPropertyTransaction);

  return properties.map((property) => ({
    ...property,
    propertyTransactions: transactions.filter(
      (transaction) => transaction.assetId === property.id
    )
  }));
}

export async function getRealEstateAssetsWithPhotos(): Promise<RealEstateAssetDetail[]> {
  const rows = await getPropertyRows();
  const properties = rows.map(mapRealEstateProperty);
  const assetIds = properties.map((property) => property.id);
  const [photoRows, transactionRows] = await Promise.all([
    getPhotoRows(assetIds),
    getPropertyTransactionRows(assetIds)
  ]);
  const [photos, transactions] = await Promise.all([
    Promise.all(photoRows.map(mapPhoto)),
    Promise.resolve(transactionRows.map(mapPropertyTransaction))
  ]);

  return properties.map((property) => ({
    ...property,
    photos: photos.filter((photo) => photo.assetId === property.id),
    snapshots: [],
    propertyTransactions: transactions.filter(
      (transaction) => transaction.assetId === property.id
    ),
    bankConnections: []
  }));
}

export async function getRealEstateAssetDetail(
  assetId: string
): Promise<RealEstateAssetDetail | null> {
  const rows = await getPropertyRows();
  const row = rows.find((property) => property.asset_id === assetId);

  if (!row) {
    return null;
  }

  const property = mapRealEstateProperty(row);
  const photoRows = await getPhotoRows([assetId]);
  const [
    photos,
    snapshots,
    bankConnectionRows,
    transactionRows
  ] = await Promise.all([
    Promise.all(photoRows.map(mapPhoto)),
    getSnapshotRows(assetId).then((rows) => rows.map(mapSnapshot)),
    getBankConnectionRows([assetId]),
    getPropertyTransactionRows([assetId])
  ]);

  return {
    ...property,
    bankConnections: bankConnectionRows.map(mapBankConnection),
    propertyTransactions: transactionRows.map(mapPropertyTransaction),
    photos,
    snapshots
  };
}
