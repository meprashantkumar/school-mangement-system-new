import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  unpaid: "bg-rose-100 text-rose-700",
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-600",
  left: "bg-orange-100 text-orange-700",
  default: "bg-secondary text-secondary-foreground",
};

export function Badge({
  status,
  className,
  children,
}: {
  status?: string;
  className?: string;
  children?: ReactNode;
}) {
  const key = status && status in styles ? status : "default";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        styles[key],
        className
      )}
    >
      {children ?? status ?? "—"}
    </span>
  );
}
