import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { YourWordsChip } from "../YourWordsChip";

describe("YourWordsChip", () => {
  it("shows the original one-liner and restores it on click", () => {
    const onRestore = vi.fn();
    render(
      <YourWordsChip originalWords="a cat on a couch" onRestore={onRestore} />,
    );
    const control = screen.getByRole("button", { name: /your words/i });
    expect(control).toHaveTextContent("a cat on a couch");
    fireEvent.click(control);
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when there are no original words", () => {
    const { container } = render(
      <YourWordsChip originalWords="   " onRestore={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
