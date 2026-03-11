import { buildDashboardSnapshot, errorResponse, jsonResponse, normalizeRange, type AnalyticsContext } from "./_shared";

function hasValidPassword(request: Request, expectedPassword: string | undefined) {
  if (!expectedPassword) {
    return false;
  }

  const providedPassword = request.headers.get("x-admin-password") ?? "";
  return providedPassword === expectedPassword;
}

export const onRequestGet = async ({ request, env }: AnalyticsContext) => {
  if (!env.ADMINAK_PASSWORD) {
    return errorResponse("Admin analytics password is not configured on Cloudflare.", 503);
  }

  if (!hasValidPassword(request, env.ADMINAK_PASSWORD)) {
    return errorResponse("Incorrect Adminak password.", 401);
  }

  const url = new URL(request.url);
  const range = normalizeRange(url.searchParams.get("range"));
  const snapshot = await buildDashboardSnapshot(env.ANALYTICS_DB, range);

  return jsonResponse(snapshot);
};
