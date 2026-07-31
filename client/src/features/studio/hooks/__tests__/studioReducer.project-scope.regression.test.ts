import { describe, it, expect } from "vitest";
import type {
  StudioAttachment,
  StudioProject,
} from "@features/studio/api/schemas";
import { initialStudioState, studioReducer } from "../studioReducer";

/**
 * Regression (latent, found during M5 hardening): projectOpened and
 * projectDeleted each hand-wrote the list of fields that belong to the
 * open project, and both forgot pendingAttachments. Attachments are
 * registered against a specific project, so a staged upload survived a
 * project switch and the next send shipped project A's attachmentIds as
 * project B's.
 *
 * Invariant: everything scoped to the open project is cleared whenever the
 * workspace stops showing that project — attachments included.
 */
describe("regression: project-scoped state clears when the project changes", () => {
  const projectA: StudioProject = {
    id: "p-a",
    title: "Fox Logo",
    createdAtMs: 1,
    updatedAtMs: 1,
  };
  const projectB: StudioProject = {
    id: "p-b",
    title: "Wordmark",
    createdAtMs: 2,
    updatedAtMs: 2,
  };
  const attachment: StudioAttachment = {
    id: "att-1",
    storagePath: "users/u1/previews/images/sketch.png",
    filename: "fox-sketch.png",
    createdAtMs: 3,
  };

  const withStagedAttachment = (project: StudioProject) =>
    studioReducer(
      studioReducer(initialStudioState, {
        type: "projectOpened",
        project,
        turns: [],
      }),
      { type: "attachmentStaged", attachment },
    );

  it("switching projects drops the attachments staged on the old one", () => {
    const staged = withStagedAttachment(projectA);
    expect(staged.pendingAttachments).toHaveLength(1);

    const switched = studioReducer(staged, {
      type: "projectOpened",
      project: projectB,
      turns: [],
    });

    expect(switched.project?.id).toBe("p-b");
    expect(switched.pendingAttachments).toEqual([]);
  });

  it("deleting the open project drops its staged attachments too", () => {
    const staged = withStagedAttachment(projectA);

    const deleted = studioReducer(staged, {
      type: "projectDeleted",
      projectId: "p-a",
    });

    expect(deleted.project).toBeNull();
    expect(deleted.pendingAttachments).toEqual([]);
  });

  it("keeps attachments across the lazy first-send creation", () => {
    // projectCreated is a continuation of an in-flight send, not a switch:
    // the attachment staged moments earlier must still ride the message.
    const staged = withStagedAttachment(projectA);

    const created = studioReducer(staged, {
      type: "projectCreated",
      project: projectB,
    });

    expect(created.pendingAttachments.map((a) => a.id)).toEqual(["att-1"]);
  });
});
