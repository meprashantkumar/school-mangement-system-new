import { useEffect, useState } from "react";
import { KeyRound, Copy, Check, Printer, ShieldOff } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { SCHOOL } from "@/lib/school";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AccessTarget {
  kind: "student" | "teacher";
  id: string;
  name: string; // whose dashboard this is (student or teacher name)
  phone?: string; // mobile on record (parentPhone / teacher phone)
  hasLogin?: boolean;
}

interface Props {
  target: AccessTarget | null;
  onClose: () => void;
  onDone?: () => void;
}

// The office grants dashboard access: it creates the login against the mobile
// number already on record and shows the password ONCE so it can be written on a
// slip and handed over. Passwords are stored hashed, so a forgotten one is
// replaced (not recovered) from this same dialog.
const MIN_PASSWORD = 8;

export default function GiveAccessDialog({ target, onClose, onDone }: Props) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{
    phone: string;
    password: string;
    name: string;
    created: boolean;
  } | null>(null);

  useEffect(() => {
    setPhone(target?.phone || "");
    setPassword("");
    setResult(null);
    setCopied(false);
  }, [target]);

  if (!target) return null;

  const isStudent = target.kind === "student";
  const endpoint = `/access/${isStudent ? "student" : "teacher"}/${target.id}`;
  // Blank is fine (the server generates one); anything typed must be long enough.
  const tooShort = password.trim().length > 0 && password.trim().length < MIN_PASSWORD;

  const submit = async () => {
    if (tooShort) {
      toast.error(`Password must be at least ${MIN_PASSWORD} characters`);
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post(endpoint, {
        phone: phone.trim() || undefined,
        // Blank = let the server generate a readable one.
        password: password.trim() || undefined,
      });
      setResult({ ...data.credentials, created: data.created });
      toast.success(data.message);
      onDone?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not grant access");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async () => {
    if (
      !confirm(
        `Remove the login for ${target.name}?\n\nThey won't be able to sign in any more. The ${
          isStudent ? "student" : "teacher"
        } record itself is not deleted, and you can grant access again later.`
      )
    )
      return;
    setSaving(true);
    try {
      const { data } = await api.delete(endpoint);
      toast.success(data.message);
      onDone?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not remove the login");
    } finally {
      setSaving(false);
    }
  };

  const slipText = result
    ? `${SCHOOL.fullName}\n${isStudent ? "Parent" : "Staff"} login for ${target.name}\n` +
      `Website: ${window.location.origin}\nMobile number: ${result.phone}\nPassword: ${result.password}\n` +
      `\nPlease keep this safe. To change the password, contact the school office.`
    : "";

  const copySlip = async () => {
    try {
      await navigator.clipboard.writeText(slipText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — please note it down manually");
    }
  };

  const printSlip = () => {
    const w = window.open("", "_blank", "width=420,height=520");
    if (!w) return toast.error("Allow pop-ups to print the slip");
    w.document.write(
      `<pre style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.7;padding:24px;white-space:pre-wrap">${slipText.replace(
        /[<>&]/g,
        (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string
      )}</pre>`
    );
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            {target.hasLogin ? "Reset password" : "Give dashboard access"}
          </DialogTitle>
          <DialogDescription>
            {isStudent
              ? `Creates a parent login for ${target.name}. Any siblings on the same mobile number are shown under the same login.`
              : `Creates a staff login for ${target.name}.`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {result.created ? "Login created" : "New password set"} — write this down now
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Mobile number</dt>
                  <dd className="font-mono font-semibold">{result.phone}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Password</dt>
                  <dd className="font-mono text-base font-bold tracking-wider">{result.password}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                This password is stored encrypted and can't be shown again. If it's lost, open this
                dialog and set a new one.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copySlip}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy slip"}
              </Button>
              <Button variant="outline" size="sm" onClick={printSlip}>
                <Printer className="h-4 w-4" /> Print slip
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Mobile number (this is their login ID)</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
              />
              {!target.phone && (
                <p className="text-xs text-amber-700">
                  No mobile number is on record — enter one to create the login. It's saved as their
                  login ID.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to generate one automatically"
              />
              {tooShort ? (
                <p className="text-xs text-rose-600">
                  Too short — {MIN_PASSWORD} characters minimum ({password.trim().length} so far).
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Leave it blank and an easy-to-read {MIN_PASSWORD}-character password is generated.
                  Minimum {MIN_PASSWORD} characters if you set your own.
                </p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              {target.hasLogin ? (
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={revoke}
                  disabled={saving}
                >
                  <ShieldOff className="h-4 w-4" /> Remove login
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={saving || tooShort}>
                  {saving
                    ? "Saving…"
                    : target.hasLogin
                      ? "Set new password"
                      : "Create login"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
