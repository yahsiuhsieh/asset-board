import Image from "next/image";
import { Building2 } from "lucide-react";

interface PropertyImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
}

export function PropertyImage({ src, alt, className, priority }: PropertyImageProps) {
  if (!src) {
    return (
      <div className={className}>
        <div className="flex h-full min-h-[12rem] items-center justify-center rounded-md bg-secondary text-muted-foreground">
          <Building2 className="h-10 w-10" />
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Image
        alt={alt}
        className="rounded-md object-cover"
        fill
        priority={priority}
        sizes="(min-width: 1024px) 45vw, 100vw"
        src={src}
      />
    </div>
  );
}
