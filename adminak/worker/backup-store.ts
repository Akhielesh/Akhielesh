/**
 * The Worker side of Adminak's off-disk backup (see src/server/backup.ts): a small HTTP store over R2.
 *
 * It is only reachable from the container, through an outbound handler on a made-up hostname
 * (backup.internal), so it carries no authentication of its own. Nothing here is exposed to the internet.
 *
 *   GET/PUT /adminak.db.gz   the current database
 *   GET/PUT /secret.key      the generated APP_SECRET
 *
 * Each day's first database upload is also kept as daily/YYYY-MM-DD.db.gz and the last 14 days are retained,
 * so a bad write can be rolled back by copying an older object over adminak.db.gz.
 */

export const STORE_MARKER_HEADER = "x-adminak-backup";
export const MAX_OBJECT_BYTES = 64 * 1024 * 1024;
export const DAILY_COPIES = 14;

const OBJECTS: Record<string, string> = {
  "/adminak.db.gz": "application/gzip",
  "/secret.key": "text/plain; charset=utf-8",
};

/** The slice of an R2 bucket this store uses (an R2Bucket satisfies it). */
export interface BackupBucket {
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>;
  head(key: string): Promise<unknown | null>;
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
  delete(keys: string[]): Promise<void>;
}

function reply(status: number, body: ReadableStream | string | null = null, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { [STORE_MARKER_HEADER]: "1", "cache-control": "no-store", ...headers } });
}

export async function handleBackupRequest(request: Request, bucket: BackupBucket, now: Date = new Date()): Promise<Response> {
  const { pathname } = new URL(request.url);
  const type = OBJECTS[pathname];
  if (!type) return reply(404);
  const key = pathname.slice(1);

  if (request.method === "GET") {
    const object = await bucket.get(key);
    if (!object) return reply(404);
    return reply(200, object.body, { "content-type": type, "content-length": String(object.size) });
  }

  if (request.method === "PUT") {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_OBJECT_BYTES) return reply(413);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) return reply(400);
    if (bytes.byteLength > MAX_OBJECT_BYTES) return reply(413);
    await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
    if (pathname === "/adminak.db.gz") await keepDailyCopy(bucket, bytes, now);
    return reply(204);
  }

  return reply(405, null, { allow: "GET, PUT" });
}

async function keepDailyCopy(bucket: BackupBucket, bytes: ArrayBuffer, now: Date): Promise<void> {
  const today = `daily/${now.toISOString().slice(0, 10)}.db.gz`;
  if (await bucket.head(today)) return;
  await bucket.put(today, bytes, { httpMetadata: { contentType: "application/gzip" } });

  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: "daily/", cursor });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  // The names sort chronologically, so everything before the newest DAILY_COPIES is old.
  const stale = keys.sort().slice(0, Math.max(0, keys.length - DAILY_COPIES));
  if (stale.length) await bucket.delete(stale);
}
