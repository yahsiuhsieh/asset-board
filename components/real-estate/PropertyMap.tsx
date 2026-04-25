import Image from "next/image";
import { MapPin } from "lucide-react";

import { getExternalMapUrl, getStaticMapUrl } from "@/lib/maps";
import type { RealEstateAsset } from "@/types/wealth";

interface PropertyMapProps {
  property: RealEstateAsset;
  className?: string;
}

export function PropertyMap({ property, className }: PropertyMapProps) {
  const mapUrl = getStaticMapUrl(property);
  const externalMapUrl = getExternalMapUrl(property.address);

  if (!mapUrl) {
    return (
      <a
        className={className}
        href={externalMapUrl}
        rel="noreferrer"
        target="_blank"
      >
        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-md border border-slate-200 bg-secondary p-6 text-center text-sm text-muted-foreground">
          <MapPin className="h-8 w-8 text-primary" />
          <span>{property.address}</span>
        </div>
      </a>
    );
  }

  return (
    <a className={className} href={externalMapUrl} rel="noreferrer" target="_blank">
      <div className="relative min-h-[12rem] overflow-hidden rounded-md border border-slate-200 bg-secondary">
        <Image
          alt={`Map showing ${property.name}`}
          className="object-cover"
          fill
          sizes="(min-width: 1024px) 40vw, 100vw"
          src={mapUrl}
        />
      </div>
    </a>
  );
}
