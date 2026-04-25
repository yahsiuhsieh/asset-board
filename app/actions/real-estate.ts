"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { snapshotMetricLabels } from "@/lib/real-estate-history";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchPropertyValuation } from "@/lib/valuations/property-valuation-provider";
import type {
  ExpenseFrequency,
  RealEstateExpenseCategory,
  RealEstateMetricType,
  ValuationProvider
} from "@/types/wealth";

const PROPERTY_PHOTO_BUCKET = "property-photos";
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export interface RealEstateActionState {
  status: "idle" | "success" | "error";
  message: string;
}

const successState = (message: string): RealEstateActionState => ({
  status: "success",
  message
});

const errorState = (message: string): RealEstateActionState => ({
  status: "error",
  message
});

function revalidatePropertyPages(assetId?: string) {
  revalidatePath("/");
  revalidatePath("/real-estate");

  if (assetId) {
    revalidatePath(`/real-estate/${assetId}`);
  }
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readMoney(formData: FormData, key: string): number {
  const rawValue = readText(formData, key);

  if (!rawValue) {
    return 0;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${key} must be a positive number.`);
  }

  return value;
}

function readOptionalNumber(formData: FormData, key: string): number | null {
  const rawValue = readText(formData, key);

  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a number.`);
  }

  return value;
}

