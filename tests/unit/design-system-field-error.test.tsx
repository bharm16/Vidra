import React from "react";
import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFieldError } from "@promptstudio/system/hooks/use-field-error";

/**
 * useFieldError is the shared "error field" contract that Input and Textarea
 * compose. (The components themselves are stubbed by the client test setup, so
 * the behaviour is locked here on the hook — the actual deduped unit.)
 */
describe("useFieldError", () => {
  it("wires the invalid ARIA, error border, and error node when error+message are set", () => {
    const { result } = renderHook(() =>
      useFieldError({ id: "field", error: true, errorMessage: "Required" }),
    );

    expect(result.current.invalidProps["aria-invalid"]).toBe(true);
    expect(result.current.invalidProps["aria-describedby"]).toBe("field-error");
    expect(result.current.errorClassName).toContain("border-danger");

    render(<>{result.current.errorNode}</>);
    const node = screen.getByRole("alert");
    expect(node.textContent).toBe("Required");
    expect(node.id).toBe("field-error");
  });

  it("falls back to the name for the error id when id is absent", () => {
    const { result } = renderHook(() =>
      useFieldError({ name: "email", error: true, errorMessage: "Bad" }),
    );
    expect(result.current.invalidProps["aria-describedby"]).toBe("email-error");
  });

  it("emits nothing when there is no error", () => {
    const { result } = renderHook(() => useFieldError({ id: "field" }));
    expect(result.current.invalidProps["aria-invalid"]).toBeUndefined();
    expect(result.current.invalidProps["aria-describedby"]).toBeUndefined();
    expect(result.current.errorClassName).toBeUndefined();
    expect(result.current.errorNode).toBeNull();
  });

  it("emits no error node when error is set but the message is missing", () => {
    const { result } = renderHook(() =>
      useFieldError({ id: "field", error: true }),
    );
    expect(result.current.errorNode).toBeNull();
    // still marks the control invalid
    expect(result.current.invalidProps["aria-invalid"]).toBe(true);
    expect(result.current.invalidProps["aria-describedby"]).toBeUndefined();
  });
});
