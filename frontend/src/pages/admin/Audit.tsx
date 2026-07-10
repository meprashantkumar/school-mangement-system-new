import { useEffect, useState } from "react";
import { History, ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AuditRow {
  _id: string;
  userName: string;
  userRole: string;
  action: string;
  description: string;
  createdAt: string;
}

interface AuditResponse {
  logs: AuditRow[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

const RANGES = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];

const ACTIONS = [
  "Login",
  "Student",
  "Promotion",
  "Fee setup",
  "Fee generation",
  "Payment",
  "Concession/Fine",
  "Reminder",
];

const selectClass = "flex h-10 rounded-md border border-input bg-background px-3 text-sm";

export default function Audit() {
  const [range, setRange] = useState("7d");
  const [action, setAction] = useState("");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, limit: 30 };
    if (action) params.action = action;
    if (range === "custom") {
      if (custom.from) params.from = custom.from;
      if (custom.to) params.to = custom.to;
    } else if (range !== "all") {
      params.range = range;
    }
    api
      .get("/audit", { params })
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, range, action, custom]);

  // Any filter change goes back to page 1.
  const pickRange = (r: string) => {
    setRange(r);
    setPage(1);
  };

  const logs = data?.logs || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <History className="h-6 w-6 text-primary" /> Audit Log
        </h1>
        <p className="text-muted-foreground">Every action taken in the system, most recent first.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Button
            key={r.value}
            size="sm"
            variant={range === r.value ? "default" : "outline"}
            onClick={() => pickRange(r.value)}
          >
            {r.label}
          </Button>
        ))}

        <select
          className={`${selectClass} ml-auto`}
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {range === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">From</label>
            <Input
              type="date"
              value={custom.from}
              onChange={(e) => {
                setCustom((c) => ({ ...c, from: e.target.value }));
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">To</label>
            <Input
              type="date"
              value={custom.to}
              onChange={(e) => {
                setCustom((c) => ({ ...c, to: e.target.value }));
                setPage(1);
              }}
            />
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    No activity in this period.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((l) => (
                  <TableRow key={l._id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(l.createdAt).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="text-sm font-medium">{l.userName}</div>
                      <div className="text-xs capitalize text-muted-foreground">{l.userRole}</div>
                    </TableCell>
                    <TableCell>
                      <Badge>{l.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{l.description}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {data.total} event(s) · showing {(data.page - 1) * data.limit + 1}–
            {Math.min(data.page * data.limit, data.total)}
          </span>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span>
              Page {data.page} of {data.pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={data.page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
