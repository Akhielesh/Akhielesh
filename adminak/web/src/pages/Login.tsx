import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Lock } from "lucide-react";
import { ApiError, post } from "../lib/api";
import { useAuthState } from "../lib/queries";
import { Button, Field, Input, Spinner } from "../components/ui";

export function AuthFrame({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="safe-top grid min-h-dvh place-items-center px-4 py-10">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(240,181,111,0.14),transparent_35%),radial-gradient(circle_at_85%_0%,rgba(138,197,207,0.12),transparent_30%)]" />
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3">
          <span className="relative grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-[#1c1d22] to-[#0c0d0f] text-xl font-bold text-[#f2efe8] ring-1 ring-white/10">
            A<span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-[#f0b56f]" />
          </span>
          <div>
            <div className="text-[18px] font-semibold tracking-tight text-ink">Adminak</div>
            <div className="text-[13px] text-muted">Personal intelligence console</div>
          </div>
        </div>
        <div className="card p-6 sm:p-7">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const auth = useAuthState();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }
  if (auth.data?.setupRequired) return <Navigate to="/setup" replace />;
  if (auth.data?.authenticated) return <Navigate to={params.get("next") || "/"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/auth/login", { email, password, code: needsCode ? code : undefined });
      await qc.invalidateQueries({ queryKey: ["auth"] });
      const next = params.get("next");
      navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : "/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && (err.data as { totpRequired?: boolean } | null)?.totpRequired) {
        setNeedsCode(true);
        setError((err.data as { error?: string }).error ?? null);
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title={needsCode ? "Two-factor check" : "Welcome back"} subtitle={needsCode ? "Enter the 6-digit code from your authenticator app, or a recovery code." : "Sign in to your console."}>
      <form onSubmit={submit} className="space-y-4">
        {!needsCode ? (
          <>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="Authentication code" htmlFor="code">
            <Input id="code" autoFocus autoComplete="one-time-code" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="tracking-[0.3em]" />
          </Field>
        )}
        {error ? <p className="rounded-xl bg-crit-soft px-3 py-2 text-sm text-crit">{error}</p> : null}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={needsCode ? KeyRound : Lock}>
          {needsCode ? "Verify" : "Sign in"}
        </Button>
        <p className="text-center text-[12.5px] text-muted">Forgot your password? Run <code className="rounded bg-surface-2 px-1">npm run cli -- reset-password</code> on the server.</p>
      </form>
    </AuthFrame>
  );
}
