import {
  classifyDevice,
  errorResponse,
  jsonResponse,
  normalizeHost,
  normalizeReferrer,
  parseIsoTimestamp,
  readCfLocation,
  sanitizePath,
  sanitizeText,
  type AnalyticsContext,
  type AnalyticsPageviewPayload
} from "./_shared";

function hourBucketKey(isoTimestamp: string) {
  return `${isoTimestamp.slice(0, 13)}:00:00.000Z`;
}

function dayBucketKey(isoTimestamp: string) {
  return isoTimestamp.slice(0, 10);
}

function isValidPayload(payload: unknown): payload is AnalyticsPageviewPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    candidate.type === "pageview" &&
    typeof candidate.eventId === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.visitorId === "string"
  );
}

export const onRequestPost = async ({ request, env }: AnalyticsContext) => {
  let payload: AnalyticsPageviewPayload;

  try {
    const parsed = (await request.json()) as unknown;

    if (!isValidPayload(parsed)) {
      return errorResponse("Invalid analytics payload.", 400);
    }

    payload = parsed;
  } catch {
    return errorResponse("Unable to parse analytics payload.", 400);
  }

  const path = sanitizePath(payload.path);

  if (path.startsWith("/adminak")) {
    return jsonResponse({ accepted: false, reason: "admin route ignored" }, { status: 202 });
  }

  const occurredAt = parseIsoTimestamp(payload.occurredAt);
  const host = normalizeHost(payload.host);
  const referrer = sanitizeText(payload.referrer, "", 500);
  const referrerMeta = normalizeReferrer(referrer, host);
  const title = sanitizeText(payload.title, path, 180);
  const sessionId = sanitizeText(payload.sessionId, "", 120);
  const visitorId = sanitizeText(payload.visitorId, "", 120);
  const eventId = sanitizeText(payload.eventId, "", 120) || crypto.randomUUID();
  const screen = sanitizeText(payload.screen, "", 40);
  const viewport = sanitizeText(payload.viewport, "", 40);
  const language = sanitizeText(payload.language, "", 32);
  const timezone = sanitizeText(payload.timezone, "", 60);
  const userAgent = sanitizeText(request.headers.get("user-agent"), "", 400);
  const deviceType = classifyDevice(userAgent, viewport);
  const location = readCfLocation(request);

  if (!sessionId || !visitorId) {
    return errorResponse("Analytics payload is missing session or visitor identifiers.", 400);
  }

  await env.ANALYTICS_DB.prepare(
    `INSERT OR IGNORE INTO pageviews (
      id,
      occurred_at,
      hour_bucket,
      day_bucket,
      path,
      title,
      referrer,
      referrer_host,
      referrer_source,
      host,
      language,
      timezone,
      screen,
      viewport,
      session_id,
      visitor_id,
      user_agent,
      device_type,
      country,
      region,
      city,
      latitude,
      longitude,
      postal_code,
      colo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      eventId,
      occurredAt,
      hourBucketKey(occurredAt),
      dayBucketKey(occurredAt),
      path,
      title,
      referrer,
      referrerMeta.host,
      referrerMeta.source,
      host,
      language,
      timezone,
      screen,
      viewport,
      sessionId,
      visitorId,
      userAgent,
      deviceType,
      location.country,
      location.region,
      location.city,
      location.latitude,
      location.longitude,
      location.postalCode,
      location.colo
    )
    .run();

  return jsonResponse({ accepted: true }, { status: 202 });
};
