import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../api/publicClipApi", () => ({ fetchPublicClip: vi.fn() }));
import { fetchPublicClip } from "../api/publicClipApi";
import SharedClip from "../SharedClip";

function renderAt(shareId = "abc") {
  return render(
    <MemoryRouter initialEntries={[`/share/${shareId}`]}>
      <Routes>
        <Route path="/share/:uuid" element={<SharedClip />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SharedClip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the clip video, its description, and a make-your-own CTA to /", async () => {
    (fetchPublicClip as Mock).mockResolvedValue({
      videoUrl: "https://cdn.example/clip.mp4",
      description: "a cat surfing a wave",
      model: "sora-2",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    renderAt();

    expect(await screen.findByText("a cat surfing a wave")).toBeInTheDocument();
    expect(document.querySelector("video")).toHaveAttribute(
      "src",
      "https://cdn.example/clip.mp4",
    );
    expect(
      screen.getByRole("link", { name: /make your own/i }),
    ).toHaveAttribute("href", "/");
  });

  it("shows a not-found state (with the CTA) for an unknown share", async () => {
    (fetchPublicClip as Mock).mockResolvedValue(null);

    renderAt("missing");

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
    expect(
      screen.getByRole("link", { name: /make your own/i }),
    ).toHaveAttribute("href", "/");
  });

  it("shows a not-found state when the fetch errors", async () => {
    (fetchPublicClip as Mock).mockRejectedValue(new Error("boom"));

    renderAt();

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
