import { z } from "zod";
import { BranchContextSchema } from "./draft.schemas";
import { ConversationIdSchema, OwnerIdSchema, ProjectIdSchema, RevisionSchema, TimestampSchema, WorkflowSchemaVersion } from "./identity.schemas";

export const ProjectOriginSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("new") }),
  z.strictObject({ kind: z.literal("legacy-session"), recordId: z.string().min(1), authority: z.enum(["legacy", "workflow"]) }),
  z.strictObject({ kind: z.literal("legacy-studio"), recordId: z.string().min(1), authority: z.enum(["legacy", "workflow"]) }),
]);

export const ProjectSchema = z.strictObject({
  schemaVersion: WorkflowSchemaVersion,
  id: ProjectIdSchema,
  ownerId: OwnerIdSchema,
  revision: RevisionSchema,
  name: z.string().trim().min(1).max(200),
  status: z.enum(["active", "trashed"]),
  sharingEpoch: z.number().int().nonnegative().default(0),
  instructions: z.strictObject({ revision: RevisionSchema, text: z.string().max(32000) }),
  origin: ProjectOriginSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const ConversationSchema = z.strictObject({
  schemaVersion: WorkflowSchemaVersion,
  id: ConversationIdSchema,
  projectId: ProjectIdSchema,
  ownerId: OwnerIdSchema,
  revision: RevisionSchema,
  name: z.string().trim().min(1).max(200),
  status: z.enum(["active", "archived"]),
  acceptanceSequence: z.number().int().nonnegative(),
  initialContext: BranchContextSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Conversation = z.infer<typeof ConversationSchema>;
export const ConversationMediaCountSchema = z.strictObject({ pictures: z.number().int().nonnegative(), clips: z.number().int().nonnegative() });
/** Listing rows add derived counts; servers that predate them omit the field. */
export const ConversationListingSchema = ConversationSchema.extend({ media: ConversationMediaCountSchema.optional() });
export type ConversationMediaCount = z.infer<typeof ConversationMediaCountSchema>;
export type ConversationListing = z.infer<typeof ConversationListingSchema>;

export const CreateProjectCommandSchema = z.strictObject({
  id: ProjectIdSchema,
  name: z.string().trim().min(1).max(200),
});
export const ChangeProjectCommandSchema = z.strictObject({
  expectedRevision: RevisionSchema,
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["active", "trashed"]).optional(),
  instructions: z.string().max(32000).optional(),
}).refine(command => command.name !== undefined || command.status !== undefined || command.instructions !== undefined, "A project change is required");
export const CreateConversationCommandSchema = z.strictObject({
  id: ConversationIdSchema,
  name: z.string().trim().min(1).max(200),
  context: BranchContextSchema.optional(),
});
