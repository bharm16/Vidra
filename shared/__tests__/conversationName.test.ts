import { describe, expect, it } from "vitest";
import { conversationNameAfterFirstRequest, DEFAULT_CONVERSATION_NAME } from "../workflow/conversationName";

describe("conversationNameAfterFirstRequest", () => {
  it("names a default conversation from its first request's words", () => {
    expect(conversationNameAfterFirstRequest(DEFAULT_CONVERSATION_NAME, 0, "A blue teapot\non a table")).toBe("A blue teapot on a table");
    const long = conversationNameAfterFirstRequest(DEFAULT_CONVERSATION_NAME, 0, "A golden retriever running across a misty beach at sunrise, wide shot, soft warm light");
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
  });

  it("keeps a name the person chose, a conversation that already has requests, and empty words", () => {
    expect(conversationNameAfterFirstRequest("Holiday cards", 0, "A teapot")).toBe("Holiday cards");
    expect(conversationNameAfterFirstRequest(DEFAULT_CONVERSATION_NAME, 2, "A teapot")).toBe(DEFAULT_CONVERSATION_NAME);
    expect(conversationNameAfterFirstRequest(DEFAULT_CONVERSATION_NAME, 0, "   ")).toBe(DEFAULT_CONVERSATION_NAME);
  });
});
