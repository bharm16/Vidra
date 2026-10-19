import { z } from "zod";
import { RevisionSchema, VersionIdSchema } from "./identity.schemas";

export const ChangeConversationSchema = z.strictObject({
  expectedRevision: RevisionSchema,
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["active", "archived"]).optional(),
}).refine(value => value.name !== undefined || value.status !== undefined, "A conversation change is required");

export const DeriveFrameSchema = z.strictObject({ id: VersionIdSchema, timestampSeconds: z.number().finite().nonnegative().max(3600) });

export const ChangeMediaSchema = z.strictObject({ label: z.string().trim().min(1).max(300).optional(), hidden: z.boolean().optional(), favorite: z.boolean().optional() }).refine(value => value.label !== undefined || value.hidden !== undefined || value.favorite !== undefined, "A media change is required");
