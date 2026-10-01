import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type {
  AccountDTO,
  AlertCounts,
  AlertDTO,
  AskResponse,
  AuthState,
  ChannelDTO,
  DomainDTO,
  MessageDetailDTO,
  MessageListItem,
  MoneyDTO,
  MoneyTotal,
  NotificationLogDTO,
  OverviewDTO,
  RuleDTO,
  SavingsInsight,
  SenderOverrideDTO,
  SenderSummary,
  Settings,
  SettingsPatch,
  SubscriptionDTO,
  SubscriptionDetailDTO,
  SyncRunDTO,
  SystemStatusDTO,
  TemplateInfo,
  TimelineItem,
  ChargeDTO,
} from "@shared/types";
import { del, get, patch, post } from "./api";

export const qk = {
  auth: ["auth"] as const,
  overview: ["overview"] as const,
  alerts: (params: string) => ["alerts", params] as const,
  alertCounts: ["alerts", "counts"] as const,
  subscriptions: ["subscriptions"] as const,
  subscription: (id: number) => ["subscriptions", id] as const,
  money: ["money"] as const,
  charges: (params: string) => ["charges", params] as const,
  timeline: (days: number) => ["timeline", days] as const,
  domain: (d: string) => ["domain", d] as const,
  messages: (params: string) => ["messages", params] as const,
  message: (id: number) => ["message", id] as const,
  senders: ["senders"] as const,
  rules: ["rules"] as const,
  overrides: ["sender-overrides"] as const,
  accounts: ["accounts"] as const,
  channels: ["channels"] as const,
  templates: ["templates"] as const,
  log: ["notifications", "log"] as const,
  settings: ["settings"] as const,
  system: ["system"] as const,
  audit: ["audit"] as const,
  automation: ["automation"] as const,
  sessions: ["sessions"] as const,
};

export interface SubscriptionsResponse {
  items: SubscriptionDTO[];
  monthly: MoneyTotal[];
  active: number;
  trials: number;
  savings: SavingsInsight[];
}

export interface AccountsResponse {
  accounts: AccountDTO[];
  runs: SyncRunDTO[];
  google: boolean;
  redirectUri: string;
  presets: { id: string; label: string; host: string; port: number; secure: boolean; folders: string[]; help: string }[];
}

export interface ChannelsResponse {
  channels: ChannelDTO[];
  email: { configured: boolean; transport: string; smtp: boolean };
  pushPublicKey: string;
}

export interface AutomationResponse {
  hookToken: string;
  calendarUrl: string;
  webcalUrl: string;
  endpoints: { scan: string; ingest: string; digest: string; summary: string };
}

export interface SessionInfo {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  ip: string | null;
  userAgent: string | null;
}

export const useAuthState = () => useQuery({ queryKey: qk.auth, queryFn: () => get<AuthState>("/auth/state"), staleTime: 30_000 });

export const useOverview = () => useQuery({ queryKey: qk.overview, queryFn: () => get<OverviewDTO>("/overview"), refetchInterval: 60_000 });

export const useAlerts = (params: URLSearchParams) =>
  useQuery({ queryKey: qk.alerts(params.toString()), queryFn: () => get<AlertDTO[]>(`/alerts?${params.toString()}`), placeholderData: (prev) => prev });

export const useAlertCounts = () => useQuery({ queryKey: qk.alertCounts, queryFn: () => get<AlertCounts>("/alerts/counts"), refetchInterval: 60_000 });

export const useSubscriptions = () => useQuery({ queryKey: qk.subscriptions, queryFn: () => get<SubscriptionsResponse>("/subscriptions") });

export const useSubscription = (id: number | null) =>
  useQuery({ queryKey: qk.subscription(id ?? 0), queryFn: () => get<SubscriptionDetailDTO>(`/subscriptions/${id}`), enabled: !!id });

export const useMoney = () => useQuery({ queryKey: qk.money, queryFn: () => get<MoneyDTO>("/money") });

export const useCharges = (params: URLSearchParams) =>
  useQuery({ queryKey: qk.charges(params.toString()), queryFn: () => get<ChargeDTO[]>(`/charges?${params.toString()}`), placeholderData: (prev) => prev });

