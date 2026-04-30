"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Light-weight ScrollArea — uses native scrollbars styled by globals.css
 * rather than pulling in @radix-ui/react-scroll-area, which is fairly
 * heavy. The chat panel and recent-searches list are the only places we
 * need scroll containment, and styled native scrollbars look fine.
 */
function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="scroll-area"
      className={cn("relative overflow-auto", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { ScrollArea };
