import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReferenceUploadButton } from "../ReferenceUploadButton";

describe("reference upload control (issue #119)", () => {
  it("offers a labeled creator action and passes the selected reference file unchanged", async () => {
    const upload = vi.fn(async (_file: File): Promise<void> => {});
    render(<ReferenceUploadButton onUpload={upload} />);
    expect(
      screen.getByRole("button", { name: "Upload reference picture" }),
    ).toBeEnabled();
    const file = new File(["picture"], "portrait.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Reference picture file"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(upload).toHaveBeenCalledWith(file));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Upload reference picture" }),
      ).toBeEnabled(),
    );
    // Re-selecting the same file remains possible after the first attempt.
    fireEvent.change(screen.getByLabelText("Reference picture file"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  });
  it("reports failed upload and releases the action for explicit retry", async () => {
    const upload = vi.fn(async (): Promise<void> => {
      throw new Error("Disconnected");
    });
    render(<ReferenceUploadButton onUpload={upload} />);
    fireEvent.change(screen.getByLabelText("Reference picture file"), {
      target: {
        files: [new File(["picture"], "ref.png", { type: "image/png" })],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Disconnected");
    expect(
      screen.getByRole("button", { name: "Upload reference picture" }),
    ).toBeEnabled();
  });
});
