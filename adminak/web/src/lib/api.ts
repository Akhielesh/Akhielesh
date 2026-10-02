export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(method !== "GET" ? { "x-adminak": "1" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0, null);
  }
  const type = res.headers.get("content-type") ?? "";
  const data: unknown = type.includes("application/json") ? await res.json().catch(() => null) : await res.text();
  if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new CustomEvent("adminak:unauthorized"));
  if (!res.ok) {
    const serverError = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "";
    const message = serverError || res.statusText || "Request failed";
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
