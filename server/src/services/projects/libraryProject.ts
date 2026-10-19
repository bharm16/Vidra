import { createHash } from "node:crypto";
import { LIBRARY_PROJECT_PREFIX } from "@shared/schemas/workflow/project.schemas";
import { ProjectIdSchema, type ProjectId } from "@shared/schemas/workflow/identity.schemas";

/** Owner ids may contain characters a project id cannot, so the library id is a digest. */
export function libraryProjectId(ownerId: string): ProjectId {
  return ProjectIdSchema.parse(`${LIBRARY_PROJECT_PREFIX}${createHash("sha256").update(ownerId).digest("hex").slice(0, 40)}`);
}
