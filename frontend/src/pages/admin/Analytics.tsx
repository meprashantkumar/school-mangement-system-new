import { useEffect, useState } from "react";
import {
  Users,
  UserPlus,
  UserMinus,
  ArrowUpCircle,
  RotateCcw,
  GraduationCap,
  Receipt,
  Wallet,
  AlertTriangle,
  Percent,
  Globe,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
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
  collections: {
    billed: number;
    collected: number;
    outstanding: number;
    concessions: number;
    collectionRate: number;
    byMode: { cash: number; cheque: number; upi: number; online: number };
    online: { count: number; amount: number; convenienceFee: number };
    counter: { count: number; amount: number };
    defaulters: { students: number; amount: number; oldestDueDate: string | null };
    classOutstanding: { class: string; outstanding: number }[];
  };
}

const selectClass = "flex h-10 rounded-md border border-input bg-background px-3 text-sm";

// Colours for the payment-mode donut, keyed by slice name.
const MODE_COLORS: Record<string, string> = {
  Cash: "#10b981",
  Cheque: "#f59e0b",
  "UPI (QR)": "#5996FF",
  Online: "#8b5cf6",
};

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

  const col = data?.collections;
  const modeData = col
    ? [
        { name: "Cash", value: col.byMode.cash },
        { name: "Cheque", value: col.byMode.cheque },
        { name: "UPI (QR)", value: col.byMode.upi },
        { name: "Online", value: col.byMode.online },
      ].filter((d) => d.value > 0)
    : [];
  const classOut = (col?.classOutstanding || []).map((d) => ({
    ...d,
    label: classLabel(d.class),
  }));

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

      {/* Collections — the money view */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Collections</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={Receipt} label="Total billed" value={formatINR(col?.billed ?? 0)} color="indigo" />
          <StatCard icon={Wallet} label="Collected" value={formatINR(col?.collected ?? 0)} color="green" />
          <StatCard icon={AlertTriangle} label="Outstanding" value={formatINR(col?.outstanding ?? 0)} color="rose" />
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <p className="truncate text-sm text-muted-foreground">Collection rate</p>
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-1 text-2xl font-bold tracking-tight">{col?.collectionRate ?? 0}%</p>
              <div className="mt-2 h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, col?.collectionRate ?? 0)}%` }}
                />
              </div>
            </CardContent>
          </Card>
          <StatCard icon={Percent} label="Concessions given" value={formatINR(col?.concessions ?? 0)} color="amber" />
          <StatCard icon={Globe} label="Online fee earned" value={formatINR(col?.online.convenienceFee ?? 0)} color="blue" />
        </div>

        {col && col.defaulters.students > 0 && (
          <Card className="border-rose-200 bg-rose-50">
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 p-4 text-sm">
              <span className="flex items-center gap-2 font-medium text-rose-700">
                <AlertTriangle className="h-4 w-4" />
                {col.defaulters.students} student{col.defaulters.students > 1 ? "s" : ""} with pending dues
              </span>
              <span className="text-rose-700">
                Total outstanding:{" "}
                <span className="font-semibold">{formatINR(col.defaulters.amount)}</span>
              </span>
              {col.defaulters.oldestDueDate && (
                <span className="text-rose-600">
                  Oldest overdue since{" "}
                  {new Date(col.defaulters.oldestDueDate).toLocaleDateString("en-IN")}
                </span>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">How fees were paid</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-20 text-center text-muted-foreground">Loading…</p>
              ) : modeData.length === 0 ? (
                <p className="py-20 text-center text-muted-foreground">No payments yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={modeData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={105}
                      paddingAngle={2}
                    >
                      {modeData.map((d) => (
                        <Cell key={d.name} fill={MODE_COLORS[d.name] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatINR(Number(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Outstanding by class</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-20 text-center text-muted-foreground">Loading…</p>
              ) : classOut.length === 0 ? (
                <p className="py-20 text-center text-emerald-600">No dues pending 🎉</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={classOut} margin={{ top: 8, right: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f4" />
                    <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" height={60} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => formatINR(Number(v))} />
                    <Tooltip formatter={(v) => formatINR(Number(v))} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="outstanding" name="Outstanding" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
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
