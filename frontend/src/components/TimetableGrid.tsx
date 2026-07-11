import type { PeriodSlot } from "@/types";
import { WEEKDAYS } from "@/lib/constants";

export interface GridCell {
  title: string;
  subtitle?: string;
}

/**
 * Read-only weekly timetable grid. `cell(day, period)` returns what to show in a
 * teaching slot, or null for empty. Break periods render as a full-width band.
 */
export function TimetableGrid({
  periods,
  workingDays,
  cell,
  emptyText = "No timetable set yet.",
}: {
  periods: PeriodSlot[];
  workingDays: number[];
  cell: (day: number, period: number) => GridCell | null;
  emptyText?: string;
}) {
  const days = WEEKDAYS.filter((w) => workingDays.includes(w.value));
  if (!periods.length) return <p className="py-10 text-center text-muted-foreground">{emptyText}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="p-2 text-left font-semibold">Period</th>
            {days.map((d) => (
              <th key={d.value} className="p-2 text-center font-semibold">{d.short}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.period} className="border-b last:border-0">
              <td className="whitespace-nowrap p-2 align-top font-medium">{p.label}</td>
              {days.map((d) => {
                const c = cell(d.value, p.period);
                return (
                  <td key={d.value} className="p-2 text-center align-top">
                    {c ? (
                      <>
                        <div className="font-medium">{c.title}</div>
                        {c.subtitle && <div className="text-xs text-muted-foreground">{c.subtitle}</div>}
                      </>
                    ) : (
                      <span className="text-muted-foreground/40">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
