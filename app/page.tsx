import { OverviewDashboard } from "@/components/dashboard/OverviewDashboard";
import { getRealEstateAssetsWithCoverPhoto } from "@/lib/real-estate";

export const dynamic = "force-dynamic";

export default async function Home() {
  const realEstateAssets = await getRealEstateAssetsWithCoverPhoto();

  return <OverviewDashboard assets={realEstateAssets} />;
}
