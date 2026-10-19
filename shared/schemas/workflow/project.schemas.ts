import { z } from "zod";
import { BranchContextSchema } from "./draft.schemas";
import { ConversationIdSchema, FolderIdSchema, OwnerIdSchema, ProjectIdSchema, RevisionSchema, TimestampSchema, WorkflowSchemaVersion } from "./identity.schemas";

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
  /** The owner's library holds work that starts outside a named project. */
  role: z.literal("library").optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Project = z.infer<typeof ProjectSchema>;
/** Library ids are derived by the server; clients can never create them. */
export const LIBRARY_PROJECT_PREFIX = "project_library_";
export const isLibraryProject = (project: Pick<Project, "role">): boolean => project.role === "library";

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
  /** The named project this library conversation is filed in, if any. */
  folderId: FolderIdSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Conversation = z.infer<typeof ConversationSchema>;

/**
 * A named project people file library conversations into. Filing is a label:
 * the work, its requests and media never move.
 */
export const FolderSchema = z.strictObject({
  schemaVersion: WorkflowSchemaVersion,
  id: FolderIdSchema,
  ownerId: OwnerIdSchema,
  revision: RevisionSchema,
  name: z.string().trim().min(1).max(200),
  status: z.enum(["active", "trashed"]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Folder = z.infer<typeof FolderSchema>;
export const CreateFolderCommandSchema = z.strictObject({ id: FolderIdSchema, name: z.string().trim().min(1).max(200) });
export const ChangeFolderCommandSchema = z.strictObject({
  expectedRevision: RevisionSchema,
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["active", "trashed"]).optional(),
}).refine(command => command.name !== undefined || command.status !== undefined, "A project change is required");
export const ConversationMediaCountSchema = z.strictObject({ pictures: z.number().int().nonnegative(), clips: z.number().int().nonnegative() });
/** Listing rows add derived counts; servers that predate them omit the field. */
export const ConversationListingSchema = ConversationSchema.extend({ media: ConversationMediaCountSchema.optional() });
export type ConversationMediaCount = z.infer<typeof ConversationMediaCountSchema>;
export type ConversationListing = z.infer<typeof ConversationListingSchema>;

export const CreateProjectCommandSchema = z.strictObject({
  id: ProjectIdSchema.refine(id => !id.startsWith(LIBRARY_PROJECT_PREFIX), "This project id is reserved"),
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
  folderId: FolderIdSchema.optional(),
});
