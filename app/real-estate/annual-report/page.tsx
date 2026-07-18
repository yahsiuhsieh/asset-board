import { AnnualReportPreviewPage } from "@/components/real-estate/AnnualReportPreviewPage";
import {
  getDefaultPortfolioAnnualReportYear,
  getPortfolioAnnualQualityResults,
  getPortfolioAnnualReportYears
} from "@/lib/real-estate-annual-quality";
import { normalizeAnnualReportThroughMonth } from "@/lib/real-estate-annual-period";
import { getPortfolioAnnualReportModel } from "@/lib/real-estate-annual-report";
import { getRealEstateAssetsWithCoverPhoto } from "@/lib/real-estate";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{
    throughMonth?: string | string[];
    year?: string | string[];
  }>;
}

function getRequestedYear(
  searchParams?: { year?: string | string[] }
): string | undefined {
  const value = searchParams?.year;

  return Array.isArray(value) ? value[0] : value;
}

function getRequestedThroughMonth(
  searchParams?: { throughMonth?: string | string[] },
  year?: string
): string | undefined {
  const value = searchParams?.throughMonth;
  const throughMonth = Array.isArray(value) ? value[0] : value;

  if (!throughMonth || !year) {
    return undefined;
  }

  try {
    return normalizeAnnualReportThroughMonth(throughMonth, year);
  } catch {
    return undefined;
  }
}

export default async function AnnualReportPage({ searchParams }: PageProps) {
  const properties = await getRealEstateAssetsWithCoverPhoto();
  const resolvedSearchParams = await searchParams;
  const annualReportYears = getPortfolioAnnualReportYears(properties);
  const selectedAnnualReportYear = getDefaultPortfolioAnnualReportYear(
    annualReportYears,
    getRequestedYear(resolvedSearchParams)
  );
  const selectedThroughMonth = getRequestedThroughMonth(
    resolvedSearchParams,
    selectedAnnualReportYear
  );
  const generatedAt = new Date();
  const annualQualityResults = getPortfolioAnnualQualityResults(
    properties,
    selectedAnnualReportYear,
    generatedAt,
    selectedThroughMonth
  );
  const report = getPortfolioAnnualReportModel(
    properties,
    selectedAnnualReportYear,
    annualQualityResults,
    generatedAt,
    selectedThroughMonth
  );

  return (
    <AnnualReportPreviewPage
      annualReportYears={annualReportYears}
      report={report}
    />
  );
}
