import { useCallback, useMemo, type MutableRefObject } from "react";
import { createHighlightSignature } from "@/features/span-highlighting";
import type { CapabilityValues } from "@shared/capabilities";
import type {
  PromptHistoryEntry,
  PromptVersionEdit,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import type { Generation } from "@features/generations/types";
import type { HighlightSnapshot } from "../types";
import { usePromptVersioning } from "./usePromptVersioning";
import {
  isHighlightSnapshot,
  resolveVersionTimestamp,
} from "../utils/versioning";

interface PromptHistoryStore {
  history: PromptHistoryEntry[];
  createDraft: (params: {
    mode: string;
    targetModel: string | null;
    generationParams: Record<string, unknown> | null;
    keyframes?: PromptHistoryEntry["keyframes"];
    uuid?: string;
  }) => { uuid: string; id: string };
  updateEntryVersions: (
    uuid: string,
    docId: string | null,
    versions: PromptVersionEntry[],
  ) => void;
}

interface PromptOptimizerActions {
  setOptimizedPrompt: (prompt: string) => void;
}

interface UseVersionManagementOptions {
  hasShotContext: boolean;
  shotId: string | null;
  shotPromptEntry: PromptHistoryEntry | null;
  updateShotVersions: (versions: PromptVersionEntry[]) => void;
  promptHistory: PromptHistoryStore;
  currentPromptUuid: string | null;
  currentPromptDocId: string | null;
  setCurrentPromptUuid: (uuid: string) => void;
  setCurrentPromptDocId: (docId: string | null) => void;
  activeVersionId: string | null;
  setActiveVersionId: (versionId: string) => void;
  inputPrompt: string | null;
  normalizedDisplayedPrompt: string | null;
  selectedMode: string;
  selectedModel: string;
  generationParams: CapabilityValues;
  serializedKeyframes: PromptHistoryEntry["keyframes"];
  promptOptimizer: PromptOptimizerActions;
  applyInitialHighlightSnapshot: (
    snapshot: HighlightSnapshot | null,
    options: { bumpVersion: boolean; markPersisted: boolean },
  ) => void;
  /**
   * Accepted but never invoked: selecting a take is browsing, and browsing must
   * not clear the creator's undo/redo history. Retained only so the existing
   * caller keeps type-checking; safe to drop from both sides in one change.
   */
  resetEditStacks: () => void;
  setDisplayedPromptSilently: (text: string) => void;
  latestHighlightRef: MutableRefObject<HighlightSnapshot | null>;
  versionEditCountRef: MutableRefObject<number>;
  versionEditsRef: MutableRefObject<PromptVersionEdit[]>;
  resetVersionEdits: () => void;
  effectiveAspectRatio: string | null;
}

interface UseVersionManagementResult {
  currentVersions: PromptVersionEntry[];
  orderedVersions: PromptVersionEntry[];
  versionsForPanel: PromptVersionEntry[];
  selectedVersionId: string;
  activeVersion: PromptVersionEntry | null;
  promptVersionId: string;
  handleSelectVersion: (versionId: string) => void;
  handleCreateVersion: () => void;
  createVersionIfNeeded: () => string;
  handleGenerationsChange: (nextGenerations: Generation[]) => void;
  setGenerationFavorite: (generationId: string, isFavorite: boolean) => void;
  syncVersionHighlights: (
    snapshot: HighlightSnapshot,
    promptText: string,
  ) => void;
  versioningPromptUuid: string | null;
}

export function useVersionManagement({
  hasShotContext,
  shotId,
  shotPromptEntry,
  updateShotVersions,
  promptHistory,
  currentPromptUuid,
  currentPromptDocId,
  setCurrentPromptUuid,
  setCurrentPromptDocId,
  activeVersionId,
  setActiveVersionId,
  inputPrompt,
  normalizedDisplayedPrompt,
  selectedMode,
  selectedModel,
  generationParams,
  serializedKeyframes,
  promptOptimizer,
  applyInitialHighlightSnapshot,
  setDisplayedPromptSilently,
  latestHighlightRef,
  versionEditCountRef,
  versionEditsRef,
  resetVersionEdits,
  effectiveAspectRatio,
}: UseVersionManagementOptions): UseVersionManagementResult {
  const { history, createDraft, updateEntryVersions } = promptHistory;
  const { setOptimizedPrompt } = promptOptimizer;
  const versionHistory = useMemo(() => {
    if (hasShotContext && shotPromptEntry) {
      return {
        history: [shotPromptEntry],
        updateEntryVersions: (
          _uuid: string,
          _docId: string | null,
          versions: PromptVersionEntry[],
        ) => {
          updateShotVersions(versions);
        },
      };
    }
    return {
      history,
      updateEntryVersions,
    };
  }, [
    hasShotContext,
    shotPromptEntry,
    updateShotVersions,
    history,
    updateEntryVersions,
  ]);

  const versioningPromptUuid = hasShotContext ? shotId : currentPromptUuid;
  const versioningPromptDocId = hasShotContext ? null : currentPromptDocId;

  const currentPromptEntry = useMemo(() => {
    if (!versionHistory.history.length) return null;
    if (versioningPromptUuid) {
      return (
        versionHistory.history.find(
          (item) => item.uuid === versioningPromptUuid,
        ) || null
      );
    }
    if (versioningPromptDocId) {
      return (
        versionHistory.history.find(
          (item) => item.id === versioningPromptDocId,
        ) || null
      );
    }
    return versionHistory.history[0] ?? null;
  }, [versionHistory.history, versioningPromptUuid, versioningPromptDocId]);

  const currentVersions = useMemo(
    () =>
      Array.isArray(currentPromptEntry?.versions)
        ? currentPromptEntry.versions
        : [],
    [currentPromptEntry],
  );

  const orderedVersions = useMemo(() => {
    if (currentVersions.length <= 1) return currentVersions;
    return [...currentVersions].sort((left, right) => {
      const leftTime = resolveVersionTimestamp(left.timestamp);
      const rightTime = resolveVersionTimestamp(right.timestamp);
      if (leftTime === null && rightTime === null) return 0;
      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      return rightTime - leftTime;
    });
  }, [currentVersions]);

  const currentSignature = useMemo(() => {
    if (!normalizedDisplayedPrompt) return "";
    return createHighlightSignature(normalizedDisplayedPrompt);
  }, [normalizedDisplayedPrompt]);

  const latestVersionSignature = orderedVersions[0]?.signature ?? null;
  const hasEditsSinceLastVersion = Boolean(
    latestVersionSignature &&
      currentSignature &&
      latestVersionSignature !== currentSignature,
  );

  const versionsForPanel = useMemo(
    () =>
      orderedVersions.map((entry, index) => {
        const entryWithDirty = entry as PromptVersionEntry & {
          isDirty?: boolean;
          dirty?: boolean;
        };
        return {
          ...entry,
          isDirty:
            index === 0 && hasEditsSinceLastVersion
              ? true
              : Boolean(entryWithDirty.isDirty ?? entryWithDirty.dirty),
        };
      }),
    [orderedVersions, hasEditsSinceLastVersion],
  );

  const selectedVersionId = useMemo(() => {
    if (
      activeVersionId &&
      versionsForPanel.some((version) => version.versionId === activeVersionId)
    ) {
      return activeVersionId;
    }
    return versionsForPanel[0]?.versionId ?? "";
  }, [activeVersionId, versionsForPanel]);

  const activeVersion = useMemo(() => {
    if (selectedVersionId) {
      return (
        currentVersions.find(
          (version) => version.versionId === selectedVersionId,
        ) ??
        orderedVersions[0] ??
        null
      );
    }
    return orderedVersions[0] ?? null;
  }, [currentVersions, orderedVersions, selectedVersionId]);

  const promptVersionId = activeVersion?.versionId ?? selectedVersionId ?? "";

  const { syncVersionHighlights, syncVersionGenerations } = usePromptVersioning(
    {
      promptHistory: versionHistory,
      currentPromptUuid: versioningPromptUuid,
      currentPromptDocId: versioningPromptDocId,
      activeVersionId,
      latestHighlightRef,
      versionEditCountRef,
      versionEditsRef,
      resetVersionEdits,
      effectiveAspectRatio,
      generationParams,
      selectedModel,
    },
  );

  const handleSelectVersion = useCallback(
    (versionId: string): void => {
      const target =
        currentVersions.find((version) => version.versionId === versionId) ||
        orderedVersions.find((version) => version.versionId === versionId) ||
        null;
      if (!target) return;
      const promptText = typeof target.prompt === "string" ? target.prompt : "";
      if (!promptText.trim()) return;

      setActiveVersionId(versionId);
      setOptimizedPrompt(promptText);
      setDisplayedPromptSilently(promptText);

      const highlights = isHighlightSnapshot(target.highlights)
        ? target.highlights
        : null;
      applyInitialHighlightSnapshot(highlights, {
        bumpVersion: true,
        markPersisted: false,
      });
      // Deliberately does NOT reset the undo/redo stacks. Selecting a take is
      // browsing, and browsing is read-only (CLAUDE.md UX rule 1) — moving
      // between takes must not cost the creator their edit history. Only an
      // explicit, labelled restore may clear the stacks.
      resetVersionEdits();
    },
    [
      applyInitialHighlightSnapshot,
      currentVersions,
      orderedVersions,
      resetVersionEdits,
      setOptimizedPrompt,
      setActiveVersionId,
      setDisplayedPromptSilently,
    ],
  );

  const ensureDraftEntry = useCallback((): { uuid: string; docId: string } => {
    if (hasShotContext && shotId) {
      return { uuid: shotId, docId: "" };
    }
    if (currentPromptUuid) {
      return { uuid: currentPromptUuid, docId: currentPromptDocId ?? "" };
    }
    const draft = createDraft({
      mode: selectedMode,
      targetModel: selectedModel?.trim() ? selectedModel.trim() : null,
      generationParams:
        (generationParams as unknown as Record<string, unknown>) ?? null,
      keyframes: serializedKeyframes,
    });
    setCurrentPromptUuid(draft.uuid);
    setCurrentPromptDocId(draft.id);
    return { uuid: draft.uuid, docId: draft.id };
  }, [
    hasShotContext,
    shotId,
    currentPromptDocId,
    currentPromptUuid,
    createDraft,
    generationParams,
    selectedMode,
    selectedModel,
    serializedKeyframes,
    setCurrentPromptDocId,
    setCurrentPromptUuid,
  ]);

  const persistVersions = useCallback(
    (
      versions: PromptVersionEntry[],
      identifiers?: { uuid: string; docId?: string },
    ) => {
      if (hasShotContext && shotId) {
        updateShotVersions(versions);
        return;
      }
      if (!identifiers?.uuid) return;
      updateEntryVersions(
        identifiers.uuid,
        identifiers.docId ?? null,
        versions,
      );
    },
    [hasShotContext, shotId, updateShotVersions, updateEntryVersions],
  );

  const handleCreateVersion = useCallback((): void => {
    if (!currentVersions) return;
    const promptText =
      (normalizedDisplayedPrompt ?? "").trim() || (inputPrompt ?? "").trim();
    if (!promptText) return;
    const { uuid, docId } = ensureDraftEntry();

    const signature = createHighlightSignature(promptText);
    const lastSignature =
      currentVersions[currentVersions.length - 1]?.signature ?? null;
    if (lastSignature && lastSignature === signature) {
      return;
    }

    const editCount = versionEditCountRef.current;
    const edits = versionEditsRef.current.length
      ? [...versionEditsRef.current]
      : [];
    const nextVersion = {
      versionId: `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: `v${currentVersions.length + 1}`,
      signature,
      prompt: promptText,
      timestamp: new Date().toISOString(),
      ...(latestHighlightRef.current
        ? { highlights: latestHighlightRef.current }
        : {}),
      ...(editCount > 0 ? { editCount } : {}),
      ...(edits.length ? { edits } : {}),
    };

    persistVersions([...currentVersions, nextVersion], { uuid, docId });
    setActiveVersionId(nextVersion.versionId);
    resetVersionEdits();
  }, [
    ensureDraftEntry,
    currentVersions,
    inputPrompt,
    latestHighlightRef,
    normalizedDisplayedPrompt,
    persistVersions,
    resetVersionEdits,
    setActiveVersionId,
    versionEditCountRef,
    versionEditsRef,
  ]);

  const createVersionIfNeeded = useCallback((): string => {
    const promptText =
      (normalizedDisplayedPrompt ?? "").trim() || (inputPrompt ?? "").trim();
    if (!promptText) {
      return activeVersion?.versionId ?? "";
    }
    const { uuid, docId } = ensureDraftEntry();

    const signature = createHighlightSignature(promptText);

    if (!currentVersions.length) {
      const editCount = versionEditCountRef.current;
      const edits = versionEditsRef.current.length
        ? [...versionEditsRef.current]
        : [];
      const newVersion = {
        versionId: `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: "v1",
        signature,
        prompt: promptText,
        timestamp: new Date().toISOString(),
        ...(latestHighlightRef.current
          ? { highlights: latestHighlightRef.current }
          : {}),
        generations: [],
        ...(editCount > 0 ? { editCount } : {}),
        ...(edits.length ? { edits } : {}),
      };

      persistVersions([newVersion], { uuid, docId });
      setActiveVersionId(newVersion.versionId);
      resetVersionEdits();
      return newVersion.versionId;
    }

    const lastVersion = currentVersions[currentVersions.length - 1];
    if (lastVersion && lastVersion.signature === signature) {
      return lastVersion.versionId;
    }

    const editCount = versionEditCountRef.current;
    const edits = versionEditsRef.current.length
      ? [...versionEditsRef.current]
      : [];
    const newVersion = {
      versionId: `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: `v${currentVersions.length + 1}`,
      signature,
      prompt: promptText,
      timestamp: new Date().toISOString(),
      ...(latestHighlightRef.current
        ? { highlights: latestHighlightRef.current }
        : {}),
      generations: [],
      ...(editCount > 0 ? { editCount } : {}),
      ...(edits.length ? { edits } : {}),
    };

    persistVersions([...currentVersions, newVersion], { uuid, docId });
    setActiveVersionId(newVersion.versionId);
    resetVersionEdits();
    return newVersion.versionId;
  }, [
    activeVersion?.versionId,
    currentVersions,
    ensureDraftEntry,
    inputPrompt,
    latestHighlightRef,
    normalizedDisplayedPrompt,
    persistVersions,
    resetVersionEdits,
    setActiveVersionId,
    versionEditCountRef,
    versionEditsRef,
  ]);

  const handleGenerationsChange = useCallback(
    (nextGenerations: Generation[]) => {
      syncVersionGenerations(nextGenerations);
    },
    [syncVersionGenerations],
  );

  const setGenerationFavorite = useCallback(
    (generationId: string, isFavorite: boolean): void => {
      const trimmedGenerationId = generationId.trim();
      if (!trimmedGenerationId) return;
      if (!currentVersions.length) return;

      const { uuid, docId } = ensureDraftEntry();
      let hasChanges = false;

      const nextVersions = currentVersions.map((version) => {
        if (
          !Array.isArray(version.generations) ||
          version.generations.length === 0
        ) {
          return version;
        }

        let didChangeVersion = false;
        const nextGenerations = version.generations.map((generation) => {
          if (generation.id !== trimmedGenerationId) return generation;
          if (generation.isFavorite === isFavorite) return generation;
          didChangeVersion = true;
          hasChanges = true;
          return {
            ...generation,
            isFavorite,
          };
        });

        if (!didChangeVersion) return version;
        return {
          ...version,
          generations: nextGenerations,
        };
      });

      if (!hasChanges) return;
      persistVersions(nextVersions, { uuid, docId });
    },
    [currentVersions, ensureDraftEntry, persistVersions],
  );

  return {
    currentVersions,
    orderedVersions,
    versionsForPanel,
    selectedVersionId,
    activeVersion,
    promptVersionId,
    handleSelectVersion,
    handleCreateVersion,
    createVersionIfNeeded,
    handleGenerationsChange,
    setGenerationFavorite,
    syncVersionHighlights,
    versioningPromptUuid,
  };
}
