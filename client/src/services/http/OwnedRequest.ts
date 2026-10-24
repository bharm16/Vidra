import { z } from "zod";
import { ApiClient } from "../ApiClient";
import { createFirebaseTokenInterceptor } from "./AuthInterceptors";
import { getAuthRepository } from "@/repositories/index";
import { ApiErrorResponseSchema, ApiSuccessResponseSchema } from "@shared/schemas/api.schemas";
import { WorkflowPageSchema } from "@shared/schemas/workflow/page.schemas";
import type { ApiErrorCode } from "@shared/types/api";
import { OwnerIdSchema } from "@shared/schemas/workflow/identity.schemas";

export class OwnedRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: ApiErrorCode | undefined = undefined) { super(message); this.name = "OwnedRequestError"; }
}
export function requireRequestOwner(ownerId: string | undefined): void {
  if (ownerId !== undefined && getAuthRepository().getCurrentUser()?.uid !== ownerId) throw new OwnedRequestError("The account changed. Sign in to the original account before viewing or saving this work.", 401, "AUTH_REQUIRED");
}
/** Owner-bound transport never replays a mutation, including after a sign-in dialog. */
export function createOwnedClient(ownerId?: string): ApiClient {
  const client = new ApiClient();
  const authenticate = createFirebaseTokenInterceptor();
  client.addRequestInterceptor(async request => {
    requireRequestOwner(ownerId);
    const authenticated = await authenticate(request);
    requireRequestOwner(ownerId);
    return { ...authenticated, init: { ...authenticated.init, cache: "no-store" } };
  });
  return client;
}
export type OwnedErrorDecoder = (status: number, error: z.output<typeof ApiErrorResponseSchema>) => Error | undefined;

/** Owns account timing, canonical envelopes, cancellation and complete list traversal. Domain modules own record validation. */
export class OwnedRequest {
  private readonly client: Pick<ApiClient, "rawRequest">;
  constructor(private readonly ownerId?: string, client?: Pick<ApiClient, "rawRequest">) {
    if (ownerId !== undefined) OwnerIdSchema.parse(ownerId);
    this.client = client ?? createOwnedClient(ownerId);
  }
  async request<T extends z.ZodType>(path: string, schema: T, method = "GET", body?: unknown, signal?: AbortSignal, decodeError?: OwnedErrorDecoder): Promise<z.output<T>> {
    requireRequestOwner(this.ownerId);
    const response = await this.client.rawRequest(path, { method, ...(body === undefined ? {} : { body }), ...(signal ? { signal } : {}) });
    const payload: unknown = await response.json().catch(() => undefined);
    requireRequestOwner(this.ownerId);
    if (!response.ok) {
      const failure = ApiErrorResponseSchema.safeParse(payload);
      const decoded = failure.success ? decodeError?.(response.status, failure.data) : undefined;
      if (decoded) throw decoded;
      throw new OwnedRequestError(failure.success ? failure.data.error : `The request was not confirmed (${response.status}).`, response.status, failure.success ? failure.data.code : undefined);
    }
    return schema.parse(ApiSuccessResponseSchema(z.unknown()).parse(payload).data);
  }
  async list<T extends z.ZodType>(path: string, item: T, signal?: AbortSignal): Promise<z.output<T>[]> {
    const items: z.output<T>[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const paged = `${path}${path.includes("?") ? "&" : "?"}page=true`;
      const next = cursor ? `${paged}&cursor=${encodeURIComponent(cursor)}` : paged;
      // Previous-server arrays remain readable during a rolling deployment.
      const result = await this.request(next, z.union([WorkflowPageSchema(item), z.array(item)]), "GET", undefined, signal);
      if (Array.isArray(result)) { items.push(...result); break; }
      items.push(...result.items); cursor = result.nextCursor;
      if (cursor && cursors.has(cursor)) throw new Error("The server returned a repeated list cursor.");
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return items;
  }
}
// Compatibility names for consumers upgrading alongside the workspace module.
export { OwnedRequestError as WorkflowApiError, createOwnedClient as createWorkflowClient };
