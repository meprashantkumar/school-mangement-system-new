import { useEffect, useState } from "react";
import {
  Users,
  UserPlus,
  UserMinus,
  ArrowUpCircle,
  RotateCcw,
  GraduationCap,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import api from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { CLASSES, classLabel } from "@/lib/constants";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Analytics {
  session: string;
  monthlyCollection: { label: string; amount: number }[];
  stats: {
    totalActive: number;
    newAdmissions: number;
    leftSchool: number;
    promoted: number;
    retained: number;
    graduated: number;
  };
  classDistribution: { class: string; count: number }[];
}

const selectClass = "flex h-10 rounded-md border border-input bg-background px-3 text-sm";

export default function Analytics() {
  const [sessions, setSessions] = useState<string[]>([]);
  const [session, setSession] = useState("");
  const [klass, setKlass] = useState("");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/students/sessions")
      .then(({ data }) => setSessions(data.sessions))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .get("/reports/analytics", {
        params: { session: session || undefined, class: klass || undefined },
      })
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session, klass]);

  const dist = (data?.classDistribution || []).map((d) => ({ ...d, label: classLabel(d.class) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Collections and student movement{data ? ` for ${data.session}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className={selectClass}
            value={session}
            onChange={(e) => setSession(e.target.value)}
          >
            <option value="">Latest session</option>
            {sessions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select className={selectClass} value={klass} onChange={(e) => setKlass(e.target.value)}>
            <option value="">All classes</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {classLabel(c)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Users} label="Active students" value={data?.stats.totalActive ?? 0} color="indigo" />
        <StatCard icon={UserPlus} label="New admissions" value={data?.stats.newAdmissions ?? 0} color="green" />
        <StatCard icon={ArrowUpCircle} label="Passed (promoted)" value={data?.stats.promoted ?? 0} color="blue" />
        <StatCard icon={RotateCcw} label="Failed (retained)" value={data?.stats.retained ?? 0} color="amber" />
        <StatCard icon={UserMinus} label="Left school" value={data?.stats.leftSchool ?? 0} color="rose" />
        <StatCard icon={GraduationCap} label="Graduated" value={data?.stats.graduated ?? 0} color="indigo" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly collection</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-20 text-center text-muted-foreground">Loading…</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data?.monthlyCollection || []} margin={{ top: 8, right: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f4" />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                    tickFormatter={(v) => formatINR(Number(v))}
                  />
                  <Tooltip formatter={(v) => formatINR(Number(v))} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="amount" name="Collected" fill="#5996FF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Students per class</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-20 text-center text-muted-foreground">Loading…</p>
            ) : dist.length === 0 ? (
              <p className="py-20 text-center text-muted-foreground">No students yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dist} margin={{ top: 8, right: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f4" />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="count" name="Students" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
