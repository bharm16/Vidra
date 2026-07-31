import { useCallback, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { PromptContext } from "@utils/PromptContext/PromptContext";
import type { SuggestionsData } from "../../PromptCanvas/types";
import type { PromptIdentity } from "../types";

export function usePromptSessionState(): {
  suggestionsData: SuggestionsData | null;
  setSuggestionsData: Dispatch<SetStateAction<SuggestionsData | null>>;
  conceptElements: unknown | null;
  setConceptElements: (elements: unknown | null) => void;
  promptContext: PromptContext | null;
  setPromptContext: (context: PromptContext | null) => void;
  currentPromptUuid: string | null;
  setCurrentPromptUuid: (uuid: string | null) => void;
  currentPromptDocId: string | null;
  setCurrentPromptDocId: (docId: string | null) => void;
  promptIdentityRef: MutableRefObject<PromptIdentity>;
  activeVersionId: string | null;
  setActiveVersionId: (id: string | null) => void;
} {
  const [suggestionsData, setSuggestionsData] =
    useState<SuggestionsData | null>(null);
  const [conceptElements, setConceptElements] = useState<unknown | null>(null);
  const [promptContext, setPromptContext] = useState<PromptContext | null>(
    null,
  );
  const [currentPromptUuid, setCurrentPromptUuidState] = useState<
    string | null
  >(null);
  const [currentPromptDocId, setCurrentPromptDocIdState] = useState<
    string | null
  >(null);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);

  // Written synchronously by the setters below so continuations running in
  // the same turn as an identity promotion (before React re-renders) read
  // the promoted identity, never the previous render's. State stays the
  // render-facing source; this ref is the same-turn-facing one.
  const promptIdentityRef = useRef<PromptIdentity>({
    uuid: null,
    docId: null,
  });

  const setCurrentPromptUuid = useCallback((uuid: string | null): void => {
    promptIdentityRef.current = { ...promptIdentityRef.current, uuid };
    setCurrentPromptUuidState(uuid);
  }, []);

  const setCurrentPromptDocId = useCallback((docId: string | null): void => {
    promptIdentityRef.current = { ...promptIdentityRef.current, docId };
    setCurrentPromptDocIdState(docId);
  }, []);

  return {
    suggestionsData,
    setSuggestionsData,
    conceptElements,
    setConceptElements,
    promptContext,
    setPromptContext,
    currentPromptUuid,
    setCurrentPromptUuid,
    currentPromptDocId,
    setCurrentPromptDocId,
    promptIdentityRef,
    activeVersionId,
    setActiveVersionId,
  };
}
