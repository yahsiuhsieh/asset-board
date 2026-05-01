import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConfiguredPropertyValuationProvider } from "@/lib/valuations/property-valuation-provider";

export const PROPERTY_VALUATION_MONTHLY_USAGE_LIMIT = 40;

export interface PropertyValuationUsageStatus {
  isLiveProvider: boolean;
  isTrackingAvailable: boolean;
  isLimitReached: boolean;
  used: number;
  limit: number;
  remaining: number;
  message: string | null;
}

interface MonthWindow {
  start: string;
  end: string;
}

interface PropertyValuationUsageRow {
  asset_id: string;
  current_market_value_live_sync_count: number | string | null;
  current_market_value_live_synced_at: string | null;
}

function getCurrentMonthWindow(now = new Date()): MonthWindow {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

function isInMonth(value: string | null, month: MonthWindow): boolean {
  if (!value) {
    return false;
  }

  return value >= month.start && value < month.end;
}

function getMonthlyUsageCount(row: PropertyValuationUsageRow, month: MonthWindow): number {
  if (!isInMonth(row.current_market_value_live_synced_at, month)) {
    return 0;
  }

  return Number(row.current_market_value_live_sync_count) || 0;
}

function getMockUsageStatus(): PropertyValuationUsageStatus {
  return {
    isLiveProvider: false,
    isTrackingAvailable: true,
    isLimitReached: false,
    used: 0,
    limit: PROPERTY_VALUATION_MONTHLY_USAGE_LIMIT,
    remaining: PROPERTY_VALUATION_MONTHLY_USAGE_LIMIT,
    message: null
  };
}

function getUnavailableUsageStatus(message: string): PropertyValuationUsageStatus {
  return {
    isLiveProvider: true,
    isTrackingAvailable: false,
    isLimitReached: true,
    used: 0,
    limit: PROPERTY_VALUATION_MONTHLY_USAGE_LIMIT,
    remaining: 0,
    message
  };
}

export async function getPropertyValuationUsageStatus(): Promise<PropertyValuationUsageStatus> {
  const provider = getConfiguredPropertyValuationProvider();

  if (provider === "mock") {
    return getMockUsageStatus();
  }

  if (!provider) {
    return getUnavailableUsageStatus(
      "Property valuation provider is not configured. Configure RentCast before syncing property value."
    );
  }

  const supabase = createServerSupabaseClient();
  const month = getCurrentMonthWindow();
  const { data, error } = await supabase
    .from("real_estate_properties")
    .select(
      "asset_id, current_market_value_live_sync_count, current_market_value_live_synced_at"
    );

  if (error) {
    return getUnavailableUsageStatus(
      "Usage tracking is unavailable. Run the latest Supabase migration before live valuation sync."
    );
  }

  const used = ((data ?? []) as PropertyValuationUsageRow[]).reduce(
    (total, row) => total + getMonthlyUsageCount(row, month),
    0
  );
  const remaining = Math.max(PROPERTY_VALUATION_MONTHLY_USAGE_LIMIT - used, 0);

  return {
    isLiveProvider: true,
    isTrackingAvailable: true,
    isLimitReached: used >= PROPERTY_VALUATION_MONTHLY_USAGE_LIMIT,
    used,
    limit: PROPERTY_VALUATION_MONTHLY_USAGE_LIMIT,
    remaining,
    message:
      used >= PROPERTY_VALUATION_MONTHLY_USAGE_LIMIT
        ? "Monthly live valuation limit reached."
        : null
  };
}

export async function recordPropertyValuationUsage(assetId: string, syncedAt: string) {
  const supabase = createServerSupabaseClient();
  const month = getCurrentMonthWindow(new Date(syncedAt));
  const { data, error: loadError } = await supabase
    .from("real_estate_properties")
    .select("asset_id, current_market_value_live_sync_count, current_market_value_live_synced_at")
    .eq("asset_id", assetId)
    .single();

  if (loadError) {
    throw new Error(`Could not load valuation usage: ${loadError.message}`);
  }

  const usageRow = data as PropertyValuationUsageRow;
  const currentCount = getMonthlyUsageCount(usageRow, month);
  const { error: updateError } = await supabase
    .from("real_estate_properties")
    .update({
      current_market_value_live_sync_count: currentCount + 1,
      current_market_value_live_synced_at: syncedAt
    })
    .eq("asset_id", assetId);

  if (updateError) {
    throw new Error(`Could not record valuation usage: ${updateError.message}`);
  }
}
