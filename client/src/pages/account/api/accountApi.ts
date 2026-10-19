import { z } from "zod";
import { apiClient } from "@/services/ApiClient";
import { getAuthRepository } from "@repositories/index";

const AccountUsageSchema = z.object({
  resetAt: z.string().datetime(),
  allowances: z.array(z.object({ kind: z.enum(["studio", "sketch"]), state: z.enum(["available", "reached"]) })),
  requests: z.array(z.object({ id: z.string().min(1), projectId: z.string().min(1), conversationId: z.string().min(1), label: z.string().max(120), acceptedAt: z.string().datetime(), result: z.enum(["ready", "failed", "running", "needs-attention", "cancelled"]) })),
});
export type AccountUsage = z.infer<typeof AccountUsageSchema>;
export async function loadAccountUsage(ownerId: string, signal?: AbortSignal): Promise<AccountUsage> {
  if (getAuthRepository().getCurrentUser()?.uid !== ownerId) throw new Error("Sign in to view your usage.");
  const response = await apiClient.rawRequest("/account/usage", { method: "GET", ...(signal ? { signal } : {}) });
  const body: unknown = await response.json();
  if (getAuthRepository().getCurrentUser()?.uid !== ownerId) throw new Error("The signed-in account changed.");
  if (!response.ok) throw new Error("Your usage could not load. Check your connection and try again.");
  return z.object({ success: z.literal(true), data: AccountUsageSchema }).parse(body).data;
}