export const useTimeline = (days: number) => useQuery({ queryKey: qk.timeline(days), queryFn: () => get<TimelineItem[]>(`/timeline?days=${days}`) });

export const useDomain = (domain: string) => useQuery({ queryKey: qk.domain(domain), queryFn: () => get<DomainDTO>(`/domains/${domain}`) });

export const useMessages = (params: URLSearchParams) =>
  useQuery({ queryKey: qk.messages(params.toString()), queryFn: () => get<MessageListItem[]>(`/messages?${params.toString()}`), placeholderData: (prev) => prev });

export const useMessage = (id: number | null) => useQuery({ queryKey: qk.message(id ?? 0), queryFn: () => get<MessageDetailDTO>(`/messages/${id}`), enabled: !!id });

export const useSenders = () => useQuery({ queryKey: qk.senders, queryFn: () => get<SenderSummary[]>("/senders") });

export const useRules = () => useQuery({ queryKey: qk.rules, queryFn: () => get<RuleDTO[]>("/rules") });

export const useSenderOverrides = () => useQuery({ queryKey: qk.overrides, queryFn: () => get<SenderOverrideDTO[]>("/sender-overrides") });

export const useAccounts = () =>
  useQuery({
    queryKey: qk.accounts,
    queryFn: () => get<AccountsResponse>("/accounts"),
    refetchInterval: (query) => (query.state.data?.accounts.some((a) => a.syncing) ? 2000 : 30_000),
  });

export const useChannels = () => useQuery({ queryKey: qk.channels, queryFn: () => get<ChannelsResponse>("/channels") });
export const useTemplates = () => useQuery({ queryKey: qk.templates, queryFn: () => get<TemplateInfo[]>("/templates"), staleTime: Infinity });
export const useNotificationLog = () => useQuery({ queryKey: qk.log, queryFn: () => get<NotificationLogDTO[]>("/notifications/log") });
export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: () => get<Settings>("/settings"), staleTime: 60_000 });
export const useSystem = () => useQuery({ queryKey: qk.system, queryFn: () => get<SystemStatusDTO & { emailConfigured: boolean }>("/system") });
export const useAudit = () => useQuery({ queryKey: qk.audit, queryFn: () => get<{ id: number; at: string; action: string; detail: string | null; ip: string | null }[]>("/audit") });
export const useAutomation = () => useQuery({ queryKey: qk.automation, queryFn: () => get<AutomationResponse>("/automation") });
export const useSessions = () => useQuery({ queryKey: qk.sessions, queryFn: () => get<SessionInfo[]>("/me/sessions") });

/** Invalidates everything derived from mail — after a sync, reclassification or demo load. */
export function useInvalidateData() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["overview", "alerts", "subscriptions", "money", "charges", "timeline", "domain", "messages", "senders", "accounts", "system"]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useSettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SettingsPatch) => patch<Settings>("/settings", body),
    onSuccess: (data) => {
      qc.setQueryData(qk.settings, data);
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useAction<TBody, TResult>(fn: (body: TBody) => Promise<TResult>, invalidate: QueryKey[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidate) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export const actions = {
  updateAlert: (id: number, body: { status: string; snoozeUntil?: string }) => patch<AlertDTO>(`/alerts/${id}`, body),
  bulkAlerts: (body: { ids: number[]; action: string; snoozeUntil?: string }) => post<{ changed: number }>("/alerts/bulk", body),
  readAllAlerts: () => post<{ changed: number }>("/alerts/read-all"),
  syncAll: () => post<{ ok: boolean }>("/sync"),
  syncAccount: (id: number) => post<{ ok: boolean }>(`/accounts/${id}/sync`),
  loadDemo: () => post<{ ok: boolean; inserted: number; alerts: number }>("/demo"),
  clearDemo: () => del<{ ok: boolean }>("/demo"),
  logout: () => post<{ ok: boolean }>("/auth/logout"),
  ask: (question: string) => post<AskResponse>("/ask", { question }),
};
