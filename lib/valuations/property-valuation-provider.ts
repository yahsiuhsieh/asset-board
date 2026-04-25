import type { ValuationProvider } from "@/types/wealth";

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

function getConfiguredProvider(): ValuationProvider {
  const provider = process.env.PROPERTY_VALUATION_PROVIDER?.trim().toLowerCase();
  const supportedProviders: ValuationProvider[] = ["mock", "provider"];

  if (provider && supportedProviders.includes(provider as ValuationProvider)) {
    return provider as ValuationProvider;
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
    note: "Mock property valuation sync"
  };
}

function createUnconfiguredProviderError(provider: ValuationProvider): never {
  throw new PropertyValuationProviderError(
    `${provider} property valuation is not configured yet.`
  );
}

export async function fetchPropertyValuation(
  input: PropertyValuationInput
): Promise<PropertyValuationResult> {
  const provider = getConfiguredProvider();

  if (provider === "mock") {
    return createMockValuation(input);
  }

  return createUnconfiguredProviderError(provider);
}
