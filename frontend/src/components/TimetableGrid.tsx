import { useState } from "react";
import type { PeriodSlot } from "@/types";
import { WEEKDAYS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface GridCell {
  title: string;
  subtitle?: string;
}

/** ISO weekday for today (1=Mon … 7=Sun) — matches `PeriodSlot`/`workingDays`. */
const todayIso = () => ((new Date().getDay() + 6) % 7) + 1;

/**
 * Read-only weekly timetable. `cell(day, period)` returns what to show in a
 * teaching slot, or null for empty.
 *
 * A full week never fits across a phone, so below `md` this renders one day at a
 * time as a list (opening on today) instead of a table that has to be scrolled
 * sideways. The table is kept for tablets and desktops, where the whole week is
 * genuinely useful at a glance.
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
  const [picked, setPicked] = useState(todayIso);

  if (!periods.length) return <p className="py-10 text-center text-muted-foreground">{emptyText}</p>;

  // `workingDays` arrives after a fetch, so the day picked on first render (today)
  // may not be a working day — fall back rather than showing an empty column.
  const day = days.some((d) => d.value === picked) ? picked : days[0]?.value;

  return (
    <>
      {/* Phones: one day at a time */}
      <div className="md:hidden">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
          {days.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setPicked(d.value)}
              className={cn(
                "shrink-0 touch-manipulation rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
                d.value === day
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-accent"
              )}
            >
              {d.short}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          {periods.map((p) => {
            if (p.isBreak) {
              return (
                <div
                  key={p.period}
                  className="rounded-lg bg-muted/60 py-1.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {p.label}
                </div>
              );
            }
            const c = day ? cell(day, p.period) : null;
            return (
              <div
                key={p.period}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
              >
                <div className="w-16 shrink-0">
                  <p className="text-xs font-semibold">{p.label}</p>
                  {(p.start || p.end) && (
                    <p className="text-[11px] leading-tight text-muted-foreground">
                      {p.start}
                      {p.end ? `–${p.end}` : ""}
                    </p>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {c ? (
                    <>
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      {c.subtitle && (
                        <p className="truncate text-xs text-muted-foreground">{c.subtitle}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground/60">Free</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tablets and up: the whole week */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="p-2 text-left font-semibold">Period</th>
              {days.map((d) => (
                <th key={d.value} className="p-2 text-center font-semibold">
                  {d.short}
                </th>
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
                          {c.subtitle && (
                            <div className="text-xs text-muted-foreground">{c.subtitle}</div>
                          )}
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
    </>
  );
}
