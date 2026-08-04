import { useState } from "react";
import { Link } from "react-router-dom";
import { MailCheck, Phone } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SCHOOL } from "@/lib/school";

// A typed value that's digits (not an email) is a mobile number.
const looksLikePhone = (v: string) =>
  !v.includes("@") && /^[\d\s\-()+]+$/.test(v.trim()) && v.replace(/\D/g, "").length >= 10;

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Mobile-number accounts have no inbox to send a reset link to, so they're
  // reset by the school office instead.
  const isPhone = looksLikePhone(identifier);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { identifier });
      setSent(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      {sent ? (
        <div className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {isPhone ? (
              <Phone className="h-6 w-6 text-primary" />
            ) : (
              <MailCheck className="h-6 w-6 text-primary" />
            )}
          </div>
          {isPhone ? (
            <>
              <h2 className="text-2xl font-bold tracking-tight">Contact the school office</h2>
              <p className="text-sm text-muted-foreground">
                Logins that use a mobile number can't be reset by email. Please contact the school
                office — they'll set a new password for{" "}
                <span className="font-medium">{identifier}</span> and give it to you.
              </p>
              {SCHOOL.phone && (
                <p className="text-sm">
                  Office:{" "}
                  <a href={`tel:${SCHOOL.phone}`} className="font-medium text-primary hover:underline">
                    {SCHOOL.phone}
                  </a>
                </p>
              )}
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold tracking-tight">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                If an account exists for <span className="font-medium">{identifier}</span>, we've
                sent a password reset link. It's valid for 30 minutes.
              </p>
            </>
          )}
          <Link to="/login" className="inline-block text-sm font-medium text-primary hover:underline">
            Back to login
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">Forgot password?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your mobile number or email to find out how to get back in.
            </p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Mobile number or email</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="10-digit mobile number"
                required
              />
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              Signed in with a <b>mobile number</b>? Only the school office can reset that password —
              just contact them and they'll set a new one for you. Email logins get a reset link.
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Please wait..." : "Continue"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Back to login
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
