import type { VendorRef } from "../../shared/types.js";
import type { DB } from "../db/index.js";
import type { VendorMatch } from "../intel/types.js";
import { colorFor, slugify, vendorByName, vendorBySlug } from "../intel/vendor-resolve.js";

export interface VendorRow {
  id: number;
  slug: string;
  name: string;
  domain: string | null;
  category: string | null;
  kind: string | null;
  manage_url: string | null;
  color: string | null;
}

export function upsertVendor(db: DB, match: VendorMatch, now: string): number {
  const existing = db.prepare("SELECT id, manage_url FROM vendors WHERE slug = ?").get(match.slug) as { id: number; manage_url: string | null } | undefined;
  if (existing) {
    if (!existing.manage_url && match.manageUrl) db.prepare("UPDATE vendors SET manage_url = ? WHERE id = ?").run(match.manageUrl, existing.id);
    return existing.id;
  }
  const result = db
    .prepare("INSERT INTO vendors(slug, name, domain, category, kind, manage_url, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(match.slug, match.name, match.domain, match.category, match.kind, match.manageUrl, match.color, now);
  return Number(result.lastInsertRowid);
}

/** Finds or creates a vendor from a free-form merchant name (card alerts, manual entries). */
export function vendorIdForName(db: DB, name: string, now: string): number {
  const known = vendorByName(name);
  if (known) {
    return upsertVendor(
      db,
      {
        slug: known.slug,
        name: known.name,
        domain: known.domains[0] ?? null,
        kind: known.kind,
        category: known.category,
        manageUrl: known.manageUrl ?? null,
        color: known.color ?? colorFor(known.slug),
        known: true,
      },
      now,
    );
  }
  const slug = slugify(name);
  return upsertVendor(db, { slug, name, domain: null, kind: null, category: null, manageUrl: null, color: colorFor(slug), known: false }, now);
}

export function vendorRefFromRow(row: {
  vendor_id?: number | null;
  v_slug?: string | null;
  v_name?: string | null;
  v_domain?: string | null;
  v_kind?: string | null;
  v_color?: string | null;
}): VendorRef | null {
  if (!row.vendor_id || !row.v_slug) return null;
  return {
    id: row.vendor_id,
    slug: row.v_slug,
    name: row.v_name ?? row.v_slug,
    domain: row.v_domain ?? null,
    kind: row.v_kind ?? null,
    color: row.v_color ?? null,
  };
}

/** SQL fragment selecting vendor columns aliased for vendorRefFromRow. Requires a join alias `v`. */
export const VENDOR_COLUMNS = "v.slug AS v_slug, v.name AS v_name, v.domain AS v_domain, v.kind AS v_kind, v.color AS v_color";

export function knownManageUrl(slug: string): string | null {
  return vendorBySlug(slug)?.manageUrl ?? null;
}
