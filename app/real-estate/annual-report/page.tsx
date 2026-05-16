import { AnnualReportPreviewPage } from "@/components/real-estate/AnnualReportPreviewPage";
import {
  getDefaultPortfolioAnnualReportYear,
  getPortfolioAnnualQualityResults,
  getPortfolioAnnualReportYears
} from "@/lib/real-estate-annual-quality";
import { getPortfolioAnnualReportModel } from "@/lib/real-estate-annual-report";
import { getRealEstateAssetsWithPhotos } from "@/lib/real-estate";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{
    year?: string | string[];
  }>;
}

function getRequestedYear(
  searchParams?: { year?: string | string[] }
): string | undefined {
  const value = searchParams?.year;

  return Array.isArray(value) ? value[0] : value;
}

export default async function AnnualReportPage({ searchParams }: PageProps) {
  const properties = await getRealEstateAssetsWithPhotos();
  const resolvedSearchParams = await searchParams;
  const annualReportYears = getPortfolioAnnualReportYears(properties);
  const selectedAnnualReportYear = getDefaultPortfolioAnnualReportYear(
    annualReportYears,
    getRequestedYear(resolvedSearchParams)
  );
  const annualQualityResults = getPortfolioAnnualQualityResults(
    properties,
    selectedAnnualReportYear
  );
  const report = getPortfolioAnnualReportModel(
    properties,
    selectedAnnualReportYear,
    annualQualityResults
  );

  return (
    <AnnualReportPreviewPage
      annualReportYears={annualReportYears}
      report={report}
    />
  );
}
