import { z } from "zod";
import {
  CreationActionSchema,
  DraftSettingsSchema,
} from "@shared/schemas/workflow/draft.schemas";
import {
  ConversationIdSchema,
  DraftIdSchema,
  TimestampSchema,
} from "@shared/schemas/workflow/identity.schemas";

const KEY = "vidra-guest-draft/v1";
const LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * A signed-out request kept on this device until its writer signs in. It holds
 * only words and settings: inputs and history need an account.
 */
export const GuestDraftSchema = z.strictObject({
  schemaVersion: z.literal("vidra-guest-draft/v1"),
  id: z.string().regex(/^guest_[A-Za-z0-9-]{8,64}$/),
  conversationId: ConversationIdSchema,
  draftId: DraftIdSchema,
  action: CreationActionSchema,
  instructions: z.string().max(32000),
  settings: DraftSettingsSchema,
  updatedAt: TimestampSchema,
});
export type GuestDraft = z.infer<typeof GuestDraftSchema>;

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export class GuestDraftStore {
  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Expired or unreadable copies are dropped rather than restored. */
  read(): GuestDraft | undefined {
    const store = storage();
    let raw: string | null = null;
    try {
      raw = store?.getItem(KEY) ?? null;
    } catch {
      return undefined;
    }
    if (raw === null) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    const draft = GuestDraftSchema.safeParse(parsed);
    if (
      !draft.success ||
      this.now() - Date.parse(draft.data.updatedAt) > LIFETIME_MS
    ) {
      this.clear();
      return undefined;
    }
    return draft.data;
  }

  /** Returns false when this browser cannot keep the copy (private mode, full storage). */
  write(draft: GuestDraft): boolean {
    try {
      storage()?.setItem(KEY, JSON.stringify(GuestDraftSchema.parse(draft)));
      return storage() !== undefined;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      storage()?.removeItem(KEY);
    } catch {
      /* Nothing to remove when storage is unavailable. */
    }
  }
}
