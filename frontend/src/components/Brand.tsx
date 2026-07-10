import { cn } from "@/lib/utils";
import { SCHOOL, SCHOOL_MONOGRAM } from "@/lib/school";

const sizes = {
  sm: "h-9 w-9 text-sm rounded-lg",
  md: "h-11 w-11 text-base rounded-xl",
  lg: "h-14 w-14 text-xl rounded-2xl",
};

/** The school crest — a monogram badge. `tone` picks a light or dark backing. */
export function Crest({
  size = "md",
  tone = "brand",
  className,
}: {
  size?: keyof typeof sizes;
  tone?: "brand" | "light" | "onDark";
  className?: string;
}) {
  const tones = {
    brand: "bg-gradient-to-br from-brand-blue to-primary text-white shadow-sm",
    light: "bg-primary/10 text-primary",
    onDark: "bg-white/10 text-white ring-1 ring-white/20",
  };
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center font-heading font-bold tracking-tight",
        sizes[size],
        tones[tone],
        className
      )}
      aria-hidden
    >
      {SCHOOL_MONOGRAM}
    </div>
  );
}

/** Crest + school name lockup used in headers. */
export function BrandMark({
  size = "md",
  tone = "brand",
  subtitle,
  onDark = false,
  className,
}: {
  size?: keyof typeof sizes;
  tone?: "brand" | "light" | "onDark";
  subtitle?: string;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Crest size={size} tone={tone} />
      <div className="leading-tight">
        <div className={cn("font-heading font-bold", onDark ? "text-white" : "text-foreground")}>
          {SCHOOL.name}
        </div>
        <div
          className={cn(
            "text-xs font-medium",
            onDark ? "text-white/60" : "text-muted-foreground"
          )}
        >
          {subtitle ?? SCHOOL.place}
        </div>
      </div>
    </div>
  );
}
