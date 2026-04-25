import { RealEstateListPage } from "@/components/real-estate/RealEstateListPage";
import { getRealEstateAssetsWithPhotos } from "@/lib/real-estate";

export const dynamic = "force-dynamic";

export default async function RealEstatePage() {
  const properties = await getRealEstateAssetsWithPhotos();

  return <RealEstateListPage properties={properties} />;
}
