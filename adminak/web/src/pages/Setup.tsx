import { useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { post, errorMessage } from "../lib/api";
import { useAuthState } from "../lib/queries";
import { Button, Field, Input, Select, Spinner } from "../components/ui";
import { AuthFrame } from "./Login";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD", "JPY", "CHF", "AED"];

function strength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return { score, label: ["Too short", "Weak", "Okay", "Good", "Strong", "Excellent"][score] ?? "" };
}

export function SetupPage() {
  const auth = useAuthState();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [form, setForm] = useState({ setupCode: "", name: "", email: "", password: "", notifyEmail: "", timezone: detectedTz, currency: "USD" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {
      return [detectedTz];
    }
  }, [detectedTz]);
  const s = strength(form.password);

  if (auth.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }
  if (auth.data && !auth.data.setupRequired) return <Navigate to={auth.data.authenticated ? "/" : "/login"} replace />;

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/auth/setup", { ...form, notifyEmail: form.notifyEmail || form.email });
      await qc.invalidateQueries({ queryKey: ["auth"] });
      navigate("/accounts?welcome=1", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Claim your console" subtitle="Create the owner account. You'll find the one-time setup code in the server logs.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Setup code" htmlFor="code" hint="Printed when the server starts, like ABCD-1234-EF56.">
          <Input id="code" required value={form.setupCode} onChange={set("setupCode")} autoCapitalize="characters" autoComplete="off" placeholder="XXXX-XXXX-XXXX" className="font-mono tracking-wider uppercase" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="name">
            <Input id="name" required value={form.name} onChange={set("name")} autoComplete="name" />
          </Field>
          <Field label="Sign-in email" htmlFor="email">
            <Input id="email" type="email" required value={form.email} onChange={set("email")} autoComplete="username" />
          </Field>
        </div>
        <Field label="Password" htmlFor="password" hint={form.password ? `${s.label} — use 10+ characters, ideally a passphrase.` : "Use 10+ characters, ideally a passphrase."}>
          <Input id="password" type="password" required value={form.password} onChange={set("password")} autoComplete="new-password" />
          <div className="mt-2 flex gap-1" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i < s.score ? (s.score >= 4 ? "bg-good" : s.score >= 3 ? "bg-med" : "bg-high") : "bg-surface-2"}`} />
            ))}
          </div>
        </Field>
        <Field label="Send alerts to" htmlFor="notify" hint="Your personal email for instant alerts, the daily brief and reports. Defaults to your sign-in email.">
          <Input id="notify" type="email" value={form.notifyEmail} onChange={set("notifyEmail")} placeholder={form.email || "you@example.com"} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="Time zone" htmlFor="tz">
            <Select id="tz" value={form.timezone} onChange={set("timezone")}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Currency" htmlFor="currency">
            <Select id="currency" value={form.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        {error ? <p className="rounded-xl bg-crit-soft px-3 py-2 text-sm text-crit">{error}</p> : null}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={ShieldCheck}>
          Create owner account
        </Button>
      </form>
    </AuthFrame>
  );
}
