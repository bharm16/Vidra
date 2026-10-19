import { z } from "zod";

export const WorkflowSchemaVersion = z.literal("vidra-workflow/v2");
export const ProjectIdSchema = z.string().regex(/^project_[A-Za-z0-9_-]+$/).max(160).brand<"ProjectId">();
export const ConversationIdSchema = z.string().regex(/^conversation_[A-Za-z0-9_-]+$/).max(160).brand<"ConversationId">();
export const DraftIdSchema = z.string().regex(/^draft_[A-Za-z0-9_-]+$/).max(160).brand<"DraftId">();
export const RequestIdSchema = z.string().regex(/^request_[A-Za-z0-9_-]+$/).max(160).brand<"RequestId">();
export const SlotIdSchema = z.string().regex(/^slot_[A-Za-z0-9_-]+$/).max(160).brand<"SlotId">();
export const VersionIdSchema = z.string().regex(/^version_[A-Za-z0-9_-]+$/).max(160).brand<"VersionId">();
export const EditIdSchema = z.string().regex(/^edit_[A-Za-z0-9_-]+$/).max(160).brand<"EditId">();
export const SubmissionIdSchema = z.string().regex(/^submission_[A-Za-z0-9_-]+$/).max(160).brand<"SubmissionId">();
export const OwnerIdSchema = z.string().min(1).max(128).regex(/^[^/]+$/);
export const RevisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const TimestampSchema = z.iso.datetime();

export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type ConversationId = z.infer<typeof ConversationIdSchema>;
export type DraftId = z.infer<typeof DraftIdSchema>;
export type RequestId = z.infer<typeof RequestIdSchema>;
export type SlotId = z.infer<typeof SlotIdSchema>;
export type VersionId = z.infer<typeof VersionIdSchema>;
export type EditId = z.infer<typeof EditIdSchema>;
export type SubmissionId = z.infer<typeof SubmissionIdSchema>;
