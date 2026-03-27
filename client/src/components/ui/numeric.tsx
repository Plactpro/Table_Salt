import React from "react";

/**
 * RTL-safe numeric wrapper.
 * Wraps numeric content (currency, percentages, ticket IDs, times)
 * in a dir="ltr" span so they always render left-to-right even
 * when the UI is in Arabic RTL mode.
 *
 * Usage:
 *   import { Numeric } from "@/components/ui/numeric";
 *   <Numeric>{fmt(total)}</Numeric>
 */
export function Numeric({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { children: React.ReactNode }) {
  return (
    <span dir="ltr" className={className} {...props}>
      {children}
    </span>
  );
}
