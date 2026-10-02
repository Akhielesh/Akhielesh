import { BASE } from "./lib/base";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "./components/layout";
import { Spinner } from "./components/ui";
import { PrefsProvider } from "./lib/prefs";
import { useAuthState } from "./lib/queries";
import { LoginPage } from "./pages/Login";
import { SetupPage } from "./pages/Setup";
import { OverviewPage } from "./pages/Overview";

const AlertsPage = lazy(() => import("./pages/Alerts").then((m) => ({ default: m.AlertsPage })));
const SubscriptionsPage = lazy(() => import("./pages/Subscriptions").then((m) => ({ default: m.SubscriptionsPage })));
const MoneyPage = lazy(() => import("./pages/Money").then((m) => ({ default: m.MoneyPage })));
const TimelinePage = lazy(() => import("./pages/Timeline").then((m) => ({ default: m.TimelinePage })));
const DomainPage = lazy(() => import("./pages/Domain").then((m) => ({ default: m.DomainPage })));
const InboxPage = lazy(() => import("./pages/Inbox").then((m) => ({ default: m.InboxPage })));
const RulesPage = lazy(() => import("./pages/Rules").then((m) => ({ default: m.RulesPage })));
const AccountsPage = lazy(() => import("./pages/Accounts").then((m) => ({ default: m.AccountsPage })));
const NotificationsPage = lazy(() => import("./pages/Notifications").then((m) => ({ default: m.NotificationsPage })));
const SettingsPage = lazy(() => import("./pages/Settings").then((m) => ({ default: m.SettingsPage })));
const AskPage = lazy(() => import("./pages/Ask").then((m) => ({ default: m.AskPage })));

function FullScreenSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner className="size-6" />
    </div>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[50vh] place-items-center">
          <Spinner />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuthState();
  const location = useLocation();
  if (auth.isLoading) return <FullScreenSpinner />;
  if (auth.data?.setupRequired) return <Navigate to="/setup" replace />;
  if (!auth.data?.authenticated) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <PrefsProvider>{children}</PrefsProvider>;
}

export function App() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    const onUnauthorized = () => {
      void qc.invalidateQueries({ queryKey: ["auth"] });
      const here = window.location.pathname.slice(BASE.length);
      if (!here.startsWith("/login") && !here.startsWith("/setup")) navigate("/login", { replace: true });
    };
    window.addEventListener("adminak:unauthorized", onUnauthorized);
    return () => window.removeEventListener("adminak:unauthorized", onUnauthorized);
  }, [qc, navigate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="alerts" element={<Lazy><AlertsPage /></Lazy>} />
        <Route path="subscriptions" element={<Lazy><SubscriptionsPage /></Lazy>} />
        <Route path="money" element={<Lazy><MoneyPage /></Lazy>} />
        <Route path="timeline" element={<Lazy><TimelinePage /></Lazy>} />
        <Route path="career" element={<Lazy><DomainPage domain="career" /></Lazy>} />
        <Route path="orders" element={<Lazy><DomainPage domain="orders" /></Lazy>} />
        <Route path="travel" element={<Lazy><DomainPage domain="travel" /></Lazy>} />
        <Route path="security" element={<Lazy><DomainPage domain="security" /></Lazy>} />
        <Route path="life" element={<Lazy><DomainPage domain="life" /></Lazy>} />
        <Route path="inbox" element={<Lazy><InboxPage /></Lazy>} />
        <Route path="rules" element={<Lazy><RulesPage /></Lazy>} />
        <Route path="accounts" element={<Lazy><AccountsPage /></Lazy>} />
        <Route path="notifications" element={<Lazy><NotificationsPage /></Lazy>} />
        <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
        <Route path="ask" element={<Lazy><AskPage /></Lazy>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
