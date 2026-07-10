import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Trophy,
  ShieldCheck,
  HeartHandshake,
  Users,
  Sparkles,
  MapPin,
  Phone,
  Mail,
  Wallet,
  ReceiptText,
  BellRing,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Crest, BrandMark } from "@/components/Brand";
import { SCHOOL } from "@/lib/school";
import { landingPath } from "@/lib/roles";

const highlights = [
  { label: "Nursery – Class 12", icon: GraduationCap },
  { label: "English Medium", icon: BookOpen },
  { label: "Co-educational", icon: Users },
  { label: "Sections A – G", icon: Sparkles },
];

const features = [
  {
    icon: BookOpen,
    title: "Strong academics",
    desc: "A structured curriculum from Nursery to Class 12 that builds solid foundations and prepares students for board examinations.",
  },
  {
    icon: Users,
    title: "Dedicated teachers",
    desc: "Caring, experienced educators who give every child individual attention and encouragement.",
  },
  {
    icon: Trophy,
    title: "Sports & activities",
    desc: "Games, arts and co-curricular activities that help students discover and grow their talents.",
  },
  {
    icon: ShieldCheck,
    title: "Safe campus",
    desc: "A secure, disciplined and friendly environment where students feel comfortable and confident.",
  },
  {
    icon: HeartHandshake,
    title: "Values first",
    desc: "Honesty, respect and responsibility are woven into everyday school life alongside learning.",
  },
  {
    icon: Sparkles,
    title: "All-round growth",
    desc: "We nurture knowledge, character and confidence so every child develops into their best self.",
  },
];

const leaders = [SCHOOL.director, SCHOOL.principal];

