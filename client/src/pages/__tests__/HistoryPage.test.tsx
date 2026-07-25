/**
 * Library contract (/history).
 *
 * The page presents both Sessions and Kept clips from the shared history
 * source. Prompt-level artifacts from the old History page — raw UUIDs,
 * Score badges, provider tags, and the OUTPUT card — must never render.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { PromptHistoryEntry } from "@features/prompt-optimizer";
import { HistoryPage } from "../HistoryPage";

const mockUseAuthUser = vi.hoisted(() => vi.fn());
const mockUsePromptHistory = vi.hoisted(() => vi.fn());

// HistoryThumbnail -> useResolvedMediaUrl -> storageApi initializes Firebase
// at import time; stub the config so the page renders hermetically.
vi.mock("@/config/firebase", () => ({
  auth: {},
  db: {},
  analytics: null,
}));

vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: mockUseAuthUser,
}));

vi.mock("@hooks/usePromptHistory", () => ({
  usePromptHistory: mockUsePromptHistory,
}));

const now = new Date().toISOString();
const thirtyDaysAgo = new Date(
  Date.now() - 30 * 24 * 60 * 60 * 1000,
).toISOString();

const dogSession: PromptHistoryEntry = {
  id: "sess-dog",
  uuid: "60193f16-2d0c-4a4b-b972-06f1caf9f981",
  timestamp: now,
  title: "Dog running",
  input: "a dog running on the beach",
  output: "A golden retriever sprints across wet sand at sunset.",
  score: 25,
  mode: "video",
  targetModel: "flux-kontext",
  versions: [
    {
      versionId: "v1",
      signature: "sig-1",
      prompt: "a dog running on the beach",
      timestamp: now,
      video: { generatedAt: now, videoUrl: "https://example.com/clip.mp4" },
    },
  ],
};

const astronautSession: PromptHistoryEntry = {
  id: "sess-astronaut",
  uuid: "aa11bb22-cc33-dd44-ee55-ff6677889900",
  timestamp: thirtyDaysAgo,
  title: null,
  input: "astronaut on mars at dawn",
  output: "An astronaut walks the red dunes.",
  score: 90,
  mode: "video",
  targetModel: "sora-2",
};

const setSearchQuery = vi.fn();

const historyStub = (overrides?: Partial<Record<string, unknown>>) => ({
  history: [dogSession, astronautSession],
  filteredHistory: [dogSession, astronautSession],
  isLoadingHistory: false,
  searchQuery: "",
  setSearchQuery,
  ...overrides,
});

const renderPage = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <HistoryPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuthUser.mockReturnValue({ uid: "user-1", email: "t@t.com" });
  mockUsePromptHistory.mockReturnValue(historyStub());
});

describe("library (/history)", () => {
  it("carries the nav rail so every surface stays navigable", () => {
    renderPage();

    expect(
      screen.getByRole("link", { name: /Live editor/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New session/ })).toBeTruthy();
  });

  it("lists sessions and kept clips with stored and derived titles", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Library" })).toBeTruthy();
    expect(screen.getByText("Dog running")).toBeTruthy();
    // Titleless entries use the same shared title derivation as the rail.
    expect(screen.getByText("Astronaut On Mars At Dawn")).toBeTruthy();
  });

  it("never renders prompt-level artifacts: UUIDs, scores, provider tags, output", () => {
    renderPage();

    expect(screen.queryByText(/60193f16/)).toBeNull();
    expect(screen.queryByText(/aa11bb22/)).toBeNull();
    expect(screen.queryByText(/Score/)).toBeNull();
    expect(screen.queryByText("flux-kontext")).toBeNull();
    expect(screen.queryByText("sora-2")).toBeNull();
    expect(screen.queryByText(/^Output$/i)).toBeNull();
    expect(screen.queryByText(/golden retriever/i)).toBeNull();
  });

  it("links each entry to its workspace session", () => {
    renderPage();

    const openDog = screen.getByRole("link", {
      name: "Open clip: Dog running",
    });
    expect(openDog.getAttribute("href")).toBe("/session/sess-dog");

    const openAstronaut = screen.getByRole("link", {
      name: "Open session: Astronaut On Mars At Dawn",
    });
    expect(openAstronaut.getAttribute("href")).toBe("/session/sess-astronaut");
  });

  it("loads history for the authenticated user", () => {
    renderPage();

    expect(mockUsePromptHistory).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "user-1" }),
    );
  });

  it("filters the archive by sessions and kept clips", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.queryByText("Dog running")).toBeNull();
    expect(screen.getByText("Astronaut On Mars At Dawn")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Kept clips" }));
    expect(screen.getByText("Dog running")).toBeTruthy();
    expect(screen.queryByText("Astronaut On Mars At Dawn")).toBeNull();
  });

  it("routes search through the shared session search", () => {
    renderPage();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search your library" }),
      {
        target: { value: "dog" },
      },
    );
    expect(setSearchQuery).toHaveBeenCalledWith("dog");
  });

  it("shows the empty state with a way back into the workspace", () => {
    mockUsePromptHistory.mockReturnValue(
      historyStub({ history: [], filteredHistory: [] }),
    );
    renderPage();

    expect(screen.getByText("Your library is empty.")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "Start creating" });
    expect(cta.getAttribute("href")).toBe("/");
  });
});
