import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { AuthShell } from "@/components/layout/AuthShell";
import { landingPath } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { login, user, loading: restoringSession } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Already signed in? Go straight to your dashboard instead of showing the form.
  // This is what makes the installed app feel native: /login is the PWA's start_url,
  // so a teacher taps the home-screen icon and lands on today's attendance with
  // nothing to type. `replace` keeps the form out of the back history.
  useEffect(() => {
    if (user) navigate(landingPath(user.role), { replace: true });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(identifier, password);
      toast.success("Logged in successfully");
      navigate(landingPath(user.role));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  // The saved session is verified against the server on boot, so `user` is briefly
  // null even for someone already signed in. Show a quiet splash instead of the form,
  // or the installed app flashes a login screen every single time it's opened.
  if (restoringSession || user) {
    return (
      <AuthShell>
        <p className="py-20 text-center text-sm text-muted-foreground">Signing you in…</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-8">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Welcome back</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to view fees, receipts and school updates. Parents and staff use the same login.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="identifier">Mobile number</Label>
          <Input
            id="identifier"
            // Not type="tel" — staff sign in with an email here too.
            inputMode="text"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="10-digit mobile number"
            required
          />
          <p className="text-xs text-muted-foreground">
            Use the mobile number the school has on record. Staff with an email can use that
            instead.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "Please wait..." : "Login"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        No login yet? Please contact the school office — they'll set up your mobile number and
        password.
      </p>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Have a school email instead?{" "}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Register
        </Link>
      </p>
    </AuthShell>
  );
}
