import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DownloadSelectedImage } from "../DownloadSelectedImage";
import type { StudioTurn } from "../../api/schemas";

/**
 * Issue #118: a vector result is downloadable from the studio. The control is
 * bound to the selection and appears only for vectors, whose view URL is
 * served as an attachment (the download IS the safe-serving mechanism).
 */

function turnWith(image: {
  id: string;
  storagePath: string;
  viewUrl?: string;
}): StudioTurn {
  return {
    id: "turn-1",
    projectId: "proj-1",
    status: "complete",
    userMessage: "a flat fox logo",
    decision: {
      action: "generate",
      basePrompt: "a flat fox logo",
      variants: ["a flat fox logo"],
      capability: "svg",
      suggestions: ["x", "y", "z"],
    },
    calls: [
      {
        index: 0,
        status: "succeeded",
        image: {
          id: image.id,
          storagePath: image.storagePath,
          sourcePrompt: "a flat fox logo",
          model: "recraft-v4.1-svg",
          ...(image.viewUrl ? { viewUrl: image.viewUrl } : {}),
        },
      },
    ],
    createdAtMs: 1,
    updatedAtMs: 2,
  };
}

const VECTOR = {
  id: "img-vec",
  storagePath: "users/u/previews/vectors/1-a.svg",
  viewUrl: "https://signed.example.com/vec.svg?disposition=attachment",
};
const RASTER = {
  id: "img-ras",
  storagePath: "users/u/previews/images/1-a.webp",
  viewUrl: "https://signed.example.com/ras.webp",
};

describe("DownloadSelectedImage", () => {
  it("offers a download to the vector's view URL when a vector is selected", () => {
    render(
      <DownloadSelectedImage
        turns={[turnWith(VECTOR)]}
        selectedImageId={VECTOR.id}
      />,
    );
    const link = screen.getByTestId("studio-download-svg");
    expect(link).toHaveTextContent("Download SVG");
    expect(link).toHaveAttribute("href", VECTOR.viewUrl);
  });

  it("shows nothing for a raster selection — it is served inline, not as a download", () => {
    render(
      <DownloadSelectedImage
        turns={[turnWith(RASTER)]}
        selectedImageId={RASTER.id}
      />,
    );
    expect(screen.queryByTestId("studio-download-svg")).toBeNull();
  });

  it("shows nothing when nothing is selected", () => {
    render(
      <DownloadSelectedImage
        turns={[turnWith(VECTOR)]}
        selectedImageId={null}
      />,
    );
    expect(screen.queryByTestId("studio-download-svg")).toBeNull();
  });

  it("shows nothing when the vector's view URL could not be signed", () => {
    render(
      <DownloadSelectedImage
        turns={[turnWith({ id: VECTOR.id, storagePath: VECTOR.storagePath })]}
        selectedImageId={VECTOR.id}
      />,
    );
    expect(screen.queryByTestId("studio-download-svg")).toBeNull();
  });
});
