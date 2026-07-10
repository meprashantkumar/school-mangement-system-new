import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  GraduationCap,
  Contact,
  Users,
  ClipboardCheck,
  BookOpen,
  Trophy,
  FileText,
  CalendarPlus,
  Wallet,
  BarChart3,
  PieChart,
  History,
  Trash2,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Crest } from "@/components/Brand";
import { SCHOOL } from "@/lib/school";
import type { Role } from "@/types";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

const navItems: NavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["superadmin", "admin"] },
  { to: "/admin/students", label: "Students", icon: GraduationCap, roles: ["superadmin"] },
  { to: "/admin/teachers", label: "Teachers", icon: Contact, roles: ["superadmin"] },
  { to: "/admin/staff", label: "Staff", icon: Users, roles: ["superadmin"] },
  { to: "/admin/attendance", label: "Attendance", icon: ClipboardCheck, roles: ["superadmin", "admin"] },
  { to: "/admin/subjects", label: "Subjects", icon: BookOpen, roles: ["superadmin"] },
  { to: "/admin/exams", label: "Exams & Results", icon: Trophy, roles: ["superadmin", "admin"] },
  { to: "/admin/fees", label: "Fee Setup", icon: FileText, roles: ["superadmin"] },
  { to: "/admin/fee-generation", label: "Fee Generation", icon: CalendarPlus, roles: ["superadmin"] },
  { to: "/admin/collect", label: "Collect Fee", icon: Wallet, roles: ["superadmin", "admin"] },
  { to: "/admin/reports", label: "Reports", icon: BarChart3, roles: ["superadmin", "admin"] },
  { to: "/admin/analytics", label: "Analytics", icon: PieChart, roles: ["superadmin", "admin"] },
  { to: "/admin/audit", label: "Audit Log", icon: History, roles: ["superadmin"] },
  { to: "/admin/recycle-bin", label: "Recycle Bin", icon: Trash2, roles: ["superadmin"] },
];

const initials = (name?: string) =>
  (name || "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** The inner sidebar content — shared by the desktop rail and the mobile drawer. */
export const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { user, logout } = useAuth();
  const items = navItems.filter((item) => user && item.roles.includes(user.role));

  return (
    <div className="flex h-full flex-col bg-brand-ink text-white">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <Crest size="sm" tone="onDark" />
        <div className="leading-tight">
          <div className="font-heading text-sm font-bold">{SCHOOL.name}</div>
          <div className="text-xs text-white/50">Staff Console</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-white/35">
          Menu
        </p>
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white ring-1 ring-white/15">
            {initials(user?.name)}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="text-xs capitalize text-white/50">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Logout
        </button>
      </div>
    </div>
  );
};

/** Static desktop rail. */
export const Sidebar = () => (
  <aside className="hidden w-64 shrink-0 md:block">
    <div className="fixed inset-y-0 left-0 w-64">
      <SidebarContent />
    </div>
  </aside>
);
