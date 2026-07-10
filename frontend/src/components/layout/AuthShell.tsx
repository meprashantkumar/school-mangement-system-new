import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { Crest } from "@/components/Brand";
import { SCHOOL } from "@/lib/school";

const points = [
  "View your child's fees, dues and receipts in one place",
  "Pay securely online or at the school counter",
  "Get timely reminders so no due date is missed",
];

export const AuthShell = ({ children }: { children: ReactNode }) => (
  <div className="grid min-h-screen lg:grid-cols-2">
    {/* Branded panel */}
    <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-ink p-12 text-white lg:flex">
      <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-blue/20 blur-2xl" />
      <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-brand-orange/15 blur-2xl" />

      <Link
        to="/"
        className="relative flex items-center gap-3 text-lg font-semibold transition-opacity hover:opacity-90"
      >
        <Crest tone="onDark" />
        <span className="font-heading">{SCHOOL.fullName}</span>
      </Link>

      <div className="relative">
        <h1 className="font-heading text-4xl font-bold leading-tight">
          Welcome to the {SCHOOL.name} portal.
        </h1>
        <p className="mt-4 max-w-md text-white/70">
          One secure place for parents and staff — fees, receipts, dues and school updates.
        </p>
        <ul className="mt-8 space-y-3">
          {points.map((f) => (
            <li key={f} className="flex items-center gap-3 text-white/90">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-orange" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-sm text-white/50">
        © {new Date().getFullYear()} {SCHOOL.fullName}
      </p>
    </div>

    {/* Form side */}
    <div className="flex flex-col bg-background">
      <div className="flex items-center justify-between p-4 sm:p-6">
        <Link to="/" className="flex items-center gap-2 lg:hidden">
          <Crest size="sm" />
          <span className="font-heading font-bold">{SCHOOL.name}</span>
        </Link>
        <Link
          to="/"
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to website
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center p-6 pt-2">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  </div>
);
