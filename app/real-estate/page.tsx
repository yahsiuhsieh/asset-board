import { RealEstateListPage } from "@/components/real-estate/RealEstateListPage";
import {
  getDefaultPortfolioAnnualReportYear,
  getPortfolioAnnualQualityResults,
  getPortfolioAnnualReportYears
} from "@/lib/real-estate-annual-quality";
import { getRealEstateAssetsWithPhotos } from "@/lib/real-estate";

export const dynamic = "force-dynamic";

interface PageProps {
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

export default async function RealEstatePage({ searchParams }: PageProps) {
  const properties = await getRealEstateAssetsWithPhotos();
  const resolvedSearchParams = await searchParams;
  const annualReportYears = getPortfolioAnnualReportYears(properties);
  const selectedAnnualReportYear = getDefaultPortfolioAnnualReportYear(
    annualReportYears,
    getRequestedAnnualReportYear(resolvedSearchParams)
  );
  const annualQualityResults = getPortfolioAnnualQualityResults(
    properties,
    selectedAnnualReportYear
  );

  return (
    <RealEstateListPage
      annualQualityResults={annualQualityResults}
      annualReportYear={selectedAnnualReportYear}
      annualReportYears={annualReportYears}
      properties={properties}
    />
  );
}
