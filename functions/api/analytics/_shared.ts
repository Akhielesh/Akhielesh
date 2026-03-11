import type {
  AnalyticsDashboardSnapshot,
  AnalyticsRange,
  DeviceMetric,
  LocationPoint,
  PageMetric,
  PulseItem,
  ReferrerMetric,
  TrendPoint
} from "../../../lib/analytics";

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export interface AnalyticsEnv {
  ANALYTICS_DB: D1DatabaseLike;
  ADMINAK_PASSWORD?: string;
}

export interface AnalyticsContext {
  request: Request;
  env: AnalyticsEnv;
}

export interface AnalyticsPageviewPayload {
  type: "pageview";
  eventId: string;
  path: string;
  title: string;
  referrer: string;
  host: string;
  language: string;
  timezone: string;
  screen: string;
  viewport: string;
  sessionId: string;
  visitorId: string;
  occurredAt: string;
}

interface DashboardCountRow {
  pageviews: number | string | null;
  uniqueVisitors: number | string | null;
}

interface ReturningVisitorRow {
  returningVisitors: number | string | null;
}

interface SessionAggregateRow {
  avgVisitDurationSeconds: number | string | null;
  bounceRate: number | string | null;
}

interface LocationAggregateRow {
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  visits: number | string | null;
}

interface PageAggregateRow {
  path: string | null;
  title: string | null;
  views: number | string | null;
  uniqueVisitors: number | string | null;
}

interface ReferrerAggregateRow {
  source: string | null;
  visits: number | string | null;
}

interface DeviceAggregateRow {
  label: string | null;
  visits: number | string | null;
}

interface LatestActivityRow {
  latestOccurredAt: string | null;
}

interface TrendAggregateRow {
  bucket: string | null;
  visitors: number | string | null;
  pageviews: number | string | null;
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");

  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, { status });
}

export function sanitizeText(input: unknown, fallback = "", maxLength = 240) {
  if (typeof input !== "string") {
    return fallback;
  }

  return input.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizePath(input: unknown) {
  const raw = sanitizeText(input, "/", 512);

  try {
    const url = raw.startsWith("http://") || raw.startsWith("https://") ? new URL(raw) : new URL(raw, "https://adminak.invalid");
    const path = url.pathname || "/";
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    return "/";
  }
}

export function normalizeHost(input: unknown) {
  return sanitizeText(input, "", 200).toLowerCase();
}

export function normalizeReferrer(referrer: string, host: string) {
  if (!referrer) {
    return { host: "", source: "direct" };
  }

  try {
    const parsed = new URL(referrer);
    const referrerHost = parsed.host.toLowerCase();

    if (!referrerHost) {
      return { host: "", source: "direct" };
    }

    if (host && referrerHost === host) {
      return { host: referrerHost, source: "internal" };
    }

    return { host: referrerHost, source: referrerHost };
  } catch {
    return { host: "", source: "direct" };
  }
}

export function parseIsoTimestamp(input: unknown) {
  if (typeof input !== "string") {
    return new Date().toISOString();
  }

  const parsed = new Date(input);

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

export function normalizeRange(input: string | null): AnalyticsRange {
  if (input === "24h" || input === "30d") {
    return input;
  }

  return "7d";
}

function truncateToUtcHour(date: Date) {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  return next;
}

function truncateToUtcDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function hourBucketKey(date: Date) {
  return `${date.toISOString().slice(0, 13)}:00:00.000Z`;
}

function dayBucketKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function bucketKeysForRange(range: AnalyticsRange, now = new Date()) {
  if (range === "24h") {
    const end = truncateToUtcHour(now);
    const buckets = Array.from({ length: 24 }, (_, index) => {
      const date = new Date(end);
      date.setUTCHours(end.getUTCHours() - (23 - index));
      return {
        key: hourBucketKey(date),
        timestamp: date.toISOString(),
        label: date.toLocaleTimeString("en-US", { hour: "numeric" })
      };
    });

    return { column: "hour_bucket" as const, startIso: buckets[0].timestamp, buckets };
  }

  const totalDays = range === "30d" ? 30 : 7;
  const end = truncateToUtcDay(now);
  const buckets = Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (totalDays - index - 1));
    return {
      key: dayBucketKey(date),
      timestamp: date.toISOString(),
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    };
  });

  return { column: "day_bucket" as const, startIso: buckets[0].timestamp, buckets };
}

