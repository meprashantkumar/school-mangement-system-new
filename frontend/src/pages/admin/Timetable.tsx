import { Link } from "react-router-dom";
import { CalendarRange, UserCog, CalendarClock, ChevronRight } from "lucide-react";

const cards = [
  {
    to: "/admin/timetable/class",
    icon: CalendarRange,
    title: "Class Timetable",
    desc: "Build the weekly timetable for each class & section — subject and teacher per period.",
  },
  {
    to: "/admin/timetable/teacher",
    icon: UserCog,
    title: "Teacher Timetable",
    desc: "See any teacher's weekly schedule, generated automatically from the class timetables.",
  },
  {
    to: "/admin/timetable/exam",
    icon: CalendarClock,
    title: "Exam Timetable",
    desc: "Create the date sheet for an exam — subject, date and time for each paper.",
  },
];

export default function Timetable() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Timetable</h1>
        <p className="text-muted-foreground">
          Class timetables, teacher schedules and exam date sheets — all in one place.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ to, icon: Icon, title, desc }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/50 hover:bg-accent"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" />
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <h2 className="mt-4 font-heading text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
