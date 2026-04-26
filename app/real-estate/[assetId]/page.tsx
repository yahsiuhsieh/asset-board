import { notFound } from "next/navigation";

import { PropertyDetailPage } from "@/components/real-estate/PropertyDetailPage";
import { getRealEstateAssetDetail } from "@/lib/real-estate";
import { getPropertyValuationUsageStatus } from "@/lib/valuations/property-valuation-usage";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    assetId: string;
  }>;
}

export default async function RealEstatePropertyPage({ params }: PageProps) {
  const { assetId } = await params;
  const [property, valuationUsage] = await Promise.all([
    getRealEstateAssetDetail(assetId),
    getPropertyValuationUsageStatus()
  ]);

  if (!property) {
    notFound();
  }

  return <PropertyDetailPage property={property} valuationUsage={valuationUsage} />;
}
