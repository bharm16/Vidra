import { FieldPath, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { z } from "zod";
import { sha256Hex } from "@utils/hash";
import { WorkflowError } from "@services/projects/WorkflowError";
import type { WorkflowPage } from "@shared/schemas/workflow/page.schemas";

export interface ListOptions { cursor?: string | undefined; limit?: number | undefined; }
const CursorSchema = z.strictObject({ scope: z.string(), after: z.string().min(1).max(160).refine(value => !value.includes("/")) });
export function listOptions(query: unknown): ListOptions {
  return z.object({ cursor: z.string().min(1).max(2048).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }).parse(query);
}
/** Stable document-id traversal; every continuation is bound to its owner, list and filters. */
export async function listPage<T>(query: Query, scope: string, parse: (row: QueryDocumentSnapshot) => T, options: ListOptions = {}): Promise<WorkflowPage<T>> {
  const limit = z.number().int().min(1).max(200).parse(options.limit ?? 200);
  const binding = sha256Hex(scope);
  let ordered = query.orderBy(FieldPath.documentId());
  if (options.cursor) {
    try {
      const cursor = CursorSchema.parse(JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")));
      if (cursor.scope !== binding) throw new Error("Cursor scope mismatch");
      ordered = ordered.startAfter(cursor.after);
    } catch { throw new WorkflowError("invalid_settings", "This list cursor belongs to different work or is invalid."); }
  }
  const result = await ordered.limit(limit + 1).get();
  const rows = result.docs.slice(0, limit);
  const after = rows.at(-1)?.id;
  return { items: rows.map(parse), ...(result.docs.length > limit && after ? { nextCursor: Buffer.from(JSON.stringify({ scope: binding, after })).toString("base64url") } : {}) };
}
/** Compatibility/projection reads consume bounded batches rather than silently truncating. */
export async function allPages<T>(read: (options: ListOptions) => Promise<WorkflowPage<T>>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do { const page = await read({ cursor }); items.push(...page.items); cursor = page.nextCursor; } while (cursor);
  return items;
}
export async function allDocuments(query: Query): Promise<QueryDocumentSnapshot[]> {
  const records: QueryDocumentSnapshot[] = [];
  let current = query.limit(200);
  for (;;) {
    const result = await current.get();
    records.push(...result.docs);
    const last = result.docs.at(-1);
    if (result.docs.length < 200 || !last) return records;
    current = query.startAfter(last).limit(200);
  }
}
