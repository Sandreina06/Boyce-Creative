import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm tabular-nums", className)} {...props} />
    </div>
  );
}
export const THead = ({ className, ...p }: React.ComponentProps<"thead">) => (
  <thead className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...p} />
);
export const TBody = ({ className, ...p }: React.ComponentProps<"tbody">) => (
  <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} />
);
export const TR = ({ className, ...p }: React.ComponentProps<"tr">) => (
  <tr className={cn("border-b border-border/70 transition-colors hover:bg-muted/50", className)} {...p} />
);
export const TH = ({ className, ...p }: React.ComponentProps<"th">) => (
  <th
    className={cn("h-9 whitespace-nowrap px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", className)}
    {...p}
  />
);
export const TD = ({ className, ...p }: React.ComponentProps<"td">) => (
  <td className={cn("whitespace-nowrap px-3 py-2.5 align-middle", className)} {...p} />
);
