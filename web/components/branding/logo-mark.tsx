import Image from "next/image";
import { APP_LOGO_PATH } from "@/lib/app-logo";
import { cn } from "@/lib/utils";

type LogoMarkProps = {
  className?: string;
};

/** Brand mark (JPEG) beside the ApplyPanda wordmark. */
export function LogoMark({ className }: LogoMarkProps) {
  return (
    <div
      className={cn(
        "relative h-8 w-8 shrink-0 rounded-md overflow-hidden ring-1 ring-border/60 bg-muted",
        className,
      )}
      aria-hidden
    >
      <Image
        src={APP_LOGO_PATH}
        alt=""
        fill
        sizes="32px"
        className="object-cover"
        priority
      />
    </div>
  );
}
