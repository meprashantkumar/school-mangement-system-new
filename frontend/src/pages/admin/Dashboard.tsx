import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  GraduationCap,
  Wallet,
  AlertCircle,
  UserPlus,
  FileText,
  HandCoins,
  Contact,
} from "lucide-react";
import api from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { formatINR } from "@/lib/utils";

interface Stats {
  totalStudents: number;
  totalTeachers: number;
  totalCollected: number;
  totalOutstanding: number;
  totalUsers: number;
}

const quickActions = [
  { to: "/admin/students", label: "Add / manage students", icon: UserPlus },
  { to: "/admin/fees", label: "Set up fee structures", icon: FileText },
  { to: "/admin/collect", label: "Collect a fee payment", icon: HandCoins },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api
      .get("/admin/stats")
      .then(({ data }) => setStats(data.stats))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {user?.name?.split(" ")[0] || "there"} 👋
        </h1>
        <p className="text-muted-foreground">Here's an overview of your school's fees.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={GraduationCap} label="Students" value={stats?.totalStudents ?? 0} color="indigo" />
        <StatCard icon={Contact} label="Teachers" value={stats?.totalTeachers ?? 0} color="blue" />
        <StatCard icon={Wallet} label="Collected" value={formatINR(stats?.totalCollected ?? 0)} color="green" />
        <StatCard icon={AlertCircle} label="Outstanding" value={formatINR(stats?.totalOutstanding ?? 0)} color="amber" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {quickActions.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">{label}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