function readCoordinate(formData: FormData, key: string): number | null {
  const rawValue = readText(formData, key).replace(",", ".");

  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a number.`);
  }

  return value;
}

function readMapZoom(formData: FormData): number {
  const value = readOptionalNumber(formData, "mapZoom");

  if (value == null) {
    return 12;
  }

  if (value < 1 || value > 20) {
    throw new Error("mapZoom must be between 1 and 20.");
  }

  return Math.round(value);
}

function readPropertyPayload(formData: FormData) {
  const name = readText(formData, "name");
  const address = readText(formData, "address");

  if (!name) {
    throw new Error("Property name is required.");
  }

  if (!address) {
    throw new Error("Address is required.");
  }

  const now = new Date().toISOString();
  const purchasePrice = readMoney(formData, "purchasePrice");

  return {
    asset: {
      name,
      type: "real_estate",
      updated_at: now
    },
    property: {
      address,
      monthly_rent_source: "manual",
      purchase_price: purchasePrice,
      remaining_mortgage_balance: readMoney(formData, "remainingMortgageBalance"),
      monthly_rent: readMoney(formData, "monthlyRent"),
      monthly_mortgage: readMoney(formData, "monthlyMortgage"),
      annual_expenses: readMoney(formData, "annualExpenses"),
      annual_taxes: readMoney(formData, "annualTaxes"),
      annual_insurance: readMoney(formData, "annualInsurance"),
      annual_maintenance: readMoney(formData, "annualMaintenance"),
      updated_at: now
    }
  };
}

interface PropertyValuationRow {
  address: string;
  current_market_value: string | number;
  purchase_price: string | number;
}

async function loadPropertyValuationInput(assetId: string): Promise<PropertyValuationRow> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_properties")
    .select("address, current_market_value, purchase_price")
    .eq("asset_id", assetId)
    .single();

  if (error) {
    throw new Error(`Could not load valuation: ${error.message}`);
  }

  return data as PropertyValuationRow;
}

async function savePropertyValuation(
  assetId: string,
  currentMarketValue: number,
  syncedAt: string,
  source: ValuationProvider
) {
  const supabase = createServerSupabaseClient();

  const { error: propertyError } = await supabase
    .from("real_estate_properties")
    .update({
      current_market_value: currentMarketValue,
      current_market_value_source: source,
      current_market_value_synced_at: syncedAt,
      updated_at: syncedAt
    })
    .eq("asset_id", assetId);

  if (propertyError) {
    throw new Error(`Could not save valuation: ${propertyError.message}`);
  }

  const { error: assetError } = await supabase
    .from("assets")
    .update({
      value: currentMarketValue,
      updated_at: syncedAt
    })
    .eq("id", assetId);

  if (assetError) {
    throw new Error(`Could not update asset value: ${assetError.message}`);
  }

  return currentMarketValue;
}

function readExpenseCategory(formData: FormData): RealEstateExpenseCategory {
  const category = readText(formData, "category") as RealEstateExpenseCategory;
  const supportedCategories: RealEstateExpenseCategory[] = [
    "taxes",
    "insurance",
    "maintenance",
    "hoa",
    "utilities",
    "other"
  ];

  if (!supportedCategories.includes(category)) {
    throw new Error("Choose a supported expense category.");
  }

  return category;
}

function readExpenseFrequency(formData: FormData): ExpenseFrequency {
  const frequency = readText(formData, "frequency") as ExpenseFrequency;
  const supportedFrequencies: ExpenseFrequency[] = [
    "monthly",
    "quarterly",
    "semiannual",
    "annual"
  ];

  if (!supportedFrequencies.includes(frequency)) {
    throw new Error("Choose a supported expense frequency.");
  }

  return frequency;
}

function readPaidMonth(formData: FormData): number | null {
  const paidMonth = readOptionalNumber(formData, "paidMonth");

  if (paidMonth == null) {
    return null;
  }

  if (paidMonth < 1 || paidMonth > 12) {
    throw new Error("Paid month must be between 1 and 12.");
  }

  return Math.round(paidMonth);
}

export async function createRealEstateProperty(
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  try {
    const payload = readPropertyPayload(formData);
    const supabase = createServerSupabaseClient();

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .insert({
        ...payload.asset,
        value: 0
      })
      .select("id")
      .single();

    if (assetError) {
      return errorState(`Could not create asset: ${assetError.message}`);
    }

    const { error: propertyError } = await supabase.from("real_estate_properties").insert({
      ...payload.property,
      current_market_value: 0,
      current_market_value_source: "mock",
      asset_id: asset.id
    });

    if (propertyError) {
      await supabase.from("assets").delete().eq("id", asset.id);
      return errorState(`Could not create property: ${propertyError.message}`);
    }

    revalidatePropertyPages(asset.id);
    return successState("Property added.");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not create property.");
  }
}

export async function updateRealEstateProperty(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  try {
    const payload = readPropertyPayload(formData);
    const supabase = createServerSupabaseClient();

    const { error: assetError } = await supabase
      .from("assets")
      .update(payload.asset)
      .eq("id", assetId);

    if (assetError) {
      return errorState(`Could not update asset: ${assetError.message}`);
    }

    const { data: updatedProperty, error: propertyError } = await supabase
      .from("real_estate_properties")
      .update(payload.property)
      .eq("asset_id", assetId)
      .select("asset_id")
      .single();

    if (propertyError) {
      return errorState(`Could not update property: ${propertyError.message}`);
    }

    if (!updatedProperty) {
      return errorState("Could not update property: no matching property was found.");
    }

    revalidatePropertyPages(assetId);
    return successState("Property updated.");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not update property.");
  }
}

export async function deleteRealEstateProperty(formData: FormData) {
  const assetId = readText(formData, "assetId");

  if (!assetId) {
    throw new Error("Missing property asset id.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("assets").delete().eq("id", assetId);

  if (error) {
    throw new Error(`Could not delete property: ${error.message}`);
  }

  revalidatePropertyPages(assetId);
}

export async function updatePropertyLocation(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  try {
    const latitude = readCoordinate(formData, "latitude");
    const longitude = readCoordinate(formData, "longitude");

    if (latitude != null && (latitude < -90 || latitude > 90)) {
      throw new Error("Latitude must be between -90 and 90.");
    }

    if (longitude != null && (longitude < -180 || longitude > 180)) {
      throw new Error("Longitude must be between -180 and 180.");
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("real_estate_properties")
      .update({
        latitude,
        longitude,
        map_zoom: readMapZoom(formData),
        updated_at: new Date().toISOString()
      })
      .eq("asset_id", assetId)
      .select("asset_id, latitude, longitude, map_zoom")
      .single();

    if (error) {
      return errorState(`Could not update location: ${error.message}`);
    }

    if (!data) {
      return errorState("Could not update location: no matching property was found.");
    }

    revalidatePropertyPages(assetId);
    return successState("Location updated.");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not update location.");
  }
}

export async function syncPropertyValuation(
  assetId: string,
  _previousState: RealEstateActionState,
  _formData: FormData
): Promise<RealEstateActionState> {
  void _previousState;
  void _formData;

  try {
    const property = await loadPropertyValuationInput(assetId);
    const valuation = await fetchPropertyValuation({
      assetId,
      address: property.address,
      purchasePrice: Number(property.purchase_price),
      currentMarketValue: Number(property.current_market_value)
    });

    await savePropertyValuation(assetId, valuation.value, valuation.syncedAt, valuation.source);
    const supabase = createServerSupabaseClient();

    const { error: snapshotError } = await supabase.from("real_estate_metric_snapshots").upsert(
      {
        asset_id: assetId,
        metric_type: "current_market_value",
        value: valuation.value,
        recorded_at: valuation.syncedAt.slice(0, 10),
        source: valuation.source,
        note: valuation.note
      },
      {
        onConflict: "asset_id,metric_type,recorded_at"
      }
    );

    if (snapshotError) {
      return errorState(`Property value synced, but snapshot failed: ${snapshotError.message}`);
    }

    revalidatePropertyPages(assetId);
    return successState(
      valuation.source === "mock"
        ? "Mock property value synced. Choose a valuation provider for live data."
        : "Property value synced."
    );
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not sync property value.");
  }
}

function getPhotoFile(formData: FormData): File {
  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a photo to upload.");
  }

  if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
    throw new Error("Photo must be JPEG, PNG, WebP, or GIF.");
  }

  if (file.size > MAX_PHOTO_SIZE) {
    throw new Error("Photo must be 10 MB or smaller.");
  }

  return file;
}

function getSafeFileName(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
  return `${randomUUID()}.${extension.replace(/[^a-z0-9]/g, "") || "jpg"}`;
}

export async function uploadPropertyPhoto(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  try {
    const file = getPhotoFile(formData);
    const caption = readText(formData, "caption") || null;
    const storagePath = `${assetId}/${getSafeFileName(file.name)}`;
    const supabase = createServerSupabaseClient();

    const { error: uploadError } = await supabase.storage
      .from(PROPERTY_PHOTO_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      return errorState(`Could not upload photo: ${uploadError.message}`);
    }

    const { count } = await supabase
      .from("real_estate_photos")
      .select("id", { count: "exact", head: true })
      .eq("asset_id", assetId);

    const { error: insertError } = await supabase.from("real_estate_photos").insert({
      asset_id: assetId,
      storage_path: storagePath,
      caption,
      sort_order: count ?? 0,
      is_cover: (count ?? 0) === 0
    });

    if (insertError) {
      await supabase.storage.from(PROPERTY_PHOTO_BUCKET).remove([storagePath]);
      return errorState(`Could not save photo: ${insertError.message}`);
    }

    revalidatePropertyPages(assetId);
    return successState("Photo uploaded.");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not upload photo.");
  }
}

export async function deletePropertyPhoto(formData: FormData) {
  const assetId = readText(formData, "assetId");
  const photoId = readText(formData, "photoId");
  const storagePath = readText(formData, "storagePath");

  if (!assetId || !photoId || !storagePath) {
    throw new Error("Missing photo information.");
  }

  const supabase = createServerSupabaseClient();
  const { error: deleteError } = await supabase
    .from("real_estate_photos")
    .delete()
    .eq("id", photoId);

  if (deleteError) {
    throw new Error(`Could not delete photo: ${deleteError.message}`);
  }

  await supabase.storage.from(PROPERTY_PHOTO_BUCKET).remove([storagePath]);
  revalidatePropertyPages(assetId);
}

export async function setCoverPhoto(formData: FormData) {
  const assetId = readText(formData, "assetId");
  const photoId = readText(formData, "photoId");

  if (!assetId || !photoId) {
    throw new Error("Missing photo information.");
  }

  const supabase = createServerSupabaseClient();
  const { error: resetError } = await supabase
    .from("real_estate_photos")
    .update({ is_cover: false })
    .eq("asset_id", assetId);

  if (resetError) {
    throw new Error(`Could not update cover photo: ${resetError.message}`);
  }

  const { error: coverError } = await supabase
    .from("real_estate_photos")
    .update({ is_cover: true })
    .eq("id", photoId);

  if (coverError) {
    throw new Error(`Could not update cover photo: ${coverError.message}`);
  }

  revalidatePropertyPages(assetId);
}

function readMetricType(formData: FormData): RealEstateMetricType {
  const metricType = readText(formData, "metricType") as RealEstateMetricType;

  if (!Object.keys(snapshotMetricLabels).includes(metricType)) {
    throw new Error("Choose a supported metric.");
  }

  return metricType;
}

export async function addMetricSnapshot(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  try {
    const metricType = readMetricType(formData);
    const recordedAt = readText(formData, "recordedAt");
    const note = readText(formData, "note") || null;

    if (!recordedAt) {
      throw new Error("Snapshot date is required.");
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("real_estate_metric_snapshots").upsert(
      {
        asset_id: assetId,
        metric_type: metricType,
        value: readMoney(formData, "value"),
        recorded_at: recordedAt,
        source: "manual",
        note
      },
      {
        onConflict: "asset_id,metric_type,recorded_at"
      }
    );

    if (error) {
      return errorState(`Could not save snapshot: ${error.message}`);
    }

    revalidatePropertyPages(assetId);
    return successState("Snapshot saved.");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not save snapshot.");
  }
}

export async function deleteMetricSnapshot(formData: FormData) {
  const assetId = readText(formData, "assetId");
  const snapshotId = readText(formData, "snapshotId");

  if (!assetId || !snapshotId) {
    throw new Error("Missing snapshot information.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("real_estate_metric_snapshots")
    .delete()
    .eq("id", snapshotId);

  if (error) {
    throw new Error(`Could not delete snapshot: ${error.message}`);
  }

  revalidatePropertyPages(assetId);
}

export async function addExpenseItem(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  try {
    const name = readText(formData, "name");
    const note = readText(formData, "note") || null;

    if (!name) {
      throw new Error("Expense name is required.");
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("real_estate_expense_items").insert({
      asset_id: assetId,
      name,
      category: readExpenseCategory(formData),
      amount: readMoney(formData, "amount"),
      frequency: readExpenseFrequency(formData),
      paid_month: readPaidMonth(formData),
      note
    });

    if (error) {
      return errorState(`Could not save expense: ${error.message}`);
    }

    revalidatePropertyPages(assetId);
    return successState("Expense saved.");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not save expense.");
  }
}

export async function deleteExpenseItem(formData: FormData) {
  const assetId = readText(formData, "assetId");
  const expenseId = readText(formData, "expenseId");

  if (!assetId || !expenseId) {
    throw new Error("Missing expense information.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("real_estate_expense_items")
    .delete()
    .eq("id", expenseId);

  if (error) {
    throw new Error(`Could not delete expense: ${error.message}`);
  }

  revalidatePropertyPages(assetId);
}
