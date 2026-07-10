import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Sidebar, SidebarContent } from "./Sidebar";
import { useAuth } from "@/context/AuthContext";
import { Crest } from "@/components/Brand";
import { SCHOOL } from "@/lib/school";
import { cn } from "@/lib/utils";

const initials = (name?: string) =>
  (name || "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const AdminLayout = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Desktop rail */}
      <Sidebar />

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-brand-ink/60 transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          className={cn(
            "absolute left-0 top-0 h-full w-64 shadow-xl transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <button
            onClick={() => setOpen(false)}
            className="absolute -right-11 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </div>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border text-foreground md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile brand */}
          <div className="flex items-center gap-2 md:hidden">
            <Crest size="sm" />
            <span className="font-heading text-sm font-bold">{SCHOOL.name}</span>
          </div>

          {/* User (right) */}
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-none">{user?.name}</p>
              <p className="text-xs capitalize text-muted-foreground">{user?.role}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initials(user?.name)}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
