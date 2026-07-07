import { describe, expect, it } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";

import {
  PersistenceTargetRegistrarContext,
  usePersistenceTargetRegistrar,
  useRegisterPersistenceTarget,
} from "../persistenceTargetRegistrar";
import type { PersistenceTarget } from "@/features/idea-box";

type Resolver = () => PersistenceTarget;

// A holder object (not a bare `let`) so TypeScript keeps the `Resolver | null`
// type across the render closure instead of narrowing it away.
const captured: { resolve: Resolver | null } = { resolve: null };

function Owner({ children }: { children?: ReactNode }): ReactElement {
  const { resolve, registrarValue } = usePersistenceTargetRegistrar();
  captured.resolve = resolve;
  return (
    <PersistenceTargetRegistrarContext.Provider value={registrarValue}>
      {children}
    </PersistenceTargetRegistrarContext.Provider>
  );
}

function Registrant({ resolver }: { resolver: Resolver }): null {
  useRegisterPersistenceTarget(resolver);
  return null;
}

describe("persistenceTargetRegistrar", () => {
  it("resolves to empty when no descendant has registered", () => {
    render(<Owner />);

    expect(captured.resolve).not.toBeNull();
    expect(captured.resolve?.()).toEqual({});
  });

  it("surfaces a registered descendant resolver to the owner", () => {
    const resolver: Resolver = () => ({
      sessionId: "sess-remote-xyz",
      promptVersionId: "v-789-ghi",
    });

    render(
      <Owner>
        <Registrant resolver={resolver} />
      </Owner>,
    );

    // The owner's stable resolve() reaches through the ref to the descendant's
    // live resolver — this is the up-the-tree bridge useIdeaBox depends on.
    expect(captured.resolve?.()).toEqual({
      sessionId: "sess-remote-xyz",
      promptVersionId: "v-789-ghi",
    });
  });

  it("falls back to empty after the descendant unmounts", () => {
    const resolver: Resolver = () => ({ promptVersionId: "v-1" });

    const { rerender } = render(
      <Owner>
        <Registrant resolver={resolver} />
      </Owner>,
    );
    expect(captured.resolve?.()).toEqual({ promptVersionId: "v-1" });

    // Unregister on unmount so a stale resolver can't attach frames to a
    // version node that no longer belongs to the visible session.
    rerender(<Owner />);
    expect(captured.resolve?.()).toEqual({});
  });
});
