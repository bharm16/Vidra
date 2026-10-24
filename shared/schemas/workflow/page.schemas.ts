import { z } from "zod";

/** A page is complete only when nextCursor is absent. Cursors are scoped to the owning list. */
export function WorkflowPageSchema<T extends z.ZodType>(item: T): z.ZodType<WorkflowPage<z.output<T>>> {
  return z.strictObject({ items: z.array(item), nextCursor: z.string().min(1).max(2048).optional() });
}
export interface WorkflowPage<T> { items: T[]; nextCursor?: string | undefined; }
