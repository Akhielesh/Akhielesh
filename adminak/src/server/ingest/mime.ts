// Small MIME helpers shared by providers: RFC 2047 header decoding and address parsing.

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset.toLowerCase(), { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Decodes RFC 2047 encoded-words like =?UTF-8?B?...?= and =?ISO-8859-1?Q?...?=. */
export function decodeWords(value: string): string {
  if (!value.includes("=?")) return value;
  return value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, charset: string, encoding: string, text: string) => {
      if (encoding.toUpperCase() === "B") {
        return decodeBytes(Buffer.from(text, "base64"), charset);
      }
      const bytes: number[] = [];
      const q = text.replace(/_/g, " ");
      for (let i = 0; i < q.length; i++) {
        if (q[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(q.slice(i + 1, i + 3))) {
          bytes.push(parseInt(q.slice(i + 1, i + 3), 16));
          i += 2;
        } else {
          bytes.push(q.charCodeAt(i));
        }
      }
      return decodeBytes(Uint8Array.from(bytes), charset);
    });
}

export function parseAddress(value: string | undefined | null): { name: string | null; address: string | null } {
  if (!value) return { name: null, address: null };
  const decoded = decodeWords(value).trim();
  const angle = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(decoded);
  if (angle) {
    const name = angle[1]!.trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"').trim();
    return { name: name || null, address: angle[2]!.trim().toLowerCase() };
  }
  const bare = /([^\s<>"]+@[^\s<>"]+)/.exec(decoded);
  return { name: null, address: bare ? bare[1]!.toLowerCase() : null };
}

export function parseAddressList(value: string | undefined | null): string[] {
  if (!value) return [];
  return [...decodeWords(value).matchAll(/([^\s<>",;]+@[^\s<>",;]+)/g)].map((m) => m[1]!.toLowerCase()).slice(0, 20);
}

export const CAPTURED_HEADERS = [
  "from",
  "to",
  "subject",
  "date",
  "message-id",
  "list-unsubscribe",
  "list-id",
  "precedence",
  "auto-submitted",
  "x-adminak-notification",
  "content-type",
];

export function isOwnNotification(headers: Record<string, string>, subject: string): boolean {
  return !!headers["x-adminak-notification"] || /^\[Adminak\]/.test(subject.trim());
}
