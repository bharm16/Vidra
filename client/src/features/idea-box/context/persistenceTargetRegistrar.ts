import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { PersistenceTarget } from "../hooks/useIdeaBox";

/**
 * Persistence-target registrar (M5 D4).
 *
 * `useIdeaBox` runs in `PromptOptimizerContent`, above the `PromptCanvas`
 * subtree that owns version creation (`createVersionIfNeeded`) and the session
 * id. React context flows downward, so the frame generator cannot simply read
 * that machinery. This registrar inverts the flow: the owner (above) holds a
 * ref, the descendant (below) registers a resolver into it, and the owner
 * hands a stable reader to `useIdeaBox`. The resolver is invoked lazily — at
 * frame time — so the words-version is minted/reused for exactly that
 * generation, mirroring the storyboard's create-on-demand semantics.
 */
export type PersistenceTargetResolver = () => PersistenceTarget;

interface PersistenceTargetRegistrarApi {
  register: (resolver: PersistenceTargetResolver | null) => void;
}

export const PersistenceTargetRegistrarContext =
  createContext<PersistenceTargetRegistrarApi | null>(null);

interface UsePersistenceTargetRegistrarResult {
  /** Stable reader to feed `useIdeaBox`'s `resolvePersistenceTarget`. */
  resolve: PersistenceTargetResolver;
  /** Context value to provide to the descendant subtree that registers. */
  registrarValue: PersistenceTargetRegistrarApi;
}

/**
 * Owner hook. Keeps the live resolver in a ref so `resolve` stays
 * referentially stable (safe as a `useIdeaBox` dependency) while still
 * reaching whichever descendant registered most recently.
 */
export function usePersistenceTargetRegistrar(): UsePersistenceTargetRegistrarResult {
  const resolverRef = useRef<PersistenceTargetResolver | null>(null);

  const register = useCallback(
    (resolver: PersistenceTargetResolver | null): void => {
      resolverRef.current = resolver;
    },
    [],
  );

  const resolve = useCallback<PersistenceTargetResolver>(
    () => resolverRef.current?.() ?? {},
    [],
  );

  const registrarValue = useMemo<PersistenceTargetRegistrarApi>(
    () => ({ register }),
    [register],
  );

  return { resolve, registrarValue };
}

/**
 * Descendant hook. Publishes `resolver` up to the owner while mounted, and
 * clears it on unmount so a stale resolver can't attach frames to a version
 * node from a session the user has navigated away from.
 */
export function useRegisterPersistenceTarget(
  resolver: PersistenceTargetResolver | null,
): void {
  const api = useContext(PersistenceTargetRegistrarContext);
  useEffect(() => {
    if (!api) return undefined;
    api.register(resolver);
    return () => api.register(null);
  }, [api, resolver]);
}
