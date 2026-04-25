import { OverviewDashboard } from "@/components/dashboard/OverviewDashboard";
import { getRealEstateAssetsWithPhotos } from "@/lib/real-estate";

export const dynamic = "force-dynamic";

export default async function Home() {
  const realEstateAssets = await getRealEstateAssetsWithPhotos();

  return <OverviewDashboard assets={realEstateAssets} />;
}