export default function Home() {
  const { user } = useAuth();
  const year = new Date().getFullYear();

  const primaryTo = user ? landingPath(user.role) : "/login";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ---------- Top bar ---------- */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandMark />
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#about" className="transition-colors hover:text-foreground">About</a>
            <a href="#why" className="transition-colors hover:text-foreground">Why us</a>
            <a href="#portal" className="transition-colors hover:text-foreground">Fees</a>
            <a href="#contact" className="transition-colors hover:text-foreground">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild>
                <Link to={primaryTo}>Go to app</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild className="hidden sm:inline-flex">
                  <Link to="/register">Register</Link>
                </Button>
                <Button asChild>
                  <Link to="/login">Login</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ---------- Hero ---------- */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-secondary/60 via-background to-background" />
          <div className="absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full bg-brand-orange/10 blur-3xl" />
          <div className="absolute -left-20 top-40 -z-10 h-72 w-72 rounded-full bg-brand-blue/10 blur-3xl" />

          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-orange/30 bg-brand-orange/10 px-3 py-1 text-sm font-semibold text-orange-700">
                <Sparkles className="h-4 w-4" /> Admissions open · {SCHOOL.place}
              </span>
              <h1 className="mt-5 font-heading text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
                Welcome to <span className="text-primary">{SCHOOL.name}</span>
              </h1>
              <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                {SCHOOL.tagline} {SCHOOL.intro}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <Link to={primaryTo}>
                    {user ? "Go to app" : "Parent & Staff Login"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#about">Explore the school</a>
                </Button>
              </div>

              <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {highlights.map(({ label, icon: Icon }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm font-medium shadow-sm"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="leading-tight">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual card */}
            <div className="relative">
              <div className="mx-auto max-w-md rounded-3xl border bg-card p-8 shadow-xl shadow-brand-ink/5">
                <div className="flex flex-col items-center text-center">
                  <Crest size="lg" />
                  <h2 className="mt-4 font-heading text-2xl font-bold">{SCHOOL.fullName}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{SCHOOL.tagline}</p>
                </div>
                <div className="mt-6 space-y-3">
                  {leaders.map((l) => (
                    <div
                      key={l.name}
                      className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-heading font-semibold text-primary">
                        {l.name.split(" ").filter(Boolean).slice(-1)[0]?.[0]}
                      </div>
                      <div className="leading-tight">
                        <p className="font-semibold">{l.name}</p>
                        <p className="text-xs text-muted-foreground">{l.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- About ---------- */}
        <section id="about" className="scroll-mt-20 border-t bg-background">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="font-heading text-sm font-semibold uppercase tracking-wide text-primary">
                About us
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                A place to learn, grow and belong
              </h2>
              <p className="mt-4 text-muted-foreground">{SCHOOL.intro}</p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {leaders.map((l) => (
                <div
                  key={l.name}
                  className="flex items-center gap-4 rounded-2xl border bg-card p-6 shadow-sm"
                >
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-blue to-primary font-heading text-2xl font-bold text-white">
                    {l.name.split(" ").filter(Boolean).slice(-1)[0]?.[0]}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {l.role}
                    </p>
                    <p className="mt-0.5 font-heading text-lg font-bold">{l.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {l.role === "Director"
                        ? "Guiding the school's vision and long-term growth."
                        : "Leading academics, discipline and student life."}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Why us ---------- */}
        <section id="why" className="scroll-mt-20 border-t bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="font-heading text-sm font-semibold uppercase tracking-wide text-primary">
                Why {SCHOOL.name}
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Everything a child needs to thrive
              </h2>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="rounded-2xl border bg-card p-6 shadow-sm">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 font-heading text-lg font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Fees / portal ---------- */}
        <section id="portal" className="scroll-mt-20 border-t bg-background">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="overflow-hidden rounded-3xl bg-brand-ink text-white">
              <div className="grid gap-8 p-8 sm:p-12 lg:grid-cols-2 lg:items-center">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white/90">
                    <Wallet className="h-4 w-4" /> Online fee portal
                  </span>
                  <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight">
                    School fees, made simple for parents
                  </h2>
                  <p className="mt-3 max-w-lg text-white/70">
                    View dues, pay securely online or at the counter, and download receipts anytime.
                    Parents also get gentle reminders so nothing is missed.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button size="lg" variant="secondary" asChild>
                      <Link to={user ? primaryTo : "/login"}>
                        Open parent portal <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    {!user && (
                      <Button
                        size="lg"
                        asChild
                        className="bg-white/10 text-white hover:bg-white/20"
                      >
                        <Link to="/register">Create parent account</Link>
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { icon: Wallet, t: "Pay online", d: "UPI, cards, net banking" },
                    { icon: ReceiptText, t: "Instant receipts", d: "Download or print" },
                    { icon: BellRing, t: "Fee reminders", d: "Never miss a due date" },
                    { icon: ShieldCheck, t: "Secure & clear", d: "Every charge explained" },
                  ].map(({ icon: Icon, t, d }) => (
                    <div key={t} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                      <Icon className="h-6 w-6 text-brand-orange" />
                      <p className="mt-3 font-semibold">{t}</p>
                      <p className="text-sm text-white/60">{d}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ---------- Footer / contact ---------- */}
      <footer id="contact" className="scroll-mt-20 border-t bg-brand-ink text-white/80">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
          <div>
            <BrandMark tone="onDark" onDark subtitle="Garhwa, Jharkhand" />
            <p className="mt-4 max-w-sm text-sm text-white/60">{SCHOOL.tagline}</p>
          </div>

          <div>
            <h3 className="font-heading font-semibold text-white">Contact</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-white/70">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                {SCHOOL.address}
              </li>
              {SCHOOL.phone && (
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-brand-orange" />
                  <a href={`tel:${SCHOOL.phone}`} className="hover:text-white">{SCHOOL.phone}</a>
                </li>
              )}
              {SCHOOL.email && (
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-brand-orange" />
                  <a href={`mailto:${SCHOOL.email}`} className="hover:text-white">{SCHOOL.email}</a>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h3 className="font-heading font-semibold text-white">Quick links</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-white/70">
              <li><a href="#about" className="hover:text-white">About the school</a></li>
              <li><a href="#why" className="hover:text-white">Why choose us</a></li>
              <li><Link to="/login" className="hover:text-white">Parent & staff login</Link></li>
              <li><Link to="/register" className="hover:text-white">Create parent account</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-4 py-5 text-center text-xs text-white/50 sm:px-6">
            © {year} {SCHOOL.fullName}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
