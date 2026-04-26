import type { ValuationProvider } from "@/types/wealth";

type ConfiguredValuationProvider = "mock" | "rentcast";

export interface PropertyValuationInput {
  assetId: string;
  address: string;
  purchasePrice: number;
  currentMarketValue: number;
}

export interface PropertyValuationResult {
  value: number;
  syncedAt: string;
  source: ValuationProvider;
  note: string;
}

class PropertyValuationProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PropertyValuationProviderError";
  }
}

interface RentCastValueEstimateResponse {
  price?: unknown;
  priceRangeLow?: unknown;
  priceRangeHigh?: unknown;
  comparables?: unknown;
}

const RENTCAST_VALUE_ESTIMATE_URL = "https://api.rentcast.io/v1/avm/value";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

export function getConfiguredPropertyValuationProvider(): ConfiguredValuationProvider {
  const provider = process.env.PROPERTY_VALUATION_PROVIDER?.trim().toLowerCase();

  if (provider === "rentcast" || provider === "provider") {
    return "rentcast";
  }

  if (provider === "mock") {
    return "mock";
  }

  return "mock";
}

function getBaseValue(input: PropertyValuationInput): number {
  if (input.purchasePrice > 0) {
    return input.purchasePrice;
  }

  if (input.currentMarketValue > 0) {
    return input.currentMarketValue;
  }

  return 500000;
}

function hashText(value: string): number {
  return Array.from(value).reduce((total, character) => total + character.charCodeAt(0), 0);
}

function getMockPropertyValue(input: PropertyValuationInput): number {
  const seed = hashText(`${input.assetId}:${input.address}`);
  const multiplier = 0.95 + (seed % 1200) / 10000;

  return Math.max(0, Math.round((getBaseValue(input) * multiplier) / 1000) * 1000);
}

function createMockValuation(input: PropertyValuationInput): PropertyValuationResult {
  return {
    value: getMockPropertyValue(input),
    syncedAt: new Date().toISOString(),
    source: "mock",
    note: "Automated property valuation sync."
  };
}

function createMissingRentCastApiKeyError(): never {
  throw new PropertyValuationProviderError(
    "Property valuation provider is not configured. Add the provider API key to the environment."
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toPositiveInteger(value: unknown): number | null {
  if (!isFiniteNumber(value) || value <= 0) {
    return null;
  }

  return Math.round(value);
}

function getRentCastRequestUrl(input: PropertyValuationInput): URL {
  const url = new URL(RENTCAST_VALUE_ESTIMATE_URL);

  url.searchParams.set("address", input.address);
  url.searchParams.set("compCount", "5");
  url.searchParams.set("lookupSubjectAttributes", "true");
  url.searchParams.set("suppressLogging", "true");

  return url;
}

function getRentCastApiKey(): string {
  const apiKey = process.env.RENTCAST_API_KEY?.trim();

  if (!apiKey) {
    return createMissingRentCastApiKeyError();
  }

  return apiKey;
}

async function getRentCastErrorMessage(response: Response): Promise<string> {
  const fallback = `Property valuation request failed with HTTP ${response.status}.`;

  try {
    const text = await response.text();

    if (!text) {
      return fallback;
    }

    try {
      const body = JSON.parse(text) as { message?: unknown; error?: unknown };
      const message = body.message ?? body.error;

      if (typeof message === "string" && message.trim()) {
        return `Property valuation request failed: ${message.trim()}`;
      }
    } catch {
      return `Property valuation request failed: ${text.slice(0, 240)}`;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function formatUsd(value: number): string {
  return usdFormatter.format(value);
}

function createValuationNote(response: RentCastValueEstimateResponse): string {
  const low = toPositiveInteger(response.priceRangeLow);
  const high = toPositiveInteger(response.priceRangeHigh);
  const comparableCount = Array.isArray(response.comparables)
    ? response.comparables.length
    : null;

  if (low && high && comparableCount) {
    return `Estimated range: ${formatUsd(low)} - ${formatUsd(high)} based on ${comparableCount} comparable sales.`;
  }

  if (low && high) {
    return `Estimated range: ${formatUsd(low)} - ${formatUsd(high)}.`;
  }

  return "Automated property valuation sync.";
}

async function createRentCastValuation(
  input: PropertyValuationInput
): Promise<PropertyValuationResult> {
  const apiKey = getRentCastApiKey();
  let response: Response;

  try {
    response = await fetch(getRentCastRequestUrl(input), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-Api-Key": apiKey
      },
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";

    throw new PropertyValuationProviderError(
      `Property valuation request failed: ${message}`
    );
  }

  if (!response.ok) {
    throw new PropertyValuationProviderError(await getRentCastErrorMessage(response));
  }

  let body: RentCastValueEstimateResponse;

  try {
    body = (await response.json()) as RentCastValueEstimateResponse;
  } catch {
    throw new PropertyValuationProviderError(
      "Property valuation response was not valid JSON."
    );
  }
  const value = toPositiveInteger(body.price);

  if (!value) {
    throw new PropertyValuationProviderError(
      "Property valuation response did not include a valid property value."
    );
  }

  return {
    value,
    syncedAt: new Date().toISOString(),
    source: "provider",
    note: createValuationNote(body)
  };
}

export async function fetchPropertyValuation(
  input: PropertyValuationInput
): Promise<PropertyValuationResult> {
  const provider = getConfiguredPropertyValuationProvider();

  if (provider === "mock") {
    return createMockValuation(input);
  }

  return createRentCastValuation(input);
}
