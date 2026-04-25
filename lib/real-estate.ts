import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  RealEstateAsset,
  RealEstateAssetDetail,
  RealEstateDataSource,
  RealEstateExpenseCategory,
  RealEstateExpenseItem,
  RealEstateMetricSnapshot,
  RealEstateMetricType,
  RealEstatePhoto,
  ExpenseFrequency
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
  current_market_value_source: RealEstateDataSource;
  current_market_value_synced_at: string | null;
  monthly_rent_source: RealEstateDataSource;
  monthly_rent_synced_at: string | null;
  purchase_price: string | number;
  current_market_value: string | number;
  remaining_mortgage_balance: string | number;
  monthly_rent: string | number;
  monthly_mortgage: string | number;
  annual_expenses: string | number;
  annual_taxes: string | number;
  annual_insurance: string | number;
  annual_maintenance: string | number;
  asset: AssetRow | AssetRow[] | null;
}

interface RealEstatePhotoRow {
  id: string;
  asset_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
}

interface RealEstateExpenseItemRow {
  id: string;
  asset_id: string;
  name: string;
  category: RealEstateExpenseCategory;
  amount: string | number;
  frequency: ExpenseFrequency;
  paid_month: number | null;
  note: string | null;
}

interface RealEstateMetricSnapshotRow {
  id: string;
  asset_id: string;
  metric_type: RealEstateMetricType;
  value: string | number;
  recorded_at: string;
  source: RealEstateDataSource;
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
    currentMarketValueSource: row.current_market_value_source,
    currentMarketValueSyncedAt: row.current_market_value_synced_at,
    monthlyRentSource: row.monthly_rent_source,
    monthlyRentSyncedAt: row.monthly_rent_synced_at,
    purchasePrice: toNumber(row.purchase_price),
    currentMarketValue: toNumber(row.current_market_value),
    remainingMortgageBalance: toNumber(row.remaining_mortgage_balance),
    monthlyRent: toNumber(row.monthly_rent),
    monthlyMortgage: toNumber(row.monthly_mortgage),
    annualExpenses: toNumber(row.annual_expenses),
    annualTaxes: toNumber(row.annual_taxes),
    annualInsurance: toNumber(row.annual_insurance),
    annualMaintenance: toNumber(row.annual_maintenance)
  };
}

function mapExpenseItem(row: RealEstateExpenseItemRow): RealEstateExpenseItem {
  return {
    id: row.id,
    assetId: row.asset_id,
    name: row.name,
    category: row.category,
    amount: toNumber(row.amount),
    frequency: row.frequency,
    paidMonth: row.paid_month,
    note: row.note
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
      current_market_value_source,
      current_market_value_synced_at,
      monthly_rent_source,
      monthly_rent_synced_at,
      purchase_price,
      current_market_value,
      remaining_mortgage_balance,
      monthly_rent,
      monthly_mortgage,
      annual_expenses,
      annual_taxes,
      annual_insurance,
      annual_maintenance,
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

async function getExpenseRows(assetIds: string[]): Promise<RealEstateExpenseItemRow[]> {
  if (assetIds.length === 0) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_expense_items")
    .select("id, asset_id, name, category, amount, frequency, paid_month, note")
    .in("asset_id", assetIds)
    .order("category", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load property expenses: ${error.message}`);
  }

  return (data ?? []) as RealEstateExpenseItemRow[];
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

export async function getRealEstateAssets(): Promise<RealEstateAsset[]> {
  const rows = await getPropertyRows();
  const properties = rows.map(mapRealEstateProperty);
  const expenseRows = await getExpenseRows(properties.map((property) => property.id));
  const expenses = expenseRows.map(mapExpenseItem);

  return properties.map((property) => ({
    ...property,
    expenseItems: expenses.filter((expense) => expense.assetId === property.id)
  }));
}

export async function getRealEstateAssetsWithPhotos(): Promise<RealEstateAssetDetail[]> {
  const rows = await getPropertyRows();
  const properties = rows.map(mapRealEstateProperty);
  const assetIds = properties.map((property) => property.id);
  const [photoRows, expenseRows] = await Promise.all([
    getPhotoRows(assetIds),
    getExpenseRows(assetIds)
  ]);
  const [photos, expenses] = await Promise.all([
    Promise.all(photoRows.map(mapPhoto)),
    Promise.resolve(expenseRows.map(mapExpenseItem))
  ]);

  return properties.map((property) => ({
    ...property,
    photos: photos.filter((photo) => photo.assetId === property.id),
    snapshots: [],
    expenseItems: expenses.filter((expense) => expense.assetId === property.id)
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
  const [photos, snapshots, expenseRows] = await Promise.all([
    Promise.all(photoRows.map(mapPhoto)),
    getSnapshotRows(assetId).then((rows) => rows.map(mapSnapshot)),
    getExpenseRows([assetId])
  ]);

  return {
    ...property,
    expenseItems: expenseRows.map(mapExpenseItem),
    photos,
    snapshots
  };
}