export function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function coerceString(value: string | null | undefined, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export function classifyDevice(userAgent: string, viewport: string) {
  const ua = userAgent.toLowerCase();
  const width = Number.parseInt(viewport.split("x")[0] ?? "", 10);

  if (/ipad|tablet/.test(ua) || (Number.isFinite(width) && width >= 768 && width < 1024)) {
    return "Tablet";
  }

  if (/mobile|iphone|android|iemobile|opera mini/.test(ua) || (Number.isFinite(width) && width > 0 && width < 768)) {
    return "Mobile";
  }

  if (/windows|macintosh|linux|cros/.test(ua) || Number.isFinite(width)) {
    return "Desktop";
  }

  return "Other";
}

export function readCfLocation(request: Request) {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf;

  return {
    country: sanitizeText(cf?.country, "", 80),
    region: sanitizeText(cf?.region, "", 120),
    city: sanitizeText(cf?.city, "", 120),
    latitude: toNullableNumber(cf?.latitude as number | string | null | undefined),
    longitude: toNullableNumber(cf?.longitude as number | string | null | undefined),
    postalCode: sanitizeText(cf?.postalCode, "", 40),
    colo: sanitizeText(cf?.colo, "", 40)
  };
}

export async function buildDashboardSnapshot(
  db: D1DatabaseLike,
  range: AnalyticsRange
): Promise<AnalyticsDashboardSnapshot> {
  const now = new Date();
  const collectedAt = now.toISOString();
  const liveWindowStart = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const { column, startIso, buckets } = bucketKeysForRange(range, now);

  const [
    countsRow,
    liveVisitorsRaw,
    returningRow,
    sessionRow,
    latestActivityRow,
    topLocationRow,
    trendRowsResult,
    locationRowsResult,
    pageRowsResult,
    referrerRowsResult,
    deviceRowsResult
  ] = await Promise.all([
    db
      .prepare(
        `SELECT
           COUNT(*) AS pageviews,
           COUNT(DISTINCT visitor_id) AS uniqueVisitors
         FROM pageviews
         WHERE occurred_at >= ?`
      )
      .bind(startIso)
      .first<DashboardCountRow>(),
    db
      .prepare("SELECT COUNT(DISTINCT visitor_id) AS liveVisitors FROM pageviews WHERE occurred_at >= ?")
      .bind(liveWindowStart)
      .first<number>("liveVisitors"),
    db
      .prepare(
        `SELECT COUNT(*) AS returningVisitors FROM (
           SELECT visitor_id
           FROM pageviews
           WHERE occurred_at >= ?
           GROUP BY visitor_id
           HAVING COUNT(DISTINCT session_id) > 1
         )`
      )
      .bind(startIso)
      .first<ReturningVisitorRow>(),
    db
      .prepare(
        `WITH sessions AS (
           SELECT
             session_id,
             MIN(occurred_at) AS started_at,
             MAX(occurred_at) AS ended_at,
             COUNT(*) AS pageviews
           FROM pageviews
           WHERE occurred_at >= ?
           GROUP BY session_id
         )
         SELECT
           COALESCE(ROUND(AVG(CASE
             WHEN pageviews > 1 THEN (julianday(ended_at) - julianday(started_at)) * 86400
             ELSE 0
           END)), 0) AS avgVisitDurationSeconds,
           COALESCE(ROUND(AVG(CASE WHEN pageviews = 1 THEN 100.0 ELSE 0 END)), 0) AS bounceRate
         FROM sessions`
      )
      .bind(startIso)
      .first<SessionAggregateRow>(),
    db
      .prepare("SELECT MAX(occurred_at) AS latestOccurredAt FROM pageviews")
      .first<LatestActivityRow>(),
    db
      .prepare(
        `SELECT
           country,
           region,
           city,
           AVG(latitude) AS latitude,
           AVG(longitude) AS longitude,
           COUNT(*) AS visits
         FROM pageviews
         WHERE occurred_at >= ?
           AND country != ''
         GROUP BY country, region, city
         ORDER BY visits DESC, country ASC, region ASC, city ASC
         LIMIT 1`
      )
      .bind(startIso)
      .first<LocationAggregateRow>(),
    db
      .prepare(
        `SELECT
           ${column} AS bucket,
           COUNT(*) AS pageviews,
           COUNT(DISTINCT visitor_id) AS visitors
         FROM pageviews
         WHERE occurred_at >= ?
         GROUP BY ${column}
         ORDER BY ${column} ASC`
      )
      .bind(startIso)
      .all<TrendAggregateRow>(),
    db
      .prepare(
        `SELECT
           country,
           region,
           city,
           AVG(latitude) AS latitude,
           AVG(longitude) AS longitude,
           COUNT(*) AS visits
         FROM pageviews
         WHERE occurred_at >= ?
           AND country != ''
         GROUP BY country, region, city
         HAVING AVG(latitude) IS NOT NULL AND AVG(longitude) IS NOT NULL
         ORDER BY visits DESC, country ASC, region ASC, city ASC
         LIMIT 18`
      )
      .bind(startIso)
      .all<LocationAggregateRow>(),
    db
      .prepare(
        `SELECT
           path,
           MAX(title) AS title,
           COUNT(*) AS views,
           COUNT(DISTINCT visitor_id) AS uniqueVisitors
         FROM pageviews
         WHERE occurred_at >= ?
         GROUP BY path
         ORDER BY views DESC, uniqueVisitors DESC, path ASC
         LIMIT 8`
      )
      .bind(startIso)
      .all<PageAggregateRow>(),
    db
      .prepare(
        `SELECT
           referrer_source AS source,
           COUNT(*) AS visits
         FROM pageviews
         WHERE occurred_at >= ?
         GROUP BY referrer_source
         ORDER BY visits DESC, source ASC
         LIMIT 8`
      )
      .bind(startIso)
      .all<ReferrerAggregateRow>(),
    db
      .prepare(
        `SELECT
           device_type AS label,
           COUNT(*) AS visits
         FROM pageviews
         WHERE occurred_at >= ?
         GROUP BY device_type
         ORDER BY visits DESC, label ASC`
      )
      .bind(startIso)
      .all<DeviceAggregateRow>()
  ]);

  const counts = countsRow ?? { pageviews: 0, uniqueVisitors: 0 };
  const pageviews = toNumber(counts.pageviews);
  const uniqueVisitors = toNumber(counts.uniqueVisitors);
  const liveVisitors = toNumber(liveVisitorsRaw);
  const returningVisitors = toNumber(returningRow?.returningVisitors);
  const avgVisitDurationSeconds = toNumber(sessionRow?.avgVisitDurationSeconds);
  const bounceRate = toNumber(sessionRow?.bounceRate);
  const latestActivity = coerceString(latestActivityRow?.latestOccurredAt ?? "", collectedAt);

  const trendMap = new Map(
    (trendRowsResult.results ?? []).map((row) => [
      coerceString(row.bucket),
      {
        visitors: toNumber(row.visitors),
        pageviews: toNumber(row.pageviews)
      }
    ])
  );

  const trends: TrendPoint[] = buckets.map((bucket) => {
    const aggregate = trendMap.get(bucket.key);

    return {
      label: bucket.label,
      timestamp: bucket.timestamp,
      visitors: aggregate?.visitors ?? 0,
      pageviews: aggregate?.pageviews ?? 0
    };
  });

  const locations: LocationPoint[] = (locationRowsResult.results ?? []).map((row) => ({
    country: coerceString(row.country, "Unknown"),
    region: coerceString(row.region, "Unknown region"),
    city: coerceString(row.city, "Unknown city"),
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    visits: toNumber(row.visits)
  }));

  const pages: PageMetric[] = (pageRowsResult.results ?? []).map((row) => ({
    path: coerceString(row.path, "/"),
    title: coerceString(row.title, coerceString(row.path, "/")),
    views: toNumber(row.views),
    uniqueVisitors: toNumber(row.uniqueVisitors)
  }));

  const referrers: ReferrerMetric[] = (referrerRowsResult.results ?? []).map((row) => ({
    source: coerceString(row.source, "direct"),
    visits: toNumber(row.visits)
  }));

  const deviceTotal = (deviceRowsResult.results ?? []).reduce((sum, row) => sum + toNumber(row.visits), 0);
  const devices: DeviceMetric[] = (deviceRowsResult.results ?? []).map((row) => {
    const visits = toNumber(row.visits);

    return {
      label: coerceString(row.label, "Other"),
      visits,
      share: deviceTotal > 0 ? visits / deviceTotal : 0
    };
  });

  const topLocation = topLocationRow
    ? {
        country: coerceString(topLocationRow.country, "Unknown"),
        region: coerceString(topLocationRow.region, "Unknown region"),
        city: coerceString(topLocationRow.city, "Unknown city"),
        visits: toNumber(topLocationRow.visits)
      }
    : null;

  const pulse = buildPulse({
    collectedAt,
    latestActivity,
    liveVisitors,
    pageviews,
    topLocation,
    topPage: pages[0],
    topReferrer: referrers[0],
    topDevice: devices[0]
  });

  return {
    range,
    source: "live",
    collectedAt,
    summary: {
      uniqueVisitors,
      pageviews,
      liveVisitors,
      avgVisitDurationSeconds,
      returningVisitors,
      bounceRate,
      topRegion: topLocation
        ? [topLocation.city, topLocation.region].filter((value) => value && !value.toLowerCase().startsWith("unknown")).join(", ") ||
          topLocation.country
        : "No geo data yet"
    },
    trends,
    locations,
    pages,
    referrers,
    devices,
    pulse
  };
}

function buildPulse({
  collectedAt,
  latestActivity,
  liveVisitors,
  pageviews,
  topLocation,
  topPage,
  topReferrer,
  topDevice
}: {
  collectedAt: string;
  latestActivity: string;
  liveVisitors: number;
  pageviews: number;
  topLocation: { country: string; region: string; city: string; visits: number } | null;
  topPage: PageMetric | undefined;
  topReferrer: ReferrerMetric | undefined;
  topDevice: DeviceMetric | undefined;
}): PulseItem[] {
  if (pageviews === 0) {
    return [
      {
        label: "Telemetry warming",
        detail: "No anonymous visits have been recorded yet. As soon as the public site receives traffic, this dashboard will begin filling with real page, time, and geo data.",
        timestamp: collectedAt,
        emphasis: "neutral"
      }
    ];
  }

  const items: PulseItem[] = [];

  if (topLocation) {
    items.push({
      label: "Top location",
      detail: `${topLocation.city}, ${topLocation.region} produced ${topLocation.visits} recorded pageviews in the selected range.`,
      timestamp: latestActivity,
      emphasis: "warm"
    });
  }

  if (topPage) {
    items.push({
      label: "Most viewed page",
      detail: `${topPage.title} led with ${topPage.views} views from ${topPage.uniqueVisitors} unique visitors.`,
      timestamp: collectedAt,
      emphasis: "cool"
    });
  }

  if (topReferrer) {
    items.push({
      label: "Top acquisition source",
      detail: `${topReferrer.source} drove ${topReferrer.visits} visits into the public portfolio during the current window.`,
      timestamp: collectedAt,
      emphasis: topReferrer.source === "direct" ? "neutral" : "cool"
    });
  }

  if (topDevice) {
    items.push({
      label: "Device leader",
      detail: `${topDevice.label} accounted for ${Math.round(topDevice.share * 100)}% of recorded sessions while ${liveVisitors} visitors are active in the live five-minute window.`,
      timestamp: collectedAt,
      emphasis: "neutral"
    });
  }

  return items.slice(0, 4);
}
