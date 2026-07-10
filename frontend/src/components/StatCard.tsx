import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatColor = "indigo" | "green" | "amber" | "blue" | "rose";

const colorMap: Record<StatColor, string> = {
  indigo: "bg-primary/10 text-primary",
  green: "bg-emerald-100 text-emerald-600",
  amber: "bg-brand-orange/15 text-orange-600",
  blue: "bg-brand-blue/15 text-blue-600",
  rose: "bg-rose-100 text-rose-600",
};

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color?: StatColor;
}

export const StatCard = ({ icon: Icon, label, value, color = "indigo" }: StatCardProps) => (
  <Card className="transition-shadow hover:shadow-md">
    <CardContent className="flex items-center gap-4 p-6">
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
          colorMap[color]
        )}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
      </div>
    </CardContent>
  </Card>
);
