import { useEffect, useState } from "react";
import { CalendarRange, CalendarClock } from "lucide-react";
import api from "@/lib/api";
import type { PeriodSlot, TimetableSlot } from "@/types";
import { classLabel } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimetableGrid } from "@/components/TimetableGrid";

interface TTItem {
  student: { _id: string; name: string; class: string; section: string; session: string };
  slots: TimetableSlot[];
}
interface ExamPaperRow {
  subjectName: string;
  date: string;
  startTime: string;
  endTime: string;
}
interface ExamItem {
  student: { _id: string; name: string; class: string; section: string };
  exams: { examName: string; papers: ExamPaperRow[] }[];
}

/** Class timetable + exam date sheets for the parent's children. Renders nothing
 *  until the school has actually set them up. */
export function PortalTimetable() {
  const [config, setConfig] = useState<{ periods: PeriodSlot[]; workingDays: number[] }>({
    periods: [],
    workingDays: [1, 2, 3, 4, 5, 6],
  });
  const [items, setItems] = useState<TTItem[]>([]);
  const [examItems, setExamItems] = useState<ExamItem[]>([]);

  useEffect(() => {
    api.get("/portal/timetable").then(({ data }) => {
      setConfig(data.config || { periods: [], workingDays: [1, 2, 3, 4, 5, 6] });
      setItems(data.items || []);
    }).catch(() => {});
    api.get("/portal/exam-timetable").then(({ data }) => setExamItems(data.items || [])).catch(() => {});
  }, []);

  const withTimetable = items.filter((i) => i.slots.length > 0);
  const withExams = examItems.filter((i) => i.exams.some((e) => e.papers.length > 0));

  return (
    <>
      {withTimetable.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <CalendarRange className="h-5 w-5 text-primary" /> Class Timetable
          </h2>
          <div className="space-y-4">
            {withTimetable.map((it) => {
              const lookup: Record<string, TimetableSlot> = {};
              it.slots.forEach((s) => (lookup[`${s.day}_${s.period}`] = s));
              return (
                <Card key={it.student._id}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {it.student.name}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        · {classLabel(it.student.class)}
                        {it.student.section ? `-${it.student.section}` : ""}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4">
                    <TimetableGrid
                      periods={config.periods}
                      workingDays={config.workingDays}
                      cell={(day, period) => {
                        const s = lookup[`${day}_${period}`];
                        return s?.subjectName
                          ? { title: s.subjectName, subtitle: s.teacherName || undefined }
                          : null;
                      }}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {withExams.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <CalendarClock className="h-5 w-5 text-primary" /> Exam Schedule
          </h2>
          <div className="space-y-4">
            {withExams.map((it) => (
              <Card key={it.student._id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {it.student.name}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      · {classLabel(it.student.class)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {it.exams.filter((e) => e.papers.length > 0).map((ex, ei) => (
                    <div key={ei}>
                      <p className="mb-2 font-medium">{ex.examName}</p>
                      <div className="space-y-1.5">
                        {[...ex.papers]
                          .filter((p) => p.date)
                          .sort((a, b) => a.date.localeCompare(b.date))
                          .map((p, pi) => (
                            <div key={pi} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                              <span className="font-medium">{p.subjectName}</span>
                              <span className="text-right text-muted-foreground">
                                <span className="block">
                                  {new Date(`${p.date}T00:00:00`).toLocaleDateString("en-IN", {
                                    weekday: "short", day: "numeric", month: "short",
                                  })}
                                </span>
                                {(p.startTime || p.endTime) && (
                                  <span className="text-xs">{p.startTime}{p.endTime ? `–${p.endTime}` : ""}</span>
                                )}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
