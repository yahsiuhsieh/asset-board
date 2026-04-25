import type { RealEstateAsset } from "@/types/wealth";

export function getExternalMapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function getStaticMapUrl(
  property: Pick<RealEstateAsset, "latitude" | "longitude" | "mapZoom">,
  size = { width: 640, height: 360 }
): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!token || property.latitude == null || property.longitude == null) {
    return null;
  }

  const longitude = property.longitude.toFixed(6);
  const latitude = property.latitude.toFixed(6);
  const zoom = property.mapZoom || 12;
  const marker = encodeURIComponent(`pin-s+635bff(${longitude},${latitude})`);

  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${longitude},${latitude},${zoom},0/${size.width}x${size.height}@2x?access_token=${token}`;
}
