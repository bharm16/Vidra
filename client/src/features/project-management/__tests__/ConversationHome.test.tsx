import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ConversationListingSchema } from "@shared/schemas/workflow/project.schemas";
import { ConversationHome } from "../ConversationHome";
import { conversation } from "./fixtures";

it("P02 shows each conversation's picture and clip count after its edit time", () => {
  const today = new Date().toISOString();
  const rows = [
    ConversationListingSchema.parse({ ...conversation, id: "conversation_clips", name: "Stadium", updatedAt: today, media: { pictures: 0, clips: 4 } }),
    ConversationListingSchema.parse({ ...conversation, id: "conversation_both", name: "Desk", updatedAt: today, media: { pictures: 1, clips: 1 } }),
    ConversationListingSchema.parse({ ...conversation, id: "conversation_empty", name: "Nothing yet", updatedAt: today, media: { pictures: 0, clips: 0 } }),
    ConversationListingSchema.parse({ ...conversation, id: "conversation_older_server", name: "Older server", updatedAt: today }),
  ];
  render(<ConversationHome composer={null} conversations={rows} onOpenConversation={vi.fn()} />);
  const meta = (name: string): string | null | undefined => screen.getByRole("button", { name: new RegExp(name) }).querySelector(".vf-conversation-home-meta")?.textContent;
  expect(meta("Stadium")).toBe("Edited today · 4 clips");
  expect(meta("Desk")).toBe("Edited today · 1 picture · 1 clip");
  expect(meta("Nothing yet")).toBe("Edited today");
  expect(meta("Older server")).toBe("Edited today");
});

it("lists the most recently edited conversation first", () => {
  const rows = [
    ConversationListingSchema.parse({ ...conversation, id: "conversation_old", name: "Older work", updatedAt: "2026-10-20T10:00:00.000Z" }),
    ConversationListingSchema.parse({ ...conversation, id: "conversation_new", name: "Newest work", updatedAt: "2026-10-22T10:00:00.000Z" }),
  ];
  render(<ConversationHome composer={null} conversations={rows} onOpenConversation={vi.fn()} />);
  const names = [...document.querySelectorAll(".vf-conversation-home-row")].map(row => row.textContent ?? "");
  expect(names[0]).toContain("Newest work");
  expect(names[1]).toContain("Older work");
});
