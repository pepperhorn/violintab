import * as React from "react";
import { cn } from "@/lib/utils";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      data-slot="label"
      className={cn(
        "label text-sm font-medium leading-none flex flex-col gap-1.5 text-foreground",
        className,
      )}
      {...props}
    />
  );
}
