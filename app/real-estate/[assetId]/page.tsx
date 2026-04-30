import { notFound } from "next/navigation";

import { PropertyDetailPage } from "@/components/real-estate/PropertyDetailPage";
import { getRealEstateAssetDetail } from "@/lib/real-estate";
import {
  getDefaultPortfolioAnnualReportYear,
  getPortfolioAnnualReportYears,
  getPropertyAnnualQualityResult
} from "@/lib/real-estate-annual-quality";
import { getPropertyValuationUsageStatus } from "@/lib/valuations/property-valuation-usage";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    assetId: string;
  }>;
  searchParams?: Promise<{
    annualReportYear?: string | string[];
  }>;
}

function getRequestedAnnualReportYear(
  searchParams?: { annualReportYear?: string | string[] }
): string | undefined {
  const value = searchParams?.annualReportYear;

  return Array.isArray(value) ? value[0] : value;
}

export default async function RealEstatePropertyPage({
  params,
  searchParams
}: PageProps) {
  const { assetId } = await params;
  const [property, valuationUsage, resolvedSearchParams] = await Promise.all([
    getRealEstateAssetDetail(assetId),
    getPropertyValuationUsageStatus(),
    searchParams
  ]);

  if (!property) {
    notFound();
  }

  const annualReportYears = getPortfolioAnnualReportYears([property]);
  const annualReportYear = getDefaultPortfolioAnnualReportYear(
    annualReportYears,
    getRequestedAnnualReportYear(resolvedSearchParams)
  );
  const annualQualityResult = getPropertyAnnualQualityResult(
    property,
    annualReportYear
  );

  return (
    <PropertyDetailPage
      annualQualityResult={annualQualityResult}
      annualReportYear={annualReportYear}
      annualReportYears={annualReportYears}
      property={property}
      valuationUsage={valuationUsage}
    />
  );
}
